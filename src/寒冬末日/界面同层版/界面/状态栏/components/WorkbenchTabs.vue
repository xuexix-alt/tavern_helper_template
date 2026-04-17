<template>
  <section class="workbench-card">
    <section class="workbench-summary-strip">
      <article class="summary-chip clip-corner-sm">
        <small>日志</small>
        <strong>{{ logs.length }}</strong>
      </article>
      <article class="summary-chip clip-corner-sm">
        <small>楼层</small>
        <strong>{{ transcriptTotal ?? 0 }}</strong>
      </article>
      <article class="summary-chip clip-corner-sm">
        <small>庇护等级</small>
        <strong>{{ shelterLevel }}</strong>
      </article>
      <article class="summary-chip clip-corner-sm">
        <small>指令</small>
        <strong>{{ edenCommandEntries.length }}</strong>
      </article>
    </section>

    <div class="system-tabs" role="tablist" aria-label="系统面板页签">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="system-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-if="activeTab === 'commands'" class="workbench-panel command-panel">
      <span class="block-label">Eden Commands</span>
      <div v-if="edenCommandEntries.length === 0" class="empty-log">当前暂无一次性指令</div>
      <div v-else class="command-list">
        <article v-for="entry in edenCommandEntries" :key="entry.key" class="command-card clip-corner-sm">
          <div class="command-card-head">
            <div class="command-card-copy">
              <small>名称</small>
              <span class="command-id">{{ entry.key }}</span>
              <strong>{{ entry.name }}</strong>
            </div>
            <div class="command-quantity">
              <small>数量</small>
              <strong>{{ entry.quantity }}</strong>
            </div>
          </div>
          <div class="command-meta">
            <span>说明</span>
            <p>{{ entry.description || '暂无说明' }}</p>
          </div>
          <div class="command-extra">
            <span>范围 {{ entry.scope || '--' }}</span>
            <span>时效 {{ entry.duration || '--' }}</span>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="activeTab === 'status'" class="workbench-panel status-panel">
      <span class="block-label">Latest System Snapshot</span>
      <div class="status-chip-row">
        <article class="status-chip clip-corner-sm">
          <small>来源</small>
          <strong>{{ systemReady ? 'latest' : '等待中' }}</strong>
        </article>
        <article class="status-chip clip-corner-sm">
          <small>投掷</small>
          <strong>{{ dailyRollText }}</strong>
        </article>
        <article class="status-chip clip-corner-sm">
          <small>模式</small>
          <strong>{{ isSystemRetrying ? '解析中' : busy ? '同步中' : '稳定' }}</strong>
        </article>
      </div>

      <div class="status-detail-grid">
        <article class="status-detail-card clip-corner-sm">
          <small>庇护所等级</small>
          <strong>{{ shelterLevel }} 级</strong>
        </article>
        <article class="status-detail-card clip-corner-sm">
          <small>今日投掷点数</small>
          <strong>{{ dailyRollText }}</strong>
        </article>
      </div>

      <div class="progress-row">
        <div class="progress-copy">
          <strong>可扩展区域</strong>
          <span>{{ unlockedExpansionCount }}/3</span>
        </div>
        <div class="segment-track">
          <i v-for="i in 3" :key="i" :class="{ active: i <= unlockedExpansionCount }"></i>
        </div>
      </div>

      <div class="expansion-grid">
        <article class="expansion-card clip-corner-sm" :class="{ unlocked: expansionState.medical !== '未解锁' }">
          <small>医疗翼</small>
          <strong>{{ expansionState.medical }}</strong>
        </article>
        <article class="expansion-card clip-corner-sm" :class="{ unlocked: expansionState.workshop !== '未解锁' }">
          <small>制造工坊</small>
          <strong>{{ expansionState.workshop }}</strong>
        </article>
        <article class="expansion-card clip-corner-sm" :class="{ unlocked: expansionState.hangar !== '未解锁' }">
          <small>载具格纳库</small>
          <strong>{{ expansionState.hangar }}</strong>
        </article>
      </div>
    </section>

    <section v-else class="workbench-panel">
      <span class="block-label">最近操作</span>
      <div v-if="logs.length === 0" class="empty-log">暂无日志</div>
      <ul v-else class="log-list">
        <li v-for="log in compactLogs" :key="log.id" class="log-item clip-corner-sm" :class="`is-${log.type}`">
          <div class="log-head">
            <strong>{{ log.title }}</strong>
            <span>{{ log.createdAt }}</span>
          </div>
          <div class="log-detail">{{ log.shortDetail }}</div>
        </li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import type { ReaderLogItem } from '../types';
import { buildEdenCommandDisplayEntries } from '../edenOneShotCommands';
import { useMvuSystemStore } from '../mvuRoleStore';

const props = defineProps<{
  logs: ReaderLogItem[];
  busy?: boolean;
  transcriptTotal?: number;
  assistantCount?: number;
}>();

const tabs = [
  { id: 'commands', label: '指令' },
  { id: 'status', label: '状态' },
  { id: 'logs', label: '日志' },
] as const;

const activeTab = ref<(typeof tabs)[number]['id']>('commands');
const { data: systemMvuData, ready: systemReady, isRetrying: isSystemRetrying } = useMvuSystemStore();

const compactLogs = computed(() =>
  props.logs.slice(0, 6).map(log => ({
    ...log,
    shortDetail:
      String(log.detail ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 72) || '无详情',
  })),
);
const shelterLevel = computed(() => `${String(_.get(systemMvuData.value, '庇护所.庇护所等级', '--'))}`);
const dailyRollText = computed(() => String(_.get(systemMvuData.value, '庇护所.今日投掷点数', '--')) || '--');
const edenCommandEntries = computed(() => buildEdenCommandDisplayEntries(_.get(systemMvuData.value, '伊甸一次性指令', {})));
const expansionState = computed(() => ({
  medical: String(_.get(systemMvuData.value, '庇护所.可扩展区域.医疗翼', '未解锁')),
  workshop: String(_.get(systemMvuData.value, '庇护所.可扩展区域.制造工坊', '未解锁')),
  hangar: String(_.get(systemMvuData.value, '庇护所.可扩展区域.载具格纳库', '未解锁')),
}));
const unlockedExpansionCount = computed(
  () => Object.values(expansionState.value).filter(value => String(value).trim() !== '未解锁').length,
);
</script>

<style scoped>
.workbench-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.summary-chip,
.status-chip,
.status-detail-card,
.expansion-card,
.command-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
}

.summary-chip small,
.summary-chip strong,
.status-chip small,
.status-chip strong,
.status-detail-card small,
.status-detail-card strong,
.expansion-card small,
.expansion-card strong,
.command-card-copy small,
.command-quantity small,
.command-card strong,
.command-id,
.command-meta span {
  font-family: var(--demo-font-mono);
}

.summary-chip small,
.status-chip small,
.status-detail-card small,
.expansion-card small,
.command-card-copy small,
.command-quantity small,
.command-id,
.command-meta span {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
}

.summary-chip strong,
.status-chip strong,
.status-detail-card strong,
.expansion-card strong,
.command-card strong {
  font-size: 13px;
  color: var(--demo-text-accent);
}

.expansion-card.unlocked strong {
  color: var(--demo-text-primary);
}

.workbench-card,
.workbench-panel,
.status-detail-grid,
.expansion-grid,
.command-list,
.command-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.system-tabs,
.log-head,
.progress-copy,
.command-card-head,
.command-card-copy,
.command-quantity {
  display: flex;
}

.system-tabs {
  gap: 8px;
  flex-wrap: wrap;
}

.system-tab {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 28%, transparent);
  color: var(--demo-text-secondary);
  font-family: var(--demo-font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.system-tab.active {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
}

.block-label {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
}

.status-chip-row,
.status-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.status-detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.progress-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-copy {
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--demo-text-primary);
}

.segment-track {
  display: flex;
  gap: 6px;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  overflow: hidden;
}

.segment-track i {
  flex: 1;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  border-radius: 999px;
}

.segment-track i.active {
  background: linear-gradient(90deg, #00ff85, color-mix(in srgb, var(--primary) 72%, white 8%));
}

.command-list {
  display: grid;
  grid-template-columns: 1fr;
}

.command-card-head {
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.command-card-copy,
.command-quantity {
  flex-direction: column;
  gap: 4px;
}

.command-meta p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--demo-text-secondary);
}

.command-extra {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--demo-text-subtle);
}

.log-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-item {
  padding: 8px 10px;
  background: color-mix(in srgb, var(--surface) 42%, transparent);
  border: 1px solid var(--demo-border-accent-soft);
}

.log-item.is-action {
  border-color: var(--demo-border-cyan);
}

.log-item.is-error {
  border-color: var(--demo-border-danger-soft);
}

.log-head {
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  align-items: baseline;
}

.log-detail {
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
}

.empty-log {
  font-size: 12px;
  color: var(--demo-text-subtle);
}

@media (max-width: 760px) {
  .workbench-summary-strip,
  .status-chip-row,
  .status-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
