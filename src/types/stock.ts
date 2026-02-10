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

