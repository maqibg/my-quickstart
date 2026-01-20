<script setup lang="ts">
import TopBar from "./components/TopBar.vue";
import Sidebar from "./components/Sidebar.vue";
import AppGrid from "./components/AppGrid.vue";
import ContextMenu from "./components/ContextMenu.vue";
import AppEditorModal from "./components/AppEditorModal.vue";
import SettingsModal from "./components/SettingsModal.vue";
import AddAppModal from "./components/AddAppModal.vue";
import GroupRenameModal from "./components/GroupRenameModal.vue";
import { useLauncherModel } from "./launcher/useLauncherModel";

const {
  tauriRuntime,
  state,
  search,
  toast,
  settingsOpen,
  addAppOpen,
  appStyle,
  filteredApps,
  draggingAppId,
  dropBeforeAppId,
  dropEnd,
  dropTargetGroupId,
  menu,
  editor,
  rename,
  setActiveGroup,
  launch,
  openMenu,
  closeMenu,
  menuAddApp,
  menuAddUwpApp,
  menuAddGroup,
  menuOpenApp,
  menuEditApp,
  menuRemoveApp,
  menuRenameGroup,
  menuRemoveGroup,
  onMouseDownApp,
  onExternalDragOverBlank,
  onExternalDragOverApp,
  onExternalDragOverGroup,
  onExternalDrop,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  startWindowDragging,
  closeEditor,
  applyEditorUpdate,
  closeAddApp,
  addUwpToActiveGroup,
  closeRenameGroup,
  saveRenameGroup,
  openSettings,
  closeSettings,
  updateCardWidth,
  updateCardHeight,
  updateSidebarWidth,
  updateFontFamily,
  updateFontSize,
  updateCardFontSize,
  updateCardIconScale,
  updateTheme,
  updateDblClickBlankToHide,
  updateAlwaysOnTop,
  applyToggleHotkey,
  onMainBlankDoubleClick,
} = useLauncherModel();

function onSidebarBlank(ev: MouseEvent): void {
  openMenu("blankSidebar", ev);
}

function onSidebarGroup(ev: MouseEvent, id: string): void {
  openMenu("group", ev, id);
}

function onGridBlank(ev: MouseEvent): void {
  openMenu("blankMain", ev);
}

function onGridApp(ev: MouseEvent, id: string): void {
  openMenu("app", ev, id);
}

function onGridBlankDblClick(): void {
  onMainBlankDoubleClick();
}
</script>

<template>
  <div class="app" :style="appStyle" :data-theme="state.settings.theme">
    <TopBar
      title="Quick Launcher"
      v-model="search"
      :tauri-runtime="tauriRuntime"
      @minimize="minimizeWindow()"
      @toggle-maximize="toggleMaximizeWindow()"
      @close="closeWindow()"
      @start-dragging="startWindowDragging"
    />

    <div class="content">
      <Sidebar
        :groups="state.groups"
        :active-group-id="state.activeGroupId"
        :drop-target-group-id="dropTargetGroupId"
        @select-group="setActiveGroup"
        @contextmenu-blank="onSidebarBlank"
        @contextmenu-group="onSidebarGroup"
        @external-drag-over-group="onExternalDragOverGroup"
        @external-drop="onExternalDrop"
        @open-settings="openSettings"
      />

      <AppGrid
        :apps="filteredApps"
        :dragging-app-id="draggingAppId"
        :drop-before-app-id="dropBeforeAppId"
        :drop-end="dropEnd"
        @launch="launch"
        @contextmenu-blank="onGridBlank"
        @contextmenu-app="onGridApp"
        @dblclick-blank="onGridBlankDblClick"
        @mouse-down-app="onMouseDownApp"
        @external-drag-over-blank="onExternalDragOverBlank"
        @external-drag-over-app="onExternalDragOverApp"
        @external-drop="onExternalDrop"
      />
    </div>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>

    <ContextMenu
      :open="menu.open"
      :kind="menu.kind"
      :x="menu.x"
      :y="menu.y"
      @add-app="menuAddApp"
      @add-uwp-app="menuAddUwpApp"
      @add-group="menuAddGroup"
      @open-app="menuOpenApp"
      @edit-app="menuEditApp"
      @remove-app="menuRemoveApp"
      @rename-group="menuRenameGroup"
      @remove-group="menuRemoveGroup"
      @close="closeMenu"
    />

    <AppEditorModal
      :open="editor.open"
      :name="editor.name"
      :path="editor.path"
      :args="editor.args"
      @close="closeEditor"
      @save="applyEditorUpdate"
    />

    <GroupRenameModal
      :open="rename.open"
      :name="rename.name"
      @close="closeRenameGroup"
      @save="saveRenameGroup"
    />

    <SettingsModal
      :open="settingsOpen"
      :card-width="state.settings.cardWidth"
      :card-height="state.settings.cardHeight"
      :toggle-hotkey="state.settings.toggleHotkey"
      :theme="state.settings.theme"
      :sidebar-width="state.settings.sidebarWidth"
      :font-family="state.settings.fontFamily"
      :font-size="state.settings.fontSize"
      :card-font-size="state.settings.cardFontSize"
      :card-icon-scale="state.settings.cardIconScale"
      :dblclick-blank-to-hide="state.settings.dblClickBlankToHide"
      :always-on-top="state.settings.alwaysOnTop"
      @close="closeSettings"
      @update-card-width="updateCardWidth"
      @update-card-height="updateCardHeight"
      @update-theme="updateTheme"
      @update-sidebar-width="updateSidebarWidth"
      @update-font-family="updateFontFamily"
      @update-font-size="updateFontSize"
      @update-card-font-size="updateCardFontSize"
      @update-card-icon-scale="updateCardIconScale"
      @update-dblclick-blank-to-hide="updateDblClickBlankToHide"
      @update-always-on-top="updateAlwaysOnTop"
      @apply-hotkey="applyToggleHotkey"
    />

    <AddAppModal
      :open="addAppOpen"
      :tauri-runtime="tauriRuntime"
      @close="closeAddApp"
      @add-uwp="addUwpToActiveGroup"
    />
  </div>
</template>
