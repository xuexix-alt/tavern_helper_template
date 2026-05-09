<template>
  <section
    ref="shellRef"
    class="ui-host-shell"
    :class="[`layout-${shellLayoutMode.replace('_', '-')}`, { 'is-fullscreen': isFullscreen }]"
    :style="shellStyleVars"
  >
    <header class="ui-topbar">
      <div class="ui-topbar-brand">
        <span class="ui-dot"></span>
        <span class="ui-brand-copy">EDEN-STAR</span>
      </div>

      <div class="ui-topbar-actions">
        <span v-if="shellLayoutMode === 'wide'" class="ui-online">● 在线</span>

        <div ref="transcriptWindowMenuRef" class="ui-page-menu">
          <button
            type="button"
            class="ui-icon-btn ui-page-menu-trigger"
            :class="{ active: transcriptWindowMenuOpen || isTranscriptHistoryMode }"
            @click.stop="toggleTranscriptWindowMenu"
          >
            <span>楼层</span>
            <span class="ui-page-menu-value">{{ transcriptWindowLabel || '最新' }}</span>
          </button>

          <transition name="toolbar-menu-fade">
            <div v-if="transcriptWindowMenuOpen" class="ui-page-menu-list clip-corner-sm">
              <button
                v-for="page in transcriptWindowPages"
                :key="page.key"
                type="button"
                class="ui-page-menu-item"
                :class="{ active: transcriptWindowLabel === page.label }"
                @click="selectTranscriptWindowPage(page.pageIndex)"
              >
                {{ page.label }}
              </button>
            </div>
          </transition>
        </div>

        <template v-if="shellLayoutMode === 'wide'">
          <button type="button" class="ui-icon-btn" :class="{ active: galleryDrawerOpen }" @click="toggleGalleryDrawer">
            画廊
          </button>

          <button type="button" class="ui-icon-btn" @click="openSettingsModal">排版</button>

          <button
            type="button"
            class="ui-icon-btn ui-fullscreen-btn"
            :class="{ 'is-active-fullscreen': isFullscreen }"
            @click="toggleFullscreen"
          >
            {{ isFullscreen ? '✕ 退出全屏' : '全屏' }}
          </button>

          <button type="button" class="ui-icon-btn" @click="handleDisableSameLayer">关闭同层</button>
        </template>

        <div v-else ref="topbarMoreMenuRef" class="ui-page-menu ui-more-menu">
          <button
            type="button"
            class="ui-icon-btn ui-more-trigger"
            :class="{ active: topbarMoreMenuOpen }"
            @click.stop="toggleTopbarMoreMenu"
          >
            更多
          </button>

          <transition name="toolbar-menu-fade">
            <div v-if="topbarMoreMenuOpen" class="ui-more-menu-list clip-corner-sm">
              <button type="button" class="ui-page-menu-item" @click="openRoleDrawerFromMoreMenu">角色</button>
              <button type="button" class="ui-page-menu-item" @click="openGalleryDrawerFromMoreMenu">画廊</button>
              <button type="button" class="ui-page-menu-item" @click="openSettingsFromMoreMenu">排版</button>
              <button type="button" class="ui-page-menu-item" @click="toggleFullscreenFromMoreMenu">
                {{ isFullscreen ? '退出全屏' : '全屏' }}
              </button>
              <button type="button" class="ui-page-menu-item" @click="disableSameLayerFromMoreMenu">关闭同层</button>
            </div>
          </transition>
        </div>
      </div>
    </header>

    <div class="ui-host-body">
      <transition name="sidebar-mask-fade">
        <div v-if="roleDrawerOpen || galleryDrawerOpen" class="ui-sidebar-mask" @click="closeSideDrawers"></div>
      </transition>

      <button type="button" class="ui-sidebar-toggle" :class="{ open: roleDrawerOpen }" @click="toggleRoleDrawer">
        <span class="ui-sidebar-toggle-label">{{ shellLayoutMode === 'wide' ? '[ 角色&系统 ]' : '角色' }}</span>
      </button>

      <button
        type="button"
        class="ui-sidebar-toggle ui-sidebar-toggle-right"
        :class="{ open: galleryDrawerOpen }"
        @click="toggleGalleryDrawer"
      >
        <span class="ui-sidebar-toggle-label">{{ shellLayoutMode === 'wide' ? '[ 画廊&图片 ]' : '画廊' }}</span>
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
            v-if="roleDrawerOpen"
            :target-message-id="currentMvuAnchorMessageId"
            :transcript-items="transcript"
            :refresh-revision="mvuSourceRevision"
            :active-character-key="activeRoleKey"
            :calibrating-daily-roll="isCalibratingDailyRoll"
            :gallery-entries="galleryEntries"
            :role-portrait-overrides="rolePortraitOverrides"
            @select-character="handleRoleSelect"
            @select-role-portrait="selectRolePortraitForRole"
            @add-role-portrait-set-image="addRolePortraitSetImageForRole"
            @portrait-error="handleRolePortraitError"
            @calibrate-daily-roll="calibrateDailyRollDate"
            @collapse="closeRoleDrawer"
          />
        </div>
      </aside>

      <!-- 画廊抽屉（右侧） -->
      <aside class="ui-sidebar ui-sidebar-right" :class="{ open: galleryDrawerOpen }">
        <div class="ui-sidebar-head">
          <div>
            <span class="demo-kicker">GALLERY // IMAGES</span>
            <strong>图片画廊</strong>
          </div>
          <button type="button" class="ui-close-btn" @click="closeGalleryDrawer">✕</button>
        </div>
        <div class="ui-sidebar-body">
          <ImageGalleryPanel
            v-if="galleryDrawerOpen"
            :entries="galleryEntries"
            :active-message-id="latestAssistantItem?.message_id ?? null"
            :loading-older="loadingOlderGalleryImages"
            :has-more-older="hasMoreOlderGalleryImages"
            @image-view="activateGeneratedImageView"
            @image-regenerate="activateGeneratedImageRegenerate"
            @jump-message="jumpToTranscriptMessage"
            @load-older="loadOlderGalleryImages"
            @close="closeGalleryDrawer"
          />
        </div>
      </aside>

      <main class="ui-main-panel">
        <section class="ui-transcript-panel">
          <div class="ui-transcript-stage">
            <div v-if="isTranscriptHistoryMode" class="ui-history-badge clip-corner-sm">
              历史
              <strong>{{ transcriptWindowLabel.replace(/^历史\s*/, '') }}</strong>
            </div>
            <TranscriptList
              ref="transcriptListRef"
              :items="visibleTranscript"
              :density="density"
              :font-mode="fontMode"
              :busy="busy"
              :should-follow-latest="followLatest"
              :is-streaming="status === 'streaming'"
              :opening-expanded="openingExpanded"
              :latest-user-message-id="latestUserItem?.message_id ?? null"
              :editing-user-message-id="editingUserMessageId"
              :editing-user-draft="editingUserDraft"
              :rollback-confirm-message-id="rollbackConfirmMessageId"
              :render-revision="transcriptDomRevision"
              :gallery-entries="galleryEntries"
              :layout-mode="shellLayoutMode"
              @generate-image="handleTranscriptGenerateImage"
              @open-gallery="handleOpenGallery"
              @open-detail="openDetail"
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
                <span>{{ role.label }}</span>
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
                  :disabled="!latestAssistantItem"
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
            :can-reprocess-variables="canReprocessVariables"
            :reprocess-variables-hint="reprocessVariablesHint"
            :reprocess-variables-pending="reprocessVariablesPending"
            :can-generate-latest-image="Boolean(latestAssistantItem)"
            :role-tabs="visibleRoleTabs"
            :active-role-key="activeRoleKey"
            :layout-mode="shellLayoutMode"
            :show-option-trigger="false"
            :show-toolbar="false"
            @submit="handleComposerSubmit"
            @roll="rollLatestTurn"
            @open-role="openRoleFromComposer"
            @reprocess-variables="handleReprocessVariablesFromChoiceModal"
            @generate-latest-image="handleChoiceModalGenerateLatestImage"
          />
        </section>
      </main>
    </div>

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
        :at-latest="followLatest"
        :is-browsing-history="isTranscriptHistoryMode"
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
import { useElementSize, useEventListener } from '@vueuse/core';
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue';
import {
  parseGeneratedImageActivationPayload,
  type GeneratedImageActivationPayload,
} from '../generatedImageActivation';
import type { ReaderGalleryEntry, TranscriptItem } from '../types';

import openingModalIcon from '../assets/opening-modal-icon.webp?url';
import BottomComposer from '../components/BottomComposer.vue';
import ComponentLibraryPanel from '../components/ComponentLibraryPanel.vue';
import HudModal from '../components/HudModal.vue';
import ImageGalleryPanel from '../components/ImageGalleryPanel.vue';
import MapBusinessPanel from '../components/MapBusinessPanel.vue';
import MessageDetailModal from '../components/MessageDetailModal.vue';
import MvuRolePanel from '../components/MvuRolePanel.vue';
import OpeningSetupPanel from '../components/OpeningSetupPanel.vue';
import TopToolbar from '../components/TopToolbar.vue';
import TranscriptList from '../components/TranscriptList.vue';
import WorkbenchTabs from '../components/WorkbenchTabs.vue';
import { buildIframeMessageRootSelectors } from '../generatedImageDom';
import { selectGeneratedImageTriggerTarget } from '../generatedImageTriggerTarget';
import {
  listReachableHostWindows as collectReachableHostWindows,
  findNextImageElement,
  isBridgedEvent,
  markBridgedEvent,
  normalizeImageSrcForCompare,
  normalizePromptTokenForCompare,
  resolveHostImageButtonByPromptToken,
  resolveHostImageButtonByRequestId,
  resolveHostImageNodeByPromptToken,
  resolveHostImageNodeByRequestId,
  resolveHostImageNodeBySrc,
  resolveHostMessageTriggerTarget,
  resolveWithRetry,
} from '../hostBridge';
import {
  convertIframePointToHostPoint,
  resolveHostDispatchPlanWithRetry,
  resolveHostMessageTargetFromPoint,
} from '../hostCoordinateTarget';
import {
  dispatchHostPrimaryTrigger,
  type HostGestureDispatchStrategy,
  type HostGesturePoint,
} from '../hostGestureDispatch';
import { useMvuRoleStore } from '../mvuRoleStore';
import { PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR, isPluginNativeImageElement } from '../pluginNativeImageSelectors';
import {
  addRolePortraitSetImage,
  readRolePortraitOverrides,
  setPrimaryRolePortraitOverride,
  writeRolePortraitOverrides,
  type RolePortraitOverrideMap,
} from '../rolePortraits';
import { resolveTranscriptDoubleClickMessageId } from '../transcriptDoubleClick';
import { shouldSkipTranscriptImageTrigger } from '../transcriptImageTriggerDeduper';
import { useStreamingDemo } from '../useStreamingDemo';

const {
  input,
  busy,
  status,
  filterMode,
  density,
  theme,
  fontMode,
  readingMode,
  followLatest,
  isTranscriptHistoryMode,
  transcriptWindowLabel,
  transcriptWindowPages,
  openingExpanded,
  selectedItem,
  transcript,
  visibleTranscript,
  transcriptStats,
  mvuSourceRevision,
  currentMvuAnchorMessageId,
  latestUserItem,
  latestAssistantItem,
  reprocessVariablesPending,
  transcriptDomRevision,
  galleryEntries,
  loadingOlderGalleryImages,
  hasMoreOlderGalleryImages,
  readerSummary,
  logs,
  beginPendingImageTask,
  editingUserMessageId,
  editingUserDraft,
  rollbackConfirmMessageId,
  openingPreset,
  openingPayload,
  openingWorldModes,
  openingRoutes,
  shouldShowOpeningSetup,
  canDismissOpeningSetup,
  runDemo,
  submitPromptViaSameLayer,
  disableSameLayerUi,
  rollLatestTurn,
  reprocessLatestAssistantVariables,
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
  setReadingMode,
  selectTranscriptWindowPage: selectTranscriptWindowPageState,
  toggleOpeningExpanded,
  openDetail,
  closeDetail,
  withHostTranscriptVisible,
  ensureHostMesTextRendered,
  triggerImageGenerationForMessage,
  loadOlderGalleryImages,
  calibrateDailyRollDate,
  isCalibratingDailyRoll,
} = useStreamingDemo();

const transcriptListRef = ref<InstanceType<typeof TranscriptList> | null>(null);
const composerRef = ref<InstanceType<typeof BottomComposer> | null>(null);
const shellRef = ref<HTMLElement | null>(null);
const transcriptWindowMenuRef = ref<HTMLElement | null>(null);
const transcriptWindowMenuOpen = ref(false);
const topbarMoreMenuRef = ref<HTMLElement | null>(null);
const topbarMoreMenuOpen = ref(false);
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

const activeRoleKey = ref<string | null>(null);
const rolePortraitOverrides = ref<RolePortraitOverrideMap>(readRolePortraitOverrides());
const roleProviderStore = useMvuRoleStore(currentMvuAnchorMessageId);
function buildRoleTabItemsFromProvider(): RoleTabItem[] {
  return [...roleProviderStore.mainRoleEntries.value, ...roleProviderStore.tempNpcEntries.value].map(entry => ({
    key: entry.key,
    label: roleProviderName(entry),
    statusClass: roleProviderStatusClass(entry),
    statusText: roleProviderStatusText(entry),
  }));
}
const roleTabs = computed(() => buildRoleTabItemsFromProvider());
const { width: shellWidth } = useElementSize(shellRef);
const visibleRoleTabs = computed(() => {
  const activeRoleTabs = roleTabs.value.filter(
    role => role.statusText === '登场' || role.statusClass === 'status-active',
  );
  return activeRoleTabs.length > 0 ? activeRoleTabs : roleTabs.value;
});
const shellLayoutMode = computed(() => {
  if (shellWidth.value <= 0) return 'wide';
  if (shellWidth.value <= 560) return 'compact';
  if (shellWidth.value <= 839) return 'reader_desktop';
  return 'wide';
});
type MvuVariableUpdateMode = 'extra_analysis' | 'inline' | 'unknown';
const mvuVariableUpdateMode = ref<MvuVariableUpdateMode>('unknown');
const canReprocessVariables = computed(() => {
  const latestAssistant = latestAssistantItem.value;
  return (
    Boolean(latestAssistant && latestAssistant.role === 'assistant') && !busy.value && !reprocessVariablesPending.value
  );
});
const reprocessVariablesHint = computed(() => {
  const latestAssistant = latestAssistantItem.value;
  if (!latestAssistant || latestAssistant.role !== 'assistant') return '当前没有可重新生成变量的 assistant 楼层';
  if (busy.value) return '正文生成中，等待生成结束后再重试额外模型解析';
  if (reprocessVariablesPending.value) return '额外模型解析正在进行';
  if (mvuVariableUpdateMode.value === 'inline') {
    return '当前 MVU 变量更新方式为“随AI输出”；点击后只提示，不会发起额外模型解析';
  }
  if (mvuVariableUpdateMode.value !== 'extra_analysis') return '无法确认 MVU 变量更新方式是否为“额外模型解析”';
  return '调用 MVU 插件原生“重试额外模型解析”，不走正文生成链';
});

function readMvuVariableUpdateMode(): MvuVariableUpdateMode {
  const updateModeLabel = '变量更新方式';
  const inlineLabel = '随AI输出';
  const extraAnalysisLabel = '额外模型解析';
  const documents: Document[] = [];
  const pushDocument = (doc: Document | null | undefined) => {
    if (doc && !documents.includes(doc)) documents.push(doc);
  };
  const nodeText = (node: Element | null | undefined) =>
    [
      node?.textContent ?? '',
      node?.getAttribute?.('value') ?? '',
      node?.getAttribute?.('aria-label') ?? '',
      node?.getAttribute?.('title') ?? '',
    ].join('\n');
  const closestControlText = (node: Element) =>
    node.closest('label, .flex-container, .inline-drawer-content, .mvu-section, .settings_block, .form-group, div')
      ?.textContent ?? '';
  const isMvuUpdateModeCandidate = (valueText: string, nearbyText: string) =>
    nearbyText.includes(updateModeLabel) ||
    valueText.includes(updateModeLabel) ||
    valueText.includes(inlineLabel) ||
    valueText.includes(extraAnalysisLabel);

  pushDocument(document);
  for (const hostWindow of collectReachableHostWindows()) {
    try {
      pushDocument(hostWindow.document);
    } catch {
      // ignore unreachable frame
    }
  }

  for (const doc of documents) {
    for (const select of Array.from(doc.querySelectorAll('select'))) {
      const htmlSelect = select as HTMLSelectElement;
      const selectedTexts = Array.from(htmlSelect.selectedOptions ?? [])
        .map(option => `${option.textContent ?? ''}\n${(option as HTMLOptionElement).value ?? ''}`)
        .join('\n');
      const valueText = `${htmlSelect.value ?? ''}\n${selectedTexts}`;
      const nearbyText = closestControlText(select);
      if (!isMvuUpdateModeCandidate(valueText, nearbyText)) continue;
      if (valueText.includes(inlineLabel)) return 'inline';
      if (valueText.includes(extraAnalysisLabel)) return 'extra_analysis';
    }

    for (const node of Array.from(doc.querySelectorAll('input:checked, [aria-checked="true"], .selected, .active'))) {
      const valueText = nodeText(node);
      const nearbyText = closestControlText(node);
      if (!isMvuUpdateModeCandidate(valueText, nearbyText)) continue;
      if (valueText.includes(inlineLabel)) return 'inline';
      if (valueText.includes(extraAnalysisLabel)) return 'extra_analysis';
    }
  }

  try {
    const extraAnalysisEnabled = _.get(getVariables({ type: 'global' }) ?? {}, 'extra_analysis');
    if (extraAnalysisEnabled === true) return 'extra_analysis';
    if (extraAnalysisEnabled === false) return 'inline';
  } catch {
    // ignore missing Tavern Helper globals
  }

  return 'unknown';
}

function refreshMvuVariableUpdateMode() {
  mvuVariableUpdateMode.value = readMvuVariableUpdateMode();
}

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

  return [];
});

const shellStyleVars = computed(() => ({
  '--reader-shell-height': readerShellHeight.value,
  '--reader-content-max': isFullscreen.value ? 'min(80vw, 96rem)' : '72rem',
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
  transcriptWindowMenuOpen.value = false;
  selectTranscriptWindowPageState(0);
  nextTick(() => {
    transcriptListRef.value?.scrollToLatest?.();
  });
}

async function handleComposerSubmit(value?: string) {
  const prompt = String(value ?? input.value ?? '').trim();
  if (!prompt) return;
  const submitted = await submitPromptViaSameLayer(prompt, 'ui');
  if (submitted && prompt === String(input.value ?? '').trim()) {
    input.value = '';
  }
}

async function handleDisableSameLayer() {
  await disableSameLayerUi({ restoreHost: true });
}

function anchorTranscriptToLatest(behavior: ScrollBehavior = 'auto') {
  if (!transcriptListRef.value || visibleTranscript.value.length === 0) return false;
  transcriptListRef.value.scrollToBottom?.(behavior);
  return true;
}

function closeRoleDrawer() {
  roleDrawerOpen.value = false;
}

function openRoleDrawer() {
  transcriptWindowMenuOpen.value = false;
  topbarMoreMenuOpen.value = false;
  closeUtilityDrawer();
  roleDrawerOpen.value = true;
}

function openSettingsModal() {
  transcriptWindowMenuOpen.value = false;
  topbarMoreMenuOpen.value = false;
  settingsModalOpen.value = true;
}

function toggleRoleDrawer() {
  if (roleDrawerOpen.value) {
    closeRoleDrawer();
    return;
  }
  openRoleDrawer();
}

function closeGalleryDrawer() {
  galleryDrawerOpen.value = false;
}

function openGalleryDrawer() {
  transcriptWindowMenuOpen.value = false;
  topbarMoreMenuOpen.value = false;
  closeUtilityDrawer();
  roleDrawerOpen.value = false;
  galleryDrawerOpen.value = true;
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
  transcriptWindowMenuOpen.value = false;
  topbarMoreMenuOpen.value = false;
  closeSideDrawers();
  activeUtilityDrawer.value = activeUtilityDrawer.value === type ? null : type;
}

function closeUtilityDrawer() {
  activeUtilityDrawer.value = null;
}

function toggleFullscreen() {
  transcriptWindowMenuOpen.value = false;
  topbarMoreMenuOpen.value = false;
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    document.documentElement.requestFullscreen().catch(() => {
      isFullscreen.value = false;
    });
  }
}

function exitFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  }
}

function toggleTopbarMoreMenu() {
  transcriptWindowMenuOpen.value = false;
  topbarMoreMenuOpen.value = !topbarMoreMenuOpen.value;
}

function openRoleDrawerFromMoreMenu() {
  topbarMoreMenuOpen.value = false;
  openRoleDrawer();
}

function openGalleryDrawerFromMoreMenu() {
  topbarMoreMenuOpen.value = false;
  openGalleryDrawer();
}

function openSettingsFromMoreMenu() {
  topbarMoreMenuOpen.value = false;
  openSettingsModal();
}

function toggleFullscreenFromMoreMenu() {
  topbarMoreMenuOpen.value = false;
  toggleFullscreen();
}

async function disableSameLayerFromMoreMenu() {
  topbarMoreMenuOpen.value = false;
  await handleDisableSameLayer();
}

function handleRoleSelect(key: string) {
  activeRoleKey.value = key;
}

function openRoleFromComposer(key: string) {
  activeRoleKey.value = key;
  closeUtilityDrawer();
  roleDrawerOpen.value = true;
}

function selectRolePortraitForRole(roleKey: string, entry: ReaderGalleryEntry) {
  rolePortraitOverrides.value = {
    ...rolePortraitOverrides.value,
    [roleKey]: setPrimaryRolePortraitOverride(roleKey, rolePortraitOverrides.value[roleKey], entry),
  };
  writeRolePortraitOverrides(rolePortraitOverrides.value);
}

function addRolePortraitSetImageForRole(roleKey: string, entry: ReaderGalleryEntry) {
  rolePortraitOverrides.value = {
    ...rolePortraitOverrides.value,
    [roleKey]: addRolePortraitSetImage(roleKey, rolePortraitOverrides.value[roleKey], entry),
  };
  writeRolePortraitOverrides(rolePortraitOverrides.value);
}

function handleRolePortraitError(key: string) {
  if (!rolePortraitOverrides.value[key]) return;
  const { [key]: _failed, ...rest } = rolePortraitOverrides.value;
  rolePortraitOverrides.value = rest;
  writeRolePortraitOverrides(rolePortraitOverrides.value);
}

function roleProviderName(entry: { key: string; role: Record<string, any> }) {
  return String(entry.role.姓名 ?? entry.key ?? '').trim() || entry.key;
}

function roleProviderStatusText(entry: { role: Record<string, any> }) {
  return String(entry.role.登场状态 ?? '未知');
}

function roleProviderStatusClass(entry: { role: Record<string, any> }) {
  return String(entry.role.登场状态 ?? '').trim() === '登场' ? 'status-active' : 'status-idle';
}

watch(
  roleTabs,
  roles => {
    const visibleRoles = roles.filter(role => role.statusText === '登场' || role.statusClass === 'status-active');
    const roleKeys = new Set(roles.map(role => role.key));
    if (!activeRoleKey.value && visibleRoles[0]) activeRoleKey.value = visibleRoles[0].key;
    if (activeRoleKey.value && !roleKeys.has(activeRoleKey.value)) {
      activeRoleKey.value = visibleRoles[0]?.key ?? null;
    }
  },
  { immediate: true },
);

function jumpToTranscriptMessage(messageId: number) {
  const targetId = Math.trunc(Number(messageId));
  if (!Number.isFinite(targetId) || targetId < 0) return;
  transcriptWindowMenuOpen.value = false;
  topbarMoreMenuOpen.value = false;
  transcriptListRef.value?.scrollToMessage?.(targetId, 'smooth');
  readingMode.value = 'browsing_history';
  if (shellLayoutMode.value !== 'wide') {
    closeSideDrawers();
  }
}

function toggleTranscriptWindowMenu() {
  topbarMoreMenuOpen.value = false;
  transcriptWindowMenuOpen.value = !transcriptWindowMenuOpen.value;
}

function selectTranscriptWindowPage(pageIndex: number) {
  transcriptWindowMenuOpen.value = false;
  topbarMoreMenuOpen.value = false;
  selectTranscriptWindowPageState(pageIndex);
  if (pageIndex === 0) {
    nextTick(() => {
      transcriptListRef.value?.scrollToLatest?.();
    });
  } else {
    nextTick(() => {
      transcriptListRef.value?.scrollToTop?.();
    });
  }
}

useEventListener(document, 'pointerdown', event => {
  const target = event.target as Node | null;
  if (!target) return;
  if (transcriptWindowMenuOpen.value && !transcriptWindowMenuRef.value?.contains(target)) {
    transcriptWindowMenuOpen.value = false;
  }
  if (topbarMoreMenuOpen.value && !topbarMoreMenuRef.value?.contains(target)) {
    topbarMoreMenuOpen.value = false;
  }
});

async function handleOpeningSubmit() {
  openingModalOpen.value = false;
  await generateOpening();
}

function closeOpeningModal() {
  if (!canDismissOpeningSetup.value) return;
  openingModalOpen.value = false;
}

type HostTriggerEvent = MouseEvent | TouchEvent;

function resolveHostPointFromEvent(event?: HostTriggerEvent | null): { clientX: number; clientY: number } | null {
  if (!event) return null;

  if (event instanceof MouseEvent) {
    return {
      clientX: Number(event.clientX),
      clientY: Number(event.clientY),
    };
  }

  const touch = event.touches?.[0] ?? event.changedTouches?.[0] ?? null;
  if (!touch) return null;

  return {
    clientX: Number(touch.clientX),
    clientY: Number(touch.clientY),
  };
}

type TranscriptImageGenerateRequest = {
  messageId: number;
  triggerEvent?: MouseEvent | null;
};

function resolveHostPointFromIframeEvent(event?: HostTriggerEvent | null): HostGesturePoint | null {
  const eventPoint = resolveHostPointFromEvent(event);
  if (!eventPoint) return null;
  try {
    const frameElement = window.frameElement as HTMLElement | null;
    const frameRect = frameElement?.getBoundingClientRect?.();
    if (!frameRect) return eventPoint;
    return convertIframePointToHostPoint(eventPoint, { left: frameRect.left, top: frameRect.top });
  } catch {
    return eventPoint;
  }
}

function resolveHostMessageTriggerTargetFromEvent(
  messageId: number,
  event?: HostTriggerEvent | null,
  options: { preferPointTarget?: boolean } = {},
): HTMLElement | null {
  const directTarget = resolveHostMessageTriggerTarget(messageId);

  if (event) {
    try {
      const frameElement = window.frameElement as HTMLElement | null;
      const frameRect = frameElement?.getBoundingClientRect?.();
      if (frameRect) {
        const eventPoint = resolveHostPointFromEvent(event);
        if (!eventPoint) {
          return directTarget;
        }
        const hostPoint = convertIframePointToHostPoint(eventPoint, { left: frameRect.left, top: frameRect.top });

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

  if (options.preferPointTarget === true) return directTarget;
  return resolveHostMessageTriggerTarget(messageId);
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
  strategy: HostGestureDispatchStrategy = 'auto',
): boolean {
  return dispatchHostPrimaryTrigger(target, { hostPoint, strategy });
}

async function proxyImageMenuToHost(item: TranscriptItem, event?: MouseEvent | null) {
  return proxyImageMenuToHostWithOptions(item, event, { preferPointTarget: event != null });
}

async function proxyImageMenuToHostWithOptions(
  item: TranscriptItem,
  event?: HostTriggerEvent | null,
  options: { preferPointTarget?: boolean } = {},
) {
  const messageId = Math.trunc(Number(item?.message_id));
  if (!Number.isFinite(messageId) || messageId < 0) return;
  await withHostTranscriptVisible(async () => {
    const hostPoint = (() => {
      const eventPoint = resolveHostPointFromEvent(event);
      if (!eventPoint) return null;
      try {
        const frameElement = window.frameElement as HTMLElement | null;
        const frameRect = frameElement?.getBoundingClientRect?.();
        if (!frameRect) return null;
        return convertIframePointToHostPoint(eventPoint, { left: frameRect.left, top: frameRect.top });
      } catch {
        return null;
      }
    })();

    const dispatchPlan = await resolveHostDispatchPlanWithRetry({
      resolveDirectTarget: () => resolveHostMessageTriggerTarget(messageId),
      resolvePointFallbackTarget: () =>
        resolveHostMessageTriggerTargetFromEvent(messageId, event, { preferPointTarget: options.preferPointTarget }),
      hostPoint,
      preferPointFallback: options.preferPointTarget === true && hostPoint != null,
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

async function startTranscriptHostImageProxy(
  messageId: number,
  event?: HostTriggerEvent | null,
  options: { preferPointTarget?: boolean } = {},
) {
  if (imageGenerationLock) return;
  imageGenerationLock = true;
  try {
    const rendered = await ensureHostMesTextRendered(messageId);
    if (!rendered) {
      console.warn('[image] mes_text 注入失败，mesid:', messageId);
    }
    beginPendingImageTask(messageId);
    void proxyImageMenuToHostWithOptions({ message_id: messageId } as TranscriptItem, event ?? null, options);
  } finally {
    setTimeout(() => {
      imageGenerationLock = false;
    }, 2000);
  }
}

async function handleTranscriptDoubleClickCapture(event: MouseEvent) {
  if (isBridgedEvent(event)) return;
  const rawMessageId = resolveTranscriptDoubleClickMessageId(event.target);
  if (!Number.isFinite(rawMessageId) || rawMessageId == null || rawMessageId < 0) return;
  const messageId = Math.trunc(rawMessageId);

  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as MouseEvent & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
  if (shouldSkipTranscriptImageTrigger(messageId, transcriptImageTriggerGuard, Date.now(), 300)) {
    return;
  }
  void startTranscriptHostImageProxy(messageId, event);
}

function handleTranscriptIntentCapture(event: MouseEvent | PointerEvent | TouchEvent) {
  if (isBridgedEvent(event)) return;
  const rawMessageId = resolveTranscriptDoubleClickMessageId(event.target);
  if (!Number.isFinite(rawMessageId) || rawMessageId == null || rawMessageId < 0) return;
  void ensureHostMesTextRendered(Math.trunc(rawMessageId as number));
}

function hoistPluginMenuIntoFullscreen(): void {
  const fullscreenEl = document.fullscreenElement as HTMLElement | null;
  if (!fullscreenEl) return;

  const hostBody = window.top?.document?.body;
  if (!hostBody) return;

  const observer = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of Array.from(mut.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList.contains('st-chatu8-click-trigger-overlay')) {
          fullscreenEl.appendChild(node);
          observer.disconnect();
          return;
        }
      }
    }
  });

  observer.observe(hostBody, { childList: true });
  setTimeout(() => observer.disconnect(), 300);
}

function clampPluginMenuIntoViewport(node: Element): void {
  const hostWindow = node.ownerDocument?.defaultView ?? window.top ?? window;
  const menu =
    (node.matches?.('.st-chatu8-click-trigger-bubble, [class*="click-trigger"][class*="bubble"]')
      ? node
      : node.querySelector?.('.st-chatu8-click-trigger-bubble, [class*="click-trigger"][class*="bubble"]')) ?? node;
  const element = menu as HTMLElement;
  if (!element?.getBoundingClientRect) return;

  const rect = element.getBoundingClientRect();
  const viewportWidth = Math.max(0, Number(hostWindow.innerWidth ?? 0));
  const viewportHeight = Math.max(0, Number(hostWindow.innerHeight ?? 0));
  if (viewportWidth <= 0 || viewportHeight <= 0) return;

  const margin = 12;
  const maxLeft = Math.max(margin, viewportWidth - rect.width - margin);
  const maxTop = Math.max(margin, viewportHeight - rect.height - margin);
  const nextLeft = Math.min(maxLeft, Math.max(margin, rect.left));
  const nextTop = Math.min(maxTop, Math.max(margin, rect.top));
  const dx = Math.round(nextLeft - rect.left);
  const dy = Math.round(nextTop - rect.top);
  if (dx === 0 && dy === 0 && rect.right <= viewportWidth - margin && rect.bottom <= viewportHeight - margin) return;

  const computed = hostWindow.getComputedStyle?.(element);
  const currentLeft = Number.parseFloat(element.style.left || computed?.left || `${rect.left}`);
  const currentTop = Number.parseFloat(element.style.top || computed?.top || `${rect.top}`);
  element.style.left = `${Math.round((Number.isFinite(currentLeft) ? currentLeft : rect.left) + dx)}px`;
  element.style.top = `${Math.round((Number.isFinite(currentTop) ? currentTop : rect.top) + dy)}px`;
  element.style.right = 'auto';
  element.style.bottom = 'auto';
  element.style.maxWidth = `calc(100vw - ${margin * 2}px)`;
  element.style.maxHeight = `calc(100vh - ${margin * 2}px)`;
}

function guardPluginMenuViewport(): void {
  const hostBody = window.top?.document?.body;
  if (!hostBody) return;
  const clampSoon = (node: Element) => {
    const view = node.ownerDocument?.defaultView ?? window;
    clampPluginMenuIntoViewport(node);
    view.requestAnimationFrame?.(() => clampPluginMenuIntoViewport(node));
    setTimeout(() => clampPluginMenuIntoViewport(node), 80);
  };

  hostBody
    .querySelectorAll('.st-chatu8-click-trigger-overlay, .st-chatu8-click-trigger-bubble, [class*="click-trigger"]')
    .forEach(node => clampSoon(node));

  const observer = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const rawNode of Array.from(mut.addedNodes)) {
        if (rawNode.nodeType !== Node.ELEMENT_NODE) continue;
        const node = rawNode as Element;
        if (
          node.matches?.('.st-chatu8-click-trigger-overlay, .st-chatu8-click-trigger-bubble, [class*="click-trigger"]')
        ) {
          clampSoon(node);
        }
      }
    }
  });

  observer.observe(hostBody, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 900);
}

function waitForTimeout(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function findPluginImageGenerationMenuItem(): HTMLElement | null {
  const selectors = [
    '.st-chatu8-click-trigger-bubble .st-chatu8-click-trigger-button',
    '.st-chatu8-click-trigger-bubble button',
    '[class*="click-trigger"][class*="bubble"] button',
  ].join(', ');

  for (const hostWindow of collectReachableHostWindows()) {
    const candidates = Array.from(hostWindow.document.querySelectorAll(selectors)) as HTMLElement[];
    const target = candidates.find(button =>
      String(button.textContent ?? '')
        .trim()
        .includes('图片生成'),
    );
    if (target) return target;
  }
  return null;
}

async function clickPluginImageGenerationMenuItem(): Promise<boolean> {
  const deadline = Date.now() + 1800;
  while (Date.now() < deadline) {
    const item = findPluginImageGenerationMenuItem();
    if (item) {
      item.click();
      return true;
    }
    await waitForTimeout(50);
  }
  return false;
}

async function handleTranscriptGenerateImage(request: TranscriptImageGenerateRequest | number) {
  const messageId = typeof request === 'number' ? request : request.messageId;
  const hostPoint = typeof request === 'number' ? null : resolveHostPointFromIframeEvent(request.triggerEvent ?? null);
  guardPluginMenuViewport();
  if (document.fullscreenElement) {
    hoistPluginMenuIntoFullscreen();
  }
  await triggerImageGenerationForMessage(messageId, { hostPoint });
}

async function handleChoiceModalGenerateLatestImage() {
  const messageId = Math.trunc(Number(latestAssistantItem.value?.message_id));
  if (!Number.isFinite(messageId) || messageId < 0) {
    toastr?.warning?.('当前没有可生图的最新正文楼层');
    return;
  }

  guardPluginMenuViewport();
  if (document.fullscreenElement) {
    hoistPluginMenuIntoFullscreen();
  }

  await triggerImageGenerationForMessage(messageId, { hostPoint: null });
  if (!(await clickPluginImageGenerationMenuItem())) {
    toastr?.warning?.('插件生图菜单未出现，无法自动选择“图片生成”');
  }
}

function handleOpenGallery(_messageId: number) {
  openGalleryDrawer();
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

// 移动端：touchstart 比插件的 touchend 更早触发。
// 这里不能再要求两次 tap 命中完全同一个 DOM 节点：
// 同一条消息里二次 tap 常会落到不同的 span/text wrapper，导致代理失效，
// 插件继续消费 iframe 内 html-body，并回退到 mesId:0。
let touchStartTime = 0;
let lastTouchMessageId: number | null = null;
let mobileBridgeSuppressUntilMs = 0;
let mobileBridgeSuppressMessageId: number | null = null;

function suppressRecentMobileGhostEvent(event: MouseEvent | TouchEvent): boolean {
  if (Date.now() > mobileBridgeSuppressUntilMs) return false;
  const rawMessageId = resolveTranscriptDoubleClickMessageId(event.target);
  if (!Number.isFinite(rawMessageId) || rawMessageId == null || rawMessageId < 0) return false;
  const messageId = Math.trunc(rawMessageId);
  if (mobileBridgeSuppressMessageId != null && mobileBridgeSuppressMessageId !== messageId) return false;
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as (MouseEvent | TouchEvent) & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
  return true;
}

useEventListener(
  document,
  'touchstart',
  (event: TouchEvent) => {
    if (isBridgedEvent(event)) return;
    const rawMessageId = resolveTranscriptDoubleClickMessageId(event.target);
    if (!Number.isFinite(rawMessageId) || rawMessageId == null || rawMessageId < 0) return;

    const now = Date.now();
    const messageId = Math.trunc(rawMessageId as number);

    // 第一次 tap 就预热宿主正文，缩短第二次 tap 命中宿主原生链的窗口。
    void ensureHostMesTextRendered(messageId);

    // 检测双击：两次 touchstart 间隔 < 400ms 且属于同一楼层（移动端用户点击速度较慢）
    if (now - touchStartTime < 400 && lastTouchMessageId === messageId) {
      mobileBridgeSuppressUntilMs = now + 650;
      mobileBridgeSuppressMessageId = messageId;
      void startTranscriptHostImageProxy(messageId, event, { preferPointTarget: true });
      touchStartTime = 0;
      lastTouchMessageId = null;
      return;
    }

    touchStartTime = now;
    lastTouchMessageId = messageId;
  },
  { capture: true, passive: false },
);

useEventListener(
  document,
  'touchend',
  (event: TouchEvent) => {
    void suppressRecentMobileGhostEvent(event);
  },
  { capture: true, passive: false },
);

useEventListener(
  document,
  'click',
  (event: MouseEvent) => {
    void suppressRecentMobileGhostEvent(event);
  },
  { capture: true },
);

function openChoiceModalFromToolbar() {
  refreshMvuVariableUpdateMode();
  composerRef.value?.openChoiceModal?.();
}

async function handleReprocessVariablesFromChoiceModal() {
  refreshMvuVariableUpdateMode();
  if (!canReprocessVariables.value) {
    toastr?.warning?.(reprocessVariablesHint.value);
    return;
  }
  if (mvuVariableUpdateMode.value === 'inline') {
    toastr?.info?.('当前 MVU 变量更新方式为“随AI输出”，没有可重试的额外模型解析；请改为“额外模型解析”后再使用。');
    return;
  }
  if (mvuVariableUpdateMode.value !== 'extra_analysis') {
    toastr?.warning?.(reprocessVariablesHint.value);
    return;
  }
  await reprocessLatestAssistantVariables();
}

onMounted(() => {
  refreshMvuVariableUpdateMode();
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
  // scroll 事件仅在非全屏时有意义（移动端软键盘弹出修正），全屏时跳过
  useEventListener(
    window.visualViewport,
    'scroll',
    () => {
      if (!isFullscreen.value) updateReaderShellHeight();
    },
    { passive: true },
  );
}

// 同步浏览器原生全屏状态
useEventListener(document, 'fullscreenchange', () => {
  isFullscreen.value = !!document.fullscreenElement;
  updateReaderShellHeight();
});

useEventListener(window, 'keydown', event => {
  if (event.key !== 'Escape') return;
  if (roleDrawerOpen.value) closeSideDrawers();
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
  flex-wrap: wrap;
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
  font-size: 12px;
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
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
}
.ui-signal-btn.active {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
}

.ui-page-menu {
  position: relative;
}

.ui-page-menu-trigger {
  justify-content: space-between;
  min-width: 144px;
}

.ui-page-menu-value {
  max-width: 9.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--demo-text-accent);
}

.ui-page-menu-list {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 45;
  display: grid;
  gap: 6px;
  min-width: 176px;
  max-width: min(72vw, 240px);
  padding: 8px;
  border: 1px solid var(--demo-border-accent-soft);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--background) 92%, transparent),
    color-mix(in srgb, var(--surface) 90%, transparent)
  );
  box-shadow:
    0 18px 32px color-mix(in srgb, var(--shadow-color) 42%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.ui-more-menu-list {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 45;
  display: grid;
  gap: 6px;
  min-width: 176px;
  max-width: min(72vw, 240px);
  padding: 8px;
  border: 1px solid var(--demo-border-accent-soft);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--background) 92%, transparent),
    color-mix(in srgb, var(--surface) 90%, transparent)
  );
  box-shadow:
    0 18px 32px color-mix(in srgb, var(--shadow-color) 42%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.ui-page-menu-item {
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0 12px;
  background: color-mix(in srgb, var(--surface) 20%, transparent);
  color: var(--demo-text-primary);
  font-family: var(--demo-font-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: left;
}

.ui-page-menu-item.active {
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
  color: var(--demo-text-accent);
}

.toolbar-menu-fade-enter-active,
.toolbar-menu-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.toolbar-menu-fade-enter-from,
.toolbar-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
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

.ui-host-shell.layout-compact .ui-topbar,
.ui-host-shell.layout-reader-desktop .ui-topbar {
  gap: 8px;
  padding: 10px 12px;
}

.ui-host-shell.layout-compact .ui-topbar-actions,
.ui-host-shell.layout-reader-desktop .ui-topbar-actions {
  width: 100%;
  margin-left: 0;
  justify-content: flex-end;
  gap: 8px;
}

.ui-host-shell.layout-compact .ui-icon-btn,
.ui-host-shell.layout-reader-desktop .ui-icon-btn {
  min-height: 44px;
  font-size: 12px;
}

.ui-host-shell.layout-compact .ui-page-menu,
.ui-host-shell.layout-reader-desktop .ui-page-menu {
  min-width: 0;
}

.ui-host-shell.layout-compact .ui-page-menu-trigger,
.ui-host-shell.layout-reader-desktop .ui-page-menu-trigger {
  min-width: 132px;
}

.ui-host-shell.layout-compact .ui-page-menu-value,
.ui-host-shell.layout-reader-desktop .ui-page-menu-value {
  max-width: 6.5rem;
}

.ui-host-shell.layout-compact .ui-signal-btn,
.ui-host-shell.layout-reader-desktop .ui-signal-btn {
  min-height: 40px;
  font-size: 12px;
}

.ui-host-shell.layout-compact .ui-bottom-tool-row,
.ui-host-shell.layout-reader-desktop .ui-bottom-tool-row {
  gap: 8px;
}

@media (min-width: 761px) {
  .ui-host-body {
    padding-left: 14px;
    padding-right: 14px;
  }

  /* 桌面端抽屉尺寸 — 内容已紧凑化，地图模式约 620px 可显示完整内容 */
  .ui-bottom-drawer {
    width: min(94vw, calc(var(--reader-content-max, 72rem) + 180px));
    height: min(76vh, 520px);
    max-height: min(76vh, 520px);
  }

  .ui-bottom-drawer.is-map {
    width: min(94vw, calc(var(--reader-content-max, 72rem) + 180px));
    height: min(82vh, 640px);
    max-height: min(82vh, 640px);
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

.ui-sidebar-right.open {
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

.ui-sidebar-toggle-label {
  position: static;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--demo-font-mono);
  font-size: 8px;
  line-height: 1;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--demo-text-accent) 56%, transparent);
  writing-mode: horizontal-tb;
  transform: rotate(-90deg);
  transform-origin: center;
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

.ui-sidebar-footer {
  flex: 0 0 auto;
  padding: 0 12px 12px;
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

.ui-history-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--primary) 24%, transparent);
  background: color-mix(in srgb, var(--background) 80%, transparent);
  color: var(--demo-text-warning);
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  pointer-events: none;
}

.ui-history-badge strong {
  color: var(--demo-text-accent);
  font-size: 11px;
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

/* ─── MAP 模式：header 压缩为单行工具栏 ─── */
.ui-bottom-drawer.is-map .ui-bottom-drawer-head {
  padding: 7px 10px 7px 14px;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.ui-bottom-drawer.is-map .ui-bottom-drawer-head-copy {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  flex: 1;
  min-width: 0;
}

.ui-bottom-drawer.is-map .ui-bottom-drawer-head-copy .demo-kicker {
  font-size: 9px;
  letter-spacing: 0.14em;
  opacity: 0.6;
  flex-shrink: 0;
}

.ui-bottom-drawer.is-map .ui-bottom-drawer-head strong {
  margin-top: 0;
  font-size: 13px;
  flex-shrink: 0;
}

/* 地图模式 head 中隐藏副标题，pills 承担全部摘要信息 */
.ui-bottom-drawer.is-map .ui-bottom-drawer-head p {
  display: none;
}

.ui-bottom-drawer.is-map .ui-drawer-pills {
  gap: 5px;
}

.ui-bottom-drawer.is-map .ui-drawer-pill {
  min-height: 20px;
  padding: 2px 7px;
  gap: 5px;
}

.ui-bottom-drawer.is-map .ui-drawer-pill small {
  font-size: 9px;
  letter-spacing: 0.1em;
}

.ui-bottom-drawer.is-map .ui-drawer-pill strong {
  font-size: 10px;
}

.ui-bottom-drawer-body {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px 14px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 18%, transparent), transparent);
}

.ui-bottom-drawer-body.is-map {
  padding: 10px 12px 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 22%, transparent), transparent),
    linear-gradient(to right, color-mix(in srgb, var(--border) 10%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--border) 10%, transparent) 1px, transparent 1px);
  background-size:
    auto,
    40px 40px,
    40px 40px;
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
    width: min(85vw, 28rem);
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
    align-items: center;
  }

  .ui-topbar-actions {
    display: flex;
    width: auto;
    margin-left: auto;
    justify-content: flex-end;
    flex: 1 1 auto;
    min-width: 0;
    flex-wrap: nowrap;
    gap: 6px;
  }

  .ui-online {
    display: none;
  }

  .ui-icon-btn {
    min-height: 30px;
    flex: 0 0 auto;
    justify-content: center;
    min-width: 0;
    padding: 0 8px;
    font-size: 12px;
    letter-spacing: 0.08em;
  }

  .ui-page-menu {
    flex: 1 1 auto;
    min-width: 0;
  }

  .ui-page-menu-trigger {
    width: 100%;
    min-width: 0;
  }

  .ui-page-menu-value {
    max-width: 7.25rem;
  }

  .ui-fullscreen-btn {
    flex: 0 0 auto;
    padding-inline: 10px;
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
    min-height: 40px;
    min-width: 0;
    padding: 0 10px;
    gap: 3px;
    font-size: 12px;
    white-space: nowrap;
  }

  .ui-bottom-tool-row .ui-signal-btn .ui-bars {
    display: inline-flex;
  }

  .ui-bottom-tool-row .ui-signal-btn .ui-bars i {
    width: 3px;
    height: 8px;
  }

  /* 移动端抽屉：固定在视口底部偏上，覆盖大部分屏幕
     必须同时写 height + max-height：
     仅有 max-height 时 height 为 auto，flex-body(flex:1 1 0)
     在 auto 高度父容器内无法伸展，导致内容区坍缩为 0px */
  .ui-bottom-drawer {
    top: auto;
    left: 3vw;
    right: 3vw;
    bottom: 80px;
    width: 94vw;
    height: calc(100vh - 96px);
    max-height: calc(100vh - 96px);
    transform: none;
    border-radius: 18px 18px 12px 12px;
    z-index: 2600;
  }

  .ui-bottom-drawer.is-map {
    bottom: 68px;
    height: calc(100vh - 80px);
    max-height: calc(100vh - 80px);
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
    left: 6px;
    right: auto;
    bottom: 6px;
    border-radius: 22px;
    border-left: 0;
    border-right: 1px solid var(--demo-border-accent-soft);
    box-shadow: 14px 0 34px color-mix(in srgb, var(--shadow-color) 82%, transparent);
    transform: translateX(-100%);
  }

  .ui-sidebar.open {
    transform: translateX(0);
  }

  .ui-sidebar-right {
    left: auto;
    right: 6px;
    width: min(85vw, 28rem);
    transform: translateX(100%);
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

  .ui-sidebar-toggle,
  .ui-sidebar-toggle-right {
    position: fixed;
    width: 18px;
    height: 88px;
    min-height: 88px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-top: 0;
    z-index: 32;
    transform: none;
  }

  .ui-sidebar-toggle {
    top: calc(50% - 96px);
    left: 0;
    right: auto;
    border-radius: 0 14px 14px 0;
  }

  .ui-sidebar-toggle.open {
    transform: none;
  }

  .ui-sidebar-toggle-right {
    top: calc(50% + 8px);
    right: 0;
    left: auto;
    border-radius: 14px 0 0 14px;
  }

  .ui-sidebar-toggle-right.open {
    transform: none;
  }

  .ui-sidebar-toggle-label {
    font-size: 8px;
    line-height: 1;
    letter-spacing: 0.06em;
    text-align: center;
  }
}

.ui-host-shell.layout-compact .ui-topbar,
.ui-host-shell.layout-reader-desktop .ui-topbar {
  flex-wrap: nowrap;
  align-items: center;
}

.ui-host-shell.layout-compact .ui-topbar-actions,
.ui-host-shell.layout-reader-desktop .ui-topbar-actions {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
  margin-left: auto;
  justify-content: flex-end;
  flex-wrap: nowrap;
}

.ui-host-shell.layout-compact .ui-icon-btn,
.ui-host-shell.layout-reader-desktop .ui-icon-btn {
  flex: 0 0 auto;
}

.ui-host-shell.layout-compact .ui-page-menu,
.ui-host-shell.layout-reader-desktop .ui-page-menu {
  flex: 1 1 auto;
  min-width: 0;
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

/* 全屏 - 退出按钮：高亮提示，让用户能快速找到 */
.ui-host-shell.is-fullscreen .ui-fullscreen-btn.is-active-fullscreen {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
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
