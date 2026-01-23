<template>
  <div class="home-view">
    <header class="home-hero">
      <div class="hero-main">
        <div class="brand-row">
          <span class="brand-badge">
            <i class="fas fa-heart"></i>
            美人团外卖
          </span>
          <span class="brand-version">v3.0.0 后台版</span>
        </div>
        <h1 class="hero-title">一站式角色扮演入口</h1>
        <p class="hero-subtitle">从店铺生成到下单演绎，所有流程集中在 Play。首页负责引导和快速下发指令。</p>
        <div class="hero-actions">
          <button class="btn-primary" @click="goPlay">
            <i class="fas fa-gamepad"></i>
            进入 Play
          </button>
          <button class="btn-ghost" @click="goDiscover">
            <i class="fas fa-compass"></i>
            去发现
          </button>
        </div>
      </div>
      <div class="hero-guide">
        <div class="guide-title">三步快速开局</div>
        <div class="guide-steps">
          <div class="guide-step">
            <span class="step-index">01</span>
            <div>
              <div class="step-title">生成店铺</div>
              <div class="step-desc">从分类或搜索触发生成，写入世界书。</div>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-index">02</span>
            <div>
              <div class="step-title">挑选套餐</div>
              <div class="step-desc">在商场面板中浏览套餐详情并下单。</div>
            </div>
          </div>
          <div class="guide-step">
            <span class="step-index">03</span>
            <div>
              <div class="step-title">沉浸剧情</div>
              <div class="step-desc">Play 内生成正文，服务结束再回到商场。</div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <section class="home-section command-center">
      <div class="command-card">
        <div class="command-head">
          <div>
            <div class="command-title">指令中心</div>
            <div class="command-desc">输入关键词或直接点击分类，发起店铺/套餐生成。</div>
          </div>
          <div class="command-actions">
            <button class="btn-outline" @click="triggerGenerate('生成-首页-熟人店铺2个-路人店铺2个')">
              <i class="fas fa-wand-magic-sparkles"></i>
              默认生成
            </button>
            <button class="btn-outline" @click="generateDLCContent">
              <i class="fas fa-history"></i>
              DLC 专案
            </button>
          </div>
        </div>

        <div class="search-row">
          <i class="fas fa-search"></i>
          <input v-model="searchKeyword" placeholder="要养成告诉AI“结束XX订单”的好习惯" @keyup.enter="doSearch" />
          <button class="btn-primary" :disabled="loading" @click="doSearch">
            {{ loading ? '生成中...' : '搜索生成' }}
          </button>
        </div>

        <div class="quick-grid">
          <button v-for="item in categories" :key="item.label" class="quick-chip" @click="search(item.keyword)">
            <i :class="item.icon"></i>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>

      <div class="side-stack">
        <div class="side-card">
          <div class="card-title">
            <i class="fas fa-bolt"></i>
            快捷入口
          </div>
          <div class="card-actions">
            <button class="btn-ghost" @click="goPlay">
              <i class="fas fa-scroll"></i>
              进入正文
            </button>
            <button class="btn-ghost" @click="goDiscover">
              <i class="fas fa-store"></i>
              浏览店铺
            </button>
            <button class="btn-ghost" @click="triggerGenerate('搜索：各类路人商品-2个店铺每个含3个套餐')">
              <i class="fas fa-street-view"></i>
              一键路人
            </button>
          </div>
        </div>

        <div class="side-card">
          <div class="card-title">
            <i class="fas fa-bullhorn"></i>
            公告 / 玩法说明
          </div>
          <details class="notice-details">
            <summary>
              <span>展开详情</span>
              <i class="fas fa-chevron-down"></i>
            </summary>
            <div class="notice-body">
              <div class="notice-item">
                <span class="tag">活动</span>
                新增“国企往事”DLC，挂载世界书后点击即可
              </div>
              <div class="notice-item">
                <span class="tag">更新</span>
                现在店铺脚本有快捷按钮导出JSON，欢迎分享到发布贴中供大家品尝
              </div>
              <div class="notice-item">
                <span class="tag">更新</span>
                推荐非json格式的APP生成方式，深度0，顺序-1
              </div>
              <div class="notice-item">
                <span class="tag">提示</span>
                截断问题多出自预设和正则，保持模板一致性
              </div>
              <div class="notice-item">
                <span class="tag">玩法</span>
                女孩不想玩时向AI下指令“结束服务”
              </div>
            </div>
          </details>
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

const router = useRouter();

const searchKeyword = ref('');
const loading = ref(false);

const categories = [
  { label: '路人', icon: 'fas fa-street-view', keyword: '各类路人商品-2个店铺每个含3个套餐' },
  { label: '偶遇', icon: 'fas fa-mask', keyword: '路人商品-各类场景偶遇的心动女孩主题-2个店铺每个含3个套餐' },
  { label: 'AV', icon: 'fas fa-video', keyword: '路人商品-色情片中的AV女优主题-2个店铺每个含3个套餐' },
  { label: '街拍', icon: 'fas fa-camera-retro', keyword: '路人商品-街上遇到的心动美女主题-2个店铺每个含3个套餐' },
  { label: '熟人', icon: 'fas fa-user-friends', keyword: '各类熟人商品-2个店铺每个含3个套餐' },
  { label: '乱伦', icon: 'fas fa-heart-broken', keyword: '熟人商品-乱伦主题（不得含母子）-2个店铺每个含3个套餐' },
  { label: '职场', icon: 'fas fa-briefcase', keyword: '熟人商品-各类职场主题-2个店铺每个含3个套餐' },
  { label: '友妻', icon: 'fas fa-users', keyword: '熟人商品-各类朋友妻主题-2个店铺每个含3个套餐' },
];

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
.home-view {
  width: 100%;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 18px;
  background: radial-gradient(circle at top left, rgba(30, 58, 138, 0.25), transparent 50%),
    linear-gradient(135deg, rgba(2, 6, 23, 0.98), rgba(15, 23, 42, 0.96));
  color: #e2e8f0;
}

.home-hero {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  align-items: stretch;
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
