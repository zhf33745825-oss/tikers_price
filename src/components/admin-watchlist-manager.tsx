"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  WatchlistItem,
  WatchlistMembersResponse,
  WatchlistSummary,
  WatchlistsResponse,
} from "@/types/stock";

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

function rowEditKey(listId: string | null, symbol: string): string {
  return `${listId ?? "none"}::${symbol}`;
}

export function AdminWatchlistManager() {
  const [lists, setLists] = useState<WatchlistSummary[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);

  const [newListName, setNewListName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [regionOverride, setRegionOverride] = useState("");

  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creatingList, setCreatingList] = useState(false);
  const [submittingSymbol, setSubmittingSymbol] = useState(false);
  const [savingSymbols, setSavingSymbols] = useState<Record<string, boolean>>({});
  const [listActionLoading, setListActionLoading] = useState<Record<string, boolean>>({});
  const [listNameDrafts, setListNameDrafts] = useState<Record<string, string>>({});
  const [rowEdits, setRowEdits] = useState<Record<string, RowEditState>>({});

  const activeList = useMemo(
    () => lists.find((list) => list.id === activeListId) ?? null,
    [activeListId, lists],
  );

  const syncListNameDrafts = (nextLists: WatchlistSummary[]) => {
    setListNameDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const list of nextLists) {
        next[list.id] = prev[list.id] ?? list.name;
      }
      return next;
    });
  };

  const loadWatchlists = async (preferredListId?: string | null) => {
    setLoadingLists(true);
    try {
      const response = await fetch("/api/admin/watchlists");
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "加载清单失败");
        setLists([]);
        setActiveListId(null);
        return null;
      }

      const data = body as WatchlistsResponse;
      setLists(data.lists);
      syncListNameDrafts(data.lists);

      const nextActiveListId =
        (preferredListId && data.lists.some((item) => item.id === preferredListId)
          ? preferredListId
          : null)
        ?? (activeListId && data.lists.some((item) => item.id === activeListId)
          ? activeListId
          : null)
        ?? data.defaultListId
        ?? data.lists[0]?.id
        ?? null;

      setActiveListId(nextActiveListId);
      return nextActiveListId;
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "网络错误");
      setLists([]);
      setActiveListId(null);
      return null;
    } finally {
      setLoadingLists(false);
    }
  };

  const loadMembers = async (listId: string | null) => {
    if (!listId) {
      setItems([]);
      return;
    }

    setLoadingItems(true);
    try {
      const response = await fetch(`/api/admin/watchlists/${encodeURIComponent(listId)}/symbols`);
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "加载清单成员失败");
        setItems([]);
        return;
      }

      const data = body as WatchlistMembersResponse;
      setItems(data.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "网络错误");
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const refreshAll = async (preferredListId?: string | null) => {
    const nextActiveListId = await loadWatchlists(preferredListId);
    await loadMembers(nextActiveListId);
  };

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setRowEdits((prev) => {
      const next = { ...prev };
      for (const item of items) {
        next[rowEditKey(activeListId, item.symbol)] = {
          displayName: item.displayName ?? "",
          regionOverride: item.regionOverride ?? "",
        };
      }
      return next;
    });
  }, [activeListId, items]);

  const setListActionBusy = (key: string, busy: boolean) => {
    setListActionLoading((prev) => ({ ...prev, [key]: busy }));
  };

  const handleSelectList = async (listId: string) => {
    setActiveListId(listId);
    setError(null);
    await loadMembers(listId);
  };

  const handleCreateList = async () => {
    setCreatingList(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/watchlists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newListName }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "新建清单失败");
        return;
      }

      setNewListName("");
      const created = body as WatchlistSummary;
      await refreshAll(created.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "网络错误");
    } finally {
      setCreatingList(false);
    }
  };

  const handleRenameList = async (listId: string) => {
    const actionKey = `rename:${listId}`;
    setListActionBusy(actionKey, true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/watchlists/${encodeURIComponent(listId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: listNameDrafts[listId] ?? "" }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "重命名清单失败");
        return;
      }
      await refreshAll(listId);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "网络错误");
    } finally {
      setListActionBusy(actionKey, false);
    }
  };

  const handleSetDefaultList = async (listId: string) => {
    const actionKey = `default:${listId}`;
    setListActionBusy(actionKey, true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/watchlists/${encodeURIComponent(listId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isDefault: true }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "设置默认清单失败");
        return;
      }
      await refreshAll(listId);
    } catch (setDefaultError) {
      setError(setDefaultError instanceof Error ? setDefaultError.message : "网络错误");
    } finally {
      setListActionBusy(actionKey, false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    const actionKey = `delete:${listId}`;
    setListActionBusy(actionKey, true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/watchlists/${encodeURIComponent(listId)}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "删除清单失败");
        return;
      }

      const preferredListId =
        activeListId === listId
          ? ((body.nextDefaultListId as string | null | undefined) ?? null)
          : activeListId;
      await refreshAll(preferredListId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "网络错误");
    } finally {
      setListActionBusy(actionKey, false);
    }
  };

  const handleCreateSymbol = async () => {
    if (!activeListId) {
      setError("请先创建或选择一个清单");
      return;
    }

    setSubmittingSymbol(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/watchlists/${encodeURIComponent(activeListId)}/symbols`, {
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
        setError(body.error ?? "新增代码失败");
        return;
      }

      setSymbol("");
      setDisplayName("");
      setRegionOverride("");
      await refreshAll(activeListId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "网络错误");
    } finally {
      setSubmittingSymbol(false);
    }
  };

  const handleDeleteSymbol = async (target: string) => {
    if (!activeListId) {
      return;
    }

    setError(null);
    try {
      const response = await fetch(
        `/api/admin/watchlists/${encodeURIComponent(activeListId)}/symbols/${encodeURIComponent(target)}`,
        {
          method: "DELETE",
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "删除失败");
        return;
      }
      await refreshAll(activeListId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "网络错误");
    }
  };

  const handleMove = async (target: string, direction: "up" | "down") => {
    if (!activeListId) {
      return;
    }

    setError(null);
    try {
      const response = await fetch(
        `/api/admin/watchlists/${encodeURIComponent(activeListId)}/symbols/reorder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol: target,
            direction,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "调整顺序失败");
        return;
      }
      await refreshAll(activeListId);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "网络错误");
    }
  };

  const handleSaveOverrides = async (target: string) => {
    if (!activeListId) {
      return;
    }

    const key = rowEditKey(activeListId, target);
    setSavingSymbols((prev) => ({ ...prev, [key]: true }));
    setError(null);

    try {
      const edits = rowEdits[key] ?? { displayName: "", regionOverride: "" };
      const response = await fetch(
        `/api/admin/watchlists/${encodeURIComponent(activeListId)}/symbols/${encodeURIComponent(target)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: edits.displayName || null,
            regionOverride: edits.regionOverride || null,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "保存覆盖值失败");
        return;
      }
      await refreshAll(activeListId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "网络错误");
    } finally {
      setSavingSymbols((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <section className="content-section">
      <div className="panel">
        <h2 className="panel-title">清单管理</h2>
        <div className="admin-subpanel watchlist-create-panel">
          <div className="admin-subpanel-header">
            <h3 className="admin-subpanel-title">新建清单</h3>
            <p className="subtle">创建后会出现在首页清单标签中，方便快速切换。</p>
          </div>
          <div className="watchlist-create-row">
            <label className="field">
              <span>新清单名称</span>
              <input
                value={newListName}
                onChange={(event) => setNewListName(event.target.value)}
                placeholder="例如 清单一"
              />
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleCreateList()}
              disabled={creatingList}
            >
              {creatingList ? "创建中..." : "新建清单"}
            </button>
          </div>
        </div>

        <div className="watchlist-list-section">
          <h3 className="section-subtitle">清单列表管理</h3>

          {loadingLists ? <p className="subtle">加载清单中...</p> : null}

        {!loadingLists && lists.length === 0 ? (
          <p className="subtle">暂无清单</p>
        ) : null}

        {!loadingLists && lists.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table admin-table watchlist-table">
              <thead>
                <tr>
                  <th>当前</th>
                  <th>清单名称</th>
                  <th>成员数</th>
                  <th>默认</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {lists.map((list) => (
                  <tr key={list.id} className={activeListId === list.id ? "selected-list-row" : undefined}>
                    <td>{activeListId === list.id ? "当前" : "-"}</td>
                    <td>
                      <input
                        value={listNameDrafts[list.id] ?? list.name}
                        onChange={(event) =>
                          setListNameDrafts((prev) => ({ ...prev, [list.id]: event.target.value }))}
                      />
                    </td>
                    <td>{list.symbolCount}</td>
                    <td>{list.isDefault ? "是" : "否"}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handleSelectList(list.id)}
                          disabled={activeListId === list.id}
                        >
                          切换
                        </button>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => void handleRenameList(list.id)}
                          disabled={Boolean(listActionLoading[`rename:${list.id}`])}
                        >
                          {listActionLoading[`rename:${list.id}`] ? "保存中..." : "保存名称"}
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handleSetDefaultList(list.id)}
                          disabled={list.isDefault || Boolean(listActionLoading[`default:${list.id}`])}
                        >
                          设为默认
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void handleDeleteList(list.id)}
                          disabled={Boolean(listActionLoading[`delete:${list.id}`])}
                        >
                          {listActionLoading[`delete:${list.id}`] ? "删除中..." : "删除清单"}
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

        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <div className="panel">
        <h3 className="panel-title">
          当前清单成员管理{activeList ? `：${activeList.name}` : ""}
        </h3>

        <div className="admin-form-grid">
          <label className="field">
            <span>股票代码</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="例如 TSLA 或 600519.SS"
            />
          </label>

          <label className="field">
            <span>名称覆盖（可选）</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="例如 特斯拉"
            />
          </label>

          <label className="field">
            <span>地区覆盖（可选）</span>
            <input
              value={regionOverride}
              onChange={(event) => setRegionOverride(event.target.value)}
              placeholder="例如 美国"
            />
          </label>

          <button
            type="button"
            className="primary-button"
            onClick={() => void handleCreateSymbol()}
            disabled={submittingSymbol || !activeListId}
          >
            {submittingSymbol ? "提交中..." : "添加到当前清单"}
          </button>
        </div>

        {!activeListId ? (
          <p className="subtle">请先创建或选择一个清单。</p>
        ) : null}

        {loadingItems ? <p className="subtle">加载成员中...</p> : null}

        {!loadingItems && activeListId && items.length === 0 ? (
          <p className="subtle">该清单暂无股票代码</p>
        ) : null}

        {!loadingItems && items.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table admin-table">
              <thead>
                <tr>
                  <th>排序</th>
                  <th>股票代码</th>
                  <th>生效名称</th>
                  <th>生效地区</th>
                  <th>名称覆盖</th>
                  <th>地区覆盖</th>
                  <th>自动币种</th>
                  <th>元信息更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const key = rowEditKey(activeListId, item.symbol);
                  return (
                    <tr key={`${activeListId}:${item.symbol}`}>
                      <td>{index + 1}</td>
                      <td>{item.symbol}</td>
                      <td>{item.resolvedName}</td>
                      <td>{item.resolvedRegion}</td>
                      <td>
                        <input
                          value={rowEdits[key]?.displayName ?? ""}
                          onChange={(event) =>
                            setRowEdits((prev) => ({
                              ...prev,
                              [key]: {
                                ...(prev[key] ?? { displayName: "", regionOverride: "" }),
                                displayName: event.target.value,
                              },
                            }))}
                        />
                      </td>
                      <td>
                        <input
                          value={rowEdits[key]?.regionOverride ?? ""}
                          onChange={(event) =>
                            setRowEdits((prev) => ({
                              ...prev,
                              [key]: {
                                ...(prev[key] ?? { displayName: "", regionOverride: "" }),
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
                            上移
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void handleMove(item.symbol, "down")}
                          >
                            下移
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => void handleSaveOverrides(item.symbol)}
                            disabled={Boolean(savingSymbols[key])}
                          >
                            {savingSymbols[key] ? "保存中..." : "保存"}
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => void handleDeleteSymbol(item.symbol)}
                          >
                            从当前清单删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

