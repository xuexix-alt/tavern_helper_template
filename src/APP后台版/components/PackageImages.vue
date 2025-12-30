<template>
  <div class="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-slate-900/80 to-black/60 p-4 shadow-2xl shadow-purple-500/10 backdrop-blur-xl">
    <div class="mb-4 flex items-center space-x-2">
      <i class="fas fa-images text-purple-400"></i>
      <h3 class="text-white">Gallery</h3>
    </div>

    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div v-for="(img, index) in images" :key="index" class="group relative aspect-square overflow-hidden rounded-xl border border-slate-700/50">
          <img
            :src="img.src"
            :alt="img.alt"
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            @error="handleImageError"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div class="absolute bottom-2 left-2 text-xs text-white">{{ img.alt }}</div>
          </div>
        </div>
      </div>
    </div>

    <button class="mt-4 w-full rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-pink-500/10 py-2 text-sm text-purple-400 transition-all duration-300 hover:from-purple-500/20 hover:to-pink-500/20">
      View Full Gallery
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

// 模拟图片数据，支持 URL 和 Base64
const images = ref([
  { src: "https://via.placeholder.com/300", alt: "Preview 1" },
  { src: "https://via.placeholder.com/300", alt: "Preview 2" },
  { src: "https://via.placeholder.com/300", alt: "Preview 3" },
  { src: "https://via.placeholder.com/300", alt: "Preview 4" }
]);

// 处理本地图片加载 (Base64/Blob)
function handleImageError(e: Event) {
  const target = e.target as HTMLImageElement;
  // Fallback image
  target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM0NzU1NjkiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiI+PC9yZWN0PjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ij48L2NpcmNsZT48cG9seWxpbmUgcG9pbnRzPSIyMSAxNSAxNiAxMCA1IDIxIj48L3BvbHlsaW5lPjwvc3ZnPg==';
  target.classList.add('p-8', 'opacity-50'); // Style the fallback
}
</script>
