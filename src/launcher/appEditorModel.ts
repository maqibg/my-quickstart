import { reactive } from "vue";
import type { AppEntry, Group } from "./types";

export type EditorState = {
  open: boolean;
  entryId: string | null;
  name: string;
  path: string;
  args: string;
};

export function createAppEditorModel(opts: {
  getGroupByEntryId: (entryId: string) => Group | undefined;
  hydrateEntryIcons: (entries: AppEntry[]) => Promise<void> | void;
  scheduleSave: () => void;
  onStructureChanged?: () => void;
}) {
  const editor = reactive<EditorState>({
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
    if (!editor.entryId) return;
    const group = opts.getGroupByEntryId(editor.entryId);
    if (!group) return;
    const entry = group.apps.find((a) => a.id === editor.entryId);
    if (!entry) return;
    entry.name = editor.name.trim() || entry.name;
    const nextPath = editor.path.trim() || entry.path;
    if (nextPath !== entry.path) {
      entry.path = nextPath;
      entry.icon = undefined;
      opts.hydrateEntryIcons([entry]);
    } else {
      entry.path = nextPath;
    }
    entry.args = editor.args;
    closeEditor();
    opts.onStructureChanged?.();
    opts.scheduleSave();
  }

  function applyEditorUpdate(payload: {
    name: string;
    path: string;
    args: string;
  }): void {
    editor.name = payload.name;
    editor.path = payload.path;
    editor.args = payload.args;
    saveEditor();
  }

  return { editor, openEditor, closeEditor, applyEditorUpdate };
}
