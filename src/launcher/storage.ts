import { invoke } from "@tauri-apps/api/core";
import type { AppEntry, Group, LauncherState } from "./types";
import { createDefaultState, createId, suggestAppName } from "./utils";
import {
  clampCardHeight,
  clampCardIconScale,
  clampCardWidth,
  clampCardFontSize,
  clampFontSize,
  clampSidebarWidth,
  normalizeTheme,
} from "./uiSettings";

const LEGACY_STORAGE_KEY = "launcher_state_v1";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function coerceLauncherState(value: unknown): LauncherState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    version?: unknown;
    activeGroupId?: unknown;
    groups?: unknown;
    settings?: unknown;
  };
  if (raw.version !== 1) return null;

  if (!Array.isArray(raw.groups)) return null;
  const groups: Group[] = raw.groups
    .map((g: unknown, idx: number): Group | null => {
      if (!g || typeof g !== "object") return null;
      const groupRaw = g as { id?: unknown; name?: unknown; apps?: unknown };
      const id =
        typeof groupRaw.id === "string" && groupRaw.id.trim()
          ? groupRaw.id
          : createId();
      const name =
        typeof groupRaw.name === "string" && groupRaw.name.trim()
          ? groupRaw.name
          : `Group-${idx + 1}`;
      const appsRaw = Array.isArray(groupRaw.apps) ? groupRaw.apps : [];
      const apps: AppEntry[] = appsRaw
        .map((a: unknown): AppEntry | null => {
          if (!a || typeof a !== "object") return null;
          const appRaw = a as {
            id?: unknown;
            name?: unknown;
            path?: unknown;
            args?: unknown;
            icon?: unknown;
            addedAt?: unknown;
          };
          const path = typeof appRaw.path === "string" ? appRaw.path : "";
          if (!path.trim()) return null;
          const appId =
            typeof appRaw.id === "string" && appRaw.id.trim()
              ? appRaw.id
              : createId();
          const appName =
            typeof appRaw.name === "string" && appRaw.name.trim()
              ? appRaw.name
              : suggestAppName(path);
          const args = typeof appRaw.args === "string" ? appRaw.args : "";
          const icon = typeof appRaw.icon === "string" ? appRaw.icon : undefined;
          const addedAt =
            typeof appRaw.addedAt === "number" && Number.isFinite(appRaw.addedAt)
              ? appRaw.addedAt
              : Date.now();
          return { id: appId, name: appName, path, args, icon, addedAt };
        })
        .filter((x: AppEntry | null): x is AppEntry => x !== null);
      return { id, name, apps };
    })
    .filter((x: Group | null): x is Group => x !== null);
  if (groups.length === 0) return null;

  const defaults = createDefaultState().settings;
  const rawSettings =
    raw.settings && typeof raw.settings === "object"
      ? (raw.settings as Record<string, unknown>)
      : {};
  const settings = { ...defaults };

  if (typeof rawSettings.cardWidth === "number") {
    settings.cardWidth = clampCardWidth(rawSettings.cardWidth);
  }
  if (typeof rawSettings.cardHeight === "number") {
    settings.cardHeight = clampCardHeight(rawSettings.cardHeight);
  }
  if (typeof rawSettings.toggleHotkey === "string") {
    settings.toggleHotkey = rawSettings.toggleHotkey;
  } else if (rawSettings.toggleHotkey === null) {
    settings.toggleHotkey = "";
  }
  settings.theme = normalizeTheme(rawSettings.theme);

  if (typeof rawSettings.sidebarWidth === "number") {
    settings.sidebarWidth = clampSidebarWidth(rawSettings.sidebarWidth);
  }
  if (typeof rawSettings.fontFamily === "string" && rawSettings.fontFamily.trim()) {
    settings.fontFamily = rawSettings.fontFamily.trim();
  }
  if (typeof rawSettings.fontSize === "number") {
    settings.fontSize = clampFontSize(rawSettings.fontSize);
  }
  if (typeof rawSettings.cardFontSize === "number") {
    settings.cardFontSize = clampCardFontSize(rawSettings.cardFontSize);
  }
  if (typeof rawSettings.cardIconScale === "number" && Number.isFinite(rawSettings.cardIconScale)) {
    settings.cardIconScale = clampCardIconScale(rawSettings.cardIconScale, 128);
  }
  if (typeof rawSettings.dblClickBlankToHide === "boolean") {
    settings.dblClickBlankToHide = rawSettings.dblClickBlankToHide;
  }
  if (typeof rawSettings.alwaysOnTop === "boolean") {
    settings.alwaysOnTop = rawSettings.alwaysOnTop;
  }

  const activeGroupId =
    typeof raw.activeGroupId === "string" &&
    groups.some((g) => g.id === raw.activeGroupId)
      ? raw.activeGroupId
      : groups[0]?.id ?? createId();

  return {
    version: 1,
    activeGroupId,
    groups,
    settings,
  };
}

function loadLegacyState(): LauncherState | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return coerceLauncherState(parsed);
  } catch {
    return null;
  }
}

export async function loadState(): Promise<LauncherState> {
  if (!isTauriRuntime()) return createDefaultState();

  const fromDb = (await invoke("load_launcher_state")) as unknown;
  const coerced = coerceLauncherState(fromDb);
  if (coerced) return coerced;

  const legacy = loadLegacyState();
  if (legacy) {
    try {
      await invoke("save_launcher_state", { state: legacy });
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // keep legacy as fallback
    }
    return legacy;
  }

  const initial = createDefaultState();
  if (!fromDb) {
    try {
      await invoke("save_launcher_state", { state: initial });
    } catch {
      // ignore
    }
  }
  return initial;
}

export async function saveState(state: LauncherState): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("save_launcher_state", { state });
}
