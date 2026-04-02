<template>
  <div v-if="isSystem" class="w-full py-3">
    <div class="rounded-sm border border-primary/15 bg-surface/45 px-4 py-3 font-mono text-[11px] tracking-[0.18em] text-primary/70">
      <div class="flex items-center gap-2">
        <span class="text-primary">SYS</span>
        <span class="opacity-60">/</span>
        <span class="uppercase">系统提示</span>
      </div>
      <div class="mt-2 whitespace-pre-wrap break-words text-[13px] tracking-normal text-foreground/75">
        <TypewriterText :text="message.content" :speed="30" />
      </div>
    </div>
  </div>

  <div v-else-if="isUser" class="flex w-full justify-end py-2">
    <div class="max-w-[78%] border-l border-primary/20 bg-primary/[0.03] px-4 py-3 text-right text-[14px] leading-7 text-foreground/78 sm:text-[15px]">
      <span class="whitespace-pre-wrap break-words">{{ message.content }}</span>
    </div>
  </div>

  <article v-else class="w-full py-2 sm:py-3">
    <div class="mb-3 flex items-center gap-3 border-b border-primary/10 pb-2 font-mono text-[10px] tracking-[0.2em] text-primary/55">
      <span class="rounded-sm border border-primary/15 px-2 py-1">
        {{ message.isStreaming ? '生成中' : '正文' }}
      </span>
      <span class="truncate opacity-70">ID {{ message.id.substring(0, 6).toUpperCase() }}</span>
    </div>

    <div class="border-l-2 border-primary/25 pl-4 sm:pl-6">
      <div
        class="whitespace-pre-wrap break-words text-[16px] leading-[1.9] text-foreground/92 sm:text-[17px]"
        :class="[fontClass, leadingClass]"
      >
        <TypewriterText :text="message.content" :isStreaming="message.isStreaming" :speed="15" />
      </div>
    </div>

    <div v-if="message.meta && density !== 'minimal' && !message.isStreaming" class="mt-5 border-t border-primary/10 pt-3">
      <button
        @click="showMeta = !showMeta"
        class="inline-flex items-center gap-2 rounded-sm border border-primary/15 px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <span>{{ showMeta ? '收起详情' : '展开详情' }}</span>
      </button>

      <Transition name="fade">
        <div v-if="showMeta" class="mt-3 space-y-3 rounded-sm border border-primary/10 bg-background/45 px-4 py-4 font-mono text-[11px] text-primary/70">
          <div class="flex flex-wrap gap-4">
            <div v-if="message.meta.model">模型：{{ message.meta.model }}</div>
            <div v-if="message.meta.timeMs">耗时：{{ message.meta.timeMs }}ms</div>
            <div v-if="message.meta.tokens">词符：{{ message.meta.tokens }}</div>
          </div>

          <div v-if="message.meta.raw" class="border-t border-primary/10 pt-3">
            <div class="mb-2 text-[10px] tracking-[0.18em] text-primary/45">原始输出</div>
            <code class="block whitespace-pre-wrap break-words text-[11px] leading-6 text-foreground/65">
              {{ message.meta.raw }}
            </code>
          </div>
        </div>
      </Transition>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Density, Message } from '../types/message';
import { useTypography } from '../contexts/TypographyContext';
import TypewriterText from './TypewriterText.vue';

const props = withDefaults(
  defineProps<{
    message: Message;
    density?: Density;
  }>(),
  {
    density: 'comfortable',
  },
);

const showMeta = ref(false);
const { fontClass, leadingClass } = useTypography();

const isUser = computed(() => props.message.role === 'user');
const isSystem = computed(() => props.message.role === 'system');
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
