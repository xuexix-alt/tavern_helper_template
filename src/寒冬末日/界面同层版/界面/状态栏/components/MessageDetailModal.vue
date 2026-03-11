<template>
  <Teleport to="body">
    <div v-if="item" class="detail-mask" @click.self="$emit('close')">
      <aside class="detail-drawer" role="dialog" aria-modal="false">
        <header class="detail-head">
          <div>
            <h3>楼层 #{{ item.message_id }} 详情</h3>
            <p>
              {{ item.isOpening ? '开局正文' : item.roleLabel }} · {{ item.hidden ? 'hidden' : 'visible' }} ·
              {{ item.phase }}
            </p>
          </div>
          <button type="button" class="detail-close" @click="$emit('close')">关闭</button>
        </header>

        <section class="detail-section">
          <h4>Meta</h4>
          <ul class="detail-meta-list">
            <li>message_id: {{ item.message_id }}</li>
            <li>role: {{ item.role }}</li>
            <li>hidden: {{ item.hidden }}</li>
            <li>phase: {{ item.phase }}</li>
            <li>opening: {{ item.isOpening }}</li>
            <li>options: {{ item.options.length }}</li>
            <li>raw length: {{ item.raw.length }}</li>
          </ul>
        </section>

        <section class="detail-section">
          <h4>Raw</h4>
          <pre class="detail-pre">{{ item.raw || '(空)' }}</pre>
        </section>

        <section class="detail-section">
          <h4>Regex 后文本</h4>
          <pre class="detail-pre">{{ item.regexText || '(空)' }}</pre>
        </section>

        <section class="detail-section">
          <h4>Option</h4>
          <div v-if="item.options.length === 0" class="detail-empty">无选项</div>
          <ul v-else class="detail-option-list">
            <li v-for="option in item.options" :key="option">{{ option }}</li>
          </ul>
        </section>

        <section class="detail-section">
          <h4>最终渲染预览</h4>
          <div class="detail-html" v-html="item.finalHtml || '<p>(空)</p>'"></div>
        </section>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { TranscriptItem } from '../types';

defineProps<{
  item: TranscriptItem | null;
}>();

defineEmits<{
  (event: 'close'): void;
}>();
</script>

<style scoped>
.detail-mask {
  position: fixed;
  inset: 0;
  z-index: 2600;
  background: var(--demo-surface-overlay);
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  padding: 0;
}

.detail-drawer {
  width: min(560px, 100%);
  height: 100%;
  overflow: auto;
  background: var(--demo-surface-modal);
  border-left: 1px solid var(--demo-border-accent);
  box-shadow: var(--demo-shadow-drawer);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  position: sticky;
  top: 0;
  z-index: 1;
  padding-bottom: 6px;
  background: var(--demo-surface-modal);
}

.detail-head h3,
.detail-head p,
.detail-section h4 {
  margin: 0;
}

.detail-head p {
  margin-top: 4px;
  font-size: 12px;
  color: var(--demo-text-muted);
}

.detail-close {
  border-radius: 10px;
  border: 1px solid var(--demo-border-accent-muted);
  background: var(--demo-surface-neutral-soft);
  color: var(--demo-text-primary);
  padding: 8px 12px;
}

.detail-close:disabled {
  opacity: 0.55;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-pre,
.detail-html,
.detail-meta-list,
.detail-option-list {
  margin: 0;
  padding: 10px;
  border-radius: 10px;
  background: var(--demo-surface-panel-strong);
}

@media (max-width: 680px) {
  .detail-drawer {
    width: 100%;
  }
}

.detail-pre {
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  line-height: 1.5;
}

.detail-meta-list,
.detail-option-list {
  padding-left: 22px;
}

.detail-empty {
  font-size: 12px;
  color: var(--demo-text-muted);
}

.detail-html :deep(p) {
  margin: 0 0 0.6em;
}

.detail-html :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
