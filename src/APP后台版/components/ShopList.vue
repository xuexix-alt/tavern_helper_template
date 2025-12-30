<template>
  <div class="rounded-2xl border border-green-500/20 bg-gradient-to-br from-slate-900/80 to-black/60 p-4 shadow-2xl shadow-green-500/10 backdrop-blur-xl">
    <div class="mb-4 flex items-center space-x-2">
      <i class="fas fa-store text-green-400"></i>
      <h3 class="text-white">Shop List</h3>
    </div>

    <div class="space-y-3">
      <div
        v-for="(shop, index) in shops"
        :key="index"
        class="flex items-center space-x-3 rounded-xl border border-transparent bg-slate-800/30 p-3 transition-all duration-300 hover:border-green-500/20 hover:bg-slate-800/50"
      >
        <div class="relative">
          <div class="h-10 w-10 overflow-hidden rounded-lg border border-green-400/20">
            <img :src="shop.avatar" :alt="shop.name" class="h-full w-full object-cover" />
          </div>
          <div v-if="index === 0" class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400">
            <i class="fas fa-crown text-[8px] text-black"></i>
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between">
            <span class="truncate text-sm text-white">{{ shop.name }}</span>
            <span class="flex items-center space-x-1 text-sm text-green-400">
              <i class="fas fa-yen-sign text-xs"></i>
              <span>{{ shop.price }}</span>
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-400">{{ shop.type }}</span>
            <span class="text-xs text-slate-500">{{ shop.time }}</span>
          </div>
        </div>
      </div>
    </div>

    <button class="mt-4 w-full rounded-xl border border-green-500/20 bg-gradient-to-r from-green-500/10 to-emerald-600/10 py-2 text-sm text-green-400 transition-all duration-300 hover:from-green-500/20 hover:to-emerald-600/20">
      View All Shops
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { loadOrdersFromMVU, filterActiveOrders } from '../shared/serviceOrders';
import { getNestedValue } from '../utils';

interface ShopItem {
  name: string;
  price: string;
  type: string;
  avatar: string;
  time: string;
}

const shops = ref<ShopItem[]>([]);

async function refreshData() {
  try {
    const orders = await loadOrdersFromMVU();
    // 这里简单地将活跃订单映射为"店铺列表"
    // 实际业务逻辑可能是 "可用店铺" 或 "历史订单"
    // 暂取前 5 个活跃订单展示
    const active = filterActiveOrders(orders).slice(0, 5);

    if (active.length > 0) {
      shops.value = active.map(o => ({
        name: getNestedValue(o, '基础信息.姓名', '未知'),
        price: getNestedValue(o, '套餐.套餐价格', '0'),
        type: getNestedValue(o, '套餐.商品类型', '服务'),
        avatar: 'https://via.placeholder.com/100', // 暂无真实头像源
        time: 'Just now' // 暂无时间字段
      }));
    } else {
      // 保持空数组或显示模拟数据
      shops.value = [];
    }
  } catch (e) {
    console.error('获取店铺列表失败', e);
  }
}

onMounted(() => {
  refreshData();
});
</script>
