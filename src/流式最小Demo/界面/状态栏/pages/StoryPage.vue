<template>
  <section class="demo-page">
    <TopToolbar
      v-model:filter-mode="filterMode"
      v-model:density="density"
      :total-count="transcriptStats.total"
      :assistant-count="transcriptStats.assistant"
      :assistant-message-id="assistantMessageId"
      :at-latest="followLatest"
      @jump-latest="jumpLatest"
    />

    <TranscriptList
      ref="transcriptListRef"
      :items="visibleTranscript"
      :density="density"
      :should-follow-latest="followLatest"
      @open-detail="openDetail"
      @follow-change="followLatest = $event"
    />

    <BottomComposer
      v-model="input"
      :busy="busy"
      :status="status"
      :can-regenerate="!!latestUserItem"
      :can-regenerate-edited="inputHasText"
      @submit="runDemo"
      @regenerate="regenerateLatest"
      @regenerate-edited="regenerateWithEditedInput"
    />

    <MessageDetailModal :item="selectedItem" :busy="busy" @close="closeDetail" @delete-from="onDeleteFrom" />
  </section>
</template>

<script setup lang="ts">
import BottomComposer from '../components/BottomComposer.vue';
import MessageDetailModal from '../components/MessageDetailModal.vue';
import TopToolbar from '../components/TopToolbar.vue';
import TranscriptList from '../components/TranscriptList.vue';
import { useStreamingDemo } from '../useStreamingDemo';

const {
  input,
  busy,
  status,
  assistantMessageId,
  filterMode,
  density,
  followLatest,
  selectedItem,
  visibleTranscript,
  transcriptStats,
  latestUserItem,
  inputHasText,
  runDemo,
  regenerateLatest,
  regenerateWithEditedInput,
  deleteFromMessageId,
  openDetail,
  closeDetail,
} = useStreamingDemo();

const transcriptListRef = ref<InstanceType<typeof TranscriptList> | null>(null);

function jumpLatest() {
  transcriptListRef.value?.scrollToLatest?.();
}

function onDeleteFrom(item: { message_id: number }) {
  void deleteFromMessageId(item.message_id).then(() => {
    closeDetail();
  });
}
</script>

<style scoped>
.demo-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
