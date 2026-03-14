<template>
  <section class="ui-host-shell" :style="shellStyleVars">
    <header class="ui-topbar">
      <div class="ui-topbar-brand">
        <span class="ui-dot"></span>
        <span class="ui-brand-copy">EDEN-STAR</span>
      </div>

      <div class="ui-topbar-actions">
        <span class="ui-online">● 在线</span>

        <button
          type="button"
          class="ui-icon-btn"
          @click="
            closeUtilityDrawer();
            roleDrawerOpen = true;
          "
        >
          角色
        </button>

        <button type="button" class="ui-icon-btn" @click="settingsModalOpen = true">排版</button>
      </div>
    </header>

    <div class="ui-host-body">
      <transition name="sidebar-mask-fade">
        <div v-if="roleDrawerOpen" class="ui-sidebar-mask" @click="closeRoleDrawer"></div>
      </transition>

      <button
        type="button"
        class="ui-sidebar-toggle"
        :class="{ open: roleDrawerOpen }"
        @click="
          closeUtilityDrawer();
          roleDrawerOpen = !roleDrawerOpen;
        "
      >
        <span class="ui-sidebar-toggle-label">[ ROSTER ]</span>
      </button>

      <aside class="ui-sidebar" :class="{ open: roleDrawerOpen }">
        <div class="ui-sidebar-head">
          <div>
            <span class="demo-kicker">CHARACTER // SIDEBAR</span>
            <strong>角色&房间</strong>
          </div>
          <button type="button" class="ui-close-btn" @click="closeRoleDrawer">✕</button>
        </div>

        <div class="ui-sidebar-body">
          <MvuRolePanel
            :transcript-items="transcript"
            :active-character-key="activeRoleKey"
            @select-character="handleRoleSelect"
            @roster-change="handleRosterChange"
            @collapse="closeRoleDrawer"
          />
        </div>
      </aside>

      <main class="ui-main-panel">
        <section class="ui-transcript-panel">
          <div class="ui-transcript-stage">
            <TranscriptList
              ref="transcriptListRef"
              :items="visibleTranscript"
              :density="density"
              :font-mode="fontMode"
              :busy="busy"
              :should-follow-latest="followLatest"
              :opening-expanded="openingExpanded"
              :latest-user-message-id="latestUserItem?.message_id ?? null"
              :editing-user-message-id="editingUserMessageId"
              :editing-user-draft="editingUserDraft"
              :rollback-confirm-message-id="rollbackConfirmMessageId"
              :swipe-message-id="latestAssistantSwipeMessageId"
              :swipe-label="latestAssistantSwipeLabel"
              :can-swipe-prev="canSwipeLatestAssistantPrev"
              :can-swipe-next="canSwipeLatestAssistantNext"
              @open-detail="openDetail"
              @reading-mode-change="setReadingMode"
              @toggle-opening="toggleOpeningExpanded"
              @reroll-opening="rerollOpening"
              @start-edit-user="startInlineEdit"
              @update-edit-draft="setEditingUserDraft"
              @confirm-edit-user="confirmInlineEditRegenerate"
              @cancel-edit-user="cancelInlineEdit"
              @request-rollback="requestRollbackDelete"
              @confirm-rollback="confirmRollbackDelete"
              @cancel-rollback="cancelRollbackDelete"
              @swipe-assistant="swipeLatestAssistant"
            />
          </div>
        </section>

        <section class="ui-bottom-dock">
          <transition name="utility-mask-fade">
            <div v-if="activeUtilityDrawer" class="ui-utility-mask" @click="closeUtilityDrawer"></div>
          </transition>

          <div class="ui-bottom-tools">
            <transition name="utility-drawer-rise">
              <section
                v-if="activeUtilityDrawer"
                class="ui-bottom-drawer clip-corner"
                :class="`is-${activeUtilityDrawer}`"
              >
                <header class="ui-bottom-drawer-head">
                  <div class="ui-bottom-drawer-head-copy">
                    <span class="demo-kicker">{{ activeUtilityMeta.eyebrow }}</span>
                    <strong>{{ activeUtilityMeta.title }}</strong>
                    <p>{{ activeUtilityMeta.subtitle }}</p>
                    <div class="ui-drawer-pills">
                      <span v-for="pill in activeUtilityPills" :key="pill.label" class="ui-drawer-pill clip-corner-sm">
                        <small>{{ pill.label }}</small>
                        <strong>{{ pill.value }}</strong>
                      </span>
                    </div>
                  </div>
                  <button type="button" class="ui-close-btn inline" @click="closeUtilityDrawer">✕</button>
                </header>

                <div class="ui-bottom-drawer-body" :class="`is-${activeUtilityDrawer}`">
                  <WorkbenchTabs
                    v-if="activeUtilityDrawer === 'system'"
                    :logs="logs"
                    :busy="busy"
                    :transcript-total="transcriptStats.total"
                    :assistant-count="transcriptStats.assistant"
                    :latest-swipe-label="latestAssistantSwipeLabel"
                  />
                  <MapBusinessPanel v-else-if="activeUtilityDrawer === 'map'" />
                </div>
              </section>
            </transition>

            <div class="ui-bottom-tool-row">
              <button
                type="button"
                class="ui-signal-btn"
                :class="{ active: activeUtilityDrawer === 'system' }"
                @click="toggleUtilityDrawer('system')"
              >
                <span>系统</span>
                <span class="ui-bars">
                  <i v-for="i in 8" :key="`log-${i}`" :class="{ active: i <= 5 }"></i>
                </span>
              </button>

              <button
                type="button"
                class="ui-signal-btn"
                :class="{ active: activeUtilityDrawer === 'map' }"
                @click="toggleUtilityDrawer('map')"
              >
                <span>地图</span>
                <span class="ui-bars">
                  <i v-for="i in 8" :key="`map-${i}`" :class="{ active: i <= 3 }"></i>
                </span>
              </button>

              <button
                type="button"
                class="ui-signal-btn"
                :disabled="(latestAssistantItem?.options ?? []).length === 0"
                @click="openChoiceModalFromToolbar"
              >
                <span>选项</span>
                <span class="ui-bars">
                  <i
                    v-for="i in 4"
                    :key="`choice-${i}`"
                    :class="{ active: i <= ((latestAssistantItem?.options ?? []).length || 0) }"
                  ></i>
                </span>
              </button>

              <button
                type="button"
                class="ui-signal-btn ui-tool-desktop-only"
                :disabled="busy || !latestUserItem"
                @click="rollLatestTurn"
              >
                <span>RE-SYNC</span>
              </button>
            </div>
          </div>

          <BottomComposer
            ref="composerRef"
            v-model="input"
            :busy="busy"
            :can-roll="Boolean(latestUserItem)"
            :desktop-tool-row-mode="true"
            :choice-options="latestAssistantItem?.options ?? []"
            :role-tabs="visibleRoleTabs"
            :active-role-key="activeRoleKey"
            :show-option-trigger="false"
            :show-toolbar="false"
            @submit="runDemo"
            @roll="rollLatestTurn"
            @swipe="swipeLatestAssistant"
            @open-role="openRoleFromComposer"
          />
        </section>
      </main>
    </div>

    <RadialQuickMenu :items="visibleRoleTabs" :active-key="activeRoleKey" @select="openRoleFromComposer" />

    <HudModal
      :open="componentLibraryOpen"
      title="UI 组件库 V2.0"
      subtitle="这里不是展示页，而是迁移时可直接复用的表单、进度、告警、确认组件仓。"
      variant="library"
      icon="◫"
      eyebrow="LIBRARY // COMPONENTS"
      wide
      @close="componentLibraryOpen = false"
    >
      <ComponentLibraryPanel />
    </HudModal>

    <HudModal
      :open="settingsModalOpen"
      title="阅读与排版设置"
      subtitle="细调主题、字体、密度与阅读跳转。"
      variant="typography"
      icon="T"
      eyebrow="TYPE // SETTINGS"
      @close="settingsModalOpen = false"
    >
      <TopToolbar
        v-model:theme="theme"
        v-model:filter-mode="filterMode"
        v-model:density="density"
        v-model:font-mode="fontMode"
        :total-count="transcriptStats.total"
        :latest-user-preview="readerSummary.latestUserPreview"
        :at-latest="followLatest"
        :is-browsing-history="readingMode === 'browsing_history'"
        @jump-latest="jumpLatest"
      />
    </HudModal>

    <HudModal
      :open="openingModalOpen || shouldShowOpeningSetup"
      title="世界观自定义 / Opening Start"
      subtitle="这选择你喜欢的开局，包含外界环境和主流玩法，也可以在<补充设定>那里补充一些世界观细节。"
      variant="workspace"
      :icon-src="openingModalIcon"
      icon-alt="故事开始"
      eyebrow="故事开始"
      wide
      @close="closeOpeningModal"
    >
      <OpeningSetupPanel
        :preset="openingPreset"
        :payload="openingPayload"
        :busy="busy"
        :world-modes="openingWorldModes"
        :routes="openingRoutes"
        @update-meta="updateOpeningMeta"
        @update-field="updateOpeningField"
        @update-world-mode="updateOpeningWorldMode"
        @update-route="updateOpeningRoute"
        @update-stream="updateOpeningStream"
        @submit="handleOpeningSubmit"
      />
    </HudModal>

    <MessageDetailModal :item="selectedItem" @close="closeDetail" />
  </section>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';

import BottomComposer from '../components/BottomComposer.vue';
import ComponentLibraryPanel from '../components/ComponentLibraryPanel.vue';
import HudModal from '../components/HudModal.vue';
import MessageDetailModal from '../components/MessageDetailModal.vue';
import MvuRolePanel from '../components/MvuRolePanel.vue';
import OpeningSetupPanel from '../components/OpeningSetupPanel.vue';
import RadialQuickMenu from '../components/RadialQuickMenu.vue';
import MapBusinessPanel from '../components/MapBusinessPanel.vue';
import TopToolbar from '../components/TopToolbar.vue';
import TranscriptList from '../components/TranscriptList.vue';
import WorkbenchTabs from '../components/WorkbenchTabs.vue';
import openingModalIcon from '../assets/opening-modal-icon.png?url';
import { useStreamingDemo } from '../useStreamingDemo';

const {
  input,
  busy,
  filterMode,
  density,
  theme,
  fontMode,
  readingMode,
  followLatest,
  openingExpanded,
  selectedItem,
  transcript,
  visibleTranscript,
  transcriptStats,
  latestUserItem,
  latestAssistantItem,
  readerSummary,
  logs,
  editingUserMessageId,
  editingUserDraft,
  rollbackConfirmMessageId,
  latestAssistantSwipeMessageId,
  canSwipeLatestAssistantPrev,
  canSwipeLatestAssistantNext,
  latestAssistantSwipeLabel,
  openingPreset,
  openingPayload,
  openingWorldModes,
  openingRoutes,
  shouldShowOpeningSetup,
  runDemo,
  rollLatestTurn,
  updateOpeningMeta,
  updateOpeningField,
  updateOpeningWorldMode,
  updateOpeningRoute,
  updateOpeningStream,
  generateOpening,
  rerollOpening,
  startInlineEdit,
  setEditingUserDraft,
  cancelInlineEdit,
  confirmInlineEditRegenerate,
  requestRollbackDelete,
  cancelRollbackDelete,
  confirmRollbackDelete,
  swipeLatestAssistant,
  setReadingMode,
  toggleOpeningExpanded,
  openDetail,
  closeDetail,
} = useStreamingDemo();

const transcriptListRef = ref<InstanceType<typeof TranscriptList> | null>(null);
const composerRef = ref<InstanceType<typeof BottomComposer> | null>(null);
const readerShellHeight = ref('720px');
const roleDrawerOpen = ref(false);
const settingsModalOpen = ref(false);
const openingModalOpen = ref(false);
const componentLibraryOpen = ref(false);
const activeUtilityDrawer = ref<'system' | 'map' | null>(null);
type RoleTabItem = { key: string; label: string; statusClass?: string; statusText?: string };

const roleTabs = ref<RoleTabItem[]>([]);
const activeRoleKey = ref<string | null>(null);
const visibleRoleTabs = computed(() =>
  roleTabs.value.filter(role => role.statusText === '登场' || role.statusClass === 'status-active'),
);

const activeUtilityMeta = computed(() => {
  if (activeUtilityDrawer.value === 'map') {
    return {
      title: '战术地图',
      subtitle: '先看庇护所态势，再向下查看区域与房间。',
      eyebrow: 'MAP // TACTICAL',
    };
  }

  return {
    title: '系统 TAB',
    subtitle: '压缩展示日志、状态和关键工作台指标。',
    eyebrow: 'TASKS // SYSTEM',
  };
});

const activeUtilityPills = computed(() => {
  if (activeUtilityDrawer.value === 'map') {
    return [
      { label: '登场角色', value: `${visibleRoleTabs.value.length}` },
      { label: '楼层总数', value: `${transcriptStats.value.total}` },
      { label: '阅读模式', value: followLatest.value ? '跟随最新' : '浏览历史' },
    ];
  }

  return [
    { label: '日志', value: `${logs.value.length}` },
    { label: '楼层', value: `${transcriptStats.value.total}` },
    { label: 'Swipe', value: latestAssistantSwipeLabel.value || '1/1' },
  ];
});

const shellStyleVars = computed(() => ({
  '--reader-shell-height': readerShellHeight.value,
}));

function readHostViewportHeight() {
  const candidates: number[] = [];

  const push = (value: unknown) => {
    const numeric = Math.trunc(Number(value));
    if (Number.isFinite(numeric) && numeric > 0) candidates.push(numeric);
  };

  try {
    push(window.top?.visualViewport?.height);
  } catch {
    // ignore
  }

  try {
    push(window.parent?.visualViewport?.height);
  } catch {
    // ignore
  }

  try {
    push(window.visualViewport?.height);
  } catch {
    // ignore
  }

  try {
    push(window.top?.innerHeight);
  } catch {
    // ignore
  }

  try {
    push(window.parent?.innerHeight);
  } catch {
    // ignore
  }

  push(window.innerHeight);

  return candidates[0] ?? 0;
}

function updateReaderShellHeight() {
  if (typeof window === 'undefined') return;
  const viewportHeight = readHostViewportHeight();
  const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 900;
  const shellPadding = safeViewportHeight < 720 ? 8 : 16;
  const targetHeight = Math.max(520, safeViewportHeight - shellPadding);
  readerShellHeight.value = `${targetHeight}px`;
}

function jumpLatest() {
  transcriptListRef.value?.scrollToLatest?.();
}

function closeRoleDrawer() {
  roleDrawerOpen.value = false;
}

function toggleUtilityDrawer(type: 'system' | 'map') {
  roleDrawerOpen.value = false;
  activeUtilityDrawer.value = activeUtilityDrawer.value === type ? null : type;
}

function closeUtilityDrawer() {
  activeUtilityDrawer.value = null;
}

function handleRosterChange(roles: RoleTabItem[]) {
  roleTabs.value = roles;
  const visibleRoles = roles.filter(role => role.statusText === '登场' || role.statusClass === 'status-active');
  if (!activeRoleKey.value && visibleRoles[0]) activeRoleKey.value = visibleRoles[0].key;
  if (activeRoleKey.value && !visibleRoles.some(role => role.key === activeRoleKey.value)) {
    activeRoleKey.value = visibleRoles[0]?.key ?? null;
  }
}

function handleRoleSelect(key: string) {
  activeRoleKey.value = key;
}

function openRoleFromComposer(key: string) {
  activeRoleKey.value = key;
  closeUtilityDrawer();
  roleDrawerOpen.value = true;
}

async function handleOpeningSubmit() {
  openingModalOpen.value = false;
  await generateOpening();
}

function closeOpeningModal() {
  if (shouldShowOpeningSetup.value) return;
  openingModalOpen.value = false;
}

function openChoiceModalFromToolbar() {
  composerRef.value?.openChoiceModal?.();
}

onMounted(() => {
  updateReaderShellHeight();
});

useEventListener(window, 'resize', updateReaderShellHeight, { passive: true });

if (typeof window !== 'undefined' && window.visualViewport) {
  useEventListener(window.visualViewport, 'resize', updateReaderShellHeight, { passive: true });
  useEventListener(window.visualViewport, 'scroll', updateReaderShellHeight, { passive: true });
}

useEventListener(window, 'keydown', event => {
  if (event.key !== 'Escape') return;
  if (roleDrawerOpen.value) roleDrawerOpen.value = false;
  else if (activeUtilityDrawer.value) activeUtilityDrawer.value = null;
  else if (componentLibraryOpen.value) componentLibraryOpen.value = false;
  else if (openingModalOpen.value) openingModalOpen.value = false;
  else if (settingsModalOpen.value) settingsModalOpen.value = false;
});
</script>

<style scoped>
.ui-host-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: var(--reader-shell-height, 720px);
  max-height: var(--reader-shell-height, 720px);
  min-height: 360px;
  overflow: hidden;
}

.ui-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--background) 74%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.ui-topbar-brand,
.ui-topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ui-topbar-actions {
  margin-left: auto;
  justify-content: flex-end;
}

.ui-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 12px color-mix(in srgb, var(--primary) 70%, transparent);
}

.ui-brand-copy,
.ui-online,
.ui-chip,
.ui-icon-btn,
.ui-signal-btn,
.ui-meta-pill,
.ui-floating-trigger {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.ui-brand-copy {
  color: var(--demo-text-accent);
}

.ui-online {
  color: var(--demo-text-secondary);
}

.ui-signal-btn,
.ui-icon-btn,
.ui-chip,
.ui-meta-pill {
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 32%, transparent);
  color: var(--demo-text-primary);
}

.ui-signal-btn,
.ui-icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 12px;
}
.ui-signal-btn.active {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
}

.ui-bars {
  display: inline-flex;
  gap: 3px;
}

.ui-bars i {
  display: inline-block;
  width: 3px;
  height: 11px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 22%, transparent);
}

.ui-bars i.active {
  background: color-mix(in srgb, var(--primary) 78%, transparent);
}

.ui-meta-pill.action:not(:disabled) {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
}

.ui-host-body {
  position: relative;
  display: flex;
  align-items: stretch;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.ui-sidebar {
  position: absolute;
  display: flex;
  flex-direction: column;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 25;
  width: 320px;
  border-right: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--background) 72%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow:
    10px 0 34px color-mix(in srgb, var(--shadow-color) 88%, transparent),
    inset -1px 0 0 color-mix(in srgb, var(--primary) 12%, transparent);
  transform: translateX(-100%);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
}

.ui-sidebar.open {
  transform: translateX(0);
}

.ui-sidebar-toggle {
  position: absolute;
  left: 0;
  top: 18px;
  transform: none;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 108px;
  border: 1px solid var(--demo-border-accent-soft);
  border-left: 0;
  background: color-mix(in srgb, var(--background) 68%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  color: var(--demo-text-accent);
  box-shadow:
    6px 0 18px color-mix(in srgb, var(--shadow-color) 68%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--primary) 10%, transparent);
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.ui-sidebar-toggle:hover {
  background: color-mix(in srgb, var(--primary) 10%, var(--background) 90%);
  box-shadow:
    8px 0 22px color-mix(in srgb, var(--shadow-color) 78%, transparent),
    0 0 18px color-mix(in srgb, var(--primary) 14%, transparent);
}

.ui-sidebar-toggle.open {
  transform: translateX(320px);
}

.ui-sidebar-toggle-label {
  position: absolute;
  right: -32px;
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--demo-text-accent) 56%, transparent);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  text-shadow: 0 0 10px color-mix(in srgb, var(--primary) 18%, transparent);
}

.ui-sidebar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 14px 12px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}

.ui-sidebar-head strong {
  display: block;
  margin-top: 6px;
  font-size: 16px;
}

.ui-close-btn {
  display: none;
  width: 34px;
  aspect-ratio: 1;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  color: var(--demo-text-primary);
}

.ui-sidebar-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.ui-main-panel {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ui-transcript-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 14px;
  overflow: hidden;
}

.ui-transcript-stage {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.ui-transcript-stage :deep(.transcript-card) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.ui-transcript-stage :deep(.transcript-scroller) {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
}

.ui-bottom-dock {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 14px;
  position: relative;
  z-index: 5;
}

.ui-bottom-tools {
  position: relative;
  z-index: 16;
}

.ui-bottom-tool-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: fit-content;
  margin: 0 auto;
  max-width: 100%;
  padding: 8px 10px;
  border-radius: 18px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  box-shadow: 0 10px 26px color-mix(in srgb, var(--shadow-color) 40%, transparent);
}

.ui-tool-desktop-only {
  display: inline-flex;
}

.ui-bottom-drawer {
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  width: min(100%, 56rem);
  max-height: min(72vh, 42rem);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 84%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow:
    0 -10px 34px color-mix(in srgb, var(--shadow-color) 72%, transparent),
    0 0 0 1px color-mix(in srgb, var(--primary) 10%, transparent);
}

.ui-bottom-drawer.is-map {
  width: min(100%, 72rem);
}

.ui-bottom-drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}

.ui-bottom-drawer-head-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.ui-bottom-drawer-head strong {
  display: block;
  margin-top: 4px;
  font-size: 15px;
}

.ui-bottom-drawer-head p {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--demo-text-secondary);
}

.ui-drawer-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ui-drawer-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
}

.ui-drawer-pill small,
.ui-drawer-pill strong {
  font-family: var(--demo-font-mono);
}

.ui-drawer-pill small {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
}

.ui-drawer-pill strong {
  font-size: 12px;
  color: var(--demo-text-accent);
}

.ui-bottom-drawer-body {
  min-height: 0;
  overflow: auto;
  padding: 12px 14px 14px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 18%, transparent), transparent);
}

.ui-bottom-drawer-body.is-map {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 22%, transparent), transparent),
    linear-gradient(to right, color-mix(in srgb, var(--border) 14%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--border) 14%, transparent) 1px, transparent 1px);
  background-size:
    auto,
    48px 48px,
    48px 48px;
}

.ui-bottom-drawer-body.is-map :deep(#shelter-section) {
  background: transparent;
  padding: 0;
}

.ui-bottom-drawer-body.is-map :deep(#shelter-section > .section-title) {
  display: none;
}

.ui-bottom-drawer-body.is-map :deep(.shelter-grid) {
  gap: 18px;
}

.ui-bottom-drawer-body.is-map :deep(.shelter-item),
.ui-bottom-drawer-body.is-map :deep(.map-zone),
.ui-bottom-drawer-body.is-map :deep(.floor-zone),
.ui-bottom-drawer-body.is-map :deep(.expansion-card),
.ui-bottom-drawer-body.is-map :deep(.room-cell) {
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.ui-bottom-drawer-body.is-map :deep(.map-container),
.ui-bottom-drawer-body.is-map :deep(.floor-zone),
.ui-bottom-drawer-body.is-map :deep(.map-zone) {
  border-color: color-mix(in srgb, var(--primary) 28%, transparent);
}

.ui-close-btn.inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ui-sidebar-mask {
  position: fixed;
  inset: 0;
  z-index: 24;
  background: color-mix(in srgb, black 42%, transparent);
}

.ui-utility-mask {
  position: fixed;
  inset: 0;
  z-index: 14;
  background: color-mix(in srgb, black 26%, transparent);
}

.sidebar-mask-fade-enter-active,
.sidebar-mask-fade-leave-active,
.utility-mask-fade-enter-active,
.utility-mask-fade-leave-active {
  transition: opacity 0.18s ease;
}

.sidebar-mask-fade-enter-from,
.sidebar-mask-fade-leave-to,
.utility-mask-fade-enter-from,
.utility-mask-fade-leave-to {
  opacity: 0;
}

.utility-drawer-rise-enter-active,
.utility-drawer-rise-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.24s ease;
}

.utility-drawer-rise-enter-from,
.utility-drawer-rise-leave-to {
  opacity: 0;
  transform: translateY(14px);
}

:deep(.transcript-card) {
  min-height: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

:deep(.transcript-headbar) {
  display: none;
}

:deep(.transcript-scroller) {
  max-height: none;
  padding: 0;
}

:deep(.composer-card) {
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface) 24%, transparent);
}

@media (max-width: 1100px) {
  .ui-topbar {
    flex-wrap: wrap;
  }

  .ui-sidebar {
    position: fixed;
    top: 58px;
    left: 0;
    bottom: 0;
    z-index: 25;
    box-shadow: 14px 0 34px color-mix(in srgb, var(--shadow-color) 82%, transparent);
  }

  .ui-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

@media (max-width: 760px) {
  .ui-host-body {
    padding-left: 14px;
  }

  .ui-topbar,
  .ui-transcript-panel,
  .ui-bottom-dock {
    padding-left: 6px;
    padding-right: 6px;
  }

  .ui-bottom-dock {
    padding-bottom: 8px;
    gap: 6px;
  }

  .ui-topbar {
    gap: 8px;
    padding: 8px 10px;
  }

  .ui-topbar-actions {
    display: none;
  }

  .ui-online {
    display: none;
  }

  .ui-icon-btn {
    min-height: 30px;
    padding: 0 10px;
    font-size: 10px;
  }

  .ui-bottom-tool-row {
    width: 100%;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 14px;
  }

  .ui-tool-desktop-only {
    display: none;
  }

  .ui-bottom-tool-row {
    padding: 4px 6px;
    gap: 4px;
  }

  .ui-bottom-tool-row .ui-signal-btn {
    flex: 1 1 0;
    justify-content: center;
    min-height: 28px;
    padding: 0 6px;
    gap: 4px;
    font-size: 10px;
  }

  .ui-bottom-tool-row .ui-signal-btn .ui-bars {
    display: inline-flex;
  }

  .ui-bottom-tool-row .ui-signal-btn .ui-bars i {
    width: 3px;
    height: 8px;
  }

  .ui-bottom-drawer {
    left: 0;
    right: 0;
    width: 100%;
    bottom: calc(100% + 6px);
    max-height: calc(100dvh - 110px);
    border-radius: 18px 18px 12px 12px;
  }

  .ui-bottom-drawer.is-map {
    max-height: calc(100dvh - 96px);
  }

  .ui-bottom-drawer-head {
    padding: 10px 12px 8px;
    gap: 8px;
  }

  .ui-bottom-drawer-head strong {
    margin-top: 4px;
    font-size: 14px;
  }

  .ui-bottom-drawer-head p {
    margin-top: 3px;
    font-size: 11px;
    line-height: 1.4;
  }

  .ui-bottom-drawer.is-map .ui-bottom-drawer-head p {
    display: none;
  }

  .ui-bottom-drawer-body {
    padding: 10px 12px 12px;
  }

  .ui-bottom-drawer-body.is-map {
    padding: 8px 10px 10px;
  }

  .ui-sidebar {
    top: auto;
    width: calc(100% - 12px);
    left: 6px;
    right: 6px;
    bottom: 6px;
    max-height: calc(100dvh - 64px);
    border-radius: 22px;
    transform: translateY(100%);
  }

  .ui-sidebar.open {
    transform: translateY(0);
  }

  .ui-sidebar-head {
    gap: 8px;
    padding: 10px 10px 8px;
  }

  .ui-sidebar-head strong {
    margin-top: 2px;
    font-size: 13px;
  }

  .ui-sidebar-body {
    padding: 8px;
  }

  .ui-sidebar-toggle {
    position: fixed;
    top: 58px;
    left: 0;
    width: 28px;
    height: 112px;
    min-height: 112px;
    padding: 0;
    border-radius: 0 14px 14px 0;
    border-top: 0;
    z-index: 32;
    transform: none;
  }

  .ui-sidebar-toggle.open {
    transform: none;
  }

  .ui-sidebar-toggle-label {
    display: block;
    position: static;
    right: auto;
    font-size: 8px;
    line-height: 1;
    letter-spacing: 0.06em;
    text-align: center;
  }
}
</style>
