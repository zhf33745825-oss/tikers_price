"use client";

import { useEffect, useMemo, useState } from "react";

import type { WatchlistItem, WatchlistResponse } from "@/types/stock";

interface RowEditState {
  displayName: string;
  regionOverride: string;
}

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
  const [regionOverride, setRegionOverride] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingSymbols, setSavingSymbols] = useState<Record<string, boolean>>({});

  const editStateMap = useMemo(() => {
    const map: Record<string, RowEditState> = {};
    for (const item of items) {
      map[item.symbol] = {
        displayName: item.displayName ?? "",
        regionOverride: item.regionOverride ?? "",
      };
    }
    return map;
  }, [items]);

  const [rowEdits, setRowEdits] = useState<Record<string, RowEditState>>({});

  useEffect(() => {
    setRowEdits(editStateMap);
  }, [editStateMap]);

  const loadWatchlist = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/watchlist");
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "failed to load watchlist");
        return;
      }

      const data = body as WatchlistResponse;
      setItems(data.items);
      setLastUpdateAt(data.lastSuccessfulUpdateAt);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "network error");
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
          regionOverride: regionOverride || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "failed to add symbol");
        return;
      }

      setSymbol("");
      setDisplayName("");
      setRegionOverride("");
      await loadWatchlist();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "network error");
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
        setError(body.error ?? "failed to delete");
        return;
      }
      await loadWatchlist();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "network error");
    }
  };

  const handleMove = async (target: string, direction: "up" | "down") => {
    setError(null);
    try {
      const response = await fetch("/api/admin/watchlist/reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: target,
          direction,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "failed to reorder");
        return;
      }
      await loadWatchlist();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "network error");
    }
  };

  const handleSaveOverrides = async (target: string) => {
    setSavingSymbols((prev) => ({ ...prev, [target]: true }));
    setError(null);

    try {
      const edits = rowEdits[target];
      const response = await fetch(`/api/admin/watchlist/${encodeURIComponent(target)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: edits.displayName || null,
          regionOverride: edits.regionOverride || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "failed to save overrides");
        return;
      }
      await loadWatchlist();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "network error");
    } finally {
      setSavingSymbols((prev) => ({ ...prev, [target]: false }));
    }
  };

  return (
    <section className="content-section">
      <div className="panel">
        <h2 className="panel-title">Watchlist Manager</h2>
        <p className="subtle">
          Last successful daily update: {formatDateTime(lastUpdateAt)}
        </p>

        <div className="admin-form-grid">
          <label className="field">
            <span>Symbol</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="e.g. TSLA or 600519.SS"
            />
          </label>

          <label className="field">
            <span>Name Override (optional)</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. Tesla"
            />
          </label>

          <label className="field">
            <span>Region Override (optional)</span>
            <input
              value={regionOverride}
              onChange={(event) => setRegionOverride(event.target.value)}
              placeholder="e.g. US"
            />
          </label>

          <button
            type="button"
            className="primary-button"
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Add Symbol"}
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <div className="panel">
        <h3 className="panel-title">Current Watchlist</h3>

        {loading ? <p className="subtle">Loading...</p> : null}

        {!loading && items.length === 0 ? (
          <p className="subtle">Watchlist is empty</p>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Symbol</th>
                  <th>Resolved Name</th>
                  <th>Resolved Region</th>
                  <th>Name Override</th>
                  <th>Region Override</th>
                  <th>Auto Currency</th>
                  <th>Meta Updated At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.symbol}>
                    <td>{item.sortOrder}</td>
                    <td>{item.symbol}</td>
                    <td>{item.resolvedName}</td>
                    <td>{item.resolvedRegion}</td>
                    <td>
                      <input
                        value={rowEdits[item.symbol]?.displayName ?? ""}
                        onChange={(event) =>
                          setRowEdits((prev) => ({
                            ...prev,
                            [item.symbol]: {
                              ...prev[item.symbol],
                              displayName: event.target.value,
                            },
                          }))}
                      />
                    </td>
                    <td>
                      <input
                        value={rowEdits[item.symbol]?.regionOverride ?? ""}
                        onChange={(event) =>
                          setRowEdits((prev) => ({
                            ...prev,
                            [item.symbol]: {
                              ...prev[item.symbol],
                              regionOverride: event.target.value,
                            },
                          }))}
                      />
                    </td>
                    <td>{item.autoCurrency ?? "-"}</td>
                    <td>{formatDateTime(item.metaUpdatedAt)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handleMove(item.symbol, "up")}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handleMove(item.symbol, "down")}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => void handleSaveOverrides(item.symbol)}
                          disabled={Boolean(savingSymbols[item.symbol])}
                        >
                          {savingSymbols[item.symbol] ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void handleDelete(item.symbol)}
                        >
                          Delete
                        </button>
                      </div>
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

