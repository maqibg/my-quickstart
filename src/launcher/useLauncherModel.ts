import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { createWindowControls } from "./windowControls";

import { loadState, saveState } from "./storage";
import type { AppEntry, Group, LauncherState } from "./types";
import { createAppEditorModel } from "./appEditorModel";
import { createAddAppFlow, isUwpPath, UWP_PREFIX } from "./addAppFlow";
import { createGroupRenameModel } from "./groupRenameModel";
import { createExternalFileDropPreview } from "./externalFileDropPreview";
import { createInternalCardDrag } from "./internalCardDrag";
import { installSearchShortcuts } from "./searchShortcuts";
import { installTauriFileDropListeners } from "./tauriFileDrop";
import { normalizeUiLanguage, setUiLanguage, t } from "./i18n";
import {
  createDefaultState,
  createId,
  parseArgs,
} from "./utils";
import {
  applyLoadedUiSettings,
  clampCardHeight,
  clampCardIconScale,
  clampCardWidth,
  clampCardFontSize,
  clampFontSize,
  clampSidebarWidth,
  computeAppStyle,
  normalizeTheme,
} from "./uiSettings";

export type MenuKind = "blankMain" | "blankSidebar" | "app" | "group";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useLauncherModel() {
  const tauriRuntime = isTauriRuntime();

  const state = reactive<LauncherState>(createDefaultState());
  setUiLanguage(state.settings.language);
  const search = ref("");
  const toast = ref<string | null>(null);
  const hydrated = ref(false);
  const settingsOpen = ref(false);

  let saveTimer: number | null = null;
  let saveErrorShown = false;
  let suppressGroupClickUntil = 0;

  const selectedAppIds = reactive(new Set<string>());
  let lastClickedAppId: string | null = null;

  const activeGroup = computed<Group | undefined>(() =>
    state.groups.find((g) => g.id === state.activeGroupId),
  );

  // Inverted search index for faster search
  const searchIndex = computed(() => {
    const index = new Map<string, Set<string>>();
    for (const group of state.groups) {
      for (const app of group.apps) {
        const nameLower = app.name.toLowerCase();
        const terms = [nameLower, ...nameLower.split(/[\s\-_\.]+/)];
        for (const term of terms) {
          if (!term) continue;
          if (!index.has(term)) index.set(term, new Set());
          index.get(term)!.add(app.id);
        }
      }
    }
    return index;
  });

  // Build app lookup map for O(1) access
  const appById = computed(() => {
    const map = new Map<string, AppEntry>();
    for (const group of state.groups) {
      for (const app of group.apps) {
        map.set(app.id, app);
      }
    }
    return map;
  });

  const filteredApps = computed<AppEntry[]>(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) {
      const group = activeGroup.value;
      return group ? group.apps : [];
    }
    // Use index for prefix/contains matching
    const matchedIds = new Set<string>();
    for (const [term, ids] of searchIndex.value) {
      if (term.includes(q)) {
        for (const id of ids) matchedIds.add(id);
      }
    }
    const matches: AppEntry[] = [];
    for (const id of matchedIds) {
      const app = appById.value.get(id);
      if (app) matches.push(app);
    }
    return matches;
  });
  const isSearching = computed(() => search.value.trim().length > 0);

  watch(isSearching, () => clearSelection());

  const appStyle = computed<Record<string, string>>(() => {
    return computeAppStyle(state.settings);
  });

  function applyLoadedState(loaded: LauncherState): void {
    state.version = loaded.version;
    state.activeGroupId = loaded.activeGroupId;
    state.groups.splice(0, state.groups.length, ...loaded.groups);
    applyLoadedUiSettings(state.settings, loaded.settings);
    setUiLanguage(state.settings.language);
  }

  function showToast(message: string): void {
    toast.value = message;
    window.setTimeout(() => {
      if (toast.value === message) toast.value = null;
    }, 2000);
  }

  const {
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow,
    startWindowDragging,
    setAlwaysOnTop,
  } = createWindowControls({ tauriRuntime, showToast });

  function scheduleSave(): void {
    if (!hydrated.value) return;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      try {
        const plain = JSON.parse(JSON.stringify(state)) as LauncherState;
        saveState(plain).catch((e) => {
          if (saveErrorShown) return;
          saveErrorShown = true;
          showToast(t("error.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
        });
      } catch (e) {
        if (saveErrorShown) return;
        saveErrorShown = true;
        showToast(t("error.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
      }
    }, 500);
  }

  watch(() => state.groups, scheduleSave, { deep: true });
  watch(() => state.settings, scheduleSave, { deep: true });
  watch(() => state.activeGroupId, scheduleSave);
  watch(
    () => state.settings.language,
    (lang) => setUiLanguage(normalizeUiLanguage(lang)),
    { immediate: true },
  );

  const {
    addAppOpen,
    openAddApp,
    closeAddApp,
    pickAndAddDesktopApps,
    addUwpToActiveGroup,
  } = createAddAppFlow({
    tauriRuntime,
    getActiveGroup: () => activeGroup.value,
    showToast,
    hydrateEntryIcons: async (entries) => {
      await hydrateEntryIcons(entries);
    },
    scheduleSave,
    transformPaths: async (paths) => {
      if (!tauriRuntime || !state.settings.useRelativePath) return paths;
      const mapped = await Promise.all(
        paths.map(async (p) => {
          try {
            const v = (await invoke("make_relative_path", { path: p })) as unknown;
            return typeof v === "string" && v.trim() ? v : p;
          } catch {
            return p;
          }
        }),
      );
      return mapped;
    },
  });
  const pickAndAddApps = pickAndAddDesktopApps;

  function setActiveGroup(id: string): void {
    if (internalDrag.shouldSuppressClick()) return;
    if (Date.now() < suppressGroupClickUntil) return;
    state.activeGroupId = id;
    clearSelection();
  }

  function clearSelection(): void {
    selectedAppIds.clear();
    lastClickedAppId = null;
  }

  function onAppClick(ev: MouseEvent, app: AppEntry): void {
    if (internalDrag.shouldSuppressClick()) return;

    if (ev.ctrlKey || ev.metaKey) {
      if (selectedAppIds.has(app.id)) {
        selectedAppIds.delete(app.id);
      } else {
        selectedAppIds.add(app.id);
      }
      lastClickedAppId = app.id;
      return;
    }

    if (ev.shiftKey) {
      const apps = filteredApps.value;
      const lastIdx = lastClickedAppId ? apps.findIndex((a) => a.id === lastClickedAppId) : 0;
      const curIdx = apps.findIndex((a) => a.id === app.id);
      if (curIdx >= 0) {
        const from = Math.min(Math.max(lastIdx, 0), curIdx);
        const to = Math.max(Math.max(lastIdx, 0), curIdx);
        for (let i = from; i <= to; i++) {
          selectedAppIds.add(apps[i]!.id);
        }
      }
      return;
    }

    clearSelection();
    lastClickedAppId = app.id;
    launch(app);
  }

  function addGroup(name?: string): void {
    const nextName =
      name?.trim() ||
      `Group-${state.groups.filter((g) => g.name.startsWith("Group-")).length + 1}`;
    const group: Group = { id: createId(), name: nextName, apps: [] };
    state.groups.push(group);
    state.activeGroupId = group.id;
    scheduleSave();
  }

  const { rename, openRename, closeRename, saveRename } = createGroupRenameModel({
    getGroupById: (id) => state.groups.find((g) => g.id === id),
    scheduleSave,
  });

  function removeGroup(group: Group): void {
    if (state.groups.length <= 1) return;
    const idx = state.groups.findIndex((g) => g.id === group.id);
    if (idx >= 0) state.groups.splice(idx, 1);
    if (state.activeGroupId === group.id) {
      state.activeGroupId = state.groups[0]?.id ?? state.activeGroupId;
    }
    scheduleSave();
  }

  function moveGroupById(groupId: string, toIndex: number): boolean {
    const total = state.groups.length;
    const fromIndex = state.groups.findIndex((g) => g.id === groupId);
    if (fromIndex < 0) return false;
    const [group] = state.groups.splice(fromIndex, 1);
    if (!group) return false;
    const rawTarget = Math.max(0, Math.min(total, Math.floor(toIndex)));
    let insertAt = rawTarget > fromIndex ? rawTarget - 1 : rawTarget;
    insertAt = Math.max(0, Math.min(state.groups.length, insertAt));
    state.groups.splice(insertAt, 0, group);
    return insertAt !== fromIndex;
  }

  async function launch(entry: AppEntry): Promise<void> {
    if (internalDrag.shouldSuppressClick()) return;
    if (!isTauriRuntime()) {
      showToast(t("error.tauriRuntimeRequired"));
      return;
    }
    try {
      if (isUwpPath(entry.path)) {
        const appId = entry.path.slice(UWP_PREFIX.length);
        await invoke("spawn_uwp_app", { appId });
      } else {
        const argText = (entry.args ?? "").trim();
        await invoke("spawn_app", { path: entry.path, args: parseArgs(argText) });
      }
    } catch (e) {
      const details =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : (() => {
                try {
                  return JSON.stringify(e);
                } catch {
                  return String(e);
                }
              })();
      showToast(t("error.openFailed", { error: details || t("error.unknown") }));
    }
  }

  const pendingIcons = new Map<string, Promise<string | null>>();

  async function loadIcon(entry: AppEntry): Promise<void> {
    if (entry.icon || !tauriRuntime) return;

    const lookupPath = isUwpPath(entry.path)
      ? `shell:AppsFolder\\${entry.path.slice(UWP_PREFIX.length)}`
      : entry.path;

    const cacheKey = `${lookupPath}:32`;

    if (pendingIcons.has(cacheKey)) {
      const icon = await pendingIcons.get(cacheKey);
      if (icon) entry.icon = icon;
      return;
    }

    const promise = (async () => {
      try {
        const icon = (await invoke("get_file_icon", {
          path: lookupPath,
          size: 32,
        })) as string | null;
        return icon;
      } catch (e) {
        console.error("Failed to load icon", e);
        return null;
      } finally {
        pendingIcons.delete(cacheKey);
      }
    })();

    pendingIcons.set(cacheKey, promise);
    const icon = await promise;
    if (icon) entry.icon = icon;
  }

  function createIconLoader() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const appId = (entry.target as HTMLElement).dataset.appId;
            if (appId) {
              const found = findAppById(appId);
              if (found?.app) {
                loadIcon(found.app);
                observer.unobserve(entry.target);
              }
            }
          }
        });
      },
      { rootMargin: "50px" },
    );

    return {
      observe: (el: HTMLElement, appId: string) => {
        el.dataset.appId = appId;
        observer.observe(el);
      },
      unobserve: (el: HTMLElement) => {
        observer.unobserve(el);
      },
      disconnect: () => observer.disconnect(),
    };
  }

  async function hydrateEntryIcons(_entries: AppEntry[]): Promise<void> {
    // Now icons are loaded lazily via IntersectionObserver in AppGrid.vue
  }

  const iconLoader = createIconLoader();

  // Remove the automatic watch that hydrates all icons on group change
  // watch(
  //   activeGroup,
  //   (group) => {
  //     if (!group) return;
  //     hydrateEntryIcons(group.apps);
  //   },
  //   { flush: "post" },
  // );

  const menu = reactive<{
    open: boolean;
    kind: MenuKind;
    x: number;
    y: number;
    targetId?: string;
  }>({
    open: false,
    kind: "blankMain",
    x: 0,
    y: 0,
    targetId: undefined,
  });

  function closeMenu(): void {
    menu.open = false;
  }

  function openMenu(kind: MenuKind, ev: MouseEvent, targetId?: string): void {
    ev.preventDefault();
    menu.open = true;
    menu.kind = kind;
    menu.x = ev.clientX;
    menu.y = ev.clientY;
    menu.targetId = targetId;
  }

  function findAppById(appId?: string): { group: Group; app: AppEntry } | undefined {
    if (!appId) return undefined;
    for (const group of state.groups) {
      const app = group.apps.find((x) => x.id === appId);
      if (app) return { group, app };
    }
    return undefined;
  }

  function getMenuApp(): AppEntry | undefined {
    return findAppById(menu.targetId)?.app;
  }

  function getMenuGroup(): Group | undefined {
    return state.groups.find((x) => x.id === menu.targetId);
  }

  function menuAddApp(): void {
    pickAndAddApps().finally(closeMenu);
  }

  function menuAddUwpApp(): void {
    openAddApp();
    closeMenu();
  }

  function menuAddGroup(): void {
    addGroup();
    closeMenu();
  }

  function menuOpenApp(): void {
    const entry = getMenuApp();
    if (entry) launch(entry);
    closeMenu();
  }

  async function menuOpenAppFolder(): Promise<void> {
    const entry = getMenuApp();
    if (!entry) return;
    if (!tauriRuntime) {
      showToast(t("error.tauriRuntimeRequired"));
      closeMenu();
      return;
    }
    try {
      await invoke("open_app_folder", { path: entry.path });
    } catch (e) {
      showToast(t("error.openFolderFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      closeMenu();
    }
  }

  function menuEditApp(): void {
    const entry = getMenuApp();
    if (entry) openEditor(entry);
    closeMenu();
  }

  function menuRemoveApp(): void {
    const entry = getMenuApp();
    if (entry) removeApp(entry);
    closeMenu();
  }

  function menuRenameGroup(): void {
    const group = getMenuGroup();
    if (group) openRename(group);
    closeMenu();
  }

  function menuRemoveGroup(): void {
    const group = getMenuGroup();
    if (group) removeGroup(group);
    closeMenu();
  }

  function menuMoveToGroup(targetGroupId: string): void {
    const found = findAppById(menu.targetId);
    if (!found) { closeMenu(); return; }
    const target = state.groups.find((g) => g.id === targetGroupId);
    if (!target) { closeMenu(); return; }
    found.group.apps = found.group.apps.filter((a) => a.id !== found.app.id);
    target.apps.push(found.app);
    scheduleSave();
    closeMenu();
  }

  const internalDrag = createInternalCardDrag({
    groups: state.groups,
    getActiveGroup: () => activeGroup.value,
    scheduleSave,
    showToast,
  });
  const externalPreview = createExternalFileDropPreview({
    getActiveGroup: () => activeGroup.value,
  });

  const draggingAppId = computed(() =>
    internalDrag.state.dragging ? internalDrag.state.draggedAppId : null,
  );
  const dropBeforeAppId = computed(() =>
    internalDrag.state.dragging
      ? internalDrag.state.dropBeforeAppId
      : externalPreview.state.dropBeforeAppId,
  );
  const dropEnd = computed(() =>
    internalDrag.state.dragging ? internalDrag.state.dropEnd : externalPreview.state.dropEnd,
  );
  const dropTargetGroupId = computed(() =>
    internalDrag.state.dragging
      ? internalDrag.state.dropGroupId
      : externalPreview.state.dropGroupId,
  );

  let groupSortLongPressTimer: ReturnType<typeof setTimeout> | null = null;

  const groupSort = reactive<{
    pendingId: string | null;
    draggingId: string | null;
    mode: "pointer" | "mouse" | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    overId: string | null;
    dropAfter: boolean;
  }>({
    pendingId: null,
    draggingId: null,
    mode: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    overId: null,
    dropAfter: false,
  });

  function cancelGroupSortLongPress(): void {
    if (groupSortLongPressTimer !== null) {
      clearTimeout(groupSortLongPressTimer);
      groupSortLongPressTimer = null;
    }
  }

  function clearGroupSortState(): void {
    cancelGroupSortLongPress();
    groupSort.pendingId = null;
    groupSort.draggingId = null;
    groupSort.mode = null;
    groupSort.pointerId = null;
    groupSort.overId = null;
    groupSort.dropAfter = false;
  }

  function stopGroupSortTracking(): void {
    window.removeEventListener("pointermove", onGroupSortMove, true);
    window.removeEventListener("pointerup", onGroupSortUp, true);
    window.removeEventListener("pointercancel", onGroupSortCancel, true);
    window.removeEventListener("mousemove", onGroupSortMouseMove, true);
    window.removeEventListener("mouseup", onGroupSortMouseUp, true);
  }

  function updateGroupSortTarget(x: number, y: number): void {
    const el = document.elementFromPoint(x, y);
    const groupEl = el?.closest?.("[data-group-id]") as HTMLElement | null;
    if (groupEl) {
      const id = groupEl.getAttribute("data-group-id");
      if (id) {
        const rect = groupEl.getBoundingClientRect();
        groupSort.overId = id;
        groupSort.dropAfter = y > rect.top + rect.height / 2;
        return;
      }
    }

    const groupsEl = document.querySelector(".sidebar__groups") as HTMLElement | null;
    const rect = groupsEl?.getBoundingClientRect();
    if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      groupSort.overId = null;
      groupSort.dropAfter = true;
      return;
    }

    groupSort.overId = null;
    groupSort.dropAfter = false;
  }

  function onGroupSortMoveCommon(x: number, y: number): boolean {
    if (!groupSort.pendingId) return false;
    if (!groupSort.draggingId) {
      const dx = x - groupSort.startX;
      const dy = y - groupSort.startY;
      if (dx * dx + dy * dy < 9) return false;
      groupSort.draggingId = groupSort.pendingId;
      closeMenu();
    }
    updateGroupSortTarget(x, y);
    return true;
  }

  function onGroupSortMove(ev: PointerEvent): void {
    if (groupSort.mode !== "pointer") return;
    if (groupSort.pointerId !== null && ev.pointerId !== groupSort.pointerId) return;
    if (onGroupSortMoveCommon(ev.clientX, ev.clientY)) {
      ev.preventDefault();
    }
  }

  function onGroupSortReleaseCommon(preventDefault: () => void): void {
    stopGroupSortTracking();
    const draggingId = groupSort.draggingId;
    const wasDragging = !!draggingId;
    if (!draggingId) {
      clearGroupSortState();
      return;
    }

    let toIndex = state.groups.length;
    if (groupSort.overId) {
      const targetIndex = state.groups.findIndex((g) => g.id === groupSort.overId);
      if (targetIndex >= 0) {
        toIndex = targetIndex + (groupSort.dropAfter ? 1 : 0);
      }
    }
    const moved = moveGroupById(draggingId, toIndex);
    clearGroupSortState();
    if (wasDragging) {
      suppressGroupClickUntil = Date.now() + 250;
      preventDefault();
    }
    if (moved) scheduleSave();
  }

  function onGroupSortUp(ev: PointerEvent): void {
    if (groupSort.mode !== "pointer") return;
    if (groupSort.pointerId !== null && ev.pointerId !== groupSort.pointerId) return;
    onGroupSortReleaseCommon(() => ev.preventDefault());
  }

  function onGroupSortCancel(ev: PointerEvent): void {
    if (groupSort.mode !== "pointer") return;
    if (groupSort.pointerId !== null && ev.pointerId !== groupSort.pointerId) return;
    stopGroupSortTracking();
    clearGroupSortState();
  }

  function onGroupSortMouseMove(ev: MouseEvent): void {
    if (groupSort.mode !== "mouse") return;
    if (onGroupSortMoveCommon(ev.clientX, ev.clientY)) {
      ev.preventDefault();
    }
  }

  function onGroupSortMouseUp(ev: MouseEvent): void {
    if (groupSort.mode !== "mouse") return;
    onGroupSortReleaseCommon(() => ev.preventDefault());
  }

  function startGroupSort(options: {
    id: string;
    startX: number;
    startY: number;
    mode: "pointer" | "mouse";
    pointerId?: number | null;
  }): void {
    if (!state.settings.enableGroupDragSort) return;
    if (!state.groups.some((g) => g.id === options.id)) return;
    stopGroupSortTracking();
    groupSort.pendingId = options.id;
    groupSort.draggingId = null;
    groupSort.mode = options.mode;
    groupSort.pointerId = options.mode === "pointer" ? options.pointerId ?? null : null;
    groupSort.startX = options.startX;
    groupSort.startY = options.startY;
    groupSort.overId = options.id;
    groupSort.dropAfter = false;
    if (options.mode === "pointer") {
      window.addEventListener("pointermove", onGroupSortMove, true);
      window.addEventListener("pointerup", onGroupSortUp, true);
      window.addEventListener("pointercancel", onGroupSortCancel, true);
    } else {
      window.addEventListener("mousemove", onGroupSortMouseMove, true);
      window.addEventListener("mouseup", onGroupSortMouseUp, true);
    }
  }

  function onGroupPointerDown(ev: PointerEvent, id: string): void {
    if (!state.settings.enableGroupDragSort) return;
    if (ev.button !== 0) return;
    cancelGroupSortLongPress();
    const startX = ev.clientX;
    const startY = ev.clientY;
    const pointerId = ev.pointerId;

    function onEarlyUp(e: PointerEvent): void {
      if (e.pointerId !== pointerId) return;
      cancelGroupSortLongPress();
      window.removeEventListener("pointerup", onEarlyUp, true);
      window.removeEventListener("pointercancel", onEarlyUp, true);
    }
    window.addEventListener("pointerup", onEarlyUp, true);
    window.addEventListener("pointercancel", onEarlyUp, true);

    groupSortLongPressTimer = setTimeout(() => {
      groupSortLongPressTimer = null;
      window.removeEventListener("pointerup", onEarlyUp, true);
      window.removeEventListener("pointercancel", onEarlyUp, true);
      startGroupSort({ id, startX, startY, mode: "pointer", pointerId });
    }, 500);
  }

  function onGroupMouseDown(ev: MouseEvent, id: string): void {
    if (!state.settings.enableGroupDragSort) return;
    if (ev.button !== 0) return;
    if (groupSort.mode === "pointer" && groupSort.pendingId === id) return;
    if (groupSortLongPressTimer !== null) return;
    cancelGroupSortLongPress();
    const startX = ev.clientX;
    const startY = ev.clientY;

    function onEarlyUp(): void {
      cancelGroupSortLongPress();
      window.removeEventListener("mouseup", onEarlyUp, true);
    }
    window.addEventListener("mouseup", onEarlyUp, true);

    groupSortLongPressTimer = setTimeout(() => {
      groupSortLongPressTimer = null;
      window.removeEventListener("mouseup", onEarlyUp, true);
      startGroupSort({ id, startX, startY, mode: "mouse" });
    }, 500);
  }

  const draggingGroupId = computed(() =>
    state.settings.enableGroupDragSort ? groupSort.draggingId : null,
  );
  const groupDragReadyId = computed(() =>
    state.settings.enableGroupDragSort && groupSort.pendingId && !groupSort.draggingId
      ? groupSort.pendingId
      : null,
  );
  const groupDragOverId = computed(() =>
    state.settings.enableGroupDragSort && !!groupSort.draggingId ? groupSort.overId : null,
  );
  const groupDragOverAfter = computed(() =>
    state.settings.enableGroupDragSort ? groupSort.dropAfter : false,
  );
  const groupDragOverBlankEnd = computed(() =>
    state.settings.enableGroupDragSort &&
    !!groupSort.draggingId &&
    !groupSort.overId &&
    groupSort.dropAfter,
  );

  function removeApp(entry: AppEntry): void {
    const match = findAppById(entry.id);
    if (!match) return;
    const idx = match.group.apps.findIndex((a) => a.id === entry.id);
    if (idx >= 0) match.group.apps.splice(idx, 1);
    scheduleSave();
  }

  function removeSelectedApps(): void {
    if (selectedAppIds.size === 0) return;
    for (const group of state.groups) {
      group.apps = group.apps.filter((a) => !selectedAppIds.has(a.id));
    }
    clearSelection();
    scheduleSave();
  }

  function moveSelectedToGroup(targetGroupId: string): void {
    if (selectedAppIds.size === 0) return;
    const target = state.groups.find((g) => g.id === targetGroupId);
    if (!target) return;
    for (const group of state.groups) {
      const moving = group.apps.filter((a) => selectedAppIds.has(a.id));
      group.apps = group.apps.filter((a) => !selectedAppIds.has(a.id));
      target.apps.push(...moving);
    }
    clearSelection();
    scheduleSave();
  }

  const { editor, openEditor, closeEditor, applyEditorUpdate } =
    createAppEditorModel({
      getGroupByEntryId: (entryId) => findAppById(entryId)?.group,
      hydrateEntryIcons,
      scheduleSave,
    });

  function openSettings(): void {
    settingsOpen.value = true;
  }

  function closeSettings(): void {
    settingsOpen.value = false;
  }

  function clampIconScaleToCurrentCard(): void {
    const width = clampCardWidth(state.settings.cardWidth);
    const height = clampCardHeight(state.settings.cardHeight);
    const iconMax = Math.min(width, height) * 0.82;
    state.settings.cardIconScale = clampCardIconScale(
      state.settings.cardIconScale,
      iconMax,
    );
  }

  function updateCardWidth(value: number): void {
    state.settings.cardWidth = clampCardWidth(value);
    clampIconScaleToCurrentCard();
    scheduleSave();
  }

  function updateCardHeight(value: number): void {
    state.settings.cardHeight = clampCardHeight(value);
    clampIconScaleToCurrentCard();
    scheduleSave();
  }

  function updateTheme(value: string): void {
    state.settings.theme = normalizeTheme(value);
    scheduleSave();
  }

  function updateLanguage(value: string): void {
    state.settings.language = normalizeUiLanguage(value);
    scheduleSave();
  }

  function updateDblClickBlankToHide(value: boolean): void {
    state.settings.dblClickBlankToHide = value;
    scheduleSave();
  }

  function updateAlwaysOnTop(value: boolean): void {
    state.settings.alwaysOnTop = value;
    void setAlwaysOnTop(value);
    scheduleSave();
  }

  function updateUseRelativePath(value: boolean): void {
    state.settings.useRelativePath = value;
    scheduleSave();
  }

  function updateEnableGroupDragSort(value: boolean): void {
    state.settings.enableGroupDragSort = value;
    if (!value) {
      stopGroupSortTracking();
      clearGroupSortState();
    }
    scheduleSave();
  }

  async function updateAutoStart(value: boolean): Promise<void> {
    state.settings.autoStart = value;
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (value) await enable(); else await disable();
    } catch (e) {
      console.error("autostart failed", e);
    }
    scheduleSave();
  }

  function updateHideOnStartup(value: boolean): void {
    state.settings.hideOnStartup = value;
    scheduleSave();
  }

  function onMainBlankDoubleClick(): void {
    if (!state.settings.dblClickBlankToHide) return;
    closeWindow();
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  function shouldAllowEditShortcut(ev: KeyboardEvent): boolean {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false;
    const key = ev.key.toLowerCase();
    return key === "c" || key === "v" || key === "x" || key === "z" || key === "y";
  }

  function onGlobalKeydown(ev: KeyboardEvent): void {
    if (shouldAllowEditShortcut(ev)) return;
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
      const key = ev.key.toLowerCase();
      if (key === "a") {
        if (isEditableTarget(ev.target)) return;
        ev.preventDefault();
        const apps = filteredApps.value;
        for (const app of apps) selectedAppIds.add(app.id);
        return;
      }
      if (key === "f") return;
      if (key === "r" || key === "l" || key === "w" || key === "n" || key === "t") {
        ev.preventDefault();
        return;
      }
      if (key === "s" || key === "p" || key === "o" || key === "u") {
        ev.preventDefault();
        return;
      }
      if (key === "i" || key === "j") {
        ev.preventDefault();
        return;
      }
    }
    if (ev.key === "Escape" && selectedAppIds.size > 0) {
      clearSelection();
      ev.preventDefault();
      return;
    }
    if (ev.key === "Delete" && !isEditableTarget(ev.target) && selectedAppIds.size > 0) {
      removeSelectedApps();
      ev.preventDefault();
      return;
    }
    if (ev.key === "F5" || ev.key === "F12") {
      ev.preventDefault();
      return;
    }
    if (ev.altKey && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
      ev.preventDefault();
      return;
    }
    if (!isEditableTarget(ev.target) && (ev.key === "Backspace" || ev.key === "Delete")) {
      ev.preventDefault();
    }
  }

  function onGlobalContextMenu(ev: MouseEvent): void {
    ev.preventDefault();
  }

  function updateSidebarWidth(value: number): void {
    state.settings.sidebarWidth = clampSidebarWidth(value);
    scheduleSave();
  }

  function updateFontFamily(value: string): void {
    const next = value.trim();
    state.settings.fontFamily = next || "system";
    scheduleSave();
  }

  function updateFontSize(value: number): void {
    state.settings.fontSize = clampFontSize(value);
    scheduleSave();
  }

  function updateCardFontSize(value: number): void {
    state.settings.cardFontSize = clampCardFontSize(value);
    scheduleSave();
  }

  function updateCardIconScale(value: number): void {
    const width = clampCardWidth(state.settings.cardWidth);
    const height = clampCardHeight(state.settings.cardHeight);
    const iconMax = Math.min(width, height) * 0.82;
    state.settings.cardIconScale = clampCardIconScale(value, iconMax);
    scheduleSave();
  }

  async function applyToggleHotkey(value: string): Promise<void> {
    if (!tauriRuntime) {
      showToast(t("error.tauriRuntimeRequired"));
      return;
    }
    const normalized = value.trim().toLowerCase();
    try {
      await invoke("set_toggle_hotkey", { hotkey: normalized });
      state.settings.toggleHotkey = normalized;
      scheduleSave();
      showToast(t("toast.hotkeyUpdated"));
    } catch (e) {
      showToast(t("error.hotkeyFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  let unlistenFns: Array<() => void> = [];
  let uninstallSearchShortcuts: (() => void) | null = null;

  watch(
    () => state.settings.enableGroupDragSort,
    (enabled) => {
      if (!enabled) {
        stopGroupSortTracking();
        clearGroupSortState();
      }
    },
  );

  onMounted(async () => {
    window.addEventListener("contextmenu", onGlobalContextMenu, true);
    window.addEventListener("keydown", onGlobalKeydown, true);
    window.addEventListener("click", closeMenu);
    window.addEventListener("blur", closeMenu);
    uninstallSearchShortcuts = installSearchShortcuts({ search, inputSelector: ".topbar__search" });

    try {
      const loaded = await loadState();
      applyLoadedState(loaded);
    } catch (e) {
      showToast(t("error.loadFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      hydrated.value = true;
    }

    hydrateEntryIcons(activeGroup.value?.apps ?? []);
    void setAlwaysOnTop(state.settings.alwaysOnTop);
    if (state.settings.autoStart) {
      import("@tauri-apps/plugin-autostart").then(({ enable }) => enable()).catch(() => {});
    }

    if (!isTauriRuntime()) return;
    unlistenFns = await installTauriFileDropListeners({
      groups: state.groups,
      getActiveGroup: () => activeGroup.value,
      consumePending: externalPreview.consumePending,
      clearPreview: externalPreview.clear,
      hydrateEntryIcons,
      scheduleSave,
      showToast,
      transformPaths: async (paths) => {
        if (!state.settings.useRelativePath) return paths;
        const mapped = await Promise.all(
          paths.map(async (p) => {
            try {
              const v = (await invoke("make_relative_path", { path: p })) as unknown;
              return typeof v === "string" && v.trim() ? v : p;
            } catch {
              return p;
            }
          }),
        );
        return mapped;
      },
    });
  });

  onUnmounted(() => {
    window.removeEventListener("contextmenu", onGlobalContextMenu, true);
    window.removeEventListener("keydown", onGlobalKeydown, true);
    window.removeEventListener("click", closeMenu);
    window.removeEventListener("blur", closeMenu);
    if (uninstallSearchShortcuts) uninstallSearchShortcuts();
    if (saveTimer) window.clearTimeout(saveTimer);
    internalDrag.stopDrag();
    stopGroupSortTracking();
    clearGroupSortState();
    iconLoader.disconnect();
    for (const unlisten of unlistenFns) unlisten();
    unlistenFns = [];
  });

  return {
    tauriRuntime, state, search, toast,
    settingsOpen, addAppOpen, appStyle, filteredApps, isSearching,
    menu, editor, rename, setActiveGroup, launch,
    selectedAppIds, onAppClick, clearSelection, removeSelectedApps, moveSelectedToGroup,
    openMenu, closeMenu, menuAddApp, menuAddUwpApp, menuAddGroup,
    menuOpenApp, menuOpenAppFolder, menuEditApp, menuRemoveApp, menuMoveToGroup, menuRenameGroup, menuRemoveGroup,
    pickAndAddApps, openAddApp, closeAddApp, addUwpToActiveGroup,
    addGroup, removeGroup,
    minimizeWindow, toggleMaximizeWindow, closeWindow, startWindowDragging,
    closeEditor, applyEditorUpdate, openSettings, closeSettings,
    updateCardWidth, updateCardHeight, updateSidebarWidth, updateFontFamily, updateFontSize,
    updateCardFontSize, updateCardIconScale, updateTheme, updateDblClickBlankToHide,
    updateLanguage, updateAlwaysOnTop, updateHideOnStartup, updateUseRelativePath, updateEnableGroupDragSort, updateAutoStart,
    applyToggleHotkey, onMainBlankDoubleClick,
    openRenameGroup: openRename, closeRenameGroup: closeRename, saveRenameGroup: saveRename,
    draggingAppId, dropBeforeAppId, dropEnd, dropTargetGroupId, draggingGroupId, groupDragReadyId, groupDragOverId,
    groupDragOverAfter, groupDragOverBlankEnd,
    onGroupPointerDown, onGroupMouseDown,
    onMouseDownApp: internalDrag.onMouseDownApp,
    onExternalDragOverBlank: externalPreview.onDragOverBlank,
    onExternalDragOverApp: externalPreview.onDragOverApp,
    onExternalDragOverGroup: externalPreview.onDragOverGroup,
    onExternalDrop: externalPreview.onDrop,
    observeIcon: iconLoader.observe,
    unobserveIcon: iconLoader.unobserve,
  };
}
