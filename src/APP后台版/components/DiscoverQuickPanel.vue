<template>
  <div class="rounded-2xl border border-slate-700/50 bg-slate-950/40 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-sm font-bold text-slate-100">
        <span class="material-symbols-outlined text-violet-300">explore</span>
        {{ ui.discoverQuickPanel.title }}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          class="rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-1 text-xs text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
          @click="triggerImport"
        >
          {{ ui.discoverQuickPanel.actions.import }}
        </button>
        <button
          class="rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-1 text-xs text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
          @click="exportShops"
        >
          {{ ui.discoverQuickPanel.actions.export }}
        </button>
        <button
          class="rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-1 text-xs text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
          @click="openDiscover"
        >
          {{ ui.discoverQuickPanel.actions.open }}
        </button>
      </div>
    </div>

    <div class="mt-3 text-[11px] text-slate-400">
      {{ ui.discoverQuickPanel.hint }}
    </div>

    <div class="mt-4 space-y-2">
      <div
        v-if="shops.length === 0"
        class="rounded-xl border border-slate-700/50 bg-slate-900/30 p-3 text-xs text-slate-400"
      >
        {{ ui.discoverQuickPanel.empty }}
      </div>

      <button
        v-for="shop in shops"
        :key="shop.id || shop.shop_id"
        class="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-slate-900/30 px-3 py-2 text-left text-sm text-slate-200 hover:border-violet-500/30 hover:bg-slate-800/60"
        @click="pickShop(shop)"
      >
        <span class="min-w-0">
          <span class="block truncate font-semibold">{{ shop.shopname || shop.name || '未命名店铺' }}</span>
          <span class="block truncate text-[11px] text-slate-400">
            {{ (shop.shoptags || []).slice(0, 3).join(' / ') || ui.discoverQuickPanel.emptyTag }}
          </span>
        </span>
        <span class="shrink-0 text-[11px] text-slate-500">
          {{ Array.isArray(shop.packages) ? shop.packages.length : 0 }} {{ ui.discoverQuickPanel.packages }}
        </span>
      </button>
    </div>
  </div>

  <input ref="fileInput" class="hidden-input" type="file" accept=".json,application/json" @change="handleFileChange" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { shopStoreMvu, type AppShop } from '../shared/shopStoreMvu';
import { setSelectedPackageFromShop } from '../shared/selectedPackage';
import uiSpec from '../shared/ui-spec-for-designers.json';

const router = useRouter();
const shops = ref<AppShop[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const MAX_IMPORT_ITEMS = 200;
const MAX_IMPORT_SIZE_MB = 5;
const ui = uiSpec.uiTexts;

function loadShops() {
  shops.value = shopStoreMvu.getShops() || [];
}

const onShopCacheUpdated = () => {
  loadShops();
};

onMounted(() => {
  loadShops();
  window.addEventListener('shop:cache:updated', onShopCacheUpdated);
});

onUnmounted(() => {
  window.removeEventListener('shop:cache:updated', onShopCacheUpdated);
});

function openDiscover() {
  router.push('/discover');
}

function pickShop(shop: AppShop) {
  const pkg = Array.isArray((shop as any).packages) ? (shop as any).packages[0] : null;
  if (!pkg) {
    (window as any)?.toastr?.info?.('该店铺暂无套餐', '提示');
    return;
  }
  setSelectedPackageFromShop(shop, pkg);
  (window as any)?.toastr?.success?.('已选择该店铺的默认套餐', '已选中');
}

function triggerImport() {
  fileInput.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  if (file.size > MAX_IMPORT_SIZE_MB * 1024 * 1024) {
    (window as any)?.toastr?.error?.(`文件过大（>${MAX_IMPORT_SIZE_MB}MB）`, '导入失败');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || '');
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed?.店铺列表 || parsed?.shops || [];
      const safeList = Array.isArray(list) ? list.slice(0, MAX_IMPORT_ITEMS) : [];

      const { ok, saved } = shopStoreMvu.saveShops(safeList);
      if (!ok) {
        (window as any)?.toastr?.error?.('导入数据未通过校验（没有可写入的有效店铺）', '导入失败');
      } else {
        (window as any)?.toastr?.success?.(`导入成功，写入 ${saved} 条店铺`, '导入完成');
      }
      loadShops();
    } catch (err: any) {
      (window as any)?.toastr?.error?.(err?.message || '解析失败', '导入失败');
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file, 'utf-8');
}

function exportShops() {
  try {
    const raw = shopStoreMvu.getShops() || [];
    const cleaned = raw.map((shop: any) => {
      const { id: _id, packages, ...rest } = shop || {};
      const safePackages = Array.isArray(packages)
        ? packages.map((pkg: any) => {
            const { id: _pid, shop_id: _sid, ...pkgRest } = pkg || {};
            return pkgRest;
          })
        : [];
      return { ...rest, packages: safePackages };
    });
    const payload = { 店铺列表: cleaned };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `美人团_店铺导出_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: any) {
    (window as any)?.toastr?.error?.(err?.message || '导出失败', '导出失败');
  }
}
</script>

<style scoped lang="scss">
.hidden-input {
  display: none;
}
</style>
