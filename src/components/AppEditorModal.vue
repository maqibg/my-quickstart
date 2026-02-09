<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { t } from "../launcher/i18n";

type Props = {
  open: boolean;
  name: string;
  path: string;
  args: string;
};

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", payload: { name: string; path: string; args: string }): void;
}>();

const name = ref("");
const path = ref("");
const args = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.name;
    path.value = props.path;
    args.value = props.args;
  },
  { immediate: true },
);

const canSave = computed(() => name.value.trim() !== "" && path.value.trim() !== "");

function onSave(): void {
  if (!canSave.value) return;
  emit("save", {
    name: name.value,
    path: path.value,
    args: args.value,
  });
}
</script>

<template>
  <div v-if="open" class="modal" @click.self="emit('close')">
    <div class="modal__panel" @click.stop>
      <div class="modal__title">{{ t("editor.title") }}</div>
      <label class="field">
        <div class="field__label">{{ t("editor.name") }}</div>
        <input v-model="name" class="field__input" />
      </label>
      <label class="field">
        <div class="field__label">{{ t("editor.path") }}</div>
        <input v-model="path" class="field__input" />
      </label>
      <label class="field">
        <div class="field__label">{{ t("editor.args") }}</div>
        <input v-model="args" class="field__input" :placeholder="t('editor.argsPlaceholder')" />
      </label>
      <div class="modal__actions">
        <button class="btn" type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button class="btn btn--primary" type="button" :disabled="!canSave" @click="onSave">{{ t("common.save") }}</button>
      </div>
    </div>
  </div>
</template>
