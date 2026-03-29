<template>
  <header class="relative z-50 flex h-14 shrink-0 items-center justify-between px-3 sm:px-6 border-b border-primary/20 bg-background/40 backdrop-blur-2xl shadow-[0_4px_30px_var(--shadow-color)]">
    <div class="flex items-center gap-2 sm:gap-4">
      <div class="font-mono text-primary font-bold tracking-widest text-glow flex items-center gap-2">
        <span class="text-lg">☢️</span>
        <span class="hidden md:inline">寒冬末日 // 状态栏</span>
      </div>
    </div>

    <div class="flex items-center gap-4 sm:gap-6 font-mono text-[10px] sm:text-xs text-primary/50">
      <button 
        class="flex items-center gap-1 sm:gap-2 hover:text-primary transition-colors cursor-pointer group"
      >
        <span class="font-bold tracking-widest">任务</span>
        <div class="hidden lg:flex gap-0.5">
          <div 
            v-for="i in 10" 
            :key="i" 
            :class="i < 6 ? 'bg-primary/70 group-hover:bg-primary' : 'bg-primary/20 group-hover:bg-primary/40'"
            class="h-3 w-1.5 transition-colors"
          ></div>
        </div>
      </button>
      <button 
        class="flex items-center gap-1 sm:gap-2 hover:text-primary transition-colors cursor-pointer group"
      >
        <span class="font-bold tracking-widest">地图</span>
        <div class="hidden lg:flex gap-0.5">
          <div 
            v-for="i in 10" 
            :key="i" 
            :class="i < 4 ? 'bg-primary/70 group-hover:bg-primary animate-pulse' : 'bg-primary/20 group-hover:bg-primary/40'"
            class="h-3 w-1.5 transition-colors"
          ></div>
        </div>
      </button>
    </div>

    <div class="flex items-center gap-2 sm:gap-6 font-mono text-xs">
      <div class="hidden sm:flex items-center gap-2 text-primary/70 tracking-widest">
        <span class="animate-pulse text-primary">●</span> 在线
      </div>

      <div class="flex items-center gap-2 sm:gap-3">
        <button
          class="flex h-7 px-2 sm:px-3 items-center justify-center gap-2 border border-primary/30 text-primary hover:bg-primary/10 hover:text-glow transition-all clip-corner-sm"
          title="组件库"
        >
          <span>📦</span>
          <span class="hidden lg:inline">组件库</span>
        </button>

        <button
          class="flex h-7 px-2 sm:px-3 items-center justify-center gap-2 border border-primary/30 text-primary hover:bg-primary/10 hover:text-glow transition-all clip-corner-sm"
          title="排版设置"
        >
          <span>🔤</span>
          <span class="hidden lg:inline">排版</span>
        </button>

        <div class="relative">
          <button
            @click="isThemeDropdownOpen = !isThemeDropdownOpen"
            class="flex h-7 px-2 sm:px-3 items-center justify-center gap-2 border border-primary/30 text-primary hover:bg-primary/10 hover:text-glow transition-all clip-corner-sm shrink-0"
            title="切换主题"
          >
            <span>{{ currentThemeIcon }}</span>
            <span class="hidden lg:inline">{{ currentThemeLabel }}</span>
            <span :class="{ 'rotate-180': isThemeDropdownOpen }" class="transition-transform duration-200">▼</span>
          </button>

          <Transition name="dropdown">
            <div 
              v-if="isThemeDropdownOpen"
              class="absolute right-0 top-full mt-2 w-32 border border-primary/30 bg-surface/90 backdrop-blur-md shadow-[0_4px_20px_var(--shadow-color)] clip-corner-sm z-50 flex flex-col p-1"
            >
              <button
                v-for="t in themes"
                :key="t.id"
                @click="selectTheme(t.id)"
                class="flex items-center gap-2 px-3 py-2 text-xs font-mono transition-colors clip-corner-sm"
                :class="theme === t.id ? 'bg-primary text-background' : 'text-primary hover:bg-primary/10'"
              >
                <span>{{ t.icon }}</span>
                <span>{{ t.label }}</span>
              </button>
            </div>
          </Transition>
        </div>

        <div class="hidden sm:flex items-center gap-1 border border-primary/30 p-1 bg-surface/50 clip-corner-sm">
          <button
            v-for="d in densities"
            :key="d.id"
            @click="$emit('update:density', d.id)"
            :title="d.label"
            class="relative flex h-6 w-8 items-center justify-center transition-colors duration-300"
            :class="density === d.id ? 'text-background bg-primary' : 'text-primary/50 hover:text-primary hover:bg-primary/10'"
          >
            <span class="relative z-10" v-html="d.icon"></span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Density, Theme } from '../types/message';

const props = defineProps<{
  density: Density;
  theme: Theme;
}>();

const emit = defineEmits<{
  'update:density': [density: Density];
  'update:theme': [theme: Theme];
}>();

const isThemeDropdownOpen = ref(false);

const themes = [
  { id: 'tech' as Theme, label: '科技', icon: '💻' },
  { id: 'dark' as Theme, label: '暗黑', icon: '🌙' },
  { id: 'gold' as Theme, label: '鎏金', icon: '✨' },
  { id: 'ios' as Theme, label: 'IOS', icon: '📱' },
  { id: 'ipod' as Theme, label: 'iPod', icon: '🎵' },
  { id: 'amber' as Theme, label: '琥珀', icon: '🟠' },
];

const densities = [
  { id: 'comfortable' as Density, label: '舒适', icon: '≡' },
  { id: 'compact' as Density, label: '紧凑', icon: '▤' },
  { id: 'minimal' as Density, label: '极简', icon: '–' },
];

const theme = computed(() => props.theme);

const currentThemeIcon = computed(() => themes.find(t => t.id === theme.value)?.icon || '🎨');
const currentThemeLabel = computed(() => themes.find(t => t.id === theme.value)?.label || '');

const selectTheme = (themeId: Theme) => {
  emit('update:theme', themeId);
  document.documentElement.classList.remove('theme-dark', 'theme-gold', 'theme-ios', 'theme-ipod', 'theme-amber');
  if (themeId !== 'tech') {
    document.documentElement.classList.add(`theme-${themeId}`);
  }
  isThemeDropdownOpen.value = false;
};
</script>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
