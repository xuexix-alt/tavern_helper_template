<template>
  <transition name="pre-beta-slide">
    <div v-if="open" class="pre-beta-modal-root">
      <div class="pre-beta-modal-backdrop" aria-hidden="true" @click="emit('close')"></div>
      <aside class="pre-beta-modal-panel" role="dialog" aria-modal="true" aria-label="Beta 画廊诊断">
        <header class="pre-beta-modal-head">
          <div>
            <span class="demo-kicker">BETA // NATIVE IMAGE TRACE</span>
            <strong>正文图复现诊断</strong>
            <p>只读追踪：身份 → 阶段 → 媒体 → 宿主原生手势。</p>
          </div>
          <button type="button" class="pre-beta-close" aria-label="关闭 Beta 画廊诊断" @click="emit('close')">×</button>
        </header>

        <div class="pre-beta-modal-body">
          <section class="pre-beta-phone">
            <div>
              <span class="pre-beta-eyebrow">PHONE BRIDGE</span>
              <strong>{{ phoneStatusTitle }}</strong>
              <small>{{ phoneStatusDetail }}</small>
            </div>
            <button type="button" class="pre-beta-scan" @click="redetectPhone">重新检测手机</button>
          </section>

          <section class="pre-beta-summary">
            <div>
              <span class="pre-beta-eyebrow">SCAN</span>
              <strong>{{ result.refs.length }} 条图片引用</strong>
              <small>{{
                result.selectedMessageId === null ? '未命中楼层' : `楼层 #${result.selectedMessageId}`
              }}</small>
            </div>
            <button type="button" class="pre-beta-scan" @click="scanNow('beta_manual')">重新扫描</button>
          </section>

          <p class="pre-beta-contract">
            <span class="pre-beta-contract-dot"></span>
            本面板不会触发 <code>generate-image-request</code>，不会写入插件图片缓存。
          </p>

          <div v-if="result.refs.length === 0" class="pre-beta-empty">
            <strong>没有找到可追踪引用</strong>
            <span>{{ result.diagnostics.at(-1) ?? '等待正文或插件节点出现' }}</span>
          </div>

          <div v-else class="pre-beta-list">
            <article
              v-for="entry in result.refs"
              :key="entry.id"
              class="pre-beta-card"
              :data-pre-gallery-beta-ref="entry.lightKey"
              :data-message-id="entry.messageId"
              :data-swipe-id="entry.swipeId"
              :data-request-id="entry.requestId || undefined"
              :data-image-id="entry.imageId || undefined"
            >
              <div class="pre-beta-card-head">
                <div>
                  <span class="pre-beta-eyebrow"
                    >REF {{ entry.createdOrder === undefined ? '—' : entry.createdOrder + 1 }}</span
                  >
                  <strong>楼层 #{{ entry.messageId }} · swipe {{ entry.swipeId }}</strong>
                </div>
                <span class="pre-beta-stage" :class="`is-${diagnosticFor(entry).stage}`">
                  {{ diagnosticFor(entry).stage }}
                </span>
              </div>

              <div class="pre-beta-card-main">
                <div class="pre-beta-preview" :class="{ pending: !entry.src }">
                  <img v-if="entry.src" :src="entry.src" alt="正文图复现预览" />
                  <span v-else>PLACEHOLDER</span>
                </div>

                <dl class="pre-beta-facts">
                  <div>
                    <dt>media</dt>
                    <dd>{{ diagnosticFor(entry).mediaState }}</dd>
                  </div>
                  <div>
                    <dt>identity</dt>
                    <dd>{{ diagnosticFor(entry).identityState }}</dd>
                  </div>
                  <div>
                    <dt>requestId</dt>
                    <dd>{{ entry.requestId || '—' }}</dd>
                  </div>
                  <div>
                    <dt>imageId</dt>
                    <dd>{{ entry.imageId || '—' }}</dd>
                  </div>
                  <div>
                    <dt>regex</dt>
                    <dd :title="entry.regex || undefined">{{ entry.regex || '—' }}</dd>
                  </div>
                  <div>
                    <dt>tag</dt>
                    <dd :title="entry.tag || undefined">{{ entry.tag || '—' }}</dd>
                  </div>
                  <div>
                    <dt>link</dt>
                    <dd :title="entry.link || undefined">{{ entry.link || '—' }}</dd>
                  </div>
                  <div>
                    <dt>source</dt>
                    <dd>{{ entry.sources.join(' + ') || '—' }}</dd>
                  </div>
                </dl>
              </div>

              <div class="pre-beta-target">
                <span class="pre-beta-eyebrow">HOST TARGET</span>
                <strong>{{ diagnosticFor(entry).hostTargetKind }}</strong>
                <small>{{ resolveInteraction(entry).reason }}</small>
                <span class="pre-beta-target-long">长按目标：{{ diagnosticFor(entry).longPressTargetKind }}</span>
              </div>

              <div class="pre-beta-actions">
                <button type="button" @click="runGesture(entry, 'click')">测试单击</button>
                <button type="button" :disabled="!entry.src" @click="runGesture(entry, 'dblclick')">测试双击</button>
                <button type="button" @click="runLongPress(entry)">测试长按</button>
              </div>
            </article>
          </div>

          <section v-if="actionLogs.length" class="pre-beta-log">
            <div class="pre-beta-log-head">
              <span class="pre-beta-eyebrow">ACTION TRACE</span>
              <button type="button" @click="actionLogs = []">清空</button>
            </div>
            <ol>
              <li v-for="(item, index) in actionLogs" :key="`${item.createdAt}-${index}`">
                <strong>{{ item.title }}</strong>
                <span>{{ item.detail }}</span>
              </li>
            </ol>
          </section>
        </div>
      </aside>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  beginPreGalleryImageRefLongPress,
  classifyPreGalleryImageRef,
  dispatchPreGalleryImageRefGesture,
  finishPreGalleryImageRefLongPress,
  PRE_GALLERY_NATIVE_LONG_PRESS_MS,
  resolvePreGalleryHostInteraction,
  scanLatestPreGalleryImageRefs,
  type PreGalleryGestureMode,
  type PreGalleryHostInteraction,
  type PreGalleryImageRef,
  type PreGalleryScanResult,
} from '../preGalleryImageRefs';
import type { PreGalleryLogItem } from '../types';
import type { PrePhoneAvailability } from '../phoneBridge';

const props = defineProps<{ open: boolean; phoneAvailability: PrePhoneAvailability }>();
const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'gallery-log', item: PreGalleryLogItem): void;
  (event: 'phone-redetect'): void;
}>();

const phoneStatusTitle = computed(() => {
  if (props.phoneAvailability === 'available') return '手机已连接';
  if (props.phoneAvailability === 'unavailable') return '手机运行时不可用';
  return '手机运行时离线';
});
const phoneStatusDetail = computed(() => {
  if (props.phoneAvailability === 'available') return 'Pre 已连接当前角色卡的手机运行时。';
  if (props.phoneAvailability === 'unavailable') return '已发现运行时，但角色适配器尚未就绪或不匹配。';
  return '未发现 window.top.TavernPhone，可手动重新检测。';
});

const result = ref<PreGalleryScanResult>({
  reason: 'beta_init',
  scannedAt: 0,
  selectedMessageId: null,
  refs: [],
  sourceCounts: { 'host-dom': 0, 'pre-render': 0, 'extra.images': 0, mes_tag: 0, cache: 0 },
  diagnostics: ['打开 Beta 后扫描正文图片引用'],
});
const actionLogs = ref<Array<{ createdAt: string; title: string; detail: string }>>([]);
let longPressTimer = 0;

function scanNow(reason: string) {
  result.value = scanLatestPreGalleryImageRefs({ reason, scanLimit: 1 });
}

function resolveInteraction(entry: PreGalleryImageRef): PreGalleryHostInteraction {
  return resolvePreGalleryHostInteraction(entry);
}

function diagnosticFor(entry: PreGalleryImageRef) {
  const interaction = resolveInteraction(entry);
  return classifyPreGalleryImageRef(entry, interaction);
}

function logAction(title: string, detail: string, type: PreGalleryLogItem['type'] = 'action') {
  const createdAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  actionLogs.value = [{ createdAt, title, detail }, ...actionLogs.value].slice(0, 12);
  emit('gallery-log', { type, title, detail });
}

async function redetectPhone() {
  emit('phone-redetect');
  await nextTick();
  logAction(
    '手机桥重新检测',
    `${phoneStatusTitle.value} · ${phoneStatusDetail.value}`,
    props.phoneAvailability === 'available' ? 'action' : 'info',
  );
}

function runGesture(entry: PreGalleryImageRef, mode: PreGalleryGestureMode) {
  const state = diagnosticFor(entry);
  if (mode === 'dblclick' && !entry.src) {
    logAction('双击已阻止', `楼层 #${entry.messageId} 仍是 ${state.mediaState}，不会把占位误判为成品图`, 'info');
    return;
  }
  const dispatch = dispatchPreGalleryImageRefGesture(entry, mode);
  logAction(
    `${mode} · ${dispatch.ok ? '派发成功' : '未命中'}`,
    `#${entry.messageId} / ${dispatch.method} / ${dispatch.target} / ${dispatch.reason}`,
    dispatch.ok ? 'action' : 'error',
  );
}

function runLongPress(entry: PreGalleryImageRef) {
  window.clearTimeout(longPressTimer);
  const session = beginPreGalleryImageRefLongPress(entry);
  if (!session) {
    logAction('longpress · 未命中', `#${entry.messageId} / ${resolveInteraction(entry).reason}`, 'error');
    return;
  }
  longPressTimer = window.setTimeout(() => {
    const ok = finishPreGalleryImageRefLongPress(session);
    logAction(
      `longpress · ${ok ? '派发成功' : '派发失败'}`,
      `#${entry.messageId} / ${session.targetKind} / mousedown → ${PRE_GALLERY_NATIVE_LONG_PRESS_MS}ms → mouseup`,
      ok ? 'action' : 'error',
    );
  }, PRE_GALLERY_NATIVE_LONG_PRESS_MS);
}

watch(
  () => props.open,
  open => {
    if (open) scanNow('beta_open');
  },
);

onMounted(() => {
  if (props.open) scanNow('beta_mount');
});

onBeforeUnmount(() => window.clearTimeout(longPressTimer));
</script>

<style scoped>
.pre-beta-modal-root {
  position: fixed;
  inset: 0;
  z-index: 44;
  pointer-events: none;
}

.pre-beta-modal-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, black 28%, transparent);
  pointer-events: auto;
}

.pre-beta-modal-panel {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  width: min(680px, 94vw);
  height: 100%;
  overflow: hidden;
  pointer-events: auto;
  border-left: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  box-shadow: -18px 0 48px color-mix(in srgb, black 32%, transparent);
  backdrop-filter: blur(22px);
}

.pre-beta-modal-head,
.pre-beta-phone,
.pre-beta-summary,
.pre-beta-card-head,
.pre-beta-log-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.pre-beta-modal-head {
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}

.pre-beta-modal-head strong,
.pre-beta-summary strong,
.pre-beta-card-head strong {
  display: block;
  color: var(--demo-text-primary);
}

.pre-beta-modal-head p,
.pre-beta-phone small,
.pre-beta-target small,
.pre-beta-empty span,
.pre-beta-summary small {
  display: block;
  margin: 5px 0 0;
  color: var(--demo-text-secondary);
  font-size: 11px;
}

.pre-beta-close,
.pre-beta-scan,
.pre-beta-actions button,
.pre-beta-log-head button {
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 40%, transparent);
  color: var(--demo-text-primary);
  cursor: pointer;
}

.pre-beta-close {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  font-size: 20px;
}

.pre-beta-modal-body {
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 28px;
}

.pre-beta-summary {
  align-items: center;
  padding: 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.pre-beta-phone {
  align-items: center;
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--demo-text-accent) 6%, transparent);
}

.pre-beta-phone strong {
  display: block;
  color: var(--demo-text-primary);
}

.pre-beta-eyebrow {
  display: block;
  color: var(--demo-text-accent);
  font: 10px var(--pre-font-mono, monospace);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pre-beta-scan,
.pre-beta-actions button,
.pre-beta-log-head button {
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 11px;
}

.pre-beta-contract {
  margin: 10px 0;
  padding: 8px 10px;
  border-left: 2px solid var(--demo-text-accent);
  color: var(--demo-text-secondary);
  font-size: 11px;
}

.pre-beta-contract-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--demo-text-accent);
}

.pre-beta-contract code,
.pre-beta-facts dd,
.pre-beta-target,
.pre-beta-log li {
  font-family: var(--pre-font-mono, monospace);
}

.pre-beta-empty {
  padding: 28px 12px;
  text-align: center;
  border: 1px dashed var(--demo-border-accent-soft);
}

.pre-beta-list {
  display: grid;
  gap: 12px;
}

.pre-beta-card {
  padding: 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 38%, transparent);
}

.pre-beta-stage {
  padding: 3px 6px;
  border: 1px solid currentColor;
  color: var(--demo-text-secondary);
  font: 10px var(--pre-font-mono, monospace);
  text-transform: uppercase;
}

.pre-beta-stage.is-ready {
  color: #63d7a4;
}
.pre-beta-stage.is-placeholder {
  color: #f1ba66;
}
.pre-beta-stage.is-tag-only {
  color: #aab2c0;
}

.pre-beta-card-main {
  display: grid;
  grid-template-columns: minmax(120px, 0.42fr) minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.pre-beta-preview {
  display: grid;
  min-height: 126px;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--demo-border-accent-soft);
  background: #111822;
  color: #f1ba66;
  font: 10px var(--pre-font-mono, monospace);
}

.pre-beta-preview img {
  width: 100%;
  height: 100%;
  min-height: 126px;
  object-fit: cover;
}

.pre-beta-facts {
  display: grid;
  gap: 5px;
  min-width: 0;
  margin: 0;
}

.pre-beta-facts div {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 6px;
}
.pre-beta-facts dt {
  color: var(--demo-text-secondary);
  font-size: 10px;
  text-transform: uppercase;
}
.pre-beta-facts dd {
  min-width: 0;
  overflow: hidden;
  margin: 0;
  color: var(--demo-text-primary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pre-beta-target {
  display: grid;
  gap: 3px;
  margin-top: 12px;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--demo-text-accent) 30%, transparent);
  background: color-mix(in srgb, var(--demo-text-accent) 5%, transparent);
  font-size: 11px;
}

.pre-beta-target-long {
  color: var(--demo-text-secondary);
  font-size: 10px;
}

.pre-beta-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.pre-beta-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}
.pre-beta-actions button:hover:not(:disabled),
.pre-beta-scan:hover,
.pre-beta-log-head button:hover {
  border-color: var(--demo-text-accent);
}

.pre-beta-log {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--demo-border-accent-soft);
}
.pre-beta-log ol {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding-left: 18px;
}
.pre-beta-log li {
  display: grid;
  gap: 2px;
  color: var(--demo-text-secondary);
  font-size: 10px;
}
.pre-beta-log li strong {
  color: var(--demo-text-primary);
}

@media (max-width: 520px) {
  .pre-beta-modal-panel {
    width: 100%;
  }
  .pre-beta-card-main {
    grid-template-columns: 104px minmax(0, 1fr);
  }
  .pre-beta-preview,
  .pre-beta-preview img {
    min-height: 104px;
  }
}

.pre-beta-slide-enter-active,
.pre-beta-slide-leave-active {
  transition: opacity 180ms ease;
}
.pre-beta-slide-enter-active .pre-beta-modal-panel,
.pre-beta-slide-leave-active .pre-beta-modal-panel {
  transition: transform 220ms ease;
}
.pre-beta-slide-enter-from,
.pre-beta-slide-leave-to {
  opacity: 0;
}
.pre-beta-slide-enter-from .pre-beta-modal-panel,
.pre-beta-slide-leave-to .pre-beta-modal-panel {
  transform: translateX(100%);
}
</style>
