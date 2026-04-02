<template>
  <div>
    <button
      @click="$emit('toggle')"
      class="absolute left-0 top-24 z-[60] hidden h-14 w-8 items-center justify-center border border-l-0 border-primary/20 bg-background/60 text-primary/75 transition-all hover:bg-primary/15 hover:text-primary xl:flex"
      :style="{ left: isOpen ? '320px' : '0', transitionDuration: '400ms' }"
    >
      <span :class="{ 'rotate-180': isOpen }" class="transition-transform duration-300">▶</span>
      <div
        class="absolute -right-8 font-mono text-[10px] tracking-widest text-primary/40"
        style="writing-mode: vertical-rl; transform: rotate(180deg)"
      >
        状态面板
      </div>
    </button>

    <Transition name="sidebar">
      <div
        v-if="isOpen"
        class="absolute left-0 top-14 bottom-0 w-[320px] z-50 border-r border-primary/20 bg-background/40 backdrop-blur-2xl shadow-[4px_0_30px_var(--shadow-color)] flex flex-col clip-corner"
      >
        <div class="flex border-b border-primary/20 shrink-0">
          <button
            @click="activeTab = 'characters'"
            class="flex-1 p-4 flex items-center justify-center gap-2 font-mono text-xs tracking-widest transition-colors"
            :class="
              activeTab === 'characters'
                ? 'text-primary bg-primary/10 border-b-2 border-primary'
                : 'text-primary/50 hover:text-primary/80 hover:bg-primary/5'
            "
          >
            <span>👥</span>
            <span class="font-bold">角色</span>
          </button>
          <button
            @click="activeTab = 'system'"
            class="flex-1 p-4 flex items-center justify-center gap-2 font-mono text-xs tracking-widest transition-colors"
            :class="
              activeTab === 'system'
                ? 'text-primary bg-primary/10 border-b-2 border-primary'
                : 'text-primary/50 hover:text-primary/80 hover:bg-primary/5'
            "
          >
            <span>⚙️</span>
            <span class="font-bold">系统</span>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <template v-if="activeTab === 'system'">
            <div class="flex flex-col gap-3">
              <div class="border border-primary/30 bg-surface/50 p-3 clip-corner-sm relative overflow-hidden group">
                <div
                  class="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors"
                ></div>
                <div class="flex items-center gap-2 text-primary/70 mb-1">
                  <span>🏠</span>
                  <span class="font-mono text-xs font-bold">庇护所等级</span>
                </div>
                <div class="text-2xl font-bold text-primary font-mono ml-1">
                  {{ shelterLevel }} <span class="text-sm text-primary/50 font-normal">级</span>
                </div>
              </div>

              <div class="border border-primary/30 bg-surface/50 p-3 clip-corner-sm relative overflow-hidden group">
                <div
                  class="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors"
                ></div>
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2 text-primary/70">
                    <span>🎲</span>
                    <span class="font-mono text-xs font-bold">今日投掷点数</span>
                  </div>
                </div>
                <div class="text-sm font-bold text-primary font-mono ml-1">
                  {{ dailyRoll || '未投掷' }}
                </div>
              </div>

              <div class="border border-primary/30 bg-surface/50 p-3 clip-corner-sm relative overflow-hidden group">
                <div
                  class="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors"
                ></div>
                <div class="flex items-center gap-2 text-primary/70 mb-1">
                  <span>⏰</span>
                  <span class="font-mono text-xs font-bold">距离上次保底升级</span>
                </div>
                <div class="text-sm font-bold text-primary font-mono ml-1">{{ daysSinceUpgrade || '0' }}天</div>
              </div>
            </div>

            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-2 text-primary/80 border-b border-primary/20 pb-2">
                <span>🔒</span>
                <span class="font-mono text-xs font-bold tracking-widest">可扩展区域</span>
              </div>

              <div class="grid grid-cols-1 gap-2">
                <div
                  v-for="(status, area) in expandableAreas"
                  :key="area"
                  class="border border-primary/30 bg-surface/30 p-3 flex flex-col items-center justify-center gap-2 hover:border-primary/60 transition-colors clip-corner-sm"
                >
                  <div class="flex items-center gap-2 text-primary/80">
                    <span class="font-mono text-sm font-bold">{{ area }}</span>
                  </div>
                  <span class="font-mono text-xs" :class="status === '未解锁' ? 'text-red-500' : 'text-green-400'">
                    {{ status }}
                  </span>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="flex flex-col gap-2">
              <div
                v-for="char in mainCharacters"
                :key="char.name"
                class="border transition-all duration-300"
                :class="
                  isActiveChar(char.name)
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-primary/10 bg-surface/30 hover:border-primary/30'
                "
              >
                <button
                  @click="selectChar(char.name)"
                  class="w-full flex items-center justify-between p-3 text-left hover:bg-primary/5 transition-colors"
                >
                  <div class="flex items-center gap-3">
                    <div
                      :class="char.登场状态 === '登场' ? 'bg-primary animate-pulse' : 'bg-gray-500/50'"
                      class="w-1.5 h-1.5"
                    ></div>
                    <span
                      class="font-mono text-xs tracking-wider"
                      :class="isActiveChar(char.name) ? 'text-primary' : 'text-primary/60'"
                    >
                      {{ char.name }}
                    </span>
                  </div>
                  <span
                    :class="{ 'rotate-90': isActiveChar(char.name) }"
                    class="transition-transform duration-200 text-primary/40"
                    >▶</span
                  >
                </button>

                <Transition name="expand">
                  <div v-if="isActiveChar(char.name)" class="overflow-hidden">
                    <div class="p-3 pt-0 border-t border-primary/10 mt-1 flex flex-col gap-4">
                      <div class="flex justify-between items-center mt-3">
                        <span class="font-mono text-[10px] text-primary/50 border border-primary/20 px-2 py-0.5">
                          关系: {{ char.关系 }}
                        </span>
                        <span class="font-mono text-[10px] text-primary/50"> 生命: {{ char.健康 }} </span>
                      </div>

                      <div v-if="char.内心想法" class="relative p-2 border border-primary/20 bg-background/50">
                        <div class="absolute top-0 left-0 w-1 h-full bg-yellow-500/50"></div>
                        <p class="font-serif text-xs text-foreground/80 leading-relaxed pl-2 italic">
                          "{{ char.内心想法 }}"
                        </p>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </template>
        </div>

        <div class="p-3 border-t border-primary/20 font-mono text-[9px] text-primary/40 flex justify-between shrink-0">
          <span>DB_SYNC: OK</span>
          <span>ENTITIES: {{ characterCount }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDataStore } from '../store';

const props = defineProps<{
  isOpen: boolean;
}>();

defineEmits<{
  toggle: [];
  selectChar: [name: string];
}>();

const dataStore = useDataStore();
const activeTab = ref<'characters' | 'system'>('system');
const selectedCharName = ref<string | null>(null);

const shelterLevel = computed(() => dataStore().庇护所?.庇护所等级 || 1);
const dailyRoll = computed(() => dataStore().庇护所?.今日投掷点数 || '');
const daysSinceUpgrade = computed(() => {
  const days = dataStore().庇护所?.距离上次升级 || '0';
  return days === '待定' ? '∞' : days;
});

const expandableAreas = computed(() => {
  const areas = dataStore().庇护所?.可扩展区域 || {};
  return Object.fromEntries(Object.entries(areas).filter(([_, status]) => status !== '未解锁'));
});

const mainCharacters = computed(() => {
  const data = dataStore();
  const reserved = ['世界', '庇护所', '房间', '主线任务', '临时NPC', '楼层其他住户', '$meta'];
  const chars: Array<{
    name: string;
    关系: string;
    健康: number;
    登场状态: string;
    内心想法: string;
  }> = [];

  for (const [key, value] of Object.entries(data)) {
    if (!reserved.includes(key) && typeof value === 'object' && value !== null) {
      const char = value as any;
      chars.push({
        name: key,
        关系: char.关系 || '无',
        健康: char.健康 || 100,
        登场状态: char.登场状态 || '离场',
        内心想法: char.内心想法 || '',
      });
    }
  }
  return chars;
});

const characterCount = computed(() => mainCharacters.value.length);

const isActiveChar = (name: string) => selectedCharName.value === name;

const selectChar = (name: string) => {
  selectedCharName.value = selectedCharName.value === name ? null : name;
};
</script>

<style scoped>
.sidebar-enter-active,
.sidebar-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}
.sidebar-enter-from,
.sidebar-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.expand-enter-active,
.expand-leave-active {
  transition:
    height 0.3s ease,
    opacity 0.3s ease;
}
.expand-enter-from,
.expand-leave-to {
  height: 0;
  opacity: 0;
}
</style>
