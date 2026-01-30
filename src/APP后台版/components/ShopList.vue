<template>
  <div
    class="flex flex-col gap-4 rounded-2xl border border-green-500/20 bg-gradient-to-br from-slate-900/90 to-black/80 p-5 shadow-2xl shadow-green-500/10 backdrop-blur-xl"
  >
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 text-green-400">
          <span class="material-symbols-outlined">storefront</span>
        </div>
        <h3 class="text-lg font-bold tracking-wide text-white">{{ ui.marketplace.title }}</h3>
      </div>
      <span class="rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400/80"
        >{{ packageItems.length }} {{ ui.marketplace.packagesCount }}</span
      >
    </div>

    <!-- List -->
    <div class="space-y-3">
      <div
        v-for="item in packageItems"
        :key="item.key"
        class="group relative flex cursor-pointer items-center space-x-4 rounded-xl border bg-slate-800/20 p-3 transition-all duration-300 hover:translate-x-1 hover:bg-slate-800/60 hover:shadow-lg hover:shadow-green-500/10"
        :class="
          item.selected ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-slate-700/50 hover:border-green-500/50'
        "
        @click="select(item)"
      >
        <!-- Rank/Status Indicator (Optional) -->
        <div
          class="absolute top-4 bottom-4 -left-[1px] w-[3px] rounded-r bg-gradient-to-b from-green-500 to-emerald-600 opacity-0 transition-opacity group-hover:opacity-100"
          :class="item.selected ? 'opacity-100' : ''"
        ></div>

        <!-- Avatar -->
        <div class="relative shrink-0">
          <div
            class="h-12 w-12 overflow-hidden rounded-xl border-2 transition-colors"
            :class="item.selected ? 'border-blue-500/50' : 'border-slate-700 group-hover:border-green-500/50'"
          >
            <div class="flex h-full w-full items-center justify-center bg-slate-900/50 text-slate-100">
              <span class="material-symbols-outlined">{{ packageIcon(item.icon) }}</span>
            </div>
          </div>
          <div
            class="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-slate-700/50 bg-slate-950/60 px-2 py-0.5 text-[10px] text-slate-300 backdrop-blur"
          >
            {{ item.shopName }}
          </div>
        </div>

        <!-- Info -->
        <div class="min-w-0 flex-1 py-1">
          <div class="mb-1 flex items-center justify-between">
            <span class="truncate font-bold text-slate-200 transition-colors group-hover:text-white">{{
              item.pkgName
            }}</span>
            <span
              class="flex items-center space-x-1 rounded border border-green-500/20 bg-green-900/20 px-1.5 py-0.5 text-xs font-bold text-green-400"
            >
              <span class="material-symbols-outlined text-[14px]">currency_yen</span>
              <span>{{ item.price }}</span>
            </span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="truncate text-slate-500 transition-colors group-hover:text-slate-400">{{
              item.tagsText
            }}</span>
            <span class="text-slate-600 group-hover:text-slate-500">{{ item.starsText }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Action -->
    <button
      class="group flex w-full items-center justify-center space-x-2 rounded-xl border border-dashed border-slate-600 bg-transparent py-3 text-sm font-medium text-slate-400 transition-all hover:border-green-500/50 hover:bg-green-500/5 hover:text-green-400"
      @click="refreshData"
    >
      <span>{{ ui.marketplace.refresh }}</span>
      <span class="material-symbols-outlined transition-transform group-hover:translate-x-1">sync</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { shopStoreMvu } from '../shared/shopStoreMvu';
import { selectedPackage, setSelectedPackageFromShop, refreshSelectedPackageFromMvu } from '../shared/selectedPackage';
import uiSpec from '../shared/ui-spec-for-designers.json';

type PackageItem = {
  key: string;
  shop: any;
  pkg: any;
  shopName: string;
  pkgName: string;
  price: string;
  starsText: string;
  tagsText: string;
  icon?: string;
  selected: boolean;
};

const shops = ref<any[]>([]);
const ui = uiSpec.uiTexts;

function packageIcon(icon?: string) {
  const raw = String(icon || '').toLowerCase();
  if (raw.includes('user') || raw.includes('person')) return 'person';
  if (raw.includes('camera')) return 'photo_camera';
  if (raw.includes('tshirt') || raw.includes('shirt')) return 'checkroom';
  if (raw.includes('heart')) return 'favorite';
  if (raw.includes('gift')) return 'redeem';
  if (raw.includes('ticket')) return 'confirmation_number';
  if (raw.includes('box')) return 'inventory_2';
  if (raw.includes('store')) return 'storefront';
  return 'local_mall';
}

async function refreshData() {
  try {
    shops.value = shopStoreMvu.getShops() || [];
    refreshSelectedPackageFromMvu();
  } catch (e) {
    console.error('[ShopList] 获取店铺列表失败', e);
    shops.value = [];
  }
}

const packageItems = computed<PackageItem[]>(() => {
  const list: PackageItem[] = [];
  const current = selectedPackage.value;
  shops.value.forEach((shop: any, sIdx: number) => {
    const shopId = String(shop?.id ?? shop?.shop_id ?? sIdx);
    const shopName = String(shop?.shopname || shop?.name || '未命名店铺');
    const pkgs = Array.isArray(shop?.packages) ? shop.packages : [];
    pkgs.forEach((pkg: any, pIdx: number) => {
      const pkgId = String(pkg?.id ?? `${shopId}_pkg_${pIdx}`);
      const pkgName = String(pkg?.name || '未命名套餐');
      const tags = Array.isArray(pkg?.tags) ? pkg.tags : [];
      const stars = typeof pkg?.stars === 'number' ? pkg.stars : Number.parseFloat(String(pkg?.stars ?? '')) || 0;
      const priceRaw = pkg?.price ?? pkg?.套餐价格 ?? pkg?.折后价格 ?? 0;
      const price = typeof priceRaw === 'number' ? String(priceRaw) : String(priceRaw || '0');
      const selected = String(current?.id ?? '') === String(pkgId) && String(current?.shop_id ?? '') === String(shopId);
      list.push({
        key: `${shopId}__${pkgId}`,
        shop,
        pkg: { ...pkg, id: pkgId },
        shopName,
        pkgName,
        price,
        starsText: stars ? `${stars.toFixed(1)}★` : '—',
        tagsText: tags.length ? tags.slice(0, 3).join(' / ') : (pkg?.description || '').split('\n')[0] || '—',
        icon: pkg?.icon || undefined,
        selected,
      });
    });
  });
  return list;
});

function select(item: PackageItem) {
  setSelectedPackageFromShop(item.shop, item.pkg);
}

const onShopCacheUpdated = () => {
  void refreshData();
};

onMounted(() => {
  refreshData();
  window.addEventListener('shop:cache:updated', onShopCacheUpdated);
});

onUnmounted(() => {
  window.removeEventListener('shop:cache:updated', onShopCacheUpdated);
});
</script>
