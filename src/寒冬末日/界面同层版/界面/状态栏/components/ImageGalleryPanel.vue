<template>
  <section class="gallery-panel">
    <header class="gallery-tools" :class="{ collapsed: toolsCollapsed }">
      <!-- 收起时显示的紧凑栏 -->
      <button v-if="toolsCollapsed" type="button" class="gallery-tools-collapsed" @click="toolsCollapsed = false">
        <span class="gallery-tools-collapsed-search">检索</span>
        <span class="gallery-tools-collapsed-count">全部 {{ filters[0].value }}</span>
        <span class="gallery-tools-collapsed-arrow">∨</span>
      </button>

      <!-- 展开时的完整内容 -->
      <template v-else>
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
          <button type="button" class="gallery-filter-collapse-btn" @click="toolsCollapsed = true">
            <small>收起</small>
            <strong>∧</strong>
          </button>
        </div>
      </template>
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
          <GeneratedImageAsset
            v-for="entry in group.entries"
            :key="entry.id"
            :entry="entry"
            variant="gallery"
            :show-caption="true"
<<<<<<< HEAD
            @open="emit('open-image', $event)"
            @regenerate="emit('regenerate-image', $event)"
=======
            @view="emit('image-view', $event)"
            @regenerate="emit('image-regenerate', $event)"
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)
          />
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { GeneratedImageActivationPayload } from '../generatedImageActivation';
import type { ReaderGalleryEntry } from '../types';
import GeneratedImageAsset from './GeneratedImageAsset.vue';

const props = defineProps<{
  entries: ReaderGalleryEntry[];
  activeMessageId?: number | null;
}>();

const emit = defineEmits<{
  (event: 'jump-message', messageId: number): void;
  (event: 'image-view', payload: GeneratedImageActivationPayload): void;
  (event: 'image-regenerate', payload: GeneratedImageActivationPayload): void;
  (event: 'close'): void;
  (event: 'open-image', entry: ReaderGalleryEntry): void;
  (event: 'regenerate-image', entry: ReaderGalleryEntry): void;
}>();

const searchText = ref('');
const activeFilter = ref<'all' | 'named' | 'recent'>('recent');
const toolsCollapsed = ref(true);

const filteredEntries = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  return props.entries.filter(entry => {
    if (activeFilter.value === 'named' && !entry.characterName) return false;
    if (activeFilter.value === 'recent' && entry.messageId < Math.max(0, (props.activeMessageId ?? 0) - 12))
      return false;
    if (!keyword) return true;

    const haystack = [entry.title, entry.characterName, entry.promptToken, entry.anchorText, `#${entry.messageId}`]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(keyword);
  });
});

const filters = computed(() => {
  const allCount = props.entries.length;
  const namedCount = props.entries.filter(entry => entry.characterName).length;
  const recentCount = props.entries.filter(
    entry => entry.messageId >= Math.max(0, (props.activeMessageId ?? 0) - 12),
  ).length;
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
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 16px;
  height: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

.gallery-tools,
.gallery-group {
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 22px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface) 28%, transparent),
      color-mix(in srgb, var(--surface) 12%, transparent)
    ),
    radial-gradient(circle at top right, color-mix(in srgb, var(--primary) 10%, transparent), transparent 58%);
  box-shadow: var(--demo-shadow-card);
}

.gallery-tools {
  padding: 16px;
}

.gallery-search {
  display: grid;
  gap: 6px;
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
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
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

.gallery-filter-collapse-btn {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 14%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 16%, transparent);
  color: inherit;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.gallery-filter-collapse-btn small,
.gallery-filter-collapse-btn strong {
  text-align: left;
}

.gallery-tools-collapsed {
  display: none;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 14%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 16%, transparent);
  color: inherit;
  cursor: pointer;
}

.gallery-tools-collapsed-search {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--demo-text-muted);
}

.gallery-tools-collapsed-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--demo-text-primary);
}

.gallery-tools-collapsed-arrow {
  font-size: 12px;
  color: var(--demo-text-muted);
}

.gallery-groups {
  display: grid;
  gap: 14px;
  min-height: 0;
  overflow: auto;
  padding-bottom: 6px;
  align-content: start;
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

.gallery-empty {
  min-height: 0;
  padding: 28px 18px;
  border: 1px dashed var(--demo-border-accent-soft);
  border-radius: 20px;
  text-align: center;
  color: var(--demo-text-muted);
  overflow: auto;
}

@media (max-width: 720px) {
  .gallery-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gallery-tools {
    padding: 10px 12px;
  }

  .gallery-tools.collapsed {
    padding: 8px 12px;
  }

  /* 折叠状态：只显示紧凑栏 */
  .gallery-tools.collapsed .gallery-tools-collapsed {
    display: flex;
  }

  .gallery-tools.collapsed .gallery-search {
    display: none;
  }

  .gallery-tools.collapsed .gallery-filter-row {
    display: none;
  }

  /* 展开状态：显示完整内容 */
  .gallery-tools:not(.collapsed) .gallery-tools-collapsed {
    display: none;
  }

  .gallery-tools:not(.collapsed) .gallery-search {
    display: grid;
  }

  .gallery-tools:not(.collapsed) .gallery-filter-row {
    display: grid;
  }
}
</style>
