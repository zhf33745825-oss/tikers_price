export interface AutoRefreshStateInput {
  autoRefreshing: boolean;
  pendingCount: number;
  attempts: number;
  maxAttempts: number;
}

export function shouldContinueAutoRefresh(input: AutoRefreshStateInput): boolean {
  if (!input.autoRefreshing) {
    return false;
  }
  if (input.pendingCount <= 0) {
    return false;
  }
  return input.attempts < input.maxAttempts;
}

export function hasAutoRefreshTimedOut(input: AutoRefreshStateInput): boolean {
  if (!input.autoRefreshing) {
    return false;
  }
  if (input.pendingCount <= 0) {
    return false;
  }
  return input.attempts >= input.maxAttempts;
}

export function scheduleAutoRefreshTick(
  callback: () => void,
  intervalMs: number,
): () => void {
  const timer = setTimeout(callback, intervalMs);
  return () => {
    clearTimeout(timer);
  };
}
