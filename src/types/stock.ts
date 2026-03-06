export interface HistoricalPoint {
  date: string;
  close: number;
  adjClose: number;
}

export interface SymbolSeries {
  symbol: string;
  currency: string;
  points: HistoricalPoint[];
}

export interface PriceQueryResponse {
  range: {
    from: string;
    to: string;
  };
  series: SymbolSeries[];
  warnings: string[];
}

export interface WatchlistItem {
  symbol: string;
  displayName: string | null;
  regionOverride: string | null;
  autoName: string | null;
  autoRegion: string | null;
  autoCurrency: string | null;
  metaUpdatedAt: string | null;
  resolvedName: string;
  resolvedRegion: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  lastSuccessfulUpdateAt: string | null;
}

export interface WatchlistSummary {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  symbolCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistsResponse {
  lists: WatchlistSummary[];
  defaultListId: string | null;
  lastSuccessfulUpdateAt: string | null;
}

export interface WatchlistMembersResponse {
  list: WatchlistSummary;
  items: WatchlistItem[];
}

export interface SymbolSuggestion {
  symbol: string;
  name: string | null;
  exchange: string | null;
  region: string | null;
  type: string | null;
}

export interface SymbolSuggestResponse {
  items: SymbolSuggestion[];
  source: "yahoo" | "local-fallback";
}

export type ImportPreviewStatus =
  | "matched"
  | "needs_choice"
  | "invalid_format"
  | "no_match"
  | "duplicate_in_batch"
  | "already_in_list";

export interface ImportPreviewRow {
  input: string;
  normalized: string;
  status: ImportPreviewStatus;
  message: string;
  resolvedSymbol: string | null;
  candidates: SymbolSuggestion[];
}

export interface ImportPreviewResponse {
  items: ImportPreviewRow[];
}

export interface DailyUpdateResult {
  jobDate: string;
  startedAt: string;
  endedAt: string;
  status: "success" | "partial" | "failed";
  totalSymbols: number;
  successSymbols: number;
  failedSymbols: number;
  upsertedRows: number;
  message: string;
  failures: Array<{
    symbol: string;
    error: string;
  }>;
}

export type MatrixPreset = "7" | "30" | "90" | "custom";
export type MatrixMode = "watchlist" | "adhoc";

export interface MatrixRow {
  symbol: string;
  name: string;
  region: string;
  currency: string;
  latestClose: number | null;
  pricesByDate: Record<string, number | null>;
}

export interface MatrixPriceResponse {
  mode: MatrixMode;
  range: {
    from: string;
    to: string;
    preset: MatrixPreset;
  };
  dates: string[];
  displayDates: string[];
  rows: MatrixRow[];
  warnings: string[];
}
