<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { FONT_FAMILY_OPTIONS } from "../launcher/fonts";

type Props = {
  open: boolean;
  cardWidth: number;
  cardHeight: number;
  toggleHotkey: string;
  theme: string;
  sidebarWidth: number;
  fontFamily: string;
  fontSize: number;
  cardFontSize: number;
  cardIconScale: number;
  dblclickBlankToHide: boolean;
  alwaysOnTop: boolean;
};

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "updateCardWidth", value: number): void;
  (e: "updateCardHeight", value: number): void;
  (e: "applyHotkey", value: string): void;
  (e: "updateTheme", value: string): void;
  (e: "updateSidebarWidth", value: number): void;
  (e: "updateFontFamily", value: string): void;
  (e: "updateFontSize", value: number): void;
  (e: "updateCardFontSize", value: number): void;
  (e: "updateCardIconScale", value: number): void;
  (e: "updateDblclickBlankToHide", value: boolean): void;
  (e: "updateAlwaysOnTop", value: boolean): void;
}>();

const cardWidth = ref(120);
const cardHeight = ref(96);
const toggleHotkey = ref("");
const theme = ref("dark");
const sidebarWidth = ref(150);
const fontFamily = ref("system");
const fontSize = ref(14);
const cardFontSize = ref(12);
const cardIconScale = ref(48);
const dblclickBlankToHide = ref(true);
const alwaysOnTop = ref(true);
const panelEl = ref<HTMLElement | null>(null);
const panelX = ref(0);
const panelY = ref(0);
const positioned = ref(false);
const viewportH = ref(typeof window !== "undefined" ? window.innerHeight : 800);

const MIN_PANEL_HEIGHT = 260;
const EDGE_PAD = 16;

type SettingsTab = "appearance" | "layout" | "behavior" | "hotkey";
const tab = ref<SettingsTab>("appearance");

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const panelMaxHeight = computed(() => {
  return Math.max(0, viewportH.value - panelY.value - EDGE_PAD);
});

async function ensureInitialPosition(): Promise<void> {
  if (positioned.value) return;
  await nextTick();
  const el = panelEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = clamp(window.innerWidth - rect.width - 14, 8, window.innerWidth - 8);
  const y = clamp(58, 8, window.innerHeight - MIN_PANEL_HEIGHT - EDGE_PAD);
  panelX.value = x;
  panelY.value = y;
  positioned.value = true;
}

let drag:
  | {
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    }
  | null = null;

function onDragMove(ev: MouseEvent): void {
  if (!drag) return;
  const el = panelEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - MIN_PANEL_HEIGHT - EDGE_PAD;
  panelX.value = clamp(drag.originX + (ev.clientX - drag.startX), 8, maxX);
  panelY.value = clamp(drag.originY + (ev.clientY - drag.startY), 8, maxY);
}

function stopDrag(): void {
  drag = null;
  window.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", stopDrag);
}

function startDrag(ev: MouseEvent): void {
  if (ev.button !== 0) return;
  if (!positioned.value) {
    void ensureInitialPosition();
  }
  drag = {
    startX: ev.clientX,
    startY: ev.clientY,
    originX: panelX.value,
    originY: panelY.value,
  };
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", stopDrag);
  ev.preventDefault();
}

onUnmounted(() => stopDrag());

function onResize(): void {
  viewportH.value = window.innerHeight;
}

onMounted(() => {
  window.addEventListener("resize", onResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    void ensureInitialPosition();
    tab.value = "appearance";
    cardWidth.value = props.cardWidth;
    cardHeight.value = props.cardHeight;
    toggleHotkey.value = props.toggleHotkey;
    theme.value = props.theme;
    sidebarWidth.value = props.sidebarWidth;
    fontFamily.value = props.fontFamily;
    fontSize.value = props.fontSize;
    cardFontSize.value = props.cardFontSize;
    cardIconScale.value = props.cardIconScale;
    dblclickBlankToHide.value = props.dblclickBlankToHide;
    alwaysOnTop.value = props.alwaysOnTop;
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

function onThemeChange(ev: Event): void {
  const next = (ev.target as HTMLSelectElement).value;
  theme.value = next;
  emit("updateTheme", next);
}

function onSidebarWidthInput(ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value;
  const next = Number(raw);
  if (!Number.isFinite(next)) return;
  sidebarWidth.value = next;
  emit("updateSidebarWidth", next);
}

function onFontFamilyChange(ev: Event): void {
  const next = (ev.target as HTMLSelectElement).value;
  fontFamily.value = next;
  emit("updateFontFamily", next);
}

function onFontSizeInput(ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value;
  const next = Number(raw);
  if (!Number.isFinite(next)) return;
  fontSize.value = next;
  emit("updateFontSize", next);
}

function onCardFontSizeInput(ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value;
  const next = Number(raw);
  if (!Number.isFinite(next)) return;
  cardFontSize.value = next;
  emit("updateCardFontSize", next);
}

function onCardIconScaleInput(ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value;
  const next = Number(raw);
  if (!Number.isFinite(next)) return;
  cardIconScale.value = next;
  emit("updateCardIconScale", next);
}

function onDblclickChange(ev: Event): void {
  const next = (ev.target as HTMLInputElement).checked;
  dblclickBlankToHide.value = next;
  emit("updateDblclickBlankToHide", next);
}

function onAlwaysOnTopChange(ev: Event): void {
  const next = (ev.target as HTMLInputElement).checked;
  alwaysOnTop.value = next;
  emit("updateAlwaysOnTop", next);
}

function onApplyHotkey(): void {
  emit("applyHotkey", toggleHotkey.value);
}
</script>

<template>
  <div
    v-if="open"
    class="settingsPanel"
    :style="{ left: `${panelX}px`, top: `${panelY}px` }"
  >
    <div ref="panelEl" class="modal__panel" :style="{ maxHeight: `${panelMaxHeight}px` }">
      <div class="modal__title modal__title--draggable" @mousedown="startDrag">Settings</div>

      <div class="tabs" role="tablist" aria-label="Settings tabs">
        <button
          class="tabs__tab"
          :class="{ 'tabs__tab--active': tab === 'appearance' }"
          type="button"
          @click="tab = 'appearance'"
        >
          Appearance
        </button>
        <button
          class="tabs__tab"
          :class="{ 'tabs__tab--active': tab === 'layout' }"
          type="button"
          @click="tab = 'layout'"
        >
          Layout
        </button>
        <button
          class="tabs__tab"
          :class="{ 'tabs__tab--active': tab === 'behavior' }"
          type="button"
          @click="tab = 'behavior'"
        >
          Behavior
        </button>
        <button
          class="tabs__tab"
          :class="{ 'tabs__tab--active': tab === 'hotkey' }"
          type="button"
          @click="tab = 'hotkey'"
        >
          Hotkey
        </button>
      </div>

      <template v-if="tab === 'appearance'">
        <label class="field">
          <div class="field__label">Theme</div>
          <select class="field__input" :value="theme" @change="onThemeChange">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <label class="field">
          <div class="field__label">Font</div>
          <select class="field__input" :value="fontFamily" @change="onFontFamilyChange">
            <option v-for="opt in FONT_FAMILY_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <div class="field__label">Font size</div>
          <input
            class="field__input field__input--range"
            type="range"
            min="10"
            max="22"
            step="1"
            :value="fontSize"
            @input="onFontSizeInput"
          />
          <div class="field__hint">{{ fontSize }}px</div>
        </label>
      </template>

      <template v-else-if="tab === 'layout'">
        <label class="field">
          <div class="field__label">Sidebar width</div>
          <input
            class="field__input field__input--range"
            type="range"
            min="90"
            max="320"
            step="2"
            :value="sidebarWidth"
            @input="onSidebarWidthInput"
          />
          <div class="field__hint">{{ sidebarWidth }}px</div>
        </label>

        <label class="field">
          <div class="field__label">Card width</div>
          <input
            class="field__input field__input--range"
            type="range"
            min="50"
            max="480"
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
            min="40"
            max="360"
            step="2"
            :value="cardHeight"
            @input="onHeightInput"
          />
          <div class="field__hint">{{ cardHeight }}px</div>
        </label>

        <label class="field">
          <div class="field__label">Card font size</div>
          <input
            class="field__input field__input--range"
            type="range"
            min="9"
            max="18"
            step="1"
            :value="cardFontSize"
            @input="onCardFontSizeInput"
          />
          <div class="field__hint">{{ cardFontSize }}px</div>
        </label>

        <label class="field">
          <div class="field__label">Card icon size</div>
          <input
            class="field__input field__input--range"
            type="range"
            min="16"
            max="128"
            step="2"
            :value="cardIconScale"
            @input="onCardIconScaleInput"
          />
          <div class="field__hint">{{ cardIconScale }}px</div>
        </label>
      </template>

      <template v-else-if="tab === 'behavior'">
        <label class="check">
          <input
            class="check__input"
            type="checkbox"
            :checked="dblclickBlankToHide"
            @change="onDblclickChange"
          />
          <span class="check__label">Double click blank area to hide window</span>
        </label>

        <label class="check">
          <input
            class="check__input"
            type="checkbox"
            :checked="alwaysOnTop"
            @change="onAlwaysOnTopChange"
          />
          <span class="check__label">Always on top</span>
        </label>
      </template>

      <template v-else>
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
      </template>

      <div class="modal__actions">
        <button v-if="tab === 'hotkey'" class="btn" type="button" @click="onApplyHotkey">
          Apply Hotkey
        </button>
        <button class="btn btn--primary" type="button" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settingsPanel {
  position: fixed;
  z-index: 70;
  pointer-events: none;
}

.settingsPanel > .modal__panel {
  width: min(420px, calc(100vw - 32px));
  pointer-events: auto;
  box-sizing: border-box;
}

.modal__title--draggable {
  cursor: move;
  user-select: none;
}

.tabs {
  display: flex;
  gap: 6px;
  padding: 2px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-input);
}

.tabs__tab {
  flex: 1;
  height: 32px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.tabs__tab:hover {
  background: var(--surface-hover-soft);
}

.tabs__tab--active {
  background: rgba(86, 135, 255, 0.18);
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-input);
}

.check__input {
  width: 16px;
  height: 16px;
}

.check__label {
  font-size: 13px;
  opacity: 0.92;
}
</style>
