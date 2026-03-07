<template>
  <main class="demo-shell">
    <header class="demo-header">
      <h1>官方流式最小 Demo（纯界面版）</h1>
      <p>界面内直接 generate，并由当前界面直接接管宿主楼层显示。</p>
    </header>
    <StoryPage />
  </main>
</template>

<script setup lang="ts">
import StoryPage from './pages/StoryPage.vue';
</script>

<style scoped>
.demo-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  border-radius: 14px;
  background: rgba(11, 16, 28, 0.88);
  border: 1px solid rgba(120, 150, 220, 0.25);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
}

.demo-header h1 {
  margin: 0;
  font-size: 16px;
}

.demo-header p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(230, 236, 255, 0.78);
}
</style>
