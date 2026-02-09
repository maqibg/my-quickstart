<script setup lang="ts">
import { computed } from "vue";
import type { Group } from "../launcher/types";
import { t } from "../launcher/i18n";

type Props = {
  count: number;
  groups: Group[];
  activeGroupId: string;
};

const props = defineProps<Props>();

const moveTargetGroups = computed(() =>
  props.groups.filter((g) => g.id !== props.activeGroupId)
);

const emit = defineEmits<{
  (e: "delete"): void;
  (e: "moveTo", groupId: string): void;
  (e: "cancel"): void;
}>();
</script>

<template>
  <div v-if="count > 0" class="selectionBar">
    <span class="selectionBar__count">{{ t("selection.count", { count }) }}</span>
    <button class="selectionBar__btn selectionBar__btn--danger" type="button" @click="emit('delete')">
      {{ t("selection.delete") }}
    </button>
    <span class="selectionBar__divider" />
    <span class="selectionBar__label">{{ t("menu.moveTo") }}</span>
    <button
      v-for="g in moveTargetGroups"
      :key="g.id"
      class="selectionBar__btn"
      type="button"
      @click="emit('moveTo', g.id)"
    >
      {{ g.name }}
    </button>
    <span class="selectionBar__spacer" />
    <button class="selectionBar__close" type="button" @click="emit('cancel')" title="Esc">
      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
  </div>
</template>

<style scoped>
.selectionBar {
  position: fixed;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 12px;
  background: var(--surface-strong);
  border: 1px solid var(--border);
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  z-index: 100;
  max-width: 90vw;
  overflow-x: auto;
}

.selectionBar__count {
  font-weight: 600;
  white-space: nowrap;
  opacity: 0.9;
}

.selectionBar__label {
  opacity: 0.6;
  font-size: 0.9em;
  white-space: nowrap;
}

.selectionBar__divider {
  width: 1px;
  height: 20px;
  background: var(--border);
}

.selectionBar__spacer {
  flex: 1;
}

.selectionBar__btn {
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-input);
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
  font-size: 0.9em;
}

.selectionBar__btn:hover {
  background: var(--surface-hover);
}

.selectionBar__btn--danger {
  border-color: rgba(255, 90, 90, 0.4);
  color: rgba(255, 90, 90, 0.9);
}

.selectionBar__btn--danger:hover {
  background: rgba(255, 90, 90, 0.15);
}

.selectionBar__close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.selectionBar__close:hover {
  opacity: 1;
  background: var(--surface-hover);
}
</style>
