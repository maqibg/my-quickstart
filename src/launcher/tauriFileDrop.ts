import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppEntry, Group } from "./types";
import { computeExternalDropTarget } from "./externalDrop";
import { type PendingExternalTarget } from "./externalFileDropPreview";
import { t } from "./i18n";
import { addAppsToGroup, normalizeDroppedPaths } from "./utils";

export async function installTauriFileDropListeners(opts: {
  groups: Group[];
  getActiveGroup: () => Group | undefined;
  consumePending: () => PendingExternalTarget | null;
  clearPreview: () => void;
  hydrateEntryIcons: (entries: AppEntry[]) => Promise<void>;
  scheduleSave: () => void;
  showToast: (message: string) => void;
  onStructureChanged?: () => void;
  transformPaths?: (paths: string[]) => Promise<string[]>;
}): Promise<UnlistenFn[]> {
  let isProcessing = false;
  const drop = async (payload: unknown) => {
    opts.clearPreview();
    if (isProcessing) return;
    const active = opts.getActiveGroup();
    const paths = normalizeDroppedPaths(payload);
    if (!active || paths.length === 0) return;

    isProcessing = true;
    try {
      const pending = opts.consumePending();
      const fallback = pending ? null : computeExternalDropTarget(payload, active);
      const groupId = pending?.groupId ?? fallback?.groupId ?? active.id;
      const group = opts.groups.find((g) => g.id === groupId) ?? active;
      const idxBase =
        pending?.index ??
        (typeof fallback?.index === "number" ? fallback.index : group.apps.length);
      const normalized = opts.transformPaths ? await opts.transformPaths(paths) : paths;
      const added = addAppsToGroup(group, normalized, idxBase);
      if (added.length > 0) {
        opts.showToast(t("toast.addedItems", { count: added.length }));
        opts.onStructureChanged?.();
        await opts.hydrateEntryIcons(added);
        opts.scheduleSave();
      }
    } finally {
      isProcessing = false;
    }
  };

  const cancel = async () => {
    opts.clearPreview();
  };

  const listeners: Array<Promise<UnlistenFn>> = [
    listen("tauri://file-drop", (e) => drop(e.payload)),
    listen("tauri://file-drop-cancelled", () => cancel()),
    listen("tauri://drag-drop", (e) => drop(e.payload)),
    listen("tauri://drag-leave", () => cancel()),
  ];

  return Promise.allSettled(listeners).then((results) =>
    results
      .filter((r): r is PromiseFulfilledResult<UnlistenFn> => r.status === "fulfilled")
      .map((r) => r.value),
  );
}
