import { getCurrentWindow } from "@tauri-apps/api/window";

type Options = {
  tauriRuntime: boolean;
  showToast: (message: string) => void;
};

export function createWindowControls(options: Options) {
  const { tauriRuntime, showToast } = options;

  async function minimizeWindow(): Promise<void> {
    if (!tauriRuntime) return;
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      showToast(
        `Minimize failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function toggleMaximizeWindow(): Promise<void> {
    if (!tauriRuntime) return;
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      showToast(
        `Toggle maximize failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function closeWindow(): Promise<void> {
    if (!tauriRuntime) return;
    try {
      await getCurrentWindow().close();
    } catch (e) {
      showToast(
        `Close failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function startWindowDragging(ev: MouseEvent): Promise<void> {
    if (!tauriRuntime) return;
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest("input, button, textarea, select, a")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (e) {
      showToast(
        `Drag failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function setAlwaysOnTop(value: boolean): Promise<void> {
    if (!tauriRuntime) return;
    try {
      await getCurrentWindow().setAlwaysOnTop(value);
    } catch (e) {
      showToast(
        `Always on top failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow,
    startWindowDragging,
    setAlwaysOnTop,
  };
}
