<template>
  <section class="ui-host-shell" :class="{ 'is-fullscreen': isFullscreen }" :style="shellStyleVars">
    <header class="ui-topbar">
      <div class="ui-topbar-brand">
        <span class="ui-dot"></span>
        <span class="ui-brand-copy">EDEN-STAR</span>
      </div>

      <div class="ui-topbar-actions">
        <span class="ui-online">● 在线</span>

        <button type="button" class="ui-icon-btn" @click="openRoleDrawer">角色</button>

        <button type="button" class="ui-icon-btn" @click="openGalleryDrawer">图库</button>

        <button type="button" class="ui-icon-btn" @click="openSettingsModal">排版</button>

        <button type="button" class="ui-icon-btn ui-fullscreen-btn" @click="toggleFullscreen">
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </button>
      </div>
    </header>

    <div class="ui-host-body">
      <transition name="sidebar-mask-fade">
        <div v-if="roleDrawerOpen || galleryDrawerOpen" class="ui-sidebar-mask" @click="closeSideDrawers"></div>
      </transition>

      <button type="button" class="ui-sidebar-toggle" :class="{ open: roleDrawerOpen }" @click="toggleRoleDrawer">
        <span class="ui-sidebar-toggle-label">[ ROSTER ]</span>
      </button>

      <aside class="ui-sidebar" :class="{ open: roleDrawerOpen }">
        <div class="ui-sidebar-head">
          <div>
            <span class="demo-kicker">CHARACTER // SIDEBAR</span>
            <strong>角色&伊甸</strong>
          </div>
          <button type="button" class="ui-close-btn" @click="closeRoleDrawer">✕</button>
        </div>

        <div class="ui-sidebar-body">
          <MvuRolePanel
            :transcript-items="transcript"
            :refresh-revision="mvuSourceRevision"
            :active-character-key="activeRoleKey"
            @select-character="handleRoleSelect"
            @roster-change="handleRosterChange"
            @collapse="closeRoleDrawer"
          />
        </div>
      </aside>

      <button
        type="button"
        class="ui-sidebar-toggle ui-sidebar-toggle-right"
        :class="{ open: galleryDrawerOpen }"
        @click="toggleGalleryDrawer"
      >
        <span class="ui-sidebar-toggle-label">[ GALLERY ]</span>
      </button>

      <aside class="ui-sidebar ui-sidebar-right" :class="{ open: galleryDrawerOpen }">
        <div class="ui-sidebar-head">
          <div>
            <span class="demo-kicker">IMAGE // SIDEBAR</span>
            <strong>生图图廊</strong>
          </div>
          <button type="button" class="ui-close-btn" @click="closeGalleryDrawer">✕</button>
        </div>

        <div class="ui-sidebar-body ui-sidebar-body-gallery">
          <ImageGalleryPanel
            class="ui-gallery-panel-host"
            :entries="galleryEntries"
            :active-message-id="latestAssistantItem?.message_id ?? null"
            @jump-message="jumpToTranscriptMessage"
            @image-view="activateGeneratedImageView"
            @image-regenerate="activateGeneratedImageRegenerate"
            @close="closeGalleryDrawer"
          />
        </div>
        <footer class="ui-sidebar-footer ui-sidebar-footer-gallery">
          <button type="button" class="ui-sidebar-footer-btn clip-corner-sm" @click="closeGalleryDrawer">
            关闭图廊
          </button>
        </footer>
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
              :render-revision="transcriptDomRevision"
              @open-detail="openDetail"
              @image-intent="handleTranscriptImageIntent"
              @image-view="activateGeneratedImageView"
              @image-regenerate="activateGeneratedImageRegenerate"
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
          <!-- 遮罩和抽屉面板 Teleport 到 body，脱离 .ui-host-shell 的 overflow:hidden 裁剪 -->
          <Teleport to="body">
            <transition name="utility-mask-fade">
              <div v-if="activeUtilityDrawer" class="ui-utility-mask" @click="closeUtilityDrawer"></div>
            </transition>

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
          </Teleport>

          <div class="ui-bottom-console-strip clip-corner">
            <div v-if="visibleRoleTabs.length" class="ui-role-rack" role="tablist" aria-label="角色快捷入口">
              <button
                v-for="role in visibleRoleTabs"
                :key="role.key"
                type="button"
                class="ui-role-card clip-corner-sm"
                :class="{ active: activeRoleKey === role.key }"
                @click="openRoleFromComposer(role.key)"
              >
                <span class="ui-role-led" :class="role.statusClass"></span>
                <span class="ui-role-name">{{ role.label }}</span>
              </button>
            </div>

            <div class="ui-bottom-tools">
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

            <div class="ui-bottom-console-balance" aria-hidden="true"></div>
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

    <Teleport to="body">
      <RadialQuickMenu :items="visibleRoleTabs" :active-key="activeRoleKey" @select="openRoleFromComposer" />
    </Teleport>

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
import type { TranscriptItem } from '../types';
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue';
import {
  parseGeneratedImageActivationPayload,
  type GeneratedImageActivationPayload,
} from '../generatedImageActivation';

import BottomComposer from '../components/BottomComposer.vue';
import ComponentLibraryPanel from '../components/ComponentLibraryPanel.vue';
import HudModal from '../components/HudModal.vue';
import ImageGalleryPanel from '../components/ImageGalleryPanel.vue';
import MessageDetailModal from '../components/MessageDetailModal.vue';
import MvuRolePanel from '../components/MvuRolePanel.vue';
import OpeningSetupPanel from '../components/OpeningSetupPanel.vue';
import RadialQuickMenu from '../components/RadialQuickMenu.vue';
import MapBusinessPanel from '../components/MapBusinessPanel.vue';
import TopToolbar from '../components/TopToolbar.vue';
import TranscriptList from '../components/TranscriptList.vue';
import WorkbenchTabs from '../components/WorkbenchTabs.vue';
import openingModalIcon from '../assets/opening-modal-icon.png?url';
import { selectGeneratedImageTriggerTarget } from '../generatedImageTriggerTarget';
import { buildIframeMessageRootSelectors } from '../generatedImageDom';
  import {
    convertIframePointToHostPoint,
    resolveHostDispatchPlanWithRetry,
    resolveHostMessageTargetFromPoint,
  } from '../hostCoordinateTarget';
import { resolveWithRetry } from '../hostTargetRetry';
import { PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR, isPluginNativeImageElement } from '../pluginNativeImageSelectors';
import { resolveTranscriptDoubleClickMessageId } from '../transcriptDoubleClick';
import { shouldSkipTranscriptImageTrigger } from '../transcriptImageTriggerDeduper';
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
  galleryEntries,
  mvuSourceRevision,
  latestUserItem,
  latestAssistantItem,
  transcriptDomRevision,
  readerSummary,
  logs,
  beginPendingImageTask,
  markRecentImageIntent,
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
  withHostTranscriptVisible,
  ensureHostMesTextRendered,
} = useStreamingDemo();

const transcriptListRef = ref<InstanceType<typeof TranscriptList> | null>(null);
const composerRef = ref<InstanceType<typeof BottomComposer> | null>(null);
const readerShellHeight = ref('720px');
const isFullscreen = ref(false);
provide('isFullscreen', isFullscreen);
const initialTranscriptAnchored = ref(false);
const roleDrawerOpen = ref(false);
const galleryDrawerOpen = ref(false);
const transcriptImageTriggerGuard = {
  messageId: null as number | null,
  timestampMs: 0,
};
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
  '--reader-content-max': '72rem',
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

  if (isFullscreen.value) {
    // iframe 自身全屏：window.innerHeight 即为全屏高度
    const fsHeight = Math.trunc(window.innerHeight);
    readerShellHeight.value = `${fsHeight > 0 ? fsHeight : safeViewportHeight}px`;
    return;
  }

  const shellPadding = safeViewportHeight < 720 ? 8 : 16;
  const targetHeight = Math.max(520, safeViewportHeight - shellPadding);
  readerShellHeight.value = `${targetHeight}px`;
}

function jumpLatest() {
  transcriptListRef.value?.scrollToLatest?.();
}

function anchorTranscriptToLatest(behavior: ScrollBehavior = 'auto') {
  if (!transcriptListRef.value || visibleTranscript.value.length === 0) return false;
  transcriptListRef.value.scrollToBottom?.(behavior);
  return true;
}

function closeRoleDrawer() {
  roleDrawerOpen.value = false;
}

function closeGalleryDrawer() {
  galleryDrawerOpen.value = false;
}

function openRoleDrawer() {
  closeUtilityDrawer();
  closeGalleryDrawer();
  roleDrawerOpen.value = true;
}

function openGalleryDrawer() {
  closeUtilityDrawer();
  closeRoleDrawer();
  galleryDrawerOpen.value = true;
}

function openSettingsModal() {
  settingsModalOpen.value = true;
}

function toggleRoleDrawer() {
  if (roleDrawerOpen.value) {
    closeRoleDrawer();
    return;
  }
  openRoleDrawer();
}

function toggleGalleryDrawer() {
  if (galleryDrawerOpen.value) {
    closeGalleryDrawer();
    return;
  }
  openGalleryDrawer();
}

function closeSideDrawers() {
  roleDrawerOpen.value = false;
  galleryDrawerOpen.value = false;
}

function toggleUtilityDrawer(type: 'system' | 'map') {
  closeSideDrawers();
  activeUtilityDrawer.value = activeUtilityDrawer.value === type ? null : type;
}

function closeUtilityDrawer() {
  activeUtilityDrawer.value = null;
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    document.documentElement.requestFullscreen().catch(console.error);
  }
}

function exitFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  }
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
  closeGalleryDrawer();
  roleDrawerOpen.value = true;
}

function jumpToTranscriptMessage(messageId: number) {
  const targetId = Math.trunc(Number(messageId));
  if (!Number.isFinite(targetId) || targetId < 0) return;
  transcriptListRef.value?.scrollToMessage?.(targetId, 'smooth');
  readingMode.value = 'browsing_history';
  if (window.innerWidth <= 960) {
    closeGalleryDrawer();
  }
}

async function handleOpeningSubmit() {
  openingModalOpen.value = false;
  await generateOpening();
}

function closeOpeningModal() {
  if (shouldShowOpeningSetup.value) return;
  openingModalOpen.value = false;
}

function collectReachableHostDocuments(): Document[] {
  const docs: Document[] = [];
  const pushDoc = (doc: Document | null | undefined) => {
    if (!doc) return;
    if (docs.includes(doc)) return;
    docs.push(doc);
  };

  try {
    pushDoc(window.parent?.document);
  } catch {
    // ignore
  }
  try {
    pushDoc(window.top?.document);
  } catch {
    // ignore
  }

  return docs;
}

function collectReachableHostWindows(): Window[] {
  const windows: Window[] = [];
  const pushWindow = (hostWindow: Window | null | undefined) => {
    if (!hostWindow) return;
    if (windows.includes(hostWindow)) return;
    windows.push(hostWindow);
  };

  pushWindow(window);
  try {
    pushWindow(window.parent);
  } catch {
    // ignore
  }
  try {
    pushWindow(window.top);
  } catch {
    // ignore
  }

  return windows;
}

function resolveHostMessageTriggerTarget(messageId: number): HTMLElement | null {
  const mesid = Math.trunc(messageId);
  for (const doc of collectReachableHostDocuments()) {
    const root =
      (doc.querySelector(`#chat > .mes[mesid='${mesid}']`) as HTMLElement | null) ??
      (doc.querySelector(`#chat .mes[mesid='${mesid}']`) as HTMLElement | null) ??
      (doc.querySelector(`.mes[mesid='${mesid}']`) as HTMLElement | null);
    if (!root) continue;
    return (
      (root.querySelector('.mes_text') as HTMLElement | null) ??
      (root.querySelector('.mes_block') as HTMLElement | null) ??
      (root.querySelector('.message_text') as HTMLElement | null) ??
      root
    );
  }

  return null;
}

function resolveHostMessageTriggerTargetFromEvent(messageId: number, event?: MouseEvent | null): HTMLElement | null {
  const directTarget = resolveHostMessageTriggerTarget(messageId);
  if (directTarget) return directTarget;

  if (event) {
    try {
      const frameElement = window.frameElement as HTMLElement | null;
      const frameRect = frameElement?.getBoundingClientRect?.();
      if (frameRect) {
        const hostPoint = convertIframePointToHostPoint(
          { clientX: event.clientX, clientY: event.clientY },
          { left: frameRect.left, top: frameRect.top },
        );

        for (const hostWindow of collectReachableHostWindows()) {
          const hostDocument = hostWindow.document;
          const target = resolveHostMessageTargetFromPoint(hostDocument as any, hostPoint) as HTMLElement | null;
          if (target) return target;
        }
      }
    } catch {
      // ignore and fallback to message id lookup
    }
  }

  return resolveHostMessageTriggerTarget(messageId);
}

function resolveHostMessageRoot(messageId: number): HTMLElement | null {
  const mesid = Math.trunc(messageId);
  for (const doc of collectReachableHostDocuments()) {
    const root =
      (doc.querySelector(`#chat > .mes[mesid='${mesid}']`) as HTMLElement | null) ??
      (doc.querySelector(`#chat .mes[mesid='${mesid}']`) as HTMLElement | null) ??
      (doc.querySelector(`.mes[mesid='${mesid}']`) as HTMLElement | null);
    if (root) return root;
  }
  return null;
}

const BRIDGED_EVENT_FLAG = '__streamDemoBridge';

function isBridgedEvent(event: Event | null | undefined): boolean {
  return Boolean((event as (Event & Record<string, unknown>) | null | undefined)?.[BRIDGED_EVENT_FLAG]);
}

function markBridgedEvent<T extends Event>(event: T): T {
  const bridgedEvent = event as Event & Record<string, unknown>;
  bridgedEvent[BRIDGED_EVENT_FLAG] = true;
  return event;
}

function normalizeImageSrcForCompare(input: string): string {
  return String(input ?? '')
    .trim()
    .replace(/&amp;/g, '&');
}

function extractPromptToken(input: string): string {
  const text = String(input ?? '').trim();
  if (!text) return '';
  const match = text.match(/([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/);
  return match?.[0]?.trim() ?? '';
}

function normalizePromptTokenForCompare(input: string): string {
  const token = extractPromptToken(input) || String(input ?? '').trim();
  return token
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function resolveHostImageButtonByPromptToken(messageId: number, promptToken: string): HTMLElement | null {
  const root = resolveHostMessageRoot(messageId);
  if (!root) return null;
  const needle = normalizePromptTokenForCompare(promptToken);
  if (!needle) return null;
  const buttons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
  for (const button of buttons) {
    const payload = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
    if (!payload) continue;
    if (normalizePromptTokenForCompare(payload) === needle) return button;
  }
  return null;
}

function resolveHostImageButtonByRequestId(messageId: number, requestId: string): HTMLElement | null {
  const root = resolveHostMessageRoot(messageId);
  if (!root || !requestId) return null;
  const buttons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
  return (
    buttons.find(button => {
      const buttonRequestId = String(button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '').trim();
      return buttonRequestId === requestId;
    }) ?? null
  );
}

function resolveHostImageNodeByRequestId(messageId: number, requestId: string): HTMLImageElement | null {
  const root = resolveHostMessageRoot(messageId);
  if (!root || !requestId) return null;
  const spans = Array.from(root.querySelectorAll('.st-chatu8-image-span')) as HTMLElement[];
  for (const span of spans) {
    const spanRequestId = String(span.dataset.requestId ?? span.getAttribute('data-request-id') ?? '').trim();
    if (spanRequestId !== requestId) continue;
    const image = span.querySelector('img') as HTMLImageElement | null;
    if (image) return image;
  }
  return null;
}

function resolveHostImageNodeBySrc(messageId: number, imageSrc: string): HTMLImageElement | null {
  const root = resolveHostMessageRoot(messageId);
  if (!root || !imageSrc) return null;
  const needle = normalizeImageSrcForCompare(imageSrc);
  if (!needle) return null;
  const images = Array.from(root.querySelectorAll('.st-chatu8-image-span img')) as HTMLImageElement[];
  for (const image of images) {
    const candidate = normalizeImageSrcForCompare(image.getAttribute('src') ?? image.currentSrc ?? '');
    if (candidate === needle) return image;
  }
  return null;
}

function findNextImageElement(start: Element): HTMLImageElement | null {
  let current: Element | null = start;
  while (current) {
    let sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling instanceof HTMLImageElement) return sibling;
      const nested = sibling.querySelector?.('img') as HTMLImageElement | null;
      if (nested) return nested;
      sibling = sibling.nextElementSibling;
    }
    current = current.parentElement;
  }
  return null;
}

function resolveHostImageNodeByPromptToken(messageId: number, promptToken: string): HTMLImageElement | null {
  const button = resolveHostImageButtonByPromptToken(messageId, promptToken);
  if (!button) return null;
  const ownerRoot = (button.closest('.mes') as HTMLElement | null) ?? resolveHostMessageRoot(messageId);
  const requestId = String(button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '').trim();
  if (requestId && ownerRoot) {
    const span = ownerRoot.querySelector(`.st-chatu8-image-span[data-request-id='${requestId}']`) as HTMLElement | null;
    const image = span?.querySelector('img') as HTMLImageElement | null;
    if (image) return image;
  }
  return findNextImageElement(button);
}

function resolveIframeMessageRoot(messageId: number): HTMLElement | null {
  for (const selector of buildIframeMessageRootSelectors(messageId)) {
    const resolved = document.querySelector(selector) as HTMLElement | null;
    if (resolved) return resolved;
  }
  return null;
}

function resolveIframeImageButtonByPromptToken(messageId: number, promptToken: string): HTMLElement | null {
  const root = resolveIframeMessageRoot(messageId);
  if (!root) return null;
  const needle = normalizePromptTokenForCompare(promptToken);
  if (!needle) return null;
  const buttons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
  for (const button of buttons) {
    const payload = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
    if (!payload) continue;
    if (normalizePromptTokenForCompare(payload) === needle) return button;
  }
  return null;
}

function resolveIframeImageButtonByRequestId(messageId: number, requestId: string): HTMLElement | null {
  const root = resolveIframeMessageRoot(messageId);
  if (!root || !requestId) return null;
  const buttons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
  return (
    buttons.find(button => {
      const buttonRequestId = String(button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '').trim();
      return buttonRequestId === requestId;
    }) ?? null
  );
}

function resolveIframeImageNodeByRequestId(messageId: number, requestId: string): HTMLImageElement | null {
  const root = resolveIframeMessageRoot(messageId);
  if (!root || !requestId) return null;
  const spans = Array.from(root.querySelectorAll('.st-chatu8-image-span')) as HTMLElement[];
  for (const span of spans) {
    const spanRequestId = String(span.dataset.requestId ?? span.getAttribute('data-request-id') ?? '').trim();
    if (spanRequestId !== requestId) continue;
    const image = span.querySelector('img') as HTMLImageElement | null;
    if (image) return image;
  }
  return null;
}

function resolveIframeImageNodeBySrc(messageId: number, imageSrc: string): HTMLImageElement | null {
  const root = resolveIframeMessageRoot(messageId);
  if (!root || !imageSrc) return null;
  const needle = normalizeImageSrcForCompare(imageSrc);
  if (!needle) return null;
  const images = Array.from(root.querySelectorAll('.st-chatu8-image-span img')) as HTMLImageElement[];
  for (const image of images) {
    const candidate = normalizeImageSrcForCompare(image.getAttribute('src') ?? image.currentSrc ?? '');
    if (candidate === needle) return image;
  }
  return null;
}

function resolveIframeImageNodeByPromptToken(messageId: number, promptToken: string): HTMLImageElement | null {
  const button = resolveIframeImageButtonByPromptToken(messageId, promptToken);
  if (!button) return null;
  const requestId = String(button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '').trim();
  if (requestId) {
    const image = resolveIframeImageNodeByRequestId(messageId, requestId);
    if (image) return image;
  }
  return findNextImageElement(button);
}

function resolveHostImageTarget(
  messageId: number,
  promptToken: string,
  requestId: string,
  imageSrc: string,
): {
  hostMessageRoot: HTMLElement | null;
  hostImage: HTMLImageElement | null;
  hostButton: HTMLElement | null;
  iframeImage: HTMLImageElement | null;
  iframeButton: HTMLElement | null;
} {
  const hostMessageRoot = resolveHostMessageTriggerTarget(messageId);
  const buttonByRequestId = requestId ? resolveHostImageButtonByRequestId(messageId, requestId) : null;
  const imageByRequestId = requestId ? resolveHostImageNodeByRequestId(messageId, requestId) : null;
  const iframeButtonByRequestId = requestId ? resolveIframeImageButtonByRequestId(messageId, requestId) : null;
  const iframeImageByRequestId = requestId ? resolveIframeImageNodeByRequestId(messageId, requestId) : null;
  if (imageByRequestId || buttonByRequestId) {
    return {
      hostMessageRoot,
      hostImage: imageByRequestId ?? resolveHostImageNodeByPromptToken(messageId, promptToken),
      hostButton: buttonByRequestId ?? resolveHostImageButtonByPromptToken(messageId, promptToken),
      iframeImage: iframeImageByRequestId ?? resolveIframeImageNodeByPromptToken(messageId, promptToken),
      iframeButton: iframeButtonByRequestId ?? resolveIframeImageButtonByPromptToken(messageId, promptToken),
    };
  }

  if (iframeImageByRequestId || iframeButtonByRequestId) {
    return {
      hostMessageRoot,
      hostImage: imageByRequestId ?? resolveHostImageNodeByPromptToken(messageId, promptToken),
      hostButton: buttonByRequestId ?? resolveHostImageButtonByPromptToken(messageId, promptToken),
      iframeImage: iframeImageByRequestId ?? resolveIframeImageNodeByPromptToken(messageId, promptToken),
      iframeButton: iframeButtonByRequestId ?? resolveIframeImageButtonByPromptToken(messageId, promptToken),
    };
  }

  const imageBySrc = imageSrc ? resolveHostImageNodeBySrc(messageId, imageSrc) : null;
  const iframeImageBySrc = imageSrc ? resolveIframeImageNodeBySrc(messageId, imageSrc) : null;
  if (imageBySrc) {
    const span = imageBySrc.closest('.st-chatu8-image-span') as HTMLElement | null;
    const spanRequestId = String(span?.dataset.requestId ?? span?.getAttribute('data-request-id') ?? '').trim();
    return {
      hostMessageRoot,
      hostImage: imageBySrc,
      hostButton:
        resolveHostImageButtonByRequestId(messageId, spanRequestId) ??
        resolveHostImageButtonByPromptToken(messageId, promptToken),
      iframeImage: iframeImageBySrc ?? resolveIframeImageNodeByPromptToken(messageId, promptToken),
      iframeButton:
        resolveIframeImageButtonByRequestId(messageId, spanRequestId) ??
        resolveIframeImageButtonByPromptToken(messageId, promptToken),
    };
  }

  if (iframeImageBySrc) {
    const span = iframeImageBySrc.closest('.st-chatu8-image-span') as HTMLElement | null;
    const spanRequestId = String(span?.dataset.requestId ?? span?.getAttribute('data-request-id') ?? '').trim();
    return {
      hostMessageRoot,
      hostImage: resolveHostImageNodeByPromptToken(messageId, promptToken),
      hostButton: resolveHostImageButtonByPromptToken(messageId, promptToken),
      iframeImage: iframeImageBySrc,
      iframeButton:
        resolveIframeImageButtonByRequestId(messageId, spanRequestId) ??
        resolveIframeImageButtonByPromptToken(messageId, promptToken),
    };
  }

  return {
    hostMessageRoot,
    hostImage: resolveHostImageNodeByPromptToken(messageId, promptToken),
    hostButton: resolveHostImageButtonByPromptToken(messageId, promptToken),
    iframeImage: resolveIframeImageNodeByPromptToken(messageId, promptToken),
    iframeButton: resolveIframeImageButtonByPromptToken(messageId, promptToken),
  };
}

function triggerHostElementClick(target: HTMLElement): boolean {
  try {
    if (typeof target.click === 'function') {
      target.click();
      return true;
    }
    const doc = target.ownerDocument;
    const view = doc.defaultView;
    if (!view) return false;
    const clickEvent = markBridgedEvent(
      new view.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    target.dispatchEvent(clickEvent);
    return true;
  } catch {
    return false;
  }
}

function resolveGeneratedImageTriggerTarget(
  input: {
    hostMessageRoot: HTMLElement | null;
    hostButton: HTMLElement | null;
    hostImage: HTMLImageElement | null;
    iframeButton: HTMLElement | null;
    iframeImage: HTMLImageElement | null;
  },
  action: 'open' | 'regenerate',
) {
  return selectGeneratedImageTriggerTarget(
    {
      hostButton: input.hostButton,
      hostImage: input.hostImage,
      hostMessageRoot: input.hostMessageRoot,
      iframeButton: input.iframeButton,
      iframeImage: input.iframeImage,
    },
    action,
  );
}

/**
 * 全屏挂起辅助：若当前 iframe 处于全屏，先退出全屏，执行 action，
 * 再用 MutationObserver 监测宿主 body 直接子节点的增删来感知菜单关闭，
 * 菜单消失后自动恢复全屏。若 30s 内未触发则超时恢复。
 */
async function withFullscreenSuspended(action: () => void): Promise<void> {
  if (!document.fullscreenElement) {
    action();
    return;
  }

  // 获取宿主 document.body 用于监测菜单
  let hostBody: HTMLElement | null = null;
  try {
    hostBody = window.top?.document?.body ?? null;
  } catch {
    // 跨域时无法访问宿主，直接执行不恢复
    action();
    return;
  }

  // 退出全屏
  await document.exitFullscreen?.().catch(() => {});
  // 等待 fullscreenchange 确认退出
  await new Promise<void>(resolve => {
    if (!document.fullscreenElement) {
      resolve();
      return;
    }
    const handler = () => {
      document.removeEventListener('fullscreenchange', handler);
      resolve();
    };
    document.addEventListener('fullscreenchange', handler);
    setTimeout(resolve, 500);
  });

  // 执行生图触发
  action();

  if (!hostBody) return;

  // 监测宿主 body 直接子节点：等新浮层节点出现后消失，再恢复全屏
  await new Promise<void>(resolve => {
    const TIMEOUT_MS = 30_000;
    let addedNode: Node | null = null;
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve();
    }, TIMEOUT_MS);

    const observer = new MutationObserver(mutations => {
      for (const mut of mutations) {
        if (addedNode === null) {
          // 等待新节点被加入
          for (const node of Array.from(mut.addedNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              addedNode = node;
              break;
            }
          }
        } else {
          // 等待已追踪节点被移除
          for (const node of Array.from(mut.removedNodes)) {
            if (node === addedNode) {
              clearTimeout(timeoutId);
              observer.disconnect();
              resolve();
              return;
            }
          }
        }
      }
    });

    observer.observe(hostBody!, { childList: true });

    // 若 300ms 内没有新节点加入，说明菜单可能没有走 body appendChild 流程，直接 resolve
    setTimeout(() => {
      if (addedNode === null) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve();
      }
    }, 300);
  });

  // 恢复全屏
  document.documentElement.requestFullscreen().catch(() => {});
}

function dispatchHostDoubleClick(
  target: HTMLElement,
  hostPoint?: { clientX: number; clientY: number } | null,
): boolean {
  try {
    const doc = target.ownerDocument;
    const view = doc.defaultView;
    if (!view) return false;
    const rect = target.getBoundingClientRect();
    const width = Math.max(rect.width, 16);
    const height = Math.max(rect.height, 16);
    const clientX =
      hostPoint?.clientX != null
        ? Number(hostPoint.clientX)
        : Math.round(rect.left + Math.min(width - 8, Math.max(8, width * 0.3)));
    const clientY =
      hostPoint?.clientY != null
        ? Number(hostPoint.clientY)
        : Math.round(rect.top + Math.min(height - 8, Math.max(8, height * 0.35)));
    const dblClickEvent = markBridgedEvent(
      new view.MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        composed: true,
        view,
        clientX,
        clientY,
        button: 0,
        buttons: 1,
        detail: 2,
      }),
    );
    target.dispatchEvent(dblClickEvent);
    return true;
  } catch {
    return false;
  }
}

async function proxyImageMenuToHost(item: TranscriptItem, event?: MouseEvent | null) {
  const messageId = Math.trunc(Number(item?.message_id));
  if (!Number.isFinite(messageId) || messageId < 0) return;
  await withHostTranscriptVisible(async () => {
    const hostPoint = (() => {
      if (!event) return null;
      try {
        const frameElement = window.frameElement as HTMLElement | null;
        const frameRect = frameElement?.getBoundingClientRect?.();
        if (!frameRect) return null;
        return convertIframePointToHostPoint(
          { clientX: event.clientX, clientY: event.clientY },
          { left: frameRect.left, top: frameRect.top },
        );
      } catch {
        return null;
      }
    })();

    const dispatchPlan = await resolveHostDispatchPlanWithRetry({
      resolveDirectTarget: () => resolveHostMessageTriggerTarget(messageId),
      resolvePointFallbackTarget: () => resolveHostMessageTriggerTargetFromEvent(messageId, event),
      hostPoint,
      directRetry: {
        attempts: 8,
        delayMs: 80,
      },
      pointRetry: {
        attempts: 5,
        delayMs: 90,
      },
    });

    if (!dispatchPlan.target) {
      toastr?.warning?.(`未找到楼层 #${messageId} 的原生正文节点`);
      return;
    }
    await withFullscreenSuspended(() => {
      if (!dispatchHostDoubleClick(dispatchPlan.target as HTMLElement, dispatchPlan.hostPoint)) {
        toastr?.warning?.(`楼层 #${messageId} 的原生生图菜单触发失败`);
      }
    });
  });
}

let imageGenerationLock = false;

async function handleTranscriptDoubleClickCapture(event: MouseEvent) {
  if (isBridgedEvent(event)) return;
  if (imageGenerationLock) return;
  const rawMessageId = resolveTranscriptDoubleClickMessageId(event.target);
  if (!Number.isFinite(rawMessageId) || rawMessageId == null || rawMessageId < 0) return;
  const messageId = Math.trunc(rawMessageId);

  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as MouseEvent & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
  const clickTraceId = `${messageId}:${Math.trunc(Number(event.timeStamp) || Date.now())}:${event.detail ?? 0}`;
  console.log('[image] transcript-dblclick', {
    traceId: clickTraceId,
    messageId,
    timestamp: new Date().toISOString(),
    eventTimeStamp: event.timeStamp,
    detail: event.detail,
    target: (event.target as HTMLElement | null)?.tagName ?? null,
  });
  if (shouldSkipTranscriptImageTrigger(messageId, transcriptImageTriggerGuard, Date.now(), 300)) {
    console.log('[image] transcript-dblclick-skipped', {
      traceId: clickTraceId,
      messageId,
    });
    return;
  }
  imageGenerationLock = true;
  try {
    const rendered = await ensureHostMesTextRendered(messageId);
    if (!rendered) {
      console.warn('[image] mes_text 注入失败，mesid:', messageId);
    }
    beginPendingImageTask(messageId);
    markRecentImageIntent(messageId, 'transcript');
    void proxyImageMenuToHost({ message_id: messageId } as TranscriptItem, event);
  } finally {
    setTimeout(() => { imageGenerationLock = false; }, 2000);
  }
}

function handleTranscriptIntentCapture(event: MouseEvent | PointerEvent | TouchEvent) {
  if (isBridgedEvent(event)) return;
  const rawMessageId = resolveTranscriptDoubleClickMessageId(event.target);
  if (!Number.isFinite(rawMessageId) || rawMessageId == null || rawMessageId < 0) return;
  markRecentImageIntent(Math.trunc(rawMessageId), 'transcript');
}

function handleTranscriptImageIntent(item: TranscriptItem) {
  const messageId = Math.trunc(Number(item?.message_id));
  if (!Number.isFinite(messageId) || messageId < 0) return;
  markRecentImageIntent(messageId, 'transcript');
}

function resolveGeneratedImagePayloadFromDomTarget(target: EventTarget | null): GeneratedImageActivationPayload | null {
  const element = target as HTMLElement | null;
  const carrier = element?.closest?.(PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR) as HTMLElement | null;
  if (!carrier || !isPluginNativeImageElement(carrier)) return null;

  const targetImage =
    element instanceof HTMLImageElement ? element : (carrier.querySelector('img') as HTMLImageElement | null);
  return parseGeneratedImageActivationPayload({
    carrierDataset: carrier.dataset,
    targetDataset: targetImage?.dataset ?? {},
    targetAttrSrc: targetImage?.getAttribute('src') ?? null,
    targetCurrentSrc: targetImage?.currentSrc ?? null,
    targetSrc: targetImage?.getAttribute('src') ?? null,
  });
}

async function activateGeneratedImageView(payload: GeneratedImageActivationPayload) {
  const messageId = Number(payload?.messageId);
  if (!Number.isFinite(messageId)) return;
  const promptToken = String(payload?.promptToken ?? '');
  const requestId = String(payload?.requestId ?? '').trim();
  const imageSrc = String(payload?.imageSrc ?? '').trim();

  const targetNode = await resolveWithRetry(
    () => {
      const { hostMessageRoot, hostImage, hostButton, iframeImage, iframeButton } = resolveHostImageTarget(
        Math.trunc(messageId),
        promptToken,
        requestId,
        imageSrc,
      );
      return resolveGeneratedImageTriggerTarget(
        {
          hostMessageRoot,
          hostButton,
          hostImage,
          iframeButton,
          iframeImage,
        },
        'open',
      );
    },
    { attempts: 5, delayMs: 90 },
  );
  if (!targetNode) {
    toastr?.warning?.(`楼层 #${Math.trunc(messageId)} 的图片查看目标未找到`);
    return;
  }
  if (!triggerHostElementClick(targetNode)) {
    toastr?.warning?.(`楼层 #${Math.trunc(messageId)} 的图片查看触发失败`);
  }
}

async function activateGeneratedImageRegenerate(payload: GeneratedImageActivationPayload) {
  const messageId = Number(payload?.messageId);
  if (!Number.isFinite(messageId)) return;
  const promptToken = String(payload?.promptToken ?? '');
  const requestId = String(payload?.requestId ?? '').trim();
  const imageSrc = String(payload?.imageSrc ?? '').trim();

  const targetNode = await resolveWithRetry(
    () => {
      const { hostMessageRoot, hostImage, hostButton, iframeImage, iframeButton } = resolveHostImageTarget(
        Math.trunc(messageId),
        promptToken,
        requestId,
        imageSrc,
      );
      return resolveGeneratedImageTriggerTarget(
        {
          hostMessageRoot,
          hostButton,
          hostImage,
          iframeButton,
          iframeImage,
        },
        'regenerate',
      );
    },
    { attempts: 5, delayMs: 90 },
  );
  if (!targetNode) {
    toastr?.warning?.(`楼层 #${Math.trunc(messageId)} 的图片重生目标未找到`);
    return;
  }
  markRecentImageIntent(Math.trunc(messageId), 'gallery');
  beginPendingImageTask(Math.trunc(messageId));
  await withFullscreenSuspended(() => {
    if (!dispatchHostDoubleClick(targetNode)) {
      toastr?.warning?.(`楼层 #${Math.trunc(messageId)} 的图片重生触发失败`);
    }
  });
}

function handleGeneratedImageWindowDoubleClickCapture(event: MouseEvent) {
  if (isBridgedEvent(event)) return;
  const payload = resolveGeneratedImagePayloadFromDomTarget(event.target);
  if (!payload) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  void activateGeneratedImageRegenerate(payload);
}

useEventListener(document, 'pointerdown', handleTranscriptIntentCapture, { capture: true });
useEventListener(document, 'click', handleTranscriptIntentCapture, { capture: true });
useEventListener(document, 'dblclick', handleTranscriptDoubleClickCapture, { capture: true });
useEventListener(window, 'dblclick', handleGeneratedImageWindowDoubleClickCapture, { capture: true });

function openChoiceModalFromToolbar() {
  composerRef.value?.openChoiceModal?.();
}

onMounted(() => {
  updateReaderShellHeight();
  nextTick(() => {
    if (anchorTranscriptToLatest('auto')) {
      initialTranscriptAnchored.value = true;
    }
  });
});

watch(
  () => visibleTranscript.value.map(item => `${item.message_id}:${item.phase}`).join('|'),
  async signature => {
    if (!signature || initialTranscriptAnchored.value) return;
    await nextTick();
    if (anchorTranscriptToLatest('auto')) {
      initialTranscriptAnchored.value = true;
    }
  },
  { flush: 'post' },
);

useEventListener(window, 'resize', updateReaderShellHeight, { passive: true });

if (typeof window !== 'undefined' && window.visualViewport) {
  useEventListener(window.visualViewport, 'resize', updateReaderShellHeight, { passive: true });
  useEventListener(window.visualViewport, 'scroll', updateReaderShellHeight, { passive: true });
}

// 同步浏览器原生全屏状态
useEventListener(document, 'fullscreenchange', () => {
  isFullscreen.value = !!document.fullscreenElement;
  updateReaderShellHeight();
});

useEventListener(window, 'keydown', event => {
  if (event.key !== 'Escape') return;
  if (roleDrawerOpen.value || galleryDrawerOpen.value) closeSideDrawers();
  else if (activeUtilityDrawer.value) activeUtilityDrawer.value = null;
  else if (componentLibraryOpen.value) componentLibraryOpen.value = false;
  else if (openingModalOpen.value) openingModalOpen.value = false;
  else if (settingsModalOpen.value) settingsModalOpen.value = false;
  else if (document.fullscreenElement) exitFullscreen();
});
</script>

<style scoped>
/*
 * Z-INDEX 层级表（本文件内）
 *   1      — ui-host-shell 基础层
 *   5      — ui-sidebar-mask 遮罩
 *  16      — ui-topbar（固定在顶）
 *  20      — ui-sidebar-toggle 按钮
 *  24      — ui-bottom-console-strip
 *  25      — ui-sidebar（侧边抽屉）/ ui-bottom-dock
 *  30      — 设置弹窗等 modal
 *  32      — 全屏时 modal 提升层
 * 2599    — ui-utility-mask（Teleport 到 body）
 * 2600    — ui-bottom-drawer（Teleport 到 body）
 */
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

@media (min-width: 761px) {
  .ui-host-body {
    padding-left: 14px;
    padding-right: 14px;
  }

  /* 桌面端抽屉尺寸微调（定位已在默认样式中统一为 fixed 居中） */
  .ui-bottom-drawer {
    width: min(94vw, calc(var(--reader-content-max, 72rem) + 180px));
    height: 480px;
    max-height: 480px;
  }

  .ui-bottom-drawer.is-map {
    width: min(94vw, calc(var(--reader-content-max, 72rem) + 180px));
    height: 500px;
    max-height: 500px;
  }
}

.ui-sidebar {
  position: absolute;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  left: 0;
  top: 0;
  bottom: 0;
  height: 100%;
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

.ui-sidebar-right {
  left: auto;
  right: 0;
  border-right: 0;
  border-left: 1px solid var(--demo-border-accent-soft);
  box-shadow:
    -10px 0 34px color-mix(in srgb, var(--shadow-color) 88%, transparent),
    inset 1px 0 0 color-mix(in srgb, var(--primary) 12%, transparent);
  transform: translateX(100%);
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
  width: 16px;
  height: 108px;
  padding: 6px 0;
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
  transform: translateX(320px) translateY(-50%);
  opacity: 0;
  pointer-events: none;
}

.ui-sidebar-toggle-right {
  left: auto;
  right: 0;
  border-left: 1px solid var(--demo-border-accent-soft);
  border-right: 0;
  box-shadow:
    -6px 0 18px color-mix(in srgb, var(--shadow-color) 68%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--primary) 10%, transparent);
}

.ui-sidebar-toggle-right:hover {
  box-shadow:
    -8px 0 22px color-mix(in srgb, var(--shadow-color) 78%, transparent),
    0 0 18px color-mix(in srgb, var(--primary) 14%, transparent);
}

.ui-sidebar-toggle-right.open {
  transform: translateX(-320px) translateY(-50%);
  opacity: 0;
  pointer-events: none;
}

.ui-sidebar-toggle-right .ui-sidebar-toggle-label {
  transform: none;
}

.ui-sidebar-toggle-label {
  position: static;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-family: var(--demo-font-mono);
  font-size: 8px;
  line-height: 1;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--demo-text-accent) 56%, transparent);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  text-shadow: 0 0 10px color-mix(in srgb, var(--primary) 18%, transparent);
  white-space: nowrap;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  aspect-ratio: 1;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  color: var(--demo-text-primary);
}

.ui-sidebar-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.ui-sidebar-body-gallery {
  overflow: hidden;
}

.ui-gallery-panel-host {
  flex: 1 1 0;
  height: 100%;
  min-height: 0;
}

.ui-sidebar-footer {
  flex: 0 0 auto;
  padding: 0 12px 12px;
}

.ui-sidebar-footer-gallery {
  position: sticky;
  bottom: 0;
  z-index: 1;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--background) 0%, transparent),
    color-mix(in srgb, var(--background) 92%, transparent) 20%
  );
}

.ui-sidebar-footer-btn {
  width: 100%;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 28%, transparent);
  color: var(--demo-text-primary);
  font-family: var(--demo-font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
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
  position: relative;
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
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 14px;
  position: relative;
  z-index: 5;
}

.ui-bottom-console-strip {
  flex-shrink: 0;
  width: 100%;
  max-width: min(100%, calc(var(--reader-content-max, 72rem) + 180px));
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface) 22%, transparent),
      color-mix(in srgb, var(--surface) 12%, transparent)
    ),
    color-mix(in srgb, var(--background) 46%, transparent);
  box-shadow:
    0 12px 28px color-mix(in srgb, var(--shadow-color) 36%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--primary) 8%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.ui-role-rack {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  padding: 2px 0 4px;
}

.ui-role-card {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 20%, transparent);
  color: var(--demo-text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex: 0 0 auto;
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.ui-role-card.active {
  border-color: var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--demo-text-accent);
}

.ui-role-card:not(.active):hover {
  border-color: color-mix(in srgb, var(--primary) 34%, transparent);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  transform: translateY(-1px);
}

.ui-role-led {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground) 24%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 6%, transparent);
}

.ui-role-led.status-active {
  background: var(--demo-color-neon);
  box-shadow: 0 0 10px color-mix(in srgb, var(--demo-color-neon) 42%, transparent);
}

.ui-role-led.status-idle {
  background: var(--demo-color-idle);
}

.ui-role-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.ui-bottom-console-balance {
  min-height: 1px;
}

.ui-bottom-tools {
  position: relative;
  z-index: 16;
  justify-self: center;
}

.ui-bottom-tool-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: fit-content;
  margin: 0;
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.ui-tool-desktop-only {
  display: inline-flex;
}

/* 抽屉面板已 Teleport 到 body，统一使用 fixed 定位 */
.ui-bottom-drawer {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2600;
  width: min(94vw, 56rem);
  max-height: min(80vh, 42rem);
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

.ui-bottom-drawer.is-map,
.ui-bottom-drawer.is-system {
  width: min(94vw, 72rem);
  max-height: min(92%, 80rem);
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
  flex: 1 1 0;
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

/* 遮罩已 Teleport 到 body，z-index 需低于抽屉(2600)但高于页面内容 */
.ui-utility-mask {
  position: fixed;
  inset: 0;
  z-index: 2599;
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

/* 动画需保留居中的 translate(-50%,-50%)，在此基础上叠加 Y 偏移 */
.utility-drawer-rise-enter-from,
.utility-drawer-rise-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) translateY(14px);
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

  .ui-sidebar-right {
    left: auto;
    right: 0;
    box-shadow: -14px 0 34px color-mix(in srgb, var(--shadow-color) 82%, transparent);
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

  .ui-sidebar {
    width: 85vw;
  }

  .ui-topbar,
  .ui-transcript-panel,
  .ui-bottom-dock {
    padding-left: 6px;
    padding-right: 6px;
  }

  .ui-bottom-dock {
    padding-bottom: 4px;
    gap: 4px;
  }

  .ui-bottom-console-strip {
    max-width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 4px;
    clip-path: none;
    border-radius: 18px;
  }

  .ui-role-rack {
    display: none;
  }

  .ui-bottom-console-balance {
    display: none;
  }

  .ui-bottom-tools {
    width: 100%;
    justify-self: auto;
  }

  .ui-topbar {
    gap: 8px;
    padding: 8px 10px;
    align-items: flex-start;
  }

  .ui-topbar-actions {
    display: flex;
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ui-online {
    display: none;
  }

  .ui-icon-btn {
    min-height: 30px;
    flex: 1 1 calc(33.333% - 4px);
    justify-content: center;
    min-width: 0;
    padding: 0 8px;
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .ui-bottom-tool-row {
    width: 100%;
    padding: 4px 6px;
    gap: 4px;
    justify-content: space-between;
  }

  .ui-tool-desktop-only {
    display: none;
  }

  .ui-bottom-tool-row .ui-signal-btn {
    flex: 1 1 auto;
    justify-content: center;
    min-height: 24px;
    min-width: 0;
    padding: 0 6px;
    gap: 3px;
    font-size: 9px;
    white-space: nowrap;
  }

  .ui-bottom-tool-row .ui-signal-btn .ui-bars {
    display: inline-flex;
  }

  .ui-bottom-tool-row .ui-signal-btn .ui-bars i {
    width: 3px;
    height: 8px;
  }

  /* 移动端抽屉：固定在视口底部偏上，覆盖大部分屏幕 */
  .ui-bottom-drawer {
    top: auto;
    left: 3vw;
    right: 3vw;
    bottom: 80px;
    width: 94vw;
    max-height: calc(100% - 30px);
    transform: none;
    border-radius: 18px 18px 12px 12px;
    z-index: 2600;
  }

  .ui-bottom-drawer.is-map {
    max-height: calc(100% - 16px);
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
    height: auto;
    max-height: min(94%, 46rem);
    width: calc(100% - 12px);
    left: 6px;
    right: 6px;
    bottom: 6px;
    border-radius: 22px;
    transform: translateY(100%);
  }

  .ui-sidebar.open {
    transform: translateY(0);
  }

  .ui-sidebar-right {
    left: 6px;
    right: 6px;
    width: calc(100% - 12px);
    transform: translateY(100%);
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

  .ui-sidebar-footer {
    padding: 0 8px 8px;
  }

  .ui-sidebar-toggle {
    position: fixed;
    top: 50%;
    left: 0;
    width: 20px;
    height: 112px;
    min-height: 112px;
    padding: 0;
    border-radius: 0 14px 14px 0;
    border-top: 0;
    z-index: 32;
    transform: translateY(-50%);
  }

  .ui-sidebar-toggle.open {
    transform: translateY(-50%);
  }

  .ui-sidebar-toggle-right {
    left: auto;
    right: 0;
    border-radius: 14px 0 0 14px;
  }

  .ui-sidebar-toggle-right.open {
    transform: translateY(-50%);
  }

  .ui-sidebar-toggle-label {
    font-size: 8px;
    line-height: 1;
    letter-spacing: 0.06em;
    text-align: center;
  }
}

/* ═══════════════════════════════════════════════
   全屏模式
   运行在 iframe 内，不能用 position:fixed 突破，
   改为：JS 读取宿主视口高度（不减 padding）→ 铺满 iframe → 去圆角
   ═══════════════════════════════════════════════ */

.ui-host-shell.is-fullscreen {
  /* 不用 fixed —— iframe 中 fixed 仅限 iframe 内部 */
  min-height: 0;
  border-radius: 0;
}

/* 全屏 - 顶栏：紧凑化 */
.ui-host-shell.is-fullscreen .ui-topbar {
  padding: 8px 20px;
  gap: 16px;
}

/* 全屏 - 内容区域：去除 padding，让 main-panel 自己居中 */
.ui-host-shell.is-fullscreen .ui-host-body {
  padding-left: 0;
  padding-right: 0;
}

/* 全屏 - main-panel：居中，左侧留出 toggle 按钮空间 */
.ui-host-shell.is-fullscreen .ui-main-panel {
  margin-left: auto;
  margin-right: auto;
  width: 100%;
  /* 左侧给 sidebar-toggle (22px) 留出视觉空间，右侧对称 */
  padding-left: 26px;
  padding-right: 26px;
  box-sizing: border-box;
}

/* 全屏 - 对话区域：阅读内边距 */
.ui-host-shell.is-fullscreen .ui-transcript-panel {
  padding-left: 16px;
  padding-right: 16px;
}

/* 全屏 - 底部 dock */
.ui-host-shell.is-fullscreen .ui-bottom-dock {
  padding-left: 16px;
  padding-right: 16px;
}

/* 全屏 - 侧边栏加宽 */
.ui-host-shell.is-fullscreen .ui-sidebar {
  width: 360px;
}

/* 桌面端全屏（≥761px） */
@media (min-width: 761px) {
  .ui-host-shell.is-fullscreen .ui-topbar {
    padding: 10px 28px;
  }

  .ui-host-shell.is-fullscreen .ui-host-body {
    padding-left: 0;
    padding-right: 0;
  }

  .ui-host-shell.is-fullscreen .ui-main-panel {
    padding-left: 26px;
    padding-right: 26px;
  }

  .ui-host-shell.is-fullscreen .ui-transcript-panel {
    padding-left: 28px;
    padding-right: 28px;
  }

  .ui-host-shell.is-fullscreen .ui-bottom-dock {
    padding-left: 24px;
    padding-right: 24px;
  }

  .ui-host-shell.is-fullscreen .ui-sidebar {
    width: 380px;
  }
}

/* 宽屏全屏（≥1200px）：内容列居中，自适应宽度 */
@media (min-width: 1200px) {
  .ui-host-shell.is-fullscreen .ui-main-panel {
    max-width: min(82vw, 1400px);
    padding-left: 26px;
    padding-right: 26px;
  }

  .ui-host-shell.is-fullscreen .ui-transcript-panel {
    padding-left: 36px;
    padding-right: 36px;
  }

  .ui-host-shell.is-fullscreen .ui-bottom-dock {
    padding-left: 32px;
    padding-right: 32px;
  }

  .ui-host-shell.is-fullscreen .ui-sidebar {
    width: 400px;
  }
}

/* 超宽屏全屏（≥1600px） */
@media (min-width: 1600px) {
  .ui-host-shell.is-fullscreen .ui-main-panel {
    max-width: min(78vw, 1800px);
    padding-left: 26px;
    padding-right: 26px;
  }

  .ui-host-shell.is-fullscreen .ui-transcript-panel {
    padding-left: 56px;
    padding-right: 56px;
  }

  .ui-host-shell.is-fullscreen .ui-bottom-dock {
    padding-left: 48px;
    padding-right: 48px;
  }
}

/* 2K+ 全屏（≥2200px） */
@media (min-width: 2200px) {
  .ui-host-shell.is-fullscreen .ui-main-panel {
    max-width: min(72vw, 2200px);
  }
}

/* 移动端全屏 */
@media (max-width: 760px) {
  .ui-host-shell.is-fullscreen .ui-topbar {
    padding: 6px 10px;
  }

  .ui-host-shell.is-fullscreen .ui-main-panel {
    padding-left: 22px;
    padding-right: 22px;
  }

  .ui-host-shell.is-fullscreen .ui-transcript-panel {
    padding-left: 10px;
    padding-right: 10px;
  }

  .ui-host-shell.is-fullscreen .ui-bottom-dock {
    padding-left: 8px;
    padding-right: 8px;
    padding-bottom: 8px;
  }
}
</style>
