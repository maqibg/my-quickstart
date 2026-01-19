import type { Ref } from "vue";

type Options = {
  search: Ref<string>;
  inputSelector: string;
};

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function installSearchShortcuts(options: Options): () => void {
  const { search, inputSelector } = options;

  const getSearchInput = (): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>(inputSelector);

  const focusSearch = () => {
    const input = getSearchInput();
    if (!input) return;
    input.focus();
    try {
      input.select();
    } catch {
      // ignore
    }
  };

  const onKeydown = (ev: KeyboardEvent) => {
    const key = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && key === "f") {
      ev.preventDefault();
      focusSearch();
      return;
    }
    if (ev.key === "Escape") {
      const active = document.activeElement;
      const searchInput = getSearchInput();
      const shouldClear =
        (searchInput && active === searchInput) ||
        (!isEditableElement(active) && search.value.trim().length > 0);
      if (shouldClear) {
        ev.preventDefault();
        search.value = "";
      }
    }
  };

  window.addEventListener("keydown", onKeydown);
  return () => window.removeEventListener("keydown", onKeydown);
}

