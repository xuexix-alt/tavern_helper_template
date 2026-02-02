<template>
  <div class="play-shell" @click="focusText">
    <!-- 常驻侧栏：把高风险/易误触功能固定在侧边，避免遮挡正文 -->
    <aside class="play-side" @click.stop>
      <button class="side-btn" :class="{ active: panelsActive }" @click="togglePanels" title="面板">
        <span class="material-symbols-outlined">layers</span>
      </button>
      <button class="side-btn" :class="{ active: shopOverlayOpen }" @click="toggleMarket" title="商城">
        <span class="material-symbols-outlined">storefront</span>
      </button>
      <button class="side-btn" :class="{ active: historyOverlayOpen }" @click="toggleHistory" title="历史">
        <span class="material-symbols-outlined">history</span>
      </button>

      <div class="side-spacer"></div>

      <button class="side-btn" @click="toggleTheme" title="切换主题">
        <span class="material-symbols-outlined">{{ isDark ? 'light_mode' : 'dark_mode' }}</span>
      </button>
      <button class="side-btn" @click="scrollToTop" title="到顶部">
        <span class="material-symbols-outlined">north</span>
      </button>
      <button class="side-btn" @click="scrollToBottom" title="到底部">
        <span class="material-symbols-outlined">south</span>
      </button>
    </aside>

    <div class="play-main">
      <!-- 顶部导航：保持轻量，只放页面跳转 -->
      <header class="play-topbar" @click.stop>
        <div class="topbar-title">
          <span class="material-symbols-outlined">stadia_controller</span>
          Play
        </div>
        <button class="topbar-toggle" @click="rightDockOpen = !rightDockOpen" :aria-pressed="rightDockOpen">
          <span class="material-symbols-outlined">menu</span>
          导航
        </button>
      </header>

      <section class="play-log-card" :style="logCardStyle">
      <div class="play-log-head">
        <div class="play-log-title">
          <span class="material-symbols-outlined">menu_book</span>
          正文和剧情
        </div>
      </div>

      <div ref="logScrollEl" class="play-log-content">
        <pre class="whitespace-pre-wrap">{{ streamContent }}<span v-if="isStreaming" class="animate-pulse">_</span></pre>
        <div ref="logTailEl"></div>
      </div>
    </section>

      <div class="play-input">
        <input
          ref="inputEl"
          v-model="userInput"
        class="play-input-field"
        placeholder="输入指令…（例如：生成 / 搜索 /home 或 /send 你好）"
        @focus="focusText"
        @keydown.enter.exact.prevent="send"
      />
      <button class="play-send" :disabled="!userInput.trim()" @click="send">
        <span class="material-symbols-outlined">send</span>
        <span>发送</span>
      </button>
      </div>
    </div>

    <!-- 右侧抽屉：页面导航，跟随正文区域滚动（非 sticky） -->
    <aside class="play-rightdock" :class="{ open: rightDockOpen }" @click.stop>
      <div class="rightdock-head">页面导航</div>
      <div class="rightdock-items">
        <button v-for="item in navItems" :key="item.label" class="rightdock-btn" @click="runNav(item.path)">
          <span class="material-symbols-outlined">{{ item.icon }}</span>
          <span class="chip-label">{{ item.label }}</span>
        </button>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { requestStreaming } from '../utils';
import { historyOverlayOpen, playPanelsMini, playPanelsOpen, shopOverlayOpen } from '../shared/uiState';
import { playAppearance } from '../shared/playAppearance';

const streamContent = ref('');
const isStreaming = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const userInput = ref('');
const logScrollEl = ref<HTMLDivElement | null>(null);
const logTailEl = ref<HTMLDivElement | null>(null);
const isDark = ref(false);
const rightDockOpen = ref(false);

const router = useRouter();

const navItems = [
  { label: '首页', path: '/home', icon: 'home' },
  { label: '发现', path: '/discover', icon: 'explore' },
  { label: '服务', path: '/service', icon: 'room_service' },
];

const panelsActive = computed(() => playPanelsOpen.value || playPanelsMini.value);

const logCardStyle = computed(() => {
  const a = playAppearance.value;
  const tint = a?.logTint || 'rgba(0, 0, 0, 0.55)';
  const strength = typeof a?.logTintStrength === 'number' ? a.logTintStrength : 0.6;

  let bgImage = 'none';
  if (a?.logBgSource === 'placeholder') bgImage = 'var(--image-placeholder)';
  if (a?.logBgSource === 'url' && a?.logBgUrl) bgImage = `url("${a.logBgUrl}")`;

  return {
    // Background image is applied on the card itself; overlay is handled by ::before/::after.
    '--play-log-bg-image': bgImage,
    '--play-log-tint': tint,
    '--play-log-tint-alpha': String(strength),
  } as any;
});

function togglePanels() {
  if (playPanelsOpen.value || playPanelsMini.value) {
    playPanelsOpen.value = false;
    playPanelsMini.value = false;
    return;
  }
  playPanelsMini.value = false;
  playPanelsOpen.value = true;
}

function toggleMarket() {
  shopOverlayOpen.value = !shopOverlayOpen.value;
}

function toggleHistory() {
  historyOverlayOpen.value = !historyOverlayOpen.value;
}

function toggleTheme() {
  isDark.value = !isDark.value;
  window.dispatchEvent(
    new CustomEvent('theme-change', {
      detail: { isDark: isDark.value },
    }),
  );
  try {
    localStorage.setItem('app-theme', isDark.value ? 'dark' : 'light');
  } catch {
    // ignore
  }
}

function scrollToBottom() {
  const el = logTailEl.value || logScrollEl.value;
  if (!el) return;
  try {
    el.scrollIntoView({ block: 'end', behavior: 'smooth' });
  } catch {
    // ignore
  }
}

function scrollToTop() {
  const el = logScrollEl.value;
  if (!el) return;
  try {
    el.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    el.scrollTop = 0;
  }
}

watch(
  () => streamContent.value,
  () => {
    nextTick(() => scrollToBottom());
  },
);

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
  appendLogBlock(`> ${raw}`);

  if (shouldEnableStreaming(raw)) {
    requestStreaming('play');
  }

  const cmd = raw.startsWith('/') ? `${raw} | /trigger await=true` : `/send ${raw} | /trigger await=true`;
  const ok = tryTriggerSlash(cmd);
  if (!ok) appendLogBlock('[提示] 未检测到 triggerSlash：已记录到日志（降级模式）');

  nextTick(() => inputEl.value?.focus());
}

function runNav(path: string) {
  // 导航时收起 /play 浮层，避免切页残留遮挡
  playPanelsOpen.value = false;
  playPanelsMini.value = false;
  shopOverlayOpen.value = false;
  historyOverlayOpen.value = false;
  try {
    router.push(path);
  } catch (err) {
    console.error('[Play] navigate failed:', err);
  }
}

function focusText() {
  // Keep focus available when user taps background
}

function extractContent(raw: string, role?: string) {
  const contentMatch = raw.match(/<content>([\s\S]*?)<\/content>/i);
  if (contentMatch?.[1]) return contentMatch[1].trim();
  const hasUpdateTags = /<updatevariable>|<json_patch>|<update>|<initvar>/i.test(raw);
  if (hasUpdateTags) return '';
  if (role === 'assistant') return raw.trim();
  return '';
}

function appendLogBlock(text: string) {
  if (!text) return;
  const prefix = streamContent.value ? '\n\n' : '';
  streamContent.value += `${prefix}${text}`;
}

function initFromChat() {
  try {
    if (typeof (window as any).getChatMessages !== 'function') return false;
    const all = (window as any).getChatMessages('0-{{lastMessageId}}') || [];
    const last = all.slice(-18);
    const text = last
      .map((m: any) => {
        const role = m?.role || 'unknown';
        const msg = String(m?.message ?? '').trim();
        if (!msg) return '';
        return extractContent(msg, role);
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
  // 进入 Play 时默认不打开快捷面板
  playPanelsOpen.value = false;
  playPanelsMini.value = false;

  try {
    const savedTheme = localStorage.getItem('app-theme');
    isDark.value = savedTheme === 'dark';
  } catch {
    isDark.value = false;
  }

  const ok = initFromChat();
  if (!ok) {
    streamContent.value = 'System initialized.\n（未检测到聊天接口，已进入降级模式）';
  }

  try {
    const canListen =
      typeof (window as any).eventOn === 'function' && typeof (window as any).tavern_events !== 'undefined';
    if (canListen) {
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
            const body = String(msg.message ?? '').trim();
            const content = extractContent(body, role);
            if (!content) return;
            appendLogBlock(content);
          } finally {
            isStreaming.value = false;
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
  --tone-900: rgba(9, 16, 29, 0.9);
  --tone-800: rgba(18, 28, 44, 0.75);
  --tone-700: rgba(30, 41, 59, 0.6);
  --tone-600: rgba(71, 85, 105, 0.4);
  --accent: rgba(251, 146, 60, 0.8);
  --accent-soft: rgba(251, 191, 36, 0.25);
  --edge: rgba(226, 232, 240, 0.25);
  --text-main: #fff7ed;
  --text-dim: #fed7aa;
  width: 100%;
  aspect-ratio: 4 / 7;
  font-family: 'MiSans', 'HarmonyOS Sans SC', 'Source Han Sans SC', 'PingFang SC', sans-serif;
  background:
    radial-gradient(120% 120% at 12% 0%, rgba(251, 146, 60, 0.18), transparent 45%),
    radial-gradient(120% 120% at 88% 0%, rgba(244, 63, 94, 0.12), transparent 55%),
    linear-gradient(150deg, rgba(58, 35, 24, 0.88), rgba(28, 18, 16, 0.92));
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 20px;
  box-shadow: 0 18px 46px rgba(24, 12, 8, 0.55), inset 0 1px 0 rgba(255, 237, 213, 0.1);
  backdrop-filter: blur(18px);
  padding: 14px;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
  position: relative;
}

.play-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: 20px;
  background: linear-gradient(140deg, rgba(251, 191, 36, 0.4), rgba(253, 230, 138, 0.08), rgba(244, 63, 94, 0.2));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.play-shell::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255, 237, 213, 0.1), transparent 40%);
  pointer-events: none;
}

.play-side {
  grid-column: 1 / 2;
  grid-row: 1 / 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 18px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  background:
    radial-gradient(120% 120% at 30% 0%, rgba(251, 146, 60, 0.18), transparent 55%),
    linear-gradient(160deg, rgba(58, 35, 24, 0.78), rgba(28, 18, 16, 0.9));
  box-shadow: 0 18px 44px rgba(24, 12, 8, 0.55);
  backdrop-filter: blur(16px);
}

.side-btn {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  background: rgba(0, 0, 0, 0.18);
  color: rgba(255, 237, 213, 0.92);
  display: grid;
  place-items: center;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.side-btn.active {
  border-color: rgba(251, 146, 60, 0.62);
  background: rgba(251, 146, 60, 0.16);
  box-shadow: 0 14px 30px rgba(251, 146, 60, 0.16);
}

.side-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(251, 146, 60, 0.45);
}

.side-spacer {
  flex: 1;
  width: 100%;
}

.play-main {
  grid-column: 2 / 3;
  grid-row: 1 / 4;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
  min-width: 0;
}

.play-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 18px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  background:
    radial-gradient(120% 120% at 0% 0%, rgba(251, 146, 60, 0.16), transparent 55%),
    linear-gradient(150deg, rgba(58, 35, 24, 0.9), rgba(28, 18, 16, 0.94));
  box-shadow: 0 16px 36px rgba(24, 12, 8, 0.5), inset 0 1px 0 rgba(255, 237, 213, 0.12);
  backdrop-filter: blur(18px);
}

.topbar-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  color: rgba(255, 237, 213, 0.92);
}

.topbar-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid rgba(251, 191, 36, 0.2);
  background: rgba(24, 12, 8, 0.18);
  color: rgba(255, 237, 213, 0.92);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.topbar-toggle:hover {
  border-color: rgba(251, 146, 60, 0.45);
  background: rgba(251, 146, 60, 0.12);
}

.chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}

.play-log-card {
  border-radius: 18px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  background:
    radial-gradient(120% 120% at 20% 0%, rgba(251, 146, 60, 0.14), transparent 45%),
    linear-gradient(160deg, rgba(44, 26, 20, 0.75), rgba(62, 34, 22, 0.55));
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.play-log-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: var(--play-log-bg-image, none);
  background-size: cover;
  background-position: center;
  opacity: 0.75;
  filter: blur(2px);
  transform: scale(1.05);
  pointer-events: none;
}

.play-log-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--play-log-tint, rgba(0, 0, 0, 0.55));
  opacity: var(--play-log-tint-alpha, 0.6);
  pointer-events: none;
}

.play-log-head {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.play-log-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  position: relative;
  z-index: 1;
}

.play-log-content {
  padding: 12px;
  font-size: 16px;
  line-height: 1.85;
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.55);
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  position: relative;
  z-index: 1;
}

.play-rightdock {
  grid-column: 3 / 4;
  grid-row: 1 / 4;
  width: 0;
  overflow: hidden;
  transition: width 0.2s ease, opacity 0.2s ease;
  opacity: 0;
  padding: 0;
}

.play-rightdock.open {
  width: 140px;
  opacity: 1;
  padding: 8px 6px;
}

.play-rightdock {
  border-radius: 18px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  background:
    radial-gradient(120% 120% at 70% 0%, rgba(251, 146, 60, 0.18), transparent 55%),
    linear-gradient(160deg, rgba(58, 35, 24, 0.8), rgba(28, 18, 16, 0.92));
  box-shadow: 0 18px 44px rgba(24, 12, 8, 0.55);
  backdrop-filter: blur(16px);
}

.rightdock-head {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 237, 213, 0.85);
  padding: 8px 8px 4px;
}

.rightdock-items {
  display: grid;
  gap: 8px;
  padding: 4px 6px 8px;
}

.rightdock-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid rgba(251, 191, 36, 0.2);
  background: rgba(24, 12, 8, 0.18);
  color: rgba(255, 237, 213, 0.92);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.rightdock-btn:hover {
  border-color: rgba(251, 146, 60, 0.45);
  background: rgba(251, 146, 60, 0.12);
}

.play-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.play-input-field {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(251, 191, 36, 0.25);
  background: linear-gradient(140deg, rgba(44, 26, 20, 0.8), rgba(62, 34, 22, 0.72));
  padding: 12px 14px;
  color: var(--text-main);
  font-size: 13px;
  outline: none;
}

.play-input-field:focus {
  border-color: rgba(251, 146, 60, 0.6);
  box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.25);
}

.play-send {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 14px;
  padding: 12px 16px;
  border: 1px solid rgba(251, 146, 60, 0.45);
  background: linear-gradient(135deg, rgba(251, 146, 60, 0.95), rgba(244, 63, 94, 0.85));
  color: #fff7ed;
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
  box-shadow: 0 12px 24px rgba(251, 146, 60, 0.35);
}

@media (max-width: 768px) {
  .play-shell {
    border-radius: 12px;
    grid-template-columns: 54px minmax(0, 1fr) auto;
  }
  .chip-label {
    display: none;
  }
  .play-input {
    grid-template-columns: 1fr;
  }
  .play-send {
    justify-content: center;
  }
  .play-rightdock.open {
    width: 110px;
  }
}
</style>
