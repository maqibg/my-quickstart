import type { UiSettings } from "./types";
import { resolveFontFamilyCss } from "./fonts";
import { normalizeUiLanguage } from "./i18n";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeTheme(value: unknown): "dark" | "light" {
  return value === "light" ? "light" : "dark";
}

export function clampCardWidth(value: number): number {
  return clamp(Math.round(value), 50, 480);
}

export function clampCardHeight(value: number): number {
  return clamp(Math.round(value), 40, 360);
}

export function clampSidebarWidth(value: number): number {
  return clamp(Math.round(value), 90, 320);
}

export function clampFontSize(value: number): number {
  return clamp(Math.round(value), 10, 22);
}

export function clampCardFontSize(value: number): number {
  return clamp(Math.round(value), 9, 18);
}

export function clampCardIconScale(value: number, max: number): number {
  return clamp(Math.round(value), 16, Math.max(16, Math.round(max)));
}

export function applyLoadedUiSettings(target: UiSettings, loaded: UiSettings): void {
  const maybeLanguage = (loaded as any).language;
  if (typeof maybeLanguage === "string" && maybeLanguage.trim()) {
    target.language = normalizeUiLanguage(maybeLanguage);
  }
  target.cardWidth = clampCardWidth(loaded.cardWidth);
  target.cardHeight = clampCardHeight(loaded.cardHeight);
  target.toggleHotkey = loaded.toggleHotkey ?? "";
  target.theme = normalizeTheme((loaded as any).theme);

  const maybeSidebar = (loaded as any).sidebarWidth;
  if (typeof maybeSidebar === "number") target.sidebarWidth = clampSidebarWidth(maybeSidebar);

  const maybeFontFamily = (loaded as any).fontFamily;
  if (typeof maybeFontFamily === "string" && maybeFontFamily.trim()) {
    target.fontFamily = maybeFontFamily.trim();
  }

  const maybeFontSize = (loaded as any).fontSize;
  if (typeof maybeFontSize === "number") target.fontSize = clampFontSize(maybeFontSize);

  const maybeCardFontSize = (loaded as any).cardFontSize;
  if (typeof maybeCardFontSize === "number") {
    target.cardFontSize = clampCardFontSize(maybeCardFontSize);
  }

  const maybeIconScale = (loaded as any).cardIconScale;
  if (typeof maybeIconScale === "number") target.cardIconScale = Math.round(maybeIconScale);

  const maybeDblClick = (loaded as any).dblClickBlankToHide;
  if (typeof maybeDblClick === "boolean") target.dblClickBlankToHide = maybeDblClick;

  const maybeAlwaysOnTop = (loaded as any).alwaysOnTop;
  if (typeof maybeAlwaysOnTop === "boolean") target.alwaysOnTop = maybeAlwaysOnTop;

  const maybeHideOnStartup = (loaded as any).hideOnStartup;
  if (typeof maybeHideOnStartup === "boolean") target.hideOnStartup = maybeHideOnStartup;

  const maybeRelativePath = (loaded as any).useRelativePath;
  if (typeof maybeRelativePath === "boolean") target.useRelativePath = maybeRelativePath;

  const maybeGroupDragSort = (loaded as any).enableGroupDragSort;
  if (typeof maybeGroupDragSort === "boolean") target.enableGroupDragSort = maybeGroupDragSort;

  const maybeAutoStart = (loaded as any).autoStart;
  if (typeof maybeAutoStart === "boolean") target.autoStart = maybeAutoStart;
}

export function computeAppStyle(settings: UiSettings): Record<string, string> {
  const width = clampCardWidth(settings.cardWidth);
  const height = clampCardHeight(settings.cardHeight);

  const iconMax = Math.min(width, height) * 0.82;
  const icon = clampCardIconScale(settings.cardIconScale, iconMax);
  const iconImg = Math.max(12, Math.round(icon * 0.72));

  return {
    "--card-min-width": `${width}px`,
    "--card-height": `${height}px`,
    "--card-icon-size": `${icon}px`,
    "--card-icon-img-size": `${iconImg}px`,
    "--card-font-size": `${clampCardFontSize(settings.cardFontSize)}px`,
    "--sidebar-width": `${clampSidebarWidth(settings.sidebarWidth)}px`,
    "--font-family": resolveFontFamilyCss(settings.fontFamily),
    "--font-size": `${clampFontSize(settings.fontSize)}px`,
  };
}
