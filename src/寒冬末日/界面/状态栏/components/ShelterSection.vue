<template>
  <section class="section" id="shelter-section">
    <h2 class="section-title">🏰 庇护所信息 🏰</h2>
    <div class="shelter-grid">
      <div class="shelter-item">
        <div class="label">⚜️ 庇护所等级</div>
        <div class="value">{{ store.data.庇护所.庇护所等级 }}</div>
      </div>
      <div class="shelter-item">
        <div class="label">🎲 今日投掷点数</div>
        <div class="value">{{ store.data.庇护所.今日投掷点数 }}</div>
      </div>
      <div class="shelter-item">
        <div class="label">⏳ 距离下次保底升级</div>
        <div class="value">{{ store.data.庇护所.距离上次升级 }}</div>
      </div>
      <div class="shelter-item">
        <div class="label">💡 庇护所能力列表</div>
        <div class="ability-list">
          <template v-if="store.data.庇护所.庇护所能力.length > 0">
            <div v-for="(ab, idx) in store.data.庇护所.庇护所能力" :key="idx" class="ability-card">
              <div class="name">{{ ab.name }}</div>
              <div class="desc">{{ ab.desc }}</div>
            </div>
          </template>
          <template v-else>(暂无能力)</template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useDataStore } from '../../store';

const store = useDataStore();
</script>
