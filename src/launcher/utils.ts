import type { AppEntry, Group, LauncherState, UiSettings } from "./types";
import { guessSystemLanguage } from "./i18n";

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
    language: guessSystemLanguage(),
    cardWidth: 120,
    cardHeight: 96,
    toggleHotkey: "",
    theme: "dark",
    sidebarWidth: 140,
    fontFamily: "maye",
    fontSize: 13,
    cardFontSize: 11,
    cardIconScale: 56,
    dblClickBlankToHide: true,
    alwaysOnTop: true,
    hideOnStartup: false,
    useRelativePath: false,
    enableGroupDragSort: true,
    autoStart: false,
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
  const ids = new Set(toAdd.map((a) => a.id));
  return group.apps.filter((a) => ids.has(a.id));
}

export function addAppsToGroupAt(group: Group, filePaths: string[], insertAt: number): AppEntry[] {
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
  const idx = Math.max(0, Math.min(group.apps.length, Math.floor(insertAt)));
  group.apps.splice(idx, 0, ...toAdd);
  const ids = new Set(toAdd.map((a) => a.id));
  return group.apps.filter((a) => ids.has(a.id));
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
