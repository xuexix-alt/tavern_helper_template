<template>
  <div class="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-background/80 via-background/40 to-transparent pb-8 pt-16 px-6 pointer-events-none transition-colors duration-300">
    <div class="mx-auto max-w-3xl pointer-events-auto">
      <div class="mb-3 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
        <div class="flex gap-1.5 overflow-x-auto max-w-full pb-1">
          <button
            v-for="char in characters"
            :key="char.id"
            class="flex items-center gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all clip-corner-sm border whitespace-nowrap shrink-0"
            :class="activeCharId === char.id ? 'bg-primary/20 text-primary border-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.2)]' : 'bg-surface/80 text-primary/50 border-primary/30 hover:bg-primary/10 hover:text-primary/80'"
          >
            <div :class="char.status === '活跃' ? 'bg-primary animate-pulse' : char.status === '待命' ? 'bg-yellow-500/50' : 'bg-red-500/50'" class="w-1.5 h-1.5"></div>
            {{ char.name.split(' ')[0].replace(/["']/g, '') }}
          </button>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button class="group flex items-center gap-2 clip-corner-sm border border-primary/50 bg-surface/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary/70 transition-all hover:bg-primary/10 hover:text-primary backdrop-blur-md">
            <span class="transition-transform duration-300 group-hover:-translate-x-0.5">⇄</span>
            <span class="hidden sm:inline">切换</span>
          </button>
          <button class="group flex items-center gap-2 clip-corner-sm border border-primary/50 bg-surface/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary/70 transition-all hover:bg-primary/10 hover:text-primary backdrop-blur-md">
            <span class="transition-transform duration-500 group-hover:rotate-180">↻</span>
            <span class="hidden sm:inline">重置</span>
          </button>
        </div>
      </div>

      <div 
        class="relative flex items-end gap-3 clip-corner bg-surface/40 backdrop-blur-2xl p-1 border border-primary/30 transition-all duration-300"
        :style="{
          boxShadow: isFocused ? '0 0 30px var(--shadow-color), inset 0 0 15px var(--shadow-color)' : '0 10px 30px var(--shadow-color)',
          borderColor: isFocused ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 30%, transparent)'
        }"
      >
        <div class="hud-deco absolute top-0 left-0 w-1.5 h-1.5 bg-primary"></div>
        <div class="hud-deco absolute bottom-0 right-0 w-1.5 h-1.5 bg-primary"></div>

        <div class="flex h-12 w-12 shrink-0 items-center justify-center text-primary/60 bg-primary/5 border-r border-primary/20">
          <span :class="{ 'animate-spin': isFocused }">🎯</span>
        </div>
        
        <div class="flex-1 flex items-center relative min-h-[48px] py-3.5">
          <span class="font-mono text-primary/80 mr-2 select-none text-xs">[SYS]&gt;</span>
          <textarea
            ref="textareaRef"
            v-model="input"
            @keydown="handleKeyDown"
            @focus="isFocused = true"
            @blur="isFocused = false"
            placeholder="AWAITING_COMMAND..."
            class="max-h-[200px] w-full resize-none bg-transparent font-mono text-sm text-foreground placeholder:text-primary/30 placeholder:tracking-widest focus:outline-none"
            rows="1"
          />
          <span v-if="isFocused && !input" class="absolute left-[80px] w-2 h-4 bg-primary animate-pulse pointer-events-none"></span>
        </div>
        
        <Transition name="send">
          <button
            v-if="input.trim() && !isStreaming"
            @click="handleSend"
            class="flex h-10 w-12 shrink-0 items-center justify-center bg-primary text-background hover:bg-primary/80 transition-colors mr-1 mb-1 clip-corner-sm"
          >
            <span class="text-lg">➤</span>
          </button>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  isStreaming: boolean;
}>();

const emit = defineEmits<{
  send: [text: string];
}>();

const input = ref('');
const isFocused = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const characters = [
  { id: 'char-1', name: '慕小小', status: '活跃' },
  { id: 'char-2', name: '桃乐丝', status: '待命' },
  { id: 'char-3', name: '王静', status: '离线' },
];

const activeCharId = ref('char-1');

watch(input, () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
    textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 200)}px`;
  }
});

const handleSend = () => {
  if (input.value.trim() && !props.isStreaming) {
    emit('send', input.value.trim());
    input.value = '';
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto';
      textareaRef.value.blur();
    }
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};

onMounted(() => {
  const tavernInput = document.querySelector('#send_form textarea, #gen-form textarea, textarea.rwmb-textarea') as HTMLTextAreaElement;
  if (tavernInput && textareaRef.value) {
    tavernInput.addEventListener('input', (e) => {
      input.value = (e.target as HTMLTextAreaElement).value;
    });
    tavernInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }
});
</script>

<style scoped>
.send-enter-active,
.send-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.send-enter-from,
.send-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
