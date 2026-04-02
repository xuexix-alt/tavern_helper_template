<template>
  <section class="w-full px-4 pb-10 pt-4 sm:px-6 sm:pb-14 sm:pt-6" :class="[fontClass, leadingClass]">
    <div ref="contentRef" class="mx-auto flex max-w-[760px] flex-col gap-6">
      <div
        v-if="messages.length === 0"
        class="rounded-sm border border-primary/10 bg-background/55 px-5 py-8 text-center text-foreground/60 sm:px-8 sm:py-10"
      >
        <div class="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/55">阅读</div>
        <div class="mt-3 font-serif text-xl text-foreground/80 sm:text-2xl">尚无剧情记录</div>
        <div class="mt-3 text-sm leading-7 text-foreground/55 sm:text-[15px]">
          发送第一条输入后，这里会以长正文阅读方式呈现剧情内容。
        </div>
      </div>

      <MessageItem v-for="msg in messages" v-else :key="msg.id" :message="msg" :density="density" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { Density, UI_Message } from '../types/message';
import { useTypography } from '../contexts/TypographyContext';
import MessageItem from './MessageItem.vue';

const props = defineProps<{
  messages: UI_Message[];
  density: Density;
}>();

const contentRef = ref<HTMLElement | null>(null);
const { fontClass, leadingClass } = useTypography();

watch(
  () => props.messages.map(message => `${message.id}:${message.isStreaming ? '1' : '0'}`).join('|'),
  async () => {
    await nextTick();
    const lastElement = contentRef.value?.lastElementChild as HTMLElement | null;
    lastElement?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  },
);
</script>
