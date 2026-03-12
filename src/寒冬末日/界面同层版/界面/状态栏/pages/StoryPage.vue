<template>
  <section class="ui-host-shell">
    <header class="ui-topbar">
      <div class="ui-topbar-brand">
        <span class="ui-dot"></span>
        <span class="ui-brand-copy">NEXUS // CORE_SYNC</span>
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
          人物
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
        <span class="ui-sidebar-toggle-arrow">›</span>
        <span class="ui-sidebar-toggle-label">[ ROSTER ]</span>
      </button>

      <aside class="ui-sidebar" :class="{ open: roleDrawerOpen }">
        <div class="ui-sidebar-head">
          <div>
            <span class="demo-kicker">CHARACTER // SIDEBAR</span>
            <strong>登场角色与房间态势</strong>
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
                  <div>
                    <span class="demo-kicker">{{ activeUtilityMeta.eyebrow }}</span>
                    <strong>{{ activeUtilityMeta.title }}</strong>
                    <p>{{ activeUtilityMeta.subtitle }}</p>
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
            </div>
          </div>

          <BottomComposer
            ref="composerAnchorRef"
            v-model="input"
            :busy="busy"
            :can-roll="Boolean(latestUserItem)"
            :choice-options="latestAssistantItem?.options ?? []"
            :role-tabs="roleTabs"
            :active-role-key="activeRoleKey"
            @submit="runDemo"
            @roll="rollLatestTurn"
            @swipe="swipeLatestAssistant"
            @open-role="openRoleFromComposer"
          />
        </section>
      </main>
    </div>

    <RadialQuickMenu :items="roleTabs" :active-key="activeRoleKey" @select="openRoleFromComposer" />

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
      title="开局设定 / Opening Setup"
      subtitle="这部分保留 demo 的开局业务链，但显示形态改成 docs/UI 式宿主弹层，而不是单独页面。"
      variant="workspace"
      icon="◈"
      eyebrow="MODAL // WORKSPACE"
      wide
      @close="openingModalOpen = false"
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
        @submit="generateOpening"
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
import type { TranscriptDensity } from '../types';
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
const roleDrawerOpen = ref(false);
const settingsModalOpen = ref(false);
const openingModalOpen = ref(false);
const componentLibraryOpen = ref(false);
const activeUtilityDrawer = ref<'system' | 'map' | null>(null);
const roleTabs = ref<Array<{ key: string; label: string; statusClass?: string; statusText?: string }>>([]);
const activeRoleKey = ref<string | null>(null);


const activeUtilityMeta = computed(() => {
  if (activeUtilityDrawer.value === 'map') {
    return {
      title: '战术地图',
      subtitle: '地图、区域和战术信息从这里向上展开。',
      eyebrow: 'MAP // TACTICAL',
    };
  }

  return {
    title: '系统 TAB',
    subtitle: '日志、统计和工作台辅助信息从这里向上展开。',
    eyebrow: 'TASKS // SYSTEM',
  };
});

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

function handleRosterChange(roles: Array<{ key: string; label: string; statusClass: string; statusText: string }>) {
  roleTabs.value = roles;
  if (!activeRoleKey.value && roles[0]) activeRoleKey.value = roles[0].key;
  if (activeRoleKey.value && !roles.some(role => role.key === activeRoleKey.value)) {
    activeRoleKey.value = roles[0]?.key ?? null;
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

.ui-chip-group {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ui-chip {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
}

.ui-chip.active,
.ui-meta-pill.action:not(:disabled) {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
}

.theme-dropdown {
  position: relative;
}
.theme-trigger {
  gap: 8px;
}
.theme-caret {
  display: inline-flex;
}
.theme-modal-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.theme-modal-option {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  color: var(--demo-text-primary);
  font-family: var(--demo-font-mono);
  font-size: 12px;
}
.theme-modal-option.active {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
}

.ui-host-body {
  position: relative;
  display: flex;
  align-items: stretch;
  min-width: 0;
}

.ui-sidebar {
  position: absolute;
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
}

.ui-sidebar.open {
  transform: translateX(0);
}

.ui-sidebar-toggle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
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
  transform: translateY(-50%) translateX(320px);
}

.ui-sidebar-toggle-arrow {
  font-family: var(--demo-font-mono);
  font-size: 16px;
  transition: transform 0.3s ease;
}

.ui-sidebar-toggle.open .ui-sidebar-toggle-arrow {
  transform: rotate(180deg);
}

.ui-sidebar-toggle-label {
  position: absolute;
  right: -34px;
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
  padding: 12px;
}

.ui-main-panel {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ui-transcript-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.ui-transcript-stage {
  min-width: 0;
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
  gap: 10px;
  width: fit-content;
  max-width: 100%;
  padding: 8px 10px;
  border-radius: 18px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  box-shadow: 0 10px 26px color-mix(in srgb, var(--shadow-color) 40%, transparent);
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
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}

.ui-bottom-drawer-head strong {
  display: block;
  margin-top: 6px;
  font-size: 16px;
}

.ui-bottom-drawer-head p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--demo-text-secondary);
}

.ui-bottom-drawer-body {
  min-height: 0;
  overflow: auto;
  padding: 16px 18px 18px;
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
    padding-left: 18px;
  }

  .ui-topbar,
  .ui-transcript-panel,
  .ui-bottom-dock {
    padding-left: 6px;
    padding-right: 6px;
  }

  .ui-topbar-actions,
  .theme-group {
    width: 100%;
  }

  .ui-topbar-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .theme-modal-list {
    grid-template-columns: 1fr;
  }

  .ui-bottom-tool-row {
    width: 100%;
    justify-content: stretch;
  }

  .ui-bottom-tool-row .ui-signal-btn {
    flex: 1 1 0;
    justify-content: center;
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
    width: calc(100% - 20px);
    left: 10px;
    right: 10px;
    bottom: 10px;
    max-height: calc(100dvh - 72px);
    border-radius: 22px;
    transform: translateY(100%);
  }

  .ui-sidebar.open {
    transform: translateY(0);
  }

  .ui-sidebar-head {
    gap: 10px;
    padding: 12px 12px 10px;
  }

  .ui-sidebar-head strong {
    margin-top: 4px;
    font-size: 14px;
  }

  .ui-sidebar-body {
    padding: 10px;
  }

  .ui-sidebar-toggle {
    position: fixed;
    top: 58px;
    bottom: 0;
    left: 0;
    width: 18px;
    min-height: calc(100dvh - 58px);
    height: auto;
    padding: 0;
    border-radius: 0 14px 14px 0;
    border-top: 0;
    border-bottom: 0;
    z-index: 32;
    transform: none;
  }

  .ui-sidebar-toggle.open {
    transform: none;
  }

  .ui-sidebar-toggle-label {
    display: none;
  }

  .ui-sidebar-toggle-arrow {
    font-size: 18px;
  }
}
</style>

