<template>
  <div class="stream-renderer">
    <template v-for="block in blocks" :key="block.id">
      <!-- 普通文本块 -->
      <div
        v-if="block.type === 'text'"
        class="sr-text"
        >{{ block.content }}<span v-if="block.active" class="sr-cursor" aria-hidden="true" /></div>

      <!-- <scene> 场景块 -->
      <div v-else-if="block.type === 'scene'" class="sr-scene">
        <span class="sr-scene-label">场景</span>
        {{ block.content }}
      </div>

      <!-- <option> 选项块 -->
      <div v-else-if="block.type === 'option'" class="sr-option">
        <div class="sr-option-header">请做出选择</div>
        <button
          v-for="opt in block.options"
          :key="opt.key"
          class="sr-option-btn"
          :class="{ selected: block.selected === opt.key }"
          @click="selectOption(block, opt)"
        >
          <span class="sr-option-key">{{ opt.key }}</span>
          <span>{{ opt.label }}</span>
        </button>
      </div>

      <!-- <UpdateVariable> 变量更新块 -->
      <details v-else-if="block.type === 'update'" class="sr-update">
        <summary class="sr-update-summary">
          <span class="sr-update-icon">⚙</span>
          变量更新
          <span class="sr-update-badge">{{ block.ops.length }} ops</span>
        </summary>
        <div class="sr-update-body">
          <div
            v-for="(op, i) in block.ops"
            :key="i"
            :class="['sr-op', `sr-op-${op.op}`]"
          >
            <span class="sr-op-type">{{ op.op.toUpperCase() }}</span>
            <span class="sr-op-path">{{ op.path }}</span>
            <span class="sr-op-arrow">→</span>
            <span class="sr-op-value">{{ JSON.stringify(op.value) }}</span>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup>
/**
 * StreamRenderer.vue
 *
 * 将带有结构化标签的流式文本渲染为富文本 UI。
 *
 * ─────────────────────────────────────────────
 * 【支持的标签】
 *
 *   <scene>...</scene>
 *     场景描述框，标签闭合后整块淡入渲染。
 *     内容为纯文本，不嵌套其他标签。
 *
 *   <option>
 *   【A】选项文字
 *   【B】选项文字
 *   </option>
 *     选项按钮组，标签闭合后整块渲染。
 *     每行格式必须为 【大写字母】文字，否则跳过该行。
 *     点击后 emit('option-select', { key, label })。
 *
 *   <UpdateVariable>
 *     <JSONPatch>[...RFC6902 JSON Patch 数组...]</JSONPatch>
 *   </UpdateVariable>
 *     变量更新折叠面板，标签闭合后整块渲染。
 *     <JSONPatch> 必须是合法 JSON 数组，否则降级为纯文本显示。
 *     <Analysis> 子标签内容目前忽略不渲染（可按需扩展）。
 *
 *   其余标签：不识别的标签内容会作为普通文本输出，
 *             < 符号本身也作为普通字符输出。
 *
 * ─────────────────────────────────────────────
 * 【边界条件与已知限制】
 *
 *   1. 标签跨 chunk 切割
 *      解析器使用 buffer 缓冲，标签未完全到达时等待下一个 chunk，
 *      不会提前渲染残缺标签内容。
 *      ⚠️ 极端情况：单个 chunk 超过 8 字节结尾恰好切在 `</tag` 中间，
 *         会延迟一个 tick，属正常现象。
 *
 *   2. 标签不支持嵌套
 *      <option> 内不能再嵌 <scene>，<UpdateVariable> 内部的
 *      <Analysis>/<JSONPatch> 是硬编码子解析，不走通用流程。
 *
 *   3. 普通文本换行
 *      使用 white-space: pre-wrap，\n 直接渲染为换行。
 *      如果上游输出 \r\n，建议在 feed() 前统一替换为 \n。
 *
 *   4. 文本块合并
 *      连续的普通文本 chunk 会追加到同一个 text block，
 *      遇到结构化标签时自动断开，下次普通文本新建 block。
 *
 *   5. 光标
 *      光标始终附在最后一个 text block 末尾，
 *      结构化块渲染前会先移除光标，渲染完不会自动恢复
 *      （因为结构化块后可能继续有文本，届时自然产生新光标）。
 *      流结束后调用 finish() 移除光标。
 *
 *   6. option 选中状态
 *      选中后 emit，但不锁定按钮（可重复选）。
 *      如需锁定请在父组件监听后设置 disabled 或直接改此处逻辑。
 *
 *   7. JSONPatch 解析失败
 *      JSON.parse 抛出时，ops 为空数组，body 降级显示原始文本。
 *
 *   8. 流异常中断
 *      调用 finish() 可强制结束（移除光标、清理状态），
 *      不会破坏已渲染内容。
 *
 *   9. 组件卸载
 *      onUnmounted 自动调用 finish()，防止残留状态。
 *
 *  10. 性能
 *      blocks 数组追加驱动响应式更新，每个 chunk 最多触发一次
 *      Vue 批量 patch。大量 chunk 时建议 feed() 在 requestAnimationFrame
 *      或 nextTick 中调用，避免同步堆积。
 *
 * ─────────────────────────────────────────────
 * 【Props】
 *   无。所有内容通过 feed() / finish() 方法驱动。
 *
 * 【Emits】
 *   option-select  { key: string, label: string }
 *     用户点击选项时触发。
 *
 * 【Expose（供父组件调用）】
 *   feed(chunk: string)   喂入一个流式 chunk
 *   finish()              通知流结束，清理光标
 *   reset()               清空所有内容，恢复初始状态
 *
 * 【用法示例】
 *
 *   <StreamRenderer ref="renderer" @option-select="onSelect" />
 *
 *   // 接入 SSE
 *   const renderer = ref(null)
 *   const res = await fetch('/api/stream')
 *   const reader = res.body.getReader()
 *   const dec = new TextDecoder()
 *   while (true) {
 *     const { done, value } = await reader.read()
 *     if (done) { renderer.value.finish(); break }
 *     renderer.value.feed(dec.decode(value, { stream: true }))
 *   }
 */

import { ref, onUnmounted } from 'vue'

const emit = defineEmits(['option-select'])

// ─── 状态 ────────────────────────────────────────
const blocks = ref([])   // 渲染块数组
let buffer = ''          // 未解析缓冲
let idSeq = 0            // block id 自增

const BLOCK_TAGS = ['option', 'scene', 'UpdateVariable']

// ─── 公开方法 ─────────────────────────────────────
function feed(chunk) {
  buffer += chunk
  flush(false)
}

function finish() {
  flush(true)
  // 移除所有光标
  blocks.value.forEach(b => { if (b.active) b.active = false })
  buffer = ''
}

function reset() {
  finish()
  blocks.value = []
  buffer = ''
  idSeq = 0
}

defineExpose({ feed, finish, reset })

// ─── 解析主循环 ────────────────────────────────────
function flush(isFinal) {
  while (buffer.length > 0) {
    // 找最近的已知开始标签
    let nearestTag = null
    let nearestIdx = Infinity
    for (const tag of BLOCK_TAGS) {
      const idx = buffer.indexOf('<' + tag + '>')
      if (idx !== -1 && idx < nearestIdx) {
        nearestIdx = idx
        nearestTag = tag
      }
    }

    if (nearestTag !== null) {
      // 标签前有普通文本，先输出
      if (nearestIdx > 0) {
        appendText(buffer.slice(0, nearestIdx))
        buffer = buffer.slice(nearestIdx)
        continue
      }
      // 等闭合标签
      const closeTag = '</' + nearestTag + '>'
      const closeIdx = buffer.indexOf(closeTag)
      if (closeIdx === -1) break  // 等待更多 chunk
      const inner = buffer.slice(('<' + nearestTag + '>').length, closeIdx)
      buffer = buffer.slice(closeIdx + closeTag.length)
      commitBlock(nearestTag, inner)
      continue
    }

    // 没有已知标签，处理普通文本
    const ltIdx = buffer.indexOf('<')
    if (ltIdx === -1) {
      // 无 < 符号
      if (isFinal) {
        appendText(buffer)
        buffer = ''
      } else {
        // 保留末尾 8 字节防止标签被切断
        const safe = buffer.length > 8 ? buffer.slice(0, -8) : ''
        if (safe) appendText(safe)
        buffer = buffer.slice(safe.length)
      }
      break
    }
    if (ltIdx > 0) {
      appendText(buffer.slice(0, ltIdx))
      buffer = buffer.slice(ltIdx)
    } else {
      // < 开头但不是已知标签，当普通字符输出
      appendText('<')
      buffer = buffer.slice(1)
    }
  }
}

// ─── 普通文本追加 ──────────────────────────────────
function appendText(text) {
  if (!text) return
  const last = blocks.value.at(-1)
  if (last?.type === 'text') {
    last.content += text
  } else {
    // 关掉上一个 block 的光标
    if (last) last.active = false
    blocks.value.push({ id: idSeq++, type: 'text', content: text, active: true })
  }
}

// ─── 结构化块提交 ──────────────────────────────────
function commitBlock(tag, inner) {
  // 关掉文本光标
  const last = blocks.value.at(-1)
  if (last) last.active = false

  if (tag === 'scene') {
    blocks.value.push({ id: idSeq++, type: 'scene', content: inner.trim() })

  } else if (tag === 'option') {
    const options = inner.trim().split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        const m = l.match(/^【([A-Z])】(.+)/)
        return m ? { key: m[1], label: m[2].trim() } : null
      })
      .filter(Boolean)
    blocks.value.push({ id: idSeq++, type: 'option', options, selected: null })

  } else if (tag === 'UpdateVariable') {
    const patchMatch = inner.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/)
    let ops = []
    let rawFallback = ''
    if (patchMatch) {
      try {
        ops = JSON.parse(patchMatch[1].trim())
      } catch {
        rawFallback = patchMatch[1].trim()
      }
    }
    blocks.value.push({ id: idSeq++, type: 'update', ops, rawFallback })
  }
}

// ─── 选项点击 ─────────────────────────────────────
function selectOption(block, opt) {
  block.selected = opt.key
  emit('option-select', { key: opt.key, label: opt.label })
}

onUnmounted(finish)
</script>

<style scoped>
.stream-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 普通文本 */
.sr-text {
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 打字机光标 */
.sr-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: currentColor;
  opacity: 0.5;
  vertical-align: text-bottom;
  margin-left: 1px;
  animation: sr-blink 0.7s step-end infinite;
}
@keyframes sr-blink { 50% { opacity: 0 } }

/* 场景块 */
.sr-scene {
  border-left: 3px solid #7F77DD;
  background: rgba(127, 119, 221, 0.07);
  border-radius: 0 6px 6px 0;
  padding: 10px 16px;
  font-size: 14px;
  line-height: 1.7;
  color: #555;
  animation: sr-fadein 0.35s ease;
}
.sr-scene-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7F77DD;
  margin-bottom: 5px;
}

/* 选项块 */
.sr-option {
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  overflow: hidden;
  animation: sr-fadein 0.35s ease;
}
.sr-option-header {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #999;
  padding: 9px 14px 7px;
  border-bottom: 1px solid #e5e5e5;
}
.sr-option-btn {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-bottom: 1px solid #e5e5e5;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  line-height: 1.6;
  color: #222;
  transition: background 0.15s;
  font-family: inherit;
}
.sr-option-btn:last-child { border-bottom: none }
.sr-option-btn:hover { background: #f7f7f7 }
.sr-option-btn.selected { background: #eef3ff; color: #2a56c6 }
.sr-option-key {
  font-weight: 600;
  min-width: 20px;
  opacity: 0.45;
  flex-shrink: 0;
}

/* 变量更新块 */
.sr-update {
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  overflow: hidden;
  animation: sr-fadein 0.35s ease;
}
.sr-update-summary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  background: #fafafa;
  list-style: none;
  user-select: none;
}
.sr-update-summary:hover { background: #f2f2f2 }
.sr-update-icon { font-size: 14px }
.sr-update-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 99px;
  background: #e8f5ec;
  color: #1e7e34;
  font-weight: 500;
  margin-left: 4px;
}
.sr-update-body {
  padding: 10px 14px;
  font-size: 12px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  line-height: 1.8;
  border-top: 1px solid #e5e5e5;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-x: auto;
}
.sr-op {
  display: flex;
  gap: 10px;
  white-space: nowrap;
}
.sr-op-type {
  font-weight: 600;
  min-width: 60px;
  flex-shrink: 0;
}
.sr-op-replace .sr-op-type { color: #1D9E75 }
.sr-op-add     .sr-op-type { color: #378ADD }
.sr-op-remove  .sr-op-type { color: #D85A30 }
.sr-op-path  { color: #555; flex-shrink: 0 }
.sr-op-arrow { color: #bbb; flex-shrink: 0 }
.sr-op-value { color: #888 }

@keyframes sr-fadein {
  from { opacity: 0; transform: translateY(5px) }
  to   { opacity: 1; transform: none }
}
</style>
