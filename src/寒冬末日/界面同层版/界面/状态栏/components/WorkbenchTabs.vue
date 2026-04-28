<template>
  <section class="workbench-card">
    <section class="active-directive-strip clip-corner-sm">
      <div class="active-directive-head">
        <span class="block-label">Active Eden Directive</span>
        <strong>生效项 {{ activeDirectiveEntries.length }}</strong>
      </div>

      <article
        v-if="primaryActiveDirective"
        class="active-directive-card clip-corner-sm"
        :class="commandCategoryClass(primaryActiveDirective.category)"
      >
        <div class="active-directive-titleline">
          <strong>{{ primaryActiveDirective.name }}</strong>
          <span>{{ primaryActiveDirective.commandKey }}</span>
          <em>×{{ primaryActiveDirective.quantity }}</em>
        </div>
        <div class="active-directive-meta">
          <span>
            <b>对象/范围</b>
            {{ primaryActiveDirective.targetScope || '--' }}
          </span>
          <span>
            <b>剩余</b>
            {{ primaryActiveDirective.remaining || '--' }}
          </span>
          <span>
            <b>时效</b>
            {{ primaryActiveDirective.fixedDuration || '--' }}
          </span>
        </div>
        <p>{{ primaryActiveDirective.description || '暂无说明' }}</p>
      </article>

      <div v-else class="empty-log">当前无生效中的一次性指令</div>
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
        <article
          v-for="entry in edenCommandEntries"
          :key="entry.key"
          class="command-card clip-corner-sm"
          :class="commandCardClass(entry)"
        >
          <div class="command-card-topline">
            <div class="command-card-tags">
              <span class="command-category-badge">{{ commandCategoryLabel(entry.category) }}</span>
              <span class="command-id">{{ entry.key }}</span>
            </div>
            <div class="command-quantity-pill" aria-label="数量">×{{ entry.quantity }}</div>
          </div>
          <div class="command-card-titleline">
            <strong>{{ entry.name }}</strong>
            <span class="command-card-description">{{ entry.description || '暂无说明' }}</span>
          </div>
          <div class="command-extra">
            <span class="command-extra-chip">
              <b>范围</b>
              <span>{{ entry.scope || '--' }}</span>
            </span>
            <span class="command-extra-chip">
              <b>时效</b>
              <span>{{ entry.duration || '--' }}</span>
            </span>
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

    <section v-else class="workbench-panel logs-panel">
      <section class="workbench-summary-strip">
        <article class="summary-chip clip-corner-sm">
          <small>日志</small>
          <strong>{{ logs.length }}</strong>
          <span>最近操作</span>
        </article>
        <article class="summary-chip clip-corner-sm">
          <small>楼层</small>
          <strong>{{ transcriptTotal ?? 0 }}</strong>
          <span>当前聊天</span>
        </article>
        <article class="summary-chip clip-corner-sm">
          <small>庇护等级</small>
          <strong>{{ shelterLevel }}</strong>
          <span>Shelter Lv.</span>
        </article>
        <article class="summary-chip clip-corner-sm">
          <small>指令</small>
          <strong>{{ edenCommandEntries.length }}</strong>
          <span>Eden Commands</span>
        </article>
      </section>

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
import {
  buildEdenActiveDirectiveEntries,
  buildEdenCommandDisplayEntries,
  type EdenOneShotCommandDisplayEntry,
} from '../edenOneShotCommands';
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
const edenCommandEntries = computed(() =>
  buildEdenCommandDisplayEntries(_.get(systemMvuData.value, '伊甸一次性指令', {})),
);
const activeDirectiveEntries = computed(() =>
  buildEdenActiveDirectiveEntries(_.get(systemMvuData.value, '伊甸一次性指令', {})),
);
const primaryActiveDirective = computed(() => activeDirectiveEntries.value[0] ?? null);
const expansionState = computed(() => ({
  medical: String(_.get(systemMvuData.value, '庇护所.可扩展区域.医疗翼', '未解锁')),
  workshop: String(_.get(systemMvuData.value, '庇护所.可扩展区域.制造工坊', '未解锁')),
  hangar: String(_.get(systemMvuData.value, '庇护所.可扩展区域.载具格纳库', '未解锁')),
}));
const unlockedExpansionCount = computed(
  () => Object.values(expansionState.value).filter(value => String(value).trim() !== '未解锁').length,
);

function commandCategoryClass(category: string): string {
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

function commandCardClass(entry: EdenOneShotCommandDisplayEntry) {
  return [commandCategoryClass(entry.category), { 'is-zero': entry.quantity <= 0 }];
}
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
.command-card,
.active-directive-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
}

.summary-chip {
  min-height: 74px;
  justify-content: space-between;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, transparent), transparent 60%),
    color-mix(in srgb, var(--surface) 46%, transparent);
}

.summary-chip::before,
.command-card::before,
.active-directive-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--cmd-category-color, var(--primary)) 92%, white 8%),
    color-mix(in srgb, var(--cmd-category-color, var(--primary)) 36%, transparent)
  );
  opacity: 0.9;
}

.summary-chip small,
.summary-chip strong,
.status-chip small,
.status-chip strong,
.status-detail-card small,
.status-detail-card strong,
.expansion-card small,
.expansion-card strong,
.active-directive-head strong,
.active-directive-titleline span,
.active-directive-titleline em,
.active-directive-meta,
.active-directive-meta b,
.command-category-badge,
.command-extra-chip,
.command-extra-chip b,
.command-quantity-pill,
.command-card strong,
.command-id {
  font-family: var(--demo-font-mono);
}

.summary-chip small,
.status-chip small,
.status-detail-card small,
.expansion-card small,
.command-id,
.summary-chip span {
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
.active-directive-strip {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.system-tabs,
.log-head,
.progress-copy,
.active-directive-head,
.active-directive-titleline,
.active-directive-meta,
.command-card-topline,
.command-card-tags,
.command-card-titleline,
.command-extra,
.command-extra-chip {
  display: flex;
}

.active-directive-strip {
  padding: 10px;
  border: 1px solid var(--demo-border-accent-soft);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, transparent), transparent 64%),
    color-mix(in srgb, var(--surface) 32%, transparent);
}

.active-directive-head {
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.active-directive-head strong {
  color: var(--demo-text-accent);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.active-directive-card {
  --cmd-category-color: var(--primary);
  gap: 7px;
  padding: 9px 10px 9px 13px;
  border-color: color-mix(in srgb, var(--cmd-category-color) 34%, var(--border) 66%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--cmd-category-color) 11%, transparent), transparent 58%),
    color-mix(in srgb, var(--surface) 42%, transparent);
}

.active-directive-titleline {
  min-width: 0;
  align-items: baseline;
  gap: 7px;
}

.active-directive-titleline strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--demo-text-primary);
}

.active-directive-titleline span {
  flex: 0 0 auto;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--demo-text-subtle);
}

.active-directive-titleline em {
  flex: 0 0 auto;
  margin-left: auto;
  font-style: normal;
  font-size: 12px;
  color: color-mix(in srgb, var(--cmd-category-color) 78%, var(--foreground) 22%);
}

.active-directive-meta {
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.active-directive-meta > span {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--cmd-category-color) 18%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 55%, var(--cmd-category-color) 5%);
  font-size: 10px;
  line-height: 1.2;
  color: var(--demo-text-subtle);
}

.active-directive-meta b {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--cmd-category-color) 72%, var(--foreground) 28%);
}

.active-directive-card p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.35;
  color: var(--demo-text-secondary);
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
  gap: 7px;
}

.command-card-topline {
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.command-card-tags {
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.command-card-titleline {
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.command-card {
  --cmd-category-color: var(--primary);
  gap: 6px;
  padding: 8px 10px 8px 12px;
  border-color: color-mix(in srgb, var(--cmd-category-color) 34%, var(--border) 66%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--cmd-category-color) 10%, transparent), transparent 58%),
    color-mix(in srgb, var(--surface) 40%, transparent);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    opacity 180ms ease;
}

.command-card.category-cognition,
.active-directive-card.category-cognition {
  --cmd-category-color: #8b5cf6;
}

.command-card.category-spacetime,
.active-directive-card.category-spacetime {
  --cmd-category-color: #38bdf8;
}

.command-card.category-combat,
.active-directive-card.category-combat {
  --cmd-category-color: #fb7185;
}

.command-card.category-attribute,
.active-directive-card.category-attribute {
  --cmd-category-color: #34d399;
}

.command-card.category-unknown,
.active-directive-card.category-unknown {
  --cmd-category-color: var(--primary);
}

.command-card.is-zero {
  --cmd-category-color: color-mix(in srgb, var(--foreground) 34%, var(--surface) 66%);
  border-color: color-mix(in srgb, var(--foreground) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 50%, var(--foreground) 4%);
}

.command-card.is-zero .command-card-description,
.command-card.is-zero .command-extra {
  color: var(--demo-text-muted);
}

.command-card-titleline strong {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--demo-text-primary);
}

.command-card-description {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.35;
  color: var(--demo-text-secondary);
}

.command-card-description::before {
  content: '—';
  margin-right: 7px;
  color: color-mix(in srgb, var(--cmd-category-color) 58%, var(--demo-text-subtle));
}

.command-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-category-badge,
.command-quantity-pill {
  width: fit-content;
  border: 1px solid color-mix(in srgb, var(--cmd-category-color) 36%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cmd-category-color) 12%, var(--surface) 88%);
  color: color-mix(in srgb, var(--cmd-category-color) 76%, var(--foreground) 24%);
}

.command-category-badge {
  flex: 0 0 auto;
  padding: 2px 7px;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.command-id {
  flex: 0 1 auto;
  max-width: 82px;
  color: var(--demo-text-subtle);
}

.command-quantity-pill {
  flex: 0 0 auto;
  min-width: 38px;
  padding: 4px 9px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--demo-text-primary);
}

.command-card.is-zero .command-category-badge,
.command-card.is-zero .command-quantity-pill {
  border-color: color-mix(in srgb, var(--foreground) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 56%, transparent);
  color: var(--demo-text-muted);
}

.command-extra {
  min-width: 0;
  flex-wrap: nowrap;
  gap: 6px;
}

.command-extra-chip {
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--cmd-category-color) 18%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 55%, var(--cmd-category-color) 5%);
  font-size: 10px;
  line-height: 1.2;
  letter-spacing: 0.04em;
  color: var(--demo-text-subtle);
}

.command-extra-chip:first-child {
  flex: 1 1 auto;
}

.command-extra-chip:last-child {
  flex: 0 0 auto;
}

.command-extra-chip b {
  flex: 0 0 auto;
  font-weight: 700;
  color: color-mix(in srgb, var(--cmd-category-color) 72%, var(--foreground) 28%);
}

.command-extra-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

  .command-card-titleline {
    flex-wrap: wrap;
    gap: 3px 8px;
  }

  .command-card-titleline strong,
  .command-card-description {
    max-width: 100%;
    flex-basis: 100%;
  }

  .command-card-description::before {
    content: '';
    margin: 0;
  }

  .command-extra {
    flex-wrap: wrap;
  }

  .command-extra-chip {
    flex: 1 1 100%;
  }
}
</style>
