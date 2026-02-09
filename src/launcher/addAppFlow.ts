import { ref } from "vue";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { AppEntry, Group } from "./types";
import { t } from "./i18n";
import { addAppsToGroup, createId } from "./utils";

export type UwpAppInfo = { name: string; appId: string };

export const UWP_PREFIX = "uwp:";

export function isUwpPath(path: string): boolean {
  return path.trim().toLowerCase().startsWith(UWP_PREFIX);
}

export function createAddAppFlow(opts: {
  tauriRuntime: boolean;
  getActiveGroup: () => Group | undefined;
  showToast: (message: string) => void;
  hydrateEntryIcons: (entries: AppEntry[]) => Promise<void>;
  scheduleSave: () => void;
  onStructureChanged?: () => void;
  transformPaths?: (paths: string[]) => Promise<string[]>;
}) {
  const open = ref(false);

  function openAddApp(): void {
    open.value = true;
  }

  function closeAddApp(): void {
    open.value = false;
  }

  async function addPathsToActiveGroup(paths: string[]): Promise<void> {
    const group = opts.getActiveGroup();
    if (!group) return;
    const normalized = opts.transformPaths ? await opts.transformPaths(paths) : paths;
    const added = addAppsToGroup(group, normalized);
    if (added.length > 0) {
      opts.showToast(t("toast.addedItems", { count: added.length }));
      opts.hydrateEntryIcons(added);
      opts.onStructureChanged?.();
      opts.scheduleSave();
    }
  }

  async function pickAndAddDesktopApps(): Promise<void> {
    if (!opts.tauriRuntime) {
      opts.showToast(t("error.tauriRuntimeRequired"));
      return;
    }
    const selection = await openDialog({
      multiple: true,
      directory: false,
      title: t("dialog.addApplicationTitle"),
    });
    if (!selection) return;
    const paths = Array.isArray(selection) ? selection : [selection];
    await addPathsToActiveGroup(paths);
  }

  function addUwpToActiveGroup(app: UwpAppInfo): void {
    const group = opts.getActiveGroup();
    if (!group) return;
    const aumid = app.appId.trim();
    const name = app.name.trim();
    if (!aumid || !name) return;
    const uwpPath = `${UWP_PREFIX}${aumid}`;
    if (group.apps.some((x) => x.path === uwpPath)) return;
    const entry: AppEntry = {
      id: createId(),
      name,
      path: uwpPath,
      args: "",
      icon: undefined,
      addedAt: Date.now(),
    };
    group.apps.unshift(entry);
    const added = group.apps.find((x) => x.id === entry.id);
    if (added) opts.hydrateEntryIcons([added]);
    opts.showToast(t("toast.addedItems", { count: 1 }));
    opts.onStructureChanged?.();
    opts.scheduleSave();
  }

  return {
    addAppOpen: open,
    openAddApp,
    closeAddApp,
    pickAndAddDesktopApps,
    addPathsToActiveGroup,
    addUwpToActiveGroup,
  };
}
