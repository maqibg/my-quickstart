<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";

export type MenuKind = "blankMain" | "blankSidebar" | "app" | "group";

type Props = {
  open: boolean;
  kind: MenuKind;
  x: number;
  y: number;
};

const props = defineProps<Props>();

const menuRef = ref<HTMLDivElement | null>(null);
const position = reactive({ left: 0, top: 0 });

function clampMenuPosition(): void {
  const el = menuRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const padding = 8;
  const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding);
  const maxTop = Math.max(padding, window.innerHeight - rect.height - padding);
  const nextLeft = Math.min(Math.max(position.left, padding), maxLeft);
  const nextTop = Math.min(Math.max(position.top, padding), maxTop);
  if (nextLeft !== position.left || nextTop !== position.top) {
    position.left = nextLeft;
    position.top = nextTop;
  }
}

function syncMenuPosition(): void {
  position.left = props.x;
  position.top = props.y;
  void nextTick(() => {
    if (!props.open) return;
    clampMenuPosition();
  });
}

watch(
  () => [props.open, props.x, props.y, props.kind],
  () => {
    if (!props.open) return;
    syncMenuPosition();
  },
  { immediate: true },
);

function onResize(): void {
  if (!props.open) return;
  clampMenuPosition();
}

onMounted(() => {
  window.addEventListener("resize", onResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
});

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
    ref="menuRef"
    class="menu"
    :style="{ left: `${position.left}px`, top: `${position.top}px` }"
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
