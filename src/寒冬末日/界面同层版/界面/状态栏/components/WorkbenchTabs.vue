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
        <small>状态</small>
        <strong>{{ busy ? '忙碌中' : '稳定' }}</strong>
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

    <section v-if="activeTab === 'logs'" class="workbench-panel">
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

    <section v-else-if="activeTab === 'status'" class="workbench-panel status-panel">
      <span class="block-label">Progress & Data</span>
      <div class="status-chip-row">
        <article class="status-chip clip-corner-sm">
          <small>助手</small>
          <strong>{{ assistantCount ?? 0 }}</strong>
        </article>
        <article class="status-chip clip-corner-sm">
          <small>日志</small>
          <strong>{{ logs.length }}</strong>
        </article>
        <article class="status-chip clip-corner-sm">
          <small>模式</small>
          <strong>{{ busy ? '同步中' : '待命' }}</strong>
        </article>
      </div>
      <div class="progress-row">
        <div class="progress-copy">
          <strong>系统升级中 (DETERMINATE)</strong>
          <span>{{ busy ? '62%' : '100%' }}</span>
        </div>
        <div class="progress-track"><i class="progress-fill" :style="{ width: busy ? '62%' : '100%' }"></i></div>
      </div>
      <div class="progress-row">
        <div class="progress-copy">
          <strong>分段加载 (SEGMENTED)</strong>
          <span>{{ busy ? '3/5' : '5/5' }}</span>
        </div>
        <div class="segment-track">
          <i v-for="i in 5" :key="i" :class="{ active: i <= (busy ? 3 : 5) }"></i>
        </div>
      </div>
      <div class="progress-row stepper-row">
        <div class="ring-stat">
          <div class="ring-shell">
            <span>{{ assistantCount }}</span>
          </div>
          <small>CPU</small>
        </div>
        <ol class="stepper-list">
          <li :class="{ active: true }">
            <span>1</span>
            <div><strong>验证身份</strong><small>已确认管理员权限</small></div>
          </li>
          <li :class="{ active: true }">
            <span>2</span>
            <div><strong>同步数据</strong><small>正在拉取远端配置</small></div>
          </li>
          <li :class="{ active: busy }">
            <span>3</span>
            <div>
              <strong>部署服务</strong><small>{{ busy ? '等待前置任务完成' : '已完成' }}</small>
            </div>
          </li>
        </ol>
      </div>
    </section>

    <section v-else class="workbench-panel alerts-panel">
      <span class="block-label">Alerts & Modals</span>
      <div class="alert-card success clip-corner-sm">
        <strong>操作成功</strong>
        <p>所有数据节点已成功同步至主服务器。</p>
      </div>
      <div class="confirm-card clip-corner-sm">
        <div>
          <strong>确认执行系统刷新？</strong>
          <p>当前共有 {{ transcriptTotal }} 条楼层。</p>
        </div>
        <div class="confirm-actions">
          <button type="button" class="action-btn confirm clip-corner-sm">确认</button>
          <button type="button" class="action-btn clip-corner-sm">取消</button>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import type { ReaderLogItem } from '../types';

const props = defineProps<{
  logs: ReaderLogItem[];
  busy?: boolean;
  transcriptTotal?: number;
  assistantCount?: number;
}>();

const tabs = [
  { id: 'logs', label: '日志' },
  { id: 'status', label: '状态' },
  { id: 'alerts', label: '告警' },
] as const;

const activeTab = ref<(typeof tabs)[number]['id']>('status');

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
</script>

<style scoped>
.workbench-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.summary-chip,
.status-chip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 52px;
  padding: 8px 10px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
}

.summary-chip small,
.summary-chip strong,
.status-chip small,
.status-chip strong {
  font-family: var(--demo-font-mono);
}

.summary-chip small,
.status-chip small {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
}

.summary-chip strong,
.status-chip strong {
  font-size: 13px;
  color: var(--demo-text-accent);
}

.workbench-card,
.workbench-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.system-tabs,
.log-head,
.progress-copy,
.confirm-actions,
.stepper-list li {
  display: flex;
}
.system-tabs {
  gap: 8px;
  flex-wrap: wrap;
}
.system-tab,
.action-btn {
  font-family: var(--demo-font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.system-tab {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 28%, transparent);
  color: var(--demo-text-secondary);
  font-size: 11px;
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
.progress-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-chip-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.progress-copy {
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--demo-text-primary);
}
.progress-track,
.segment-track {
  display: flex;
  gap: 6px;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  overflow: hidden;
}
.progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #00ff85, color-mix(in srgb, var(--primary) 72%, white 8%));
}
.segment-track i {
  flex: 1;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  border-radius: 999px;
}
.segment-track i.active {
  background: linear-gradient(90deg, #00ff85, color-mix(in srgb, var(--primary) 72%, white 8%));
}
.stepper-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
.ring-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.ring-shell {
  width: 68px;
  height: 68px;
  border-radius: 999px;
  border: 6px solid color-mix(in srgb, var(--primary) 16%, transparent);
  border-top-color: #00ff85;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
  font-size: 15px;
  font-weight: 700;
}
.ring-stat small {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  color: var(--demo-text-subtle);
}
.stepper-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.stepper-list li {
  align-items: flex-start;
  gap: 12px;
}
.stepper-list li span {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--primary) 18%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--demo-font-mono);
  color: var(--demo-text-subtle);
}
.stepper-list li.active span {
  border-color: #00ff85;
  color: #00ff85;
}
.stepper-list strong {
  display: block;
  font-size: 13px;
}
.stepper-list small {
  display: block;
  margin-top: 2px;
  color: var(--demo-text-secondary);
  font-size: 11px;
  line-height: 1.35;
}
.alert-card,
.confirm-card {
  padding: 16px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 28%, transparent);
}
.alert-card.success {
  border-color: color-mix(in srgb, #00ff85 28%, transparent);
}
.alert-card strong,
.confirm-card strong {
  display: block;
  font-size: 16px;
  color: var(--demo-text-accent);
}
.alert-card p,
.confirm-card p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--demo-text-secondary);
}
.confirm-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.confirm-actions {
  gap: 8px;
  flex-wrap: wrap;
}
.action-btn {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  color: var(--demo-text-primary);
  font-size: 11px;
}
.action-btn.confirm {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
}
@media (max-width: 760px) {
  .workbench-summary-strip,
  .status-chip-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .stepper-row {
    grid-template-columns: 1fr;
  }
  .confirm-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
