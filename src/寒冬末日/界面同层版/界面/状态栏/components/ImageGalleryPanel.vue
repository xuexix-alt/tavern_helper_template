<template>
  <section class="gallery-panel">
    <header class="gallery-tools">
      <div class="gallery-hero">
        <span class="demo-kicker">IMAGES // ARCHIVE</span>
        <strong>楼层图廊</strong>
        <p>按 assistant 楼层回看所有生图，支持搜索、跳楼层和宿主预览。</p>
      </div>

      <label class="gallery-search">
        <span>检索</span>
        <input v-model="searchText" type="search" placeholder="角色名、提示词、楼层号" />
      </label>

      <div class="gallery-filter-row" role="tablist" aria-label="图廊筛选">
        <button
          v-for="filter in filters"
          :key="filter.key"
          type="button"
          class="gallery-filter"
          :class="{ active: activeFilter === filter.key }"
          @click="activeFilter = filter.key"
        >
          <small>{{ filter.label }}</small>
          <strong>{{ filter.value }}</strong>
        </button>
      </div>
    </header>

    <div v-if="groupedEntries.length === 0" class="gallery-empty">当前还没有可展示的楼层图片。</div>

    <div v-else class="gallery-groups">
      <section
        v-for="group in groupedEntries"
        :key="group.messageId"
        class="gallery-group"
        :class="{ active: activeMessageId === group.messageId }"
      >
        <button type="button" class="gallery-group-head" @click="emit('jump-message', group.messageId)">
          <div class="gallery-group-copy">
            <span class="gallery-group-kicker">#{{ group.messageId }}</span>
            <strong>{{ group.title }}</strong>
            <p>{{ group.subtitle }}</p>
          </div>
          <span class="gallery-group-count">{{ group.entries.length }} 张</span>
        </button>

        <div class="gallery-grid">
          <figure
            v-for="entry in group.entries"
            :key="entry.id"
            class="assistant-gallery-image"
            :data-message-id="entry.messageId"
            :data-prompt-token="encodePromptToken(entry.promptToken)"
            :data-request-id="entry.requestId ?? ''"
          >
            <img
              :src="entry.src"
              :alt="entry.title"
              loading="lazy"
              :data-message-id="entry.messageId"
              :data-prompt-token="encodePromptToken(entry.promptToken)"
              :data-request-id="entry.requestId ?? ''"
            />
            <figcaption class="gallery-caption">
              <strong>{{ entry.characterName || entry.title }}</strong>
              <small>{{ entry.title }}</small>
            </figcaption>
          </figure>
        </div>
      </section>
    </div>

    <footer class="gallery-footer">
      <button type="button" class="gallery-close-btn" @click="emit('close')">关闭图廊</button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { ReaderGalleryEntry } from '../types';

const props = defineProps<{
  entries: ReaderGalleryEntry[];
  activeMessageId?: number | null;
}>();

const emit = defineEmits<{
  (event: 'jump-message', messageId: number): void;
  (event: 'close'): void;
}>();

const searchText = ref('');
const activeFilter = ref<'all' | 'named' | 'recent'>('recent');

function encodePromptToken(value: string) {
  return encodeURIComponent(String(value ?? ''));
}

const filteredEntries = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  return props.entries.filter(entry => {
    if (activeFilter.value === 'named' && !entry.characterName) return false;
    if (activeFilter.value === 'recent' && entry.messageId < Math.max(0, (props.activeMessageId ?? 0) - 12)) return false;
    if (!keyword) return true;

    const haystack = [
      entry.title,
      entry.characterName,
      entry.promptToken,
      entry.anchorText,
      `#${entry.messageId}`,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(keyword);
  });
});

const filters = computed(() => {
  const allCount = props.entries.length;
  const namedCount = props.entries.filter(entry => entry.characterName).length;
  const recentCount = props.entries.filter(entry => entry.messageId >= Math.max(0, (props.activeMessageId ?? 0) - 12)).length;
  return [
    { key: 'all' as const, label: '全部', value: `${allCount}` },
    { key: 'named' as const, label: '带名', value: `${namedCount}` },
    { key: 'recent' as const, label: '近期', value: `${recentCount}` },
  ];
});

const groupedEntries = computed(() => {
  const groups = new Map<
    number,
    {
      messageId: number;
      title: string;
      subtitle: string;
      entries: ReaderGalleryEntry[];
    }
  >();

  for (const entry of filteredEntries.value) {
    if (!groups.has(entry.messageId)) {
      groups.set(entry.messageId, {
        messageId: entry.messageId,
        title: entry.characterName || `楼层 #${entry.messageId} 图像集`,
        subtitle: entry.characterName ? `${entry.title} · 楼层 #${entry.messageId}` : `楼层 #${entry.messageId}`,
        entries: [],
      });
    }
    groups.get(entry.messageId)?.entries.push(entry);
  }

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      subtitle: group.entries[0]?.characterName
        ? `${group.entries[0].title} · 楼层 #${group.messageId}`
        : `${group.entries.length} 张图像 · 楼层 #${group.messageId}`,
    }))
    .sort((a, b) => b.messageId - a.messageId);
});
</script>

<style scoped>
.gallery-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.gallery-tools,
.gallery-group {
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 22px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 28%, transparent), color-mix(in srgb, var(--surface) 12%, transparent)),
    radial-gradient(circle at top right, color-mix(in srgb, var(--primary) 10%, transparent), transparent 58%);
  box-shadow: var(--demo-shadow-card);
}

.gallery-tools {
  padding: 16px;
}

.gallery-hero {
  display: grid;
  gap: 6px;
}

.gallery-hero strong {
  font-family: 'Noto Serif JP', serif;
  font-size: 24px;
  letter-spacing: 0.03em;
}

.gallery-hero p {
  margin: 0;
  color: var(--demo-text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.gallery-search {
  display: grid;
  gap: 6px;
  margin-top: 14px;
}

.gallery-search span {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--demo-text-muted);
}

.gallery-search input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  border-radius: 14px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--surface) 20%, transparent);
  color: inherit;
}

.gallery-filter-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.gallery-filter {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 14%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 16%, transparent);
  color: inherit;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
}

.gallery-filter.active {
  border-color: color-mix(in srgb, var(--primary) 42%, transparent);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  transform: translateY(-1px);
}

.gallery-filter small,
.gallery-filter strong {
  text-align: left;
}

.gallery-groups {
  display: grid;
  gap: 14px;
}

.gallery-group {
  padding: 12px;
}

.gallery-group.active {
  border-color: color-mix(in srgb, var(--primary) 42%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--primary) 18%, transparent),
    var(--demo-shadow-card);
}

.gallery-group-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  padding: 4px 2px 12px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.gallery-group-copy {
  display: grid;
  gap: 4px;
  text-align: left;
}

.gallery-group-kicker,
.gallery-group-count {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--demo-text-muted);
}

.gallery-group-copy strong {
  font-size: 16px;
}

.gallery-group-copy p {
  margin: 0;
  color: var(--demo-text-secondary);
  font-size: 12px;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.assistant-gallery-image {
  margin: 0;
  display: grid;
  gap: 8px;
  cursor: pointer;
}

.assistant-gallery-image img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  background: color-mix(in srgb, var(--surface) 20%, transparent);
  box-shadow:
    0 10px 24px color-mix(in srgb, black 20%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
}

.gallery-caption {
  display: grid;
  gap: 2px;
}

.gallery-caption strong,
.gallery-caption small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-caption small {
  color: var(--demo-text-muted);
}

.gallery-empty {
  flex: 1 1 auto;
  padding: 28px 18px;
  border: 1px dashed var(--demo-border-accent-soft);
  border-radius: 20px;
  text-align: center;
  color: var(--demo-text-muted);
}

.gallery-footer {
  position: sticky;
  bottom: 0;
  padding-top: 2px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--background) 0%, transparent), color-mix(in srgb, var(--background) 92%, transparent) 18%);
}

.gallery-close-btn {
  width: 100%;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 20%, transparent);
  color: inherit;
  cursor: pointer;
  font-weight: 600;
}

@media (max-width: 720px) {
  .gallery-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
