<template>
  <div class="stream-card">
    <div class="stream-header">
      <div class="stream-title">
        <span class="live-dot" :class="{ streaming: context.during_streaming }"></span>
        <span class="title-text">{{ ui.streaming.title }}</span>
        <span v-if="context.during_streaming" class="streaming-hint">{{ ui.streaming.streamingHint }}</span>
      </div>
      <div class="stream-meta">{{ ui.streaming.floorPrefix }} {{ context.message_id }} {{ ui.streaming.floorSuffix }}</div>
    </div>

    <div class="stream-body">
      <pre class="stream-content">{{ contentText || ui.streaming.empty }}<span v-if="context.during_streaming">_</span></pre>

      <details v-if="summaryText" class="stream-fold">
        <summary>{{ ui.streaming.summary }}</summary>
        <pre>{{ summaryText }}</pre>
      </details>

      <details v-if="optionText" class="stream-fold">
        <summary>{{ ui.streaming.options }}</summary>
        <pre>{{ optionText }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { injectStreamingMessageContext } from '@util/streaming';
import uiSpec from './shared/ui-spec-for-designers.json';

const context = injectStreamingMessageContext();
const ui = uiSpec.uiTexts;

function extractTag(text: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? '';
}

function removeTagBlock(text: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi');
  return text.replace(pattern, '').trim();
}

const contentText = computed(() => {
  const raw = String(context.message ?? '');
  const contentDirect = extractTag(raw, 'content');
  if (contentDirect) return contentDirect;

  const gameBlock = extractTag(raw, 'game');
  if (gameBlock) {
    const inner = extractTag(gameBlock, 'content');
    if (inner) return inner;
  }

  let cleaned = raw;
  [
    'summary',
    'option',
    'roleplay_options',
    'update',
    'updatevariable',
    'json_patch',
    'jsonpatch',
    'analysis',
    'thought',
    'review',
    'game',
  ].forEach(tag => {
    cleaned = removeTagBlock(cleaned, tag);
  });

  const stripped = cleaned.trim();
  if (stripped) return stripped;

  const hasUpdateOnly = /<(update|updatevariable|json_patch|jsonpatch)[^>]*>/i.test(raw);
  if (hasUpdateOnly) return ui.streaming.updateOnly;

  return '';
});

const summaryText = computed(() => extractTag(String(context.message ?? ''), 'summary'));
const optionText = computed(() => {
  const option = extractTag(String(context.message ?? ''), 'option');
  if (option) return option;
  return extractTag(String(context.message ?? ''), 'roleplay_options');
});
</script>

<style scoped lang="scss">
.stream-card {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: linear-gradient(135deg, rgba(2, 6, 23, 0.85), rgba(15, 23, 42, 0.95));
  color: #e2e8f0;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.35);
  padding: 12px 14px 14px;
}

.stream-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.stream-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 0.95rem;
}

.stream-meta {
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.7);
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.6);
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.8);
}

.live-dot.streaming {
  background: #60a5fa;
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.8);
}

.streaming-hint {
  font-size: 0.75rem;
  color: #93c5fd;
}

.stream-body {
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stream-content {
  white-space: pre-wrap;
  font-size: 0.92rem;
  line-height: 1.55;
  color: #e2e8f0;
}

.stream-fold {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.6);
}

.stream-fold summary {
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  color: #cbd5f5;
  margin-bottom: 6px;
}

.stream-fold pre {
  white-space: pre-wrap;
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.82);
}
</style>
