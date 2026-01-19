import { invoke } from "@tauri-apps/api/core";
import type { LauncherState } from "./types";
import { createDefaultState } from "./utils";

const LEGACY_STORAGE_KEY = "launcher_state_v1";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isValidState(value: unknown): value is LauncherState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<LauncherState>;
  if (v.version !== 1) return false;
  if (typeof v.activeGroupId !== "string") return false;
  if (!Array.isArray(v.groups)) return false;
  return v.groups.every((g) => {
    if (!g || typeof g !== "object") return false;
    const group = g as any;
    if (typeof group.id !== "string") return false;
    if (typeof group.name !== "string") return false;
    if (!Array.isArray(group.apps)) return false;
    return group.apps.every((a: any) => {
      if (!a || typeof a !== "object") return false;
      return (
        typeof a.id === "string" &&
        typeof a.name === "string" &&
        typeof a.path === "string" &&
        (typeof a.args === "undefined" || typeof a.args === "string" || a.args === null) &&
        (typeof a.icon === "undefined" || typeof a.icon === "string" || a.icon === null) &&
        typeof a.addedAt === "number"
      );
    });
  });
}

function loadLegacyState(): LauncherState | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidState(parsed)) return null;
    if (!parsed.groups.some((g) => g.id === parsed.activeGroupId)) {
      parsed.activeGroupId = parsed.groups[0]?.id ?? parsed.activeGroupId;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function loadState(): Promise<LauncherState> {
  if (!isTauriRuntime()) return createDefaultState();

  const fromDb = (await invoke("load_launcher_state")) as unknown;
  if (fromDb && isValidState(fromDb)) return fromDb;

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
