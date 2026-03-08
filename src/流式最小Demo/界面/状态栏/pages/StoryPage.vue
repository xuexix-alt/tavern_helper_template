<template>
  <section class="demo-page">
    <ReadingHeader :summary="readerSummary" />

    <ContextSummaryCard :summary="readerSummary" />

    <WorkbenchTabs :summary="readerSummary" :logs="logs" />

    <OpeningSetupPanel
      v-if="shouldShowOpeningSetup"
      :preset="openingPreset"
      :payload="openingPayload"
      :busy="busy"
      @update-meta="updateOpeningMeta"
      @update-field="updateOpeningField"
      @submit="generateOpening"
    />

    <TopToolbar
      v-model:filter-mode="filterMode"
      v-model:density="density"
      :total-count="transcriptStats.total"
      :assistant-count="transcriptStats.assistant"
      :assistant-message-id="assistantMessageId"
      :at-latest="followLatest"
      :reading-mode-label="readingModeLabel"
      @jump-latest="jumpLatest"
    />

    <HistoryModeBanner :visible="readingMode === 'browsing_history'" @jump-latest="jumpLatest" />

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
      @submit="runDemo"
      @jump-latest="jumpLatest"
      @refresh="rebuildTranscript"
    />

    <MessageDetailModal :item="selectedItem" @close="closeDetail" />
  </section>
</template>

<script setup lang="ts">
import BottomComposer from '../components/BottomComposer.vue';
import ContextSummaryCard from '../components/ContextSummaryCard.vue';
import HistoryModeBanner from '../components/HistoryModeBanner.vue';
import MessageDetailModal from '../components/MessageDetailModal.vue';
import OpeningSetupPanel from '../components/OpeningSetupPanel.vue';
import ReadingHeader from '../components/ReadingHeader.vue';
import TopToolbar from '../components/TopToolbar.vue';
import WorkbenchTabs from '../components/WorkbenchTabs.vue';
import TranscriptList from '../components/TranscriptList.vue';
import { useStreamingDemo } from '../useStreamingDemo';

const {
  input,
  busy,
  status,
  assistantMessageId,
  filterMode,
  density,
  readingMode,
  readingModeLabel,
  followLatest,
  openingExpanded,
  selectedItem,
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
  openingPreset,
  openingPayload,
  shouldShowOpeningSetup,
  runDemo,
  updateOpeningMeta,
  updateOpeningField,
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
  rebuildTranscript,
  openDetail,
  closeDetail,
} = useStreamingDemo();

const transcriptListRef = ref<InstanceType<typeof TranscriptList> | null>(null);

function jumpLatest() {
  transcriptListRef.value?.scrollToLatest?.();
}
</script>

<style scoped>
.demo-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
