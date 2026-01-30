<template>
  <div class="relative flex w-full flex-col bg-slate-950 text-white selection:bg-blue-500/30" :data-theme="currentTheme">
    <!-- Background Effects -->
    <div class="absolute inset-0 -z-20 bg-gradient-to-br from-slate-950 via-slate-900 to-black"></div>
    <div class="absolute inset-0 -z-10 bg-gradient-to-br from-blue-600/5 via-purple-600/5 to-orange-600/5"></div>
    <div class="glow-layer glow-layer--one"></div>
    <div class="glow-layer glow-layer--two"></div>

    <div class="flex w-full items-stretch">
      <!-- Sidebar (Play 页面优先正文：隐藏侧栏，改用面板弹窗导航) -->
      <Sidebar v-if="!hideSidebar" />

      <!-- Main Content Area -->
      <main class="relative flex min-w-0 flex-1 flex-col">
        <ErrorBoundary>
          <div class="flex flex-col">
            <RouterView v-slot="{ Component }">
              <transition name="fade">
                <component :is="Component" v-if="Component" class="w-full" />
              </transition>
            </RouterView>
          </div>
        </ErrorBoundary>
      </main>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, onErrorCaptured, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import ErrorBoundary from './components/ErrorBoundary.vue';
import Sidebar from './components/Sidebar.vue';
import { enableIframeFullHeight } from './utils';

// 当前主题
const currentTheme = ref<'light' | 'dark'>('light');
const route = useRoute();
const hideSidebar = computed(() => route.path === '/play');

let disableIframeFullHeight: () => void = () => {};

// 初始化主题
function initTheme() {
  // 默认使用浅色模式
  const savedTheme = localStorage.getItem('app-theme') || 'dark';
  const isDark = savedTheme === 'dark';

  // 设置Vue响应式数据
  currentTheme.value = savedTheme as 'light' | 'dark';

  // 同时设置到documentElement，确保CSS变量能正确应用
  document.documentElement.setAttribute('data-theme', savedTheme);

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  console.log(`[主题初始化] 已加载${isDark ? '深色' : '浅色'}模式`);
}

// 在组件挂载时初始化主题
onMounted(() => {
  initTheme();
  window.addEventListener('theme-change', onThemeChange);
  disableIframeFullHeight = enableIframeFullHeight({ minHeightPx: 0 });
});

function onThemeChange(event: any) {
  const newTheme = event.detail.isDark ? 'dark' : 'light';
  currentTheme.value = newTheme;
  document.documentElement.setAttribute('data-theme', newTheme);

  if (newTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  console.log(`[主题切换] 已切换到${newTheme === 'dark' ? '深色' : '浅色'}模式`);
}

onUnmounted(() => {
  window.removeEventListener('theme-change', onThemeChange);
  disableIframeFullHeight();
});

// 全局错误处理
onErrorCaptured((err: Error) => {
  console.error('[全局错误] 根组件错误:', err);
  return false;
});

</script>

<style lang="scss">
@import url('https://testingcf.jsdelivr.net/npm/@fontsource/material-symbols-outlined@latest/index.css');

/* 让应用高度跟随宿主 iframe；滚动交给子容器 */
html,
body {
  height: auto;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  overflow-y: visible;
  font-family: 'Noto Sans SC', 'MiSans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: var(--bg-primary);
}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
  font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 全局滚动条样式覆盖 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.5);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(71, 85, 105, 0.8);
}

// 保留原有的 CSS 变量定义，以兼容旧组件（如果需要）
:root {
  --bg-primary: #f8f6f1;
  --bg-header: #fff4d1;
  --bg-header-light: #fffaf0;
  --bg-card: #fff6e8;
  --bg-badge: #fff0bf;
  --border-color: rgba(55, 47, 32, 0.12);
  --border-accent: rgba(245, 183, 74, 0.45);
  --text-primary: #2b2620;
  --text-secondary: #6f6558;
  --text-placeholder: #9b8f7a;
  --accent-primary: #f4b400;
  --accent-dark: #c98a00;
  --shadow-sm: 0 8px 20px rgba(245, 183, 74, 0.2);
  --shadow-md: 0 16px 32px rgba(201, 138, 0, 0.22);
  --glass-bg: rgba(25, 16, 34, 0.7);
  --glass-border: rgba(255, 255, 255, 0.08);
  --image-placeholder: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%231b2333' offset='0'/><stop stop-color='%23312b45' offset='1'/></linearGradient></defs><rect width='100%25' height='100%25' fill='url(%23g)'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ffffff' opacity='0.55' font-size='48' font-family='Noto Sans SC, sans-serif'>IMAGE</text></svg>");
  --avatar-placeholder: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%23242a3a' offset='0'/><stop stop-color='%233b3f52' offset='1'/></linearGradient></defs><rect width='100%25' height='100%25' rx='200' ry='200' fill='url(%23g)'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ffffff' opacity='0.65' font-size='64' font-family='Noto Sans SC, sans-serif'>AVATAR</text></svg>");
}

[data-theme='dark'] {
  --bg-primary: #0b0f1a;
  --bg-header: #12182a;
  --bg-header-light: #1b2236;
  --bg-card: #121a2d;
  --bg-badge: #1b243a;
  --border-color: rgba(148, 163, 184, 0.16);
  --border-accent: rgba(122, 172, 255, 0.35);
  --text-primary: #e9edf5;
  --text-secondary: #a6b0c2;
  --text-placeholder: #7e899b;
  --accent-primary: #6bbcff;
  --accent-dark: #3a77c9;
  --shadow-sm: 0 10px 26px rgba(12, 20, 40, 0.45);
  --shadow-md: 0 20px 40px rgba(9, 14, 28, 0.55);
}

/* 模糊光斑层 */
.glow-layer {
  position: absolute;
  z-index: -10;
  width: 380px;
  height: 380px;
  border-radius: 9999px;
  filter: blur(120px);
  opacity: 0.35;
  animation: glowPulse 9s ease-in-out infinite;
  pointer-events: none;
}

.glow-layer--one {
  top: -40px;
  left: 10%;
  background: rgba(99, 102, 241, 0.45);
}

.glow-layer--two {
  bottom: -60px;
  right: 8%;
  background: rgba(236, 72, 153, 0.35);
  animation-delay: 1.8s;
}

@keyframes glowPulse {
  0%,
  100% {
    transform: scale(0.95);
  }
  50% {
    transform: scale(1.06);
  }
}

/* 玻璃通用面板 */
.glass-panel {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.glass-nav {
  background: rgba(15, 11, 21, 0.85);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

/* 统一图片占位 */
.image-placeholder {
  background-image: var(--image-placeholder);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.avatar-placeholder {
  background-image: var(--avatar-placeholder);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* #app 作为容器占满 iframe */
#app {
  height: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
}
</style>
