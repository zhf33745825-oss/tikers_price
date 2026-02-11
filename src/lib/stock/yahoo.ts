import { parseDateKeyToDate, toDateKey } from "@/lib/stock/dates";
import { normalizeYahooErrorMessage } from "@/lib/stock/errors";
import { inferRegionFromExchange, inferRegionFromSymbol } from "@/lib/stock/region";

interface YahooChartMeta {
  symbol?: string;
  shortName?: string;
  longName?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  currency?: string;
}

interface YahooChartError {
  code?: string;
  description?: string;
}

interface YahooQuoteIndicator {
  close?: Array<number | null>;
}

interface YahooAdjcloseIndicator {
  adjclose?: Array<number | null>;
}

interface YahooChartIndicators {
  quote?: YahooQuoteIndicator[];
  adjclose?: YahooAdjcloseIndicator[];
}

interface YahooChartResult {
  meta?: YahooChartMeta;
  timestamp?: number[];
  indicators?: YahooChartIndicators;
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
    error?: YahooChartError | null;
  };
}

interface ChartRequestParams {
  interval: "1d";
  period1?: number;
  period2?: number;
  range?: string;
}

interface ResolvedChartResult {
  sourceSymbol: string;
  resolvedSymbol: string;
  result: YahooChartResult;
}

interface CandidateFetchFailure {
  symbol: string;
  message: string;
  notFound: boolean;
}

const YAHOO_CHART_ENDPOINT = "https://query2.finance.yahoo.com/v8/finance/chart";
const YAHOO_CHART_RELAY_PREFIX = "https://r.jina.ai/http://";
const YAHOO_FETCH_TIMEOUT_MS = 15_000;
const YAHOO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
let preferRelayForYahooChart = false;

function throwYahooError(error: unknown): never {
  throw new Error(normalizeYahooErrorMessage(error));
}

export interface FetchedHistoricalPoint {
  tradeDate: Date;
  close: number;
  adjClose: number;
  currency: string;
}

export interface QuoteMetadata {
  autoName: string | null;
  autoRegion: string | null;
  autoCurrency: string | null;
}

export interface FetchedHistoricalResult {
  sourceSymbol: string;
  resolvedSymbol: string;
  points: FetchedHistoricalPoint[];
}

function logDev(message: string): void {
  if (process.env.NODE_ENV === "development") {
    console.info(message);
  }
}

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function compactText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function formatCandidateFailure(message: string): string {
  const compacted = compactText(message);
  if (compacted.length <= 800) {
    return compacted;
  }
  return `${compacted.slice(0, 797)}...`;
}

function isNotFoundMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("no data found")
    || normalized.includes("symbol may be delisted")
    || normalized.includes("not found")
    || normalized.includes("no such ticker");
}

function buildChartRequestUrl(symbol: string, params: ChartRequestParams): string {
  const searchParams = new URLSearchParams();
  searchParams.set("interval", params.interval);

  if (params.range) {
    searchParams.set("range", params.range);
  } else {
    if (params.period1 === undefined || params.period2 === undefined) {
      throw new Error("period1 and period2 are required when range is not provided");
    }
    searchParams.set("period1", String(params.period1));
    searchParams.set("period2", String(params.period2));
  }

  searchParams.set("includePrePost", "false");
  searchParams.set("events", "div,splits");

  return `${YAHOO_CHART_ENDPOINT}/${encodeURIComponent(symbol)}?${searchParams.toString()}`;
}

function toRelayChartUrl(primaryUrl: string): string {
  const withoutProtocol = primaryUrl.replace(/^https?:\/\//i, "");
  return `${YAHOO_CHART_RELAY_PREFIX}${withoutProtocol}`;
}

function looksLikeHtmlPayload(input: string): boolean {
  return /<!doctype/i.test(input) || /<html[\s>]/i.test(input);
}

function shouldRetryViaRelay(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 429) {
    return true;
  }
  return looksLikeHtmlPayload(body);
}

function extractRelayJsonText(body: string): string {
  const marker = "Markdown Content:";
  const markerIndex = body.indexOf(marker);
  const source = markerIndex >= 0 ? body.slice(markerIndex + marker.length) : body;
  const jsonStart = source.indexOf("{");
  if (jsonStart < 0) {
    return source.trim();
  }
  return source.slice(jsonStart).trim();
}

async function fetchChartResponseText(url: string, useRelay = false): Promise<{
  status: number;
  statusText: string;
  body: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), YAHOO_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: useRelay
        ? undefined
        : {
          Accept: "application/json,text/plain,*/*",
          "User-Agent": YAHOO_USER_AGENT,
        },
      signal: controller.signal,
      cache: "no-store",
    });

    const body = await response.text();
    return {
      status: response.status,
      statusText: response.statusText,
      body,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestYahooChartCandidate(
  symbol: string,
  params: ChartRequestParams,
): Promise<{ result: YahooChartResult } | { failure: CandidateFetchFailure }> {
  try {
    const requestUrl = buildChartRequestUrl(symbol, params);
    let response = preferRelayForYahooChart
      ? await fetchChartResponseText(toRelayChartUrl(requestUrl), true)
      : await fetchChartResponseText(requestUrl);

    if (!preferRelayForYahooChart && (response.status < 200 || response.status >= 300)) {
      if (shouldRetryViaRelay(response.status, response.body)) {
        preferRelayForYahooChart = true;
        response = await fetchChartResponseText(toRelayChartUrl(requestUrl), true);
      }
    }

    if (response.status < 200 || response.status >= 300) {
      return {
        failure: {
          symbol,
          notFound: response.status === 404,
          message: formatCandidateFailure(
            `Yahoo chart request failed (${symbol}) status ${response.status} ${response.statusText}: ${response.body}`,
          ),
        },
      };
    }

    let responseBody = extractRelayJsonText(response.body);

    if (!preferRelayForYahooChart && looksLikeHtmlPayload(responseBody)) {
      preferRelayForYahooChart = true;
      response = await fetchChartResponseText(toRelayChartUrl(requestUrl), true);
      responseBody = extractRelayJsonText(response.body);
    }

    if (looksLikeHtmlPayload(responseBody)) {
      return {
        failure: {
          symbol,
          notFound: false,
          message: formatCandidateFailure(
            `Yahoo chart returned HTML response (${symbol}): ${responseBody}`,
          ),
        },
      };
    }

    let payload: YahooChartResponse;
    try {
      payload = JSON.parse(responseBody) as YahooChartResponse;
    } catch {
      return {
        failure: {
          symbol,
          notFound: false,
          message: formatCandidateFailure(
            `Yahoo chart returned non-JSON response (${symbol}): ${responseBody}`,
          ),
        },
      };
    }

    const chartError = payload.chart?.error;
    if (chartError) {
      const description = chartError.description ?? chartError.code ?? "unknown chart error";
      return {
        failure: {
          symbol,
          notFound: isNotFoundMessage(description),
          message: formatCandidateFailure(`Yahoo chart error (${symbol}): ${description}`),
        },
      };
    }

    const result = payload.chart?.result?.[0];
    if (!result) {
      return {
        failure: {
          symbol,
          notFound: true,
          message: `Yahoo chart returned empty result (${symbol})`,
        },
      };
    }

    return { result };
  } catch (error) {
    return {
      failure: {
        symbol,
        notFound: false,
        message: formatCandidateFailure(
          `Yahoo chart request error (${symbol}): ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      },
    };
  }
}

export function buildYahooSymbolCandidates(symbol: string): string[] {
  const normalized = symbol.trim().toUpperCase();
  const candidates: string[] = [normalized];

  if (/^[A-Z]{4}\d$/.test(normalized)) {
    candidates.push(`${normalized}.SA`);
  }

  if (/^\d{6}$/.test(normalized)) {
    candidates.push(`${normalized}.SZ`);
    candidates.push(`${normalized}.SS`);
  }

  return Array.from(new Set(candidates));
}

export function resetYahooRelayPreferenceForTests(): void {
  preferRelayForYahooChart = false;
}

async function resolveYahooChartResult(
  sourceSymbol: string,
  params: ChartRequestParams,
): Promise<ResolvedChartResult> {
  const normalizedSource = sourceSymbol.trim().toUpperCase();
  const candidates = buildYahooSymbolCandidates(normalizedSource);
  let lastFailure: CandidateFetchFailure | null = null;
  let lastNonNotFoundFailure: CandidateFetchFailure | null = null;

  for (const candidate of candidates) {
    const candidateResult = await requestYahooChartCandidate(candidate, params);
    if ("result" in candidateResult) {
      return {
        sourceSymbol: normalizedSource,
        resolvedSymbol: candidate,
        result: candidateResult.result,
      };
    }

    lastFailure = candidateResult.failure;
    if (!candidateResult.failure.notFound) {
      lastNonNotFoundFailure = candidateResult.failure;
    }
  }

  const failure = lastNonNotFoundFailure ?? lastFailure;
  throwYahooError(
    new Error(
      failure
        ? failure.message
        : `Yahoo chart unavailable for ${normalizedSource}`,
    ),
  );
}

export async function resolveSymbolForYahoo(symbol: string): Promise<string> {
  const resolved = await resolveYahooChartResult(symbol, {
    interval: "1d",
    range: "1mo",
  });

  logDev(
    `[yahoo-resolve] source-symbol=${resolved.sourceSymbol} resolved-symbol=${resolved.resolvedSymbol}`,
  );

  return resolved.resolvedSymbol;
}

function resolveNameFromMeta(meta: YahooChartMeta): string | null {
  const name = meta.longName ?? meta.shortName;
  return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
}

function resolveRegionFromMeta(resolvedSymbol: string, meta: YahooChartMeta): string {
  const exchangeText = [
    meta.fullExchangeName,
    meta.exchangeName,
  ]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .join(" ");

  if (exchangeText.length > 0) {
    return inferRegionFromExchange(exchangeText, resolvedSymbol);
  }

  return inferRegionFromSymbol(resolvedSymbol);
}

export async function fetchQuoteMetadataFromYahoo(symbol: string): Promise<QuoteMetadata> {
  const resolved = await resolveYahooChartResult(symbol, {
    interval: "1d",
    range: "1mo",
  });
  const meta = resolved.result.meta ?? {};

  logDev(
    `[yahoo-meta] source-symbol=${resolved.sourceSymbol} resolved-symbol=${resolved.resolvedSymbol}`,
  );

  return {
    autoName: resolveNameFromMeta(meta),
    autoRegion: resolveRegionFromMeta(resolved.resolvedSymbol, meta),
    autoCurrency: typeof meta.currency === "string" && meta.currency.length > 0
      ? meta.currency
      : null,
  };
}

function resolveCurrency(meta: YahooChartMeta): string {
  if (typeof meta.currency === "string" && meta.currency.length > 0) {
    return meta.currency;
  }
  return "N/A";
}

export async function fetchHistoricalFromYahooWithResolution(
  symbol: string,
  fromDate: Date,
  toDate: Date,
): Promise<FetchedHistoricalResult> {
  const resolved = await resolveYahooChartResult(symbol, {
    interval: "1d",
    period1: toUnixSeconds(fromDate),
    period2: toUnixSeconds(toDate),
  });

  const timestamps = resolved.result.timestamp ?? [];
  const closeValues = resolved.result.indicators?.quote?.[0]?.close ?? [];
  const adjCloseValues = resolved.result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const currency = resolveCurrency(resolved.result.meta ?? {});

  const pointsByDate = new Map<string, FetchedHistoricalPoint>();

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index];
    const close = closeValues[index];
    const rawAdjClose = adjCloseValues[index];

    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      continue;
    }
    if (typeof close !== "number" || !Number.isFinite(close)) {
      continue;
    }

    const adjClose = typeof rawAdjClose === "number" && Number.isFinite(rawAdjClose)
      ? rawAdjClose
      : close;
    const tradeDate = new Date(timestamp * 1000);
    const dateKey = toDateKey(tradeDate);

    pointsByDate.set(dateKey, {
      tradeDate: parseDateKeyToDate(dateKey),
      close,
      adjClose,
      currency,
    });
  }

  const points = Array.from(pointsByDate.values())
    .sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());

  logDev(
    `[yahoo-historical] source-symbol=${resolved.sourceSymbol} resolved-symbol=${resolved.resolvedSymbol} result-points=${points.length}`,
  );

  return {
    sourceSymbol: resolved.sourceSymbol,
    resolvedSymbol: resolved.resolvedSymbol,
    points,
  };
}

export async function fetchHistoricalFromYahoo(
  symbol: string,
  fromDate: Date,
  toDate: Date,
): Promise<FetchedHistoricalPoint[]> {
  const result = await fetchHistoricalFromYahooWithResolution(symbol, fromDate, toDate);
  return result.points;
}
