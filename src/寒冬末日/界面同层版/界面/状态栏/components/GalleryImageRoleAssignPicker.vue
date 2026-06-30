<template>
  <Teleport to="body">
    <div class="role-assign-mask" @click.self="emit('close')">
      <section class="role-assign-picker clip-corner" role="dialog" aria-modal="true">
        <header class="role-assign-head">
          <div>
            <span class="demo-kicker">PORTRAIT // ASSIGN</span>
            <strong>把这张图加入角色设定集</strong>
          </div>
          <button type="button" class="role-assign-close clip-corner-sm" @click="emit('close')">✕</button>
        </header>

        <div class="role-assign-preview clip-corner-sm">
          <img :src="entry.src" :alt="entry.alt || entry.title || '图廊图像'" loading="lazy" />
          <div class="role-assign-preview-copy">
            <small>{{ entry.title || `楼层 #${entry.messageId}` }}</small>
            <small>{{ entry.characterName || '未标注角色' }}</small>
          </div>
        </div>

        <label class="role-assign-search">
          <span>搜索角色</span>
          <input v-model="searchText" type="search" placeholder="输入角色姓名" />
        </label>

        <div v-if="filteredRoles.length === 0" class="role-assign-empty clip-corner-sm">没有匹配到可分配的角色。</div>

        <div v-else class="role-assign-grid">
          <button
            v-for="role in filteredRoles"
            :key="role.key"
            type="button"
            class="role-assign-option clip-corner-sm"
            :class="{ owned: role.alreadyOwns }"
            :title="role.alreadyOwns ? '当前设定集已包含这张图' : '加入该角色设定集'"
            @click="emit('assign', role.key)"
          >
            <strong>{{ role.label }}</strong>
            <small>{{ role.alreadyOwns ? '已在设定集 · 点击设为主图' : '加入设定集' }}</small>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ReaderGalleryEntry } from '../types';

export type GalleryImageRoleAssignRoleOption = {
  key: string;
  label: string;
  alreadyOwns?: boolean;
};

const props = defineProps<{
  entry: ReaderGalleryEntry;
  roles: GalleryImageRoleAssignRoleOption[];
}>();

const emit = defineEmits<{
  (event: 'assign', roleKey: string): void;
  (event: 'close'): void;
}>();

const searchText = ref('');

const filteredRoles = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  if (!keyword) return props.roles;
  return props.roles.filter(role => {
    const haystack = `${role.label} ${role.key}`.toLowerCase();
    return haystack.includes(keyword);
  });
});
</script>

<style scoped lang="scss">
.role-assign-mask {
  position: fixed;
  inset: 0;
  z-index: 2700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: color-mix(in srgb, black 48%, transparent);
  backdrop-filter: blur(6px);
}

.role-assign-picker {
  display: grid;
  gap: 14px;
  width: min(100%, 420px);
  max-height: min(90vh, 640px);
  padding: 18px;
  background: color-mix(in srgb, var(--surface) 92%, black 8%);
  border: 1px solid var(--demo-border-accent-soft);
  box-shadow: var(--demo-shadow-card);
}

.role-assign-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.role-assign-head strong {
  display: block;
  font-size: 16px;
}

.role-assign-close {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--primary) 22%, transparent);
  background: color-mix(in srgb, var(--surface) 20%, transparent);
  color: inherit;
  cursor: pointer;
}

.role-assign-preview {
  display: flex;
  gap: 12px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  background: color-mix(in srgb, var(--surface) 16%, transparent);

  img {
    width: 68px;
    height: 90px;
    object-fit: cover;
    border-radius: 8px;
  }
}

.role-assign-preview-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  color: var(--demo-text-secondary);
  font-size: 12px;
}

.role-assign-preview-copy small {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-assign-search {
  display: grid;
  gap: 6px;
}

.role-assign-search span {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--demo-text-muted);
}

.role-assign-search input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 20%, transparent);
  color: inherit;
}

.role-assign-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  max-height: 320px;
  overflow: auto;
  padding-right: 4px;
}

.role-assign-option {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--primary) 16%, transparent);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background 160ms ease;
}

.role-assign-option:hover {
  border-color: color-mix(in srgb, var(--primary) 38%, transparent);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  transform: translateY(-1px);
}

.role-assign-option.owned {
  border-color: color-mix(in srgb, var(--primary) 48%, transparent);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
}

.role-assign-option small {
  color: var(--demo-text-muted);
}

.role-assign-empty {
  padding: 16px;
  border: 1px dashed color-mix(in srgb, var(--primary) 22%, transparent);
  color: var(--demo-text-muted);
  text-align: center;
}

@media (max-width: 640px) {
  .role-assign-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
