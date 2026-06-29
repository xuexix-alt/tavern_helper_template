<template>
  <section class="pre-gallery-panel" data-pre-gallery-beta="true">
    <header class="pre-gallery-panel__head">
      <div>
        <span class="demo-kicker">PRE GALLERY</span>
        <strong>图片</strong>
      </div>
      <button type="button" class="pre-gallery-panel__refresh" @click="scanNow('manual')">刷新</button>
    </header>

    <div class="pre-gallery-panel__probe" :class="probeStateClass">
      <span>{{ probeStateLabel }}</span>
      <span>{{ result.refs.length }} 张</span>
    </div>

    <div v-if="result.refs.length === 0" class="pre-gallery-panel__empty">
      <strong>{{ emptyTitle }}</strong>
      <span>{{ emptyDetail }}</span>
    </div>

    <div v-else class="pre-gallery-panel__grid">
      <article
        v-for="entry in result.refs"
        :key="entry.id"
        class="pre-gallery-card"
        :data-pre-gallery-ref="entry.lightKey"
        :data-message-id="entry.messageId"
        :data-image-tag="entry.tag || undefined"
        :data-link="entry.link || undefined"
        :data-request-id="entry.requestId || undefined"
        :data-image-id="entry.imageId || undefined"
      >
        <button
          type="button"
          class="pre-gallery-card__image"
          :class="{ pending: !entry.src }"
          @click="handleCardClick(entry, $event)"
          @dblclick.prevent="dispatchGesture(entry, 'dblclick')"
          @pointerdown="startLongPress(entry)"
          @pointerup="cancelLongPress"
          @pointercancel="cancelLongPress"
          @pointerleave="cancelLongPress"
        >
          <img v-if="entry.src" :src="entry.src" alt="" />
          <span v-else>PLACEHOLDER</span>
        </button>

        <div class="pre-gallery-card__meta">
          <div class="pre-gallery-card__line">
            <strong>#{{ entry.messageId }}</strong>
            <span>{{ entry.gestureTargetHint }}</span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  dispatchPreGalleryImageRefGesture,
  scanLatestPreGalleryImageRefs,
  type PreGalleryGestureMode,
  type PreGalleryImageRef,
  type PreGalleryImageSource,
  type PreGalleryScanResult,
} from '../preGalleryImageRefs';
import type { PreGalleryLogItem } from '../types';

const props = defineProps<{
  active: boolean;
}>();

const emit = defineEmits<{
  (event: 'gallery-log', item: PreGalleryLogItem): void;
}>();

const EMPTY_SOURCE_COUNTS: Record<PreGalleryImageSource, number> = {
  'host-dom': 0,
  'extra.images': 0,
  mes_tag: 0,
  cache: 0,
};
const LAZY_RESCAN_DELAY_MS = 220;
const RENDER_RESCAN_DELAY_MS = 720;
const LONG_PRESS_MS = 540;
const LONG_PRESS_CLICK_SUPPRESS_MS = 900;

const result = ref<PreGalleryScanResult>({
  reason: 'init',
  scannedAt: 0,
  selectedMessageId: null,
  refs: [],
  sourceCounts: { ...EMPTY_SOURCE_COUNTS },
  diagnostics: ['等待打开画廊后扫描'],
});
const dirtyEvents = ref<string[]>([]);
const lastEventName = ref('');
const scanTimer = ref(0);
const renderRescanTimer = ref(0);
const longPressTimer = ref(0);
const suppressClickAfterLongPress = ref({ key: '', until: 0 });
const stops: Array<{ stop: () => void }> = [];

const probeStateLabel = computed(() => {
  if (!props.active) return '休眠：未打开不扫描';
  if (result.value.selectedMessageId === null) return '已打开：未命中图片';
  return `已打开：楼层 #${result.value.selectedMessageId}`;
});

const probeStateClass = computed(() => ({
  asleep: !props.active,
  empty: props.active && result.value.refs.length === 0,
  hit: props.active && result.value.refs.length > 0,
}));

const emptyTitle = computed(() => (props.active ? '没有命中可复刻图片' : '画廊休眠中'));
const emptyDetail = computed(() =>
  props.active ? result.value.diagnostics.at(-1) ?? '等待插件渲染事件' : '打开画廊后才扫描宿主 DOM 和插件存储',
);

function pushGalleryLog(type: PreGalleryLogItem['type'], title: string, detail: string) {
  emit('gallery-log', { type, title, detail });
}

function summarizeImageSrc(src: string) {
  const value = String(src || '');
  if (!value) return { kind: 'empty', length: 0 };
  if (value.startsWith('data:image/')) return { kind: 'data-url', length: value.length, prefix: value.slice(0, 22) };
  if (value.startsWith('blob:')) return { kind: 'blob-url', length: value.length };
  return { kind: 'url', length: value.length, prefix: value.slice(0, 96) };
}

function summarizeLogRef(entry: PreGalleryImageRef) {
  return {
    id: entry.id,
    lightKey: entry.lightKey,
    messageId: entry.messageId,
    swipeId: entry.swipeId,
    sources: [...entry.sources],
    gestureTargetHint: entry.gestureTargetHint,
    src: summarizeImageSrc(entry.src),
    hasTag: Boolean(entry.tag),
    hasLink: Boolean(entry.link),
    requestId: entry.requestId,
    imageId: entry.imageId,
    promptTokenLength: entry.promptToken.length,
    className: entry.className,
    evidence: entry.evidence.slice(0, 4),
  };
}

function logScan(next: PreGalleryScanResult) {
  const sourceSummary = Object.entries(next.sourceCounts)
    .map(([key, value]) => `${key}:${value}`)
    .join(' ');
  const detail = `reason=${next.reason} selected=${next.selectedMessageId ?? 'none'} refs=${next.refs.length} ${sourceSummary}`;
  const safeRefs = next.refs.map(summarizeLogRef);
  pushGalleryLog(next.refs.length > 0 ? 'action' : 'info', '画廊扫描', detail);
  pushGalleryLog('info', '画廊来源', sourceSummary);
  for (const diagnostic of next.diagnostics) pushGalleryLog('info', '画廊诊断', diagnostic);
  console.debug?.('[same-layer-pre gallery beta] scan', {
    reason: next.reason,
    scannedAt: next.scannedAt,
    selectedMessageId: next.selectedMessageId,
    refs: safeRefs,
    sourceCounts: next.sourceCounts,
    diagnostics: next.diagnostics,
    detail,
  });
}

function normalizeMessageId(value: unknown): number | null {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id >= 0 ? id : null;
}

function normalizeEventMessageIds(values: unknown[]): number[] {
  const ids = new Set<number>();
  const seen = new Set<object>();

  const visit = (value: unknown) => {
    const directId = normalizeMessageId(value);
    if (directId !== null && (typeof value === 'number' || typeof value === 'string')) {
      ids.add(directId);
      return;
    }

    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    const record = value as Record<string, unknown>;
    for (const key of ['message_id', 'messageId', 'mesid', 'mesId', 'id']) {
      const id = normalizeMessageId(record[key]);
      if (id !== null) ids.add(id);
    }
    visit(record.detail);
    visit(record.message);
    visit(record.args);
  };

  for (const value of values) visit(value);
  return Array.from(ids);
}

function scanNow(reason = 'manual', messageIds: number[] = []) {
  if (!props.active) return;
  dirtyEvents.value = [];
  const next = scanLatestPreGalleryImageRefs({ reason, messageIds });
  result.value = next;
  logScan(next);
}

function scheduleScan(reason: string, delayMs = LAZY_RESCAN_DELAY_MS, messageIds: number[] = []) {
  if (!props.active) return;
  if (scanTimer.value) window.clearTimeout(scanTimer.value);
  scanTimer.value = window.setTimeout(() => {
    scanTimer.value = 0;
    scanNow(reason, messageIds);
  }, delayMs);
}

function scheduleRenderRescan(reason: string, messageIds: number[] = []) {
  if (!props.active) return;
  if (renderRescanTimer.value) window.clearTimeout(renderRescanTimer.value);
  renderRescanTimer.value = window.setTimeout(() => {
    renderRescanTimer.value = 0;
    scanNow(`${reason}:settled`, messageIds);
  }, RENDER_RESCAN_DELAY_MS);
}

function rememberEvent(eventName: string, messageIds: number[]) {
  lastEventName.value = eventName;
  dirtyEvents.value = [...dirtyEvents.value, eventName].slice(-6);
  pushGalleryLog(
    'info',
    '画廊事件',
    messageIds.length > 0 ? `${eventName} -> #${messageIds.join(', #')}` : `${eventName} -> 等待下次打开画廊复验`,
  );
  console.debug?.('[same-layer-pre gallery beta] event', {
    eventName,
    messageIds,
    active: props.active,
    mode: props.active ? (messageIds.length > 0 ? 'targeted scan scheduled' : 'idless dirty only') : 'dirty only',
  });
}

function refreshImageRef(eventName: string, ...eventArgs: unknown[]) {
  const messageIds = normalizeEventMessageIds(eventArgs);
  rememberEvent(eventName, messageIds);
  if (!props.active) return;
  if (messageIds.length === 0) return;
  scheduleScan(eventName, LAZY_RESCAN_DELAY_MS, messageIds);
}

function hydrateImageDom(eventName: string, ...eventArgs: unknown[]) {
  const messageIds = normalizeEventMessageIds(eventArgs);
  rememberEvent(eventName, messageIds);
  if (!props.active) return;
  if (messageIds.length === 0) return;
  scheduleScan(eventName, LAZY_RESCAN_DELAY_MS, messageIds);
  scheduleRenderRescan(eventName, messageIds);
}

function dispatchGesture(entry: PreGalleryImageRef, mode: PreGalleryGestureMode) {
  cancelLongPress();
  const dispatched = dispatchPreGalleryImageRefGesture(entry, mode);
  pushGalleryLog(
    dispatched.ok ? 'action' : 'error',
    `画廊手势 ${mode}`,
    `${dispatched.method} -> ${dispatched.target}；${dispatched.reason}`,
  );
  console.debug?.('[same-layer-pre gallery beta] gesture', { ref: summarizeLogRef(entry), mode, dispatched });
}

function handleCardClick(entry: PreGalleryImageRef, event: MouseEvent) {
  const suppressed = suppressClickAfterLongPress.value;
  if (suppressed.key === entry.id && Date.now() <= suppressed.until) {
    event.preventDefault();
    event.stopPropagation();
    suppressClickAfterLongPress.value = { key: '', until: 0 };
    return;
  }
  dispatchGesture(entry, 'click');
}

function startLongPress(entry: PreGalleryImageRef) {
  cancelLongPress();
  longPressTimer.value = window.setTimeout(() => {
    longPressTimer.value = 0;
    suppressClickAfterLongPress.value = { key: entry.id, until: Date.now() + LONG_PRESS_CLICK_SUPPRESS_MS };
    dispatchGesture(entry, 'longpress');
  }, LONG_PRESS_MS);
}

function cancelLongPress() {
  if (!longPressTimer.value) return;
  window.clearTimeout(longPressTimer.value);
  longPressTimer.value = 0;
}

watch(
  () => props.active,
  active => {
    if (active) {
      pushGalleryLog('info', '画廊打开', dirtyEvents.value.length > 0 ? `补验 ${dirtyEvents.value.at(-1)}` : '执行懒扫描');
      scheduleScan('drawer_open', 0);
      return;
    }
    if (scanTimer.value) window.clearTimeout(scanTimer.value);
    if (renderRescanTimer.value) window.clearTimeout(renderRescanTimer.value);
    scanTimer.value = 0;
    renderRescanTimer.value = 0;
    pushGalleryLog('info', '画廊关闭', '停止扫描，仅保留事件脏标记');
  },
);

onMounted(() => {
  stops.push(eventOn(tavern_events.MESSAGE_UPDATED as any, (...args: unknown[]) => refreshImageRef(String(tavern_events.MESSAGE_UPDATED), ...args)));
  stops.push(eventOn(tavern_events.MESSAGE_EDITED as any, (...args: unknown[]) => refreshImageRef(String(tavern_events.MESSAGE_EDITED), ...args)));
  stops.push(
    eventOn(tavern_events.USER_MESSAGE_RENDERED as any, (...args: unknown[]) =>
      hydrateImageDom(String(tavern_events.USER_MESSAGE_RENDERED), ...args),
    ),
  );
  stops.push(
    eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED as any, (...args: unknown[]) =>
      hydrateImageDom(String(tavern_events.CHARACTER_MESSAGE_RENDERED), ...args),
    ),
  );

  if (props.active) scheduleScan('mounted_active', 0);
});

onBeforeUnmount(() => {
  cancelLongPress();
  if (scanTimer.value) window.clearTimeout(scanTimer.value);
  if (renderRescanTimer.value) window.clearTimeout(renderRescanTimer.value);
  stops.splice(0).forEach(stop => stop.stop());
});
</script>

<style scoped>
.pre-gallery-panel {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  color: var(--demo-text-secondary);
}

.pre-gallery-panel__head,
.pre-gallery-panel__probe {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.pre-gallery-panel__head strong {
  display: block;
  color: var(--demo-text-primary);
  font-size: 15px;
}

.pre-gallery-panel__refresh {
  min-width: 58px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 76%, transparent);
  color: var(--demo-text-primary);
  font-size: 12px;
  line-height: 28px;
}

.pre-gallery-panel__probe {
  border: 1px solid var(--demo-border-soft);
  padding: 8px 10px;
  font-size: 12px;
}

.pre-gallery-panel__probe.hit {
  border-color: color-mix(in srgb, #53d18b 48%, var(--demo-border-soft));
  color: #95f0bd;
}

.pre-gallery-panel__probe.empty {
  border-color: color-mix(in srgb, #d8bd69 42%, var(--demo-border-soft));
}

.pre-gallery-panel__probe.asleep {
  color: var(--demo-text-tertiary);
}

.pre-gallery-panel__empty {
  display: grid;
  min-height: 128px;
  place-content: center;
  gap: 6px;
  border: 1px dashed var(--demo-border-accent-soft);
  padding: 18px;
  text-align: center;
}

.pre-gallery-panel__empty strong {
  color: var(--demo-text-primary);
  font-size: 14px;
}

.pre-gallery-panel__empty span {
  color: var(--demo-text-tertiary);
  font-size: 12px;
}

.pre-gallery-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.pre-gallery-card {
  display: grid;
  gap: 8px;
  border: 1px solid var(--demo-border-soft);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  padding: 8px;
}

.pre-gallery-card__image {
  display: grid;
  width: 100%;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--demo-border-accent-soft);
  background: #10141a;
  color: var(--demo-text-tertiary);
  font-size: 11px;
}

.pre-gallery-card__image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pre-gallery-card__image.pending {
  border-style: dashed;
}

.pre-gallery-card__meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.pre-gallery-card__line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pre-gallery-card__line {
  justify-content: space-between;
  color: var(--demo-text-primary);
  font-size: 12px;
}

.pre-gallery-card__line span {
  color: var(--demo-text-tertiary);
  font-size: 11px;
}
</style>
