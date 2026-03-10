<template>
  <main class="demo-shell">
    <div class="demo-shell-grid demo-grid-bg"></div>

    <header class="demo-header hud-panel clip-corner">
      <div class="demo-header-copy">
        <span class="demo-kicker">HUD STREAMING INTERFACE</span>
        <h1>流式最小 Demo</h1>
        <p>已迁移 `docs/UI` 模板风格，保留 transcript、开局生成与楼层接管链路。</p>
      </div>

      <div class="demo-header-meta">
        <span class="demo-meta-pill">Tavern Helper</span>
        <span class="demo-meta-pill">Streaming</span>
        <span class="demo-meta-pill">Vue iframe</span>
      </div>
    </header>

    <StoryPage />
  </main>
</template>

<script setup lang="ts">
import StoryPage from './pages/StoryPage.vue';
</script>

<style scoped>
.demo-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 18px;
  background: var(--demo-surface-shell);
  border: 1px solid var(--demo-border-shell);
  box-shadow: var(--demo-shadow-shell);
  overflow: hidden;
}

.demo-shell-grid {
  position: absolute;
  inset: 0;
  opacity: 0.42;
  pointer-events: none;
}

.demo-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 16px;
}

.demo-header-copy {
  position: relative;
  z-index: 1;
}

.demo-header h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.12;
  letter-spacing: 0.01em;
}

.demo-header p {
  margin: 8px 0 0;
  max-width: 42rem;
  font-size: 13px;
  line-height: 1.55;
  color: var(--demo-text-secondary);
}

.demo-header-meta {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.demo-meta-pill {
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 35%, transparent);
  padding: 6px 10px;
  border-radius: 999px;
  font-family: var(--demo-font-mono);
  font-size: 11px;
  color: var(--demo-text-tertiary);
}

@media (max-width: 680px) {
  .demo-shell {
    padding: 10px;
    border-radius: 16px;
  }

  .demo-header {
    flex-direction: column;
    padding: 14px;
  }

  .demo-header h1 {
    font-size: 20px;
  }

  .demo-header-meta {
    justify-content: flex-start;
  }
}
</style>
