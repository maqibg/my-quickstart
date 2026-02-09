<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { FONT_FAMILY_OPTIONS } from "../launcher/fonts";
import { t } from "../launcher/i18n";

type Props = {
  open: boolean;
  language: string;
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
  hideOnStartup: boolean;
  useRelativePath: boolean;
  enableGroupDragSort: boolean;
  autoStart: boolean;
};

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "updateLanguage", value: string): void;
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
  (e: "updateHideOnStartup", value: boolean): void;
  (e: "updateUseRelativePath", value: boolean): void;
  (e: "updateEnableGroupDragSort", value: boolean): void;
  (e: "updateAutoStart", value: boolean): void;
}>();

const language = ref("en");
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
const hideOnStartup = ref(false);
const useRelativePath = ref(false);
const enableGroupDragSort = ref(false);
const autoStart = ref(false);
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
    language.value = props.language;
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
    hideOnStartup.value = props.hideOnStartup;
    useRelativePath.value = props.useRelativePath;
    enableGroupDragSort.value = props.enableGroupDragSort;
    autoStart.value = props.autoStart;
  },
  { immediate: true },
);

function onLanguageChange(ev: Event): void {
  const next = (ev.target as HTMLSelectElement).value;
  language.value = next;
  emit("updateLanguage", next);
}

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

function onHideOnStartupChange(ev: Event): void {
  const next = (ev.target as HTMLInputElement).checked;
  hideOnStartup.value = next;
  emit("updateHideOnStartup", next);
}

function onUseRelativePathChange(ev: Event): void {
  const next = (ev.target as HTMLInputElement).checked;
  useRelativePath.value = next;
  emit("updateUseRelativePath", next);
}

function onEnableGroupDragSortChange(ev: Event): void {
  const next = (ev.target as HTMLInputElement).checked;
  enableGroupDragSort.value = next;
  emit("updateEnableGroupDragSort", next);
}

function onAutoStartChange(ev: Event): void {
  const next = (ev.target as HTMLInputElement).checked;
  autoStart.value = next;
  emit("updateAutoStart", next);
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
      <div class="modal__title modal__title--draggable" @mousedown="startDrag">
        {{ t("settings.title") }}
      </div>

      <div class="tabs" role="tablist" :aria-label="t('settings.title')">
        <button
          class="tabs__tab"
          :class="{ 'tabs__tab--active': tab === 'appearance' }"
          type="button"
          @click="tab = 'appearance'"
        >
          {{ t("settings.tabs.appearance") }}
        </button>
        <button
          class="tabs__tab"
          :class="{ 'tabs__tab--active': tab === 'layout' }"
          type="button"
          @click="tab = 'layout'"
        >
          {{ t("settings.tabs.layout") }}
        </button>
        <button
          class="tabs__tab"
          :class="{ 'tabs__tab--active': tab === 'behavior' }"
          type="button"
          @click="tab = 'behavior'"
        >
          {{ t("settings.tabs.behavior") }}
        </button>
        <button
          class="tabs__tab"
          :class="{ 'tabs__tab--active': tab === 'hotkey' }"
          type="button"
          @click="tab = 'hotkey'"
        >
          {{ t("settings.tabs.hotkey") }}
        </button>
      </div>

      <template v-if="tab === 'appearance'">
        <label class="field">
          <div class="field__label">{{ t("settings.language") }}</div>
          <select class="field__input" :value="language" @change="onLanguageChange">
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </label>

        <label class="field">
          <div class="field__label">{{ t("settings.theme") }}</div>
          <select class="field__input" :value="theme" @change="onThemeChange">
            <option value="dark">{{ t("settings.theme.dark") }}</option>
            <option value="light">{{ t("settings.theme.light") }}</option>
          </select>
        </label>

        <label class="field">
          <div class="field__label">{{ t("settings.font") }}</div>
          <select class="field__input" :value="fontFamily" @change="onFontFamilyChange">
            <option v-for="opt in FONT_FAMILY_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <div class="field__label">{{ t("settings.fontSize") }}</div>
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
          <div class="field__label">{{ t("settings.sidebarWidth") }}</div>
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
          <div class="field__label">{{ t("settings.cardWidth") }}</div>
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
          <div class="field__label">{{ t("settings.cardHeight") }}</div>
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
          <div class="field__label">{{ t("settings.cardFontSize") }}</div>
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
          <div class="field__label">{{ t("settings.cardIconSize") }}</div>
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
          <span class="check__label">{{ t("settings.behavior.dblClickBlankToHide") }}</span>
        </label>

        <label class="check">
          <input
            class="check__input"
            type="checkbox"
            :checked="alwaysOnTop"
            @change="onAlwaysOnTopChange"
          />
          <span class="check__label">{{ t("settings.behavior.alwaysOnTop") }}</span>
        </label>

        <label class="check">
          <input
            class="check__input"
            type="checkbox"
            :checked="hideOnStartup"
            @change="onHideOnStartupChange"
          />
          <span class="check__label">{{ t("settings.behavior.hideOnStartup") }}</span>
        </label>

        <label class="check">
          <input
            class="check__input"
            type="checkbox"
            :checked="useRelativePath"
            @change="onUseRelativePathChange"
          />
          <span class="check__label">{{ t("settings.behavior.useRelativePath") }}</span>
        </label>

        <label class="check">
          <input
            class="check__input"
            type="checkbox"
            :checked="enableGroupDragSort"
            @change="onEnableGroupDragSortChange"
          />
          <span class="check__label">{{ t("settings.behavior.enableGroupDragSort") }}</span>
        </label>

        <label class="check">
          <input
            class="check__input"
            type="checkbox"
            :checked="autoStart"
            @change="onAutoStartChange"
          />
          <span class="check__label">{{ t("settings.behavior.autoStart") }}</span>
        </label>
      </template>

      <template v-else>
        <label class="field">
          <div class="field__label">{{ t("settings.toggleHotkey") }}</div>
          <input
            v-model="toggleHotkey"
            class="field__input"
            :placeholder="t('settings.toggleHotkeyPlaceholder')"
          />
          <div class="field__hint">
            {{ t("settings.toggleHotkeyHintPrefix") }}
            <code>ctrl+alt+space</code> / <code>alt+space</code> / <code>ctrl+d</code>
          </div>
        </label>
      </template>

      <div class="modal__actions">
        <button v-if="tab === 'hotkey'" class="btn" type="button" @click="onApplyHotkey">
          {{ t("settings.applyHotkey") }}
        </button>
        <button class="btn btn--primary" type="button" @click="emit('close')">
          {{ t("common.close") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./SettingsModal.css"></style>
