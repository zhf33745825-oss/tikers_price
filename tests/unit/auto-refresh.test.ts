import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasAutoRefreshTimedOut,
  scheduleAutoRefreshTick,
  shouldContinueAutoRefresh,
} from "@/lib/stock/auto-refresh";

describe("auto refresh helpers", () => {
  it("continues only when refreshing, pending rows exist, and attempts below max", () => {
    expect(shouldContinueAutoRefresh({
      autoRefreshing: true,
      pendingCount: 2,
      attempts: 1,
      maxAttempts: 8,
    })).toBe(true);

    expect(shouldContinueAutoRefresh({
      autoRefreshing: false,
      pendingCount: 2,
      attempts: 1,
      maxAttempts: 8,
    })).toBe(false);

    expect(shouldContinueAutoRefresh({
      autoRefreshing: true,
      pendingCount: 0,
      attempts: 1,
      maxAttempts: 8,
    })).toBe(false);

    expect(shouldContinueAutoRefresh({
      autoRefreshing: true,
      pendingCount: 1,
      attempts: 8,
      maxAttempts: 8,
    })).toBe(false);
  });

  it("marks timed out only when attempts reach max while still pending", () => {
    expect(hasAutoRefreshTimedOut({
      autoRefreshing: true,
      pendingCount: 1,
      attempts: 8,
      maxAttempts: 8,
    })).toBe(true);

    expect(hasAutoRefreshTimedOut({
      autoRefreshing: true,
      pendingCount: 0,
      attempts: 8,
      maxAttempts: 8,
    })).toBe(false);

    expect(hasAutoRefreshTimedOut({
      autoRefreshing: true,
      pendingCount: 1,
      attempts: 7,
      maxAttempts: 8,
    })).toBe(false);
  });
});

describe("scheduleAutoRefreshTick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires callback after interval", () => {
    const callback = vi.fn();
    scheduleAutoRefreshTick(callback, 2500);

    vi.advanceTimersByTime(2499);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cancels scheduled callback", () => {
    const callback = vi.fn();
    const cancel = scheduleAutoRefreshTick(callback, 2500);

    cancel();
    vi.advanceTimersByTime(3000);

    expect(callback).not.toHaveBeenCalled();
  });
});
