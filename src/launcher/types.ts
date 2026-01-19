export type AppEntry = {
  id: string;
  name: string;
  path: string;
  args?: string;
  icon?: string;
  addedAt: number;
};

export type Group = {
  id: string;
  name: string;
  apps: AppEntry[];
};

export type UiSettings = {
  cardWidth: number;
  cardHeight: number;
  toggleHotkey: string;
};

export type LauncherState = {
  version: 1;
  activeGroupId: string;
  groups: Group[];
  settings: UiSettings;
};
