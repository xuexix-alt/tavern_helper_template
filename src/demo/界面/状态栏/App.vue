<template>
  <div 
    class="relative flex w-full flex-col overflow-visible text-foreground font-sans selection:bg-primary/40 transition-colors duration-300" 
    :style="{ background: 'var(--bg-gradient)' }"
  >
    <div class="pointer-events-none absolute inset-0 z-0 tech-grid opacity-20"></div>
    <div class="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,transparent_0%,var(--background)_70%)]"></div>

    <div class="hud-deco pointer-events-none absolute left-4 top-20 bottom-24 z-10 hidden w-12 flex-col justify-between py-4 2xl:flex">
      <div class="w-full h-32 border-l-2 border-t-2 border-primary/40 clip-corner-sm relative">
        <div class="absolute top-2 left-2 w-2 h-2 bg-primary animate-pulse"></div>
        <div class="absolute -right-4 top-0 font-mono text-[8px] text-primary/60 tracking-widest" style="writing-mode: vertical-rl;">SYS.OP.01</div>
      </div>
      <div class="flex flex-col gap-2">
        <div v-for="i in 4" :key="i" :style="{ width: Math.random() * 100 + '%' }" class="h-1 bg-primary/20"></div>
      </div>
      <div class="w-full h-32 border-l-2 border-b-2 border-primary/40 clip-corner-sm relative">
        <div class="absolute bottom-2 left-2 font-mono text-[10px] text-primary/80">0x99</div>
      </div>
    </div>
    
    <div class="hud-deco pointer-events-none absolute right-4 top-20 bottom-24 z-10 hidden w-12 flex-col items-end justify-between py-4 2xl:flex">
      <div class="w-full h-32 border-r-2 border-t-2 border-primary/40 clip-corner-sm relative">
        <div class="absolute top-2 right-2 w-2 h-2 bg-primary animate-pulse"></div>
        <div class="absolute -left-4 top-0 font-mono text-[8px] text-primary/60 tracking-widest" style="writing-mode: vertical-rl; transform: rotate(180deg);">NET.UPLINK</div>
      </div>
      <div class="w-8 h-8 rounded-full border border-primary/40 flex items-center justify-center relative">
        <div class="w-6 h-6 rounded-full border border-primary/20 border-t-primary animate-spin"></div>
        <div class="absolute inset-0 flex items-center justify-center font-mono text-[8px] text-primary">OK</div>
      </div>
      <div class="w-full h-32 border-r-2 border-b-2 border-primary/40 clip-corner-sm relative">
        <div class="absolute bottom-2 right-2 font-mono text-[10px] text-primary/80">88%</div>
      </div>
    </div>

    <TopBar 
      v-model:density="density"
      v-model:theme="theme"
    />

    <CharacterSidebar 
      :isOpen="isSidebarOpen"
      @toggle="isSidebarOpen = !isSidebarOpen"
      @selectChar="handleSelectChar"
    />

    <TranscriptList :messages="messages" :density="density" />

    <BottomInput 
      :isStreaming="isStreaming"
      @send="handleSend"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Density, Theme } from './types/message';
import { useDataStore } from './store';
import { transcriptManager } from './lib/TranscriptManager';
import { pluginCompatibilityLayer } from './lib/PluginCompatibilityLayer';
import TopBar from './components/TopBar.vue';
import TranscriptList from './components/TranscriptList.vue';
import BottomInput from './components/BottomInput.vue';
import CharacterSidebar from './components/CharacterSidebar.vue';

const density = ref<Density>('comfortable');
const theme = ref<Theme>('amber');
const isSidebarOpen = ref(false);
const isStreaming = ref(false);

useDataStore();
const messages = transcriptManager.getMessages();

const handleSend = async (text: string) => {
  isStreaming.value = true;
  
  await transcriptManager.loadChatMessages();
  
  const lastId = getLastMessageId();
  transcriptManager.startStreaming(lastId + 1);
  
  try {
    await generate({ user_input: text, ...{} });
  } catch (error) {
    console.error('Generate error:', error);
  }
  
  await transcriptManager.loadChatMessages();
  isStreaming.value = false;
};

const handleSelectChar = (name: string) => {
  console.log('Selected character:', name);
};

onMounted(async () => {
  await transcriptManager.loadChatMessages();
  transcriptManager.setupNewMessageListener();
  transcriptManager.setupStreamingListener();
  
  await pluginCompatibilityLayer.initialize();
});

onUnmounted(() => {
  transcriptManager.destroy();
});
</script>
