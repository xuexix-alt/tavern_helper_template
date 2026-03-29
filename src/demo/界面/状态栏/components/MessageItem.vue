<template>
  <div v-if="isSystem" class="flex w-full justify-center py-6">
    <div class="relative border border-primary/50 bg-surface/80 px-8 py-3 font-mono text-xs tracking-widest text-primary uppercase clip-corner-sm overflow-hidden flex items-center gap-3">
      <div class="absolute top-0 left-0 w-full h-[1px] bg-primary/50"></div>
      <div class="absolute bottom-0 left-0 w-full h-[1px] bg-primary/50"></div>
      <span class="animate-pulse">⚠️</span>
      <span>[ SYS_ALERT ] <TypewriterText :text="message.content" :speed="30" /></span>
    </div>
  </div>

  <div v-else-if="isUser" class="w-full flex justify-end my-4 pl-12 pr-4">
    <div class="user-message-bubble font-mono text-sm text-primary/90 text-right break-words max-w-2xl bg-primary/5 border-r-2 border-primary/50 pr-4 py-2 relative">
      <div class="user-message-deco absolute top-0 right-0 w-2 h-[1px] bg-primary/50"></div>
      <div class="user-message-deco absolute bottom-0 right-0 w-2 h-[1px] bg-primary/50"></div>
      <span>{{ message.content }}</span>
    </div>
  </div>

  <div v-else class="group relative flex w-full flex-col py-8 px-6 transition-colors duration-500">
    <div class="flex w-full max-w-3xl flex-col gap-3 items-start relative hud-panel p-6 sm:p-8 clip-corner">
      <div class="crosshair-tl"></div>
      <div class="crosshair-tr"></div>
      <div class="crosshair-bl"></div>
      <div class="crosshair-br"></div>

      <div class="absolute -top-3 left-6 bg-background px-3 font-mono text-[10px] text-primary tracking-widest uppercase flex items-center gap-3 border border-primary/30">
        <span :class="{ 'animate-spin': message.isStreaming }">⚡</span>
        {{ message.isStreaming ? 'PROCESSING_DATA_STREAM...' : 'DATA_MODULE_SECURE' }}
        <span class="opacity-40">|</span>
        <span class="opacity-60">ID: {{ message.id.substring(0,6).toUpperCase() }}</span>
      </div>

      <div class="relative w-full mt-2">
        <div class="whitespace-pre-wrap break-words text-foreground tracking-wide transition-all duration-300" :class="[fontClass, sizeClass, leadingClass]">
          <TypewriterText :text="message.content" :isStreaming="message.isStreaming" :speed="15" />
        </div>
      </div>

      <div v-if="message.meta && density !== 'minimal' && !message.isStreaming" class="mt-4 flex flex-col gap-3 w-full border-t border-primary/20 pt-4">
        <button 
          @click="showMeta = !showMeta"
          class="group flex w-fit items-center gap-1.5 border border-primary/30 bg-surface/50 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-primary/60 transition-all hover:bg-primary/10 hover:text-primary clip-corner-sm"
        >
          <span :class="{ 'rotate-180': showMeta }" class="transition-transform duration-200">▼</span>
          <span>{{ showMeta ? '[ HIDE_DIAGNOSTICS ]' : '[ SHOW_DIAGNOSTICS ]' }}</span>
        </button>
        
        <Transition name="fade">
          <div v-if="showMeta" class="overflow-hidden">
            <div class="flex flex-col gap-4 border border-primary/20 bg-background/80 p-4 font-mono text-xs relative clip-corner-sm">
              <div class="absolute left-0 top-0 bottom-0 w-1 bg-primary/30"></div>
              
              <div class="flex flex-wrap gap-6 text-primary/80 pl-2">
                <div v-if="message.meta.model" class="flex items-center gap-2">
                  <span class="opacity-50">MODEL:</span>
                  <span>{{ message.meta.model }}</span>
                </div>
                <div v-if="message.meta.timeMs" class="flex items-center gap-2">
                  <span class="opacity-50">LATENCY:</span>
                  <span>{{ message.meta.timeMs }}ms</span>
                </div>
                <div v-if="message.meta.tokens" class="flex items-center gap-2">
                  <span class="opacity-50">TOKENS:</span>
                  <span>{{ message.meta.tokens }}</span>
                </div>
              </div>

              <div v-if="message.meta.raw" class="w-full border-t border-primary/20 pt-3 mt-1 pl-2">
                <span class="mb-2 block text-[10px] opacity-50 tracking-widest">
                  &gt; RAW_OUTPUT_DUMP:
                </span>
                <div class="bg-surface/50 p-3 border border-primary/10 clip-corner-sm">
                  <code class="block whitespace-pre-wrap text-[10px] leading-relaxed text-primary/70">
                    {{ message.meta.raw }}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Message, Density } from '../types/message';
import { useTypography } from '../contexts/TypographyContext';
import TypewriterText from './TypewriterText.vue';

const props = withDefaults(defineProps<{
  message: Message;
  density?: Density;
}>(), {
  density: 'comfortable',
});

const showMeta = ref(false);

const { fontClass, sizeClass, leadingClass } = useTypography();

const isUser = computed(() => props.message.role === 'user');
const isAssistant = computed(() => props.message.role === 'assistant');
const isSystem = computed(() => props.message.role === 'system');
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, height 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  height: 0;
}
</style>
