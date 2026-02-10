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
  enabled: boolean;
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

