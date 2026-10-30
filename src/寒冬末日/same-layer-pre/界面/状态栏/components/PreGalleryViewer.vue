<template>
  <Teleport to="body">
    <section
      ref="dialog"
      class="pre-viewer"
      :style="visibleInsets"
      role="dialog"
      aria-modal="true"
      aria-label="画廊大图浏览"
      tabindex="-1"
      @keydown.stop="onKeydown"
    >
      <header class="pre-viewer__toolbar">
        <span aria-live="polite">{{ index + 1 }} / {{ entries.length }}</span>
        <button type="button" :disabled="scale <= 1" aria-label="缩小" @click="zoom(scale - 0.5)">−</button>
        <button type="button" aria-label="恢复适应大小" @click="resetView">{{ Math.round(scale * 100) }}%</button>
        <button type="button" :disabled="scale >= 4" aria-label="放大" @click="zoom(scale + 0.5)">＋</button>
        <button type="button" aria-label="关闭大图" @click="emit('close')">✕</button>
      </header>
      <div
        ref="stage"
        class="pre-viewer__stage"
        :class="{ zoomed: scale > 1 }"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="cancelGesture"
        @lostpointercapture="onLostCapture"
        @wheel.prevent="zoom(scale + ($event.deltaY < 0 ? 0.25 : -0.25))"
      >
        <img
          :key="index"
          :src="current.src"
          :alt="current.alt || current.title || '画廊图片'"
          draggable="false"
          :style="{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }"
          @error="failed = true"
        />
        <span v-if="failed" class="pre-viewer__error">图片加载失败，可以继续切换浏览</span>
      </div>
      <footer class="pre-viewer__toolbar">
        <button type="button" :disabled="index === 0" aria-label="上一张" @click="navigate(-1)">‹ 上一张</button>
        <span>{{ scale > 1 ? '拖动查看细节 · 缩回后滑动切图' : '左右滑动切图 · 双指或按钮缩放' }}</span>
        <button type="button" :disabled="index === entries.length - 1" aria-label="下一张" @click="navigate(1)">
          下一张 ›
        </button>
      </footer>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { useEventListener, useThrottleFn } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ReaderGalleryEntry } from '../../../../界面同层版/界面/状态栏/types';

const props = defineProps<{ entries: ReaderGalleryEntry[]; initialIndex: number }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const index = ref(props.initialIndex);
const current = computed(() => props.entries[index.value]);
const dialog = ref<HTMLElement>();
const stage = ref<HTMLElement>();
const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const failed = ref(false);
const visibleInsets = ref<Record<'top' | 'bottom' | 'left' | 'right', string>>();
const frames: HTMLIFrameElement[] = [];
const hosts: Window[] = [];
try {
  let context: Window = window;
  while (context.frameElement) {
    const frame = context.frameElement as HTMLIFrameElement;
    const host = frame.ownerDocument.defaultView;
    if (!host) break;
    frames.push(frame);
    hosts.push(host);
    context = host;
  }
} catch {
  // Use the accessible part of the frame chain in cross-origin previews.
}

function updateVisibleInsets() {
  let top = 0;
  let left = 0;
  let bottom = window.innerHeight;
  let right = window.innerWidth;
  // Walk inward from the outermost accessible viewport, carrying its clipping
  // through every iframe instead of treating an intermediate iframe as the screen.
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    const host = hosts[i];
    const viewport = host.visualViewport;
    if (i === frames.length - 1) {
      top = viewport?.offsetTop ?? 0;
      left = viewport?.offsetLeft ?? 0;
      bottom = top + (viewport?.height ?? host.innerHeight);
      right = left + (viewport?.width ?? host.innerWidth);
    }
    for (let parent = frame.parentElement; parent; parent = parent.parentElement) {
      const style = host.getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      const sx = parent.offsetWidth ? bounds.width / parent.offsetWidth : 1;
      const sy = parent.offsetHeight ? bounds.height / parent.offsetHeight : 1;
      if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY)) {
        const clipTop = bounds.top + parent.clientTop * sy;
        top = Math.max(top, clipTop);
        bottom = Math.min(bottom, clipTop + parent.clientHeight * sy);
      }
      if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
        const clipLeft = bounds.left + parent.clientLeft * sx;
        left = Math.max(left, clipLeft);
        right = Math.min(right, clipLeft + parent.clientWidth * sx);
      }
    }
    const rect = frame.getBoundingClientRect();
    const sx = rect.width / frame.offsetWidth;
    const sy = rect.height / frame.offsetHeight;
    if (!sx || !sy || !Number.isFinite(sx) || !Number.isFinite(sy)) return;
    const originX = rect.left + frame.clientLeft * sx;
    const originY = rect.top + frame.clientTop * sy;
    top = Math.max(0, (top - originY) / sy);
    left = Math.max(0, (left - originX) / sx);
    bottom = Math.min(frame.clientHeight, (bottom - originY) / sy);
    right = Math.min(frame.clientWidth, (right - originX) / sx);
  }
  if (bottom <= top || right <= left) return;
  visibleInsets.value = {
    top: `${top}px`,
    bottom: `${Math.max(0, window.innerHeight - bottom)}px`,
    left: `${left}px`,
    right: `${Math.max(0, window.innerWidth - right)}px`,
  };
}
const scheduleVisibleInsets = useThrottleFn(updateVisibleInsets, 32);
for (const host of [window, ...hosts]) {
  useEventListener(host, 'scroll', scheduleVisibleInsets, { capture: true, passive: true });
  useEventListener(host, 'resize', scheduleVisibleInsets);
  if (host.visualViewport) {
    useEventListener(host.visualViewport, 'scroll', scheduleVisibleInsets);
    useEventListener(host.visualViewport, 'resize', scheduleVisibleInsets);
  }
}
let resizeObserver: ResizeObserver | undefined;
type Point = { x: number; y: number };
const pointers = new Map<number, Point>();
let start: Point | null = null;
let last: Point | null = null;
let maySwipe = false;
let pinchDistance = 0;
let pinchScale = 1;
let previousFocus: HTMLElement | null = null;

function cancelGesture() {
  pointers.clear();
  start = last = null;
  maySwipe = false;
  pinchDistance = 0;
}

function resetView() {
  scale.value = 1;
  offset.value = { x: 0, y: 0 };
  cancelGesture();
}

function zoom(value: number) {
  scale.value = Math.max(1, Math.min(4, value));
  if (scale.value === 1) offset.value = { x: 0, y: 0 };
  else clampOffset();
}

function clampOffset() {
  const bounds = stage.value?.getBoundingClientRect();
  if (!bounds) return;
  const maxX = (bounds.width * (scale.value - 1)) / 2;
  const maxY = (bounds.height * (scale.value - 1)) / 2;
  offset.value = {
    x: Math.max(-maxX, Math.min(maxX, offset.value.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.value.y)),
  };
}

function navigate(direction: number) {
  const next = index.value + direction;
  if (next < 0 || next >= props.entries.length) return;
  index.value = next;
  failed.value = false;
  resetView();
}

function distance() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onDown(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  const point = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, point);
  stage.value?.setPointerCapture(event.pointerId);
  if (pointers.size === 1) {
    start = last = point;
    maySwipe = scale.value === 1;
  } else {
    maySwipe = false;
    pinchDistance = distance();
    pinchScale = scale.value;
  }
}

function onMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  const point = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, point);
  if (pointers.size > 1) {
    if (pinchDistance > 0) zoom((pinchScale * distance()) / pinchDistance);
  } else if (last && scale.value > 1) {
    offset.value = { x: offset.value.x + point.x - last.x, y: offset.value.y + point.y - last.y };
    clampOffset();
  }
  last = point;
}

function onUp(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (maySwipe && start && scale.value === 1 && pointers.size === 0) {
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.3) navigate(dx < 0 ? 1 : -1);
  }
  maySwipe = false;
  last = [...pointers.values()][0] ?? null;
  if (pointers.size === 0) cancelGesture();
}

function onLostCapture(event: PointerEvent) {
  if (pointers.has(event.pointerId)) cancelGesture();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
  else if (event.key === 'ArrowLeft') navigate(-1);
  else if (event.key === 'ArrowRight') navigate(1);
  else if (event.key === 'Tab') {
    const buttons = [...(dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const first = buttons[0];
    const lastButton = buttons.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
      event.preventDefault();
      lastButton?.focus();
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault();
      first?.focus();
    }
    return;
  } else return;
  event.preventDefault();
}

onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null;
  updateVisibleInsets();
  if (frames.length && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleVisibleInsets);
    for (const frame of frames) {
      for (let element: HTMLElement | null = frame; element; element = element.parentElement)
        resizeObserver.observe(element);
    }
  }
  dialog.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  cancelGesture();
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
</script>

<style scoped>
.pre-viewer {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  background: #101218f5;
  color: #f4f5f8;
  overscroll-behavior: contain;
}
.pre-viewer__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  flex-shrink: 0;
  font-size: 12px;
}
.pre-viewer__toolbar button {
  min-width: 44px;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid #ffffff40;
  border-radius: 8px;
  color: inherit;
  background: #ffffff12;
  cursor: pointer;
  flex-shrink: 0;
}
.pre-viewer__toolbar button:disabled {
  opacity: 0.35;
  cursor: default;
}
.pre-viewer__toolbar button:focus-visible {
  outline: 2px solid #a5caff;
}
.pre-viewer__stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}
.pre-viewer__stage.zoomed {
  cursor: grab;
}
.pre-viewer__stage.zoomed:active {
  cursor: grabbing;
}
.pre-viewer__stage img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
.pre-viewer__error {
  position: absolute;
  inset: 45% 12px auto;
  text-align: center;
}
</style>
