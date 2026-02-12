<template>
  <div class="inventory-layout">
    <div class="section-head">物品清单</div>
    <div v-if="!_.isEmpty(store.data.主角.物品栏)" class="inventory-grid">
      <div v-for="(item, name) in store.data.主角.物品栏" :key="name" class="item-row">
        <div class="item-icon">{{ getItemIcon(name as string) }}</div>
        <div class="item-detail">
          <span class="item-name">{{ name }}</span>
          <span class="item-desc">{{ item.描述 }}</span>
        </div>
        <span class="item-count">x{{ item.数量 }}</span>
      </div>
    </div>
    <div v-else class="empty-state">背包空空如也...</div>
  </div>
</template>

<script setup lang="ts">
import _ from 'lodash';
import { useDataStore } from '../store';

const store = useDataStore();

function getItemIcon(name: string): string {
  // 根据物品名生成简短图标
  if (name.includes('手机') || name.includes('电话')) return 'PH';
  if (name.includes('钥匙')) return 'KY';
  if (name.includes('钱') || name.includes('币')) return '$$';
  if (name.includes('证') || name.includes('卡')) return 'ID';
  if (name.includes('糖') || name.includes('药')) return 'RX';
  if (name.includes('创可贴') || name.includes('绷带')) return '+';
  // 默认取前两个字符
  return name.substring(0, 2).toUpperCase();
}
</script>

<style lang="scss" scoped>
.inventory-layout {
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

.inventory-grid {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.item-row {
  display: flex;
  align-items: center;
  border: 1px solid rgba(60, 73, 63, 0.24);
  border-radius: 10px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.88);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
  box-shadow: 0 4px 10px rgba(20, 45, 35, 0.06);
}

.item-row:hover {
  transform: translateX(3px);
  border-color: rgba(83, 117, 100, 0.5);
  box-shadow: 0 8px 14px rgba(20, 45, 35, 0.1);
}

.item-icon {
  width: 30px;
  height: 30px;
  background: linear-gradient(180deg, rgba(162, 227, 196, 0.9), rgba(162, 227, 196, 0.64));
  border: 1px solid rgba(60, 73, 63, 0.34);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  font-weight: 700;
  font-size: 0.66rem;
}

.item-detail {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-weight: 700;
  font-size: 0.82rem;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-desc {
  font-size: 0.7rem;
  color: var(--c-grey-olive);
  line-height: 1.35;
}

.item-count {
  background: rgba(60, 73, 63, 0.88);
  color: #eef7f2;
  padding: 3px 7px;
  font-size: 0.67rem;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.03em;
  margin-left: 8px;
}

.empty-state {
  text-align: center;
  color: var(--c-grey-olive);
  border-radius: 10px;
  border: 1px dashed rgba(76, 98, 89, 0.34);
  background: rgba(255, 255, 255, 0.72);
  padding: 18px 10px;
  font-style: italic;
  font-size: 0.78rem;
}

@media (max-width: 600px) {
  .inventory-layout {
    padding: 9px;
    border-radius: 10px;
  }

  .section-head {
    font-size: 0.72rem;
    margin-bottom: 7px;
  }

  .item-row {
    padding: 7px;
  }

  .item-icon {
    width: 28px;
    height: 28px;
    margin-right: 8px;
  }

  .item-name {
    font-size: 0.78rem;
  }

  .item-desc {
    font-size: 0.67rem;
  }
}
</style>
