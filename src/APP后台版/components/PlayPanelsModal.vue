<template>
  <div class="panel-overlay" @click.self="close">
    <div class="panel-shell">
      <div class="panel-head">
        <div class="panel-title">
          <div class="panel-icon">
            <span class="material-symbols-outlined">layers</span>
          </div>
          <div>
            <div class="title">快捷面板</div>
            <div class="sub">{{ appModeLabel }}</div>
          </div>
        </div>

        <div class="panel-head-actions">
          <button class="panel-close" @click="minimize">
            <span class="material-symbols-outlined">open_in_full</span>
            小窗
          </button>
          <button class="panel-close" @click="close">
            <span class="material-symbols-outlined">close</span>
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
            <span class="material-symbols-outlined">{{ tab.icon }}</span>
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <section class="panel-main">
          <div v-if="activeTab === 'status'" class="panel-section">
            <div class="panel-card">
              <div class="panel-card-title">
                <span class="material-symbols-outlined">shield</span>
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
                <span class="material-symbols-outlined">history</span>
                历史订单
              </div>
              <div class="panel-card-desc">历史订单以单独弹窗展示，便于快速查看与复购。</div>
              <button class="panel-action" @click="openHistory">
                <span class="material-symbols-outlined">open_in_new</span>
                打开历史
              </button>
            </div>
          </div>

          <div v-else class="panel-section">
            <div class="panel-card">
              <div class="panel-card-title">
                <span class="material-symbols-outlined">tune</span>
                设置
              </div>
              <div class="panel-actions">
                <button class="panel-action" @click="toggleTheme">
                  <span class="material-symbols-outlined">{{ isDark ? 'light_mode' : 'dark_mode' }}</span>
                  {{ isDark ? '切换到浅色' : '切换到深色' }}
                </button>
                <button class="panel-action" @click="refreshApp">
                  <span class="material-symbols-outlined">sync</span>
                  刷新界面
                </button>
                <button class="panel-action" @click="regenerateHomeShops">
                  <span class="material-symbols-outlined">auto_awesome</span>
                  重新生成首页店铺
                </button>
              </div>
            </div>

            <div class="panel-card">
              <div class="panel-card-title">
                <span class="material-symbols-outlined">menu_book</span>
                正文外观
              </div>
              <div class="panel-card-desc">你可以自定义 Play 页“正文和剧情”的底图与底色（本地/变量持久化）。</div>

              <div class="panel-form">
                <label class="panel-label">底图来源</label>
                <div class="panel-chip-row">
                  <button
                    class="panel-chip"
                    :class="{ active: playAppearance.logBgSource === 'none' }"
                    @click="playAppearance.logBgSource = 'none'"
                  >
                    无
                  </button>
                  <button
                    class="panel-chip"
                    :class="{ active: playAppearance.logBgSource === 'placeholder' }"
                    @click="playAppearance.logBgSource = 'placeholder'"
                  >
                    占位图
                  </button>
                  <button
                    class="panel-chip"
                    :class="{ active: playAppearance.logBgSource === 'url' }"
                    @click="playAppearance.logBgSource = 'url'"
                  >
                    自定义URL
                  </button>
                </div>

                <label class="panel-label">底图URL</label>
                <input
                  class="panel-input"
                  v-model="playAppearance.logBgUrl"
                  placeholder="https://...（仅在“自定义URL”时生效）"
                />

                <label class="panel-label">底色</label>
                <div class="panel-chip-row">
                  <button class="panel-chip" @click="playAppearance.logTint = 'rgba(0, 0, 0, 0.55)'">黑</button>
                  <button class="panel-chip" @click="playAppearance.logTint = 'rgba(58, 35, 24, 0.7)'">棕</button>
                  <button class="panel-chip" @click="playAppearance.logTint = 'rgba(10, 16, 28, 0.7)'">蓝黑</button>
                </div>

                <label class="panel-label">底色强度</label>
                <input class="panel-range" type="range" min="0" max="1" step="0.05" v-model.number="playAppearance.logTintStrength" />

                <button class="panel-action" @click="resetPlayAppearance">
                  <span class="material-symbols-outlined">restart_alt</span>
                  恢复默认
                </button>
              </div>
            </div>

            <div class="panel-card">
              <div class="panel-card-title">
                <span class="material-symbols-outlined">route</span>
                快速入口
              </div>
              <div class="panel-nav-grid">
                <button v-for="item in navItems" :key="item.path" class="panel-chip" @click="go(item.path)">
                  <span class="material-symbols-outlined">{{ item.icon }}</span>
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
import { playAppearance as playAppearanceRef } from '../shared/playAppearance';
import ServiceStats from './ServiceStats.vue';
import ServiceStatus from './ServiceStatus.vue';
import DiscoverQuickPanel from './DiscoverQuickPanel.vue';
import { appModeLabel, isAppMode, isMixedMode } from '../shared/appMode';

const router = useRouter();

const navItems = [
  { icon: 'stadia_controller', label: 'Play', path: '/play' },
  { icon: 'home', label: 'Home', path: '/home' },
  { icon: 'room_service', label: 'Service', path: '/service' },
  { icon: 'explore', label: 'Discover', path: '/discover' },
];

const isDark = ref(false);
const showStorePanels = computed(() => isAppMode.value || isMixedMode.value);
const playAppearance = playAppearanceRef;

const tabs = computed(() => {
  const base = [
    { id: 'status', label: '状态', icon: 'shield' },
    { id: 'discover', label: '发现', icon: 'explore' },
    { id: 'history', label: '历史', icon: 'history' },
    { id: 'settings', label: '设置', icon: 'tune' },
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

function resetPlayAppearance() {
  playAppearance.value = {
    version: 1,
    logBgSource: 'placeholder',
    logBgUrl: '',
    logTint: 'rgba(0, 0, 0, 0.55)',
    logTintStrength: 0.6,
  };
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

.panel-form {
  display: grid;
  gap: 10px;
}

.panel-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(226, 232, 240, 0.85);
}

.panel-input {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(30, 41, 59, 0.55);
  color: #e2e8f0;
  padding: 10px 12px;
  font-size: 12px;
  outline: none;
}

.panel-input:focus {
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
}

.panel-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.panel-chip.active {
  border-color: rgba(59, 130, 246, 0.55);
  background: rgba(59, 130, 246, 0.18);
}

.panel-range {
  width: 100%;
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
