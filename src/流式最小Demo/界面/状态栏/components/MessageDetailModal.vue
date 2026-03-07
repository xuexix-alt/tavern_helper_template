<template>
  <Teleport to="body">
    <div v-if="item" class="detail-mask" @click.self="$emit('close')">
      <div class="detail-modal" role="dialog" aria-modal="true">
        <header class="detail-head">
          <div>
            <h3>楼层 #{{ item.message_id }} 详情</h3>
            <p>
              {{ item.isOpening ? '开局正文' : item.roleLabel }} · {{ item.hidden ? 'hidden' : 'visible' }} ·
              {{ item.phase }}
            </p>
          </div>
          <div class="detail-head-actions">
            <button
              type="button"
              class="detail-danger"
              :disabled="busy || !item.canDeleteFrom"
              @click="$emit('delete-from', item)"
            >
              从此回退删除
            </button>
            <button type="button" class="detail-close" @click="$emit('close')">关闭</button>
          </div>
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
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { TranscriptItem } from '../types';

defineProps<{
  item: TranscriptItem | null;
  busy?: boolean;
}>();

defineEmits<{
  (event: 'close'): void;
  (event: 'delete-from', item: TranscriptItem): void;
}>();
</script>

<style scoped>
.detail-mask {
  position: fixed;
  inset: 0;
  z-index: 2600;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.detail-modal {
  width: min(820px, 100%);
  max-height: min(88vh, 920px);
  overflow: auto;
  border-radius: 14px;
  background: rgba(13, 17, 28, 0.98);
  border: 1px solid rgba(126, 160, 255, 0.2);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.detail-head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-head h3,
.detail-head p,
.detail-section h4 {
  margin: 0;
}

.detail-head p {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(230, 236, 255, 0.68);
}

.detail-close {
  border-radius: 10px;
  border: 1px solid rgba(126, 160, 255, 0.2);
  background: rgba(255, 255, 255, 0.04);
  color: #f3f7ff;
  padding: 8px 12px;
}

.detail-danger {
  border-radius: 10px;
  border: 1px solid rgba(255, 120, 120, 0.28);
  background: rgba(255, 120, 120, 0.14);
  color: #ffd8d8;
  padding: 8px 12px;
}

.detail-danger:disabled,
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
  background: rgba(7, 11, 20, 0.92);
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
  color: rgba(230, 236, 255, 0.68);
}

.detail-html :deep(p) {
  margin: 0 0 0.6em;
}

.detail-html :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
