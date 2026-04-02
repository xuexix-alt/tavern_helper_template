<template>
  <header class="sticky top-0 z-50 border-b border-primary/15 bg-background/88 backdrop-blur-xl">
    <div class="mx-auto flex h-12 max-w-[820px] items-center justify-between gap-3 px-4 sm:h-14 sm:px-6">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 shrink-0 rounded-full bg-primary/80"></span>
          <span class="truncate font-mono text-[11px] font-semibold tracking-[0.24em] text-primary sm:text-xs">
            寒冬末日 // 状态栏
          </span>
        </div>
      </div>

      <div
        class="hidden items-center rounded-full border border-primary/20 bg-surface/35 px-3 py-1 font-mono text-[10px] tracking-[0.22em] text-primary/75 md:flex"
      >
        阅读
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="cycleTheme"
          class="inline-flex h-8 items-center gap-2 rounded-sm border border-primary/20 bg-surface/35 px-3 font-mono text-[11px] tracking-[0.16em] text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary"
          title="切换主题"
        >
          <span>主题</span>
          <span class="text-primary/50">{{ currentThemeLabel }}</span>
        </button>

        <div class="relative">
          <button
            @click="isMoreMenuOpen = !isMoreMenuOpen"
            class="inline-flex h-8 items-center gap-2 rounded-sm border border-primary/20 bg-surface/35 px-3 font-mono text-[11px] tracking-[0.16em] text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary"
            title="更多"
          >
            <span>更多</span>
            <span :class="{ 'rotate-180': isMoreMenuOpen }" class="transition-transform duration-200">▾</span>
          </button>

          <Transition name="dropdown">
            <div
              v-if="isMoreMenuOpen"
              class="absolute right-0 top-full mt-2 flex w-56 flex-col gap-3 rounded-sm border border-primary/20 bg-background/95 p-3 shadow-[0_16px_40px_var(--shadow-color)]"
            >
              <div
                class="flex items-center justify-between border-b border-primary/10 pb-2 font-mono text-[10px] tracking-[0.2em] text-primary/55"
              >
                <span>阅读设置</span>
                <span>在线</span>
              </div>

              <div class="grid grid-cols-2 gap-2 text-[11px]">
                <button
                  class="rounded-sm border border-primary/15 px-3 py-2 text-left font-mono text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  任务
                </button>
                <button
                  class="rounded-sm border border-primary/15 px-3 py-2 text-left font-mono text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  地图
                </button>
                <button
                  @click="$emit('open-sidebar')"
                  class="rounded-sm border border-primary/15 px-3 py-2 text-left font-mono text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  状态面板
                </button>
                <button
                  class="rounded-sm border border-primary/15 px-3 py-2 text-left font-mono text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  排版
                </button>
              </div>

              <div class="flex flex-col gap-2">
                <div class="font-mono text-[10px] tracking-[0.18em] text-primary/50">阅读密度</div>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="d in densities"
                    :key="d.id"
                    @click="selectDensity(d.id)"
                    class="rounded-sm border px-2 py-2 font-mono text-[10px] tracking-[0.16em] transition-colors"
                    :class="
                      density === d.id
                        ? 'border-primary bg-primary text-background'
                        : 'border-primary/15 text-primary/70 hover:bg-primary/10 hover:text-primary'
                    "
                  >
                    {{ d.label }}
                  </button>
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <div class="font-mono text-[10px] tracking-[0.18em] text-primary/50">主题风格</div>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="t in themes"
                    :key="t.id"
                    @click="selectTheme(t.id)"
                    class="rounded-sm border px-2 py-2 text-left font-mono text-[10px] tracking-[0.16em] transition-colors"
                    :class="
                      theme === t.id
                        ? 'border-primary bg-primary text-background'
                        : 'border-primary/15 text-primary/70 hover:bg-primary/10 hover:text-primary'
                    "
                  >
                    {{ t.label }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Density, Theme } from '../types/message';

const props = defineProps<{
  density: Density;
  theme: Theme;
}>();

const emit = defineEmits<{
  'update:density': [density: Density];
  'update:theme': [theme: Theme];
  'open-sidebar': [];
}>();

const isMoreMenuOpen = ref(false);

const themes = [
  { id: 'tech' as Theme, label: '科技' },
  { id: 'dark' as Theme, label: '暗黑' },
  { id: 'gold' as Theme, label: '鎏金' },
  { id: 'ios' as Theme, label: 'IOS' },
  { id: 'ipod' as Theme, label: 'iPod' },
  { id: 'amber' as Theme, label: '琥珀' },
];

const densities = [
  { id: 'comfortable' as Density, label: '舒适' },
  { id: 'compact' as Density, label: '紧凑' },
  { id: 'minimal' as Density, label: '极简' },
];

const theme = computed(() => props.theme);
const density = computed(() => props.density);
const currentThemeLabel = computed(() => themes.find(item => item.id === theme.value)?.label ?? '科技');

const closeMenus = () => {
  isMoreMenuOpen.value = false;
};

const selectTheme = (themeId: Theme) => {
  emit('update:theme', themeId);
  document.documentElement.classList.remove('theme-dark', 'theme-gold', 'theme-ios', 'theme-ipod', 'theme-amber');
  if (themeId !== 'tech') {
    document.documentElement.classList.add(`theme-${themeId}`);
  }
  closeMenus();
};

const selectDensity = (densityId: Density) => {
  emit('update:density', densityId);
  isMoreMenuOpen.value = false;
};

const cycleTheme = () => {
  const currentIndex = themes.findIndex(item => item.id === theme.value);
  const nextTheme = themes[(currentIndex + 1) % themes.length]?.id ?? 'tech';
  selectTheme(nextTheme);
};
</script>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
