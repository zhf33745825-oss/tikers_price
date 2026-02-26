"use client";

import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  hasAutoRefreshTimedOut,
  scheduleAutoRefreshTick,
  shouldContinueAutoRefresh,
} from "@/lib/stock/auto-refresh";
import type {
  MatrixMode,
  MatrixPreset,
  MatrixPriceResponse,
  WatchlistSummary,
  WatchlistsResponse,
} from "@/types/stock";

const DATE_COL_WIDTH = 96;
const VIRTUAL_BUFFER_COLS = 8;
const AUTO_REFRESH_INTERVAL_MS = 2500;
const AUTO_REFRESH_MAX_ATTEMPTS = 24;

type MatrixLoadSource = "user" | "auto";

interface MatrixLoadParams {
  mode: MatrixMode;
  preset: MatrixPreset;
  from?: string;
  to?: string;
  symbols?: string;
  listId?: string;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return value.toFixed(2);
}

function sanitizeWarningText(message: string): string {
  const compact = message
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const fallback = compact.length > 0 ? compact : "upstream warning";
  if (fallback.length <= 220) {
    return fallback;
  }
  return `${fallback.slice(0, 217)}...`;
}

export function getPendingSymbolsFromMatrix(response: MatrixPriceResponse | null): string[] {
  if (!response || response.mode !== "watchlist") {
    return [];
  }

  return response.rows
    .filter((row) => {
      if (row.latestClose !== null) {
        return false;
      }
      const values = Object.values(row.pricesByDate);
      if (values.length === 0) {
        return true;
      }
      return values.every((value) => value === null);
    })
    .map((row) => row.symbol);
}

function getListIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = new URL(window.location.href).searchParams.get("listId");
  return value && value.trim() ? value.trim() : null;
}

function setListIdToUrl(listId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (listId) {
    url.searchParams.set("listId", listId);
  } else {
    url.searchParams.delete("listId");
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function StockQueryApp() {
  const [preset, setPreset] = useState<MatrixPreset>("30");
  const [customFrom, setCustomFrom] = useState(dayjs().subtract(1, "year").format("YYYY-MM-DD"));
  const [customTo, setCustomTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixResponse, setMatrixResponse] = useState<MatrixPriceResponse | null>(null);
  const [matrixMode, setMatrixMode] = useState<MatrixMode>("watchlist");
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
  const [watchlistsLoading, setWatchlistsLoading] = useState(true);

  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const lastMatrixParamsRef = useRef<MatrixLoadParams | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [autoRefreshAttempts, setAutoRefreshAttempts] = useState(0);
  const [pendingSymbols, setPendingSymbols] = useState<string[]>([]);
  const [autoRefreshTimedOut, setAutoRefreshTimedOut] = useState(false);

  const loadMatrix = useCallback(async (
    params: MatrixLoadParams,
    source: MatrixLoadSource = "user",
  ) => {
    lastMatrixParamsRef.current = params;

    if (source === "user") {
      setMatrixLoading(true);
      setMatrixError(null);
      setAutoRefreshing(false);
      setAutoRefreshAttempts(0);
      setAutoRefreshTimedOut(false);
    }

    try {
      const searchParams = new URLSearchParams();
      searchParams.set("mode", params.mode);
      searchParams.set("preset", params.preset);
      if (params.preset === "custom") {
        if (!params.from || !params.to) {
          if (source === "user") {
            setMatrixError("自定义区间必须填写开始和结束日期");
          }
          return;
        }
        searchParams.set("from", params.from);
        searchParams.set("to", params.to);
      }
      if (params.mode === "adhoc") {
        searchParams.set("symbols", params.symbols ?? "");
      } else if (params.listId) {
        searchParams.set("listId", params.listId);
      }

      const responseRaw = await fetch(`/api/prices/matrix?${searchParams.toString()}`);
      const body = await responseRaw.json();

      if (!responseRaw.ok) {
        if (source === "user") {
          setMatrixError(body.error ?? "加载矩阵数据失败");
        }
        return;
      }

      const nextResponse = body as MatrixPriceResponse;
      const nextPendingSymbols = getPendingSymbolsFromMatrix(nextResponse);

      setMatrixMode(nextResponse.mode);
      setMatrixResponse(nextResponse);
      setPendingSymbols(nextPendingSymbols);

      if (nextResponse.mode !== "watchlist") {
        setAutoRefreshing(false);
      } else if (nextPendingSymbols.length > 0) {
        setAutoRefreshing(true);
      } else {
        setAutoRefreshing(false);
        setAutoRefreshTimedOut(false);
      }

      if (source === "user") {
        setAutoRefreshAttempts(0);
        setAutoRefreshTimedOut(false);
        setScrollLeft(0);
        if (matrixScrollRef.current) {
          matrixScrollRef.current.scrollLeft = 0;
        }
      }
    } catch (error) {
      if (source === "user") {
        setMatrixError(error instanceof Error ? error.message : "网络错误");
      }
    } finally {
      if (source === "user") {
        setMatrixLoading(false);
      }
    }
  }, []);

  const buildCurrentMatrixParams = useCallback((): MatrixLoadParams => {
    if (lastMatrixParamsRef.current) {
      return { ...lastMatrixParamsRef.current };
    }

    return {
      mode: matrixMode,
      preset,
      from: preset === "custom" ? customFrom : undefined,
      to: preset === "custom" ? customTo : undefined,
      listId: matrixMode === "watchlist" ? activeWatchlistId ?? undefined : undefined,
    };
  }, [activeWatchlistId, customFrom, customTo, matrixMode, preset]);

  const loadWatchlistPreset = async (targetPreset: MatrixPreset) => {
    if (targetPreset === "custom") {
      setPreset("custom");
      return;
    }
    setPreset(targetPreset);
    await loadMatrix({
      mode: "watchlist",
      preset: targetPreset,
      listId: activeWatchlistId ?? undefined,
    });
  };

  const applyWatchlistCustomRange = async () => {
    setPreset("custom");
    await loadMatrix({
      mode: "watchlist",
      preset: "custom",
      from: customFrom,
      to: customTo,
      listId: activeWatchlistId ?? undefined,
    });
  };

  const refreshMatrix = async () => {
    await loadMatrix(buildCurrentMatrixParams(), "user");
  };

  const handleSelectWatchlist = async (listId: string) => {
    setActiveWatchlistId(listId);
    setListIdToUrl(listId);
    await loadMatrix({
      mode: "watchlist",
      preset,
      from: preset === "custom" ? customFrom : undefined,
      to: preset === "custom" ? customTo : undefined,
      listId,
    });
  };

  const loadWatchlists = useCallback(async (preferredListId?: string | null) => {
    setWatchlistsLoading(true);
    try {
      const response = await fetch("/api/admin/watchlists");
      const body = await response.json();
      if (!response.ok) {
        setMatrixError(body.error ?? "加载清单失败");
        setWatchlists([]);
        setActiveWatchlistId(null);
        return null;
      }

      const payload = body as WatchlistsResponse;
      const lists = payload.lists ?? [];
      setWatchlists(lists);

      if (lists.length === 0) {
        setActiveWatchlistId(null);
        setListIdToUrl(null);
        return null;
      }

      const requestedId = preferredListId ?? getListIdFromUrl();
      const nextActiveId =
        (requestedId && lists.some((item) => item.id === requestedId) ? requestedId : null)
        ?? (payload.defaultListId && lists.some((item) => item.id === payload.defaultListId)
          ? payload.defaultListId
          : null)
        ?? lists[0]?.id
        ?? null;

      setActiveWatchlistId(nextActiveId);
      setListIdToUrl(nextActiveId);
      return nextActiveId;
    } catch (error) {
      setMatrixError(error instanceof Error ? error.message : "网络错误");
      setWatchlists([]);
      setActiveWatchlistId(null);
      return null;
    } finally {
      setWatchlistsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const listId = await loadWatchlists();
      if (cancelled) {
        return;
      }

      await loadMatrix({
        mode: "watchlist",
        preset: "30",
        listId: listId ?? undefined,
      });
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [loadMatrix, loadWatchlists]);

  useEffect(() => {
    if (matrixMode !== "watchlist") {
      return;
    }

    const autoRefreshState = {
      autoRefreshing,
      pendingCount: pendingSymbols.length,
      attempts: autoRefreshAttempts,
      maxAttempts: AUTO_REFRESH_MAX_ATTEMPTS,
    };

    if (hasAutoRefreshTimedOut(autoRefreshState)) {
      setAutoRefreshing(false);
      setAutoRefreshTimedOut(true);
      return;
    }

    if (!shouldContinueAutoRefresh(autoRefreshState)) {
      return;
    }

    const cancel = scheduleAutoRefreshTick(() => {
      const params = buildCurrentMatrixParams();
      setAutoRefreshAttempts((previous) => previous + 1);
      void loadMatrix(params, "auto");
    }, AUTO_REFRESH_INTERVAL_MS);

    return cancel;
  }, [
    autoRefreshAttempts,
    autoRefreshing,
    buildCurrentMatrixParams,
    loadMatrix,
    matrixMode,
    pendingSymbols.length,
  ]);

  useEffect(() => {
    const updateViewportWidth = () => {
      if (matrixScrollRef.current) {
        setViewportWidth(matrixScrollRef.current.clientWidth);
      }
    };

    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => {
      window.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  const virtualWindow = useMemo(() => {
    const total = matrixResponse?.dates.length ?? 0;
    if (total === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        leadingWidth: 0,
        trailingWidth: 0,
      };
    }

    const startIndex = Math.max(
      0,
      Math.floor(scrollLeft / DATE_COL_WIDTH) - VIRTUAL_BUFFER_COLS,
    );
    const visibleCount = Math.max(
      1,
      Math.ceil(viewportWidth / DATE_COL_WIDTH) + VIRTUAL_BUFFER_COLS * 2,
    );
    const endIndex = Math.min(total, startIndex + visibleCount);
    const leadingWidth = startIndex * DATE_COL_WIDTH;
    const trailingWidth = Math.max(0, (total - endIndex) * DATE_COL_WIDTH);

    return {
      startIndex,
      endIndex,
      leadingWidth,
      trailingWidth,
    };
  }, [matrixResponse, scrollLeft, viewportWidth]);

  const visibleDateKeys = useMemo(() => {
    if (!matrixResponse) {
      return [];
    }
    return matrixResponse.dates.slice(virtualWindow.startIndex, virtualWindow.endIndex);
  }, [matrixResponse, virtualWindow]);

  const visibleDisplayDates = useMemo(() => {
    if (!matrixResponse) {
      return [];
    }
    return matrixResponse.displayDates.slice(virtualWindow.startIndex, virtualWindow.endIndex);
  }, [matrixResponse, virtualWindow]);

  const activeWatchlist = useMemo(
    () => watchlists.find((item) => item.id === activeWatchlistId) ?? null,
    [activeWatchlistId, watchlists],
  );

  return (
    <section className="content-section">
      <div className="panel">
        <div className="matrix-toolbar">
          <div>
            <h2 className="panel-title">股票收盘价矩阵</h2>
            <p className="subtle">
              模式：{matrixMode === "watchlist" ? "自选清单" : "临时查询"}
              {matrixMode === "watchlist" && activeWatchlist ? ` | 当前清单：${activeWatchlist.name}` : ""}
              {" | "}缺失值显示为 N/A
            </p>
          </div>

          <div className="preset-group">
            <button
              type="button"
              className={`preset-button ${preset === "7" ? "active" : ""}`}
              onClick={() => void loadWatchlistPreset("7")}
              disabled={matrixLoading}
            >
              7天
            </button>
            <button
              type="button"
              className={`preset-button ${preset === "30" ? "active" : ""}`}
              onClick={() => void loadWatchlistPreset("30")}
              disabled={matrixLoading}
            >
              30天
            </button>
            <button
              type="button"
              className={`preset-button ${preset === "90" ? "active" : ""}`}
              onClick={() => void loadWatchlistPreset("90")}
              disabled={matrixLoading}
            >
              90天
            </button>
            <button
              type="button"
              className={`preset-button ${preset === "custom" ? "active" : ""}`}
              onClick={() => setPreset("custom")}
              disabled={matrixLoading}
            >
              自定义
            </button>
            <button
              type="button"
              className="preset-button"
              onClick={() => void refreshMatrix()}
              disabled={matrixLoading}
            >
              刷新
            </button>
          </div>
        </div>

        {watchlistsLoading ? (
          <p className="subtle">加载清单中...</p>
        ) : null}

        {!watchlistsLoading && watchlists.length > 0 ? (
          <div className="watchlist-tabs" role="tablist" aria-label="首页清单切换">
            {watchlists.map((list) => (
              <button
                key={list.id}
                type="button"
                role="tab"
                aria-selected={activeWatchlistId === list.id}
                className={`watchlist-tab-button ${activeWatchlistId === list.id ? "active" : ""}`}
                onClick={() => void handleSelectWatchlist(list.id)}
                disabled={matrixLoading && activeWatchlistId === list.id}
              >
                {list.name}
              </button>
            ))}
          </div>
        ) : null}

        {!watchlistsLoading && watchlists.length === 0 ? (
          <p className="subtle">暂无清单，请到“自选清单管理”创建。</p>
        ) : null}

        {preset === "custom" ? (
          <div className="custom-range-row">
            <label className="field compact">
              <span>开始日期</span>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>

            <label className="field compact">
              <span>结束日期</span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="primary-button"
              onClick={() => void applyWatchlistCustomRange()}
              disabled={matrixLoading}
            >
              {matrixLoading ? "加载中..." : "应用区间"}
            </button>
          </div>
        ) : null}

        {matrixError ? <p className="error-text">{matrixError}</p> : null}

        {autoRefreshing && pendingSymbols.length > 0 ? (
          <p className="subtle">
            正在抓取 {pendingSymbols.length} 个代码的数据，完成后将自动刷新...
          </p>
        ) : null}

        {autoRefreshTimedOut && pendingSymbols.length > 0 ? (
          <p className="subtle">
            部分代码仍无数据，请点击“刷新”重试或稍后再试。
          </p>
        ) : null}

        {matrixResponse?.warnings?.length ? (
          <div className="inline-warning">
            {matrixResponse.warnings.map((warning, index) => (
              <div key={`${index}-${warning}`}>{sanitizeWarningText(warning)}</div>
            ))}
          </div>
        ) : null}

        {!matrixLoading
        && matrixResponse
        && matrixResponse.mode === "watchlist"
        && matrixResponse.rows.length === 0
        && watchlists.length > 0 ? (
          <p className="subtle">当前清单暂无股票代码，请到“自选清单管理”添加。</p>
          ) : null}

        <div
          className="matrix-scroll"
          ref={matrixScrollRef}
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        >
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="sticky-col sticky-col-1">股票代码</th>
                <th className="sticky-col sticky-col-2">名称</th>
                <th className="sticky-col sticky-col-3">地区</th>
                <th className="sticky-col sticky-col-4">币种</th>

                {virtualWindow.leadingWidth > 0 ? (
                  <th
                    className="matrix-spacer"
                    style={{ minWidth: virtualWindow.leadingWidth, width: virtualWindow.leadingWidth }}
                  />
                ) : null}

                {visibleDisplayDates.map((date) => (
                  <th key={date} className="matrix-date-col">
                    {date}
                  </th>
                ))}

                {virtualWindow.trailingWidth > 0 ? (
                  <th
                    className="matrix-spacer"
                    style={{ minWidth: virtualWindow.trailingWidth, width: virtualWindow.trailingWidth }}
                  />
                ) : null}
              </tr>
            </thead>
            <tbody>
              {matrixResponse?.rows?.map((row) => (
                <tr key={row.symbol}>
                  <td className="sticky-col sticky-col-1">{row.symbol}</td>
                  <td className="sticky-col sticky-col-2">{row.name}</td>
                  <td className="sticky-col sticky-col-3">{row.region}</td>
                  <td className="sticky-col sticky-col-4">{row.currency}</td>

                  {virtualWindow.leadingWidth > 0 ? (
                    <td
                      className="matrix-spacer"
                      style={{ minWidth: virtualWindow.leadingWidth, width: virtualWindow.leadingWidth }}
                    />
                  ) : null}

                  {visibleDateKeys.map((dateKey) => (
                    <td key={`${row.symbol}-${dateKey}`} className="matrix-value">
                      {formatNumber(row.pricesByDate[dateKey])}
                    </td>
                  ))}

                  {virtualWindow.trailingWidth > 0 ? (
                    <td
                      className="matrix-spacer"
                      style={{ minWidth: virtualWindow.trailingWidth, width: virtualWindow.trailingWidth }}
                    />
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
