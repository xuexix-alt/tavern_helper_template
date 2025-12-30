<template>
  <div class="flex h-80 flex-col rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-900/80 to-black/60 p-4 shadow-2xl shadow-blue-500/10 backdrop-blur-xl">
    <div class="mb-4 flex items-center space-x-2">
      <i class="fas fa-info-circle text-blue-400"></i>
      <h3 class="text-white">Package Details</h3>
      <div class="ml-auto flex items-center space-x-1">
        <div class="h-2 w-2 animate-pulse rounded-full bg-green-400"></div>
        <span class="text-xs text-green-400">Active</span>
      </div>
    </div>

    <div class="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent flex-1 space-y-3 overflow-y-auto">
      <div v-for="(msg, index) in details" :key="index" class="flex items-start space-x-2">
        <div class="relative">
          <div class="h-8 w-8 overflow-hidden rounded-lg border border-slate-600/50">
            <img :src="msg.avatar" :alt="msg.user" class="h-full w-full object-cover" />
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center space-x-2">
            <span :class="['text-sm', msg.isHighlight ? 'text-yellow-400' : 'text-blue-400']">
              {{ msg.user }}
            </span>
            <span class="text-xs text-slate-500">{{ msg.time }}</span>
          </div>
          <p class="text-sm break-words text-slate-300">{{ msg.message }}</p>
        </div>
      </div>
    </div>

    <div class="mt-4 flex items-center space-x-2 border-t border-slate-700/50 pt-4">
      <input
        placeholder="Type a command..."
        class="flex-1 rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500/50 focus:outline-none"
      />
      <button class="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-500 to-violet-600 shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-violet-700">
        <i class="fas fa-paper-plane text-white"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const details = [
  {
    user: "System",
    message: "Package initialized. Waiting for user input.",
    time: "1m",
    avatar: "https://via.placeholder.com/80",
    isHighlight: true
  },
  {
    user: "Assistant",
    message: "Welcome! How can I serve you today?",
    time: "2m",
    avatar: "https://via.placeholder.com/80",
    isHighlight: false
  },
  {
    user: "Info",
    message: "Duration: 60 mins | Price: 500 Gold",
    time: "3m",
    avatar: "https://via.placeholder.com/80",
    isHighlight: false
  }
];
</script>
