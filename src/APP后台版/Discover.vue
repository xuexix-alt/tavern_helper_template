<template>
  <div class="discover-view">
    <header class="discover-hero">
      <div class="hero-left">
        <div class="hero-title">
          <i class="fas fa-compass"></i>
          发现店铺
        </div>
        <div class="hero-sub">共 {{ filteredShops.length }} 家店铺 · 数据来自世界书</div>
      </div>
      <div class="hero-actions">
        <button class="btn-outline" @click="triggerImport">
          <i class="fas fa-file-import"></i>
          导入 JSON
        </button>
        <button class="btn-ghost" @click="goPlay">
          <i class="fas fa-gamepad"></i>
          返回 Play
        </button>
      </div>
    </header>

    <section class="discover-toolbar">
      <div class="toolbar-search">
        <i class="fas fa-search"></i>
        <input v-model="filterKeyword" placeholder="筛选店铺名称 / 标签" />
      </div>
      <div class="toolbar-hint">
        点击店铺卡片进入详情，可在 Play 商城侧栏随时下单。
      </div>
    </section>

    <section class="discover-content">
      <div v-if="filteredShops.length === 0" class="empty-state">
        <i class="fas fa-store-slash"></i>
        <p>暂无店铺。请先在首页或 Play 中触发生成。</p>
        <button class="btn-primary" @click="goHome">
          <i class="fas fa-home"></i>
          去首页生成
        </button>
      </div>

      <div v-else class="shop-grid">
        <div
          v-for="(shop, idx) in filteredShops"
          :key="shop.id || shop.shop_id || idx"
          class="shop-card"
          @click="$router.push(`/shop/${shop.id || shop.shop_id || idx}`)"
        >
          <div class="shop-icon">
            <i
              v-if="(shop.packages || []).find((p: any) => p.icon)"
              :class="(shop.packages || []).find((p: any) => p.icon).icon"
            ></i>
            <i v-else class="fas fa-store"></i>
          </div>
          <div class="shop-info">
            <div class="shop-name">{{ shop.shopname || shop.name || '未命名店铺' }}</div>
            <div class="shop-tags">
              <span v-for="(tag, tIdx) in (shop.shoptags || []).slice(0, 4)" :key="tIdx" class="tag">
                {{ tag }}
              </span>
              <span v-if="(shop.shoptags || []).length === 0" class="tag muted">优质服务</span>
            </div>
            <div class="shop-meta">
              <span class="meta-item">
                <i class="fas fa-layer-group"></i>
                {{ (shop.packages || []).length }} 个套餐
              </span>
              <span class="meta-item">
                <i class="fas fa-scroll"></i>
                支持 Play 下单
              </span>
            </div>
          </div>
          <button class="delete-btn" @click.stop="deleteShop(shop, idx)">
            <i class="fas fa-trash"></i>
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

const shops = ref<any[]>([]);
const filterKeyword = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const MAX_IMPORT_ITEMS = 200;
const MAX_IMPORT_SIZE_MB = 5;
const router = useRouter();

const filteredShops = computed(() => {
  const keyword = filterKeyword.value.trim().toLowerCase();
  if (!keyword) return shops.value;
  return shops.value.filter(shop => {
    const name = String(shop?.shopname || shop?.name || '').toLowerCase();
    const tags = (shop?.shoptags || []).join(' ').toLowerCase();
    return name.includes(keyword) || tags.includes(keyword);
  });
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
.discover-view {
  width: 100%;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  background: radial-gradient(circle at top left, rgba(16, 185, 129, 0.18), transparent 50%),
    linear-gradient(135deg, rgba(2, 6, 23, 0.98), rgba(15, 23, 42, 0.96));
  color: #e2e8f0;
}

.discover-hero {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(16, 185, 129, 0.25);
  background: rgba(15, 23, 42, 0.85);
}

.hero-title {
  font-size: 18px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero-sub {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-outline,
.btn-ghost,
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 14px;
  padding: 8px 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
}

.btn-primary {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.8));
  border-color: rgba(16, 185, 129, 0.4);
  color: #ecfdf5;
}

.discover-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.toolbar-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(2, 6, 23, 0.65);
  min-width: min(280px, 100%);
}

.toolbar-search input {
  border: none;
  outline: none;
  background: transparent;
  color: #e2e8f0;
  font-size: 12px;
}

.toolbar-hint {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
}

.discover-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shop-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.shop-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.8);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.shop-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.35);
}

.shop-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(16, 185, 129, 0.15);
  color: #a7f3d0;
  font-size: 18px;
}

.shop-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.shop-name {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
}

.tag.muted {
  background: rgba(148, 163, 184, 0.15);
  color: rgba(226, 232, 240, 0.7);
}

.shop-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: rgba(226, 232, 240, 0.6);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.delete-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fecaca;
  border-radius: 10px;
  padding: 6px 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 12px;
  text-align: center;
  color: rgba(226, 232, 240, 0.6);
}

.hidden-input {
  display: none;
}
</style>
