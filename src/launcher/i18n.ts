import { ref } from "vue";
import type { UiLanguage } from "./types";

export function normalizeUiLanguage(value: unknown): UiLanguage {
  if (typeof value !== "string") return "en";
  const raw = value.trim().toLowerCase();
  if (!raw) return "en";
  if (raw === "en" || raw.startsWith("en-")) return "en";
  if (raw === "zh-cn" || raw === "zh" || raw.startsWith("zh-")) return "zh-CN";
  return "en";
}

export function guessSystemLanguage(): UiLanguage {
  if (typeof navigator === "undefined") return "en";
  return normalizeUiLanguage(navigator.language);
}

export const uiLanguage = ref<UiLanguage>(guessSystemLanguage());

type Dictionary = Record<string, string>;

const en: Dictionary = {
  "app.title": "Quick-Launcher",

  "topbar.searchPlaceholder": "Search...",
  "window.minimize": "Minimize",
  "window.maximize": "Maximize",
  "window.close": "Close",

  "sidebar.settings": "Settings",

  "menu.addApp": "Add App",
  "menu.addUwpApp": "Add UWP App",
  "menu.addGroup": "Add Group",
  "menu.open": "Open",
  "menu.openFolder": "Open Folder",
  "menu.edit": "Edit",
  "menu.remove": "Remove",
  "menu.rename": "Rename",
  "menu.removeGroup": "Remove Group",
  "menu.removeSelected": "Remove {count} items",
  "menu.moveTo": "Move to",
  "selection.count": "{count} selected",
  "selection.delete": "Delete",

  "empty.title": "No apps",
  "empty.hint": "Right click to add, or drop files into this window.",

  "editor.title": "Edit App",
  "editor.name": "Name",
  "editor.path": "Path",
  "editor.args": "Args",
  "editor.argsPlaceholder": "--flag \"value with spaces\"",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.close": "Close",

  "rename.title": "Rename Group",
  "rename.groupName": "Group name",

  "settings.title": "Settings",
  "settings.tabs.appearance": "Appearance",
  "settings.tabs.layout": "Layout",
  "settings.tabs.behavior": "Behavior",
  "settings.tabs.hotkey": "Hotkey",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
  "settings.font": "Font",
  "settings.fontSize": "Font size",
  "settings.sidebarWidth": "Sidebar width",
  "settings.cardWidth": "Card width",
  "settings.cardHeight": "Card height",
  "settings.cardFontSize": "Card font size",
  "settings.cardIconSize": "Card icon size",
  "settings.behavior.dblClickBlankToHide": "Double click blank area to hide window",
  "settings.behavior.alwaysOnTop": "Always on top",
  "settings.behavior.hideOnStartup": "Hide window on startup",
  "settings.behavior.useRelativePath": "Use relative paths when adding apps",
  "settings.behavior.enableGroupDragSort": "Enable drag sorting for groups",
  "settings.behavior.autoStart": "Launch at system startup",
  "settings.toggleHotkey": "Toggle hotkey",
  "settings.toggleHotkeyPlaceholder": "e.g. ctrl+alt+space",
  "settings.toggleHotkeyHintPrefix": "Example:",
  "settings.applyHotkey": "Apply Hotkey",

  "addUwp.title": "Add UWP App",
  "addUwp.searchPlaceholder": "Search UWP apps...",
  "addUwp.loading": "Loading...",
  "addUwp.noResults": "No results",
  "error.tauriRuntimeRequired": "This action requires the Tauri runtime",

  "toast.addedItems": "Added {count} item(s)",
  "toast.movedToGroup": "Moved to {group}",
  "toast.hotkeyUpdated": "Hotkey updated",

  "error.saveFailed": "Save failed: {error}",
  "error.loadFailed": "Load failed: {error}",
  "error.hotkeyFailed": "Hotkey failed: {error}",
  "error.openFailed": "Failed to open: {error}",
  "error.openFolderFailed": "Open folder failed: {error}",
  "error.unknown": "unknown error",
  "error.minimizeFailed": "Minimize failed: {error}",
  "error.maximizeFailed": "Toggle maximize failed: {error}",
  "error.closeFailed": "Close failed: {error}",
  "error.dragFailed": "Drag failed: {error}",
  "error.alwaysOnTopFailed": "Always on top failed: {error}",

  "dialog.addApplicationTitle": "Add application",

  "sidebar.validate": "Validate",
  "validate.found": "Found {count} invalid item(s)",
  "validate.allValid": "All items are valid",
  "validate.running": "Validating...",
  "sidebar.invalidGroup": "Invalid ({count})",
};

const zhCN: Dictionary = {
  "app.title": "快速启动器",

  "topbar.searchPlaceholder": "搜索...",
  "window.minimize": "最小化",
  "window.maximize": "最大化",
  "window.close": "关闭",

  "sidebar.settings": "设置",

  "menu.addApp": "添加应用",
  "menu.addUwpApp": "添加 UWP 应用",
  "menu.addGroup": "添加分组",
  "menu.open": "打开",
  "menu.openFolder": "打开文件夹",
  "menu.edit": "编辑",
  "menu.remove": "移除",
  "menu.rename": "重命名",
  "menu.removeGroup": "移除分组",
  "menu.removeSelected": "移除 {count} 项",
  "menu.moveTo": "移动到",
  "selection.count": "已选 {count} 项",
  "selection.delete": "删除",

  "empty.title": "暂无应用",
  "empty.hint": "右键添加，或将文件拖拽到此窗口中。",

  "editor.title": "编辑应用",
  "editor.name": "名称",
  "editor.path": "路径",
  "editor.args": "参数",
  "editor.argsPlaceholder": "--flag \"value with spaces\"",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.close": "关闭",

  "rename.title": "重命名分组",
  "rename.groupName": "分组名称",

  "settings.title": "设置",
  "settings.tabs.appearance": "外观",
  "settings.tabs.layout": "布局",
  "settings.tabs.behavior": "行为",
  "settings.tabs.hotkey": "快捷键",
  "settings.language": "界面语言",
  "settings.theme": "主题",
  "settings.theme.dark": "深色",
  "settings.theme.light": "浅色",
  "settings.font": "字体",
  "settings.fontSize": "字号",
  "settings.sidebarWidth": "侧边栏宽度",
  "settings.cardWidth": "卡片宽度",
  "settings.cardHeight": "卡片高度",
  "settings.cardFontSize": "卡片字号",
  "settings.cardIconSize": "卡片图标大小",
  "settings.behavior.dblClickBlankToHide": "双击空白区域隐藏窗口",
  "settings.behavior.alwaysOnTop": "窗口置顶",
  "settings.behavior.hideOnStartup": "启动时隐藏窗口",
  "settings.behavior.useRelativePath": "添加应用时使用相对路径",
  "settings.behavior.enableGroupDragSort": "允许拖拽排序左侧分组",
  "settings.behavior.autoStart": "开机自启动",
  "settings.toggleHotkey": "呼出快捷键",
  "settings.toggleHotkeyPlaceholder": "例如 ctrl+alt+space",
  "settings.toggleHotkeyHintPrefix": "示例：",
  "settings.applyHotkey": "应用快捷键",

  "addUwp.title": "添加 UWP 应用",
  "addUwp.searchPlaceholder": "搜索 UWP 应用...",
  "addUwp.loading": "加载中...",
  "addUwp.noResults": "无结果",
  "error.tauriRuntimeRequired": "该操作需要 Tauri 运行时",

  "toast.addedItems": "已添加 {count} 个项目",
  "toast.movedToGroup": "已移动到 {group}",
  "toast.hotkeyUpdated": "快捷键已更新",

  "error.saveFailed": "保存失败：{error}",
  "error.loadFailed": "加载失败：{error}",
  "error.hotkeyFailed": "快捷键设置失败：{error}",
  "error.openFailed": "打开失败：{error}",
  "error.openFolderFailed": "打开文件夹失败：{error}",
  "error.unknown": "未知错误",
  "error.minimizeFailed": "最小化失败：{error}",
  "error.maximizeFailed": "最大化切换失败：{error}",
  "error.closeFailed": "关闭失败：{error}",
  "error.dragFailed": "拖动失败：{error}",
  "error.alwaysOnTopFailed": "置顶设置失败：{error}",

  "dialog.addApplicationTitle": "添加应用",

  "sidebar.validate": "校验",
  "validate.found": "发现 {count} 个失效项",
  "validate.allValid": "所有项目均有效",
  "validate.running": "校验中...",
  "sidebar.invalidGroup": "无效 ({count})",
};

const dictionaries: Record<UiLanguage, Dictionary> = {
  en,
  "zh-CN": zhCN,
};

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key: string) => {
    const v = params[key];
    return v === undefined ? m : String(v);
  });
}

export function setUiLanguage(next: UiLanguage): void {
  uiLanguage.value = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
}

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[uiLanguage.value] ?? dictionaries.en;
  const raw = dict[key] ?? dictionaries.en[key] ?? key;
  return interpolate(raw, params);
}
