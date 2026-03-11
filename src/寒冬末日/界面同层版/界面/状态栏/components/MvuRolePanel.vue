<template>
  <section class="sidebar-card">
    <div class="sidebar-tools">
      <label class="source-field">
        <span>变量来源</span>
        <select v-model="selectedSourceKey" class="source-select clip-corner-sm">
          <option v-for="option in sourceOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
        </select>
      </label>
      <div v-if="isDuringExtraAnalysis" class="analysis-flag">解析中</div>
    </div>

    <div class="page-tabs" role="tablist" aria-label="侧栏主分类">
      <button type="button" class="page-tab" :class="{ active: pageTab === 'agents' }" @click="pageTab = 'agents'">
        AGENTS
      </button>
      <button type="button" class="page-tab" :class="{ active: pageTab === 'system' }" @click="pageTab = 'system'">
        SYSTEM
      </button>
    </div>

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
            <div class="meta-row">
              <span class="meta-box">职业：{{ String(entry.role.职业 ?? '--') }}</span>
              <span class="meta-code">编号：{{ characterCode(entry) }}</span>
            </div>

            <div class="stat-list">
              <div class="stat-row">
                <span>力量</span>
                <div class="stat-track"><i :style="statWidth(entry.role.力量)" /></div>
                <strong>{{ safeNumber(entry.role.力量) }}</strong>
              </div>
              <div class="stat-row">
                <span>智力</span>
                <div class="stat-track"><i :style="statWidth(entry.role.智力)" /></div>
                <strong>{{ safeNumber(entry.role.智力) }}</strong>
              </div>
              <div class="stat-row">
                <span>敏捷</span>
                <div class="stat-track"><i :style="statWidth(entry.role.敏捷)" /></div>
                <strong>{{ safeNumber(entry.role.敏捷) }}</strong>
              </div>
            </div>

            <div class="bio-box">
              <div class="bio-stripe"></div>
              <p>{{ String(entry.role.内心想法 ?? entry.role.神态样貌 ?? '暂无详细描述') || '暂无详细描述' }}</p>
            </div>

            <button type="button" class="action-btn clip-corner-sm">[ INIT_CONNECTION ]</button>
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
            <button type="button" class="mini-pill">校准</button>
          </div>
          <div class="system-copy">{{ dailyRollText }}</div>
        </div>

        <div class="system-card clip-corner-sm">
          <div class="system-line"></div>
          <div class="system-title">距离上次保底升级</div>
          <div class="system-copy">{{ pityText }}</div>
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
      <span>DB_SYNC: OK</span>
      <span>ENTITIES: {{ activeEntries.length }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { TranscriptItem } from '../types';
import { useMvuRoleStore } from '../mvuRoleStore';
import { useDataStore } from '../../../../界面/store';

const props = defineProps<{
  targetMessageId?: number | null;
  transcriptItems?: TranscriptItem[];
  activeCharacterKey?: string | null;
}>();

const emit = defineEmits<{
  (event: 'select-character', key: string): void;
  (event: 'roster-change', roles: Array<{ key: string; label: string; statusClass: string; statusText: string }>): void;
}>();

type RoleTab = 'main' | 'temp';
type PageTab = 'agents' | 'system';
type RoleSourceOption = {
  key: string;
  label: string;
  pillLabel: string;
  targetMessageId: number | 'latest';
  sortId: number;
};

const store = useDataStore();
const pageTab = ref<PageTab>('agents');
const activeTab = ref<RoleTab>('main');
const normalizedTargetMessageId = computed(() => {
  const numeric = Number(props.targetMessageId);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
});
const selectedSourceKey = ref('latest');
const sourceOptions = computed<RoleSourceOption[]>(() => {
  const options: RoleSourceOption[] = [
    {
      key: 'latest',
      label: 'latest（自动跟随）',
      pillLabel: 'latest',
      targetMessageId: 'latest',
      sortId: Number.MAX_SAFE_INTEGER,
    },
  ];
  const transcriptItems = Array.isArray(props.transcriptItems) ? props.transcriptItems : [];
  const filtered = transcriptItems
    .filter(item => item.isOpening || item.role === 'assistant' || item.role === 'user')
    .sort((a, b) => a.message_id - b.message_id);
  let previousAssistantLikeId: number | null = null;
  const derived: RoleSourceOption[] = [];
  for (const item of filtered) {
    let effectiveId: number | null = null;
    if (item.isOpening || item.role === 'assistant') {
      effectiveId = item.message_id;
      previousAssistantLikeId = item.message_id;
    } else if (item.role === 'user') effectiveId = previousAssistantLikeId;
    if (effectiveId == null) continue;
    derived.push({
      key: `message:${item.message_id}`,
      label: item.isOpening ? `#${item.message_id} 开局` : `#${item.message_id} ${item.role}`,
      pillLabel: item.isOpening ? `#${item.message_id} 开局` : `#${item.message_id} ${item.role}`,
      targetMessageId: effectiveId,
      sortId: item.message_id,
    });
  }
  derived
    .sort((a, b) => b.sortId - a.sortId)
    .forEach(option => {
      if (!options.some(existing => existing.key === option.key)) options.push(option);
    });
  if (
    normalizedTargetMessageId.value != null &&
    !options.some(option => option.targetMessageId === normalizedTargetMessageId.value)
  )
    options.push({
      key: `message:${normalizedTargetMessageId.value}`,
      label: `#${normalizedTargetMessageId.value}`,
      pillLabel: `#${normalizedTargetMessageId.value}`,
      targetMessageId: normalizedTargetMessageId.value,
      sortId: normalizedTargetMessageId.value,
    });
  return options;
});
const selectedSourceOption = computed(
  () => sourceOptions.value.find(option => option.key === selectedSourceKey.value) ?? sourceOptions.value[0] ?? null,
);
const selectedTargetMessageId = computed(
  () => selectedSourceOption.value?.targetMessageId ?? normalizedTargetMessageId.value ?? 'latest',
);
const {
  ready,
  source,
  resolvedMessageId,
  isDuringExtraAnalysis,
  hasAnyRole,
  mainRoleEntries,
  tempNpcEntries,
  refresh,
} = useMvuRoleStore(selectedTargetMessageId);
const agentTabs = computed(() => [
  { id: 'main' as const, label: `主要角色 ${mainRoleEntries.value.length}` },
  { id: 'temp' as const, label: `临时NPC ${tempNpcEntries.value.length}` },
]);
const activeEntries = computed(() => (activeTab.value === 'main' ? mainRoleEntries.value : tempNpcEntries.value));
const internalSelectedKey = ref<string | null>(null);
const selectedCharacterKey = computed(() => props.activeCharacterKey ?? internalSelectedKey.value);
const sourceLabel = computed(() => {
  const selected = selectedSourceOption.value;
  if (!selected) return 'latest';
  if (source.value === 'default') return `${selected.pillLabel} · 无数据`;
  if (source.value === 'latest' && selected.targetMessageId !== 'latest')
    return `${selected.pillLabel} · 已回退 latest`;
  if (selected.targetMessageId === 'latest')
    return resolvedMessageId.value === 'latest' ? 'latest' : `latest · #${resolvedMessageId.value}`;
  return selected.pillLabel;
});
const shelterLevel = computed(() => `${String(_.get(store.data, '庇护所.庇护所等级', '--'))}`);
const dailyRollText = computed(() => String(_.get(store.data, '庇护所.今日投掷点数', '--')) || '--');
const pityText = computed(() => String(_.get(store.data, '庇护所.距离上次升级', '--')) || '--');
const expansionState = computed(() => ({
  medical: String(_.get(store.data, '庇护所.可扩展区域.医疗翼', '未解锁')),
  workshop: String(_.get(store.data, '庇护所.可扩展区域.制造工坊', '未解锁')),
  hangar: String(_.get(store.data, '庇护所.可扩展区域.载具格纳库', '未解锁')),
}));

watch(
  sourceOptions,
  options => {
    if (!options.some(option => option.key === selectedSourceKey.value)) selectedSourceKey.value = 'latest';
  },
  { immediate: true },
);
watch(selectedTargetMessageId, () => {
  refresh();
});
watch(
  activeEntries,
  entries => {
    const keys = entries.map(entry => entry.key);
    if (keys.length === 0) {
      internalSelectedKey.value = null;
      emit('roster-change', []);
      return;
    }
    if (!selectedCharacterKey.value || !keys.includes(selectedCharacterKey.value)) internalSelectedKey.value = keys[0];
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
  emit('select-character', key);
}
function characterCode(entry: { key: string }) {
  const m = String(entry.key).match(/(\d+)/);
  return m?.[1] ?? '01';
}
function safeNumber(input: unknown) {
  const n = Number(input);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.trunc(n))) : '--';
}
function statWidth(input: unknown) {
  const n = Number(input);
  return { width: `${Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0}%` };
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
.section-kicker,
.system-block-title,
.sidebar-footer {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
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
.page-tabs,
.tab-row {
  gap: 8px;
}
.page-tab,
.tab-btn,
.mini-pill,
.action-btn,
.meta-box {
  font-family: var(--demo-font-mono);
  font-size: 11px;
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
  flex: 1 1 auto;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  overflow: hidden;
}
.stat-track i {
  display: block;
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
@media (max-width: 760px) {
  .sidebar-tools,
  .meta-row {
    flex-direction: column;
    align-items: stretch;
  }
  .page-tabs,
  .tab-row {
    flex-wrap: wrap;
  }
}
</style>
