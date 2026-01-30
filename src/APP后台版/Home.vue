<template>
  <div class="home-screen">
    <header class="home-header">
      <div class="user-block">
        <div class="avatar avatar-placeholder"></div>
        <div class="user-text">
          <p class="welcome">{{ ui.brand.welcome }}</p>
          <h2 class="user-name">{{ ui.brand.userName }}</h2>
        </div>
      </div>
      <button class="icon-btn" type="button">
        <span class="material-symbols-outlined">notifications</span>
      </button>
    </header>

    <section class="hero-block">
      <h1 class="hero-title">
        {{ ui.homePage.hero.title }}
        <span class="hero-highlight">{{ ui.homePage.hero.highlight }}</span>
      </h1>
      <p class="hero-subtitle">{{ ui.homePage.hero.subtitle }}</p>
      <div class="hero-actions">
        <button class="btn-primary" @click="goPlay">
          <span class="material-symbols-outlined">rocket_launch</span>
          {{ ui.homePage.hero.primaryAction }}
        </button>
        <button class="btn-ghost" @click="goDiscover">
          <span class="material-symbols-outlined">explore</span>
          {{ ui.homePage.hero.secondaryAction }}
        </button>
      </div>
    </section>

    <section class="search-section">
      <div class="search-shell">
        <div class="search-glow"></div>
        <div class="search-bar glass-panel">
          <span class="material-symbols-outlined accent">auto_fix_high</span>
          <input
            v-model="searchKeyword"
            :placeholder="ui.homePage.commandCenter.placeholder"
            @keyup.enter="doSearch"
          />
          <button class="search-action" :disabled="loading" @click="doSearch">
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>
      <div class="quick-actions">
        <button class="ghost-pill" @click="triggerGenerate('生成-首页-熟人店铺2个-路人店铺2个')">
          <span class="material-symbols-outlined">auto_awesome</span>
          {{ ui.homePage.commandCenter.defaultGenerate }}
        </button>
        <button class="ghost-pill" @click="generateDLCContent">
          <span class="material-symbols-outlined">history_edu</span>
          {{ ui.homePage.commandCenter.specialProject }}
        </button>
        <button class="ghost-pill" @click="triggerGenerate('搜索：各类路人商品-2个店铺每个含3个套餐')">
          <span class="material-symbols-outlined">bolt</span>
          {{ ui.homePage.quickEntries.extraAction.label }}
        </button>
      </div>
    </section>

    <section class="style-section">
      <div class="section-head">
        <div>
          <div class="section-title">{{ ui.homePage.sections.stylesTitle }}</div>
          <div class="section-sub">{{ ui.homePage.sections.stylesSubtitle || ui.homePage.commandCenter.subtitle }}</div>
        </div>
        <button class="link-btn" type="button">{{ ui.homePage.sections.stylesAction }}</button>
      </div>
      <div class="chip-row hide-scrollbar">
        <button
          v-for="item in categories"
          :key="item.label"
          class="style-chip"
          @click="search(item.keyword)"
        >
          <span class="material-symbols-outlined">{{ categoryIcon(item.icon) }}</span>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </section>

    <section class="trend-section">
      <div class="section-head">
        <div>
          <div class="section-title">{{ ui.homePage.sections.trendingTitle }}</div>
          <div class="section-sub">{{ ui.homePage.sections.trendingSubtitle }}</div>
        </div>
      </div>
      <div class="trend-row hide-scrollbar">
        <article v-for="card in ui.homePage.trendingCards" :key="card.title" class="trend-card glass-panel">
          <div class="trend-media image-placeholder"></div>
          <div class="trend-overlay"></div>
          <div class="trend-content">
            <div class="trend-title">{{ card.title }}</div>
            <div class="trend-sub">{{ card.subtitle }}</div>
            <div class="trend-meta">
              <div class="rating">
                <span class="material-symbols-outlined fill">star</span>
                <span>{{ card.rating }}</span>
              </div>
              <span class="plays">{{ card.plays }} {{ ui.discoverPage.defaults.supportsPlay }}</span>
            </div>
            <button class="trend-cta" type="button" @click="goDiscover">
              {{ card.cta }}
              <span class="material-symbols-outlined">lock_open</span>
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="latest-section">
      <div class="section-head">
        <div>
          <div class="section-title">{{ ui.homePage.sections.latestTitle }}</div>
          <div class="section-sub">{{ ui.homePage.sections.latestSubtitle }}</div>
        </div>
      </div>
      <div class="latest-list">
        <div v-for="item in ui.homePage.latestItems" :key="item.title" class="latest-card glass-panel">
          <div class="latest-main">
            <span class="latest-tag">{{ item.tag }}</span>
            <div class="latest-title">{{ item.title }}</div>
            <div class="latest-desc">{{ item.desc }}</div>
          </div>
          <button class="latest-action" type="button" @click="goDiscover">
            {{ item.cta }}
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>
    </section>

    <section class="info-section">
      <div class="info-card glass-panel">
        <div class="info-title">{{ ui.homePage.notice.title }}</div>
        <div class="info-list">
          <div v-for="(item, idx) in ui.homePage.announcements.items" :key="`${item.tag}_${idx}`" class="info-item">
            <span class="info-tag">{{ item.tag }}</span>
            <span class="info-text">{{ item.text }}</span>
          </div>
        </div>
      </div>
      <div class="guide-card glass-panel">
        <div class="info-title">{{ ui.homePage.guide.title }}</div>
        <div class="guide-list">
          <div v-for="step in ui.homePage.guide.steps" :key="step.index" class="guide-item">
            <span class="guide-index">{{ step.index }}</span>
            <div>
              <div class="guide-title">{{ step.title }}</div>
              <div class="guide-desc">{{ step.desc }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { requestStreaming } from './utils';
import { ShopGenerationAdapter } from '../店铺生成Demo/utils/adapters/shop-generation';
import { InlineInteractionService } from '../店铺生成Demo/utils/core';
import uiSpec from './shared/ui-spec-for-designers.json';

const router = useRouter();
const ui = uiSpec.uiTexts;

const searchKeyword = ref('');
const loading = ref(false);

const categories = ui.categoryButtons || [];

const categoryIconMap: Record<string, string> = {
  'street-view': 'person_pin_circle',
  mask: 'masks',
  video: 'movie',
  'camera-retro': 'photo_camera',
  'user-friends': 'group',
  'heart-broken': 'heart_broken',
  briefcase: 'work',
  users: 'groups',
};

function categoryIcon(icon: string) {
  return categoryIconMap[icon] || 'auto_awesome';
}

const service = new InlineInteractionService();
const adapter = new ShopGenerationAdapter();

async function triggerGenerate(keyword: string) {
  if (!keyword.trim()) return;
  if (loading.value) return;
  loading.value = true;
  try {
    requestStreaming('shop');
    await service.execute(adapter, { keyword });
  } catch (e) {
    console.error('[Home] 执行生成失败', e);
  } finally {
    loading.value = false;
  }
}

function search(keyword: string) {
  triggerGenerate(`搜索：${keyword}`);
}

function doSearch() {
  if (searchKeyword.value.trim()) {
    search(searchKeyword.value.trim());
  }
}

function goPlay() {
  router.push('/play');
}

function goDiscover() {
  router.push('/discover');
}

function generateDLCContent() {
  const dlcMessage =
    '生成-首页-店铺列表：1个名为"组织部派来一个年轻人"。其中包含7个套餐，女孩名字分别是：1苏晴；2白慧；3丁小芹；4王春燕；5林婉仪；6秦舒澜；7藤原千惠。套餐内容严格按照设定。';
  triggerGenerate(dlcMessage);
}
</script>

<style lang="scss" scoped>
.home-screen {
  width: 100%;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 20px 40px;
  color: #f8fafc;
}

.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.user-block {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background-image: var(--avatar-placeholder);
  background-size: cover;
  background-position: center;
  border: 2px solid rgba(127, 19, 236, 0.3);
  box-shadow: 0 0 12px rgba(127, 19, 236, 0.2);
}

.user-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.welcome {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.user-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  border-color: rgba(127, 19, 236, 0.5);
  background: rgba(127, 19, 236, 0.15);
}

.hero-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero-title {
  margin: 0;
  font-size: 32px;
  line-height: 1.25;
  font-weight: 800;
}

.hero-highlight {
  display: block;
  background: linear-gradient(90deg, #7f13ec, #9d7bff, #6bc6ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  margin: 0;
  font-size: 13px;
  color: rgba(148, 163, 184, 0.9);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.btn-primary,
.btn-ghost {
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(135deg, #7f13ec, #6c4bff);
  color: #fff;
  box-shadow: 0 10px 20px rgba(127, 19, 236, 0.3);
}

.btn-ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.search-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-shell {
  position: relative;
}

.search-glow {
  position: absolute;
  inset: -6px;
  border-radius: 18px;
  background: linear-gradient(120deg, rgba(127, 19, 236, 0.35), rgba(99, 102, 241, 0.15));
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
  color: rgba(148, 163, 184, 0.8);
}

.search-bar .accent {
  color: rgba(167, 139, 250, 0.9);
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

.search-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ghost-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
}

.ghost-pill:hover {
  border-color: rgba(127, 19, 236, 0.45);
  color: #fff;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
}

.section-sub {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.85);
}

.link-btn {
  background: transparent;
  border: none;
  color: rgba(192, 132, 252, 0.95);
  font-size: 12px;
  font-weight: 600;
}

.chip-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.style-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(30, 20, 45, 0.7);
  color: rgba(226, 232, 240, 0.9);
  font-size: 13px;
  white-space: nowrap;
}

.style-chip:hover {
  border-color: rgba(127, 19, 236, 0.5);
  color: #fff;
}

.style-chip .material-symbols-outlined {
  font-size: 18px;
}

.trend-row {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 6px;
}

.trend-card {
  position: relative;
  width: 200px;
  border-radius: 18px;
  overflow: hidden;
  flex: 0 0 auto;
}

.trend-media {
  height: 220px;
}

.trend-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(10, 10, 22, 0.05), rgba(10, 10, 22, 0.75));
}

.trend-content {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.trend-title {
  font-size: 14px;
  font-weight: 700;
}

.trend-sub {
  font-size: 11px;
  color: rgba(203, 213, 225, 0.85);
}

.trend-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(203, 213, 225, 0.85);
}

.rating {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #facc15;
  font-weight: 600;
}

.rating .material-symbols-outlined.fill {
  font-variation-settings: 'FILL' 1, 'wght' 600, 'opsz' 18;
  font-size: 14px;
}

.trend-cta {
  align-self: flex-start;
  border: none;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #fff;
  background: rgba(127, 19, 236, 0.85);
}

.latest-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.latest-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
}

.latest-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  color: rgba(167, 139, 250, 0.95);
  background: rgba(127, 19, 236, 0.15);
  padding: 2px 8px;
  border-radius: 999px;
  margin-bottom: 6px;
}

.latest-title {
  font-size: 14px;
  font-weight: 700;
}

.latest-desc {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.85);
}

.latest-action {
  border: none;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: rgba(59, 130, 246, 0.2);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.info-section {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.info-card,
.guide-card {
  padding: 16px;
  border-radius: 18px;
}

.info-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.88);
}

.info-tag {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(127, 19, 236, 0.2);
  color: rgba(167, 139, 250, 0.95);
  font-size: 10px;
  font-weight: 600;
}

.guide-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.guide-item {
  display: flex;
  gap: 10px;
}

.guide-index {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: rgba(127, 19, 236, 0.2);
  color: rgba(167, 139, 250, 0.95);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 11px;
}

.guide-title {
  font-size: 13px;
  font-weight: 600;
}

.guide-desc {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.85);
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  scrollbar-width: none;
}

.hero-main,
.hero-guide {
  border-radius: 20px;
  padding: 18px;
  border: 1px solid rgba(59, 130, 246, 0.2);
  background: rgba(15, 23, 42, 0.85);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.35);
}

.brand-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 195, 0, 0.18);
  color: #fde68a;
  font-weight: 700;
  font-size: 12px;
}

.brand-version {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.8);
}

.hero-title {
  font-size: 26px;
  font-weight: 800;
  margin: 0 0 8px 0;
}

.hero-subtitle {
  font-size: 13px;
  color: rgba(226, 232, 240, 0.75);
  line-height: 1.6;
  margin: 0;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.btn-primary,
.btn-outline,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 14px;
  padding: 10px 14px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(139, 92, 246, 0.9));
  color: #ffffff;
  border-color: rgba(59, 130, 246, 0.4);
}

.btn-outline {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #e2e8f0;
}

.btn-ghost {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.hero-guide .guide-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 12px;
}

.guide-steps {
  display: grid;
  gap: 12px;
}

.guide-step {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.step-index {
  font-weight: 800;
  color: #93c5fd;
}

.step-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
}

.step-desc {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
}

.command-center {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.6fr);
}

@media (max-width: 900px) {
  .command-center {
    grid-template-columns: 1fr;
  }
}

.command-card {
  border-radius: 20px;
  padding: 16px;
  border: 1px solid rgba(59, 130, 246, 0.2);
  background: rgba(15, 23, 42, 0.85);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.command-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.command-title {
  font-size: 15px;
  font-weight: 700;
}

.command-desc {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.6);
}

.command-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(2, 6, 23, 0.6);
}

.search-row input {
  background: transparent;
  border: none;
  outline: none;
  color: #e2e8f0;
  font-size: 13px;
}

.quick-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.quick-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(2, 6, 23, 0.6);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.side-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.side-card {
  border-radius: 18px;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.8);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.3);
}

.card-title {
  font-size: 13px;
  font-weight: 700;
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.card-actions {
  display: grid;
  gap: 8px;
}

.notice-details summary {
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  list-style: none;
  padding: 8px 0;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.75);
}

.notice-details summary::-webkit-details-marker {
  display: none;
}

.notice-body {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.notice-item {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(226, 232, 240, 0.7);
}

.notice-item .tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 6px;
  margin-right: 6px;
  font-size: 10px;
  font-weight: 700;
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}
</style>
