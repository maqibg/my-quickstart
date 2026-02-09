<script setup lang="ts">
import type { Group } from "../launcher/types";
import { t } from "../launcher/i18n";

type Props = {
  groups: Group[];
  activeGroupId: string;
  dropTargetGroupId?: string | null;
  groupDragSortEnabled?: boolean;
  groupDragDraggingId?: string | null;
  groupDragReadyId?: string | null;
  groupDragOverId?: string | null;
  groupDragOverAfter?: boolean;
  groupDragOverBlankEnd?: boolean;
  invalidGroup?: { id: string; name: string } | null;
};

defineProps<Props>();

const emit = defineEmits<{
  (e: "selectGroup", id: string): void;
  (e: "contextmenuBlank", ev: MouseEvent): void;
  (e: "contextmenuGroup", ev: MouseEvent, id: string): void;
  (e: "openSettings"): void;
  (e: "validate"): void;
  (e: "externalDragOverGroup", ev: DragEvent, id: string): void;
  (e: "externalDrop", ev: DragEvent): void;
  (e: "groupPointerDown", ev: PointerEvent, id: string): void;
  (e: "groupMouseDown", ev: MouseEvent, id: string): void;
}>();

function onGroupPointerDown(ev: PointerEvent, id: string): void {
  const target = ev.currentTarget as HTMLElement | null;
  if (target && "setPointerCapture" in target) {
    try {
      target.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  }
  emit("groupPointerDown", ev, id);
}

function onGroupMouseDown(ev: MouseEvent, id: string): void {
  emit("groupMouseDown", ev, id);
}
</script>

<template>
  <aside class="sidebar" @contextmenu.stop="(e) => emit('contextmenuBlank', e)">
    <div class="sidebar__groups" :class="{ 'sidebar__groups--dragSortEnd': !!groupDragOverBlankEnd }">
      <button
        v-for="g in groups"
        :key="g.id"
        class="group"
        :class="{
          'group--active': g.id === activeGroupId,
          'group--dropTarget': !!dropTargetGroupId && g.id === dropTargetGroupId,
          'group--dragSortEnabled': !!groupDragSortEnabled,
          'group--dragging': !!groupDragDraggingId && g.id === groupDragDraggingId,
          'group--dragReady': !!groupDragReadyId && g.id === groupDragReadyId,
          'group--dragSortTarget': !!groupDragOverId && g.id === groupDragOverId,
          'group--dragSortBefore':
            !!groupDragOverId && g.id === groupDragOverId && !groupDragOverAfter,
          'group--dragSortAfter':
            !!groupDragOverId && g.id === groupDragOverId && !!groupDragOverAfter,
        }"
        type="button"
        :data-group-id="g.id"
        @click="emit('selectGroup', g.id)"
        @pointerdown.stop="(e) => onGroupPointerDown(e, g.id)"
        @mousedown.left.stop="(e) => onGroupMouseDown(e, g.id)"
        @contextmenu.stop="(e) => emit('contextmenuGroup', e, g.id)"
        @dragover="(e) => emit('externalDragOverGroup', e, g.id)"
        @drop.stop="(e) => emit('externalDrop', e)"
      >
        <span class="group__dot" />
        <span class="group__name" :title="g.name">{{ g.name }}</span>
      </button>

      <button
        v-if="invalidGroup"
        class="group group--invalid"
        :class="{ 'group--active': activeGroupId === invalidGroup.id }"
        type="button"
        @click="emit('selectGroup', invalidGroup.id)"
        @contextmenu.stop
      >
        <span class="group__dot group__dot--invalid" />
        <span class="group__name">{{ invalidGroup.name }}</span>
      </button>
    </div>

    <div class="sidebar__footer">
      <button
        class="sidebar__settings"
        type="button"
        @click="emit('openSettings')"
        @contextmenu.stop
      >
        {{ t("sidebar.settings") }}
      </button>
      <button
        class="sidebar__settings"
        type="button"
        @click="emit('validate')"
        @contextmenu.stop
      >
        {{ t("sidebar.validate") }}
      </button>
    </div>
  </aside>
</template>
