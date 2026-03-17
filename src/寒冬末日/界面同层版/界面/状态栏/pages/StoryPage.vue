<template>
  <section class="ui-host-shell" :style="shellStyleVars">
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
              @open-detail="openDetail"
              @image-intent="handleTranscriptImageIntent"
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
                        <span
                          v-for="pill in activeUtilityPills"
                          :key="pill.label"
                          class="ui-drawer-pill clip-corner-sm"
                        >
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
import type { TranscriptItem } from '../types';

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
import { parseGeneratedImageActivationPayload } from '../generatedImageActivation';
import { convertIframePointToHostPoint, resolveHostTriggerTargetFromPoint } from '../hostCoordinateTarget';
import { PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR, isPluginNativeImageElement } from '../pluginNativeImageSelectors';
import { resolveWithRetry } from '../hostTargetRetry';
import { resolveTranscriptDoubleClickMessageId } from '../transcriptDoubleClick';
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
} = useStreamingDemo();

const transcriptListRef = ref<InstanceType<typeof TranscriptList> | null>(null);
const composerRef = ref<InstanceType<typeof BottomComposer> | null>(null);
const readerShellHeight = ref('720px');
const initialTranscriptAnchored = ref(false);
const roleDrawerOpen = ref(false);
const galleryDrawerOpen = ref(false);
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

  pushDoc(document);
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
  try {
    if (typeof retrieveDisplayedMessage === 'function') {
      const $mes = retrieveDisplayedMessage(messageId);
      const root = $mes?.get?.(0) as HTMLElement | undefined;
      if (root) {
        return (
          (root.querySelector('.mes_text') as HTMLElement | null) ??
          (root.querySelector('.mes_block') as HTMLElement | null) ??
          (root.querySelector('.message_text') as HTMLElement | null) ??
          root
        );
      }
    }
  } catch {
    // ignore
  }

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
          const target = resolveHostTriggerTargetFromPoint(hostDocument as any, hostPoint) as HTMLElement | null;
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

function decodePromptToken(value: string): string {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch {
    return String(value ?? '');
  }
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

function resolveHostImageTarget(
  messageId: number,
  promptToken: string,
  requestId: string,
  imageSrc: string,
): { hostImage: HTMLImageElement | null; hostButton: HTMLElement | null } {
  const buttonByRequestId = requestId ? resolveHostImageButtonByRequestId(messageId, requestId) : null;
  const imageByRequestId = requestId ? resolveHostImageNodeByRequestId(messageId, requestId) : null;
  if (imageByRequestId || buttonByRequestId) {
    return {
      hostImage: imageByRequestId ?? resolveHostImageNodeByPromptToken(messageId, promptToken),
      hostButton: buttonByRequestId ?? resolveHostImageButtonByPromptToken(messageId, promptToken),
    };
  }

  const imageBySrc = imageSrc ? resolveHostImageNodeBySrc(messageId, imageSrc) : null;
  if (imageBySrc) {
    const span = imageBySrc.closest('.st-chatu8-image-span') as HTMLElement | null;
    const spanRequestId = String(span?.dataset.requestId ?? span?.getAttribute('data-request-id') ?? '').trim();
    return {
      hostImage: imageBySrc,
      hostButton:
        resolveHostImageButtonByRequestId(messageId, spanRequestId) ??
        resolveHostImageButtonByPromptToken(messageId, promptToken),
    };
  }

  return {
    hostImage: resolveHostImageNodeByPromptToken(messageId, promptToken),
    hostButton: resolveHostImageButtonByPromptToken(messageId, promptToken),
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
    target.dispatchEvent(
      new view.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    return true;
  } catch {
    return false;
  }
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
    target.dispatchEvent(
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
    return true;
  } catch {
    return false;
  }
}

async function proxyImageMenuToHost(item: TranscriptItem, event?: MouseEvent | null) {
  const messageId = Math.trunc(Number(item?.message_id));
  if (!Number.isFinite(messageId) || messageId < 0) return;
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

  const target = await resolveWithRetry(() => resolveHostMessageTriggerTargetFromEvent(messageId, event), {
    attempts: 5,
    delayMs: 90,
  });
  if (!target) {
    toastr?.warning?.(`未找到楼层 #${messageId} 的原生正文节点`);
    return;
  }
  if (!dispatchHostDoubleClick(target, hostPoint)) {
    toastr?.warning?.(`楼层 #${messageId} 的原生生图菜单触发失败`);
  }
}

function handleTranscriptDoubleClickCapture(event: MouseEvent) {
  const rawMessageId = resolveTranscriptDoubleClickMessageId(event.target);
  if (!Number.isFinite(rawMessageId) || rawMessageId == null || rawMessageId < 0) return;

  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as MouseEvent & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
  beginPendingImageTask(Math.trunc(rawMessageId));
  void proxyImageMenuToHost({ message_id: Math.trunc(rawMessageId) } as TranscriptItem, event);
}

function handleTranscriptIntentCapture(event: MouseEvent | PointerEvent | TouchEvent) {
  const rawMessageId = resolveTranscriptDoubleClickMessageId(event.target);
  if (!Number.isFinite(rawMessageId) || rawMessageId == null || rawMessageId < 0) return;
  markRecentImageIntent(Math.trunc(rawMessageId), 'transcript');
}

function handleTranscriptImageIntent(item: TranscriptItem) {
  const messageId = Math.trunc(Number(item?.message_id));
  if (!Number.isFinite(messageId) || messageId < 0) return;
  markRecentImageIntent(messageId, 'transcript');
}

function handleGeneratedImageClickCapture(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!(target instanceof HTMLImageElement)) return;
  if (!isPluginNativeImageElement(target)) return;
  const carrier = target.closest(PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR) as HTMLElement | null;
  if (!carrier) return;

  const { messageId, promptToken, requestId, imageSrc } = parseGeneratedImageActivationPayload({
    carrierDataset: carrier.dataset,
    targetDataset: target.dataset,
    targetAttrSrc: target.getAttribute('src'),
    targetCurrentSrc: target.currentSrc,
    targetSrc: target.getAttribute('src'),
  });
  if (!Number.isFinite(messageId)) return;

  const { hostImage } = resolveHostImageTarget(Math.trunc(messageId), promptToken, requestId, imageSrc);
  if (!hostImage) return;
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as MouseEvent & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
  triggerHostElementClick(hostImage);
}

function handleGeneratedImageDoubleClickCapture(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!(target instanceof HTMLImageElement)) return;
  if (!isPluginNativeImageElement(target)) return;
  const carrier = target.closest(PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR) as HTMLElement | null;
  if (!carrier) return;

  const { messageId, promptToken, requestId, imageSrc } = parseGeneratedImageActivationPayload({
    carrierDataset: carrier.dataset,
    targetDataset: target.dataset,
    targetAttrSrc: target.getAttribute('src'),
    targetCurrentSrc: target.currentSrc,
    targetSrc: target.getAttribute('src'),
  });
  if (!Number.isFinite(messageId)) return;

  const { hostImage, hostButton } = resolveHostImageTarget(Math.trunc(messageId), promptToken, requestId, imageSrc);
  const targetNode = hostButton ?? hostImage;
  if (!targetNode) return;
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as MouseEvent & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
  markRecentImageIntent(Math.trunc(messageId), 'gallery');
  beginPendingImageTask(Math.trunc(messageId));
  dispatchHostDoubleClick(targetNode);
}

function handleGeneratedImagePointerDownCapture(event: PointerEvent) {
  if (event.pointerType !== 'touch') return;
  const target = event.target as HTMLElement | null;
  if (!(target instanceof HTMLImageElement)) return;
  if (!isPluginNativeImageElement(target)) return;
  const carrier = target.closest(PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR) as HTMLElement | null;
  if (!carrier) return;

  event.stopPropagation();
  const nativeEvent = event as PointerEvent & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
}

function handleGeneratedImagePointerUpCapture(event: PointerEvent) {
  if (event.pointerType !== 'touch') return;
  const target = event.target as HTMLElement | null;
  if (!(target instanceof HTMLImageElement)) return;
  if (!isPluginNativeImageElement(target)) return;
  const carrier = target.closest(PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR) as HTMLElement | null;
  if (!carrier) return;

  const { messageId, promptToken, requestId, imageSrc } = parseGeneratedImageActivationPayload({
    carrierDataset: carrier.dataset,
    targetDataset: target.dataset,
    targetAttrSrc: target.getAttribute('src'),
    targetCurrentSrc: target.currentSrc,
    targetSrc: target.getAttribute('src'),
  });
  if (!Number.isFinite(messageId)) return;

  const { hostImage } = resolveHostImageTarget(Math.trunc(messageId), promptToken, requestId, imageSrc);
  if (!hostImage) return;
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as PointerEvent & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
  triggerHostElementClick(hostImage);
}

useEventListener(document, 'pointerdown', handleTranscriptIntentCapture, { capture: true });
useEventListener(document, 'click', handleTranscriptIntentCapture, { capture: true });
useEventListener(document, 'dblclick', handleTranscriptDoubleClickCapture, { capture: true });
useEventListener(document, 'pointerdown', handleGeneratedImagePointerDownCapture, { capture: true });
useEventListener(document, 'pointerup', handleGeneratedImagePointerUpCapture, { capture: true });
useEventListener(document, 'click', handleGeneratedImageClickCapture, { capture: true });
useEventListener(document, 'dblclick', handleGeneratedImageDoubleClickCapture, { capture: true });

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

useEventListener(window, 'keydown', event => {
  if (event.key !== 'Escape') return;
  if (roleDrawerOpen.value || galleryDrawerOpen.value) closeSideDrawers();
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

@media (min-width: 761px) {
  .ui-host-body {
    padding-left: 14px;
    padding-right: 14px;
  }

  /* 修复非移动端底部抽屉显示问题 */
  .ui-bottom-drawer {
    /* 改为相对于可视区域定位，避免被overflow:hidden裁剪 */
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    /* 从地图按钮上方拉出，宽度和父容器相同 */
    bottom: auto;
    top: 50%;
    margin-top: -240px;
    /* 宽度与父容器相同 */
    width: min(100%, calc(var(--reader-content-max, 72rem) + 180px));
    max-width: min(100%, calc(var(--reader-content-max, 72rem) + 180px));
    height: 480px;
    max-height: 480px;
  }

  .ui-bottom-drawer.is-map {
    width: min(100%, calc(var(--reader-content-max, 72rem) + 180px));
    max-width: min(100%, calc(var(--reader-content-max, 72rem) + 180px));
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
  width: 22px;
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

  .ui-bottom-console-strip {
    max-width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 6px;
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
    min-height: 28px;
    min-width: 0;
    padding: 0 8px;
    gap: 4px;
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
    height: min(calc(100dvh - 64px), 46rem);
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

  .ui-sidebar-right {
    left: 6px;
    right: 6px;
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
    width: 28px;
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
</style>
