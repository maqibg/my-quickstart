<script setup lang="ts">
import TopBar from "./components/TopBar.vue";
import Sidebar from "./components/Sidebar.vue";
import AppGrid from "./components/AppGrid.vue";
import ContextMenu from "./components/ContextMenu.vue";
import AppEditorModal from "./components/AppEditorModal.vue";
import SettingsModal from "./components/SettingsModal.vue";
import { useLauncherModel } from "./launcher/useLauncherModel";

const {
  tauriRuntime,
  state,
  search,
  dragActive,
  toast,
  settingsOpen,
  appStyle,
  filteredApps,
  menu,
  editor,
  setActiveGroup,
  launch,
  openMenu,
  closeMenu,
  menuAddApp,
  menuAddGroup,
  menuOpenApp,
  menuEditApp,
  menuRemoveApp,
  menuRenameGroup,
  menuRemoveGroup,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  startWindowDragging,
  closeEditor,
  applyEditorUpdate,
  openSettings,
  closeSettings,
  updateCardWidth,
  updateCardHeight,
  applyToggleHotkey,
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
</script>

<template>
  <div class="app" :style="appStyle">
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
        @select-group="setActiveGroup"
        @contextmenu-blank="onSidebarBlank"
        @contextmenu-group="onSidebarGroup"
        @open-settings="openSettings"
      />

      <AppGrid
        :apps="filteredApps"
        @launch="launch"
        @contextmenu-blank="onGridBlank"
        @contextmenu-app="onGridApp"
      />
    </div>

    <div v-if="dragActive" class="dropOverlay">
      <div class="dropOverlay__box">Drop to add</div>
    </div>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>

    <ContextMenu
      :open="menu.open"
      :kind="menu.kind"
      :x="menu.x"
      :y="menu.y"
      @add-app="menuAddApp"
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

    <SettingsModal
      :open="settingsOpen"
      :card-width="state.settings.cardWidth"
      :card-height="state.settings.cardHeight"
      :toggle-hotkey="state.settings.toggleHotkey"
      @close="closeSettings"
      @update-card-width="updateCardWidth"
      @update-card-height="updateCardHeight"
      @apply-hotkey="applyToggleHotkey"
    />
  </div>
</template>
