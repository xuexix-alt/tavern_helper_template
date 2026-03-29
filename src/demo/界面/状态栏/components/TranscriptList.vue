<template>
  <div 
    ref="scrollRef"
    class="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth pb-40 pt-4"
    :class="[fontClass, sizeClass, leadingClass]"
  >
    <div class="mx-auto flex max-w-4xl flex-col px-4">
      <div v-if="messages.length === 0" class="flex h-full flex-col items-center justify-center pt-40 text-foreground/40">
        <div class="text-5xl mb-6 opacity-50">📖</div>
        <div class="font-serif text-2xl italic">对话记录为空</div>
        <div class="mt-2 font-sans text-sm tracking-wide uppercase">等待您的输入以开始</div>
      </div>
      <MessageItem 
        v-else
        v-for="msg in messages" 
        :key="msg.id" 
        :message="msg" 
        :density="density"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { UI_Message, Density } from '../types/message';
import { useTypography } from '../contexts/TypographyContext';
import MessageItem from './MessageItem.vue';

const props = defineProps<{
  messages: UI_Message[];
  density: Density;
}>();

const scrollRef = ref<HTMLElement | null>(null);
const { fontClass, sizeClass, leadingClass } = useTypography();

watch(() => props.messages, async () => {
  await nextTick();
  if (scrollRef.value) {
    const { scrollHeight, clientHeight } = scrollRef.value;
    scrollRef.value.scrollTo({
      top: scrollHeight - clientHeight,
      behavior: 'smooth',
    });
  }
}, { deep: true });
</script>
