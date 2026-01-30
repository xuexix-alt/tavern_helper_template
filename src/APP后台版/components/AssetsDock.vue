<template>
  <aside class="dock-shell">
    <div class="dock-head">
      <div class="dock-title">
        <span class="material-symbols-outlined">paid</span>
        我的资产
      </div>
      <button class="dock-toggle" @click="collapsed = !collapsed">
        <span class="material-symbols-outlined">{{ collapsed ? 'expand_more' : 'expand_less' }}</span>
        {{ collapsed ? '展开' : '收起' }}
      </button>
    </div>

    <div v-if="!collapsed" class="dock-body">
      <div class="balance-card">
        <div class="balance-title">余额</div>
        <div class="balance-value">¥{{ balance }}</div>
      </div>

      <div class="inventory-grid">
        <div v-for="(item, idx) in inventory" :key="idx" class="inventory-item">
          <span class="material-symbols-outlined">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </div>
      </div>

      <button class="shop-btn" @click="emit('open-shop')">
        <span class="material-symbols-outlined">storefront</span>
        打开商城
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getNestedValue } from '../utils';

const emit = defineEmits<{ (e: 'open-shop'): void }>();

const collapsed = ref(false);
const balance = ref('0');
const inventory = ref([
  { icon: 'local_cafe', label: '咖啡' },
  { icon: 'confirmation_number', label: '券' },
  { icon: 'inventory_2', label: '道具' },
  { icon: 'redeem', label: '礼物' },
  { icon: 'badge', label: '通行' },
  { icon: 'shield', label: '权限' },
]);

function tryReadBalance() {
  try {
    const message_id =
      typeof (window as any).getCurrentMessageId === 'function' ? (window as any).getCurrentMessageId() : 'latest';
    let stat: any = null;
    if (typeof (window as any).Mvu !== 'undefined' && (window as any).Mvu?.getMvuData) {
      const data = (window as any).Mvu.getMvuData({ type: 'message', message_id });
      stat = data?.stat_data || data;
    } else if (typeof (window as any).getVariables === 'function') {
      stat = (window as any).getVariables({ type: 'message', message_id });
    }
    if (!stat) return;
    const val =
      getNestedValue(stat, '系统状态.余额', null) ??
      getNestedValue(stat, '系统状态.资产', null) ??
      getNestedValue(stat, '经济系统.余额', null) ??
      null;
    if (val !== null && val !== undefined) {
      balance.value = String(val);
    }
  } catch {
    // ignore
  }
}

onMounted(() => {
  tryReadBalance();
});
</script>

<style scoped lang="scss">
.dock-shell {
  border-radius: 18px;
  border: 1px solid rgba(245, 158, 11, 0.25);
  background: rgba(15, 23, 42, 0.85);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #e2e8f0;
  box-shadow: 0 18px 36px rgba(2, 6, 23, 0.45);
  backdrop-filter: blur(12px);
}

.dock-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dock-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
}

.dock-toggle {
  border-radius: 999px;
  padding: 4px 8px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(2, 6, 23, 0.7);
  color: rgba(226, 232, 240, 0.8);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dock-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.balance-card {
  border-radius: 14px;
  border: 1px solid rgba(245, 158, 11, 0.3);
  background: rgba(2, 6, 23, 0.65);
  padding: 10px;
}

.balance-title {
  font-size: 11px;
  color: rgba(226, 232, 240, 0.6);
}

.balance-value {
  font-size: 18px;
  font-weight: 800;
  color: #fde68a;
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.inventory-item {
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.6);
  padding: 8px;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: rgba(226, 232, 240, 0.8);
}

.inventory-item i {
  color: #facc15;
}

.shop-btn {
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.85), rgba(217, 119, 6, 0.85));
  color: #111827;
  font-weight: 800;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
</style>
