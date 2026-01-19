import type { AppEntry, Group, LauncherState, UiSettings } from "./types";

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function getBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || filePath;
}

export function suggestAppName(filePath: string): string {
  const base = getBasename(filePath);
  const dot = base.lastIndexOf(".");
  if (dot > 0) return base.slice(0, dot);
  return base;
}

export function createDefaultState(): LauncherState {
  const settings: UiSettings = {
    cardWidth: 120,
    cardHeight: 96,
    toggleHotkey: "",
  };
  const groups: Group[] = [
    { id: createId(), name: "Group-1", apps: [] },
    { id: createId(), name: "reverse", apps: [] },
    { id: createId(), name: "pentest", apps: [] },
  ];
  return {
    version: 1,
    activeGroupId: groups[0]?.id ?? createId(),
    groups,
    settings,
  };
}

export function normalizeDroppedPaths(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.filter((p): p is string => typeof p === "string");
  }
  if (payload && typeof payload === "object") {
    const maybePaths = (payload as { paths?: unknown }).paths;
    if (Array.isArray(maybePaths)) {
      return maybePaths.filter((p): p is string => typeof p === "string");
    }
  }
  return [];
}

export function addAppsToGroup(group: Group, filePaths: string[]): AppEntry[] {
  const existing = new Set(group.apps.map((a) => a.path));
  const now = Date.now();
  const toAdd: AppEntry[] = [];
  for (const p of filePaths) {
    if (!p || existing.has(p)) continue;
    toAdd.push({
      id: createId(),
      name: suggestAppName(p),
      path: p,
      args: "",
      icon: undefined,
      addedAt: now,
    });
    existing.add(p);
  }
  if (toAdd.length === 0) return [];
  group.apps.unshift(...toAdd);
  return toAdd;
}

export function parseArgs(args: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let escaping = false;

  const push = () => {
    const t = current.trim();
    if (t) result.push(t);
    current = "";
  };

  for (let i = 0; i < args.length; i++) {
    const ch = args[i] ?? "";
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === "\\") {
      escaping = true;
      continue;
    }
    if (ch === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      push();
      continue;
    }
    current += ch;
  }

  push();
  return result;
}
