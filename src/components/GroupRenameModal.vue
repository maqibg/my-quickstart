<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { t } from "../launcher/i18n";

type Props = {
  open: boolean;
  name: string;
};

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", name: string): void;
}>();

const name = ref("");
const inputEl = ref<HTMLInputElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    name.value = props.name;
    await nextTick();
    inputEl.value?.focus();
    inputEl.value?.select();
  },
  { immediate: true },
);

const canSave = computed(() => name.value.trim() !== "");

function onSave(): void {
  if (!canSave.value) return;
  emit("save", name.value);
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Enter") {
    if (canSave.value) onSave();
  } else if (ev.key === "Escape") {
    emit("close");
  }
}
</script>

<template>
  <div v-if="open" class="modal" @click.self="emit('close')">
    <div class="modal__panel" @click.stop>
      <div class="modal__title">{{ t("rename.title") }}</div>
      <label class="field">
        <div class="field__label">{{ t("rename.groupName") }}</div>
        <input
          ref="inputEl"
          v-model="name"
          class="field__input"
          @keydown="onKeydown"
        />
      </label>
      <div class="modal__actions">
        <button class="btn" type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button class="btn btn--primary" type="button" :disabled="!canSave" @click="onSave">{{ t("common.save") }}</button>
      </div>
    </div>
  </div>
</template>
