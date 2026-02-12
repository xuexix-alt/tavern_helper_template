<template>
  <div class="char-layout">
    <section class="panel-section">
      <div class="section-head">{{ store.data.白娅.$依存度阶段 }}</div>
      <div class="title-grid">
        <div v-for="(title, name) in store.data.白娅.称号" :key="name" class="title-box">
          <span class="title-name">{{ name }}</span>
          <div class="title-effect">{{ title.效果 }}</div>
          <div class="title-quote">"{{ title.自我评价 }}"</div>
        </div>
        <div v-if="_.isEmpty(store.data.白娅.称号)" class="title-box">
          <span class="title-name">无称号</span>
          <div class="title-effect">当前没有生效的称号</div>
          <div class="title-quote">"..."</div>
        </div>
      </div>
    </section>

    <section class="panel-section">
      <div class="section-head">着装记录</div>
      <div class="attire-list">
        <div v-for="(description, slot) in store.data.白娅.着装" :key="slot" class="attire-item">
          <span class="attire-slot">{{ slot }}</span>
          <p class="attire-desc">{{ description }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import _ from 'lodash';
import { useDataStore } from '../store';

const store = useDataStore();
</script>

<style lang="scss" scoped>
.char-layout {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-section {
  padding: 10px;
  border: 1px solid rgba(60, 73, 63, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 7px 16px rgba(20, 45, 35, 0.08);
}

.section-head {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4f6358;
  margin-bottom: 9px;
  font-weight: 700;
}

.title-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 9px;
}

.title-box {
  border: 1px solid rgba(60, 73, 63, 0.26);
  border-radius: 10px;
  padding: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.78));
  box-shadow: 0 4px 10px rgba(20, 45, 35, 0.08);
}

.title-name {
  background: rgba(60, 73, 63, 0.9);
  color: #d5efe1;
  display: inline-block;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 700;
  margin-bottom: 5px;
  letter-spacing: 0.05em;
}

.title-effect {
  font-size: 0.74rem;
  margin-bottom: 5px;
  line-height: 1.4;
}

.title-quote {
  font-size: 0.68rem;
  color: var(--c-grey-olive);
  font-style: italic;
  line-height: 1.35;
}

.attire-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
}

.attire-item {
  border: 1px solid rgba(76, 98, 89, 0.22);
  border-radius: 10px;
  padding: 8px;
  font-size: 0.76rem;
  background: rgba(255, 255, 255, 0.8);
}

.attire-slot {
  color: #4f6358;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  display: block;
  margin-bottom: 4px;
}

.attire-desc {
  line-height: 1.4;
}

@media (max-width: 600px) {
  .panel-section {
    padding: 9px;
    border-radius: 10px;
  }

  .section-head {
    font-size: 0.72rem;
    margin-bottom: 7px;
  }

  .title-grid,
  .attire-list {
    grid-template-columns: 1fr;
  }
}
</style>
