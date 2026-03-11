<template>
  <section class="library-shell">
    <div class="library-grid">
      <div class="library-accordion clip-corner-sm">
        <button type="button" class="accordion-head" @click="toggle('quantum')">
          <span>量子加密隧道</span>
          <span>{{ openMap.quantum ? '⌄' : '›' }}</span>
        </button>
        <div v-if="openMap.quantum" class="accordion-body">
          <label class="field-label">标准输入框</label>
          <input class="ui-input clip-corner-sm" placeholder="节点_阿尔法" />
          <label class="field-label">高级下拉选择</label>
          <button type="button" class="ui-select clip-corner-sm">数据归档策略 <span>⌄</span></button>
        </div>
      </div>

      <div class="library-accordion clip-corner-sm">
        <button type="button" class="accordion-head" @click="toggle('resource')">
          <span>系统资源分配</span>
          <span>{{ openMap.resource ? '⌄' : '›' }}</span>
        </button>
        <div v-if="openMap.resource" class="accordion-body form-grid">
          <label class="check-row"><input type="checkbox" checked /> <span>启用同步回写</span></label>
          <label class="check-row"><input type="checkbox" /> <span>低功耗模式</span></label>
          <div class="radio-group">
            <label class="check-row"><input type="radio" name="mode" checked /> <span>标准</span></label>
            <label class="check-row"><input type="radio" name="mode" /> <span>安全</span></label>
          </div>
        </div>
      </div>
    </div>

    <section class="library-section">
      <h3>✳ 进度与数据可视化（PROGRESS & DATA）</h3>
      <div class="progress-demo">
        <div class="progress-line">
          <div class="label-row"><span>系统升级中 (DETERMINATE)</span><strong>10%</strong></div>
          <div class="track"><i style="width: 10%"></i></div>
        </div>
        <div class="progress-line">
          <div class="label-row"><span>分段加载 (SEGMENTED)</span><strong>3/5</strong></div>
          <div class="segment-row">
            <i class="active"></i><i class="active"></i><i class="active"></i><i></i><i></i>
          </div>
        </div>
        <div class="progress-line dual">
          <div class="ring-box">
            <div class="ring"><span>10</span></div>
            <small>CPU</small>
          </div>
          <ol class="step-list">
            <li class="active">
              <span>1</span>
              <div><strong>验证身份</strong><small>已确认管理员权限</small></div>
            </li>
            <li class="active">
              <span>2</span>
              <div><strong>同步数据</strong><small>正在拉取远端配置</small></div>
            </li>
            <li>
              <span>3</span>
              <div><strong>部署服务</strong><small>等待前置任务完成</small></div>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <section class="library-section">
      <h3>◔ 提示与弹窗（ALERTS & MODALS）</h3>
      <div class="alert-grid">
        <div class="alert-card success clip-corner-sm">
          <strong>操作成功</strong>
          <p>所有数据节点已成功同步至主服务器。</p>
        </div>
        <div class="alert-card info clip-corner-sm">
          <strong>TOAST 通知样式</strong>
          <p>这里可复用为楼层写回、回退删除、重生确认等提示。</p>
        </div>
      </div>
      <div class="confirm-box clip-corner-sm">
        <div>
          <strong>确认删除当前节点？</strong>
          <p>用于移植回退删除、消息确认、设置重置等确认窗。</p>
        </div>
        <div class="button-row">
          <button type="button" class="ghost-btn clip-corner-sm">取消</button
          ><button type="button" class="primary-btn clip-corner-sm">确认</button>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
const openMap = ref({ quantum: true, resource: true });
function toggle(key: 'quantum' | 'resource') {
  openMap.value[key] = !openMap.value[key];
}
</script>

<style scoped>
.library-shell,
.library-section,
.progress-demo,
.progress-line {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.library-grid,
.alert-grid,
.button-row {
  display: grid;
  gap: 16px;
}
.library-grid,
.alert-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.library-accordion,
.alert-card,
.confirm-box {
  padding: 0;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 26%, transparent);
}
.accordion-head,
.ui-select,
.ghost-btn,
.primary-btn {
  font-family: var(--demo-font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.accordion-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 54px;
  padding: 0 18px;
  border: none;
  background: transparent;
  color: var(--demo-text-accent);
  font-size: 14px;
}
.accordion-body {
  padding: 0 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field-label {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  color: var(--demo-text-subtle);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.ui-input,
.ui-select {
  min-height: 46px;
  padding: 0 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  color: var(--demo-text-primary);
  font-size: 13px;
}
.ui-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.form-grid,
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--demo-text-primary);
}
.library-section h3 {
  margin: 0;
  font-family: var(--demo-font-mono);
  font-size: 14px;
  letter-spacing: 0.16em;
  color: var(--demo-text-accent);
  text-transform: uppercase;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}
.label-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--demo-text-primary);
}
.track,
.segment-row {
  display: flex;
  gap: 6px;
  height: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  overflow: hidden;
}
.track i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #00ff85, color-mix(in srgb, var(--primary) 72%, white 8%));
}
.segment-row i {
  flex: 1;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border-radius: 999px;
}
.segment-row i.active {
  background: linear-gradient(90deg, #00ff85, color-mix(in srgb, var(--primary) 72%, white 8%));
}
.dual {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  align-items: center;
}
.ring-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.ring {
  width: 92px;
  height: 92px;
  border-radius: 999px;
  border: 9px solid color-mix(in srgb, var(--primary) 12%, transparent);
  border-top-color: #00ff85;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--demo-font-mono);
  font-size: 18px;
  color: var(--demo-text-accent);
}
.ring-box small {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  color: var(--demo-text-subtle);
}
.step-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.step-list li {
  display: flex;
  gap: 12px;
}
.step-list span {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--primary) 16%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--demo-font-mono);
  color: var(--demo-text-subtle);
}
.step-list li.active span {
  border-color: #00ff85;
  color: #00ff85;
}
.step-list strong {
  display: block;
  font-size: 14px;
  color: var(--demo-text-primary);
}
.step-list small {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--demo-text-secondary);
}
.alert-card {
  padding: 18px;
}
.alert-card strong,
.confirm-box strong {
  display: block;
  font-size: 16px;
  color: var(--demo-text-accent);
}
.alert-card p,
.confirm-box p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--demo-text-secondary);
}
.confirm-box {
  padding: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.button-row {
  grid-template-columns: repeat(2, auto);
}
.ghost-btn,
.primary-btn {
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 20%, transparent);
  color: var(--demo-text-primary);
  font-size: 11px;
}
.primary-btn {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
}
@media (max-width: 760px) {
  .library-grid,
  .alert-grid,
  .dual {
    grid-template-columns: 1fr;
  }
  .confirm-box {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
