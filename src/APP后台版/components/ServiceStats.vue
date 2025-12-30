<template>
  <div class="rounded-3xl border border-violet-500/20 bg-gradient-to-br from-slate-900/80 to-black/60 p-6 shadow-2xl shadow-violet-500/10 backdrop-blur-xl">
    <div class="mb-6 flex items-center justify-between">
      <h3 class="text-white">当前收益</h3>
      <i class="fas fa-chart-line text-green-400"></i>
    </div>

    <div class="relative mb-6">
      <div class="relative mx-auto h-32 w-32">
        <!-- Circular Progress Placeholder -->
        <div class="absolute inset-0 flex flex-col items-center justify-center rounded-full border-8 border-slate-800">
          <div class="mb-1 text-2xl text-white">{{ winRate }}%</div>
          <div class="text-xs text-slate-400">胜率</div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <i class="fas fa-dollar-sign text-green-400"></i>
            <span class="text-sm text-slate-400">账户余额</span>
          </div>
          <span class="text-white">¥{{ balance }}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/10 to-emerald-600/10 p-3 text-center">
          <div class="text-lg text-green-400">+¥{{ weeklyProfit }}</div>
          <div class="text-xs text-green-400/70">本周收益</div>
        </div>
        <div class="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-red-600/10 p-3 text-center">
          <div class="text-lg text-orange-400">-¥{{ dailyLoss }}</div>
          <div class="text-xs text-orange-400/70">今日支出</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

// 模拟数据，实际应从 Store 或 props 获取
const winRate = 68;
const balance = '12,450.89';
const weeklyProfit = '2,340';
const dailyLoss = '158';
</script>
