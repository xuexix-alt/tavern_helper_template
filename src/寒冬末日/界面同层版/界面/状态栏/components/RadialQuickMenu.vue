<template>
  <div v-if="items.length" class="radial-root" :style="rootStyle">
    <transition name="radial-fade">
      <div v-if="open" class="radial-backdrop"></div>
    </transition>

    <transition name="radial-fade">
      <div v-if="open" class="radial-overlay" :style="overlayStyle">
        <svg width="320" height="320" viewBox="0 0 320 320" class="radial-svg">
          <g v-for="(item, index) in items" :key="item.key">
            <path
              :d="slicePath(index, items.length)"
              class="radial-slice"
              :class="{ active: activeKey === item.key, hovered: hoveredIndex === index }"
            />
            <text
              :x="textPosition(index, items.length).x"
              :y="textPosition(index, items.length).y"
              text-anchor="middle"
              class="radial-label"
              :class="{ compact: labelLayout(item, items.length).lines.length > 1 }"
            >
              <tspan
                v-for="(line, lineIndex) in labelLayout(item, items.length).lines"
                :key="`${item.key}-line-${lineIndex}`"
                :x="textPosition(index, items.length).x"
                :dy="lineIndex === 0 ? `${labelLayout(item, items.length).offsetY}em` : '1.08em'"
              >
                {{ line }}
              </tspan>
            </text>
            <text
              v-if="labelLayout(item, items.length).showStatus"
              :x="textPosition(index, items.length).x"
              :y="textPosition(index, items.length).y + labelLayout(item, items.length).statusOffset"
              text-anchor="middle"
              class="radial-sub"
            >
              {{ labelLayout(item, items.length).statusText }}
            </text>
          </g>
          <circle cx="160" cy="160" r="58" class="radial-core" />
          <circle cx="160" cy="160" r="38" class="radial-core-inner" />
        </svg>
        <div class="radial-core-icon">◉</div>
      </div>
    </transition>

    <button
      type="button"
      class="radial-trigger"
      title="长按滑动切换角色，拖动可移动"
      :class="{ pressing: mode === 'press', active: open }"
      @contextmenu.prevent
      @dragstart.prevent
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMoveButton"
      @pointerup="handlePointerUpButton"
      @pointercancel="handlePointerUpButton"
    >
      <span class="radial-count">{{ items.length }}</span>
      ◎
    </button>
  </div>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';

type RadialItem = { key: string; label: string; statusText?: string };

const props = defineProps<{
  items: RadialItem[];
  activeKey?: string | null;
}>();

const emit = defineEmits<{
  (event: 'select', key: string): void;
}>();

function defaultButtonPos() {
  if (typeof window === 'undefined') return { x: 160, y: 104 };
  return {
    x: Math.min(Math.max(12, window.innerWidth - 220), Math.max(12, window.innerWidth - 78)),
    y: 104,
  };
}

const open = ref(false);
const hoveredIndex = ref<number | null>(null);
const buttonPos = ref(defaultButtonPos());
const pressTimer = ref<number | null>(null);
const startPos = ref({ x: 0, y: 0 });
const dragOrigin = ref({ x: 18, y: 18 });
const mode = ref<'idle' | 'press' | 'drag' | 'radial'>('idle');
const isPointerActive = ref(false);

const rootStyle = computed(() => ({ right: `${buttonPos.value.x}px`, bottom: `${buttonPos.value.y}px` }));
const overlayStyle = computed(() => ({ right: '-127px', bottom: '-127px' }));

function isMobileViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 760px)').matches;
}

function normalizeWheelLabel(label: string) {
  return String(label ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitLabelSmart(label: string, total: number) {
  const normalized = normalizeWheelLabel(label);
  if (!normalized) return ['未命名'];

  const mobile = isMobileViewport();
  const chars = Array.from(normalized);
  const maxPerLine = mobile ? (total >= 5 ? 2 : 3) : total >= 6 ? 2 : 3;
  const maxLines = 2;

  if (/[\s/-]/.test(normalized) && !/[\u4e00-\u9fff]/.test(normalized)) {
    const words = normalized.split(/[\s/-]+/).filter(Boolean);
    if (words.length > 1) {
      const first = words[0].slice(0, mobile ? 5 : 7);
      const second = words
        .slice(1)
        .join(' ')
        .slice(0, mobile ? 5 : 7);
      return [first, second].filter(Boolean).slice(0, maxLines);
    }
  }

  if (chars.length <= maxPerLine) return [normalized];
  const lines: string[] = [];
  for (let i = 0; i < chars.length && lines.length < maxLines; i += maxPerLine) {
    const next = chars.slice(i, i + maxPerLine).join('');
    lines.push(next);
  }
  if (chars.length > maxPerLine * maxLines && lines.length > 0) {
    lines[lines.length - 1] = `${Array.from(lines[lines.length - 1])
      .slice(0, Math.max(1, maxPerLine - 1))
      .join('')}…`;
  }
  return lines;
}

function labelLayout(item: RadialItem, total: number) {
  const lines = splitLabelSmart(item.label, total);
  const showStatus = Boolean(item.statusText) && !isMobileViewport() && total <= 4 && lines.length === 1;
  return {
    lines,
    offsetY: showStatus ? -0.25 : lines.length > 1 ? -0.45 : 0.12,
    statusOffset: lines.length > 1 ? 26 : 18,
    showStatus,
    statusText: String(item.statusText ?? '').trim(),
  };
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function slicePath(index: number, total: number) {
  const sliceAngle = 360 / total;
  const start = index * sliceAngle - sliceAngle / 2 + 3;
  const end = (index + 1) * sliceAngle - sliceAngle / 2 - 3;
  const outerStart = polarToCartesian(160, 160, 150, end);
  const outerEnd = polarToCartesian(160, 160, 150, start);
  const innerStart = polarToCartesian(160, 160, 72, start);
  const innerEnd = polarToCartesian(160, 160, 72, end);
  const largeArc = end - start <= 180 ? 0 : 1;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A 150 150 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A 72 72 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function textPosition(index: number, total: number) {
  const sliceAngle = 360 / total;
  const mid = index * sliceAngle + sliceAngle / 2;
  return polarToCartesian(160, 160, 111, mid);
}

function clearPressTimer() {
  if (pressTimer.value != null) {
    window.clearTimeout(pressTimer.value);
    pressTimer.value = null;
  }
}

function handlePointerDown(event: PointerEvent) {
  if (isMobileViewport()) {
    event.preventDefault();
    startPos.value = { x: event.clientX, y: event.clientY };
    dragOrigin.value = { ...buttonPos.value };
    mode.value = 'press';
    isPointerActive.value = true;
    hoveredIndex.value = null;
    clearPressTimer();
    pressTimer.value = window.setTimeout(() => {
      if (!isPointerActive.value || mode.value !== 'press') return;
      mode.value = 'radial';
      open.value = true;
    }, 120);
    return;
  }

  startPos.value = { x: event.clientX, y: event.clientY };
  dragOrigin.value = { ...buttonPos.value };
  mode.value = 'press';
  isPointerActive.value = true;
  clearPressTimer();
  pressTimer.value = window.setTimeout(() => {
    mode.value = 'radial';
    open.value = true;
  }, 320);
}

function handlePointerMove(event: PointerEvent) {
  if (!isPointerActive.value) return;
  const dx = event.clientX - startPos.value.x;
  const dy = event.clientY - startPos.value.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (mode.value === 'press' && distance > 12) {
    clearPressTimer();
    mode.value = 'drag';
  }

  if (mode.value === 'drag') {
    buttonPos.value = {
      x: Math.min(Math.max(12, dragOrigin.value.x - dx), Math.max(12, window.innerWidth - 78)),
      y: Math.min(Math.max(12, dragOrigin.value.y - dy), Math.max(12, window.innerHeight - 78)),
    };
  }

  if (mode.value === 'radial') {
    const rect = { x: window.innerWidth - buttonPos.value.x - 33, y: window.innerHeight - buttonPos.value.y - 33 };
    const dxCenter = event.clientX - rect.x;
    const dyCenter = event.clientY - rect.y;
    const distanceCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);
    if (distanceCenter < 72 || distanceCenter > 160) {
      hoveredIndex.value = null;
      return;
    }
    let angle = (Math.atan2(dyCenter, dxCenter) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    const sliceAngle = 360 / props.items.length;
    hoveredIndex.value = Math.floor(((angle + sliceAngle / 2) % 360) / sliceAngle);
  }
}

function finalizePointer() {
  clearPressTimer();
  if (mode.value === 'radial' && hoveredIndex.value != null && props.items[hoveredIndex.value]) {
    emit('select', props.items[hoveredIndex.value].key);
  }
  open.value = false;
  hoveredIndex.value = null;
  mode.value = 'idle';
  isPointerActive.value = false;
}

function handlePointerMoveButton(event: PointerEvent) {
  if (isMobileViewport()) event.preventDefault();
  handlePointerMove(event);
}

function handlePointerUpButton() {
  if (isMobileViewport() && mode.value === 'press') {
    clearPressTimer();
    mode.value = 'radial';
    open.value = true;
    hoveredIndex.value = null;
    return;
  }
  finalizePointer();
}

useEventListener(window, 'pointermove', event => {
  handlePointerMove(event);
});

useEventListener(window, 'pointerup', () => {
  if (isPointerActive.value) finalizePointer();
});

useEventListener(window, 'pointercancel', () => {
  if (isPointerActive.value) finalizePointer();
});
</script>

<style scoped>
.radial-root {
  position: fixed;
  z-index: 35;
}
.radial-backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
}
.radial-overlay {
  position: absolute;
  width: 320px;
  height: 320px;
  pointer-events: none;
}
.radial-svg {
  overflow: visible;
}
.radial-slice {
  fill: color-mix(in srgb, var(--demo-surface-panel-deep) 90%, transparent);
  stroke: color-mix(in srgb, var(--demo-color-neon) 56%, transparent);
  stroke-width: 3;
  transition:
    fill 0.18s ease,
    stroke 0.18s ease,
    filter 0.18s ease;
}
.radial-slice.active {
  fill: color-mix(in srgb, var(--demo-color-neon) 22%, transparent);
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--demo-color-neon) 28%, transparent));
}
.radial-slice.hovered {
  fill: color-mix(in srgb, var(--demo-color-neon) 34%, transparent);
  stroke: var(--demo-color-neon);
  filter: drop-shadow(0 0 14px color-mix(in srgb, var(--demo-color-neon) 36%, transparent));
}
.radial-core {
  fill: color-mix(in srgb, var(--demo-surface-panel-deep) 94%, transparent);
  stroke: color-mix(in srgb, var(--demo-color-neon) 56%, transparent);
  stroke-width: 3;
}
.radial-core-inner {
  fill: transparent;
  stroke: color-mix(in srgb, var(--demo-color-neon) 22%, transparent);
  stroke-width: 2;
}
.radial-core-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 64px;
  height: 64px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--demo-color-neon) 30%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
  font-size: 24px;
  box-shadow: inset 0 0 18px color-mix(in srgb, var(--demo-color-neon) 10%, transparent);
}
.radial-label,
.radial-sub,
.radial-trigger {
  font-family: var(--demo-font-mono);
}
.radial-label {
  fill: var(--demo-text-accent);
  font-size: 12px;
  letter-spacing: 0.08em;
}
.radial-label.compact {
  font-size: 11px;
  letter-spacing: 0.04em;
}
.radial-sub {
  fill: color-mix(in srgb, var(--demo-text-panel-strong) 72%, transparent);
  font-size: 9px;
}
.radial-trigger {
  position: relative;
  width: 66px;
  height: 66px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--surface) 32%, transparent);
  color: var(--demo-text-accent);
  font-size: 24px;
  box-shadow: 0 12px 30px color-mix(in srgb, var(--shadow-color) 80%, transparent);
  touch-action: none;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}
.radial-trigger.pressing {
  transform: scale(0.92);
  box-shadow: 0 0 20px color-mix(in srgb, var(--demo-color-neon) 34%, transparent);
}
.radial-trigger.active {
  border-color: var(--demo-color-neon);
  box-shadow:
    0 0 22px color-mix(in srgb, var(--demo-color-neon) 28%, transparent),
    0 12px 30px color-mix(in srgb, var(--shadow-color) 80%, transparent);
}
.radial-count {
  position: absolute;
  right: -2px;
  top: -2px;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--demo-color-neon);
  color: var(--primary-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}
.radial-fade-enter-active,
.radial-fade-leave-active {
  transition: opacity 0.18s ease;
}
.radial-fade-enter-from,
.radial-fade-leave-to {
  opacity: 0;
}
@media (max-width: 760px) {
  .radial-label {
    font-size: 10px;
  }

  .radial-label.compact {
    font-size: 9px;
  }

  .radial-trigger {
    width: 58px;
    height: 58px;
    font-size: 21px;
  }

  .radial-count {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }
}
</style>
