<template>
  <div class="service-view">
    <header class="service-hero">
      <div class="hero-left">
        <div class="hero-title">
          <i class="fas fa-concierge-bell"></i>
          服务状态
        </div>
        <div class="hero-sub">
          当前服务中 {{ girlsData.length }} 单
          <span v-if="lastUpdated" class="hero-time">· 最近更新 {{ lastUpdated }}</span>
        </div>
      </div>
      <div class="hero-actions">
        <button class="btn-outline" @click="refreshData">
          <i class="fas fa-sync-alt" :class="{ 'fa-spin': isRefreshing }"></i>
          刷新
        </button>
        <button class="btn-ghost" @click="goPlay">
          <i class="fas fa-gamepad"></i>
          返回 Play
        </button>
      </div>
    </header>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>正在加载服务数据...</p>
    </div>

    <div v-else-if="girlsData.length === 0" class="empty-state">
      <i class="fas fa-inbox"></i>
      <p>{{ errorMessage || '暂无服务中的订单' }}</p>
      <button class="btn-primary" @click="refreshData">
        <i class="fas fa-redo"></i>
        重试
      </button>
    </div>

    <div v-else class="service-layout">
      <aside class="order-list">
        <div class="order-list-title">进行中的订单</div>
        <div class="order-list-body">
          <button
            v-for="(girl, index) in girlsData"
            :key="girl.id || index"
            class="order-card"
            :class="{ active: currentGirlIndex === index }"
            @click="currentGirlIndex = index"
          >
            <div class="order-name">{{ getGirlName(girl) }}</div>
            <div class="order-meta">
              <span>{{ getNestedValue(girl, '套餐.套餐名称', '未命名套餐') }}</span>
              <span>·</span>
              <span>{{ getNestedValue(girl, '订单状态', '服务中') }}</span>
            </div>
            <div class="order-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: orderProgressWidth(girl) }"></div>
              </div>
              <span class="progress-text">{{ orderProgressDisplay(girl) }}</span>
            </div>
          </button>
        </div>
      </aside>

      <section v-if="currentGirl" class="order-detail">
        <div class="detail-hero">
          <div>
            <div class="detail-name">{{ basicInfo.name }}</div>
            <div class="detail-sub">
              <span>{{ basicInfo.identity }}</span>
              <span>·</span>
              <span>{{ basicInfo.age }} 岁</span>
              <span>·</span>
              <span :class="orderStatusClass">{{ orderStatus }}</span>
            </div>
          </div>
          <div class="detail-tags">
            <span class="tag">套餐 {{ packageInfo.type || '综合' }}</span>
            <span class="tag accent">好感 {{ affectionDisplay }}/100</span>
          </div>
        </div>

        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-label">心跳</div>
            <div class="metric-value" :style="{ color: heartbeatColor }">{{ heartbeatDisplay }}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">服务进度</div>
            <div class="metric-value">{{ serviceProgressDisplay }}</div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: serviceProgressBarWidth, background: progressColor }"></div>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">服务次数</div>
            <div class="metric-value">{{ serviceCount }}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">好感度</div>
            <div class="metric-value">{{ affectionDisplay }}/100</div>
          </div>
        </div>

        <div class="package-card">
          <div class="package-title">套餐信息</div>
          <div class="package-price">¥{{ packageInfo.price }}</div>
          <div class="package-name">{{ packageInfo.name }}</div>
          <div class="package-tags">
            <span v-for="feature in packageInfo.features" :key="feature" class="tag">{{ feature }}</span>
            <span v-if="!packageInfo.features || packageInfo.features.length === 0" class="tag muted">暂无特色</span>
          </div>
        </div>

        <details class="detail-panel" open>
          <summary>
            <span><i class="fas fa-user-tie"></i> 着装信息</span>
            <i class="fas fa-chevron-down"></i>
          </summary>
          <div class="panel-body">
            <div v-if="hasValidClothing" class="clothing-grid">
              <div v-for="(value, key) in displayClothing" :key="key" class="clothing-item">
                <i :class="['clothing-icon', clothingIcon(String(key))]"></i>
                <div class="clothing-text">
                  <div class="clothing-key">{{ key }}</div>
                  <div class="clothing-value">{{ value }}</div>
                </div>
              </div>
            </div>
            <div v-else class="empty-text">暂无着装信息</div>
          </div>
        </details>

        <details class="detail-panel">
          <summary>
            <span><i class="fas fa-heart"></i> 心理状态</span>
            <i class="fas fa-chevron-down"></i>
          </summary>
          <div class="panel-body">
            <div class="info-line">
              <span class="info-label">当前所想</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '心理状态.当前所想', '-') }}</span>
            </div>
            <div class="info-line">
              <span class="info-label">性格类型</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '心理状态.性格类型', '-') }}</span>
            </div>
          </div>
        </details>

        <details class="detail-panel">
          <summary>
            <span><i class="fas fa-female"></i> 身体特征</span>
            <i class="fas fa-chevron-down"></i>
          </summary>
          <div class="panel-body">
            <div class="info-line">
              <span class="info-label">罩杯</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '身体特征.三围.罩杯', '-') }}</span>
            </div>
            <div class="info-line">
              <span class="info-label">乳形</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '身体特征.乳房.形状', '-') }}</span>
            </div>
            <div class="info-line">
              <span class="info-label">胸部</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '身体特征.胸部', '-') }}</span>
            </div>
            <div class="info-line">
              <span class="info-label">私处</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '身体特征.私处', '-') }}</span>
            </div>
            <div class="info-line">
              <span class="info-label">姿势</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '身体特征.姿势', '-') }}</span>
            </div>
          </div>
        </details>

        <details class="detail-panel">
          <summary>
            <span><i class="fas fa-chart-line"></i> 服务统计</span>
            <i class="fas fa-chevron-down"></i>
          </summary>
          <div class="panel-body">
            <div class="info-line">
              <span class="info-label">处女</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '性经验.处女', '-') }}</span>
            </div>
            <div class="info-line">
              <span class="info-label">性伴侣数量</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '性经验.性伴侣数量', '-') }}</span>
            </div>
            <div class="info-line">
              <span class="info-label">本次服务性交次数</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '服务统计.本次服务性交次数', '-') }}</span>
            </div>
            <div class="info-line">
              <span class="info-label">内射次数</span>
              <span class="info-value">{{ getNestedValue(currentGirl, '服务统计.内射次数', '-') }}</span>
            </div>
          </div>
        </details>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { filterActiveOrders, loadOrdersFromMVU, readCachedOrders } from './shared/serviceOrders';
import { getNestedValue } from './utils';

const girlsData = ref<any[]>([]);
const currentGirlIndex = ref(0);
const isLoading = ref(false);
const isRefreshing = ref(false);
const errorMessage = ref('');
const lastUpdated = ref('');

const router = useRouter();

const currentGirl = computed(() => girlsData.value[currentGirlIndex.value] || null);

watch(girlsData, list => {
  if (currentGirlIndex.value >= list.length) {
    currentGirlIndex.value = 0;
  }
});

function getGirlName(girl: any) {
  return getNestedValue(girl, '基础信息.姓名') || `女孩 ${girlsData.value.indexOf(girl) + 1}`;
}

async function refreshData() {
  isRefreshing.value = true;
  errorMessage.value = '';
  try {
    const orders = await loadOrdersFromMVU();
    const active = filterActiveOrders(orders);
    girlsData.value = active;
    if (active.length === 0) {
      errorMessage.value = '未找到服务中的订单';
    } else {
      toastr.success(`加载了 ${active.length} 位女孩的服务数据`, '服务状态');
    }
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch (error: any) {
    console.error('[Service] 刷新数据失败，尝试使用缓存:', error);
    const cached = readCachedOrders();
    const active = filterActiveOrders(cached);
    if (cached.length > 0) {
      girlsData.value = active;
      toastr.info(`使用缓存数据，条目数 ${active.length}`, '服务状态');
      errorMessage.value = '已回退到上次缓存的数据，请重新生成或刷新。';
    } else {
      errorMessage.value = error.message || '数据加载失败';
      girlsData.value = [];
    }
  } finally {
    isRefreshing.value = false;
  }
}

function goPlay() {
  router.push('/play');
}

onMounted(() => {
  isLoading.value = true;
  refreshData().finally(() => {
    isLoading.value = false;
  });
});

onActivated(() => {
  refreshData();
});

const basicInfo = computed(() => ({
  name: getNestedValue(currentGirl.value, '基础信息.姓名', '未知'),
  identity: getNestedValue(currentGirl.value, '基础信息.身份', '未知'),
  age: getNestedValue(currentGirl.value, '基础信息.年龄', 0),
}));

const packageInfo = computed(() => ({
  name: getNestedValue(currentGirl.value, '套餐.套餐名称', '未命名套餐'),
  price: getNestedValue(currentGirl.value, '套餐.套餐价格', '0'),
  type: getNestedValue(currentGirl.value, '套餐.商品类型', ''),
  features: getNestedValue(currentGirl.value, '套餐.玩法特色', []),
}));

const orderStatus = computed(() => {
  const status =
    currentGirl.value?.status ||
    getNestedValue(currentGirl.value, '订单状态', '') ||
    getNestedValue(currentGirl.value, '服务统计.订单状态', '未知');
  if (String(status).includes('服务中')) return '服务中';
  if (String(status).includes('服务结束')) return '服务结束';
  return status || '未知';
});

const orderStatusClass = computed(() => {
  const status = orderStatus.value;
  if (status.includes('服务中')) return 'status-active';
  if (status.includes('服务结束')) return 'status-completed';
  return 'status-pending';
});

const heartbeatDisplay = computed(() => getNestedValue(currentGirl.value, '服务统计.心跳', '-'));
const heartbeatStatusClass = computed(() => {
  const value = parseFloat(String(heartbeatDisplay.value));
  if (isNaN(value)) return 'status-normal';
  if (value < 60) return 'status-warning';
  if (value > 100) return 'status-danger';
  return 'status-normal';
});
const heartbeatColor = computed(() => {
  switch (heartbeatStatusClass.value) {
    case 'status-warning':
      return 'var(--status-warning)';
    case 'status-danger':
      return 'var(--status-danger)';
    default:
      return 'var(--status-success)';
  }
});

const affectionDisplay = computed(() => {
  const raw = getNestedValue(currentGirl.value, '心理状态.好感度', 0);
  const num = Number(raw);
  return Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : 0;
});

function parseProgress(raw: any) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string' && raw.includes('%')) {
    const num = parseFloat(raw.replace('%', ''));
    return Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : null;
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  if (num <= 1) return Math.round(num * 100);
  return Math.min(100, Math.max(0, num));
}

const serviceProgressValue = computed(() => {
  const raw =
    getNestedValue(currentGirl.value, '服务统计.服务进度', null) ??
    getNestedValue(currentGirl.value, '服务统计.进度', null) ??
    getNestedValue(currentGirl.value, '服务进度', null);
  return parseProgress(raw);
});

const serviceProgressDisplay = computed(() => {
  if (serviceProgressValue.value === null) return '-';
  return `${serviceProgressValue.value}%`;
});

const serviceProgressBarWidth = computed(() => {
  if (serviceProgressValue.value === null) return '0%';
  return `${serviceProgressValue.value}%`;
});

const progressColor = computed(() => {
  const value = serviceProgressValue.value ?? 0;
  if (value < 30) return 'var(--status-warning)';
  if (value < 70) return 'var(--status-info)';
  return 'var(--status-success)';
});

const serviceCount = computed(() => {
  const raw =
    getNestedValue(currentGirl.value, '服务统计.本次服务性交次数', '-') ??
    getNestedValue(currentGirl.value, '服务统计.服务次数', '-') ??
    '-';
  return raw === '' ? '-' : raw;
});

function orderProgressValue(girl: any) {
  const raw =
    getNestedValue(girl, '服务统计.服务进度', null) ??
    getNestedValue(girl, '服务统计.进度', null) ??
    getNestedValue(girl, '服务进度', null);
  return parseProgress(raw);
}

function orderProgressDisplay(girl: any) {
  const value = orderProgressValue(girl);
  return value === null ? '-' : `${value}%`;
}

function orderProgressWidth(girl: any) {
  const value = orderProgressValue(girl);
  return value === null ? '0%' : `${value}%`;
}

const displayClothing = computed(() => {
  const clothing = getNestedValue(currentGirl.value, '服装', {});
  if (!clothing || typeof clothing !== 'object') return {};
  const entries = Object.entries(clothing).filter(([, value]) => value && String(value).trim() !== '-');
  return Object.fromEntries(entries);
});

const hasValidClothing = computed(() => Object.keys(displayClothing.value).length > 0);

function clothingIcon(key: string) {
  if (key.includes('上衣')) return 'fas fa-tshirt';
  if (key.includes('下装')) return 'fas fa-user';
  if (key.includes('内衣')) return 'fas fa-heart';
  if (key.includes('内裤')) return 'fas fa-venus';
  if (key.includes('丝袜')) return 'fas fa-socks';
  if (key.includes('鞋')) return 'fas fa-shoe-prints';
  if (key.includes('配饰')) return 'fas fa-gem';
  return 'fas fa-tag';
}
</script>

<style lang="scss" scoped>
.service-view {
  width: 100%;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  background:
    radial-gradient(circle at top left, rgba(248, 113, 113, 0.18), transparent 50%),
    linear-gradient(135deg, rgba(2, 6, 23, 0.98), rgba(15, 23, 42, 0.96));
  color: #e2e8f0;
}

.service-hero {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(248, 113, 113, 0.25);
  background: rgba(15, 23, 42, 0.85);
}

.hero-title {
  font-size: 18px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero-sub {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
}

.hero-time {
  color: rgba(148, 163, 184, 0.7);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-outline,
.btn-ghost,
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 14px;
  padding: 8px 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
}

.btn-primary {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.85), rgba(239, 68, 68, 0.85));
  border-color: rgba(248, 113, 113, 0.5);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 12px;
  text-align: center;
  color: rgba(226, 232, 240, 0.6);
}

.spinner {
  width: 42px;
  height: 42px;
  border: 3px solid rgba(148, 163, 184, 0.3);
  border-top-color: rgba(248, 113, 113, 0.8);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.service-layout {
  display: grid;
  grid-template-columns: minmax(0, 280px) minmax(0, 1fr);
  gap: 16px;
}

@media (max-width: 900px) {
  .service-layout {
    grid-template-columns: 1fr;
  }
}

.order-list {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.8);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.order-list-title {
  font-size: 13px;
  font-weight: 700;
}

.order-list-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.order-card {
  border-radius: 14px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.65);
  color: #e2e8f0;
  text-align: left;
  display: grid;
  gap: 6px;
}

.order-card.active {
  border-color: rgba(248, 113, 113, 0.5);
  box-shadow: 0 8px 20px rgba(248, 113, 113, 0.2);
}

.order-name {
  font-size: 14px;
  font-weight: 700;
}

.order-meta {
  font-size: 11px;
  color: rgba(226, 232, 240, 0.6);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.order-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-text {
  font-size: 10px;
  color: rgba(226, 232, 240, 0.7);
}

.order-detail {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.85);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.detail-name {
  font-size: 20px;
  font-weight: 800;
}

.detail-sub {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.detail-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
}

.tag.accent {
  background: rgba(59, 130, 246, 0.2);
  color: #bfdbfe;
}

.tag.muted {
  background: rgba(148, 163, 184, 0.2);
  color: rgba(226, 232, 240, 0.7);
}

.metric-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.metric-card {
  border-radius: 14px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.65);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-label {
  font-size: 11px;
  color: rgba(226, 232, 240, 0.6);
}

.metric-value {
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
}

.progress-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: rgba(248, 113, 113, 0.8);
}

.package-card {
  border-radius: 16px;
  padding: 14px;
  border: 1px solid rgba(248, 113, 113, 0.25);
  background: rgba(2, 6, 23, 0.7);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.package-title {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
}

.package-price {
  font-size: 22px;
  font-weight: 800;
  color: #fecaca;
}

.package-name {
  font-size: 13px;
  color: rgba(226, 232, 240, 0.7);
}

.package-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-panel {
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.65);
  padding: 0;
  overflow: hidden;
}

.detail-panel summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 700;
}

.detail-panel summary::-webkit-details-marker {
  display: none;
}

.panel-body {
  padding: 12px 14px;
  display: grid;
  gap: 10px;
}

.clothing-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.clothing-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.clothing-icon {
  color: #fca5a5;
}

.clothing-key {
  font-size: 11px;
  color: rgba(226, 232, 240, 0.6);
}

.clothing-value {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.info-line {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 11px;
  color: rgba(226, 232, 240, 0.6);
}

.info-value {
  font-size: 12px;
  color: #e2e8f0;
  line-height: 1.5;
  word-break: break-word;
}

.empty-text {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
}

.status-active {
  color: #4ade80;
}

.status-completed {
  color: #60a5fa;
}

.status-pending {
  color: #f59e0b;
}
</style>
