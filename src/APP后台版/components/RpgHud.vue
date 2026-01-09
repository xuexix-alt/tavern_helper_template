<template>
  <div
    class="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-700/50 bg-slate-950/40 px-3 py-2 backdrop-blur"
  >
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        <span
          class="inline-flex min-w-0 items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/40 px-2 py-0.5 text-[11px] text-slate-200"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          <span class="truncate">{{ sceneText }}</span>
        </span>
        <span class="truncate text-xs text-slate-400">{{ focusText }}</span>
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
        <span
          class="inline-flex items-center gap-1 rounded-full border border-slate-700/50 bg-slate-900/40 px-2 py-0.5"
        >
          <i class="fas fa-coins text-yellow-300"></i>
          <span>{{ balanceText }}</span>
        </span>
        <span
          class="inline-flex min-w-0 items-center gap-1 rounded-full border border-slate-700/50 bg-slate-900/40 px-2 py-0.5"
        >
          <i class="fas fa-user-shield text-blue-300"></i>
          <span class="truncate">{{ currentGirlText }}</span>
        </span>
        <span
          class="inline-flex items-center gap-1 rounded-full border border-slate-700/50 bg-slate-900/40 px-2 py-0.5"
        >
          <i class="fas fa-heartbeat text-red-300"></i>
          <span>{{ heartbeatText }}</span>
        </span>
      </div>
    </div>

    <button
      class="shrink-0 rounded-xl border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
      :disabled="loading"
      @click="refresh"
      title="刷新状态"
    >
      <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i>
      <span class="ml-2 hidden sm:inline">刷新</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { filterActiveOrders, loadOrdersFromMVU, type ServiceOrder } from '../shared/serviceOrders';
import { getNestedValue } from '../utils';

const loading = ref(false);
const currentGirl = ref<ServiceOrder | null>(null);
const scene = ref<string>('');
const balance = ref<any>(null);
const heartbeat = ref<any>(null);

const sceneText = computed(() => scene.value || 'RPG · 进行中');
const currentGirlText = computed(() => {
  if (!currentGirl.value) return '暂无服务';
  const name = getNestedValue(currentGirl.value, '基础信息.姓名', '未知');
  const identity = getNestedValue(currentGirl.value, '基础信息.身份', '');
  return identity ? `${name} · ${identity}` : String(name);
});
const heartbeatText = computed(() => {
  const v = heartbeat.value ?? getNestedValue(currentGirl.value, '服务统计.心跳', '-');
  return v === null || v === undefined || v === '' ? '-' : String(v);
});
const balanceText = computed(() => {
  const v = balance.value;
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? `￥${n}` : `￥${String(v)}`;
});

const focusText = computed(() => {
  const orderStatus =
    getNestedValue(currentGirl.value, 'status', '') || getNestedValue(currentGirl.value, '服务统计.订单状态', '');
  const status = String(orderStatus || '').trim();
  return status ? `状态：${status}` : '正文区域优先 · 面板可收起';
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
    if (typeof Mvu !== 'undefined' && Mvu?.getMvuData) {
      return Mvu.getMvuData({ type: 'message', message_id });
    }
    return getVariables({ type: 'message', message_id });
  } catch {
    return null;
  }
}

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    const orders = await loadOrdersFromMVU();
    const active = filterActiveOrders(orders);
    currentGirl.value = active[0] ?? null;

    const snap = safeGetMvuSnapshot();
    const stat = snap?.stat_data || snap || {};
    scene.value = getNestedValue(stat, '系统状态.当前场景', '') || getNestedValue(stat, '系统状态.当前模式', '');
    balance.value = getNestedValue(stat, '经济.账户余额', null);
    heartbeat.value = getNestedValue(currentGirl.value, '服务统计.心跳', null);
  } finally {
    loading.value = false;
  }
}

let timer: number | null = null;
onMounted(() => {
  refresh().catch(() => {});
  // 轻量轮询：保持 HUD 基本同步，避免频繁监听导致多 iframe 开销
  timer = window.setInterval(() => refresh().catch(() => {}), 20000);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
</script>
