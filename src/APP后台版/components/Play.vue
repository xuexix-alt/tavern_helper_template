<template>
  <div class="play-shell">
    <!-- Header (正文优先；大图可折叠) -->
    <div class="play-header">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 text-xs text-slate-300/90">
            <span
              class="inline-flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/40 px-3 py-1"
            >
              <span class="h-2 w-2 animate-pulse rounded-full bg-green-400"></span>
              <span>LIVE</span>
            </span>
            <span
              class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]"
              :class="modeToneClass"
            >
              <i class="fas fa-bolt"></i>
              <span>{{ appModeLabel }}</span>
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

    <div v-if="showScene" class="play-stage">
      <div class="play-stage-media">
        <PackageImageGallery variant="stage" />
      </div>
    </div>

    <!-- Content -->
    <div class="play-body">
      <!-- Narrative / Log -->
      <section class="play-log-card" :class="{ 'link-market': isMarketLinked }" @click="focusText">
        <div class="play-log-head">
          <div class="flex items-center gap-2 text-sm font-bold text-slate-100">
            <i class="fas fa-scroll text-blue-300"></i>
            正文和剧情
          </div>
          <button
            class="rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-1 text-xs text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
            @click="clearLog"
            :disabled="isStreaming"
          >
            <i class="fas fa-eraser"></i>
            <span class="ml-1">清空</span>
          </button>
        </div>

        <div class="play-tools">
          <span class="rounded-full border border-slate-700/50 bg-slate-900/40 px-2 py-0.5">快捷指令</span>
          <div
            class="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent flex flex-1 gap-2 overflow-x-auto"
          >
            <button
              v-for="item in quickActions"
              :key="item.label"
              class="whitespace-nowrap rounded-full border border-slate-700/50 bg-slate-900/50 px-3 py-1 text-[11px] text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
              @click="pickQuickAction(item.command)"
            >
              {{ item.label }}
            </button>
          </div>
          <span class="hidden sm:inline">· 发送后会尝试触发指令</span>
        </div>

        <div ref="logScrollEl" class="play-log-content">
          <pre
            class="whitespace-pre-wrap">{{ streamContent }}<span v-if="isStreaming" class="animate-pulse">_</span></pre>
          <div ref="logTailEl"></div>
        </div>
      </section>
    </div>

    <!-- Input Bar -->
    <div class="play-input" :class="{ 'link-market': isMarketLinked }" :style="{ paddingBottom: safeAreaBottom }">
      <div class="play-input-row">
        <input
          ref="inputEl"
          v-model="userInput"
          class="play-input-field"
          placeholder="输入指令…（例如：生成 / 搜索 /home 或 /send 你好）"
          @focus="focusText"
          @keydown.enter.exact.prevent="send"
        />
        <button class="play-send" :disabled="!userInput.trim()" @click="send">
          <i class="fas fa-paper-plane"></i>
          <span>发送</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import PackageImageGallery from './PackageImageGallery.vue';
import { getNestedValue, requestStreaming } from '../utils';
import { selectedPackage } from '../shared/selectedPackage';
import { focusArea } from '../shared/uiState';
import { appModeLabel, isAppMode, isMixedMode, isRpMode } from '../shared/appMode';

const streamContent = ref('');
const isStreaming = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const userInput = ref('');
const showScene = ref(false);
const logScrollEl = ref<HTMLDivElement | null>(null);
const logTailEl = ref<HTMLDivElement | null>(null);

const headerTitle = ref('正文和剧情');
const headerSubTitle = ref('Play 为核心 · 角色/商城/历史等功能从面板挂载');
const headerHint = ref('自动读取聊天记录并监听消息（如环境支持）');

const isMarketLinked = computed(() => focusArea.value === 'market');

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

const quickActions = computed(() => {
  if (isRpMode.value) {
    return [
      { label: '继续剧情', command: '继续' },
      { label: '续写一段', command: '续写' },
      { label: '打开：首页', command: '/home' },
    ];
  }
  if (isMixedMode.value) {
    return [
      { label: '生成：店铺 + 套餐（默认）', command: '生成' },
      { label: '继续剧情', command: '继续' },
      { label: '打开：发现', command: '/discover' },
      { label: '打开：首页', command: '/home' },
    ];
  }
  return [
    { label: '生成：店铺 + 套餐（默认）', command: '生成' },
    { label: '打开：发现', command: '/discover' },
    { label: '打开：首页', command: '/home' },
  ];
});

const modeToneClass = computed(() => {
  if (isRpMode.value) return 'border-purple-500/30 bg-purple-500/10 text-purple-200';
  if (isMixedMode.value) return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
});

function scrollToBottom() {
  const el = logTailEl.value || logScrollEl.value;
  if (!el) return;
  try {
    el.scrollIntoView({ block: 'end', behavior: 'smooth' });
  } catch {
    // ignore
  }
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

function shouldEnableStreaming(input: string) {
  const text = input.trim();
  if (!text) return false;
  if (/^\/(home|discover|service|play)\b/i.test(text)) return false;
  if (/^\/(help|clear|reset)\b/i.test(text)) return false;
  return /生成|续写|继续|剧情|正文|故事|店铺|搜索/.test(text) || /^\/send\b/i.test(text);
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
  focusText();
  appendLogBlock(`> ${raw}`);

  if (shouldEnableStreaming(raw)) {
    requestStreaming('play');
  }

  const cmd = raw.startsWith('/') ? `${raw} | /trigger await=true` : `/send ${raw} | /trigger await=true`;
  const ok = tryTriggerSlash(cmd);
  if (!ok) appendLogBlock('[提示] 未检测到 triggerSlash：已记录到日志（降级模式）');

  nextTick(() => inputEl.value?.focus());
}

function toggleScene() {
  showScene.value = !showScene.value;
}

function focusText() {
  focusArea.value = 'text';
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
      : 'Play 为核心 · 角色/商城/历史等功能从面板挂载';
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

<style scoped lang="scss">
.play-shell {
  width: 100%;
  background: linear-gradient(135deg, rgba(2, 6, 23, 0.88), rgba(15, 23, 42, 0.92));
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(18px);
  padding: 0;
}

.play-header {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
}

.play-stage {
  border-bottom: 1px solid rgba(59, 130, 246, 0.15);
  padding: 12px 14px 14px;
}

.play-stage-media {
  width: 100%;
  aspect-ratio: 21 / 9;
  overflow: hidden;
  border-radius: 16px;
}

.play-body {
  padding: 14px 16px 0;
  display: grid;
  gap: 12px;
}

.play-log-card {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(2, 6, 23, 0.65);
}

.play-log-card.link-market {
  border-color: rgba(16, 185, 129, 0.45);
  box-shadow:
    0 0 0 1px rgba(16, 185, 129, 0.2),
    0 12px 30px rgba(16, 185, 129, 0.12);
}

.play-log-head {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
}

.play-tools {
  padding: 8px 16px;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.25);
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.65);
}

.play-log-content {
  padding: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: #e2e8f0;
  white-space: pre-wrap;
}

.play-input {
  padding: 14px 16px 18px;
}

.play-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.play-input-field {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(2, 6, 23, 0.75);
  padding: 12px 14px;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.play-input-field:focus {
  border-color: rgba(96, 165, 250, 0.6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.play-input.link-market .play-input-field {
  border-color: rgba(16, 185, 129, 0.5);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
}

.play-send {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 16px;
  padding: 12px 18px;
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(139, 92, 246, 0.85));
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.play-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.play-send:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.35);
}

@media (max-width: 768px) {
  .play-shell {
    border-radius: 12px;
  }
  .play-input-row {
    grid-template-columns: 1fr;
  }
  .play-send {
    justify-content: center;
  }
}
</style>
