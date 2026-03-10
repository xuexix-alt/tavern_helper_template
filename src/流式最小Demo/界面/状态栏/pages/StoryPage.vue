<template>
  <section class="demo-page">
    <OpeningSetupPanel
      v-if="shouldShowOpeningSetup"
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

    <template v-else>
      <button type="button" class="role-drawer-handle" :class="{ active: roleDrawerOpen }" @click="toggleRoleDrawer">
        <span class="role-drawer-handle-inner">
          <span class="role-drawer-handle-arrow">{{ roleDrawerOpen ? '→' : '←' }}</span>
          <span class="role-drawer-handle-text">人物</span>
        </span>
      </button>

      <details class="reader-fold-card">
        <summary class="reader-fold-summary">
          <span class="reader-fold-summary-label">日志</span>
          <small>展开</small>
        </summary>

        <div class="reader-fold-body">
          <WorkbenchTabs :logs="logs" />
        </div>
      </details>

      <TopToolbar
        v-model:filter-mode="filterMode"
        v-model:density="density"
        :total-count="transcriptStats.total"
        :latest-user-preview="readerSummary.latestUserPreview"
        :at-latest="followLatest"
        :is-browsing-history="readingMode === 'browsing_history'"
        @jump-latest="jumpLatest"
      />

      <TranscriptList
        ref="transcriptListRef"
        :items="visibleTranscript"
        :density="density"
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

      <BottomComposer
        v-model="input"
        :busy="busy"
        :status="status"
        :can-roll="Boolean(latestUserItem)"
        :swipe-label="latestAssistantSwipeLabel"
        :can-swipe-prev="canSwipeLatestAssistantPrev"
        :can-swipe-next="canSwipeLatestAssistantNext"
        @submit="runDemo"
        @roll="rollLatestTurn"
        @swipe="swipeLatestAssistant"
        @jump-latest="jumpLatest"
        @refresh="refreshWorkbench"
      />

      <transition name="role-drawer-fade">
        <div v-if="roleDrawerOpen" class="role-drawer-overlay" @click="closeRoleDrawer"></div>
      </transition>

      <aside class="role-drawer" :class="{ open: roleDrawerOpen }" aria-label="人物面板抽屉">
        <div class="role-drawer-head">
          <strong>登场角色</strong>
          <button type="button" class="role-drawer-close" @click="closeRoleDrawer">✕</button>
        </div>
        <div class="role-drawer-body">
          <MvuRolePanel :transcript-items="transcript" />
        </div>
      </aside>

      <MessageDetailModal :item="selectedItem" @close="closeDetail" />
    </template>
  </section>
</template>

<script setup lang="ts">
import BottomComposer from '../components/BottomComposer.vue';
import MessageDetailModal from '../components/MessageDetailModal.vue';
import MvuRolePanel from '../components/MvuRolePanel.vue';
import OpeningSetupPanel from '../components/OpeningSetupPanel.vue';
import TopToolbar from '../components/TopToolbar.vue';
import WorkbenchTabs from '../components/WorkbenchTabs.vue';
import TranscriptList from '../components/TranscriptList.vue';
import { useStreamingDemo } from '../useStreamingDemo';

const {
  input,
  busy,
  status,
  filterMode,
  density,
  readingMode,
  followLatest,
  openingExpanded,
  selectedItem,
  transcript,
  visibleTranscript,
  transcriptStats,
  latestUserItem,
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
  refreshWorkbench,
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

function jumpLatest() {
  transcriptListRef.value?.scrollToLatest?.();
}

function toggleRoleDrawer() {
  roleDrawerOpen.value = !roleDrawerOpen.value;
}

function closeRoleDrawer() {
  roleDrawerOpen.value = false;
}
</script>

<style scoped>
.demo-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
}

.role-drawer-handle {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 18;
  width: 26px;
  border: 0;
  border-left: 1px solid var(--demo-border-accent-muted);
  background: color-mix(in srgb, var(--demo-surface-card-strong) 88%, transparent);
  color: var(--demo-text-primary);
  padding: 0;
  backdrop-filter: blur(8px);
}

.role-drawer-handle.active {
  background: var(--demo-gradient-chip-active);
  border-color: var(--demo-border-accent-active);
}

.role-drawer-handle-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}

.role-drawer-handle-arrow {
  font-size: 16px;
  line-height: 1;
}

.role-drawer-handle-text {
  font-size: 11px;
  letter-spacing: 0.18em;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.reader-fold-card {
  align-self: flex-end;
  width: fit-content;
  max-width: 100%;
  border-radius: 999px;
  background: var(--demo-surface-card-strong);
  border: 1px solid var(--demo-border-accent);
  overflow: hidden;
}

.reader-fold-card[open] {
  align-self: stretch;
  width: 100%;
  border-radius: 12px;
}

.reader-fold-summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
  list-style: none;
  color: var(--demo-text-primary);
}

.reader-fold-summary-label {
  font-size: 11px;
  line-height: 1;
}

.reader-fold-summary::-webkit-details-marker {
  display: none;
}

.reader-fold-summary small {
  color: var(--demo-text-subtle);
  font-size: 10px;
}

.reader-fold-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 0 12px;
}

.role-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  z-index: 19;
}

.role-drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 20;
  width: min(420px, 92vw);
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--demo-surface-card-strong);
  border-left: 1px solid var(--demo-border-accent);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.24);
  transform: translateX(calc(100% - 1px));
  transition: transform 0.24s ease;
}

.role-drawer.open {
  transform: translateX(0);
}

.role-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}

.role-drawer-close {
  border: 0;
  background: transparent;
  color: var(--demo-text-primary);
  font-size: 18px;
}

.role-drawer-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.role-drawer-fade-enter-active,
.role-drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.role-drawer-fade-enter-from,
.role-drawer-fade-leave-to {
  opacity: 0;
}

@media (max-width: 680px) {
  .reader-fold-summary {
    justify-content: center;
  }

  .role-drawer {
    width: 100vw;
  }

  .role-drawer-handle {
    width: 22px;
  }
}
</style>
