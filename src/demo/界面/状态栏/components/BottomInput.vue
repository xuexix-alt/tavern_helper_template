<template>
  <div
    class="sticky bottom-0 z-20 border-t border-primary/10 bg-background/92 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4"
  >
    <div class="mx-auto flex max-w-[760px] flex-col gap-3">
      <div class="flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.18em] text-primary/55">
        <span>输入</span>
        <div class="hidden items-center gap-2 sm:flex">
          <button
            class="rounded-sm border border-primary/15 px-3 py-1 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            角色
          </button>
          <button
            class="rounded-sm border border-primary/15 px-3 py-1 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            重置
          </button>
        </div>
      </div>

      <div
        class="flex items-end gap-3 rounded-sm border border-primary/20 bg-surface/45 px-3 py-2.5 transition-colors"
        :style="{
          boxShadow: isFocused ? '0 0 24px var(--shadow-color)' : '0 8px 20px var(--shadow-color)',
          borderColor: isFocused ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 18%, transparent)',
        }"
      >
        <span class="shrink-0 pt-1 font-mono text-[11px] tracking-[0.18em] text-primary/65">[SYS]&gt;</span>

        <textarea
          ref="textareaRef"
          v-model="input"
          @keydown="handleKeyDown"
          @focus="isFocused = true"
          @blur="isFocused = false"
          placeholder="输入下一段指令或对白……"
          class="max-h-[220px] min-h-[56px] w-full resize-none bg-transparent text-[15px] leading-7 text-foreground placeholder:text-foreground/35 focus:outline-none"
          rows="1"
        />

        <button
          @click="handleSend"
          :disabled="!input.trim() || isStreaming"
          class="inline-flex h-11 shrink-0 items-center justify-center rounded-sm border px-4 font-mono text-[11px] tracking-[0.18em] transition-colors"
          :class="
            input.trim() && !isStreaming
              ? 'border-primary bg-primary text-background hover:bg-primary/85'
              : 'cursor-not-allowed border-primary/10 text-primary/35'
          "
        >
          发送
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const props = defineProps<{
  isStreaming: boolean;
}>();

const emit = defineEmits<{
  send: [text: string];
}>();

const input = ref('');
const isFocused = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

watch(input, () => {
  if (!textareaRef.value) return;
  textareaRef.value.style.height = 'auto';
  textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 220)}px`;
});

const resetTextarea = () => {
  if (!textareaRef.value) return;
  textareaRef.value.style.height = 'auto';
  textareaRef.value.blur();
};

const handleSend = () => {
  if (!input.value.trim() || props.isStreaming) return;
  emit('send', input.value.trim());
  input.value = '';
  resetTextarea();
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
};

onMounted(() => {
  const tavernInput = document.querySelector(
    '#send_form textarea, #gen-form textarea, textarea.rwmb-textarea',
  ) as HTMLTextAreaElement | null;
  if (!tavernInput) return;

  tavernInput.addEventListener('input', currentEvent => {
    input.value = (currentEvent.target as HTMLTextAreaElement).value;
  });
});
</script>
