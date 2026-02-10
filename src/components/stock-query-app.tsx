"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";

import { PriceChart } from "@/components/price-chart";
import type { PriceQueryResponse } from "@/types/stock";

interface TableRow {
  date: string;
  symbol: string;
  close: number;
  adjClose: number;
  currency: string;
}

const DEFAULT_SYMBOL_INPUT = "AAPL, MSFT, 0700.HK";

function formatNumber(value: number): string {
  return value.toFixed(2);
}

export function StockQueryApp() {
  const [symbolsInput, setSymbolsInput] = useState(DEFAULT_SYMBOL_INPUT);
  const [fromDate, setFromDate] = useState(dayjs().subtract(1, "year").format("YYYY-MM-DD"));
  const [toDate, setToDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<PriceQueryResponse | null>(null);

  const symbolOptions = useMemo(() => {
    if (!response) {
      return [];
    }
    return response.series.map((item) => item.symbol);
  }, [response]);

  const tableRows = useMemo<TableRow[]>(() => {
    if (!response) {
      return [];
    }

    const rows = response.series.flatMap((item) =>
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

    if (symbolFilter === "ALL") {
      return rows;
    }

    return rows.filter((row) => row.symbol === symbolFilter);
  }, [response, symbolFilter]);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        symbols: symbolsInput,
        from: fromDate,
        to: toDate,
      });

      const responseRaw = await fetch(`/api/prices?${params.toString()}`);
      const body = await responseRaw.json();

      if (!responseRaw.ok) {
        setResponse(null);
        setError(body.error ?? "查询失败");
        return;
      }

      setResponse(body as PriceQueryResponse);
      setSymbolFilter("ALL");
    } catch (fetchError) {
      setResponse(null);
      setError(fetchError instanceof Error ? fetchError.message : "网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="content-section">
      <div className="panel">
        <h2 className="panel-title">历史收盘价查询</h2>
        <p className="subtle">
          支持多个代码（逗号、空格或换行分隔），单次最多 20 个。
        </p>

        <div className="query-grid">
          <label className="field">
            <span>股票代码</span>
            <textarea
              value={symbolsInput}
              onChange={(event) => setSymbolsInput(event.target.value)}
              rows={4}
              placeholder="例如: AAPL, MSFT, 0700.HK"
            />
          </label>

          <div className="field-group">
            <label className="field">
              <span>开始日期</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>

            <label className="field">
              <span>结束日期</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="primary-button"
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? "查询中..." : "查询历史数据"}
            </button>
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </div>

      {response?.warnings?.length ? (
        <div className="panel warning-panel">
          <h3 className="panel-title">提示信息</h3>
          <ul className="plain-list">
            {response.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {response && response.series.length > 0 ? (
        <>
          <PriceChart series={response.series} />

          <div className="panel">
            <div className="table-header">
              <h3 className="panel-title">历史收盘价表格</h3>
              <label className="field compact">
                <span>按代码筛选</span>
                <select
                  value={symbolFilter}
                  onChange={(event) => setSymbolFilter(event.target.value)}
                >
                  <option value="ALL">全部</option>
                  {symbolOptions.map((symbol) => (
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
                    <th>Close</th>
                    <th>Adj Close</th>
                    <th>币种</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
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
    </section>
  );
}

