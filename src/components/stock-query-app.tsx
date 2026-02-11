"use client";

import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";

import { PriceChart } from "@/components/price-chart";
import type { MatrixMode, MatrixPreset, MatrixPriceResponse, PriceQueryResponse } from "@/types/stock";

const DATE_COL_WIDTH = 96;
const VIRTUAL_BUFFER_COLS = 8;
const DEFAULT_ADHOC_SYMBOLS = "AAPL, MSFT, 0700.HK";

interface ChartTableRow {
  date: string;
  symbol: string;
  close: number;
  adjClose: number;
  currency: string;
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

export function StockQueryApp() {
  const [preset, setPreset] = useState<MatrixPreset>("30");
  const [customFrom, setCustomFrom] = useState(dayjs().subtract(1, "year").format("YYYY-MM-DD"));
  const [customTo, setCustomTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixResponse, setMatrixResponse] = useState<MatrixPriceResponse | null>(null);
  const [matrixMode, setMatrixMode] = useState<MatrixMode>("watchlist");
  const [adhocSymbols, setAdhocSymbols] = useState(DEFAULT_ADHOC_SYMBOLS);

  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartResponse, setChartResponse] = useState<PriceQueryResponse | null>(null);
  const [chartSymbolFilter, setChartSymbolFilter] = useState("ALL");

  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1200);

  const loadMatrix = async (params: {
    mode: MatrixMode;
    preset: MatrixPreset;
    from?: string;
    to?: string;
    symbols?: string;
  }) => {
    setMatrixLoading(true);
    setMatrixError(null);

    try {
      const searchParams = new URLSearchParams();
      searchParams.set("mode", params.mode);
      searchParams.set("preset", params.preset);
      if (params.preset === "custom") {
        if (!params.from || !params.to) {
          setMatrixError("自定义区间必须填写开始和结束日期");
          return;
        }
        searchParams.set("from", params.from);
        searchParams.set("to", params.to);
      }
      if (params.mode === "adhoc") {
        searchParams.set("symbols", params.symbols ?? "");
      }

      const responseRaw = await fetch(`/api/prices/matrix?${searchParams.toString()}`);
      const body = await responseRaw.json();

      if (!responseRaw.ok) {
        setMatrixError(body.error ?? "加载矩阵数据失败");
        return;
      }

      setMatrixMode(params.mode);
      setMatrixResponse(body as MatrixPriceResponse);
      setScrollLeft(0);
      if (matrixScrollRef.current) {
        matrixScrollRef.current.scrollLeft = 0;
      }
    } catch (error) {
      setMatrixError(error instanceof Error ? error.message : "网络错误");
    } finally {
      setMatrixLoading(false);
    }
  };

  const loadWatchlistPreset = async (targetPreset: MatrixPreset) => {
    if (targetPreset === "custom") {
      setPreset("custom");
      return;
    }
    setPreset(targetPreset);
    await loadMatrix({
      mode: "watchlist",
      preset: targetPreset,
    });
  };

  const applyWatchlistCustomRange = async () => {
    setPreset("custom");
    await loadMatrix({
      mode: "watchlist",
      preset: "custom",
      from: customFrom,
      to: customTo,
    });
  };

  const applyAdhocMatrix = async () => {
    await loadMatrix({
      mode: "adhoc",
      preset,
      from: preset === "custom" ? customFrom : undefined,
      to: preset === "custom" ? customTo : undefined,
      symbols: adhocSymbols,
    });
  };

  const loadChartData = async () => {
    setChartLoading(true);
    setChartError(null);
    try {
      const params = new URLSearchParams({
        symbols: adhocSymbols,
        from: customFrom,
        to: customTo,
      });

      const responseRaw = await fetch(`/api/prices?${params.toString()}`);
      const body = await responseRaw.json();
      if (!responseRaw.ok) {
        setChartError(body.error ?? "加载图表数据失败");
        return;
      }

      setChartResponse(body as PriceQueryResponse);
      setChartSymbolFilter("ALL");
    } catch (error) {
      setChartError(error instanceof Error ? error.message : "网络错误");
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    void loadMatrix({
      mode: "watchlist",
      preset: "30",
    });
  }, []);

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

  const chartSymbols = useMemo(() => {
    if (!chartResponse) {
      return [];
    }
    return chartResponse.series.map((item) => item.symbol);
  }, [chartResponse]);

  const chartTableRows = useMemo<ChartTableRow[]>(() => {
    if (!chartResponse) {
      return [];
    }

    const rows = chartResponse.series.flatMap((item) =>
      item.points.map((point) => ({
        date: point.date,
        symbol: item.symbol,
        close: point.close,
        adjClose: point.adjClose,
        currency: item.currency,
      })),
    );

    rows.sort((a, b) => {
      if (a.date === b.date) {
        return a.symbol.localeCompare(b.symbol);
      }
      return a.date < b.date ? 1 : -1;
    });

    if (chartSymbolFilter === "ALL") {
      return rows;
    }
    return rows.filter((row) => row.symbol === chartSymbolFilter);
  }, [chartResponse, chartSymbolFilter]);

  return (
    <section className="content-section">
      <div className="panel">
        <div className="matrix-toolbar">
          <div>
            <h2 className="panel-title">股票收盘价矩阵</h2>
            <p className="subtle">
              模式：{matrixMode === "watchlist" ? "自选清单" : "临时查询"} | 缺失值显示为 N/A
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
          </div>
        </div>

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

        {matrixResponse?.warnings?.length ? (
          <div className="inline-warning">
            {matrixResponse.warnings.map((warning, index) => (
              <div key={`${index}-${warning}`}>{sanitizeWarningText(warning)}</div>
            ))}
          </div>
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

      <details className="panel advanced-panel">
        <summary className="advanced-summary">高级查询与图表</summary>

        <div className="advanced-grid">
          <label className="field">
            <span>股票代码（逗号 / 空格 / 换行分隔）</span>
            <textarea
              value={adhocSymbols}
              onChange={(event) => setAdhocSymbols(event.target.value)}
              rows={4}
            />
          </label>

          <div className="advanced-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void applyAdhocMatrix()}
              disabled={matrixLoading}
            >
              {matrixLoading ? "应用中..." : "应用到矩阵"}
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => void loadChartData()}
              disabled={chartLoading}
            >
              {chartLoading ? "加载中..." : "加载图表数据"}
            </button>
          </div>
        </div>

        {chartError ? <p className="error-text">{chartError}</p> : null}

        {chartResponse?.warnings?.length ? (
          <div className="inline-warning">
            {chartResponse.warnings.map((warning, index) => (
              <div key={`${index}-${warning}`}>{sanitizeWarningText(warning)}</div>
            ))}
          </div>
        ) : null}

        {chartResponse && chartResponse.series.length > 0 ? (
          <>
            <PriceChart series={chartResponse.series} />

            <div className="panel nested-panel">
              <div className="table-header">
                <h3 className="panel-title">历史价格表</h3>
                <label className="field compact">
                  <span>按代码筛选</span>
                  <select
                    value={chartSymbolFilter}
                    onChange={(event) => setChartSymbolFilter(event.target.value)}
                  >
                    <option value="ALL">全部</option>
                    {chartSymbols.map((symbol) => (
                      <option key={symbol} value={symbol}>
                        {symbol}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>代码</th>
                      <th>收盘价</th>
                      <th>复权收盘价</th>
                      <th>币种</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartTableRows.map((row) => (
                      <tr key={`${row.symbol}-${row.date}`}>
                        <td>{row.date}</td>
                        <td>{row.symbol}</td>
                        <td>{formatNumber(row.close)}</td>
                        <td>{formatNumber(row.adjClose)}</td>
                        <td>{row.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </details>
    </section>
  );
}
