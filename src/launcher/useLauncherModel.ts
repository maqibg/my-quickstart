import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { createWindowControls } from "./windowControls";

import { loadState, saveState } from "./storage";
import type { AppEntry, Group, LauncherState } from "./types";
import {
  addAppsToGroup,
  createDefaultState,
  createId,
  normalizeDroppedPaths,
  parseArgs,
} from "./utils";

export type MenuKind = "blankMain" | "blankSidebar" | "app" | "group";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
    const width = clamp(state.settings.cardWidth, 90, 260);
    const height = clamp(state.settings.cardHeight, 70, 220);
    const iconBase = Math.min(width, height);
    const icon = Math.round(iconBase * 0.35);
    const iconImg = Math.round(icon * 0.72);
    return {
      "--card-min-width": `${width}px`,
      "--card-height": `${height}px`,
      "--card-icon-size": `${icon}px`,
      "--card-icon-img-size": `${iconImg}px`,
    };
  });

  function applyLoadedState(loaded: LauncherState): void {
    state.version = loaded.version;
    state.activeGroupId = loaded.activeGroupId;
    state.groups.splice(0, state.groups.length, ...loaded.groups);
    state.settings.cardWidth = loaded.settings.cardWidth;
    state.settings.cardHeight = loaded.settings.cardHeight;
    state.settings.toggleHotkey = loaded.settings.toggleHotkey;
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

  function renameGroup(group: Group): void {
    const next = window.prompt("Group name", group.name);
    if (!next) return;
    group.name = next.trim() || group.name;
    scheduleSave();
  }

  function removeGroup(group: Group): void {
    if (state.groups.length <= 1) return;
    const idx = state.groups.findIndex((g) => g.id === group.id);
    if (idx >= 0) state.groups.splice(idx, 1);
    if (state.activeGroupId === group.id) {
      state.activeGroupId = state.groups[0]?.id ?? state.activeGroupId;
    }
    scheduleSave();
  }

  async function pickAndAddApps(): Promise<void> {
    if (!isTauriRuntime()) {
      showToast("This action requires the Tauri runtime");
      return;
    }
    const selection = await openDialog({
      multiple: true,
      directory: false,
      title: "Add application",
    });
    if (!selection) return;
    const paths = Array.isArray(selection) ? selection : [selection];
    addPathsToActiveGroup(paths);
  }

  function addPathsToActiveGroup(paths: string[]): void {
    const group = activeGroup.value;
    if (!group) return;
    const added = addAppsToGroup(group, paths);
    if (added.length > 0) {
      showToast(`Added ${added.length} item(s)`);
      hydrateEntryIcons(added);
      scheduleSave();
    }
  }

  async function launch(entry: AppEntry): Promise<void> {
    if (!isTauriRuntime()) {
      showToast("This action requires the Tauri runtime");
      return;
    }
    try {
      const argText = (entry.args ?? "").trim();
      await invoke("spawn_app", { path: entry.path, args: parseArgs(argText) });
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
        const icon = (await invoke("get_file_icon", {
          path: entry.path,
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
    if (group) renameGroup(group);
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

  const editor = reactive<{
    open: boolean;
    entryId: string | null;
    name: string;
    path: string;
    args: string;
  }>({
    open: false,
    entryId: null,
    name: "",
    path: "",
    args: "",
  });

  function openEditor(entry: AppEntry): void {
    editor.open = true;
    editor.entryId = entry.id;
    editor.name = entry.name;
    editor.path = entry.path;
    editor.args = entry.args ?? "";
  }

  function closeEditor(): void {
    editor.open = false;
    editor.entryId = null;
  }

  function saveEditor(): void {
    const group = activeGroup.value;
    if (!group || !editor.entryId) return;
    const entry = group.apps.find((a) => a.id === editor.entryId);
    if (!entry) return;
    entry.name = editor.name.trim() || entry.name;
    const nextPath = editor.path.trim() || entry.path;
    if (nextPath !== entry.path) {
      entry.path = nextPath;
      entry.icon = undefined;
      hydrateEntryIcons([entry]);
    } else {
      entry.path = nextPath;
    }
    entry.args = editor.args;
    closeEditor();
    scheduleSave();
  }

  function applyEditorUpdate(payload: { name: string; path: string; args: string }): void {
    editor.name = payload.name;
    editor.path = payload.path;
    editor.args = payload.args;
    saveEditor();
  }

  function openSettings(): void {
    settingsOpen.value = true;
  }

  function closeSettings(): void {
    settingsOpen.value = false;
  }

  function updateCardWidth(value: number): void {
    state.settings.cardWidth = clamp(Math.round(value), 90, 260);
    scheduleSave();
  }

  function updateCardHeight(value: number): void {
    state.settings.cardHeight = clamp(Math.round(value), 70, 220);
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

  onMounted(async () => {
    window.addEventListener("click", closeMenu);
    window.addEventListener("blur", closeMenu);

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
    if (saveTimer) window.clearTimeout(saveTimer);
    for (const unlisten of unlistenFns) unlisten();
    unlistenFns = [];
  });

  return {
    tauriRuntime,
    state,
    search,
    dragActive,
    toast,
    settingsOpen,
    appStyle,
    filteredApps,
    menu,
    editor,
    setActiveGroup,
    launch,
    openMenu,
    closeMenu,
    menuAddApp,
    menuAddGroup,
    menuOpenApp,
    menuEditApp,
    menuRemoveApp,
    menuRenameGroup,
    menuRemoveGroup,
    pickAndAddApps,
    addGroup,
    renameGroup,
    removeGroup,
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow,
    startWindowDragging,
    closeEditor,
    applyEditorUpdate,
    openSettings,
    closeSettings,
    updateCardWidth,
    updateCardHeight,
    applyToggleHotkey,
  };
}
