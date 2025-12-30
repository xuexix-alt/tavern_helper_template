<template>
  <div class="flex flex-col gap-6">
    <!-- Play Area (Featured Game Card style) -->
    <div class="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-slate-900/80 to-black/60 p-6 shadow-2xl shadow-blue-500/10 backdrop-blur-xl">
      <!-- Background Glow -->
      <div class="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-500/5 to-violet-600/5"></div>
      <div class="absolute top-0 right-0 h-32 w-32 rounded-full bg-gradient-to-bl from-orange-500/20 to-transparent blur-3xl"></div>

      <div class="relative z-10">
        <div class="mb-4 flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <div class="h-2 w-2 animate-pulse rounded-full bg-green-400"></div>
            <span class="text-sm text-green-400">Live Interaction</span>
          </div>
          <div class="flex items-center space-x-1">
            <i class="fas fa-star text-orange-400"></i>
            <span class="text-sm text-orange-400">4.9</span>
          </div>
        </div>

        <!-- Main Content Stream -->
        <div class="group relative mb-4 aspect-[16/9] overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-950 p-4 font-mono text-sm text-green-400">
          <div class="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent absolute inset-0 overflow-y-auto p-4">
            <pre class="font-mono whitespace-pre-wrap">{{ streamContent }}<span v-if="isStreaming" class="animate-pulse">_</span></pre>
          </div>
        </div>

        <div class="space-y-3">
          <h3 class="text-xl font-bold text-white">Current Session</h3>
          <p class="text-sm text-slate-400">Waiting for interaction...</p>
        </div>
      </div>
    </div>

    <!-- Bottom Stats Row -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- ServiceStats Placeholder -->
      <slot name="stats"></slot>
      <!-- ServiceStatus Placeholder -->
      <slot name="status"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const streamContent = ref('');
const isStreaming = ref(false);
const typewriterIndex = ref(0);
const fullText = ref(''); // 完整文本缓冲区

// 模拟打字机效果
const typeInterval = ref<number | null>(null);

function startTypewriter(text: string) {
  fullText.value = text;
  typewriterIndex.value = 0;
  streamContent.value = '';
  isStreaming.value = true;

  if (typeInterval.value) clearInterval(typeInterval.value);

  typeInterval.value = window.setInterval(() => {
    if (typewriterIndex.value < fullText.value.length) {
      streamContent.value += fullText.value.charAt(typewriterIndex.value);
      typewriterIndex.value++;
    } else {
      if (typeInterval.value) clearInterval(typeInterval.value);
      isStreaming.value = false;
    }
  }, 30); // 30ms per char
}

// 模拟接收数据（实际应从 EventSource 或 Socket 接收）
onMounted(() => {
  // 示例数据
  const demoText =
    'System initialized.\nConnecting to neural link...\n> Connection established.\n> Subject: "Overwatch 2" session active.\n> User: ProGamer_X\n\nWaiting for further input from the server...';
  startTypewriter(demoText);
});

onUnmounted(() => {
  if (typeInterval.value) clearInterval(typeInterval.value);
});
</script>
