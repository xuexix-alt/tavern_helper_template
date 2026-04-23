<template>
  <section class="sidebar-card">
    <div class="sidebar-tools">
      <div class="source-field">
        <span>变量来源</span>
        <small class="source-caption">{{ sourceLabel }}</small>
      </div>
      <div v-if="isDuringExtraAnalysis" class="analysis-flag">解析中</div>
    </div>

    <div class="page-tabs" role="tablist" aria-label="侧栏主分类">
      <button type="button" class="page-tab" :class="{ active: pageTab === 'agents' }" @click="setPageTab('agents')">
        AGENTS
      </button>
      <button type="button" class="page-tab" :class="{ active: pageTab === 'system' }" @click="setPageTab('system')">
        SYSTEM
      </button>
    </div>

    <button type="button" class="collapse-btn clip-corner-sm" @click="emit('collapse')">关闭</button>

    <template v-if="pageTab === 'agents'">
      <div class="tab-row" role="tablist" aria-label="角色分类">
        <button
          v-for="tab in agentTabs"
          :key="tab.id"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="switchTopTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="!ready && !hasAnyRole" class="sidebar-empty">
        当前目标楼层还没有可展示的 `stat_data`，已自动尝试回退到最新楼层。
      </div>
      <div v-else-if="activeEntries.length === 0" class="sidebar-empty">当前分类下暂无可展示角色。</div>

      <div v-else class="accordion-list">
        <article
          v-for="entry in activeEntries"
          :key="entry.key"
          class="accordion-item"
          :class="{ active: selectedCharacterKey === entry.key }"
        >
          <button type="button" class="accordion-head" @click="setActiveCharacter(entry.key)">
            <div class="accordion-title-group">
              <div class="status-led" :class="statusClass(entry)"></div>
              <span class="accordion-title">{{ roleName(entry) }}</span>
            </div>
            <span class="accordion-arrow" :class="{ open: selectedCharacterKey === entry.key }">›</span>
          </button>

          <div v-if="selectedCharacterKey === entry.key" class="accordion-body">
            <div class="source-nav clip-corner-sm">
              <button
                type="button"
                class="source-nav-btn"
                :disabled="!canPrevSource"
                @click.stop="selectSourceByOffset(-1)"
              >
                ‹
              </button>
              <div class="source-nav-main">
                <strong>{{ currentSourcePill }}</strong>
                <span>{{ currentSourcePosition }}</span>
                <span class="source-status">{{ statusText(entry) }}</span>
              </div>
              <button
                type="button"
                class="source-nav-btn"
                :disabled="!canNextSource"
                @click.stop="selectSourceByOffset(1)"
              >
                ›
              </button>
            </div>

            <div class="metric-grid">
              <section class="metric-card clip-corner-sm">
                <div class="metric-head">
                  <span class="metric-title">健康</span>
                  <strong class="metric-value">{{ safeNumber(entry.role.健康) }}</strong>
                </div>
                <div class="stat-track"><i :style="statWidth(entry.role.健康)" /></div>
                <p
                  class="metric-caption inline-summary"
                  :title="
                    buildMetricSummary(entry.role.健康状况, '健康', entry.role.健康更新原因, '暂无健康值变动原因')
                  "
                >
                  {{ buildMetricSummary(entry.role.健康状况, '健康', entry.role.健康更新原因, '暂无健康值变动原因') }}
                </p>
              </section>

              <section class="metric-card clip-corner-sm">
                <div class="metric-meta-inline">
                  <span class="metric-meta-chip">关系 {{ displayText(entry.role.关系, '无') }}</span>
                  <span class="metric-meta-chip">倾向 {{ displayText(entry.role.关系倾向, '中立') }}</span>
                </div>
                <div class="metric-head">
                  <span class="metric-title">秩序刻印</span>
                  <strong class="metric-value">{{ safeNumber(entry.role.秩序刻印) }}</strong>
                </div>
                <div class="stat-track"><i :style="statWidth(entry.role.秩序刻印)" /></div>
                <p
                  class="metric-caption inline-summary"
                  :title="
                    buildMetricSummary(entry.role.关系, '无', entry.role.秩序刻印更新原因, '暂无秩序刻印变动原因')
                  "
                >
                  {{ buildMetricSummary(entry.role.关系, '无', entry.role.秩序刻印更新原因, '暂无秩序刻印变动原因') }}
                </p>
              </section>
            </div>

            <div class="bio-box thought-box">
              <div class="bio-stripe"></div>
              <p>{{ displayLongText(entry.role.内心想法, entry.role.神态样貌, entry.role.动作姿势) }}</p>
            </div>
            <div class="detail-grid">
              <div class="detail-card clip-corner-sm">
                <span class="detail-label">衣着</span>
                <strong class="detail-value">{{ displayText(entry.role.衣着) }}</strong>
              </div>
              <div class="detail-card clip-corner-sm">
                <span class="detail-label">神态样貌</span>
                <strong class="detail-value">{{ displayText(entry.role.神态样貌) }}</strong>
              </div>
            </div>

            <button type="button" class="action-btn clip-corner-sm" @click="emit('collapse')">关闭</button>
          </div>
        </article>
      </div>
    </template>

    <template v-else>
      <section class="system-panel">
        <div class="system-card level-card clip-corner-sm">
          <div class="system-line"></div>
          <div class="system-title">庇护所等级</div>
          <div class="system-value">
            <strong>{{ shelterLevel }}</strong
            ><span>级</span>
          </div>
        </div>

        <div class="system-card clip-corner-sm">
          <div class="system-line"></div>
          <div class="system-head-row">
            <div class="system-title">今日投掷点数</div>
            <button
              type="button"
              class="mini-pill"
              :disabled="calibratingDailyRoll"
              @click="$emit('calibrate-daily-roll')"
            >
              校准
            </button>
          </div>
          <div class="system-copy">{{ dailyRollText }}</div>
        </div>

        <div class="system-card clip-corner-sm">
          <div class="system-line"></div>
          <div class="system-title">伊甸一次性指令</div>
          <div v-if="edenCommandStatEntries.length === 0" class="system-copy system-copy-muted">暂无</div>
          <div v-else class="system-stat-list">
            <article
              v-for="entry in edenCommandStatEntries"
              :key="entry.key"
              class="system-command-card clip-corner-sm"
              :class="systemCommandCardClass(entry)"
            >
              <div class="system-command-topline">
                <div class="system-command-tags">
                  <span class="system-command-category-badge">{{ commandCategoryLabel(entry.category) }}</span>
                  <span class="system-command-id">{{ entry.key }}</span>
                </div>
                <div class="system-command-quantity" aria-label="数量">×{{ entry.quantity }}</div>
              </div>
              <div class="system-command-titleline">
                <strong>{{ entry.name }}</strong>
                <span class="system-command-description">{{ entry.description || '暂无说明' }}</span>
              </div>
              <div class="system-command-meta">
                <span class="system-command-meta-chip">
                  <b>范围</b>
                  <span>{{ entry.scope || '--' }}</span>
                </span>
                <span class="system-command-meta-chip">
                  <b>时效</b>
                  <span>{{ entry.duration || '--' }}</span>
                </span>
              </div>
            </article>
          </div>
        </div>

        <section class="system-block">
          <div class="system-block-title">可扩展区域状态</div>
          <div class="expand-grid">
            <article class="expand-card clip-corner-sm" :class="{ unlocked: expansionState.medical !== '未解锁' }">
              <strong>医疗翼</strong><span>{{ expansionState.medical }}</span>
            </article>
            <article class="expand-card clip-corner-sm" :class="{ unlocked: expansionState.workshop !== '未解锁' }">
              <strong>制造工坊</strong><span>{{ expansionState.workshop }}</span>
            </article>
            <article class="expand-card clip-corner-sm" :class="{ unlocked: expansionState.hangar !== '未解锁' }">
              <strong>载具格纳库</strong><span>{{ expansionState.hangar }}</span>
            </article>
          </div>
        </section>
      </section>
    </template>

    <footer class="sidebar-footer">
      <div class="page-tabs page-tabs-bottom" role="tablist" aria-label="侧栏主分类（底部）">
        <button type="button" class="page-tab" :class="{ active: pageTab === 'agents' }" @click="setPageTab('agents')">
          AGENTS
        </button>
        <button type="button" class="page-tab" :class="{ active: pageTab === 'system' }" @click="setPageTab('system')">
          SYSTEM
        </button>
      </div>
      <button type="button" class="collapse-btn collapse-btn-footer clip-corner-sm" @click="emit('collapse')">
        关闭
      </button>
      <div class="sidebar-footer-meta">
        <span>DB_SYNC: OK</span>
        <span>ENTITIES: {{ activeEntries.length }}</span>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { TranscriptItem } from '../types';
import { buildEdenCommandDisplayEntries, type EdenOneShotCommandDisplayEntry } from '../edenOneShotCommands';
import { buildMvuSourceOptions } from '../mvuSourceOptions';
import { readMvuStatData, useMvuRoleStore, useMvuSystemStore } from '../mvuRoleStore';

const props = defineProps<{
  targetMessageId?: number | null;
  transcriptItems?: TranscriptItem[];
  activeCharacterKey?: string | null;
  refreshRevision?: number;
  calibratingDailyRoll?: boolean;
}>();

const emit = defineEmits<{
  (event: 'select-character', key: string): void;
  (event: 'roster-change', roles: Array<{ key: string; label: string; statusClass: string; statusText: string }>): void;
  (event: 'collapse'): void;
  (event: 'calibrate-daily-roll'): void;
}>();

type RoleTab = 'main' | 'temp';
type PageTab = 'agents' | 'system';
const pageTab = ref<PageTab>('agents');
const activeTab = ref<RoleTab>('main');
const mvuReady = ref(false);
const sourceRevision = ref(0);

function setPageTab(nextTab: PageTab) {
  pageTab.value = nextTab;
}

const normalizedTargetMessageId = computed(() => {
  const numeric = Number(props.targetMessageId);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
});
const selectedSourceKey = ref('');
const sourceOptions = computed(() => {
  const refreshRevision = sourceRevision.value;
  if (!mvuReady.value) return [];
  return buildMvuSourceOptions({
    transcriptItems: Array.isArray(props.transcriptItems) ? props.transcriptItems : [],
    targetMessageId: normalizedTargetMessageId.value,
    refreshRevision,
    hasStatData(messageId) {
      return readMvuStatData(messageId).ok;
    },
  });
});
const selectedSourceOption = computed(
  () => sourceOptions.value.find(option => option.key === selectedSourceKey.value) ?? sourceOptions.value[0] ?? null,
);
const selectedTargetMessageId = computed(() => selectedSourceOption.value?.targetMessageId ?? null);
const {
  data: mvuData,
  ready,
  source,
  isDuringExtraAnalysis,
  isRetrying,
  hasAnyRole,
  mainRoleEntries,
  tempNpcEntries,
} = useMvuRoleStore(selectedTargetMessageId);
const { data: systemMvuData, ready: systemReady, isRetrying: isSystemRetrying } = useMvuSystemStore();
const agentTabs = computed(() => [
  { id: 'main' as const, label: `主要角色 ${mainRoleEntries.value.length}` },
  { id: 'temp' as const, label: `临时NPC ${tempNpcEntries.value.length}` },
]);
const activeEntries = computed(() => (activeTab.value === 'main' ? mainRoleEntries.value : tempNpcEntries.value));
const internalSelectedKey = ref<string | null>(null);
const preferredRoleName = ref('');
const selectedCharacterKey = computed(() => props.activeCharacterKey ?? internalSelectedKey.value);
const currentSourceIndex = computed(() => {
  const index = sourceOptions.value.findIndex(option => option.key === selectedSourceKey.value);
  return index;
});
const canPrevSource = computed(() => currentSourceIndex.value > 0);
const canNextSource = computed(
  () => currentSourceIndex.value >= 0 && currentSourceIndex.value < sourceOptions.value.length - 1,
);
const currentSourcePill = computed(() => {
  return selectedSourceOption.value?.pillLabel ?? '--';
});
const currentSourcePosition = computed(() => {
  if (sourceOptions.value.length === 0 || currentSourceIndex.value < 0) return '0/0';
  return `${currentSourceIndex.value + 1}/${sourceOptions.value.length}`;
});
const sourceLabel = computed(() => {
  if (pageTab.value === 'system') {
    if (isSystemRetrying.value) return '系统面板等待最新楼层变量稳定';
    if (!systemReady.value) return '最新楼层暂无可用系统变量';
    return '系统面板当前数据来自最新变量楼层';
  }
  const selected = selectedSourceOption.value;
  if (!selected) return '当前暂无可用变量楼层';
  if (isRetrying.value) return `目标楼层 ${selected.pillLabel} 等待变量稳定`;
  if (source.value === 'default') return `目标楼层 ${selected.pillLabel} 暂无 stat_data`;
  return selected.isLatest
    ? `当前数据来自最新变量楼层 ${selected.pillLabel}`
    : `当前数据来自变量楼层 ${selected.pillLabel}`;
});
const shelterLevel = computed(() => `${String(_.get(systemMvuData.value, '庇护所.庇护所等级', '--'))}`);
const dailyRollText = computed(() => String(_.get(systemMvuData.value, '庇护所.今日投掷点数', '--')) || '--');
const edenCommandStatEntries = computed(() =>
  buildEdenCommandDisplayEntries(_.get(systemMvuData.value, '伊甸一次性指令', {})),
);
const expansionState = computed(() => ({
  medical: String(_.get(systemMvuData.value, '庇护所.可扩展区域.医疗翼', '未解锁')),
  workshop: String(_.get(systemMvuData.value, '庇护所.可扩展区域.制造工坊', '未解锁')),
  hangar: String(_.get(systemMvuData.value, '庇护所.可扩展区域.载具格纳库', '未解锁')),
}));

function systemCommandCategoryClass(category: string): string {
  switch (String(category ?? '').trim()) {
    case '认知修改类':
      return 'category-cognition';
    case '时空修改类':
      return 'category-spacetime';
    case '战斗修改类':
      return 'category-combat';
    case '属性修改类':
      return 'category-attribute';
    default:
      return 'category-unknown';
  }
}

function commandCategoryLabel(category: string): string {
  return String(category ?? '').replace(/修改类$/, '') || '未分类';
}

function systemCommandCardClass(entry: EdenOneShotCommandDisplayEntry) {
  return [systemCommandCategoryClass(entry.category), { 'is-zero': entry.quantity <= 0 }];
}

// 当变量更新时（sourceOptions变化），自动切换到最新楼层
watch(
  sourceOptions,
  options => {
    if (options.length > 0) {
      const latestOption = options[0]; // 第一个选项是最新的
      if (selectedSourceKey.value !== latestOption?.key) {
        selectedSourceKey.value = latestOption?.key ?? '';
      }
    }
  },
  { immediate: true },
);
watch(
  activeEntries,
  entries => {
    const keys = entries.map(entry => entry.key);
    if (keys.length === 0) {
      internalSelectedKey.value = null;
      emit('roster-change', []);
      return;
    }
    if (!selectedCharacterKey.value || !keys.includes(selectedCharacterKey.value)) {
      const matchedByName = preferredRoleName.value
        ? (entries.find(entry => roleName(entry) === preferredRoleName.value)?.key ?? null)
        : null;
      internalSelectedKey.value = matchedByName ?? keys[0];
    }
    emit(
      'roster-change',
      entries.map(entry => ({
        key: entry.key,
        label: roleName(entry),
        statusClass: statusClass(entry),
        statusText: statusText(entry),
      })),
    );
  },
  { immediate: true, deep: true },
);
watch(
  () => props.activeCharacterKey,
  key => {
    if (key && activeEntries.value.some(entry => entry.key === key)) internalSelectedKey.value = key;
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    await waitGlobalInitialized('Mvu');
    mvuReady.value = true;
  } catch {
    mvuReady.value = false;
  }
});

watch(
  () => props.refreshRevision ?? 0,
  value => {
    sourceRevision.value = Number(value) || 0;
  },
  { immediate: true },
);

function roleName(entry: { key: string; role: Record<string, any> }) {
  return String(entry.role.姓名 ?? entry.key ?? '').trim() || entry.key;
}
function statusText(entry: { role: Record<string, any> }) {
  return String(entry.role.登场状态 ?? '未知');
}
function statusClass(entry: { role: Record<string, any> }) {
  return String(entry.role.登场状态 ?? '').trim() === '登场' ? 'status-active' : 'status-idle';
}
function switchTopTab(tab: RoleTab) {
  activeTab.value = tab;
}
function setActiveCharacter(key: string) {
  internalSelectedKey.value = key;
  preferredRoleName.value = roleName(activeEntries.value.find(entry => entry.key === key) ?? { key, role: {} });
  emit('select-character', key);
}

function selectSourceByOffset(offset: -1 | 1) {
  const baseIndex = currentSourceIndex.value >= 0 ? currentSourceIndex.value : 0;
  const nextIndex = baseIndex + offset;
  const nextOption = sourceOptions.value[nextIndex];
  if (!nextOption) return;
  const currentEntry = activeEntries.value.find(entry => entry.key === selectedCharacterKey.value);
  preferredRoleName.value = currentEntry ? roleName(currentEntry) : preferredRoleName.value;
  selectedSourceKey.value = nextOption.key;
}

function displayText(input: unknown, fallback = '--') {
  const text = String(input ?? '').trim();
  return text || fallback;
}

function displayLongText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '暂无详细描述';
}

function hasMeaningfulText(input: unknown) {
  return String(input ?? '').trim() !== '';
}

function safeNumber(input: unknown) {
  const n = Number(input);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.trunc(n))) : '--';
}
function statWidth(input: unknown) {
  const n = Number(input);
  return { width: `${Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0}%` };
}

function buildMetricSummary(primary: unknown, primaryFallback = '--', reason: unknown, reasonFallback = '--') {
  const head = displayText(primary, primaryFallback);
  const tail = displayText(reason, reasonFallback);
  return `${head} ${tail}`.trim();
}
</script>

<style scoped>
.sidebar-card,
.sidebar-tools,
.page-tabs,
.tab-row,
.accordion-head,
.accordion-title-group,
.meta-row,
.stat-row,
.system-head-row,
.system-command-topline,
.system-command-tags,
.system-command-titleline,
.system-command-meta,
.system-command-meta-chip,
.sidebar-footer {
  display: flex;
}
.sidebar-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}
.sidebar-tools {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.source-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
}
.source-field span,
.source-caption,
.section-kicker,
.system-block-title,
.sidebar-footer {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
}
.source-caption {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: none;
}
.source-select {
  min-height: 40px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  color: var(--demo-text-primary);
  padding: 0 12px;
}
.analysis-flag {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  color: var(--demo-text-warning);
}
.source-nav,
.source-nav-main {
  display: flex;
  align-items: center;
}
.source-nav {
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--primary) 12%, transparent);
  background: color-mix(in srgb, var(--surface) 16%, transparent);
}
.source-nav-main {
  flex: 1 1 auto;
  min-width: 0;
  justify-content: center;
  gap: 8px;
  font-family: var(--demo-font-mono);
  color: var(--demo-text-secondary);
}
.source-nav-main strong {
  font-size: 12px;
  color: var(--demo-text-accent);
  letter-spacing: 0.1em;
}
.source-nav-main span {
  font-size: 10px;
  letter-spacing: 0.08em;
}
.source-status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  color: var(--demo-text-secondary);
}
.source-nav-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
  font-size: 16px;
  line-height: 1;
}
.source-nav-btn:disabled {
  opacity: 0.35;
}
.page-tabs,
.tab-row {
  gap: 8px;
}
.page-tab,
.tab-btn,
.collapse-btn,
.mini-pill,
.action-btn,
.meta-box {
  font-family: var(--demo-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.page-tab,
.tab-btn {
  min-height: 44px;
  flex: 1 1 0;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  color: var(--demo-text-secondary);
}
.page-tab.active,
.tab-btn.active {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}
.collapse-btn {
  min-height: 40px;
  width: 100%;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 14%, transparent);
  color: var(--demo-text-secondary);
}

.collapse-btn-inline {
  margin-top: 2px;
}

.collapse-btn-footer {
  margin-top: 2px;
}
.sidebar-empty {
  font-size: 13px;
  line-height: 1.7;
  color: var(--demo-text-secondary);
  padding: 14px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 18%, transparent);
}
.accordion-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.accordion-item {
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
}
.accordion-item.active {
  border-color: var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}
.accordion-head {
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: transparent;
  color: var(--demo-text-primary);
  text-align: left;
}
.accordion-title-group {
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.accordion-title {
  font-family: var(--demo-font-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
  color: inherit;
}
.accordion-arrow {
  font-family: var(--demo-font-mono);
  font-size: 18px;
  color: var(--demo-text-secondary);
  transition: transform 0.18s ease;
}
.accordion-arrow.open {
  transform: rotate(90deg);
  color: var(--demo-text-accent);
}
.accordion-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-top: 1px solid color-mix(in srgb, var(--primary) 12%, transparent);
}
.status-led {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground) 22%, transparent);
  flex: 0 0 8px;
}
.status-led.status-active {
  background: var(--demo-color-neon);
  box-shadow: 0 0 10px color-mix(in srgb, var(--demo-color-neon) 45%, transparent);
}
.status-led.status-idle {
  background: var(--demo-color-idle);
}
.meta-row {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.meta-row-top {
  align-items: flex-start;
}
.meta-box {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  color: var(--demo-text-secondary);
}
.meta-code {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  color: var(--demo-text-secondary);
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.metric-card,
.detail-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 20%, transparent);
}
.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.metric-meta-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: -2px;
}
.metric-meta-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  color: var(--demo-text-secondary);
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.metric-title,
.detail-label {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
}
.metric-value,
.detail-value {
  color: var(--demo-text-primary);
}
.metric-value {
  font-size: 18px;
  line-height: 1;
  color: var(--demo-text-accent);
}
.metric-caption {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--demo-text-secondary);
}
.metric-caption.inline-summary {
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.metric-caption.muted {
  color: color-mix(in srgb, var(--demo-text-secondary) 72%, transparent);
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.detail-value {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.stat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stat-row {
  align-items: center;
  gap: 10px;
}
.stat-row span,
.stat-row strong {
  font-size: 14px;
}
.stat-row span {
  width: 42px;
  color: var(--demo-text-primary);
}
.stat-row strong {
  width: 32px;
  text-align: right;
  color: var(--demo-text-accent);
}
.stat-track {
  width: 100%;
  min-width: 0;
  flex: 0 0 auto;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  overflow: hidden;
}
.stat-track i {
  display: block;
  width: 0;
  min-width: 0;
  height: 100%;
  background: linear-gradient(90deg, var(--demo-color-neon), color-mix(in srgb, var(--primary) 72%, white 8%));
  border-radius: 999px;
}
.bio-box {
  position: relative;
  padding: 12px 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 14%, transparent);
}
.thought-box {
  margin-top: -2px;
}
.bio-stripe {
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: color-mix(in srgb, var(--demo-color-neon) 40%, transparent);
}
.bio-box p {
  margin: 0 0 0 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--demo-text-primary);
}
.action-btn {
  min-height: 44px;
  border: 1px solid var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--demo-text-accent);
}
.system-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.system-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px 16px 18px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
}
.system-line {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: color-mix(in srgb, var(--demo-color-neon) 50%, transparent);
}
.system-title,
.system-copy,
.expand-card strong,
.expand-card span {
  font-family: var(--demo-font-mono);
}
.system-title {
  font-size: 13px;
  color: var(--demo-text-primary);
  font-weight: 700;
}
.system-value {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.system-value strong {
  font-size: 42px;
  line-height: 1;
  color: var(--demo-text-accent);
}
.system-value span {
  font-size: 18px;
  color: var(--demo-text-secondary);
}
.system-head-row {
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mini-pill {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--demo-border-accent-active);
  border-radius: 999px;
  background: transparent;
  color: var(--demo-text-accent);
}
.system-copy {
  font-size: 18px;
  color: var(--demo-text-accent);
}
.system-copy-muted {
  color: var(--demo-text-secondary);
}
.system-stat-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.system-command-card {
  --system-command-color: var(--primary);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 8px 12px;
  border: 1px solid color-mix(in srgb, var(--system-command-color) 34%, var(--border) 66%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--system-command-color) 11%, transparent), transparent 62%),
    color-mix(in srgb, var(--surface) 44%, transparent);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    opacity 180ms ease;
}
.system-command-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--system-command-color) 92%, white 8%),
    color-mix(in srgb, var(--system-command-color) 34%, transparent)
  );
  opacity: 0.88;
}
.system-command-card.category-cognition {
  --system-command-color: #8b5cf6;
}
.system-command-card.category-spacetime {
  --system-command-color: #38bdf8;
}
.system-command-card.category-combat {
  --system-command-color: #fb7185;
}
.system-command-card.category-attribute {
  --system-command-color: #34d399;
}
.system-command-card.category-unknown {
  --system-command-color: var(--primary);
}
.system-command-card.is-zero {
  --system-command-color: color-mix(in srgb, var(--foreground) 34%, var(--surface) 66%);
  border-color: color-mix(in srgb, var(--foreground) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 52%, var(--foreground) 4%);
}
.system-command-topline {
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.system-command-tags {
  min-width: 0;
  align-items: center;
  gap: 6px;
}
.system-command-titleline {
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}
.system-command-category-badge,
.system-command-quantity,
.system-command-meta-chip,
.system-command-meta-chip b,
.system-command-id,
.system-command-titleline strong {
  font-family: var(--demo-font-mono);
}
.system-command-category-badge,
.system-command-quantity {
  width: fit-content;
  border: 1px solid color-mix(in srgb, var(--system-command-color) 36%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--system-command-color) 12%, var(--surface) 88%);
  color: color-mix(in srgb, var(--system-command-color) 76%, var(--foreground) 24%);
}
.system-command-category-badge {
  flex: 0 0 auto;
  padding: 2px 7px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.system-command-id {
  flex: 0 1 auto;
  max-width: 78px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
}
.system-command-quantity {
  flex: 0 0 auto;
  min-width: 36px;
  padding: 4px 9px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--demo-text-primary);
}
.system-command-titleline strong {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  letter-spacing: 0.02em;
  color: var(--demo-text-primary);
}
.system-command-description {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.35;
  color: var(--demo-text-secondary);
}
.system-command-description::before {
  content: '—';
  margin-right: 7px;
  color: color-mix(in srgb, var(--system-command-color) 58%, var(--demo-text-subtle));
}
.system-command-meta {
  min-width: 0;
  flex-wrap: nowrap;
  gap: 6px;
}
.system-command-meta-chip {
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--system-command-color) 18%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 58%, var(--system-command-color) 5%);
  font-size: 10px;
  line-height: 1.2;
  letter-spacing: 0.04em;
  color: var(--demo-text-subtle);
}
.system-command-meta-chip:first-child {
  flex: 1 1 auto;
}
.system-command-meta-chip:last-child {
  flex: 0 0 auto;
}
.system-command-meta-chip b {
  flex: 0 0 auto;
  font-weight: 700;
  color: color-mix(in srgb, var(--system-command-color) 72%, var(--foreground) 28%);
}
.system-command-meta-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.system-command-card.is-zero .system-command-category-badge,
.system-command-card.is-zero .system-command-quantity {
  border-color: color-mix(in srgb, var(--foreground) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 56%, transparent);
  color: var(--demo-text-muted);
}
.system-command-card.is-zero .system-command-description,
.system-command-card.is-zero .system-command-meta,
.system-command-card.is-zero .system-command-meta-chip {
  color: var(--demo-text-muted);
}
.system-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.system-block-title {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}
.expand-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.expand-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
}
.expand-card strong {
  font-size: 18px;
  color: var(--demo-text-primary);
}
.expand-card span {
  font-size: 16px;
  color: var(--demo-color-danger);
}
.expand-card.unlocked span {
  color: var(--demo-text-accent);
}
.sidebar-footer {
  margin-top: auto;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--demo-border-accent-soft);
}

.sidebar-footer-meta {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.page-tabs-bottom {
  display: none;
}

@media (max-width: 760px) {
  .sidebar-card {
    gap: 6px;
    transform-origin: top center;
  }

  @supports (zoom: 1) {
    .sidebar-card {
      zoom: 0.9;
    }
  }

  .sidebar-tools,
  .meta-row {
    flex-direction: column;
    align-items: stretch;
  }

  .source-field {
    gap: 4px;
  }

  .source-field span,
  .analysis-flag,
  .sidebar-footer,
  .system-block-title {
    font-size: 10px;
    letter-spacing: 0.1em;
  }

  .source-caption {
    font-size: 8px;
  }

  .source-select {
    min-height: 30px;
    padding: 0 8px;
    font-size: 11px;
  }

  .source-nav {
    gap: 6px;
    padding: 4px 6px;
  }

  .source-nav-btn {
    width: 24px;
    height: 24px;
    font-size: 14px;
  }

  .source-nav-main {
    gap: 6px;
  }

  .source-nav-main strong {
    font-size: 10px;
  }

  .source-nav-main span {
    font-size: 8px;
  }
  .source-status {
    min-height: 20px;
    padding: 0 6px;
    font-size: 10px;
  }

  .metric-grid,
  .detail-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .page-tabs,
  .tab-row {
    flex-wrap: wrap;
    gap: 4px;
  }

  .page-tab,
  .tab-btn {
    min-height: 28px;
    padding: 0 6px;
    font-size: 11px;
    letter-spacing: 0.06em;
  }

  .collapse-btn,
  .action-btn {
    min-height: 28px;
    font-size: 11px;
    letter-spacing: 0.06em;
  }

  .accordion-list {
    gap: 6px;
  }

  .accordion-head {
    min-height: 34px;
    padding: 6px 8px;
    gap: 6px;
  }

  .accordion-title-group {
    gap: 6px;
  }

  .accordion-title {
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  .accordion-arrow {
    font-size: 12px;
  }

  .accordion-body {
    gap: 8px;
    padding: 8px;
  }

  .meta-row {
    gap: 6px;
  }

  .meta-box {
    min-height: 22px;
    padding: 0 7px;
    font-size: 11px;
  }

  .meta-code {
    font-size: 11px;
  }

  .metric-card,
  .detail-card,
  .bio-box,
  .system-card,
  .expand-card {
    padding: 8px;
    gap: 6px;
  }

  .metric-head {
    gap: 6px;
  }
  .metric-meta-inline {
    gap: 4px;
    margin-bottom: -1px;
  }
  .metric-meta-chip {
    min-height: 18px;
    padding: 0 6px;
    font-size: 9px;
    letter-spacing: 0.04em;
  }

  .metric-title,
  .detail-label {
    font-size: 9px;
    letter-spacing: 0.06em;
  }

  .metric-value {
    font-size: 14px;
  }

  .metric-caption,
  .detail-value,
  .bio-box p {
    font-size: 10px;
    line-height: 1.35;
  }

  .bio-box p {
    margin-left: 4px;
  }

  .stat-row {
    gap: 6px;
  }

  .stat-row span,
  .stat-row strong {
    font-size: 10px;
  }

  .stat-row span {
    width: 28px;
  }

  .stat-row strong {
    width: 24px;
  }

  .stat-track {
    height: 6px;
  }

  .system-panel {
    gap: 8px;
  }

  .system-title,
  .expand-card strong {
    font-size: 11px;
  }

  .system-copy,
  .expand-card span {
    font-size: 11px;
  }

  .system-command-titleline {
    flex-wrap: wrap;
    gap: 3px 8px;
  }

  .system-command-titleline strong,
  .system-command-description {
    max-width: 100%;
    flex-basis: 100%;
  }

  .system-command-description::before {
    content: '';
    margin: 0;
  }

  .system-command-meta {
    flex-wrap: wrap;
  }

  .system-command-meta-chip {
    flex: 1 1 100%;
  }

  .system-value strong {
    font-size: 22px;
  }

  .system-value span {
    font-size: 12px;
  }

  .mini-pill {
    min-height: 24px;
    padding: 0 8px;
    font-size: 9px;
  }

  .sidebar-footer {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .page-tabs-bottom {
    display: flex;
    gap: 4px;
  }
}
</style>
