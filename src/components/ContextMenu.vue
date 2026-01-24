<script setup lang="ts">
export type MenuKind = "blankMain" | "blankSidebar" | "app" | "group";

type Props = {
  open: boolean;
  kind: MenuKind;
  x: number;
  y: number;
};

defineProps<Props>();

const emit = defineEmits<{
  (e: "addApp"): void;
  (e: "addUwpApp"): void;
  (e: "addGroup"): void;
  (e: "openApp"): void;
  (e: "openAppFolder"): void;
  (e: "editApp"): void;
  (e: "removeApp"): void;
  (e: "renameGroup"): void;
  (e: "removeGroup"): void;
  (e: "close"): void;
}>();
</script>

<template>
  <div
    v-if="open"
    class="menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @click.stop
    @contextmenu.prevent
  >
    <template v-if="kind === 'blankMain'">
      <button class="menu__item" type="button" @click="emit('addApp')">Add App</button>
      <button class="menu__item" type="button" @click="emit('addUwpApp')">Add UWP App</button>
    </template>

    <template v-else-if="kind === 'blankSidebar'">
      <button class="menu__item" type="button" @click="emit('addGroup')">Add Group</button>
    </template>

    <template v-else-if="kind === 'app'">
      <button class="menu__item" type="button" @click="emit('openApp')">Open</button>
      <button class="menu__item" type="button" @click="emit('openAppFolder')">
        Open Folder
      </button>
      <button class="menu__item" type="button" @click="emit('editApp')">Edit</button>
      <button class="menu__item menu__item--danger" type="button" @click="emit('removeApp')">
        Remove
      </button>
    </template>

    <template v-else-if="kind === 'group'">
      <button class="menu__item" type="button" @click="emit('renameGroup')">Rename</button>
      <button class="menu__item menu__item--danger" type="button" @click="emit('removeGroup')">
        Remove Group
      </button>
    </template>
  </div>
</template>
