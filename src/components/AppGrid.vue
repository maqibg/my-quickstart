<script setup lang="ts">
import { onUnmounted, reactive } from "vue";
import type { AppEntry } from "../launcher/types";
import { t } from "../launcher/i18n";

type Props = {
  apps: AppEntry[];
  dragEnabled?: boolean;
  draggingAppId?: string | null;
  dropBeforeAppId?: string | null;
  dropEnd?: boolean;
  selectedIds?: Set<string>;
  observeIcon?: (el: HTMLElement, appId: string) => void;
  unobserveIcon?: (el: HTMLElement) => void;
};

const props = defineProps<Props>();

const vLazyIcon = {
  mounted(el: HTMLElement, binding: any) {
    props.observeIcon?.(el, binding.value);
  },
  unmounted(el: HTMLElement) {
    props.unobserveIcon?.(el);
  },
};

const emit = defineEmits<{
  (e: "launch", entry: AppEntry): void;
  (e: "appClick", ev: MouseEvent, entry: AppEntry): void;
  (e: "contextmenuBlank", ev: MouseEvent): void;
  (e: "contextmenuApp", ev: MouseEvent, id: string): void;
  (e: "dblclickBlank"): void;
  (e: "mouseDownApp", ev: MouseEvent, id: string): void;
  (e: "externalDragOverBlank", ev: DragEvent): void;
  (e: "externalDragOverApp", ev: DragEvent, id: string): void;
  (e: "externalDrop", ev: DragEvent): void;
}>();

const ghost = reactive<{
  active: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  app: AppEntry | null;
}>({
  active: false,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0,
  offsetX: 0,
  offsetY: 0,
  app: null,
});

let nextGhostX = 0;
let nextGhostY = 0;
let ghostFrame: number | null = null;

function applyGhostPosition(): void {
  ghost.x = nextGhostX;
  ghost.y = nextGhostY;
  ghostFrame = null;
}

function scheduleGhostPosition(x: number, y: number): void {
  nextGhostX = x;
  nextGhostY = y;
  if (ghostFrame != null) return;
  ghostFrame = window.requestAnimationFrame(applyGhostPosition);
}

function onGhostMove(ev: MouseEvent): void {
  const dx = ev.clientX - ghost.startX;
  const dy = ev.clientY - ghost.startY;
  if (!ghost.active && dx * dx + dy * dy >= 16) ghost.active = true;
  scheduleGhostPosition(ev.clientX, ev.clientY);
}

function onGhostUp(): void {
  if (ghostFrame != null) {
    window.cancelAnimationFrame(ghostFrame);
    ghostFrame = null;
  }
  ghost.active = false;
  ghost.app = null;
  window.removeEventListener("mousemove", onGhostMove, true);
  window.removeEventListener("mouseup", onGhostUp, true);
}

function onMouseDownApp(ev: MouseEvent, id: string): void {
  if (props.dragEnabled === false) return;
  const entry = props.apps.find((a) => a.id === id) ?? null;
  const cardEl = ev.currentTarget instanceof HTMLElement ? ev.currentTarget : null;
  if (cardEl) {
    const rect = cardEl.getBoundingClientRect();
    ghost.offsetX = Math.max(0, ev.clientX - rect.left);
    ghost.offsetY = Math.max(0, ev.clientY - rect.top);
  } else {
    ghost.offsetX = 0;
    ghost.offsetY = 0;
  }
  ghost.startX = ev.clientX;
  ghost.startY = ev.clientY;
  ghost.x = ev.clientX;
  ghost.y = ev.clientY;
  nextGhostX = ev.clientX;
  nextGhostY = ev.clientY;
  ghost.app = entry;
  ghost.active = false;
  window.addEventListener("mousemove", onGhostMove, true);
  window.addEventListener("mouseup", onGhostUp, true);
  emit("mouseDownApp", ev, id);
}

onUnmounted(() => {
  onGhostUp();
});

function onDblClick(ev: MouseEvent): void {
  const target = ev.target as HTMLElement | null;
  if (target?.closest(".card")) return;
  ev.preventDefault();
  window.getSelection()?.removeAllRanges();
  emit("dblclickBlank");
}
</script>

<template>
  <main class="main">
    <div
      class="grid"
      @contextmenu.stop="(e) => emit('contextmenuBlank', e)"
      @dblclick.stop="onDblClick"
      @dragover="(e) => emit('externalDragOverBlank', e)"
      @drop.stop="(e) => emit('externalDrop', e)"
    >
      <div
        v-for="item in props.apps"
        :key="item.id"
        v-lazy-icon="item.id"
        class="card"
        :class="{
          'card--dropBefore': !!props.dropBeforeAppId && item.id === props.dropBeforeAppId,
          'card--sourceDragging': !!props.draggingAppId && item.id === props.draggingAppId,
          'card--selected': !!props.selectedIds?.has(item.id),
        }"
        role="button"
        tabindex="0"
        :data-app-id="item.id"
        @click="(e) => emit('appClick', e, item)"
        @keydown.enter.prevent="emit('launch', item)"
        @keydown.space.prevent="emit('launch', item)"
        @contextmenu.stop="(e) => emit('contextmenuApp', e, item.id)"
        @mousedown.stop="(e) => onMouseDownApp(e, item.id)"
        @dragover="(e) => emit('externalDragOverApp', e, item.id)"
        @drop.stop="(e) => emit('externalDrop', e)"
      >
        <div class="card__icon" :class="{ 'card__icon--img': !!item.icon }" aria-hidden="true">
          <img v-if="item.icon" class="card__iconImg" :src="item.icon" alt="" draggable="false" />
          <template v-else>{{ item.name.slice(0, 1).toUpperCase() }}</template>
        </div>
        <div class="card__name" :title="item.name">{{ item.name }}</div>
      </div>

      <div v-if="props.dropEnd" class="grid__dropEnd" aria-hidden="true" />

      <div v-if="props.apps.length === 0" class="empty">
        <div class="empty__title">{{ t("empty.title") }}</div>
        <div class="empty__hint">{{ t("empty.hint") }}</div>
      </div>
    </div>

    <div
      v-if="ghost.app && ghost.active"
      class="dragGhost"
      :style="{ left: `${ghost.x - ghost.offsetX}px`, top: `${ghost.y - ghost.offsetY}px` }"
      aria-hidden="true"
    >
      <div class="card card--dragging dragGhost__card">
        <div class="card__icon" :class="{ 'card__icon--img': !!ghost.app.icon }">
          <img v-if="ghost.app.icon" class="card__iconImg" :src="ghost.app.icon" alt="" draggable="false" />
          <template v-else>{{ ghost.app.name.slice(0, 1).toUpperCase() }}</template>
        </div>
        <div class="card__name">{{ ghost.app.name }}</div>
      </div>
    </div>
  </main>
</template>
