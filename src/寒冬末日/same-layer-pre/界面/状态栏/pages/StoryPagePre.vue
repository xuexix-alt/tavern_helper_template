<template>
  <section class="ui-host-shell same-layer-pre-host layout-reader-desktop" :style="shellStyleVars">
    <header class="ui-topbar">
      <div class="ui-topbar-brand">
        <span class="ui-dot" :class="{ 'save-failing': Boolean(errorMessage) }"></span>
        <span class="ui-brand-copy">SAME-LAYER PRE</span>
        <span class="ui-brand-version">{{ readerSummary.statusLabel }}</span>
      </div>

      <div class="ui-topbar-actions">
        <span class="ui-online">PRE</span>

        <div class="ui-page-menu">
          <button
            type="button"
            class="ui-icon-btn ui-page-menu-trigger"
            :class="{ active: transcriptWindowMenuOpen }"
            aria-haspopup="menu"
            :aria-expanded="transcriptWindowMenuOpen"
            aria-label="切换楼层窗口"
            @click.stop="toggleTranscriptWindowMenu"
          >
            <span>楼层</span>
            <span class="ui-page-menu-value">{{ transcriptWindowLabel }}</span>
          </button>

          <transition name="toolbar-menu-fade">
            <div v-if="transcriptWindowMenuOpen" class="ui-page-menu-list clip-corner-sm" role="menu">
              <button
                v-for="page in transcriptWindowPages"
                :key="page.key"
                type="button"
                class="ui-page-menu-item"
                :class="{ active: transcriptWindowLabel === page.label }"
                role="menuitem"
                @click="selectTranscriptWindowPage(page.label)"
              >
                {{ page.label }}
              </button>
            </div>
          </transition>
        </div>

        <div class="ui-page-menu ui-more-menu">
          <button
            type="button"
            class="ui-icon-btn ui-more-trigger"
            :class="{ active: topbarMoreMenuOpen }"
            aria-haspopup="menu"
            :aria-expanded="topbarMoreMenuOpen"
            aria-label="打开更多菜单"
            @click.stop="toggleTopbarMoreMenu"
          >
            更多
          </button>

          <transition name="toolbar-menu-fade">
            <div v-if="topbarMoreMenuOpen" class="ui-more-menu-list clip-corner-sm" role="menu">
              <button type="button" class="ui-page-menu-item" role="menuitem" @click="openRoleDrawerFromMoreMenu">
                角色
              </button>
              <button type="button" class="ui-page-menu-item" role="menuitem" @click="openGalleryDrawerFromMoreMenu">
                画廊
              </button>
              <button type="button" class="ui-page-menu-item" role="menuitem" @click="refreshFromMoreMenu">刷新</button>
              <div class="ui-menu-divider" aria-hidden="true"></div>
              <div class="ui-theme-menu-group" role="group" aria-label="主题">
                <span class="ui-menu-group-label">主题</span>
                <button
                  v-for="item in themeItems"
                  :key="item.value"
                  type="button"
                  class="ui-page-menu-item ui-theme-menu-item"
                  :class="{ active: theme === item.value }"
                  role="menuitem"
                  @click="selectTheme(item.value)"
                >
                  <span class="ui-theme-swatch" :class="`is-${item.value}`" aria-hidden="true"></span>
                  <span>{{ item.label }}</span>
                </button>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </header>

    <div class="ui-host-body">
      <transition name="sidebar-mask-fade">
        <div
          v-if="roleDrawerOpen || galleryDrawerOpen"
          class="ui-sidebar-mask"
          aria-hidden="true"
          @click="closeSideDrawers"
        ></div>
      </transition>

      <button
        type="button"
        class="ui-sidebar-toggle"
        :class="{ open: roleDrawerOpen }"
        aria-label="打开角色侧栏"
        :aria-expanded="roleDrawerOpen"
        @click="toggleRoleDrawer"
      >
        <span class="ui-sidebar-toggle-label">角色</span>
      </button>

      <button
        type="button"
        class="ui-sidebar-toggle ui-sidebar-toggle-right"
        :class="{ open: galleryDrawerOpen }"
        aria-label="打开画廊侧栏"
        :aria-expanded="galleryDrawerOpen"
        @click="toggleGalleryDrawer"
      >
        <span class="ui-sidebar-toggle-label">画廊</span>
      </button>

      <aside class="ui-sidebar" :class="{ open: roleDrawerOpen }">
        <div class="ui-sidebar-head">
          <div>
            <span class="demo-kicker">ROLE // SNAPSHOT</span>
            <strong>角色变量</strong>
          </div>
          <button type="button" class="ui-close-btn inline" aria-label="关闭角色侧栏" @click="closeRoleDrawer">
            ×
          </button>
        </div>
        <div class="ui-sidebar-body">
          <MvuRolePanel
            v-if="roleDrawerOpen"
            :target-message-id="latestAssistantMessageId"
            :transcript-items="baseTranscriptItems"
            :gallery-entries="[]"
            :role-portrait-overrides="rolePortraitOverrides"
            agents-only
            @select-role-portrait="selectRolePortraitForRole"
            @add-role-portrait-set-image="addRolePortraitSetImageForRole"
            @clear-role-portrait="clearRolePortraitForRole"
            @portrait-error="handleRolePortraitError"
            @collapse="closeRoleDrawer"
          />
        </div>
      </aside>

      <aside class="ui-sidebar ui-sidebar-right" :class="{ open: galleryDrawerOpen }">
        <div class="ui-sidebar-head">
          <div>
            <span class="demo-kicker">GALLERY // PRE</span>
            <strong>画廊预留</strong>
          </div>
          <button type="button" class="ui-close-btn inline" aria-label="关闭画廊侧栏" @click="closeGalleryDrawer">
            ×
          </button>
        </div>
        <div class="ui-sidebar-body">
          <PreGalleryPanel />
        </div>
      </aside>

      <main class="ui-main-panel">
        <section class="ui-transcript-panel">
          <div class="pre-reader-meta">
            <span>楼层 {{ readerSummary.turnCount }}</span>
            <span>锚点 {{ readerSummary.assistantAnchorLabel }}</span>
            <span>选项 {{ latestAssistantItem?.options.length ?? 0 }}</span>
            <span v-if="lastRefreshedAt">同步 {{ lastRefreshedAt }}</span>
          </div>

          <div class="ui-transcript-stage">
            <PreTranscriptList
              :items="transcriptItems"
              :busy="busy"
              :rollback-confirm-message-id="rollbackConfirmMessageId"
              @request-rollback="requestRollbackDelete"
              @confirm-rollback="confirmRollbackDelete"
              @cancel-rollback="cancelRollbackDelete"
              @regenerate-message="regenerateMessage"
            />
            <div v-if="errorMessage" class="pre-error">{{ errorMessage }}</div>
          </div>
        </section>

        <section class="ui-bottom-dock">
          <Teleport to="body">
            <transition name="utility-mask-fade">
              <div
                v-if="activeUtilityDrawer"
                class="ui-utility-mask"
                aria-hidden="true"
                @click="closeUtilityDrawer"
              ></div>
            </transition>

            <transition name="utility-drawer-rise">
              <section
                v-if="activeUtilityDrawer"
                class="ui-bottom-drawer clip-corner"
                :class="`is-${activeUtilityDrawer}`"
                role="dialog"
                aria-modal="true"
                :aria-label="activeUtilityMeta.title"
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
                  <button
                    type="button"
                    class="ui-close-btn inline"
                    aria-label="关闭系统面板"
                    @click="closeUtilityDrawer"
                  >
                    ×
                  </button>
                </header>

                <div class="ui-bottom-drawer-body" :class="`is-${activeUtilityDrawer}`">
                  <WorkbenchTabs
                    v-if="activeUtilityDrawer === 'system'"
                    :logs="logItems"
                    :busy="busy"
                    :transcript-total="readerSummary.turnCount"
                    :assistant-count="assistantItemCount"
                  />
                  <MapBusinessPanel v-else-if="activeUtilityDrawer === 'map'" />
                </div>
              </section>
            </transition>
          </Teleport>

          <div class="ui-bottom-console-strip clip-corner">
            <div class="ui-bottom-console-balance" aria-hidden="true"></div>

            <div class="ui-bottom-tools">
              <div class="ui-bottom-tool-row">
                <button
                  type="button"
                  class="ui-signal-btn"
                  :disabled="!canRegenerateLatestMessage"
                  aria-label="重新生成最新可重生楼层"
                  @click="regenerateLatestMessage"
                >
                  <span>重生</span>
                  <span class="ui-bars">
                    <i
                      v-for="i in 5"
                      :key="`regen-${i}`"
                      :class="{ active: i <= (canRegenerateLatestMessage ? 5 : 1) }"
                    ></i>
                  </span>
                </button>

                <button
                  type="button"
                  class="ui-signal-btn"
                  :class="{ active: activeUtilityDrawer === 'system' }"
                  aria-haspopup="dialog"
                  :aria-expanded="activeUtilityDrawer === 'system'"
                  aria-label="打开系统面板"
                  @click="toggleUtilityDrawer('system')"
                >
                  <span>系统</span>
                  <span class="ui-bars">
                    <i
                      v-for="i in 8"
                      :key="`system-${i}`"
                      :class="{ active: i <= Math.min(8, logItems.length + 3) }"
                    ></i>
                  </span>
                </button>

                <button
                  type="button"
                  class="ui-signal-btn"
                  :class="{ active: activeUtilityDrawer === 'map' }"
                  aria-haspopup="dialog"
                  :aria-expanded="activeUtilityDrawer === 'map'"
                  aria-label="打开地图面板"
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
                  aria-haspopup="dialog"
                  aria-label="打开剧情选项"
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
              </div>
            </div>

            <div class="ui-bottom-console-balance" aria-hidden="true"></div>
          </div>

          <BottomComposer
            ref="composerRef"
            v-model="composerText"
            :busy="busy"
            :can-roll="false"
            :desktop-tool-row-mode="true"
            :choice-options="latestAssistantItem?.options ?? []"
            :can-reprocess-variables="canReprocessVariables"
            :reprocess-variables-hint="reprocessVariablesHint"
            :reprocess-variables-pending="reprocessVariablesPending"
            :can-generate-latest-image="false"
            :role-tabs="[]"
            :active-role-key="null"
            layout-mode="reader_desktop"
            :show-option-trigger="false"
            :show-toolbar="false"
            @submit="submitPrompt"
            @cancel-generation="cancelGeneration"
            @reprocess-variables="handleReprocessVariablesFromChoiceModal"
          />
        </section>
      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { retryMessageExtraAnalysisByNativeMvu } from '../../../../mvu_reprocess';
import BottomComposer from '../../../../界面同层版/界面/状态栏/components/BottomComposer.vue';
import MapBusinessPanel from '../../../../界面同层版/界面/状态栏/components/MapBusinessPanel.vue';
import MvuRolePanel from '../../../../界面同层版/界面/状态栏/components/MvuRolePanel.vue';
import WorkbenchTabs from '../../../../界面同层版/界面/状态栏/components/WorkbenchTabs.vue';
import {
  addRolePortraitSetImage,
  clearRolePortraitOverride,
  readRolePortraitOverrides,
  setPrimaryRolePortraitOverride,
  writeRolePortraitOverrides,
  type RolePortraitOverrideMap,
} from '../../../../界面同层版/界面/状态栏/rolePortraits';
import type { ReaderGalleryEntry } from '../../../../界面同层版/界面/状态栏/types';
import PreGalleryPanel from '../components/PreGalleryPanel.vue';
import PreTranscriptList from '../components/PreTranscriptList.vue';
import type { DemoTheme } from '../types';
import { useSameLayerPre } from '../useSameLayerPre';

type ComposerExpose = {
  openChoiceModal: () => Promise<void> | void;
};

const {
  transcriptItems,
  baseTranscriptItems,
  composerText,
  busy,
  theme,
  errorMessage,
  logItems,
  readerSummary,
  latestAssistantMessageId,
  rollbackConfirmMessageId,
  canRegenerateLatestMessage,
  lastRefreshedAt,
  refreshTranscript,
  submitPrompt,
  cancelGeneration,
  requestRollbackDelete,
  confirmRollbackDelete,
  cancelRollbackDelete,
  regenerateMessage,
  regenerateLatestMessage,
} = useSameLayerPre();

const composerRef = ref<ComposerExpose | null>(null);
const roleDrawerOpen = ref(false);
const galleryDrawerOpen = ref(false);
const rolePortraitOverrides = ref<RolePortraitOverrideMap>(readRolePortraitOverrides());
const transcriptWindowMenuOpen = ref(false);
const topbarMoreMenuOpen = ref(false);
const activeUtilityDrawer = ref<null | 'system' | 'map'>(null);
const transcriptWindowLabel = ref('最新');
const readerShellHeight = ref('min(92vh, 960px)');
const shellStyleVars = computed(() => ({
  '--reader-shell-height': readerShellHeight.value,
}));

const themeItems: Array<{ label: string; value: DemoTheme }> = [
  { label: '科技', value: 'tech' },
  { label: '暗黑', value: 'dark' },
  { label: '鎏金', value: 'gold' },
  { label: 'iOS', value: 'ios' },
  { label: 'iPod', value: 'ipod' },
  { label: '琥珀', value: 'amber' },
];

const latestAssistantItem = computed(
  () => [...transcriptItems.value].reverse().find(item => item.role === 'assistant') ?? null,
);

const assistantItemCount = computed(() => transcriptItems.value.filter(item => item.role === 'assistant').length);
type MvuVariableUpdateMode = 'extra_analysis' | 'inline' | 'unknown';
const mvuVariableUpdateMode = ref<MvuVariableUpdateMode>('unknown');
const reprocessVariablesPending = ref(false);
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

function collectReachableDocumentsForMvuMode() {
  const documents: Document[] = [];
  const pushDocument = (doc: Document | null | undefined) => {
    if (doc && !documents.includes(doc)) documents.push(doc);
  };

  pushDocument(document);

  try {
    pushDocument(window.parent?.document);
  } catch {
    // ignore cross-origin host access
  }

  try {
    pushDocument(window.top?.document);
  } catch {
    // ignore cross-origin host access
  }

  return documents;
}

function readMvuVariableUpdateMode(): MvuVariableUpdateMode {
  const updateModeLabel = '变量更新方式';
  const inlineLabel = '随AI输出';
  const extraAnalysisLabel = '额外模型解析';
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

  for (const doc of collectReachableDocumentsForMvuMode()) {
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
    const extraAnalysisEnabled = (getVariables({ type: 'global' }) as { extra_analysis?: unknown } | null)
      ?.extra_analysis;
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
      { label: '楼层', value: `${readerSummary.value.turnCount || 0}` },
      { label: '助手', value: `${assistantItemCount.value}` },
      { label: '选项', value: `${latestAssistantItem.value?.options.length ?? 0}` },
    ];
  }

  return [
    { label: '日志', value: `${logItems.value.length}` },
    { label: '楼层', value: `${readerSummary.value.turnCount || 0}` },
    { label: '助手', value: `${assistantItemCount.value}` },
  ];
});

const transcriptWindowPages = computed(() => [
  { key: 'latest', label: '最新' },
  { key: 'all', label: `${readerSummary.value.turnCount || 0}楼` },
]);

function readHostViewportHeight() {
  const candidates: number[] = [];

  const push = (value: unknown) => {
    const numeric = Math.trunc(Number(value));
    if (Number.isFinite(numeric) && numeric > 0) candidates.push(numeric);
  };

  try {
    push(window.top?.visualViewport?.height);
  } catch {
    // ignore cross-origin host access
  }

  try {
    push(window.parent?.visualViewport?.height);
  } catch {
    // ignore cross-origin host access
  }

  try {
    push(window.visualViewport?.height);
  } catch {
    // ignore missing visualViewport
  }

  try {
    push(window.top?.innerHeight);
  } catch {
    // ignore cross-origin host access
  }

  try {
    push(window.parent?.innerHeight);
  } catch {
    // ignore cross-origin host access
  }

  push(window.innerHeight);

  return candidates[0] ?? 0;
}

function updateReaderShellHeight() {
  if (typeof window === 'undefined') return;
  const viewportHeight = readHostViewportHeight();
  const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 960;
  const shellPadding = safeViewportHeight < 760 ? 8 : 16;
  const targetHeight = Math.min(960, Math.max(720, safeViewportHeight - shellPadding));
  readerShellHeight.value = `${targetHeight}px`;
}

function closeTopbarMenus() {
  transcriptWindowMenuOpen.value = false;
  topbarMoreMenuOpen.value = false;
}

function closeUtilityDrawer() {
  activeUtilityDrawer.value = null;
}

function toggleUtilityDrawer(drawer: 'system' | 'map') {
  activeUtilityDrawer.value = activeUtilityDrawer.value === drawer ? null : drawer;
  closeTopbarMenus();
  closeSideDrawers();
}

function toggleTranscriptWindowMenu() {
  transcriptWindowMenuOpen.value = !transcriptWindowMenuOpen.value;
  if (transcriptWindowMenuOpen.value) topbarMoreMenuOpen.value = false;
}

function toggleTopbarMoreMenu() {
  topbarMoreMenuOpen.value = !topbarMoreMenuOpen.value;
  if (topbarMoreMenuOpen.value) transcriptWindowMenuOpen.value = false;
}

function selectTranscriptWindowPage(label: string) {
  transcriptWindowLabel.value = label;
  closeTopbarMenus();
}

function closeRoleDrawer() {
  roleDrawerOpen.value = false;
}

function closeGalleryDrawer() {
  galleryDrawerOpen.value = false;
}

function toggleRoleDrawer() {
  roleDrawerOpen.value = !roleDrawerOpen.value;
  if (roleDrawerOpen.value) galleryDrawerOpen.value = false;
  closeTopbarMenus();
  closeUtilityDrawer();
}

function toggleGalleryDrawer() {
  galleryDrawerOpen.value = !galleryDrawerOpen.value;
  if (galleryDrawerOpen.value) roleDrawerOpen.value = false;
  closeTopbarMenus();
  closeUtilityDrawer();
}

function closeSideDrawers() {
  roleDrawerOpen.value = false;
  galleryDrawerOpen.value = false;
}

function openRoleDrawerFromMoreMenu() {
  roleDrawerOpen.value = true;
  galleryDrawerOpen.value = false;
  closeTopbarMenus();
  closeUtilityDrawer();
}

function openGalleryDrawerFromMoreMenu() {
  galleryDrawerOpen.value = true;
  roleDrawerOpen.value = false;
  closeTopbarMenus();
  closeUtilityDrawer();
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

function clearRolePortraitForRole(roleKey: string) {
  rolePortraitOverrides.value = {
    ...rolePortraitOverrides.value,
    [roleKey]: clearRolePortraitOverride(roleKey),
  };
  writeRolePortraitOverrides(rolePortraitOverrides.value);
}

function handleRolePortraitError(key: string) {
  if (!rolePortraitOverrides.value[key]) return;
  const { [key]: _failed, ...rest } = rolePortraitOverrides.value;
  rolePortraitOverrides.value = rest;
  writeRolePortraitOverrides(rolePortraitOverrides.value);
}

function refreshFromMoreMenu() {
  closeTopbarMenus();
  refreshTranscript('manual');
}

function selectTheme(value: DemoTheme) {
  theme.value = value;
  closeTopbarMenus();
}

function openChoiceModalFromToolbar() {
  if (!latestAssistantItem.value) return;
  refreshMvuVariableUpdateMode();
  closeTopbarMenus();
  closeUtilityDrawer();
  void composerRef.value?.openChoiceModal();
}

async function handleReprocessVariablesFromChoiceModal() {
  refreshMvuVariableUpdateMode();
  const latestAssistant = latestAssistantItem.value;
  if (!latestAssistant || latestAssistant.role !== 'assistant') {
    toastr?.warning?.('当前没有可重新生成变量的 assistant 楼层');
    return;
  }
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

  reprocessVariablesPending.value = true;
  try {
    const reprocessResult = await retryMessageExtraAnalysisByNativeMvu(latestAssistant.message_id, {
      refreshMessage: true,
    });
    if (reprocessResult.status === 'applied') {
      toastr?.success?.('已触发 MVU 原生“重试额外模型解析”');
      refreshTranscript('mvu_extra_analysis_retry');
      return;
    }

    const reason = String(reprocessResult.reason ?? reprocessResult.status ?? 'unknown');
    toastr?.warning?.(`重试额外模型解析未触发：${reason}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toastr?.error?.(`重试额外模型解析失败：${message}`);
  } finally {
    reprocessVariablesPending.value = false;
  }
}

onMounted(() => {
  refreshMvuVariableUpdateMode();
  updateReaderShellHeight();
  window.addEventListener('resize', updateReaderShellHeight);
  window.visualViewport?.addEventListener('resize', updateReaderShellHeight);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateReaderShellHeight);
  window.visualViewport?.removeEventListener('resize', updateReaderShellHeight);
});
</script>

<style scoped>
/*
 * Z-INDEX 层级表（same-layer-pre）
 *   1      — ui-host-shell 基础层
 *   5      — ui-bottom-dock
 *  20      — ui-topbar
 *  24      — ui-sidebar-mask
 *  25      — ui-sidebar（侧边抽屉）
 *  30      — ui-sidebar-toggle
 *  45      — ui-page-menu-list / ui-more-menu-list
 * 2599    — ui-utility-mask
 * 2600    — ui-bottom-drawer
 */
.ui-host-shell {
  --pre-font-sans: var(--font-sans, 'Inter', 'Fira Sans', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif);
  --pre-font-mono: var(--demo-font-mono, 'Fira Code', 'SFMono-Regular', 'Cascadia Mono', Consolas, monospace);

  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: var(--reader-shell-height, min(92vh, 960px));
  max-height: var(--reader-shell-height, min(92vh, 960px));
  min-height: 720px;
  overflow: hidden;
  color: var(--demo-text-primary);
  font-family: var(--pre-font-sans);
  font-size: 14px;
  line-height: 1.6;
  letter-spacing: 0;
}

.ui-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
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
  flex-wrap: nowrap;
  min-width: 0;
}

.ui-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 12px color-mix(in srgb, var(--primary) 70%, transparent);
}

.ui-dot.save-failing {
  background: var(--demo-color-danger, #ff5a63);
}

.ui-brand-copy,
.ui-online,
.ui-icon-btn,
.ui-signal-btn,
.ui-role-card,
.pre-reader-meta {
  font-family: var(--pre-font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ui-brand-copy {
  color: var(--demo-text-accent);
}

.ui-brand-version,
.ui-online {
  color: var(--demo-text-secondary);
}

.ui-icon-btn,
.ui-signal-btn,
.ui-role-card,
.ui-page-menu-item,
.ui-close-btn,
.ui-sidebar-toggle {
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 32%, transparent);
  color: var(--demo-text-primary);
}

.ui-icon-btn,
.ui-signal-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
}

.ui-icon-btn,
.ui-signal-btn,
.ui-page-menu-item,
.ui-close-btn,
.ui-sidebar-toggle {
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.ui-icon-btn:hover:not(:disabled),
.ui-signal-btn:hover:not(:disabled),
.ui-page-menu-item:hover:not(:disabled),
.ui-close-btn:hover,
.ui-sidebar-toggle:hover {
  border-color: var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface) 36%);
  color: var(--demo-text-accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 14%, transparent);
}

.ui-icon-btn:focus-visible,
.ui-signal-btn:focus-visible,
.ui-page-menu-item:focus-visible,
.ui-close-btn:focus-visible,
.ui-sidebar-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary) 72%, white 12%);
  outline-offset: 2px;
}

.ui-icon-btn.active,
.ui-signal-btn.active {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
}

.ui-icon-btn:disabled,
.ui-signal-btn:disabled,
.ui-page-menu-item:disabled {
  cursor: default;
  opacity: 0.45;
}

.ui-page-menu {
  position: relative;
  min-width: 0;
}

.ui-page-menu-trigger {
  justify-content: space-between;
  min-width: 132px;
}

.ui-page-menu-value {
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--demo-text-accent);
}

.ui-page-menu-list,
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
  border-radius: 10px;
  padding: 0 12px;
  font-family: var(--pre-font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
}

.ui-page-menu-item.active {
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
  color: var(--demo-text-accent);
}

.ui-menu-divider {
  height: 1px;
  margin: 2px 0;
  background: color-mix(in srgb, var(--demo-border-accent-soft) 70%, transparent);
}

.ui-theme-menu-group {
  display: grid;
  gap: 6px;
}

.ui-menu-group-label {
  padding: 2px 4px 0;
  color: var(--demo-text-subtle);
  font-family: var(--pre-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.ui-theme-menu-item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.ui-theme-swatch {
  width: 12px;
  aspect-ratio: 1;
  flex: 0 0 auto;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--foreground) 28%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--surface) 42%, transparent);
}

.ui-theme-swatch.is-tech {
  background: #1a2421;
}

.ui-theme-swatch.is-dark {
  background: #cbd966;
}

.ui-theme-swatch.is-gold {
  background: #bf9e60;
}

.ui-theme-swatch.is-ios {
  background: #f2e205;
}

.ui-theme-swatch.is-ipod {
  background: #7a8ef5;
}

.ui-theme-swatch.is-amber {
  background: #05f26c;
}

.ui-host-body {
  position: relative;
  display: flex;
  align-items: stretch;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding-inline: 14px;
}

.ui-sidebar {
  position: absolute;
  z-index: 25;
  top: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 320px;
  height: 100%;
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
  right: 0;
  left: auto;
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
  transform: translateY(-50%);
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.ui-sidebar-toggle:hover {
  background: color-mix(in srgb, var(--primary) 10%, var(--background) 90%);
  box-shadow:
    8px 0 22px color-mix(in srgb, var(--shadow-color) 78%, transparent),
    0 0 18px color-mix(in srgb, var(--primary) 14%, transparent);
}

.ui-sidebar-toggle.open {
  opacity: 0;
  pointer-events: none;
  transform: translateX(320px) translateY(-50%);
}

.ui-sidebar-toggle-right {
  right: 0;
  left: auto;
  border-right: 0;
  border-left: 1px solid var(--demo-border-accent-soft);
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
  opacity: 0;
  pointer-events: none;
  transform: translateX(-320px) translateY(-50%);
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
}

.ui-sidebar-body {
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.ui-sidebar-mask {
  position: absolute;
  inset: 0;
  z-index: 24;
  background: color-mix(in srgb, black 34%, transparent);
}

.ui-utility-mask {
  position: fixed;
  inset: 0;
  z-index: 2599;
  background: color-mix(in srgb, black 26%, transparent);
}

.sidebar-mask-fade-enter-active,
.sidebar-mask-fade-leave-active,
.utility-mask-fade-enter-active,
.utility-mask-fade-leave-active,
.toolbar-menu-fade-enter-active,
.toolbar-menu-fade-leave-active {
  transition: opacity 0.18s ease;
}

.sidebar-mask-fade-enter-from,
.sidebar-mask-fade-leave-to,
.utility-mask-fade-enter-from,
.utility-mask-fade-leave-to,
.toolbar-menu-fade-enter-from,
.toolbar-menu-fade-leave-to {
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
  transform: translate(-50%, -50%) translateY(14px);
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
  padding: 14px 0;
  overflow: hidden;
}

.pre-reader-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--demo-text-tertiary);
  line-height: 1.5;
}

.pre-reader-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--demo-border-accent-soft) 74%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 18%, transparent);
}

.ui-transcript-stage {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.pre-error {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 6;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--demo-color-danger, #ff5c7a) 48%, transparent);
  background: color-mix(in srgb, var(--background) 82%, transparent);
  color: var(--demo-color-danger, #ff5c7a);
  font-size: 13px;
}

.ui-bottom-dock {
  position: relative;
  z-index: 5;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 0 14px;
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

.ui-bottom-tools {
  position: relative;
  z-index: 16;
  justify-self: center;
}

.ui-bottom-tool-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--demo-border-accent-soft) 86%, transparent);
  border-radius: 14px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 26%, transparent), transparent),
    color-mix(in srgb, var(--background) 40%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 5%, transparent),
    0 10px 24px color-mix(in srgb, var(--shadow-color) 22%, transparent);
}

.ui-bottom-tool-row .ui-signal-btn {
  justify-content: center;
  min-width: 96px;
  min-height: 36px;
  padding-inline: 12px;
}

.ui-bars {
  display: inline-flex;
  align-items: end;
  gap: 2px;
}

.ui-bars i {
  width: 3px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground) 18%, transparent);
}

.ui-bars i.active {
  background: var(--demo-text-accent);
}

.ui-bottom-console-balance {
  min-height: 1px;
}

.ui-bottom-drawer {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 2600;
  display: flex;
  flex-direction: column;
  width: min(94vw, 72rem);
  height: min(76vh, 520px);
  max-height: min(76vh, 520px);
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 84%, transparent);
  box-shadow:
    0 -10px 34px color-mix(in srgb, var(--shadow-color) 72%, transparent),
    0 0 0 1px color-mix(in srgb, var(--primary) 10%, transparent);
  transform: translate(-50%, -50%);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

@media (min-width: 761px) {
  .ui-bottom-drawer {
    width: min(94vw, calc(var(--reader-content-max, 72rem) + 180px));
  }

  .ui-bottom-drawer.is-map {
    height: min(82vh, 640px);
    max-height: min(82vh, 640px);
  }
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
  color: var(--demo-text-secondary);
  font-size: 11px;
  line-height: 1.45;
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
  color: var(--demo-text-subtle);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.ui-drawer-pill strong {
  color: var(--demo-text-accent);
  font-size: 12px;
}

.ui-bottom-drawer.is-map .ui-bottom-drawer-head {
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 10px 7px 14px;
}

.ui-bottom-drawer.is-map .ui-bottom-drawer-head-copy {
  flex: 1;
  min-width: 0;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.ui-bottom-drawer.is-map .ui-bottom-drawer-head-copy .demo-kicker {
  flex-shrink: 0;
  font-size: 9px;
  letter-spacing: 0.14em;
  opacity: 0.6;
}

.ui-bottom-drawer.is-map .ui-bottom-drawer-head strong {
  flex-shrink: 0;
  margin-top: 0;
  font-size: 13px;
}

.ui-bottom-drawer.is-map .ui-bottom-drawer-head p {
  display: none;
}

.ui-bottom-drawer.is-map .ui-drawer-pills {
  gap: 5px;
}

.ui-bottom-drawer.is-map .ui-drawer-pill {
  min-height: 20px;
  gap: 5px;
  padding: 2px 7px;
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
  line-height: 1.6;
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

.ui-bottom-drawer-body.is-map :deep(.map-panel),
.ui-bottom-drawer-body.is-map :deep(.map-section) {
  min-height: 0;
}

.ui-bottom-drawer-body.is-map :deep(.zone-card),
.ui-bottom-drawer-body.is-map :deep(.floor-card),
.ui-bottom-drawer-body.is-map :deep(.room-card),
.ui-bottom-drawer-body.is-map :deep(.map-summary-chip) {
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.ui-bottom-drawer-body :deep(.workbench-card) {
  gap: 12px;
  border-color: color-mix(in srgb, var(--demo-border-accent-soft) 82%, transparent);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  font-size: 14px;
  line-height: 1.6;
}

.ui-bottom-drawer-body :deep(.workbench-card h3),
.ui-bottom-drawer-body :deep(.workbench-card strong) {
  letter-spacing: 0.02em;
}

.ui-bottom-drawer-body :deep(button) {
  cursor: pointer;
}

.ui-bottom-drawer-body :deep(button:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--primary) 72%, white 12%);
  outline-offset: 2px;
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

@media (max-width: 900px) {
  .ui-topbar-actions {
    gap: 6px;
  }

  .ui-icon-btn {
    min-height: 36px;
    padding: 0 10px;
  }

  .ui-sidebar {
    width: min(300px, 86%);
  }
}

@media (max-width: 760px) {
  .ui-host-shell {
    min-height: 640px;
  }

  .ui-topbar {
    gap: 8px;
    padding: 8px 10px;
  }

  .ui-online,
  .ui-bottom-console-balance {
    display: none;
  }

  .ui-page-menu-trigger {
    min-width: 0;
  }

  .ui-page-menu-value {
    max-width: 5rem;
  }

  .ui-host-body {
    padding-inline: 8px;
  }

  .ui-transcript-panel {
    padding-block: 8px;
  }

  .ui-bottom-dock {
    padding-bottom: 6px;
    gap: 6px;
  }

  .ui-bottom-console-strip {
    display: flex;
    justify-content: center;
    padding: 4px;
  }

  .ui-bottom-tools {
    width: 100%;
  }

  .ui-bottom-tool-row {
    width: 100%;
    gap: 8px;
    justify-content: space-between;
  }

  .ui-bottom-tool-row .ui-signal-btn {
    flex: 1 1 auto;
    justify-content: center;
    min-height: 40px;
    min-width: 0;
    padding: 0 8px;
    gap: 3px;
    font-size: 12px;
    white-space: nowrap;
  }

  .ui-bottom-drawer {
    top: auto;
    right: 3vw;
    bottom: 80px;
    left: 3vw;
    width: 94vw;
    height: calc(100vh - 96px);
    max-height: calc(100vh - 96px);
    border-radius: 18px 18px 12px 12px;
    transform: none;
  }

  .ui-bottom-drawer.is-map {
    height: calc(100vh - 96px);
    max-height: calc(100vh - 96px);
  }

  .utility-drawer-rise-enter-from,
  .utility-drawer-rise-leave-to {
    transform: translateY(14px);
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

  .ui-bottom-drawer-body {
    padding: 10px 12px 12px;
  }

  .ui-sidebar {
    position: fixed;
    top: auto;
    bottom: 6px;
    left: 6px;
    right: auto;
    width: min(85vw, 28rem);
    height: min(94%, 46rem);
    max-height: min(94%, 46rem);
    border-radius: 22px;
    transform: translateX(-100%);
  }

  .ui-sidebar:not(.open) {
    visibility: hidden;
    pointer-events: none;
  }

  .ui-sidebar.open {
    visibility: visible;
    transform: translateX(0);
  }

  .ui-sidebar-right {
    right: 6px;
    left: auto;
    transform: translateX(100%);
  }

  .ui-sidebar-toggle,
  .ui-sidebar-toggle-right {
    position: fixed;
    width: 18px;
    height: 88px;
    min-height: 88px;
    padding: 0;
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
}
</style>
