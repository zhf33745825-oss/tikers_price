"use client";

import { useEffect, useState } from "react";

import type { WatchlistItem, WatchlistResponse } from "@/types/stock";

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

export function AdminWatchlistManager() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadWatchlist = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/watchlist");
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "读取清单失败");
        return;
      }

      const data = body as WatchlistResponse;
      setItems(data.items);
      setLastUpdateAt(data.lastSuccessfulUpdateAt);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "网络错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWatchlist();
  }, []);

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/watchlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol,
          displayName: displayName || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "新增失败");
        return;
      }

      setSymbol("");
      setDisplayName("");
      await loadWatchlist();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (target: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/admin/watchlist/${encodeURIComponent(target)}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "删除失败");
        return;
      }
      await loadWatchlist();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "网络错误");
    }
  };

  return (
    <section className="content-section">
      <div className="panel">
        <h2 className="panel-title">自动更新股票清单</h2>
        <p className="subtle">
          最后一次成功更新: {formatDateTime(lastUpdateAt)}
        </p>

        <div className="admin-form-grid">
          <label className="field">
            <span>股票代码</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="例如: TSLA 或 600519.SS"
            />
          </label>

          <label className="field">
            <span>显示名称 (可选)</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="例如: Tesla"
            />
          </label>

          <button
            type="button"
            className="primary-button"
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting ? "提交中..." : "新增到清单"}
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <div className="panel">
        <h3 className="panel-title">当前清单</h3>

        {loading ? <p className="subtle">加载中...</p> : null}

        {!loading && items.length === 0 ? (
          <p className="subtle">清单为空</p>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>代码</th>
                  <th>显示名称</th>
                  <th>启用</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.symbol}>
                    <td>{item.symbol}</td>
                    <td>{item.displayName ?? "-"}</td>
                    <td>{item.enabled ? "是" : "否"}</td>
                    <td>{formatDateTime(item.updatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleDelete(item.symbol)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

