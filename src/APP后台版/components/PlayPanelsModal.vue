<template>
  <div class="fixed inset-0 z-[5200] bg-black/70 p-3 sm:p-4" @click.self="close">
    <div
      class="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-900/95 to-black/90 shadow-2xl shadow-blue-500/10 backdrop-blur"
    >
      <div class="flex items-center gap-3 border-b border-slate-700/50 px-4 py-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
          <i class="fas fa-layer-group"></i>
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-bold text-white">面板</div>
          <div class="truncate text-[11px] text-slate-400">手风琴/弹窗：尽量不挤占正文区域</div>
        </div>

        <button
          class="rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 hover:border-blue-500/30 hover:bg-slate-700/50"
          @click="close"
        >
          <i class="fas fa-times"></i>
          <span class="ml-2">关闭</span>
        </button>
      </div>

      <div
        class="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent min-h-0 flex-1 overflow-y-auto p-4"
      >
        <div class="space-y-3">
          <details open class="rounded-2xl border border-slate-700/50 bg-slate-950/40">
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-100"
            >
              <span class="flex items-center gap-2">
                <i class="fas fa-user-shield text-blue-300"></i>
                角色状态
              </span>
              <i class="fas fa-chevron-down text-xs text-slate-400"></i>
            </summary>
            <div class="grid gap-3 px-4 pb-4 pt-1">
              <ServiceStatus />
              <ServiceStats />
            </div>
          </details>

          <details class="rounded-2xl border border-slate-700/50 bg-slate-950/40">
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-100"
            >
              <span class="flex items-center gap-2">
                <i class="fas fa-store text-green-300"></i>
                商城与套餐
              </span>
              <i class="fas fa-chevron-down text-xs text-slate-400"></i>
            </summary>
            <div class="grid gap-3 px-4 pb-4 pt-1">
              <ShopList />
              <PackageDetail />
              <PackageImages />
            </div>
          </details>

          <details class="rounded-2xl border border-slate-700/50 bg-slate-950/40">
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-100"
            >
              <span class="flex items-center gap-2">
                <i class="fas fa-history text-blue-300"></i>
                历史订单
              </span>
              <i class="fas fa-chevron-down text-xs text-slate-400"></i>
            </summary>
            <div class="px-4 pb-4 pt-1">
              <div class="rounded-xl border border-slate-700/50 bg-slate-900/30 p-3 text-xs text-slate-300">
                历史订单以单独弹窗展示，避免面板过长导致滚动困难。
                <button
                  class="ml-2 rounded-lg border border-slate-700/50 bg-slate-950/40 px-2 py-1 text-xs text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
                  @click="openHistory"
                >
                  <i class="fas fa-up-right-from-square"></i>
                  <span class="ml-1">打开</span>
                </button>
              </div>
            </div>
          </details>

          <details class="rounded-2xl border border-slate-700/50 bg-slate-950/40">
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-100"
            >
              <span class="flex items-center gap-2">
                <i class="fas fa-compass text-violet-300"></i>
                导航
              </span>
              <i class="fas fa-chevron-down text-xs text-slate-400"></i>
            </summary>
            <div class="grid gap-2 px-4 pb-4 pt-1">
              <button
                v-for="item in navItems"
                :key="item.path"
                class="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/30 px-3 py-2 text-left text-sm text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
                @click="go(item.path)"
              >
                <span class="flex items-center gap-2">
                  <i :class="item.icon"></i>
                  <span>{{ item.label }}</span>
                </span>
                <i class="fas fa-chevron-right text-xs text-slate-500"></i>
              </button>
            </div>
          </details>

          <details class="rounded-2xl border border-slate-700/50 bg-slate-950/40">
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-100"
            >
              <span class="flex items-center gap-2">
                <i class="fas fa-sliders text-slate-200"></i>
                设置
              </span>
              <i class="fas fa-chevron-down text-xs text-slate-400"></i>
            </summary>
            <div class="grid gap-2 px-4 pb-4 pt-1">
              <button
                class="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/30 px-3 py-2 text-left text-sm text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
                @click="toggleTheme"
              >
                <span class="flex items-center gap-2">
                  <i :class="['fas', isDark ? 'fa-sun text-yellow-300' : 'fa-moon text-blue-300']"></i>
                  <span>{{ isDark ? '切换到浅色' : '切换到深色' }}</span>
                </span>
                <i class="fas fa-chevron-right text-xs text-slate-500"></i>
              </button>

              <button
                class="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/30 px-3 py-2 text-left text-sm text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
                @click="refreshApp"
              >
                <span class="flex items-center gap-2">
                  <i class="fas fa-sync-alt text-green-300"></i>
                  <span>刷新界面</span>
                </span>
                <i class="fas fa-chevron-right text-xs text-slate-500"></i>
              </button>

              <button
                class="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/30 px-3 py-2 text-left text-sm text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
                @click="regenerateHomeShops"
              >
                <span class="flex items-center gap-2">
                  <i class="fas fa-wand-magic-sparkles text-purple-300"></i>
                  <span>重新生成首页店铺</span>
                </span>
                <i class="fas fa-chevron-right text-xs text-slate-500"></i>
              </button>
            </div>
          </details>
        </div>
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-slate-700/50 px-4 py-3">
        <div class="text-[11px] text-slate-500">提示：面板关闭后，正文区域保持最大化显示。</div>
        <button
          class="rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700/50"
          @click="close"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { historyOverlayOpen, playPanelsOpen } from '../shared/uiState';
import PackageDetail from './PackageDetail.vue';
import PackageImages from './PackageImages.vue';
import ServiceStats from './ServiceStats.vue';
import ServiceStatus from './ServiceStatus.vue';
import ShopList from './ShopList.vue';

const router = useRouter();

const navItems = [
  { icon: 'fas fa-gamepad text-blue-300', label: 'Play', path: '/play' },
  { icon: 'fas fa-home text-slate-200', label: 'Home', path: '/home' },
  { icon: 'fas fa-concierge-bell text-slate-200', label: 'Service', path: '/service' },
  { icon: 'fas fa-compass text-slate-200', label: 'Discover', path: '/discover' },
];

const isDark = ref(false);

function close() {
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
