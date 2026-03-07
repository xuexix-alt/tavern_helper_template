<template>
  <section class="demo-card">
    <div class="demo-card-title">1. 发送区</div>
    <textarea
      :value="modelValue"
      class="demo-textarea"
      rows="4"
      placeholder="输入一段内容，点击发送后会直接在当前界面内走 generate 流式。"
      @input="onInput"
    />
    <div class="demo-actions">
      <button type="button" class="demo-button" :disabled="busy" @click="$emit('submit')">
        {{ busy ? '生成中…' : '发送并流式写回' }}
      </button>
      <button type="button" class="demo-button ghost" :disabled="busy" @click="$emit('refresh')">刷新历史</button>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'submit'): void;
  (event: 'refresh'): void;
}>();

function onInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update:modelValue', target?.value ?? '');
}
</script>

<style scoped>
.demo-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(20, 28, 46, 0.9);
  border: 1px solid rgba(126, 160, 255, 0.18);
}

.demo-card-title {
  font-size: 13px;
  font-weight: 700;
}

.demo-textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 96px;
  border-radius: 10px;
  border: 1px solid rgba(126, 160, 255, 0.25);
  background: rgba(7, 11, 20, 0.92);
  color: #f3f7ff;
  padding: 10px;
}

.demo-actions {
  display: flex;
  gap: 8px;
}

.demo-button {
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #78a0ff, #5fd0ff);
  color: #07111f;
  font-weight: 700;
  padding: 9px 12px;
  min-height: 40px;
}

.demo-button.ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #f3f7ff;
}

.demo-button:disabled {
  opacity: 0.6;
}
</style>
