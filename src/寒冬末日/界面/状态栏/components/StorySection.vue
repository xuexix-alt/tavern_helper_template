<template>
  <section class="section">
    <h2 class="section-title">📖 正文剧情 📖</h2>
    <div class="content-text">
      <template v-for="seg in segments" :key="seg.key">
        <img v-if="seg.isImage" :src="seg.imageUrl" :alt="seg.altText" class="story-image" />
        <span v-else :class="seg.className">{{ seg.text }}</span>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
type Segment = {
  key: string;
  text: string;
  className?: string;
  isImage?: boolean;
  imageUrl?: string;
  altText?: string;
};

const props = defineProps<{
  content: string;
}>();

const segments = computed<Segment[]>(() => {
  const text = props.content ?? '';
  if (!text.trim()) {
    return [{ key: 'empty', text: '(暂无正文)' }];
  }

  // Group 1: Image Alt, Group 2: Image URL
  // Group 3: Chinese Quote, Group 4: English Quote, Group 5: Thought
  const pattern = /!\[(.*?)\]\((.*?)\)|“([^”]+)”|"([^"]+)"|\*([^*]+)\*/g;
  const result: Segment[] = [];

  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      result.push({ key: `t${result.length}`, text: text.slice(lastIndex, index) });
    }

    if (match[1] != null && match[2] != null) {
      result.push({
        key: `img${result.length}`,
        text: match[0],
        isImage: true,
        altText: match[1],
        imageUrl: match[2],
      });
    } else if (match[5] != null) {
      result.push({
        key: `t${result.length}`,
        text: `*${match[5]}*`,
        className: 'thought-text',
      });
    } else if (match[3] != null) {
      result.push({
        key: `t${result.length}`,
        text: `“${match[3]}”`,
        className: 'dialog-text',
      });
    } else if (match[4] != null) {
      result.push({
        key: `t${result.length}`,
        text: `"${match[4]}"`,
        className: 'dialog-text',
      });
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push({ key: `t${result.length}`, text: text.slice(lastIndex) });
  }

  return result;
});
</script>
