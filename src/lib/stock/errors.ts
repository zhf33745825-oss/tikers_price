export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown error";
}

const DEFAULT_UPSTREAM_ERROR = "Upstream data source unavailable";
const DEFAULT_YAHOO_UNAVAILABLE_MESSAGE =
  "Yahoo source unavailable (network/region restriction). Using cached database data when available.";
const MAX_ERROR_MESSAGE_LENGTH = 180;

function stripHtmlLikeContent(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function compactText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function truncateText(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxLength - 3))}...`;
}

function looksLikeHtmlPayload(input: string): boolean {
  return (
    /<!doctype/i.test(input)
    || /<html[\s>]/i.test(input)
    || /<body[\s>]/i.test(input)
    || /<script[\s>]/i.test(input)
    || /<\/[a-z][^>]*>/i.test(input)
  );
}

export function normalizeUpstreamErrorMessage(
  error: unknown,
  options?: {
    fallbackMessage?: string;
    htmlFallbackMessage?: string;
    maxLength?: number;
  },
): string {
  const fallbackMessage = options?.fallbackMessage ?? DEFAULT_UPSTREAM_ERROR;
  const htmlFallbackMessage = options?.htmlFallbackMessage ?? fallbackMessage;
  const maxLength = options?.maxLength ?? MAX_ERROR_MESSAGE_LENGTH;
  const rawMessage = toErrorMessage(error);

  if (!rawMessage || rawMessage === "Unknown error") {
    return fallbackMessage;
  }

  if (looksLikeHtmlPayload(rawMessage)) {
    return htmlFallbackMessage;
  }

  const compacted = compactText(stripHtmlLikeContent(rawMessage));
  if (!compacted) {
    return fallbackMessage;
  }

  return truncateText(compacted, maxLength);
}

export function normalizeYahooErrorMessage(error: unknown): string {
  return normalizeUpstreamErrorMessage(error, {
    fallbackMessage: "Yahoo source unavailable",
    htmlFallbackMessage: DEFAULT_YAHOO_UNAVAILABLE_MESSAGE,
  });
}

export function isPrismaKnownRequestError(
  error: unknown,
  expectedCode?: string,
): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    name?: unknown;
    constructor?: {
      name?: unknown;
    };
  };

  const code = typeof candidate.code === "string" ? candidate.code : undefined;
  const errorName = typeof candidate.name === "string" ? candidate.name : undefined;
  const ctorName =
    typeof candidate.constructor?.name === "string"
      ? candidate.constructor.name
      : undefined;

  const isKnown =
    errorName === "PrismaClientKnownRequestError"
    || ctorName === "PrismaClientKnownRequestError"
    || (code !== undefined && /^P\d{4}$/.test(code));

  if (!isKnown) {
    return false;
  }

  if (expectedCode === undefined) {
    return true;
  }

  return code === expectedCode;
}
