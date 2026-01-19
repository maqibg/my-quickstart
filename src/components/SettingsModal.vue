<script setup lang="ts">
import { ref, watch } from "vue";

type Props = {
  open: boolean;
  cardWidth: number;
  cardHeight: number;
  toggleHotkey: string;
};

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "updateCardWidth", value: number): void;
  (e: "updateCardHeight", value: number): void;
  (e: "applyHotkey", value: string): void;
}>();

const cardWidth = ref(120);
const cardHeight = ref(96);
const toggleHotkey = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    cardWidth.value = props.cardWidth;
    cardHeight.value = props.cardHeight;
    toggleHotkey.value = props.toggleHotkey;
  },
  { immediate: true },
);

function onWidthInput(ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value;
  const next = Number(raw);
  if (!Number.isFinite(next)) return;
  cardWidth.value = next;
  emit("updateCardWidth", next);
}

function onHeightInput(ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value;
  const next = Number(raw);
  if (!Number.isFinite(next)) return;
  cardHeight.value = next;
  emit("updateCardHeight", next);
}

function onApplyHotkey(): void {
  emit("applyHotkey", toggleHotkey.value);
}
</script>

<template>
  <div v-if="open" class="modal" @click.self="emit('close')">
    <div class="modal__panel" @click.stop>
      <div class="modal__title">Settings</div>

      <label class="field">
        <div class="field__label">Card width</div>
        <input
          class="field__input field__input--range"
          type="range"
          min="90"
          max="260"
          step="2"
          :value="cardWidth"
          @input="onWidthInput"
        />
        <div class="field__hint">{{ cardWidth }}px</div>
      </label>

      <label class="field">
        <div class="field__label">Card height</div>
        <input
          class="field__input field__input--range"
          type="range"
          min="70"
          max="220"
          step="2"
          :value="cardHeight"
          @input="onHeightInput"
        />
        <div class="field__hint">{{ cardHeight }}px</div>
      </label>

      <label class="field">
        <div class="field__label">Toggle hotkey</div>
        <input
          v-model="toggleHotkey"
          class="field__input"
          placeholder="e.g. ctrl+alt+space"
        />
        <div class="field__hint">
          Example: <code>ctrl+alt+space</code> / <code>alt+space</code> / <code>ctrl+d</code>
        </div>
      </label>

      <div class="modal__actions">
        <button class="btn" type="button" @click="onApplyHotkey">Apply Hotkey</button>
        <button class="btn btn--primary" type="button" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>
