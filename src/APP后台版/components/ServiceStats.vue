<template>
  <div
    class="rounded-3xl border border-violet-500/20 bg-gradient-to-br from-slate-900/80 to-black/60 p-6 shadow-2xl shadow-violet-500/10 backdrop-blur-xl"
  >
    <div class="mb-6 flex items-center justify-between">
      <h3 class="text-white">经济概览</h3>
      <i class="fas fa-chart-line text-green-400"></i>
    </div>

    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <i class="fas fa-dollar-sign text-green-400"></i>
            <span class="text-sm text-slate-400">账户余额</span>
          </div>
          <span class="text-white">{{ balanceText }}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div
          class="rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/10 to-emerald-600/10 p-3 text-center"
        >
          <div class="text-lg text-green-400">{{ activeOrdersText }}</div>
          <div class="text-xs text-green-400/70">服务中的订单</div>
        </div>
        <div
          class="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-red-600/10 p-3 text-center"
        >
          <div class="text-lg text-orange-400">{{ spendingText }}</div>
          <div class="text-xs text-orange-400/70">订单消费</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { filterActiveOrders, loadOrdersFromMVU } from '../shared/serviceOrders';
import { getNestedValue } from '../utils';

const balance = ref<any>(null);
const spending = ref<any>(null);
const activeOrders = ref<number>(0);

const balanceText = computed(() => {
  const v = balance.value;
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? `￥${n}` : `￥${String(v)}`;
});

const spendingText = computed(() => {
  const v = spending.value;
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? `￥${n}` : `￥${String(v)}`;
});

const activeOrdersText = computed(() => {
  const n = activeOrders.value;
  return Number.isFinite(n) ? `${n}` : '—';
});

function safeGetMvuSnapshot() {
  try {
    const message_id = getCurrentMessageId?.() ?? 'latest';
    if (typeof waitGlobalInitialized === 'function') {
      try {
        waitGlobalInitialized('Mvu');
      } catch {
        // ignore
      }
    }
    if (typeof Mvu !== 'undefined' && Mvu?.getMvuData) return Mvu.getMvuData({ type: 'message', message_id });
    return getVariables({ type: 'message', message_id });
  } catch {
    return null;
  }
}

async function refresh() {
  try {
    const orders = await loadOrdersFromMVU();
    activeOrders.value = filterActiveOrders(orders).length;
  } catch {
    activeOrders.value = 0;
  }

  const snap = safeGetMvuSnapshot();
  const stat = snap?.stat_data || snap || {};
  balance.value = getNestedValue(stat, '经济.账户余额', null);
  spending.value = getNestedValue(stat, '经济.订单消费', null);
}

onMounted(() => {
  refresh().catch(() => {});
});
</script>
