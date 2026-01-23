<template>
  <div class="panel-overlay" @click.self="close">
    <div class="panel-shell">
      <div class="panel-head">
        <div class="panel-title">
          <div class="panel-icon">
            <i class="fas fa-layer-group"></i>
          </div>
          <div>
            <div class="title">快捷面板</div>
            <div class="sub">{{ appModeLabel }}</div>
          </div>
        </div>
        <div class="panel-head-actions">
          <button class="panel-close" @click="minimize">
            <i class="fas fa-window-restore"></i>
            小窗
          </button>
          <button class="panel-close" @click="close">
            <i class="fas fa-times"></i>
            关闭
          </button>
        </div>
      </div>

      <div class="panel-layout">
        <nav class="panel-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="panel-tab"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <i :class="tab.icon"></i>
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <section class="panel-main">
          <div v-if="activeTab === 'status'" class="panel-section">
            <div class="panel-card">
              <div class="panel-card-title">
                <i class="fas fa-user-shield"></i>
                角色状态
              </div>
              <div class="panel-grid">
                <ServiceStatus />
                <ServiceStats />
              </div>
            </div>
          </div>

          <div v-else-if="activeTab === 'discover'" class="panel-section">
            <DiscoverQuickPanel />
          </div>

          <div v-else-if="activeTab === 'history'" class="panel-section">
            <div class="panel-card">
              <div class="panel-card-title">
                <i class="fas fa-history"></i>
                历史订单
              </div>
              <div class="panel-card-desc">历史订单以单独弹窗展示，便于快速查看与复购。</div>
              <button class="panel-action" @click="openHistory">
                <i class="fas fa-up-right-from-square"></i>
                打开历史
              </button>
            </div>
          </div>

          <div v-else class="panel-section">
            <div class="panel-card">
              <div class="panel-card-title">
                <i class="fas fa-sliders"></i>
                设置
              </div>
              <div class="panel-actions">
                <button class="panel-action" @click="toggleTheme">
                  <i :class="['fas', isDark ? 'fa-sun' : 'fa-moon']"></i>
                  {{ isDark ? '切换到浅色' : '切换到深色' }}
                </button>
                <button class="panel-action" @click="refreshApp">
                  <i class="fas fa-sync-alt"></i>
                  刷新界面
                </button>
                <button class="panel-action" @click="regenerateHomeShops">
                  <i class="fas fa-wand-magic-sparkles"></i>
                  重新生成首页店铺
                </button>
              </div>
            </div>

            <div class="panel-card">
              <div class="panel-card-title">
                <i class="fas fa-route"></i>
                快速入口
              </div>
              <div class="panel-nav-grid">
                <button v-for="item in navItems" :key="item.path" class="panel-chip" @click="go(item.path)">
                  <i :class="item.icon"></i>
                  {{ item.label }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { requestStreaming } from '../utils';
import { historyOverlayOpen, playPanelsMini, playPanelsOpen } from '../shared/uiState';
import ServiceStats from './ServiceStats.vue';
import ServiceStatus from './ServiceStatus.vue';
import DiscoverQuickPanel from './DiscoverQuickPanel.vue';
import { appModeLabel, isAppMode, isMixedMode } from '../shared/appMode';

const router = useRouter();

const navItems = [
  { icon: 'fas fa-gamepad', label: 'Play', path: '/play' },
  { icon: 'fas fa-home', label: 'Home', path: '/home' },
  { icon: 'fas fa-concierge-bell', label: 'Service', path: '/service' },
  { icon: 'fas fa-compass', label: 'Discover', path: '/discover' },
];

const isDark = ref(false);
const showStorePanels = computed(() => isAppMode.value || isMixedMode.value);

const tabs = computed(() => {
  const base = [
    { id: 'status', label: '状态', icon: 'fas fa-user-shield' },
    { id: 'discover', label: '发现', icon: 'fas fa-compass' },
    { id: 'history', label: '历史', icon: 'fas fa-history' },
    { id: 'settings', label: '设置', icon: 'fas fa-sliders' },
  ];
  if (!showStorePanels.value) {
    return base.filter(t => t.id !== 'discover' && t.id !== 'history');
  }
  return base;
});

const activeTab = ref<'status' | 'discover' | 'history' | 'settings'>('status');

watch(tabs, next => {
  if (!next.find(t => t.id === activeTab.value)) {
    activeTab.value = (next[0]?.id as any) || 'status';
  }
});

function close() {
  playPanelsOpen.value = false;
}

function minimize() {
  playPanelsMini.value = true;
  playPanelsOpen.value = false;
}

function openHistory() {
  historyOverlayOpen.value = true;
}

function go(path: string) {
  close();
  router.push(path);
}

function toggleTheme() {
  isDark.value = !isDark.value;
  window.dispatchEvent(
    new CustomEvent('theme-change', {
      detail: { isDark: isDark.value },
    }),
  );
  localStorage.setItem('app-theme', isDark.value ? 'dark' : 'light');
}

function refreshApp() {
  try {
    const fn = (window as any)?.reloadIframe;
    if (typeof fn === 'function') {
      fn();
      return;
    }
  } catch {
    // ignore
  }
  window.location.reload();
}

function sendToAI(message: string) {
  const fullCommand = `${message} | /trigger await=true`;
  const fn = (window as any)?.triggerSlash;
  if (typeof fn !== 'function') return false;
  try {
    fn(fullCommand);
    return true;
  } catch {
    return false;
  }
}

function regenerateHomeShops() {
  requestStreaming('shop');
  const ok = sendToAI('/send 生成-首页-熟人店铺2个-路人店铺2个');
  try {
    const toastr = (window as any)?.toastr;
    if (ok) toastr?.success?.('已发送生成指令', '已发送');
    else toastr?.info?.('未检测到 triggerSlash（已进入降级模式）', '提示');
  } catch {
    // ignore
  }
}

onMounted(() => {
  try {
    const savedTheme = localStorage.getItem('app-theme');
    isDark.value = savedTheme === 'dark';
  } catch {
    isDark.value = false;
  }
});
</script>

<style scoped lang="scss">
.panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 5200;
  background: rgba(2, 6, 23, 0.6);
  padding: 16px;
}

.panel-shell {
  width: min(1120px, 100%);
  margin: 0 auto;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.98));
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 20px;
  box-shadow: 0 25px 60px rgba(15, 23, 42, 0.5);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #e2e8f0;
}

.panel-icon {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(59, 130, 246, 0.12);
  color: #93c5fd;
}

.panel-title .title {
  font-weight: 700;
  font-size: 16px;
}

.panel-title .sub {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.7);
}

.panel-close {
  border-radius: 14px;
  padding: 8px 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
}

.panel-layout {
  display: grid;
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr);
  gap: 16px;
}

.panel-tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.8);
  color: rgba(226, 232, 240, 0.85);
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.panel-tab.active {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.2);
  color: #e0f2fe;
}

.panel-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-card {
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.75);
  padding: 14px;
  color: #e2e8f0;
}

.panel-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
}

.panel-card-desc {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
  margin-bottom: 10px;
}

.panel-grid {
  display: grid;
  gap: 12px;
}

.panel-actions {
  display: grid;
  gap: 8px;
}

.panel-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(30, 41, 59, 0.6);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
}

.panel-nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.panel-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(30, 41, 59, 0.5);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
}

@media (max-width: 900px) {
  .panel-layout {
    grid-template-columns: 1fr;
  }
  .panel-tabs {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
