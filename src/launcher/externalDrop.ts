import type { Group } from "./types";
import { addAppsToGroup, normalizeDroppedPaths } from "./utils";

export type ExternalDropTarget = {
  paths: string[];
  groupId: string;
  index?: number;
};

export function computeExternalDropTarget(payload: unknown, activeGroup: Group | undefined): ExternalDropTarget | null {
  const paths = normalizeDroppedPaths(payload);
  if (paths.length === 0) return null;
  if (!activeGroup) return null;

  const pos =
    payload && typeof payload === "object" && "position" in (payload as any)
      ? (payload as any).position
      : undefined;
  const x = typeof pos?.x === "number" ? pos.x : undefined;
  const y = typeof pos?.y === "number" ? pos.y : undefined;
  if (typeof x !== "number" || typeof y !== "number") {
    return { paths, groupId: activeGroup.id, index: undefined };
  }

  const ratio = window.devicePixelRatio || 1;
  const px = ratio > 1 && x > window.innerWidth + 2 ? x / ratio : x;
  const py = ratio > 1 && y > window.innerHeight + 2 ? y / ratio : y;
  const el = document.elementFromPoint(px, py);
  const groupButton = el?.closest?.("[data-group-id]") as HTMLElement | null;
  if (groupButton) {
    const groupId = groupButton.getAttribute("data-group-id");
    if (groupId) return { paths, groupId, index: 0 };
  }

  const cardEl = el?.closest?.("[data-app-id]") as HTMLElement | null;
  if (cardEl) {
    const appId = cardEl.getAttribute("data-app-id");
    if (appId) {
      const idx = activeGroup.apps.findIndex((a) => a.id === appId);
      if (idx >= 0) return { paths, groupId: activeGroup.id, index: idx };
    }
  }

  return { paths, groupId: activeGroup.id, index: activeGroup.apps.length };
}

export function applyExternalDropToGroups(options: {
  groups: Group[];
  activeGroup: Group | undefined;
  payload: unknown;
}): { group: Group; added: ReturnType<typeof addAppsToGroup> } | null {
  const target = computeExternalDropTarget(options.payload, options.activeGroup);
  if (!target) return null;
  const group =
    options.groups.find((g) => g.id === target.groupId) ?? options.activeGroup;
  if (!group) return null;
  const idx = typeof target.index === "number" ? target.index : group.apps.length;
  const added = addAppsToGroup(group, target.paths, idx);
  return { group, added };
}
