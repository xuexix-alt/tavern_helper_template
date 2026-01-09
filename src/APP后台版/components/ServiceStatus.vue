<template>
  <div
    class="rounded-3xl border border-orange-500/20 bg-gradient-to-br from-slate-900/80 to-black/60 p-6 shadow-2xl shadow-orange-500/10 backdrop-blur-xl"
  >
    <!-- Header -->
    <div class="mb-5 flex items-start gap-4">
      <div
        class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 border-orange-400/30 bg-gradient-to-br from-orange-500/20 to-yellow-500/10 text-xl font-bold text-orange-100 shadow-lg shadow-orange-500/20"
        :title="girlName"
      >
        {{ avatarText }}
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h4 class="truncate text-white">{{ girlName }}</h4>
          <span
            v-if="girlStatus"
            class="shrink-0 rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-200"
          >
            {{ girlStatus }}
          </span>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span v-if="girlIdentity" class="rounded-full border border-slate-700/50 bg-slate-900/40 px-2 py-0.5">
            {{ girlIdentity }}
          </span>
          <span
            v-if="girlAge !== '-' && girlAge !== 0"
            class="rounded-full border border-slate-700/50 bg-slate-900/40 px-2 py-0.5"
          >
            {{ girlAge }} 岁
          </span>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <!-- Affection -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="flex items-center space-x-1 text-slate-400">
            <i class="fas fa-bolt text-xs"></i>
            <span>好感度</span>
          </span>
          <span class="text-orange-400">{{ currentExp }} / {{ maxExp }}</span>
        </div>
        <div class="h-2 w-full rounded-full bg-slate-800">
          <div
            class="h-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-700"
            :style="{ width: `${(currentExp / maxExp) * 100}%` }"
          ></div>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-3">
          <div class="mb-1 flex items-center space-x-2">
            <i class="fas fa-heart text-red-400"></i>
            <span class="text-sm text-red-400">心跳</span>
          </div>
          <div class="text-white">{{ heartbeat }} bpm</div>
        </div>

        <div class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-3">
          <div class="mb-1 flex items-center space-x-2">
            <i class="fas fa-star text-yellow-400"></i>
            <span class="text-sm text-yellow-400">评分</span>
          </div>
          <div class="text-white">{{ rating }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { filterActiveOrders, loadOrdersFromMVU, type ServiceOrder } from '../shared/serviceOrders';
import { getNestedValue } from '../utils';

const currentGirl = ref<ServiceOrder | null>(null);

const girlName = ref('加载中...');
const girlIdentity = ref('');
const girlAge = ref<any>('-');
const girlStatus = ref('');

const currentExp = ref(0);
const maxExp = ref(100);
const heartbeat = ref('-');
const rating = ref(5.0);

const avatarText = computed(() => {
  const name = String(girlName.value || '').trim();
  if (!name || name === '加载中...' || name === '暂无服务' || name === '数据获取失败') return '—';
  return name.slice(-1);
});

async function refreshData() {
  try {
    const orders = await loadOrdersFromMVU();
    const active = filterActiveOrders(orders);
    if (active.length > 0) {
      currentGirl.value = active[0];
      updateDisplay();
    } else {
      girlName.value = '暂无服务';
      girlIdentity.value = '';
      girlAge.value = '-';
      girlStatus.value = '';
      heartbeat.value = '-';
      currentExp.value = 0;
      rating.value = 0;
    }
  } catch (e) {
    console.error('获取服务状态失败', e);
    girlName.value = '数据获取失败';
  }
}

function updateDisplay() {
  if (!currentGirl.value) return;

  const g = currentGirl.value;
  girlName.value = getNestedValue(g, '基础信息.姓名', '未知');
  girlIdentity.value = String(getNestedValue(g, '基础信息.身份', '') || '').trim();
  girlAge.value = getNestedValue(g, '基础信息.年龄', '-');
  girlStatus.value = String(getNestedValue(g, 'status', '') || getNestedValue(g, '服务统计.订单状态', '') || '').trim();

  const affection = getNestedValue(g, '心理状态.好感度', 0);
  currentExp.value = typeof affection === 'number' ? affection : parseFloat(String(affection)) || 0;
  maxExp.value = 100;

  heartbeat.value = getNestedValue(g, '服务统计.心跳', '-');

  // 评分根据好感度计算（纯UI装饰）
  rating.value = Math.min(5, Math.max(0, currentExp.value / 20));
}

onMounted(() => {
  refreshData();
});
</script>
