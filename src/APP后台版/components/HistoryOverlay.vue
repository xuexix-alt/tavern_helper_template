<template>
  <div v-if="historyOverlayOpen" class="history-overlay">
    <div class="history-panel glass-panel">
      <header class="history-header">
        <div class="header-left">
          <div class="header-icon">
            <span class="material-symbols-outlined">history</span>
          </div>
          <div>
            <div class="header-title">{{ ui.historyOverlay.title }}</div>
            <div class="header-sub">{{ ui.historyOverlay.subtitle }}</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="ghost-pill" :disabled="loading" @click="refreshHistory">
            <span class="material-symbols-outlined" :class="{ spin: loading }">sync</span>
            {{ ui.historyOverlay.refresh }}
          </button>
          <button class="ghost-pill" @click="closeAll">
            <span class="material-symbols-outlined">close</span>
            {{ ui.historyOverlay.close }}
          </button>
        </div>
      </header>

      <div class="history-body">
        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          正在加载历史订单…
        </div>

        <div v-else-if="historyItems.length === 0" class="empty-state">
          <span class="material-symbols-outlined">inbox</span>
          <div class="empty-title">{{ ui.historyOverlay.empty }}</div>
          <div class="empty-sub">{{ errorMessage || '（可能尚未生成订单 / MVU 未就绪）' }}</div>
        </div>

        <div v-else>
          <div v-if="currentView === 'list'" class="history-list">
            <button
              v-for="(item, idx) in historyItems"
              :key="item.id ?? `${item.order_time ?? 'history'}_${idx}`"
              class="history-item glass-panel"
              @click="openDetail(item)"
            >
              <div class="history-thumb image-placeholder"></div>
              <div class="history-info">
                <div class="history-name">{{ item.girl_name || '-' }} · {{ item.identity || '-' }}</div>
                <div class="history-meta">
                  <span class="history-tag">{{ item.package_name || '未命名套餐' }}</span>
                  <span class="history-tag">{{ item.order_status || '服务结束' }}</span>
                </div>
              </div>
              <div class="history-price">￥{{ item.price ?? '-' }}</div>
              <span class="material-symbols-outlined chevron">chevron_right</span>
            </button>
          </div>

          <div v-else-if="currentView === 'detail' && selectedOrder" class="history-detail">
            <div class="detail-hero image-placeholder"></div>
            <div class="detail-card">
              <div class="detail-head">
                <div>
                  <div class="detail-title">
                    {{ selectedOrder.girl_name || '-' }} · {{ selectedOrder.identity || '-' }}
                  </div>
                  <div class="detail-sub">{{ selectedOrder.package_name || '未命名套餐' }}</div>
                </div>
                <div class="detail-price">￥{{ selectedOrder.price ?? '-' }}</div>
              </div>
              <div v-if="currentOrderFeatures.length" class="detail-tags">
                <span v-for="tag in currentOrderFeatures.slice(0, 6)" :key="tag" class="tag-chip">{{ tag }}</span>
              </div>
            </div>

            <div class="detail-section">
              <div class="section-title">{{ ui.historyOverlay.detail.statsTitle }}</div>
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-label">{{ ui.historyOverlay.reorderModal.fields.affection }}</div>
                  <div class="stat-value">
                    {{ getNestedValue(selectedOrder?.originalData, '心理状态.好感度', '-') }}
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">{{ ui.historyOverlay.reorderModal.fields.pregnancyChance }}</div>
                  <div class="stat-value">
                    {{ formatPregnancyChance(getNestedValue(selectedOrder?.originalData, '性经验.怀孕几率', '-')) }}
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">{{ ui.historyOverlay.reorderModal.fields.orderCount }}</div>
                  <div class="stat-value">
                    {{ getNestedValue(selectedOrder?.originalData, '性经验.下单次数', '-') }}
                  </div>
                </div>
              </div>
            </div>

            <div class="detail-actions">
              <button class="btn-ghost" @click="backToList">
                <span class="material-symbols-outlined">arrow_back</span>
                {{ ui.historyOverlay.detail.back }}
              </button>
              <button class="btn-primary" @click="openReorder(selectedOrder)">
                <span class="material-symbols-outlined">local_shipping</span>
                {{ ui.historyOverlay.detail.reorder }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="currentView === 'reorder' && selectedOrder" class="overlay-surface">
      <div class="reorder-panel glass-panel">
        <header class="panel-header">
          <div class="header-left">
            <div class="header-icon">
              <span class="material-symbols-outlined">shopping_cart</span>
            </div>
            <div>
              <div class="header-title">{{ ui.historyOverlay.reorderModal.title }}</div>
              <div class="header-sub">{{ selectedOrder.package_name || '未命名套餐' }}</div>
            </div>
          </div>
          <button class="ghost-pill" @click="backToList">
            <span class="material-symbols-outlined">arrow_back</span>
            {{ ui.historyOverlay.reorderModal.back }}
          </button>
        </header>

        <div class="panel-body">
          <div class="reorder-card glass-panel">
            <div class="reorder-head">
              <div>
                <div class="reorder-title">
                  {{ selectedOrder.girl_name || '-' }} · {{ selectedOrder.identity || '-' }}
                </div>
                <div class="reorder-sub">{{ selectedOrder.package_name || '未命名套餐' }}</div>
              </div>
              <div class="reorder-price">￥{{ selectedOrder.price ?? '-' }}</div>
            </div>
            <div v-if="currentOrderFeatures.length" class="reorder-tags">
              <span v-for="tag in currentOrderFeatures.slice(0, 6)" :key="tag" class="tag-chip">{{ tag }}</span>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">{{ ui.historyOverlay.reorderModal.fields.affection }}</div>
              <div class="stat-value">
                {{ getNestedValue(selectedOrder?.originalData, '心理状态.好感度', '-') }}
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">{{ ui.historyOverlay.reorderModal.fields.pregnancyChance }}</div>
              <div class="stat-value">
                {{ formatPregnancyChance(getNestedValue(selectedOrder?.originalData, '性经验.怀孕几率', '-')) }}
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">{{ ui.historyOverlay.reorderModal.fields.orderCount }}</div>
              <div class="stat-value">
                {{ getNestedValue(selectedOrder?.originalData, '性经验.下单次数', '-') }}
              </div>
            </div>
          </div>

          <div class="panel-actions">
            <button class="ghost-pill" @click="backToList">{{ ui.historyOverlay.reorderModal.back }}</button>
            <button class="btn-primary" @click="openRemarkModal">
              <span class="material-symbols-outlined">shopping_bag</span>
              {{ ui.historyOverlay.reorderModal.reorder }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showRemarkModal" class="overlay-surface" @click.self="closeRemarkModal">
      <div class="remark-panel glass-panel">
        <header class="panel-header">
          <div class="header-title">{{ ui.historyOverlay.remarkModal.title }}</div>
          <button class="ghost-pill" @click="closeRemarkModal">
            <span class="material-symbols-outlined">close</span>
            {{ ui.historyOverlay.remarkModal.close }}
          </button>
        </header>

        <div class="panel-body">
          <div v-if="currentOrderFeatures.length" class="feature-chips">
            <button
              v-for="feature in currentOrderFeatures"
              :key="feature"
              class="feature-chip"
              @click="addFeatureToRemark(feature)"
            >
              {{ feature }}
            </button>
          </div>

          <textarea
            ref="remarkTextarea"
            v-model="orderRemark"
            class="remark-input"
            placeholder="可输入特殊要求，如服装、场景、认知等..."
          ></textarea>

          <div class="panel-actions">
            <button class="ghost-pill" @click="closeRemarkModal">{{ ui.historyOverlay.remarkModal.cancel }}</button>
            <button class="btn-primary" @click="confirmOrder">
              <span class="material-symbols-outlined">send</span>
              {{ ui.historyOverlay.remarkModal.confirm }}
            </button>
          </div>
          <div v-if="copiedHint" class="copied-hint">
            <span class="material-symbols-outlined">info</span>
            {{ copiedHint }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { historyOverlayOpen } from '../shared/uiState';
import { filterCompletedOrders, loadOrdersFromMVU, readCachedOrders } from '../shared/serviceOrders';
import { getNestedValue } from '../utils';
import uiSpec from '../shared/ui-spec-for-designers.json';

const loading = ref(false);
const errorMessage = ref('');

const historyItems = ref<any[]>([]);
const selectedOrder = ref<any>(null);
const currentView = ref<'list' | 'detail' | 'reorder'>('list');

const showRemarkModal = ref(false);
const orderRemark = ref('');
const remarkTextarea = ref<HTMLTextAreaElement | null>(null);
const copiedHint = ref('');
const ui = uiSpec.uiTexts;

function closeAll() {
  historyOverlayOpen.value = false;
  selectedOrder.value = null;
  currentView.value = 'list';
  showRemarkModal.value = false;
  orderRemark.value = '';
  copiedHint.value = '';
}

function backToList() {
  selectedOrder.value = null;
  currentView.value = 'list';
  showRemarkModal.value = false;
  orderRemark.value = '';
  copiedHint.value = '';
}

function formatPregnancyChance(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' && value.includes('%')) return value;
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  const clamped = Math.min(100, Math.max(0, num));
  return `${Math.round(clamped * 100) / 100}%`;
}

function extractOrderFeatures(order: any): string[] {
  if (!order || typeof order !== 'object') return [];
  const features = new Set<string>();

  const pushFeature = (value: any) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (['无', '未知', '--'].includes(trimmed)) return;
    features.add(trimmed);
  };

  const pushFeatureArray = (list: any[]) => {
    if (!Array.isArray(list)) return;
    list.forEach(pushFeature);
  };

  pushFeature(order['套餐名称']);
  if (order['套餐']) {
    pushFeature(order['套餐']['套餐名称']);
    pushFeatureArray(order['套餐']['玩法特色']);
    pushFeature(order['套餐']['商品类型']);
  }

  const clothingSources = [order['服装'], order['身体特征']?.['服装']];
  clothingSources.forEach(source => {
    if (source && typeof source === 'object') {
      Object.values(source).forEach(pushFeature);
    }
  });

  return Array.from(features);
}

const currentOrderFeatures = computed(() => {
  if (!selectedOrder.value) return [];
  const raw = selectedOrder.value.features || extractOrderFeatures(selectedOrder.value.originalData);
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\s*,\s*|\s+/).filter(Boolean) : [];
  return list;
});

function openDetail(item: any) {
  if (!item || typeof item !== 'object') return;
  selectedOrder.value = item;
  currentView.value = 'detail';
}

function openReorder(item: any) {
  if (!item || typeof item !== 'object') return;
  selectedOrder.value = item;
  currentView.value = 'reorder';
}

function openRemarkModal() {
  if (!selectedOrder.value) return;
  copiedHint.value = '';
  showRemarkModal.value = true;
  nextTick(() => remarkTextarea.value?.focus());
}

function closeRemarkModal() {
  showRemarkModal.value = false;
  orderRemark.value = '';
}

function addFeatureToRemark(feature: string) {
  if (!feature) return;
  const next = orderRemark.value ? `${orderRemark.value} ${feature}` : feature;
  orderRemark.value = next;
  nextTick(() => remarkTextarea.value?.focus());
}

function sendToAI(message: string) {
  const fullCommand = `${message} | /trigger await=true`;
  if (typeof (window as any).triggerSlash !== 'undefined') {
    try {
      (window as any).triggerSlash(fullCommand);
      return true;
    } catch (e) {
      console.error('[HistoryOverlay] 执行 triggerSlash 出错:', e);
      return false;
    }
  }
  return false;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 兼容旧环境
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

async function confirmOrder() {
  if (!selectedOrder.value) return;
  const pkg = selectedOrder.value.package_name || '未知套餐';
  const girl = selectedOrder.value.girl_name || '未知';
  const identity = selectedOrder.value.identity || '未知';
  const age = getNestedValue(selectedOrder.value?.originalData, '基础信息.年龄', '-');
  const originPrice = selectedOrder.value.price;
  const finalPrice = originPrice ?? '-';
  const remark = orderRemark.value.trim() || '无';

  const text = `再次下单：${girl}，${age}，${identity}，${pkg}，订单价格：￥${finalPrice}。备注：${remark}`;
  const cmd = `/send ${text}`;

  const ok = sendToAI(cmd);
  if (!ok) {
    const copied = await copyToClipboard(`${cmd} | /trigger await=true`);
    copiedHint.value = copied
      ? '未检测到 triggerSlash，已复制指令到剪贴板。'
      : '未检测到 triggerSlash，且复制失败，请手动复制指令。';
  } else {
    copiedHint.value = '已发送下单指令。';
  }

  closeRemarkModal();
  backToList();
}

async function refreshHistory() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const orders = await loadOrdersFromMVU();
    const completed = filterCompletedOrders(orders);
    historyItems.value = completed.map(order => ({
      id: order.id,
      girl_name: order.基础信息?.姓名 || '未知',
      identity: order.基础信息?.身份 || '未知',
      package_name: order.套餐?.套餐名称 || '未知套餐',
      order_time: '历史订单',
      order_status: order.status || '服务结束',
      price: order.套餐?.折后价格 || order.套餐?.套餐价格 || 0,
      features: extractOrderFeatures(order.originalData),
      originalData: order.originalData,
    }));
  } catch (e: any) {
    console.error('[HistoryOverlay] 获取订单失败，尝试缓存:', e);
    errorMessage.value = e?.message || '获取订单失败';
    const cached = readCachedOrders();
    const completed = filterCompletedOrders(cached);
    historyItems.value = completed.map(order => ({
      id: order.id,
      girl_name: order.基础信息?.姓名 || '未知',
      identity: order.基础信息?.身份 || '未知',
      package_name: order.套餐?.套餐名称 || '未知套餐',
      order_time: '历史订单',
      order_status: order.status || '服务结束',
      price: order.套餐?.折后价格 || order.套餐?.套餐价格 || 0,
      features: extractOrderFeatures(order.originalData),
      originalData: order.originalData,
    }));
  } finally {
    loading.value = false;
  }
}

watch(
  () => historyOverlayOpen.value,
  async open => {
    if (open) {
      currentView.value = 'list';
      selectedOrder.value = null;
      await refreshHistory();
    }
  },
);

onMounted(() => {
  // 预加载一次，避免首次打开空白
  refreshHistory().catch(() => {});
});
</script>

<style scoped lang="scss">
.history-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(4, 5, 12, 0.6);
}

.history-panel {
  width: min(980px, 100%);
  max-height: min(90vh, 860px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 22px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: rgba(127, 19, 236, 0.2);
  color: rgba(216, 180, 254, 0.95);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.header-title {
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
}

.header-sub {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.85);
}

.header-actions {
  display: flex;
  gap: 10px;
}

.ghost-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
  font-size: 12px;
}

.history-body {
  padding: 16px 18px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 12px;
  text-align: center;
  color: rgba(226, 232, 240, 0.7);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(226, 232, 240, 0.2);
  border-top-color: rgba(127, 19, 236, 0.8);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  text-align: left;
}

.history-thumb {
  width: 64px;
  height: 64px;
  border-radius: 14px;
}

.history-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-name {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.history-tag {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(127, 19, 236, 0.2);
  color: rgba(216, 180, 254, 0.95);
}

.history-price {
  font-size: 14px;
  font-weight: 700;
  color: #facc15;
}

.chevron {
  color: rgba(148, 163, 184, 0.8);
}

.history-detail {
  display: grid;
  gap: 14px;
}

.detail-hero {
  width: 100%;
  height: 180px;
  border-radius: 16px;
  overflow: hidden;
}

.detail-card {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  padding: 14px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.detail-title {
  font-size: 15px;
  font-weight: 700;
  color: #e2e8f0;
}

.detail-sub {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
  margin-top: 4px;
}

.detail-price {
  font-size: 18px;
  font-weight: 800;
  color: #fcd34d;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.tag-chip {
  font-size: 11px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(127, 19, 236, 0.2);
  color: rgba(216, 180, 254, 0.95);
}

.detail-section {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  padding: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  color: rgba(226, 232, 240, 0.6);
  margin-bottom: 10px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.stat-card {
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  padding: 10px;
  text-align: center;
}

.stat-label {
  font-size: 10px;
  color: rgba(226, 232, 240, 0.5);
  margin-bottom: 6px;
}

.stat-value {
  font-size: 14px;
  font-weight: 700;
  color: #e2e8f0;
}

.detail-actions,
.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-ghost,
.btn-primary {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-primary {
  border-color: rgba(127, 19, 236, 0.4);
  background: linear-gradient(135deg, rgba(127, 19, 236, 0.9), rgba(139, 92, 246, 0.9));
  color: #fff;
}

.overlay-surface {
  position: fixed;
  inset: 0;
  z-index: 5100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(3, 4, 12, 0.7);
}

.reorder-panel,
.remark-panel {
  width: min(720px, 100%);
  border-radius: 20px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.reorder-card {
  padding: 12px;
  border-radius: 16px;
}

.reorder-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.reorder-title {
  font-size: 14px;
  font-weight: 700;
}

.reorder-sub {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
}

.reorder-price {
  font-size: 16px;
  font-weight: 700;
  color: #fcd34d;
}

.reorder-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.feature-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.feature-chip {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
  font-size: 11px;
  padding: 4px 10px;
}

.remark-input {
  width: 100%;
  min-height: 120px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 12, 22, 0.6);
  color: #fff;
  padding: 12px;
  font-size: 13px;
  outline: none;
}

.copied-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(226, 232, 240, 0.7);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .history-item {
    grid-template-columns: auto 1fr;
    grid-auto-rows: auto;
  }

  .history-price,
  .chevron {
    display: none;
  }
}
</style>
