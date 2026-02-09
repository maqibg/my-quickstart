<script setup lang="ts">
import TopBar from "./components/TopBar.vue";
import Sidebar from "./components/Sidebar.vue";
import AppGrid from "./components/AppGrid.vue";
import ContextMenu from "./components/ContextMenu.vue";
import AppEditorModal from "./components/AppEditorModal.vue";
import SettingsModal from "./components/SettingsModal.vue";
import AddAppModal from "./components/AddAppModal.vue";
import GroupRenameModal from "./components/GroupRenameModal.vue";
import SelectionBar from "./components/SelectionBar.vue";
import { useLauncherModel } from "./launcher/useLauncherModel";
import { t } from "./launcher/i18n";

const {
  tauriRuntime,
  state,
  search,
  toast,
  settingsOpen,
  addAppOpen,
  appStyle,
  filteredApps,
  isSearching,
  draggingAppId,
  dropBeforeAppId,
  dropEnd,
  dropTargetGroupId,
  menu,
  editor,
  rename,
  setActiveGroup,
  launch,
  selectedAppIds,
  onAppClick,
  clearSelection,
  removeSelectedApps,
  moveSelectedToGroup,
  openMenu,
  closeMenu,
  menuAddApp,
  menuAddUwpApp,
  menuAddGroup,
  menuOpenApp,
  menuOpenAppFolder,
  menuEditApp,
  menuRemoveApp,
  menuMoveToGroup,
  menuRenameGroup,
  menuRemoveGroup,
  onMouseDownApp,
  onExternalDragOverBlank,
  onExternalDragOverApp,
      onExternalDragOverGroup,
      onExternalDrop,
      observeIcon,
      unobserveIcon,
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
  updateLanguage,
  updateDblClickBlankToHide,
  updateAlwaysOnTop,
  updateHideOnStartup,
  updateUseRelativePath,
  updateEnableGroupDragSort,
  updateAutoStart,
  applyToggleHotkey,
  onMainBlankDoubleClick,
  draggingGroupId,
  groupDragReadyId,
  groupDragOverId,
  groupDragOverAfter,
  groupDragOverBlankEnd,
  onGroupPointerDown,
  onGroupMouseDown,
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

function onSidebarGroupPointerDown(ev: PointerEvent, id: string): void {
  onGroupPointerDown(ev, id);
}

function onSidebarGroupMouseDown(ev: MouseEvent, id: string): void {
  onGroupMouseDown(ev, id);
}
</script>

<template>
  <div class="app" :style="appStyle" :data-theme="state.settings.theme">
    <TopBar
      :title="t('app.title')"
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
        :group-drag-sort-enabled="state.settings.enableGroupDragSort"
        :group-drag-dragging-id="draggingGroupId"
        :group-drag-ready-id="groupDragReadyId"
        :group-drag-over-id="groupDragOverId"
        :group-drag-over-after="groupDragOverAfter"
        :group-drag-over-blank-end="groupDragOverBlankEnd"
        @select-group="setActiveGroup"
        @contextmenu-blank="onSidebarBlank"
        @contextmenu-group="onSidebarGroup"
        @external-drag-over-group="onExternalDragOverGroup"
        @external-drop="onExternalDrop"
        @group-pointer-down="onSidebarGroupPointerDown"
        @group-mouse-down="onSidebarGroupMouseDown"
        @open-settings="openSettings"
      />

    <AppGrid
      :apps="filteredApps"
      :drag-enabled="!isSearching"
      :dragging-app-id="draggingAppId"
      :drop-before-app-id="dropBeforeAppId"
      :drop-end="dropEnd"
      :selected-ids="selectedAppIds"
      :observe-icon="observeIcon"
      :unobserve-icon="unobserveIcon"
        @launch="launch"
        @app-click="onAppClick"
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

    <SelectionBar
      :count="selectedAppIds.size"
      :groups="state.groups"
      :active-group-id="state.activeGroupId"
      @delete="removeSelectedApps"
      @move-to="moveSelectedToGroup"
      @cancel="clearSelection"
    />

    <ContextMenu
      :open="menu.open"
      :kind="menu.kind"
      :x="menu.x"
      :y="menu.y"
      :groups="state.groups"
      :active-group-id="state.activeGroupId"
      @add-app="menuAddApp"
      @add-uwp-app="menuAddUwpApp"
      @add-group="menuAddGroup"
      @open-app="menuOpenApp"
      @open-app-folder="menuOpenAppFolder"
      @edit-app="menuEditApp"
      @remove-app="menuRemoveApp"
      @move-to-group="menuMoveToGroup"
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
      :language="state.settings.language"
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
      :hide-on-startup="state.settings.hideOnStartup"
      :use-relative-path="state.settings.useRelativePath"
      :enable-group-drag-sort="state.settings.enableGroupDragSort"
      :auto-start="state.settings.autoStart"
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
      @update-language="updateLanguage"
      @update-always-on-top="updateAlwaysOnTop"
      @update-hide-on-startup="updateHideOnStartup"
      @update-use-relative-path="updateUseRelativePath"
      @update-enable-group-drag-sort="updateEnableGroupDragSort"
      @update-auto-start="updateAutoStart"
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
