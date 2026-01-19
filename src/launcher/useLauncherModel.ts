import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { createWindowControls } from "./windowControls";

import { loadState, saveState } from "./storage";
import type { AppEntry, Group, LauncherState } from "./types";
import { createAppEditorModel } from "./appEditorModel";
import { createAddAppFlow, isUwpPath, UWP_PREFIX } from "./addAppFlow";
import { createGroupRenameModel } from "./groupRenameModel";
import { installSearchShortcuts } from "./searchShortcuts";
import {
  createDefaultState,
  createId,
  normalizeDroppedPaths,
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
  const search = ref("");
  const dragActive = ref(false);
  const toast = ref<string | null>(null);
  const hydrated = ref(false);
  const settingsOpen = ref(false);

  let saveTimer: number | null = null;
  let saveErrorShown = false;

  const activeGroup = computed<Group | undefined>(() =>
    state.groups.find((g) => g.id === state.activeGroupId),
  );

  const filteredApps = computed<AppEntry[]>(() => {
    const group = activeGroup.value;
    if (!group) return [];
    const q = search.value.trim().toLowerCase();
    if (!q) return group.apps;
    return group.apps.filter((a) => a.name.toLowerCase().includes(q));
  });

  const appStyle = computed<Record<string, string>>(() => {
    return computeAppStyle(state.settings);
  });

  function applyLoadedState(loaded: LauncherState): void {
    state.version = loaded.version;
    state.activeGroupId = loaded.activeGroupId;
    state.groups.splice(0, state.groups.length, ...loaded.groups);
    applyLoadedUiSettings(state.settings, loaded.settings);
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
  } = createWindowControls({ tauriRuntime, showToast });

  function scheduleSave(): void {
    if (!hydrated.value) return;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      const plain = JSON.parse(JSON.stringify(state)) as LauncherState;
      saveState(plain).catch((e) => {
        if (saveErrorShown) return;
        saveErrorShown = true;
        showToast(
          `Save failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
    }, 250);
  }

  watch(state, scheduleSave, { deep: true });

  const {
    addAppOpen,
    openAddApp,
    closeAddApp,
    pickAndAddDesktopApps,
    addPathsToActiveGroup,
    addUwpToActiveGroup,
  } = createAddAppFlow({
    tauriRuntime,
    getActiveGroup: () => activeGroup.value,
    showToast,
    hydrateEntryIcons: async (entries) => {
      await hydrateEntryIcons(entries);
    },
    scheduleSave,
  });
  const pickAndAddApps = pickAndAddDesktopApps;

  function setActiveGroup(id: string): void {
    state.activeGroupId = id;
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

  async function launch(entry: AppEntry): Promise<void> {
    if (!isTauriRuntime()) {
      showToast("This action requires the Tauri runtime");
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
      showToast(
        `Failed to open: ${details || "unknown error"}`,
      );
    }
  }

  async function hydrateEntryIcons(entries: AppEntry[]): Promise<void> {
    if (!tauriRuntime) return;
    if (!hydrated.value) return;
    const pending = entries.filter((e) => !e.icon);
    if (pending.length === 0) return;
    await Promise.allSettled(
      pending.map(async (entry) => {
        const lookupPath = isUwpPath(entry.path)
          ? `shell:AppsFolder\\${entry.path.slice(UWP_PREFIX.length)}`
          : entry.path;
        const icon = (await invoke("get_file_icon", {
          path: lookupPath,
        })) as unknown;
        if (typeof icon === "string" && icon.trim()) {
          entry.icon = icon;
        }
      }),
    );
  }

  watch(
    activeGroup,
    (group) => {
      if (!group) return;
      hydrateEntryIcons(group.apps);
    },
    { flush: "post" },
  );

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

  function getMenuApp(): AppEntry | undefined {
    const group = activeGroup.value;
    if (!group) return undefined;
    return group.apps.find((x) => x.id === menu.targetId);
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

  function removeApp(entry: AppEntry): void {
    const group = activeGroup.value;
    if (!group) return;
    const idx = group.apps.findIndex((a) => a.id === entry.id);
    if (idx >= 0) group.apps.splice(idx, 1);
    scheduleSave();
  }

  const { editor, openEditor, closeEditor, applyEditorUpdate } =
    createAppEditorModel({
      getActiveGroup: () => activeGroup.value,
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

  function updateDblClickBlankToHide(value: boolean): void {
    state.settings.dblClickBlankToHide = value;
    scheduleSave();
  }

  function onMainBlankDoubleClick(): void {
    if (!state.settings.dblClickBlankToHide) return;
    closeWindow();
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
      showToast("This action requires the Tauri runtime");
      return;
    }
    const normalized = value.trim().toLowerCase();
    try {
      await invoke("set_toggle_hotkey", { hotkey: normalized });
      state.settings.toggleHotkey = normalized;
      scheduleSave();
      showToast("Hotkey updated");
    } catch (e) {
      showToast(
        `Hotkey failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  let unlistenFns: UnlistenFn[] = [];
  let uninstallSearchShortcuts: (() => void) | null = null;

  onMounted(async () => {
    window.addEventListener("click", closeMenu);
    window.addEventListener("blur", closeMenu);
    uninstallSearchShortcuts = installSearchShortcuts({
      search,
      inputSelector: ".topbar__search",
    });

    try {
      const loaded = await loadState();
      applyLoadedState(loaded);
    } catch (e) {
      showToast(
        `Load failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      hydrated.value = true;
    }

    hydrateEntryIcons(activeGroup.value?.apps ?? []);

    if (!isTauriRuntime()) return;

    const drop = async (payload: unknown) => {
      dragActive.value = false;
      addPathsToActiveGroup(normalizeDroppedPaths(payload));
    };
    const hover = async () => {
      dragActive.value = true;
    };
    const cancel = async () => {
      dragActive.value = false;
    };

    const listeners: Array<Promise<UnlistenFn>> = [
      listen("tauri://file-drop", (e) => drop(e.payload)),
      listen("tauri://file-drop-hover", () => hover()),
      listen("tauri://file-drop-cancelled", () => cancel()),
      listen("tauri://drag-drop", (e) => drop(e.payload)),
      listen("tauri://drag-enter", () => hover()),
      listen("tauri://drag-leave", () => cancel()),
    ];

    unlistenFns = await Promise.allSettled(listeners).then((results) =>
      results
        .filter((r): r is PromiseFulfilledResult<UnlistenFn> => r.status === "fulfilled")
        .map((r) => r.value),
    );
  });

  onUnmounted(() => {
    window.removeEventListener("click", closeMenu);
    window.removeEventListener("blur", closeMenu);
    if (uninstallSearchShortcuts) uninstallSearchShortcuts();
    if (saveTimer) window.clearTimeout(saveTimer);
    for (const unlisten of unlistenFns) unlisten();
    unlistenFns = [];
  });

  return {
    tauriRuntime, state, search, dragActive, toast,
    settingsOpen, addAppOpen, appStyle, filteredApps,
    menu, editor, rename, setActiveGroup, launch,
    openMenu, closeMenu, menuAddApp, menuAddUwpApp, menuAddGroup,
    menuOpenApp, menuEditApp, menuRemoveApp, menuRenameGroup, menuRemoveGroup,
    pickAndAddApps, openAddApp, closeAddApp, addUwpToActiveGroup,
    addGroup, removeGroup,
    minimizeWindow, toggleMaximizeWindow, closeWindow, startWindowDragging,
    closeEditor, applyEditorUpdate, openSettings, closeSettings,
    updateCardWidth, updateCardHeight, updateSidebarWidth, updateFontFamily, updateFontSize,
    updateCardFontSize, updateCardIconScale, updateTheme, updateDblClickBlankToHide,
    applyToggleHotkey, onMainBlankDoubleClick,
    openRenameGroup: openRename, closeRenameGroup: closeRename, saveRenameGroup: saveRename,
  };
}
