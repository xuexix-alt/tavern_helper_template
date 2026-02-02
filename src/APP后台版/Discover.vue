<template>
  <div class="discover-screen">
    <header class="discover-header">
      <div class="header-top">
        <div class="page-title">
          <span class="material-symbols-outlined">explore</span>
          <div>
            <div class="title-text">{{ ui.pageTitles.discover }}</div>
            <div class="title-sub">{{ discoverSubtitle }}</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="ghost-pill" @click="triggerImport">
            <span class="material-symbols-outlined">upload_file</span>
            {{ ui.commonActions.import }}
          </button>
          <button class="ghost-pill" @click="goPlay">
            <span class="material-symbols-outlined">stadia_controller</span>
            {{ ui.commonActions.backPlay }}
          </button>
        </div>
      </div>

      <div class="search-shell">
        <div class="search-glow"></div>
        <div class="search-bar glass-panel">
          <span class="material-symbols-outlined accent">auto_fix_high</span>
          <input v-model="filterKeyword" :placeholder="ui.discoverPage.searchPlaceholder" />
          <button class="search-action" type="button">
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>

      <div class="chip-row hide-scrollbar">
        <button class="chip" :class="{ active: activeTag === 'all' }" @click="activeTag = 'all'">
          {{ ui.discoverPage.chipAll }}
        </button>
        <button
          v-for="chip in categoryChips"
          :key="chip.label"
          class="chip"
          :class="{ active: activeTag === chip.label }"
          @click="activeTag = chip.label"
        >
          {{ chip.label }}
        </button>
      </div>

      <div class="toolbar-row">
        <div class="toolbar-hint">{{ ui.discoverPage.hint }}</div>
        <div class="sort-control">
          <span class="sort-label">{{ ui.discoverPage.sortLabel }}</span>
          <select v-model="sortBy" class="sort-select">
            <option v-for="opt in ui.discoverPage.sortOptions" :key="opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>
    </header>

    <section class="discover-content">
      <div v-if="sortedShops.length === 0" class="empty-state">
        <span class="material-symbols-outlined">storefront</span>
        <p>{{ ui.discoverPage.emptyTitle }}</p>
        <button class="btn-primary" @click="goHome">
          <span class="material-symbols-outlined">home</span>
          {{ ui.discoverPage.emptyAction }}
        </button>
      </div>

      <div v-else class="shop-masonry">
        <div
          v-for="(shop, idx) in sortedShops"
          :key="shop.id || shop.shop_id || idx"
          class="shop-card glass-panel"
          @click="$router.push(`/shop/${shop.id || shop.shop_id || idx}`)"
        >
          <div class="shop-cover image-placeholder" :class="cardAspect(idx)"></div>
          <div class="shop-overlay"></div>
          <div class="shop-content">
            <div class="shop-head">
              <div class="shop-name">{{ shop.shopname || shop.name || '未命名店铺' }}</div>
              <div class="shop-rating">
                <span class="material-symbols-outlined fill">star</span>
                <span>{{ shopRating(shop, idx) }}</span>
              </div>
            </div>
            <div class="shop-tags">
              <span v-for="(tag, tIdx) in (shop.shoptags || []).slice(0, 3)" :key="tIdx" class="tag">
                {{ tag }}
              </span>
              <span v-if="(shop.shoptags || []).length === 0" class="tag muted">{{ ui.discoverPage.defaults.tag }}</span>
            </div>
            <div class="shop-meta">
              <span class="meta-item">{{ formatPlays(shopPlays(shop, idx)) }} 游玩</span>
              <span class="meta-item">{{ (shop.packages || []).length }} {{ ui.discoverPage.defaults.packageUnit }}</span>
            </div>
          </div>
          <button class="delete-btn" type="button" @click.stop="deleteShop(shop, idx)">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    </section>
  </div>
  <input ref="fileInput" class="hidden-input" type="file" accept=".json,application/json" @change="handleFileChange" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { shopStoreMvu } from './shared/shopStoreMvu';
import uiSpec from './shared/ui-spec-for-designers.json';

const shops = ref<any[]>([]);
const filterKeyword = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const MAX_IMPORT_ITEMS = 200;
const MAX_IMPORT_SIZE_MB = 5;
const router = useRouter();
const ui = uiSpec.uiTexts;
const activeTag = ref<'all' | string>('all');
const sortBy = ref(ui.discoverPage.sortOptions?.[0]?.id || 'recommended');

const filteredShops = computed(() => {
  const keyword = filterKeyword.value.trim().toLowerCase();
  const base = shops.value.filter(shop => {
    const name = String(shop?.shopname || shop?.name || '').toLowerCase();
    const tags = (shop?.shoptags || []).join(' ').toLowerCase();
    const hitKeyword = !keyword || name.includes(keyword) || tags.includes(keyword);
    const hitTag =
      activeTag.value === 'all' || (shop?.shoptags || []).some((tag: string) => tag === activeTag.value);
    return hitKeyword && hitTag;
  });
  return base;
});

const categoryChips = computed(() => ui.categoryButtons || []);

function getPackagesCount(shop: any) {
  return Array.isArray(shop?.packages) ? shop.packages.length : 0;
}

function parseTime(value: any) {
  if (!value) return 0;
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  const date = Date.parse(String(value));
  return Number.isFinite(date) ? date : 0;
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function shopKey(shop: any, idx: number) {
  return String(shop?.id ?? shop?.shop_id ?? shop?.name ?? idx);
}

function shopRating(shop: any, idx: number) {
  const score = 4.3 + (hashString(shopKey(shop, idx)) % 7) / 10;
  return score.toFixed(1);
}

function shopPlays(shop: any, idx: number) {
  return (hashString(shopKey(shop, idx)) % 3000) + getPackagesCount(shop) * 35;
}

function formatPlays(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
}

const aspectCycle = ['tall', 'square', 'wide'];
function cardAspect(index: number) {
  return `aspect-${aspectCycle[index % aspectCycle.length]}`;
}

const sortedShops = computed(() => {
  const list = [...filteredShops.value];
  const mode = sortBy.value;
  if (mode === 'packages') {
    return list.sort((a, b) => getPackagesCount(b) - getPackagesCount(a));
  }
  if (mode === 'newest') {
    return list.sort((a, b) => {
      const aTime = parseTime(a?.__savedAt || a?.updated_at || a?.created_at);
      const bTime = parseTime(b?.__savedAt || b?.updated_at || b?.created_at);
      if (aTime === bTime) return getPackagesCount(b) - getPackagesCount(a);
      return bTime - aTime;
    });
  }
  // recommended: 套餐数量 + 随机权重（稳定）
  return list.sort((a, b) => {
    const aKey = String(a?.id ?? a?.shop_id ?? a?.name ?? '');
    const bKey = String(b?.id ?? b?.shop_id ?? b?.name ?? '');
    const aScore = getPackagesCount(a) * 10 + (hashString(aKey) % 100);
    const bScore = getPackagesCount(b) * 10 + (hashString(bKey) % 100);
    return bScore - aScore;
  });
});

const discoverSubtitle = computed(() => {
  const raw = ui.pageTitles.discoverSubtitle || '';
  return raw.replace('X', String(sortedShops.value.length));
});

async function loadShops() {
  const data = await shopStoreMvu.getShops();
  shops.value = Array.isArray(data) ? data : [];
}

const onShopCacheUpdated = () => {
  void loadShops();
};

onMounted(async () => {
  await loadShops();
  window.addEventListener('shop:cache:updated', onShopCacheUpdated);
});

onUnmounted(() => {
  window.removeEventListener('shop:cache:updated', onShopCacheUpdated);
});

function deleteShop(shop: any, idx: number) {
  const id = String(shop?.id ?? shop?.shop_id ?? idx);
  shopStoreMvu.deleteShop(id);
  toastr.success('已删除并写回 MVU', '删除成功');
}

function triggerImport() {
  fileInput.value?.click();
}

function goPlay() {
  router.push('/play');
}

function goHome() {
  router.push('/home');
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  if (file.size > MAX_IMPORT_SIZE_MB * 1024 * 1024) {
    toastr.error(`文件过大（>${MAX_IMPORT_SIZE_MB}MB）`, '导入失败');
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
        toastr.error('导入数据未通过校验（没有可写入的有效店铺）', '导入失败');
      } else {
        toastr.success(`导入成功，写入 ${saved} 条店铺`, '导入完成');
      }
      void loadShops();
    } catch (err: any) {
      toastr.error(err?.message || '解析失败', '导入失败');
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file, 'utf-8');
}
</script>

<style lang="scss" scoped>
.discover-screen {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 20px 40px;
  color: #f8fafc;
}

.discover-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 8px;
  background: rgba(10, 12, 22, 0.8);
  backdrop-filter: blur(18px);
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title .material-symbols-outlined {
  color: rgba(167, 139, 250, 0.95);
}

.title-text {
  font-size: 18px;
  font-weight: 700;
}

.title-sub {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.85);
}

.header-actions {
  display: flex;
  gap: 10px;
}

.ghost-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
  font-size: 12px;
}

.search-shell {
  position: relative;
}

.search-glow {
  position: absolute;
  inset: -6px;
  border-radius: 18px;
  background: linear-gradient(120deg, rgba(127, 19, 236, 0.4), rgba(99, 102, 241, 0.15));
  filter: blur(16px);
  opacity: 0.4;
}

.search-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 50px;
  border-radius: 16px;
  padding: 0 12px;
}

.search-bar input {
  flex: 1;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 13px;
  outline: none;
}

.search-bar input::placeholder {
  color: rgba(148, 163, 184, 0.85);
}

.search-bar .accent {
  color: rgba(167, 139, 250, 0.95);
}

.search-action {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(127, 19, 236, 0.35);
  background: rgba(127, 19, 236, 0.2);
  color: #e9d5ff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chip-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(30, 20, 45, 0.7);
  color: rgba(203, 213, 225, 0.8);
  font-size: 12px;
  white-space: nowrap;
}

.chip.active {
  border-color: rgba(127, 19, 236, 0.5);
  background: rgba(127, 19, 236, 0.2);
  color: #fff;
  box-shadow: 0 0 14px rgba(127, 19, 236, 0.35);
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-hint {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.8);
}

.sort-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(203, 213, 225, 0.8);
}

.sort-select {
  background: rgba(15, 10, 30, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #e2e8f0;
  border-radius: 10px;
  padding: 4px 8px;
  font-size: 11px;
}

.discover-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.shop-masonry {
  columns: 2;
  column-gap: 14px;
}

.shop-card {
  position: relative;
  break-inside: avoid;
  margin-bottom: 14px;
  border-radius: 18px;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.shop-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 28px rgba(10, 10, 20, 0.35);
}

.shop-cover {
  width: 100%;
}

.shop-cover.aspect-tall {
  aspect-ratio: 3 / 5;
}

.shop-cover.aspect-square {
  aspect-ratio: 1 / 1;
}

.shop-cover.aspect-wide {
  aspect-ratio: 4 / 3;
}

.shop-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(10, 10, 22, 0.05), rgba(10, 10, 22, 0.78));
}

.shop-content {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.shop-name {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shop-rating {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #facc15;
  font-weight: 600;
}

.shop-rating .fill {
  font-variation-settings: 'FILL' 1, 'wght' 600, 'opsz' 18;
  font-size: 14px;
}

.shop-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(127, 19, 236, 0.2);
  color: rgba(216, 180, 254, 0.95);
}

.tag.muted {
  background: rgba(148, 163, 184, 0.2);
  color: rgba(226, 232, 240, 0.75);
}

.shop-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(203, 213, 225, 0.85);
}

.delete-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.2);
  color: #fecaca;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 12px;
  text-align: center;
  color: rgba(226, 232, 240, 0.7);
}

.btn-primary {
  border: none;
  border-radius: 999px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #7f13ec, #6c4bff);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  scrollbar-width: none;
}

.hidden-input {
  display: none;
}

@media (min-width: 960px) {
  .shop-masonry {
    columns: 3;
  }
}
</style>
