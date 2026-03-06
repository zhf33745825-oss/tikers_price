"use client";

import dayjs from "dayjs";
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  hasAutoRefreshTimedOut,
  scheduleAutoRefreshTick,
  shouldContinueAutoRefresh,
} from "@/lib/stock/auto-refresh";
import type {
  ImportPreviewRow,
  ImportPreviewResponse,
  MatrixPreset,
  MatrixPriceResponse,
  SymbolSuggestion,
  SymbolSuggestResponse,
  WatchlistItem,
  WatchlistMembersResponse,
  WatchlistSummary,
  WatchlistsResponse,
} from "@/types/stock";

const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,20}$/;

type DraftStatus =
  | "idle"
  | "loading"
  | "matched"
  | "needs_choice"
  | "invalid"
  | "no_match"
  | "duplicate_in_batch"
  | "already_in_list"
  | "error"
  | "saved"
  | "save_error";

interface DraftRow {
  id: string;
  input: string;
  normalized: string;
  persistedSymbol: string | null;
  selectedSymbol: string | null;
  selectedSuggestion: SymbolSuggestion | null;
  suggestions: SymbolSuggestion[];
  status: DraftStatus;
  message: string;
  persisted: boolean;
  isPlaceholder: boolean;
}

interface BulkSyncResponse {
  total: number;
  createdOrLinked: number;
  removed: number;
  reordered: number;
}

type SyncRow = Pick<DraftRow, "input" | "selectedSymbol" | "status">;

interface DraftSyncPlan {
  symbols: string[];
  duplicatedRowIds: string[];
}

interface PersistedDraftRow {
  input: string;
  normalized: string;
  persistedSymbol: string | null;
  selectedSymbol: string | null;
  selectedSuggestion: SymbolSuggestion | null;
  suggestions: SymbolSuggestion[];
  status: DraftStatus;
  message: string;
  persisted: boolean;
}

interface RowContextMenuState {
  open: boolean;
  rowId: string | null;
  x: number;
  y: number;
}

const BULK_IMPORT_PREVIEW_LIMIT = 8;
const BULK_IMPORT_MAX_SYMBOLS = 1000;
const DRAFT_STORAGE_PREFIX = "watchlist-validate:draft:";
const AUTO_REFRESH_INTERVAL_MS = 2500;
const AUTO_REFRESH_MAX_ATTEMPTS = 24;

type MatrixLoadSource = "user" | "auto";

function newRowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return value.toFixed(2);
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function getPendingSymbolsFromMatrix(response: MatrixPriceResponse | null): string[] {
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

function mapToDraftRow(item: WatchlistItem): DraftRow {
  return {
    id: newRowId(),
    input: item.symbol,
    normalized: item.symbol,
    persistedSymbol: item.symbol,
    selectedSymbol: item.symbol,
    selectedSuggestion: null,
    suggestions: [],
    status: "saved",
    message: "已在当前清单",
    persisted: true,
    isPlaceholder: false,
  };
}

function buildMatrixQuery(params: {
  listId: string;
  preset: MatrixPreset;
  from?: string;
  to?: string;
  forceRefresh?: boolean;
}): string {
  const query = new URLSearchParams();
  query.set("mode", "watchlist");
  query.set("listId", params.listId);
  query.set("preset", params.preset);
  if (params.preset === "custom") {
    if (!params.from || !params.to) {
      throw new Error("自定义区间必须包含开始和结束日期");
    }
    query.set("from", params.from);
    query.set("to", params.to);
  }
  if (params.forceRefresh) {
    query.set("refresh", "force");
  }
  return query.toString();
}

function isBlockingStatus(status: DraftStatus): boolean {
  return status === "loading"
    || status === "needs_choice"
    || status === "invalid"
    || status === "no_match"
    || status === "error"
    || status === "save_error"
    || status === "idle";
}

export function normalizeDraftSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function parseSymbolsFromExcelInput(raw: string): string[] {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) {
    return [];
  }

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let extracted: string[];

  if (lines.length === 1 && !lines[0]?.includes("\t")) {
    extracted = lines[0]
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  } else {
    extracted = lines
      .map((line) => line.split("\t")[0]?.trim() ?? "")
      .filter(Boolean);
  }

  const normalized = extracted
    .map((item) => normalizeDraftSymbol(item))
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function parseSymbolsFromBulkImportInput(raw: string): string[] {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) {
    return [];
  }

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const extracted = lines.length === 1 && !lines[0]?.includes("\t")
    ? lines[0]
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    : lines
      .map((line) => line.split("\t")[0]?.trim() ?? "")
      .filter(Boolean);

  return extracted
    .map((item) => normalizeDraftSymbol(item))
    .filter(Boolean);
}

export function validateRowsBeforeSync(rows: SyncRow[]): {
  ok: boolean;
  message: string | null;
  symbols: string[];
} {
  const symbols: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const normalized = normalizeDraftSymbol(row.input);
    if (!normalized) {
      continue;
    }

    if (!row.selectedSymbol || isBlockingStatus(row.status)) {
      return {
        ok: false,
        message: `代码 ${normalized} 尚未确认，请先完成校验或候选选择`,
        symbols: [],
      };
    }

    if (seen.has(row.selectedSymbol)) {
      return {
        ok: false,
        message: `存在重复代码：${row.selectedSymbol}`,
        symbols: [],
      };
    }

    seen.add(row.selectedSymbol);
    symbols.push(row.selectedSymbol);
  }

  if (symbols.length === 0) {
    return {
      ok: false,
      message: "没有可保存的代码",
      symbols: [],
    };
  }

  return {
    ok: true,
    message: null,
    symbols,
  };
}

function isEligibleForSync(status: DraftStatus): boolean {
  return status === "matched" || status === "saved" || status === "already_in_list";
}

function isPersistableDraftStatus(status: DraftStatus): boolean {
  return status === "needs_choice"
    || status === "invalid"
    || status === "no_match"
    || status === "error"
    || status === "duplicate_in_batch"
    || status === "save_error";
}

function getDraftStorageKey(listId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${listId}`;
}

function buildDraftSyncPlan(rows: DraftRow[]): DraftSyncPlan {
  const symbols: string[] = [];
  const duplicatedRowIds: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const normalized = normalizeDraftSymbol(row.input);
    if (!normalized) {
      continue;
    }

    let symbolForSync: string | null = null;
    const shouldUseSelected = Boolean(row.selectedSymbol && isEligibleForSync(row.status));
    if (shouldUseSelected) {
      symbolForSync = row.selectedSymbol;
    } else if (row.persistedSymbol) {
      // Keep existing persisted symbol during edit/validation to avoid accidental deletion.
      symbolForSync = row.persistedSymbol;
    }

    if (!symbolForSync) {
      continue;
    }

    if (seen.has(symbolForSync)) {
      const isCandidateRow = !row.persistedSymbol || row.persistedSymbol !== symbolForSync;
      if (isCandidateRow) {
        duplicatedRowIds.push(row.id);
      }
      continue;
    }

    seen.add(symbolForSync);
    symbols.push(symbolForSync);
  }

  return {
    symbols,
    duplicatedRowIds,
  };
}

function toPersistedDraftRows(rows: DraftRow[]): PersistedDraftRow[] {
  return rows
    .filter((row) => {
      const normalized = normalizeDraftSymbol(row.input);
      if (!normalized) {
        return false;
      }
      return isPersistableDraftStatus(row.status);
    })
    .map((row) => ({
      input: row.input,
      normalized: row.normalized,
      persistedSymbol: row.persistedSymbol,
      selectedSymbol: row.selectedSymbol,
      selectedSuggestion: row.selectedSuggestion,
      suggestions: row.suggestions,
      status: row.status,
      message: row.message,
      persisted: false,
    }));
}

function restorePersistedDraftRows(serialized: string | null): DraftRow[] {
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized) as PersistedDraftRow[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item.input === "string")
      .map((item) => ({
        id: newRowId(),
        input: item.input,
        normalized: item.normalized,
        persistedSymbol: item.persistedSymbol ?? null,
        selectedSymbol: item.selectedSymbol,
        selectedSuggestion: item.selectedSuggestion,
        suggestions: Array.isArray(item.suggestions) ? item.suggestions : [],
        status: item.status,
        message: item.message,
        persisted: false,
        isPlaceholder: false,
      }));
  } catch {
    return [];
  }
}

function createEmptyDraftRow(): DraftRow {
  return {
    id: newRowId(),
    input: "",
    normalized: "",
    persistedSymbol: null,
    selectedSymbol: null,
    selectedSuggestion: null,
    suggestions: [],
    status: "idle",
    message: "请输入代码",
    persisted: false,
    isPlaceholder: true,
  };
}

function createInsertedEmptyDraftRow(): DraftRow {
  return {
    id: newRowId(),
    input: "",
    normalized: "",
    persistedSymbol: null,
    selectedSymbol: null,
    selectedSuggestion: null,
    suggestions: [],
    status: "idle",
    message: "请输入代码",
    persisted: false,
    isPlaceholder: false,
  };
}

function withSingleTailPlaceholder(rows: DraftRow[]): DraftRow[] {
  const baseRows = rows.filter((row) => !row.isPlaceholder);
  const tailPlaceholder = rows.find((row) => row.isPlaceholder) ?? createEmptyDraftRow();
  return [...baseRows, tailPlaceholder];
}

export function insertDraftRowAtTarget(
  rows: DraftRow[],
  targetRowId: string,
  position: "before" | "after",
): DraftRow[] {
  const baseRows = rows.filter((row) => !row.isPlaceholder);
  const targetIndex = baseRows.findIndex((row) => row.id === targetRowId);
  const insertAt = targetIndex === -1
    ? baseRows.length
    : (position === "before" ? targetIndex : targetIndex + 1);
  const nextRows = [...baseRows];
  nextRows.splice(insertAt, 0, createInsertedEmptyDraftRow());
  return withSingleTailPlaceholder([...nextRows, ...rows.filter((row) => row.isPlaceholder)]);
}

export function reorderDraftRowsByDrop(
  rows: DraftRow[],
  draggingRowId: string,
  targetRowId: string,
  position: "before" | "after",
): DraftRow[] {
  if (!draggingRowId || !targetRowId || draggingRowId === targetRowId) {
    return rows;
  }

  const baseRows = rows.filter((row) => !row.isPlaceholder);
  const sourceIndex = baseRows.findIndex((row) => row.id === draggingRowId);
  const targetIndex = baseRows.findIndex((row) => row.id === targetRowId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return rows;
  }

  const movingRow = baseRows[sourceIndex];
  if (!movingRow) {
    return rows;
  }

  const reordered = [...baseRows];
  reordered.splice(sourceIndex, 1);
  let insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  if (sourceIndex < insertIndex) {
    insertIndex -= 1;
  }
  reordered.splice(insertIndex, 0, movingRow);
  return withSingleTailPlaceholder([...reordered, ...rows.filter((row) => row.isPlaceholder)]);
}

function getStatusLabel(status: DraftStatus): string {
  switch (status) {
    case "idle":
      return "待校验";
    case "loading":
      return "校验中";
    case "matched":
      return "可保存";
    case "needs_choice":
      return "需选择";
    case "invalid":
      return "格式错误";
    case "no_match":
      return "无匹配";
    case "duplicate_in_batch":
      return "批内重复";
    case "already_in_list":
      return "已在清单";
    case "error":
      return "校验失败";
    case "saved":
      return "已保存";
    case "save_error":
      return "保存失败";
    default:
      return status;
  }
}

function getStatusClassName(status: DraftStatus): string {
  if (status === "matched" || status === "saved" || status === "already_in_list") {
    return "status-chip success";
  }
  if (status === "loading" || status === "needs_choice") {
    return "status-chip warning";
  }
  if (
    status === "invalid"
    || status === "no_match"
    || status === "error"
    || status === "save_error"
    || status === "duplicate_in_batch"
  ) {
    return "status-chip danger";
  }
  return "status-chip";
}

function pickAutoSuggestion(
  normalized: string,
  suggestions: SymbolSuggestion[],
): SymbolSuggestion | null {
  const exact = suggestions.find((item) => item.symbol === normalized);
  if (exact) {
    return exact;
  }
  if (suggestions.length === 1) {
    return suggestions[0] ?? null;
  }
  return null;
}

function mapImportPreviewRowToDraft(row: ImportPreviewRow): DraftRow {
  const status: DraftStatus = row.status === "invalid_format"
    ? "invalid"
    : row.status;

  return {
    id: newRowId(),
    input: row.normalized,
    normalized: row.normalized,
    persistedSymbol: null,
    selectedSymbol: status === "matched" ? row.resolvedSymbol : null,
    selectedSuggestion: null,
    suggestions: row.candidates,
    status,
    message: row.message,
    persisted: false,
    isPlaceholder: false,
  };
}

export function WatchlistExcelManager() {
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const activeListIdRef = useRef<string | null>(null);

  const [newListName, setNewListName] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([createEmptyDraftRow()]);
  const rowsRef = useRef<DraftRow[]>(rows);

  const [matrixResponse, setMatrixResponse] = useState<MatrixPriceResponse | null>(null);
  const [preset, setPreset] = useState<MatrixPreset>("30");
  const [customFrom, setCustomFrom] = useState(dayjs().subtract(1, "year").format("YYYY-MM-DD"));
  const [customTo, setCustomTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [bulkImportText, setBulkImportText] = useState("");

  const [watchlistsLoading, setWatchlistsLoading] = useState(true);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [deletingList, setDeletingList] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [importPreviewing, setImportPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [autoRefreshAttempts, setAutoRefreshAttempts] = useState(0);
  const [pendingSymbols, setPendingSymbols] = useState<string[]>([]);
  const [autoRefreshTimedOut, setAutoRefreshTimedOut] = useState(false);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);
  const [contextMenu, setContextMenu] = useState<RowContextMenuState>({
    open: false,
    rowId: null,
    x: 0,
    y: 0,
  });

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [activeSuggestRowId, setActiveSuggestRowId] = useState<string | null>(null);

  const syncingRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const suggestDebounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const suggestRequestVersionRef = useRef<Map<string, number>>(new Map());
  const listSymbolSetRef = useRef<Set<string>>(new Set());

  const activeWatchlist = useMemo(
    () => watchlists.find((item) => item.id === activeListId) ?? null,
    [watchlists, activeListId],
  );

  const matrixMap = useMemo(() => {
    const map = new Map<string, MatrixPriceResponse["rows"][number]>();
    for (const row of matrixResponse?.rows ?? []) {
      map.set(row.symbol, row);
    }
    return map;
  }, [matrixResponse]);

  const visibleDateKeys = matrixResponse?.dates ?? [];
  const visibleDateLabels = matrixResponse?.displayDates ?? [];

  const draftSummary = useMemo(() => {
    const summary = {
      total: 0,
      matched: 0,
      needsChoice: 0,
      noMatch: 0,
      invalid: 0,
      duplicated: 0,
    };

    for (const row of rows) {
      if (!normalizeDraftSymbol(row.input)) {
        continue;
      }
      summary.total += 1;
      if (row.status === "matched" || row.status === "saved" || row.status === "already_in_list") {
        summary.matched += 1;
      }
      if (row.status === "needs_choice") {
        summary.needsChoice += 1;
      }
      if (row.status === "no_match") {
        summary.noMatch += 1;
      }
      if (row.status === "invalid") {
        summary.invalid += 1;
      }
      if (row.status === "duplicate_in_batch") {
        summary.duplicated += 1;
      }
    }

    return summary;
  }, [rows]);

  const exportableRowCount = useMemo(
    () => rows.filter((row) => normalizeDraftSymbol(row.input)).length,
    [rows],
  );

  const setRowsAndRef = useCallback((
    next:
      | DraftRow[]
      | ((previous: DraftRow[]) => DraftRow[]),
  ) => {
    const previous = rowsRef.current;
    const resolved = typeof next === "function"
      ? (next as (previous: DraftRow[]) => DraftRow[])(previous)
      : next;
    rowsRef.current = resolved;
    setRows(resolved);
  }, []);

  const closeRowContextMenu = useCallback(() => {
    setContextMenu((previous) => (previous.open
      ? {
        open: false,
        rowId: null,
        x: 0,
        y: 0,
      }
      : previous));
  }, []);

  const openRowContextMenu = useCallback((rowId: string, clientX: number, clientY: number) => {
    const menuWidth = 184;
    const menuHeight = 92;
    const margin = 8;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : clientX + menuWidth;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : clientY + menuHeight;
    const x = Math.max(margin, Math.min(clientX, viewportWidth - menuWidth - margin));
    const y = Math.max(margin, Math.min(clientY, viewportHeight - menuHeight - margin));
    setContextMenu({
      open: true,
      rowId,
      x,
      y,
    });
  }, []);

  const insertDraftRowAround = useCallback((rowId: string, position: "before" | "after") => {
    setRowsAndRef((previous) => insertDraftRowAtTarget(previous, rowId, position));
    closeRowContextMenu();
  }, [closeRowContextMenu, setRowsAndRef]);

  const clearDragState = useCallback(() => {
    setDraggingRowId(null);
    setDropTargetRowId(null);
    setDropPosition(null);
  }, []);

  const handleDragStart = useCallback((event: DragEvent<HTMLButtonElement>, rowId: string) => {
    if (autoSaving || matrixLoading) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", rowId);
    setDraggingRowId(rowId);
    setDropTargetRowId(null);
    setDropPosition(null);
    closeRowContextMenu();
  }, [autoSaving, closeRowContextMenu, matrixLoading]);

  const handleRowDragOver = useCallback((
    event: DragEvent<HTMLTableRowElement>,
    targetRowId: string,
  ) => {
    if (!draggingRowId) {
      return;
    }
    if (targetRowId === draggingRowId) {
      setDropTargetRowId(null);
      setDropPosition(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const nextDropPosition: "before" | "after" =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTargetRowId(targetRowId);
    setDropPosition(nextDropPosition);
  }, [draggingRowId]);

  useEffect(() => {
    activeListIdRef.current = activeListId;
  }, [activeListId]);

  const clearAllSuggestTimers = useCallback(() => {
    for (const timer of suggestDebounceTimersRef.current.values()) {
      clearTimeout(timer);
    }
    suggestDebounceTimersRef.current.clear();
  }, []);

  useEffect(() => () => {
    clearAllSuggestTimers();
  }, [clearAllSuggestTimers]);

  useEffect(() => {
    if (!contextMenu.open) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (!contextMenuRef.current) {
        return;
      }
      if (event.target instanceof Node && contextMenuRef.current.contains(event.target)) {
        return;
      }
      closeRowContextMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRowContextMenu();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeRowContextMenu, contextMenu.open]);

  useEffect(() => {
    if (!contextMenu.open || !tableScrollRef.current) {
      return;
    }

    const container = tableScrollRef.current;
    const handleScroll = () => {
      closeRowContextMenu();
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [closeRowContextMenu, contextMenu.open]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeListId) {
      return;
    }

    const key = getDraftStorageKey(activeListId);
    const persisted = toPersistedDraftRows(rows);
    if (persisted.length === 0) {
      window.sessionStorage.removeItem(key);
      return;
    }

    window.sessionStorage.setItem(key, JSON.stringify(persisted));
  }, [activeListId, rows]);

  const loadWatchlists = useCallback(async (preferredListId?: string | null) => {
    setWatchlistsLoading(true);
    try {
      const response = await fetch("/api/admin/watchlists");
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "加载清单失败");
      }

      const payload = body as WatchlistsResponse;
      const nextLists = payload.lists ?? [];
      setWatchlists(nextLists);

      const nextActiveId =
        (preferredListId && nextLists.some((item) => item.id === preferredListId)
          ? preferredListId
          : null)
        ?? payload.defaultListId
        ?? nextLists[0]?.id
        ?? null;

      setActiveListId(nextActiveId);
      return nextActiveId;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "网络错误");
      setWatchlists([]);
      setActiveListId(null);
      return null;
    } finally {
      setWatchlistsLoading(false);
    }
  }, []);

  const loadDraftRows = useCallback(async (listId: string | null) => {
    if (!listId) {
      listSymbolSetRef.current = new Set();
      setRowsAndRef(withSingleTailPlaceholder([]));
      return;
    }

    const response = await fetch(`/api/admin/watchlists/${encodeURIComponent(listId)}/symbols`);
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? "加载清单成员失败");
    }

    const payload = body as WatchlistMembersResponse;
    const nextRows = payload.items.map(mapToDraftRow);
    listSymbolSetRef.current = new Set(payload.items.map((item) => item.symbol));

    if (typeof window !== "undefined") {
      const persisted = restorePersistedDraftRows(
        window.sessionStorage.getItem(getDraftStorageKey(listId)),
      );
      nextRows.push(...persisted);
    }

    setRowsAndRef(withSingleTailPlaceholder(nextRows));
  }, [setRowsAndRef]);

  const loadMatrix = useCallback(async (
    listId: string,
    nextPreset: MatrixPreset,
    from?: string,
    to?: string,
    source: MatrixLoadSource = "user",
    forceRefresh = false,
  ) => {
    if (source === "user") {
      setMatrixLoading(true);
      setError(null);
      setAutoRefreshing(false);
      setAutoRefreshAttempts(0);
      setAutoRefreshTimedOut(false);
    }

    try {
      const query = buildMatrixQuery({
        listId,
        preset: nextPreset,
        from,
        to,
        forceRefresh,
      });
      const response = await fetch(`/api/prices/matrix?${query}`);
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "加载矩阵数据失败");
      }
      const nextResponse = body as MatrixPriceResponse;
      const nextPendingSymbols = getPendingSymbolsFromMatrix(nextResponse);

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
    } catch (loadError) {
      if (source === "user") {
        setError(loadError instanceof Error ? loadError.message : "加载矩阵数据失败");
      }
    } finally {
      if (source === "user") {
        setMatrixLoading(false);
      }
    }
  }, []);

  const refreshCurrentList = useCallback(async (
    listId: string,
    options?: {
      reloadRows?: boolean;
      presetOverride?: MatrixPreset;
      fromOverride?: string;
      toOverride?: string;
      matrixSource?: MatrixLoadSource;
      matrixForceRefresh?: boolean;
    },
  ) => {
    const nextPreset = options?.presetOverride ?? preset;
    const nextFrom = options?.fromOverride ?? customFrom;
    const nextTo = options?.toOverride ?? customTo;

    if (options?.reloadRows ?? true) {
      await loadDraftRows(listId);
    }

    await loadMatrix(
      listId,
      nextPreset,
      nextPreset === "custom" ? nextFrom : undefined,
      nextPreset === "custom" ? nextTo : undefined,
      options?.matrixSource ?? "user",
      options?.matrixForceRefresh ?? false,
    );
  }, [customFrom, customTo, loadDraftRows, loadMatrix, preset]);

  useEffect(() => {
    const currentListId = activeListIdRef.current;
    if (!currentListId) {
      return;
    }
    if (matrixLoading || autoSaving || importPreviewing) {
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
      const listId = activeListIdRef.current;
      if (!listId) {
        return;
      }
      setAutoRefreshAttempts((previous) => previous + 1);
      void refreshCurrentList(listId, {
        reloadRows: false,
        matrixSource: "auto",
      });
    }, AUTO_REFRESH_INTERVAL_MS);

    return cancel;
  }, [
    autoRefreshAttempts,
    autoRefreshing,
    autoSaving,
    importPreviewing,
    matrixLoading,
    pendingSymbols.length,
    refreshCurrentList,
  ]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const listId = await loadWatchlists();
        if (!listId || cancelled) {
          return;
        }
        await refreshCurrentList(listId, { reloadRows: true, presetOverride: "30" });
      } catch (initError) {
        if (!cancelled) {
          setError(initError instanceof Error ? initError.message : "初始化失败");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadWatchlists, refreshCurrentList]);

  const updateRow = useCallback((rowId: string, updater: (row: DraftRow) => DraftRow) => {
    setRowsAndRef((prev) => prev.map((row) => (row.id === rowId ? updater(row) : row)));
  }, [setRowsAndRef]);

  const clearSuggestTimer = useCallback((rowId: string) => {
    const timer = suggestDebounceTimersRef.current.get(rowId);
    if (timer) {
      clearTimeout(timer);
      suggestDebounceTimersRef.current.delete(rowId);
    }
  }, []);

  const fetchSuggestionsForRow = useCallback(async (rowId: string, normalized: string) => {
    const currentListId = activeListIdRef.current;
    if (!currentListId) {
      return;
    }

    const version = (suggestRequestVersionRef.current.get(rowId) ?? 0) + 1;
    suggestRequestVersionRef.current.set(rowId, version);

    updateRow(rowId, (row) => {
      if (row.normalized !== normalized) {
        return row;
      }
      return {
        ...row,
        status: "loading",
        message: "正在搜索候选代码...",
      };
    });

    try {
      const response = await fetch(
        `/api/admin/watchlists/${encodeURIComponent(currentListId)}/symbols/suggest?q=${encodeURIComponent(normalized)}&limit=8`,
      );
      const body = await response.json();
      if (suggestRequestVersionRef.current.get(rowId) !== version) {
        return;
      }

      if (!response.ok) {
        updateRow(rowId, (row) => {
          if (row.normalized !== normalized) {
            return row;
          }
          return {
            ...row,
            selectedSymbol: null,
            selectedSuggestion: null,
            suggestions: [],
            status: "error",
            message: body.error ?? "搜索服务暂不可用，请稍后重试",
          };
        });
        return;
      }

      const payload = body as SymbolSuggestResponse;
      const suggestions = payload.items ?? [];
      if (suggestions.length === 0) {
        updateRow(rowId, (row) => {
          if (row.normalized !== normalized) {
            return row;
          }
          return {
            ...row,
            selectedSymbol: null,
            selectedSuggestion: null,
            suggestions: [],
            status: "no_match",
            message: "未找到匹配代码，请检查后重试",
          };
        });
        return;
      }

      const autoSuggestion = pickAutoSuggestion(normalized, suggestions);
      if (autoSuggestion) {
        updateRow(rowId, (row) => {
          if (row.normalized !== normalized) {
            return row;
          }
          return {
            ...row,
            input: autoSuggestion.symbol,
            normalized: autoSuggestion.symbol,
            selectedSymbol: autoSuggestion.symbol,
            selectedSuggestion: autoSuggestion,
            suggestions,
            status: "matched",
            message: autoSuggestion.symbol === normalized ? "精确匹配" : "已自动匹配",
          };
        });
        return;
      }

      updateRow(rowId, (row) => {
        if (row.normalized !== normalized) {
          return row;
        }
        return {
          ...row,
          selectedSymbol: null,
          selectedSuggestion: null,
          suggestions,
          status: "needs_choice",
          message: "请从候选中选择后再保存",
        };
      });
    } catch {
      if (suggestRequestVersionRef.current.get(rowId) !== version) {
        return;
      }
      updateRow(rowId, (row) => {
        if (row.normalized !== normalized) {
          return row;
        }
        return {
          ...row,
          selectedSymbol: null,
          selectedSuggestion: null,
          suggestions: [],
          status: "error",
          message: "搜索服务暂不可用，请稍后重试",
        };
      });
    }
  }, [updateRow]);

  const scheduleSuggestionsForRow = useCallback((rowId: string, rawInput: string) => {
    const input = rawInput.toUpperCase();
    const normalized = normalizeDraftSymbol(input);
    clearSuggestTimer(rowId);

    if (!normalized) {
      updateRow(rowId, (row) => ({
        ...row,
        input,
        normalized,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "idle",
        message: "请输入代码",
        persisted: false,
        isPlaceholder: row.isPlaceholder,
      }));
      return;
    }

    if (!SYMBOL_PATTERN.test(normalized)) {
      updateRow(rowId, (row) => ({
        ...row,
        input,
        normalized,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "invalid",
        message: "代码格式不正确",
        persisted: false,
        isPlaceholder: false,
      }));
      return;
    }

    if (normalized.length < 2) {
      updateRow(rowId, (row) => ({
        ...row,
        input,
        normalized,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "idle",
        message: "至少输入 2 个字符以搜索",
        persisted: false,
        isPlaceholder: false,
      }));
      return;
    }

    updateRow(rowId, (row) => ({
      ...row,
      input,
      normalized,
      selectedSymbol: null,
      selectedSuggestion: null,
      status: "loading",
      message: "正在搜索候选代码...",
      persisted: false,
      isPlaceholder: false,
    }));

    const timer = setTimeout(() => {
      void fetchSuggestionsForRow(rowId, normalized);
    }, 300);
    suggestDebounceTimersRef.current.set(rowId, timer);
  }, [clearSuggestTimer, fetchSuggestionsForRow, updateRow]);

  const appendSymbols = useCallback((symbols: string[]) => {
    if (symbols.length === 0) {
      return;
    }

    setRowsAndRef((prev) => {
      const existing = new Set(
        prev
          .map((row) => normalizeDraftSymbol(row.input))
          .filter(Boolean),
      );

      const next = [...prev.filter((row) => !row.isPlaceholder)];
      for (const symbol of symbols) {
        if (existing.has(symbol)) {
          continue;
        }
        existing.add(symbol);
        next.push({
          id: newRowId(),
          input: symbol,
          normalized: symbol,
          persistedSymbol: null,
          selectedSymbol: null,
          selectedSuggestion: null,
          suggestions: [],
          status: "idle",
          message: "待校验",
          persisted: false,
          isPlaceholder: false,
        });
      }

      next.push(createEmptyDraftRow());
      return next;
    });
  }, [setRowsAndRef]);

  const appendPreviewRows = useCallback((previewRows: DraftRow[]) => {
    if (previewRows.length === 0) {
      return;
    }

    setRowsAndRef((prev) => {
      const next = [...prev.filter((row) => !row.isPlaceholder)];
      next.push(...previewRows);
      next.push(createEmptyDraftRow());
      return next;
    });
  }, [setRowsAndRef]);

  const validateRow = useCallback(async (row: DraftRow): Promise<DraftRow> => {
    const normalized = normalizeDraftSymbol(row.input);

    if (!normalized) {
      return {
        ...row,
        normalized: "",
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "idle",
        message: "空行不参与保存",
      };
    }

    if (!SYMBOL_PATTERN.test(normalized)) {
      return {
        ...row,
        normalized,
        isPlaceholder: false,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "invalid",
        message: "代码格式不正确",
      };
    }

    const currentListId = activeListIdRef.current;
    if (!currentListId) {
      return {
        ...row,
        normalized,
        isPlaceholder: false,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "error",
        message: "请先选择清单",
      };
    }

    if (normalized.length < 2) {
      return {
        ...row,
        normalized,
        isPlaceholder: false,
        selectedSymbol: normalized,
        selectedSuggestion: null,
        suggestions: [],
        status: "matched",
        message: "短代码按原值保存",
      };
    }

    try {
      const response = await fetch(
        `/api/admin/watchlists/${encodeURIComponent(currentListId)}/symbols/suggest?q=${encodeURIComponent(normalized)}&limit=8`,
      );
      const body = await response.json();
      if (!response.ok) {
          return {
            ...row,
            normalized,
            isPlaceholder: false,
            selectedSymbol: null,
            selectedSuggestion: null,
            suggestions: [],
            status: "error",
          message: body.error ?? "候选搜索失败",
        };
      }

      const payload = body as SymbolSuggestResponse;
      const suggestions = payload.items ?? [];
      if (suggestions.length === 0) {
          return {
            ...row,
            normalized,
            isPlaceholder: false,
            selectedSymbol: null,
            selectedSuggestion: null,
            suggestions: [],
            status: "no_match",
          message: "未找到匹配代码",
        };
      }

      const autoSuggestion = pickAutoSuggestion(normalized, suggestions);
      if (autoSuggestion) {
        const resolvedSymbol = autoSuggestion.symbol;
        if (
          listSymbolSetRef.current.has(resolvedSymbol)
          && (!row.persisted || row.selectedSymbol !== resolvedSymbol)
        ) {
          return {
            ...row,
            normalized,
            isPlaceholder: false,
            selectedSymbol: null,
            selectedSuggestion: autoSuggestion,
            suggestions,
            status: "already_in_list",
            message: `已在当前清单：${resolvedSymbol}`,
            persisted: false,
          };
        }

        const duplicated = rowsRef.current.some((item) =>
          item.id !== row.id
          && item.selectedSymbol === resolvedSymbol
          && item.status !== "already_in_list"
          && normalizeDraftSymbol(item.input),
        );
        if (duplicated) {
          return {
            ...row,
            normalized,
            isPlaceholder: false,
            selectedSymbol: resolvedSymbol,
            selectedSuggestion: autoSuggestion,
            suggestions,
            status: "duplicate_in_batch",
            message: `批量中重复代码：${resolvedSymbol}`,
            persisted: false,
          };
        }

        return {
          ...row,
          normalized,
          isPlaceholder: false,
          selectedSymbol: resolvedSymbol,
          selectedSuggestion: autoSuggestion,
          suggestions,
          status: "matched",
          message: resolvedSymbol === normalized ? "精确匹配" : "已自动匹配",
          persisted: false,
        };
      }

      return {
        ...row,
        normalized,
        isPlaceholder: false,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions,
        status: "needs_choice",
        message: "请手动选择候选",
      };
    } catch (suggestError) {
      return {
        ...row,
        normalized,
        isPlaceholder: false,
        selectedSymbol: null,
        selectedSuggestion: null,
        suggestions: [],
        status: "error",
        message: suggestError instanceof Error ? suggestError.message : "候选搜索失败",
      };
    }
  }, []);

  const autoSave = useCallback(async () => {
    if (syncingRef.current) {
      return;
    }

    const currentListId = activeListIdRef.current;
    if (!currentListId) {
      return;
    }

    const plan = buildDraftSyncPlan(rowsRef.current);
    if (plan.duplicatedRowIds.length > 0) {
      setRowsAndRef((prev) => prev.map((row) => {
        if (!plan.duplicatedRowIds.includes(row.id)) {
          return row;
        }
        return {
          ...row,
          status: "duplicate_in_batch",
          message: row.selectedSymbol ? `批量中重复代码：${row.selectedSymbol}` : "批量中重复代码",
          persisted: false,
        };
      }));
    }

    if (plan.symbols.length === 0) {
      return;
    }

    syncingRef.current = true;
    setAutoSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/watchlists/${encodeURIComponent(currentListId)}/symbols/bulk-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbols: plan.symbols,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "自动保存失败");
        return;
      }

      const payload = body as BulkSyncResponse;
      setInfo(
        `已自动保存：共 ${payload.total} 条，新增/关联 ${payload.createdOrLinked} 条，移除 ${payload.removed} 条。`,
      );

      if (typeof window !== "undefined") {
        const key = getDraftStorageKey(currentListId);
        const persisted = toPersistedDraftRows(rowsRef.current);
        if (persisted.length === 0) {
          window.sessionStorage.removeItem(key);
        } else {
          window.sessionStorage.setItem(key, JSON.stringify(persisted));
        }
      }

      await refreshCurrentList(currentListId, { reloadRows: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "自动保存失败");
    } finally {
      syncingRef.current = false;
      setAutoSaving(false);
    }
  }, [refreshCurrentList]);

  const handleRowDrop = useCallback(async (
    event: DragEvent<HTMLTableRowElement>,
    targetRowId: string,
  ) => {
    event.preventDefault();
    if (!draggingRowId || !dropPosition) {
      clearDragState();
      return;
    }

    let moved = false;
    setRowsAndRef((previous) => {
      const beforeSignature = previous
        .filter((row) => !row.isPlaceholder)
        .map((row) => row.id)
        .join("|");
      const nextRows = reorderDraftRowsByDrop(previous, draggingRowId, targetRowId, dropPosition);
      const afterSignature = nextRows
        .filter((row) => !row.isPlaceholder)
        .map((row) => row.id)
        .join("|");
      moved = beforeSignature !== afterSignature;
      return nextRows;
    });

    clearDragState();
    if (moved) {
      await autoSave();
    }
  }, [autoSave, clearDragState, draggingRowId, dropPosition, setRowsAndRef]);

  const handleDragEnd = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  const validateAndMaybeSaveRow = useCallback(async (rowId: string) => {
    const source = rowsRef.current.find((row) => row.id === rowId);
    if (!source) {
      return;
    }

    updateRow(rowId, (row) => ({
      ...row,
      status: "loading",
      message: "校验中...",
    }));

    const validated = await validateRow(source);
    updateRow(rowId, () => validated);

    if (
      validated.status === "matched"
      || validated.status === "saved"
      || validated.status === "already_in_list"
    ) {
      await autoSave();
    }
  }, [autoSave, updateRow, validateRow]);

  const handlePickSuggestion = useCallback(async (rowId: string, suggestion: SymbolSuggestion) => {
    clearSuggestTimer(rowId);
    const isAlreadyInList = listSymbolSetRef.current.has(suggestion.symbol);
    updateRow(rowId, (row) => ({
      ...row,
      input: suggestion.symbol,
      normalized: suggestion.symbol,
      selectedSymbol: isAlreadyInList ? null : suggestion.symbol,
      selectedSuggestion: suggestion,
      status: isAlreadyInList ? "already_in_list" : "matched",
      message: isAlreadyInList ? `已在当前清单：${suggestion.symbol}` : "已选择候选",
      persisted: false,
      isPlaceholder: false,
    }));
    setActiveSuggestRowId(null);
    await autoSave();
  }, [autoSave, clearSuggestTimer, updateRow]);

  const handleCreateWatchlist = async () => {
    setCreatingList(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/admin/watchlists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newListName,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "新增清单失败");
      }

      const created = body as WatchlistSummary;
      setNewListName("");
      const nextListId = await loadWatchlists(created.id);
      if (nextListId) {
        await refreshCurrentList(nextListId, { reloadRows: true });
      }
      setInfo("新建清单成功");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "新增清单失败");
    } finally {
      setCreatingList(false);
    }
  };

  const handleDeleteCurrentWatchlist = async () => {
    const listId = activeListIdRef.current;
    const listName = activeWatchlist?.name ?? "";
    if (!listId) {
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `确认删除当前清单「${listName || listId}」吗？\n该清单成员关系会被删除，但历史价格数据会保留。`,
      );
      if (!confirmed) {
        return;
      }
    }

    setDeletingList(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch(`/api/admin/watchlists/${encodeURIComponent(listId)}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "删除清单失败");
      }

      const preferredListId = (body.nextDefaultListId as string | null | undefined) ?? null;
      const nextListId = await loadWatchlists(preferredListId);
      if (nextListId) {
        await refreshCurrentList(nextListId, { reloadRows: true });
      } else {
        listSymbolSetRef.current = new Set();
        setRowsAndRef(withSingleTailPlaceholder([]));
        setMatrixResponse(null);
        setPendingSymbols([]);
        setAutoRefreshing(false);
        setAutoRefreshTimedOut(false);
      }
      setInfo("当前清单已删除");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除清单失败");
    } finally {
      setDeletingList(false);
    }
  };

  const handleSwitchWatchlist = async (listId: string) => {
    clearAllSuggestTimers();
    clearDragState();
    closeRowContextMenu();
    setActiveSuggestRowId(null);
    setBulkImportText("");
    setActiveListId(listId);
    activeListIdRef.current = listId;
    setError(null);
    setInfo(null);
    await refreshCurrentList(listId, { reloadRows: true });
  };

  const handlePresetChange = async (nextPreset: MatrixPreset) => {
    const listId = activeListIdRef.current;
    if (!listId) {
      return;
    }

    setPreset(nextPreset);
    setError(null);

    if (nextPreset === "custom") {
      return;
    }

    await refreshCurrentList(listId, {
      reloadRows: false,
      presetOverride: nextPreset,
    });
  };

  const handleApplyCustomRange = async () => {
    const listId = activeListIdRef.current;
    if (!listId) {
      return;
    }

    setPreset("custom");
    setError(null);

    await refreshCurrentList(listId, {
      reloadRows: false,
      presetOverride: "custom",
      fromOverride: customFrom,
      toOverride: customTo,
    });
  };

  const handleRefresh = async () => {
    const listId = activeListIdRef.current;
    if (!listId) {
      return;
    }

    setError(null);
    await refreshCurrentList(listId, {
      reloadRows: true,
      matrixForceRefresh: true,
    });
  };

  const handleImportPreview = async () => {
    const listId = activeListIdRef.current;
    if (!listId) {
      return;
    }

    const parsedSymbols = parseSymbolsFromBulkImportInput(bulkImportText);
    if (parsedSymbols.length === 0) {
      setError("请先粘贴股票代码");
      return;
    }
    if (parsedSymbols.length > BULK_IMPORT_MAX_SYMBOLS) {
      setError(`单次最多导入 ${BULK_IMPORT_MAX_SYMBOLS} 条代码`);
      return;
    }

    setImportPreviewing(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch(
        `/api/admin/watchlists/${encodeURIComponent(listId)}/symbols/import-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbols: parsedSymbols,
            limit: BULK_IMPORT_PREVIEW_LIMIT,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "批量导入预检失败");
      }

      const payload = body as ImportPreviewResponse;
      const previewRows = payload.items.map(mapImportPreviewRowToDraft);
      appendPreviewRows(previewRows);
      setBulkImportText("");
      setInfo(`已导入草稿 ${previewRows.length} 条，正在自动保存可确认代码...`);
      await autoSave();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "批量导入预检失败");
    } finally {
      setImportPreviewing(false);
    }
  };

  const handleExportExcel = () => {
    if (exportableRowCount === 0) {
      setError("当前没有可导出的股票代码");
      return;
    }

    setExporting(true);
    setError(null);

    try {
      const headers = ["序号", "股票代码", "名称", "地区", "币种", ...visibleDateLabels];
      const bodyRows = rows
        .map((row, index) => {
          const normalized = normalizeDraftSymbol(row.input);
          if (!normalized) {
            return null;
          }

          const symbolForView = row.selectedSymbol ?? normalized;
          const matrixRow = symbolForView ? matrixMap.get(symbolForView) : undefined;
          const displayName = matrixRow?.name ?? row.selectedSuggestion?.name ?? "-";
          const displayRegion = matrixRow?.region ?? row.selectedSuggestion?.region ?? "-";
          const displayCurrency = matrixRow?.currency ?? "-";

          const dateCells = visibleDateKeys.map((dateKey) =>
            formatNumber(matrixRow?.pricesByDate[dateKey]),
          );

          return [
            String(index + 1),
            symbolForView,
            displayName,
            displayRegion,
            displayCurrency,
            ...dateCells,
          ];
        })
        .filter((row): row is string[] => row !== null);

      const csvLines = [headers, ...bodyRows]
        .map((line) => line.map((cell) => escapeCsvCell(cell)).join(","))
        .join("\r\n");

      const content = `\uFEFF${csvLines}`;
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const listName = activeWatchlist?.name ?? "watchlist";
      const presetLabel = preset === "custom" ? `${customFrom}_${customTo}` : `${preset}d`;
      const timeLabel = dayjs().format("YYYYMMDD_HHmmss");
      anchor.href = url;
      anchor.download = `${listName}_${presetLabel}_${timeLabel}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setInfo(`导出成功：${bodyRows.length} 条记录`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="content-section">
      <div className="panel">
        <div className="excel-manager-topbar">
          <div className="excel-top-context">
            {watchlistsLoading ? (
              <p className="subtle">加载清单中...</p>
            ) : (
              <div className="watchlist-tabs">
                {watchlists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    className={`watchlist-tab-button ${activeListId === list.id ? "active" : ""}`}
                    onClick={() => void handleSwitchWatchlist(list.id)}
                    disabled={autoSaving || matrixLoading}
                  >
                    {list.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="excel-list-actions-row">
          <label className="field excel-list-name-field">
            <span>新增清单</span>
            <input
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder="例如 观察清单"
              disabled={autoSaving || matrixLoading}
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleCreateWatchlist()}
            disabled={creatingList || deletingList || autoSaving || matrixLoading}
          >
            {creatingList ? "创建中..." : "新增清单"}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => void handleDeleteCurrentWatchlist()}
            disabled={
              deletingList
              || creatingList
              || autoSaving
              || matrixLoading
              || !activeWatchlist
              || watchlists.length <= 1
            }
            title={watchlists.length <= 1 ? "至少保留一个清单，无法删除" : undefined}
          >
            {deletingList ? "删除中..." : "删除当前清单"}
          </button>
        </div>

        <div className="excel-actions">
          <label className="field excel-import-field">
            <span>批量导入（粘贴 Excel 第一列代码，按顺序导入草稿）</span>
            <textarea
              value={bulkImportText}
              onChange={(event) => setBulkImportText(event.target.value)}
              placeholder={`示例:\nAAPL\nTSLA\n0700.HK`}
              disabled={importPreviewing || autoSaving || matrixLoading}
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleImportPreview()}
            disabled={importPreviewing || autoSaving || matrixLoading}
          >
            {importPreviewing ? "导入校验中..." : "导入并校验"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setRowsAndRef((prev) => {
              const nextRows = [...prev.filter((row) => !row.isPlaceholder), createInsertedEmptyDraftRow()];
              return withSingleTailPlaceholder(nextRows);
            })}
            disabled={autoSaving || matrixLoading}
          >
            新增空行
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleExportExcel}
            disabled={exporting || autoSaving || matrixLoading || exportableRowCount === 0}
          >
            {exporting ? "导出中..." : "导出Excel"}
          </button>

          <button
            type="button"
            className={`preset-button ${preset === "7" ? "active" : ""}`}
            onClick={() => void handlePresetChange("7")}
            disabled={autoSaving || matrixLoading}
          >
            7天
          </button>
          <button
            type="button"
            className={`preset-button ${preset === "30" ? "active" : ""}`}
            onClick={() => void handlePresetChange("30")}
            disabled={autoSaving || matrixLoading}
          >
            30天
          </button>
          <button
            type="button"
            className={`preset-button ${preset === "90" ? "active" : ""}`}
            onClick={() => void handlePresetChange("90")}
            disabled={autoSaving || matrixLoading}
          >
            90天
          </button>
          <button
            type="button"
            className={`preset-button ${preset === "custom" ? "active" : ""}`}
            onClick={() => setPreset("custom")}
            disabled={autoSaving || matrixLoading}
          >
            自定义
          </button>
          <button
            type="button"
            className="preset-button"
            onClick={() => void handleRefresh()}
            disabled={autoSaving || matrixLoading}
          >
            刷新
          </button>
        </div>

        <p className="subtle">
          草稿统计：总数 {draftSummary.total}，可确认 {draftSummary.matched}，需选择 {draftSummary.needsChoice}，
          无匹配 {draftSummary.noMatch}，格式错误 {draftSummary.invalid}，批内重复 {draftSummary.duplicated}
        </p>

        {preset === "custom" ? (
          <div className="custom-range-row">
            <label className="field compact">
              <span>开始日期</span>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                disabled={autoSaving || matrixLoading}
              />
            </label>
            <label className="field compact">
              <span>结束日期</span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                disabled={autoSaving || matrixLoading}
              />
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleApplyCustomRange()}
              disabled={autoSaving || matrixLoading}
            >
              应用区间
            </button>
          </div>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}
        {info ? <p className="subtle">{info}</p> : null}
        {autoRefreshing && pendingSymbols.length > 0 ? (
          <p className="subtle">
            正在抓取 {pendingSymbols.length} 个代码的数据，完成后将自动刷新...
          </p>
        ) : null}
        {autoRefreshTimedOut && pendingSymbols.length > 0 ? (
          <p className="subtle">
            部分代码暂未完成抓取，数据库已有数据已先显示。可点击“刷新”继续重试。
          </p>
        ) : null}

        <div ref={tableScrollRef} className="table-scroll watchlist-excel-scroll">
          <table className="data-table watchlist-excel-table">
            <thead>
              <tr>
                <th className="sticky-cell sticky-index-col">序号</th>
                <th className="sticky-cell sticky-symbol-col">股票代码（可编辑）</th>
                <th>名称</th>
                <th>地区</th>
                <th>币种</th>
                {visibleDateLabels.map((label) => (
                  <th key={`header-${label}`}>{label}</th>
                ))}
                <th className="watchlist-excel-col-status">状态</th>
                <th className="watchlist-excel-col-candidate">候选</th>
                <th className="watchlist-excel-col-message">提示</th>
                <th className="watchlist-excel-col-action">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const normalized = normalizeDraftSymbol(row.input);
                const symbolForView = row.selectedSymbol ?? normalized;
                const matrixRow = symbolForView ? matrixMap.get(symbolForView) : undefined;
                const rowIsDraggable = Boolean(normalized) && !row.isPlaceholder;
                const isDraggingRow = draggingRowId === row.id;
                const isDropTarget = dropTargetRowId === row.id;
                const rowClassName = [
                  isDraggingRow ? "watchlist-row-dragging" : "",
                  isDropTarget && dropPosition === "before" ? "watchlist-row-drop-before" : "",
                  isDropTarget && dropPosition === "after" ? "watchlist-row-drop-after" : "",
                ].filter(Boolean).join(" ");

                const displayName = matrixRow?.name ?? row.selectedSuggestion?.name ?? "-";
                const displayRegion = matrixRow?.region ?? row.selectedSuggestion?.region ?? "-";
                const displayCurrency = matrixRow?.currency ?? "-";

                return (
                  <tr
                    key={row.id}
                    className={rowClassName || undefined}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openRowContextMenu(row.id, event.clientX, event.clientY);
                    }}
                    onDragOver={rowIsDraggable
                      ? (event) => handleRowDragOver(event, row.id)
                      : undefined}
                    onDrop={rowIsDraggable
                      ? (event) => void handleRowDrop(event, row.id)
                      : undefined}
                  >
                    <td className="sticky-cell sticky-index-col">
                      <div className="row-index-wrap">
                        <button
                          type="button"
                          className="row-drag-handle"
                          draggable={rowIsDraggable && !autoSaving && !matrixLoading}
                          onDragStart={(event) => handleDragStart(event, row.id)}
                          onDragEnd={handleDragEnd}
                          disabled={!rowIsDraggable || autoSaving || matrixLoading}
                          aria-label="拖拽调整行顺序"
                          title={rowIsDraggable ? "拖拽调整顺序" : "空行不可拖拽"}
                        >
                          ⋮⋮
                        </button>
                        <span>{index + 1}</span>
                      </div>
                    </td>
                    <td className="sticky-cell sticky-symbol-col">
                      <div className="symbol-field">
                        <input
                          value={row.input}
                          onFocus={() => setActiveSuggestRowId(row.id)}
                          onChange={(event) => {
                            scheduleSuggestionsForRow(row.id, event.target.value);
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              setActiveSuggestRowId((current) => (current === row.id ? null : current));
                            }, 120);
                            void validateAndMaybeSaveRow(row.id);
                          }}
                          onPaste={(event) => {
                            const pasted = event.clipboardData.getData("text");
                            const parsedSymbols = parseSymbolsFromExcelInput(pasted);
                            if (parsedSymbols.length <= 1) {
                              return;
                            }

                            event.preventDefault();
                            const [first, ...rest] = parsedSymbols;
                            scheduleSuggestionsForRow(row.id, first ?? row.input);
                            appendSymbols(rest);
                            setInfo(`已从粘贴追加 ${parsedSymbols.length} 条代码`);
                          }}
                          disabled={autoSaving || matrixLoading}
                          placeholder="输入代码"
                        />
                        {activeSuggestRowId === row.id && row.suggestions.length > 0 ? (
                          <ul className="symbol-suggest-list">
                            {row.suggestions.map((item) => (
                              <li key={`${row.id}-${item.symbol}`}>
                                <button
                                  type="button"
                                  className={`symbol-suggest-item ${row.selectedSymbol === item.symbol ? "selected" : ""}`}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    void handlePickSuggestion(row.id, item);
                                  }}
                                  disabled={autoSaving || matrixLoading}
                                >
                                  <span className="symbol-suggest-main">
                                    {item.symbol}
                                    {item.name ? ` | ${item.name}` : ""}
                                  </span>
                                  <span className="symbol-suggest-meta">
                                    {[item.exchange, item.region].filter(Boolean).join(" / ") || "未知交易所"}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </td>
                    <td>{displayName}</td>
                    <td>{displayRegion}</td>
                    <td>{displayCurrency}</td>
                    {visibleDateKeys.map((dateKey) => (
                      <td key={`${row.id}-${dateKey}`}>
                        {formatNumber(matrixRow?.pricesByDate[dateKey])}
                      </td>
                    ))}
                    <td className="watchlist-excel-col-status">
                      <span className={getStatusClassName(row.status)}>
                        {getStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="watchlist-excel-col-candidate">
                      {row.suggestions.length > 0 ? (
                        <select
                          value={row.selectedSymbol ?? ""}
                          onChange={(event) => {
                            const selected = row.suggestions.find((item) => item.symbol === event.target.value) ?? null;
                            updateRow(row.id, (current) => ({
                              ...current,
                              input: selected?.symbol ?? current.input,
                              normalized: selected?.symbol ?? current.normalized,
                              selectedSymbol: selected && !listSymbolSetRef.current.has(selected.symbol)
                                ? selected.symbol
                                : null,
                              selectedSuggestion: selected,
                              status: selected
                                ? (listSymbolSetRef.current.has(selected.symbol) ? "already_in_list" : "matched")
                                : "needs_choice",
                              message: selected
                                ? (listSymbolSetRef.current.has(selected.symbol)
                                  ? `已在当前清单：${selected.symbol}`
                                  : "已选择候选")
                                : "请手动选择候选",
                              persisted: false,
                              isPlaceholder: false,
                            }));
                            if (selected) {
                              void autoSave();
                            }
                          }}
                          disabled={autoSaving || matrixLoading}
                        >
                          <option value="">请选择候选</option>
                          {row.suggestions.map((item) => (
                            <option key={`${row.id}-${item.symbol}`} value={item.symbol}>
                              {item.symbol}
                              {item.name ? ` | ${item.name}` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="watchlist-excel-col-message">{row.message}</td>
                    <td className="watchlist-excel-col-action">
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => {
                          clearSuggestTimer(row.id);
                          setRowsAndRef((prev) => {
                            const filtered = prev.filter((item) => item.id !== row.id);
                            return withSingleTailPlaceholder(filtered);
                          });
                          void autoSave();
                        }}
                        disabled={autoSaving || matrixLoading}
                      >
                        删除行
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {contextMenu.open && contextMenu.rowId ? (
          <div
            ref={contextMenuRef}
            className="row-context-menu"
            role="menu"
            aria-label="行操作菜单"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
          >
            <button
              type="button"
              className="row-context-menu-item"
              onClick={() => insertDraftRowAround(contextMenu.rowId!, "before")}
            >
              在此行上方插入
            </button>
            <button
              type="button"
              className="row-context-menu-item"
              onClick={() => insertDraftRowAround(contextMenu.rowId!, "after")}
            >
              在此行下方插入
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
