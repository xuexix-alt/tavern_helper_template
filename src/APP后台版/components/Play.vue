<template>
  <div
    class="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-slate-900/75 to-black/60 shadow-2xl shadow-blue-500/10 backdrop-blur-xl"
  >
    <!-- Header (正文优先；大图可折叠) -->
    <div class="shrink-0 border-b border-blue-500/10 p-3 sm:p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 text-xs text-slate-300/90">
            <span
              class="inline-flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/40 px-3 py-1"
            >
              <span class="h-2 w-2 animate-pulse rounded-full bg-green-400"></span>
              <span>LIVE</span>
            </span>
            <span class="truncate text-slate-400">{{ headerHint }}</span>
          </div>
          <div class="mt-2 truncate text-base font-bold text-white">{{ headerTitle }}</div>
          <div class="mt-0.5 truncate text-xs text-slate-400">{{ headerSubTitle }}</div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            class="rounded-xl border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
            @click="toggleScene"
          >
            <i class="fas fa-image"></i>
            <span class="ml-2 hidden sm:inline">{{ showScene ? '收起' : '场景图' }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="showScene" class="relative shrink-0 border-b border-blue-500/10">
      <div class="relative aspect-[21/9] w-full overflow-hidden">
        <PackageImageGallery variant="stage" />
      </div>
    </div>

    <!-- Content -->
    <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <!-- Narrative / Log -->
      <section class="min-h-0 overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-950/60">
        <div class="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
          <div class="flex items-center gap-2 text-sm font-bold text-slate-200">
            <i class="fas fa-scroll text-blue-300"></i>
            交互日志
          </div>
          <button
            class="rounded-lg border border-slate-700/50 bg-slate-900/50 px-2 py-1 text-xs text-slate-300 hover:border-blue-500/30 hover:bg-slate-800/60"
            @click="clearLog"
            :disabled="isStreaming"
          >
            <i class="fas fa-eraser"></i>
            <span class="ml-1">清空</span>
          </button>
        </div>

        <div
          ref="logScrollEl"
          class="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent h-full overflow-y-auto p-4 font-mono text-[13px] leading-relaxed text-green-300"
        >
          <pre
            class="whitespace-pre-wrap">{{ streamContent }}<span v-if="isStreaming" class="animate-pulse">_</span></pre>
        </div>
      </section>

      <!-- Quick Actions -->
      <aside class="hidden min-h-0 flex-col gap-3 lg:flex">
        <div class="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-4">
          <div class="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <i class="fas fa-bolt text-yellow-300"></i>
            快捷指令
          </div>
          <div class="flex flex-col gap-2">
            <button
              v-for="item in quickActions"
              :key="item.label"
              class="group flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-left text-sm text-slate-200 transition-all hover:border-blue-500/30 hover:bg-slate-800/60"
              @click="pickQuickAction(item.command)"
            >
              <span class="truncate">{{ item.label }}</span>
              <i
                class="fas fa-chevron-right text-xs text-slate-500 transition-transform group-hover:translate-x-0.5"
              ></i>
            </button>
          </div>
          <div class="mt-3 text-xs text-slate-500">提示：发送后会尝试调用 `triggerSlash`（如存在）。</div>
        </div>
      </aside>
    </div>

    <!-- Input Bar -->
    <div class="shrink-0 border-t border-slate-800/60 p-4" :style="{ paddingBottom: safeAreaBottom }">
      <div class="flex items-center gap-2">
        <div class="flex-1">
          <input
            ref="inputEl"
            v-model="userInput"
            class="w-full rounded-2xl border border-slate-700/50 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500/40 focus:outline-none"
            placeholder="输入指令…（例如：生成 / 搜索 /home 或 /send 你好）"
            @keydown.enter.exact.prevent="send"
          />
        </div>
        <button
          class="flex items-center justify-center rounded-2xl border border-blue-400/30 bg-gradient-to-r from-blue-500 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-violet-700 disabled:opacity-50"
          :disabled="!userInput.trim()"
          @click="send"
        >
          <i class="fas fa-paper-plane"></i>
          <span class="ml-2 hidden sm:inline">发送</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import PackageImageGallery from './PackageImageGallery.vue';
import { getNestedValue } from '../utils';
import { selectedPackage } from '../shared/selectedPackage';

const streamContent = ref('');
const isStreaming = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const userInput = ref('');
const showScene = ref(false);
const logScrollEl = ref<HTMLDivElement | null>(null);

const headerTitle = ref('交互界面');
const headerSubTitle = ref('正文区域优先显示 · 角色/商城请用上方“面板”');
const headerHint = ref('将自动读取聊天记录并监听消息（如环境支持）');

const safeAreaBottom = (() => {
  try {
    return `max(16px, env(safe-area-inset-bottom))`;
  } catch {
    return '16px';
  }
})();

const selectedInfo = computed(() => {
  const pkg = selectedPackage.value;
  if (!pkg) return '';
  const shop = pkg.shop_name ? ` · ${pkg.shop_name}` : '';
  const name = pkg.name || '未命名套餐';
  return `${name}${shop}`;
});

const quickActions = [
  { label: '生成：店铺 + 套餐（默认）', command: '生成' },
  { label: '打开：首页', command: '/home' },
  { label: '打开：发现', command: '/discover' },
];

function scrollToBottom() {
  const el = logScrollEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

watch(
  () => streamContent.value,
  () => {
    nextTick(() => scrollToBottom());
  },
);

function appendLogBlock(text: string) {
  if (!text) return;
  const prefix = streamContent.value ? '\n\n' : '';
  streamContent.value += `${prefix}${text}`;
}

function clearLog() {
  streamContent.value = '';
  isStreaming.value = false;
}

function pickQuickAction(command: string) {
  userInput.value = command;
  nextTick(() => inputEl.value?.focus());
}

function tryTriggerSlash(command: string) {
  const fn = (window as any)?.triggerSlash;
  if (typeof fn !== 'function') return false;
  try {
    fn(command);
    return true;
  } catch (e) {
    console.error('[Play] triggerSlash failed:', e);
    return false;
  }
}

function send() {
  const raw = userInput.value.trim();
  if (!raw) return;

  userInput.value = '';
  appendLogBlock(`> ${raw}`);

  const cmd = raw.startsWith('/') ? `${raw} | /trigger await=true` : `/send ${raw} | /trigger await=true`;
  const ok = tryTriggerSlash(cmd);
  if (!ok) appendLogBlock('[提示] 未检测到 triggerSlash：已记录到日志（降级模式）');

  nextTick(() => inputEl.value?.focus());
}

function toggleScene() {
  showScene.value = !showScene.value;
}

function refreshHeaderFromMvu() {
  try {
    const getSnapshot = () => {
      try {
        const message_id =
          typeof (window as any).getCurrentMessageId === 'function' ? (window as any).getCurrentMessageId() : 'latest';
        if (typeof (window as any).waitGlobalInitialized === 'function') {
          try {
            (window as any).waitGlobalInitialized('Mvu');
          } catch {
            // ignore
          }
        }
        if (typeof (window as any).Mvu !== 'undefined' && (window as any).Mvu?.getMvuData) {
          return (window as any).Mvu.getMvuData({ type: 'message', message_id });
        }
        if (typeof (window as any).getVariables === 'function') {
          return (window as any).getVariables({ type: 'message', message_id });
        }
        return null;
      } catch {
        return null;
      }
    };

    const snap = getSnapshot();
    const stat = snap?.stat_data || snap || {};
    const scene = getNestedValue(stat, '系统状态.当前场景', '') || getNestedValue(stat, '系统状态.当前模式', '');
    headerTitle.value = scene ? `当前场景：${scene}` : '交互界面';
    headerSubTitle.value = selectedInfo.value
      ? `已选中：${selectedInfo.value}`
      : '正文区域优先显示 · 角色/商城请用上方“面板”';
  } catch {
    // ignore
  }
}

function initFromChat() {
  try {
    if (typeof (window as any).getChatMessages !== 'function') return false;
    const all = (window as any).getChatMessages('0-{{lastMessageId}}') || [];
    const last = all.slice(-18);
    const text = last
      .map((m: any) => {
        const role = m?.role || 'unknown';
        const name = m?.name ? `${m.name}` : role;
        const msg = String(m?.message ?? '').trim();
        if (!msg) return '';
        return `[${name}] ${msg}`;
      })
      .filter(Boolean)
      .join('\n\n');
    if (!text) return false;
    streamContent.value = text;
    return true;
  } catch {
    return false;
  }
}

let stopStreamHint: { stop: () => void } | null = null;
let stopMessageReceive: { stop: () => void } | null = null;

onMounted(() => {
  refreshHeaderFromMvu();
  const ok = initFromChat();
  if (!ok) {
    streamContent.value =
      'System initialized.\n（未检测到聊天接口，已进入降级模式）\n\n你仍可使用下方输入框发送 /send 指令。';
  }

  try {
    const canListen =
      typeof (window as any).eventOn === 'function' && typeof (window as any).tavern_events !== 'undefined';
    if (canListen) {
      // 不直接拼接 token，避免和 MESSAGE_RECEIVED 产生重复；这里只做“正在生成”的指示
      stopStreamHint = (window as any).eventOn((window as any).tavern_events.STREAM_TOKEN_RECEIVED, () => {
        isStreaming.value = true;
      });
      stopMessageReceive = (window as any).eventOn(
        (window as any).tavern_events.MESSAGE_RECEIVED,
        (message_id: number) => {
          try {
            if (typeof (window as any).getChatMessages !== 'function') return;
            const msg = (window as any).getChatMessages(message_id)?.[0];
            if (!msg) return;
            const role = msg.role || 'assistant';
            const name = msg.name || role;
            const body = String(msg.message ?? '').trim();
            if (!body) return;
            appendLogBlock(`[${name}] ${body}`);
          } finally {
            isStreaming.value = false;
            refreshHeaderFromMvu();
          }
        },
      );
    }
  } catch {
    // ignore
  }

  nextTick(() => inputEl.value?.focus());
});

onUnmounted(() => {
  stopStreamHint?.stop?.();
  stopMessageReceive?.stop?.();
});
</script>
