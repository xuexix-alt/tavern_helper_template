<template>
  <div
    class="rounded-3xl border border-orange-500/20 bg-gradient-to-br from-slate-900/80 to-black/60 p-6 shadow-2xl shadow-orange-500/10 backdrop-blur-xl"
  >
    <div class="mb-6 flex items-center space-x-4">
      <div class="relative">
        <div class="h-16 w-16 overflow-hidden rounded-2xl border-2 border-orange-400/30 shadow-lg shadow-orange-500/20">
          <img src="https://via.placeholder.com/150" alt="Avatar" class="h-full w-full object-cover" />
        </div>
        <div
          class="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-green-400"
        >
          <div class="h-2 w-2 animate-pulse rounded-full bg-white"></div>
        </div>
      </div>

      <div class="flex-1">
        <h4 class="text-white">{{ girlName }}</h4>
        <div class="text-sm text-orange-400">Lv. {{ girlLevel }}</div>
      </div>
    </div>

    <div class="space-y-4">
      <!-- XP Progress -->
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
            class="h-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-1000"
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

      <!-- Achievement Badge -->
      <div class="rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-pink-500/10 p-3">
        <div class="flex items-center space-x-2">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500"
          >
            <i class="fas fa-medal text-white"></i>
          </div>
          <div>
            <div class="text-sm text-white">VIP 客户</div>
            <div class="text-xs text-purple-400">尊享服务中</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { loadOrdersFromMVU, filterActiveOrders, type ServiceOrder } from '../shared/serviceOrders';
import { getNestedValue } from '../utils';

// 真实数据状态
const currentGirl = ref<ServiceOrder | null>(null);

// 计算属性直接从 currentGirl 派生
const girlName = ref('加载中...');
const girlLevel = ref(0);
const currentExp = ref(0);
const maxExp = ref(100);
const heartbeat = ref('-');
const rating = ref(5.0);

async function refreshData() {
  try {
    const orders = await loadOrdersFromMVU();
    const active = filterActiveOrders(orders);
    if (active.length > 0) {
      currentGirl.value = active[0]; // 默认取第一个活跃订单
      updateDisplay();
    } else {
      girlName.value = '暂无服务';
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
  girlLevel.value = getNestedValue(g, '基础信息.年龄', 0); // 暂用年龄代替等级

  // 心理状态映射
  const affection = getNestedValue(g, '心理状态.好感度', 0);
  currentExp.value = typeof affection === 'number' ? affection : parseFloat(affection) || 0;
  maxExp.value = 100; // 假设满好感度为 100

  heartbeat.value = getNestedValue(g, '服务统计.心跳', '-');

  // 评分根据好感度计算
  rating.value = Math.min(5, Math.max(0, currentExp.value / 20));
}

onMounted(() => {
  refreshData();
  // 也可以设置定时刷新
  // setInterval(refreshData, 5000);
});
</script>
