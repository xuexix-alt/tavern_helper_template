<template>
  <section class="section">
    <h2 class="section-title story-header-title">📖 正文剧情 📖</h2>

    <div class="story-toolbar">
      <div class="story-mini-tabs" role="tablist" aria-label="正文视图切换">
        <button
          v-for="tab in storyTabs"
          :key="tab.key"
          type="button"
          class="story-mini-tab"
          :class="{ active: activeStoryTab === tab.key }"
          @click="activeStoryTab = tab.key"
        >
          <span>{{ tab.label }}</span>
          <span class="story-mini-tab-count">{{ tab.count }}</span>
        </button>
      </div>
      <div class="story-zoom-controls">
        <button type="button" class="zoom-btn" @click="zoomOut">−</button>
        <span class="zoom-value">{{ zoomPercent }}%</span>
        <button type="button" class="zoom-btn" @click="zoomIn">+</button>
      </div>
    </div>

    <div v-if="activeStoryTab === 'story'" class="story-pane content-text" :style="storyContentStyle">
      <button type="button" class="story-filter-toggle" @click="isFilterExpanded = !isFilterExpanded">
        {{ isFilterExpanded ? '收起标签筛选' : '展开标签筛选' }}
      </button>
      <div v-if="isFilterExpanded" class="story-filter-panel">
        <button
          v-for="item in segmentFilterItems"
          :key="item.key"
          type="button"
          class="story-filter-chip"
          :class="{ active: enabledSegmentKinds.includes(item.key) }"
          @click="toggleSegmentKind(item.key)"
        >
          <span>{{ item.label }}</span>
          <span class="chip-count">{{ item.count }}</span>
        </button>
        <div class="story-filter-actions">
          <button type="button" class="story-filter-action-btn" @click="enableAllSegmentKinds">全选</button>
          <button type="button" class="story-filter-action-btn" @click="enableCoreSegmentKinds">正文优先</button>
        </div>
      </div>

      <template v-for="seg in filteredSegments" :key="seg.key">
        <img
          v-if="seg.isImage"
          :src="seg.imageUrl"
          :alt="seg.altText"
          class="story-image"
          @load="scheduleResize"
          @error="scheduleResize"
        />
        <table v-else-if="seg.isTable" class="markdown-table">
          <thead>
            <tr>
              <th v-for="(header, idx) in seg.tableHeaders" :key="idx">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIdx) in seg.tableRows" :key="rowIdx">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <td v-for="(cell, cellIdx) in row" :key="cellIdx" v-html="formatTableCell(cell)"></td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="seg.isSystem" class="system-message">
          <pre><TextHighlight :text="seg.text" :query="query" /></pre>
        </div>
        <pre v-else-if="seg.className === 'image-prompt'" class="image-prompt">
          <TextHighlight :text="seg.text" :query="query" />
        </pre>
        <span v-else :class="seg.className"><TextHighlight :text="seg.text" :query="query" /></span>
      </template>
    </div>

    <div v-else class="story-pane story-modules">
      <div v-if="metaBlocks.length === 0" class="story-modules-empty">当前楼层没有额外模块（如 profile / meow_FM）。</div>
      <details v-for="block in metaBlocks" :key="block.key" class="meta-block" :open="isMetaBlockOpen(block.tag)">
        <summary class="meta-block-title">
          <span>{{ block.title }}</span>
          <span class="meta-block-tag">{{ block.tag }}</span>
        </summary>
        <pre class="meta-block-body"><TextHighlight :text="block.content" :query="query" /></pre>
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import TextHighlight from './TextHighlight.vue';

type Segment = {
  key: string;
  text?: string;
  className?: string;
  isImage?: boolean;
  imageUrl?: string;
  altText?: string;
  isTable?: boolean;
  tableHeaders?: string[];
  tableRows?: string[][];
  isSystem?: boolean;
};
type SegmentKind = 'narrative' | 'dialog' | 'system' | 'table' | 'image' | 'image_prompt';
type StoryTab = 'story' | 'modules';
type MetaBlock = {
  key: string;
  tag: string;
  title: string;
  content: string;
};

const props = withDefaults(
  defineProps<{
    raw: string;
    query?: string;
  }>(),
  {
    query: '',
  },
);
const query = computed(() => props.query ?? '');
const storyTabs = computed<ReadonlyArray<{ key: StoryTab; label: string; count: number }>>(() => [
  { key: 'story', label: '正文', count: filteredSegments.value.length },
  { key: 'modules', label: '模块', count: metaBlocks.value.length },
]);

const activeStoryTab = useLocalStorage<StoryTab>('eden:story_active_tab', 'story');
const isFilterExpanded = useLocalStorage<boolean>('eden:story_filter_expanded', false);
const storyZoom = useLocalStorage<number>('eden:story_zoom', 1);
const enabledSegmentKinds = useLocalStorage<SegmentKind[]>('eden:story_segment_kinds', [
  'narrative',
  'dialog',
  'system',
  'table',
  'image',
  'image_prompt',
]);
const zoomPercent = computed(() => Math.round(storyZoom.value * 100));
const storyContentStyle = computed<Record<string, string>>(() => ({
  '--story-font-size': `${storyZoom.value.toFixed(2)}em`,
}));

function zoomIn() {
  storyZoom.value = _.clamp(Number((storyZoom.value + 0.08).toFixed(2)), 0.84, 1.32);
}

function zoomOut() {
  storyZoom.value = _.clamp(Number((storyZoom.value - 0.08).toFixed(2)), 0.84, 1.32);
}

type ResolvedDisplayedImage = {
  src: string;
  alt: string;
};

// 生图插件升级后，图片可能不再写回到消息“原始文本”里，而是只在酒馆的“显示层 DOM”里插入 <img>。
// 因此这里尝试从 retrieveDisplayedMessage(message_id) 中，把 image###...### 对应的图片 src 解析出来。
const resolvedImagesByPrompt = ref<Record<string, ResolvedDisplayedImage[]>>({});

function normalizeForMatch(s: string): string {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findNextImageElement(start: Element): HTMLImageElement | null {
  // 先从当前元素的后续兄弟节点开始找 img；若没找到，则向上逐层父节点扩展范围。
  let cur: Element | null = start;
  while (cur) {
    let sib = cur.nextElementSibling;
    while (sib) {
      if (sib.tagName === 'IMG') return sib as HTMLImageElement;
      const inner = sib.querySelector?.('img');
      if (inner) return inner as HTMLImageElement;
      sib = sib.nextElementSibling;
    }
    cur = cur.parentElement;
  }
  return null;
}

function resolveImagesFromDisplayedMessage(messageId: number | null, prompts: string[]) {
  if (!messageId || !Number.isFinite(messageId)) return {};
  if (typeof retrieveDisplayedMessage !== 'function') return {};

  const $mes = retrieveDisplayedMessage(messageId);
  const root = $mes?.get?.(0) as HTMLElement | undefined;
  if (!root) return {};

  const promptEls = Array.from(root.querySelectorAll('pre, code, p, div, span')).filter(el =>
    normalizeForMatch(el.textContent ?? '').includes('image###'),
  );

  const out: Record<string, ResolvedDisplayedImage[]> = {};

  for (const rawPrompt of prompts) {
    const needle = normalizeForMatch(rawPrompt);
    if (!needle) continue;

    const el = promptEls.find(node => normalizeForMatch(node.textContent ?? '').includes(needle));
    const img = el ? findNextImageElement(el) : null;
    const src = img?.getAttribute('src') ?? '';
    if (!src) continue;

    const alt = img?.getAttribute('alt') ?? img?.getAttribute('title') ?? '';
    out[rawPrompt] = [{ src, alt }];
  }

  // fallback：若按“提示词邻近”没匹配到，但确实存在图片，则按顺序兜底 indicated.
  const missing = prompts.filter(p => !out[p]);
  if (missing.length > 0) {
    const imgs = Array.from(root.querySelectorAll('img'))
      .map(img => ({
        src: img.getAttribute('src') ?? '',
        alt: img.getAttribute('alt') ?? img.getAttribute('title') ?? '',
      }))
      .filter(it => !!it.src);

    // 仅在数量可对齐时才做顺序匹配，避免把头像/emoji 等误当生图结果。
    if (imgs.length > 0 && imgs.length === prompts.length) {
      for (let i = 0; i < prompts.length; i++) {
        out[prompts[i]] = [imgs[i]];
      }
    }
  }

  return out;
}

const segments = computed<Segment[]>(() => {
  const normalizedRaw = normalizeInjectedRaw(props.raw ?? '');
  const mainText = extractMainStoryText(normalizedRaw);
  const text = normalizeStoryText(mainText);

  if (!text.trim()) return [{ key: 'empty', text: '(暂无正文)' }];
  const segs = buildSegments(text);

  const mapped = resolvedImagesByPrompt.value ?? {};
  const out: Segment[] = [];
  let id = 0;
  for (const seg of segs) {
    if (seg.className === 'image-prompt' && seg.text) {
      const hits = mapped[seg.text] ?? [];
      if (hits.length > 0) {
        for (const hit of hits) {
          out.push({
            key: `img_resolved_${id++}`,
            isImage: true,
            imageUrl: hit.src,
            altText: hit.alt || '生成图片',
            text: hit.src,
          });
        }
        // 已有图片时默认不再显示提示词，避免占位刷屏
        continue;
      }
    }
    out.push(seg);
  }

  return out.length ? out : [{ key: 'empty', text: '(暂无正文)' }];
});

const segmentFilterItems = computed<Array<{ key: SegmentKind; label: string; count: number }>>(() => {
  const items: Array<{ key: SegmentKind; label: string }> = [
    { key: 'narrative', label: '叙述' },
    { key: 'dialog', label: '对话' },
    { key: 'system', label: '系统' },
    { key: 'table', label: '表格' },
    { key: 'image', label: '图片' },
    { key: 'image_prompt', label: '提示词' },
  ];
  const counts = new Map<SegmentKind, number>(items.map(it => [it.key, 0] as const));
  for (const seg of segments.value) {
    const kind = detectSegmentKind(seg);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return items.map(it => ({ ...it, count: counts.get(it.key) ?? 0 }));
});

const filteredSegments = computed<Segment[]>(() => {
  const enabled = new Set(enabledSegmentKinds.value);
  const list = segments.value.filter(seg => enabled.has(detectSegmentKind(seg)));
  return list.length > 0 ? list : [{ key: 'empty_filtered', text: '(当前筛选条件下无正文内容)' }];
});

function detectSegmentKind(seg: Segment): SegmentKind {
  if (seg.isImage) return 'image';
  if (seg.isTable) return 'table';
  if (seg.isSystem) return 'system';
  if (seg.className === 'image-prompt') return 'image_prompt';
  if (seg.className === 'dialog-text') return 'dialog';
  return 'narrative';
}

function toggleSegmentKind(kind: SegmentKind) {
  const enabled = new Set(enabledSegmentKinds.value);
  if (enabled.has(kind)) {
    if (enabled.size <= 1) return;
    enabled.delete(kind);
  } else {
    enabled.add(kind);
  }
  enabledSegmentKinds.value = Array.from(enabled);
}

function enableAllSegmentKinds() {
  enabledSegmentKinds.value = ['narrative', 'dialog', 'system', 'table', 'image', 'image_prompt'];
}

function enableCoreSegmentKinds() {
  enabledSegmentKinds.value = ['narrative', 'dialog', 'system'];
}

const META_BLOCK_TAGS = [
  'meow_fm',
  'profile',
  'variablethink',
  'variableedit',
  'updatevariable',
  'jsonpatch',
  'analysis',
  'era_data',
  'variableinsert',
  'statusplaceholderimpl',
] as const;

const META_TITLE_MAP: Record<string, string> = {
  meow_fm: 'FM 摘要',
  profile: '角色档案',
  variablethink: '变量思考',
  variableedit: '变量编辑',
  updatevariable: '变量更新',
  jsonpatch: 'JSON Patch',
  analysis: '分析过程',
  era_data: 'ERA 数据',
  variableinsert: '变量插入',
  statusplaceholderimpl: '占位模块',
};

const metaBlocks = computed<MetaBlock[]>(() => {
  const raw = props.raw ?? '';
  const blocks: MetaBlock[] = [];
  let id = 0;
  for (const tag of META_BLOCK_TAGS) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    for (const m of raw.matchAll(re)) {
      const content = String(m[1] ?? '').trim();
      if (!content) continue;
      blocks.push({
        key: `${tag}_${id++}`,
        tag,
        title: META_TITLE_MAP[tag] ?? tag,
        content,
      });
    }
  }
  return blocks;
});

const defaultOpenMetaTags = new Set<string>(['meow_fm', 'profile']);
function isMetaBlockOpen(tag: string): boolean {
  return defaultOpenMetaTags.has(tag);
}

watchEffect(onCleanup => {
  // 在消息 iframe 中可用；非消息上下文则无法解析显示层 DOM
  const messageId = typeof getCurrentMessageId === 'function' ? Number(getCurrentMessageId() as any) : null;

  const normalizedRaw = normalizeInjectedRaw(props.raw ?? '');
  const mainText = extractMainStoryText(normalizedRaw);
  const text = normalizeStoryText(mainText);
  const prompts = Array.from(text.matchAll(/image###([\s\S]*?)###/g))
    .map(m => m[0] ?? '')
    .filter(Boolean);

  let canceled = false;
  const timers: number[] = [];

  const run = () => {
    if (canceled) return;
    const next = resolveImagesFromDisplayedMessage(messageId, prompts);
    // 只有在结果有变化时才写入，避免无意义触发重渲染
    const prev = resolvedImagesByPrompt.value ?? {};
    const prevJson = JSON.stringify(prev);
    const nextJson = JSON.stringify(next);
    if (prevJson !== nextJson) resolvedImagesByPrompt.value = next;
  };

  // 立即尝试一次，并在短时间内再重试（生图 DOM 插入通常是异步的）
  run();
  timers.push(window.setTimeout(run, 600));
  timers.push(window.setTimeout(run, 2000));

  onCleanup(() => {
    canceled = true;
    for (const t of timers) window.clearTimeout(t);
  });
});

let __resizeScheduled = false;
function scheduleResize() {
  if (__resizeScheduled) return;
  __resizeScheduled = true;
  requestAnimationFrame(() => {
    __resizeScheduled = false;
    window.dispatchEvent(new Event('resize'));
  });
}

function applyTavernDisplayRegex(text: string): string {
  if (!text) return '';
  try {
    if (typeof formatAsTavernRegexedString === 'function') {
      const out = formatAsTavernRegexedString(text, 'ai_output', 'display', { depth: 0 });
      return typeof out === 'string' ? out : text;
    }
  } catch {
    // ignore: 在非酒馆/未注入对应 API 的环境里可能不可用
  }
  return text;
}

function normalizeXmlishForDisplay(input: string): string {
  // 目标：
  // 1) 识别并优雅处理常见块标签（例如 <details>/<summary>）
  // 2) 其余“XML 风格标签”默认只作为包裹层：去掉标签但保留文本内容，避免 UI 里出现成片的 <tag>
  if (!input || !input.includes('<')) return input;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, 'text/html');
    const root = doc.body as HTMLElement | null;
    if (!root) return input;

    const STRIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'META', 'LINK', 'NOSCRIPT']);
    const INLINE_TAGS = new Set([
      'A',
      'ABBR',
      'B',
      'BDI',
      'BDO',
      'CITE',
      'CODE',
      'DATA',
      'DFN',
      'EM',
      'I',
      'KBD',
      'MARK',
      'Q',
      'S',
      'SAMP',
      'SMALL',
      'SPAN',
      'STRONG',
      'SUB',
      'SUP',
      'TIME',
      'U',
      'VAR',
      // 自定义标签通常是“块”语义；不放进 INLINE_TAGS 里，避免粘连成一行
    ]);
    const BLOCK_TAGS = new Set([
      'ADDRESS',
      'ARTICLE',
      'ASIDE',
      'BLOCKQUOTE',
      'DIV',
      'DL',
      'DT',
      'DD',
      'FIGCAPTION',
      'FIGURE',
      'FOOTER',
      'FORM',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'HEADER',
      'HR',
      'LI',
      'MAIN',
      'NAV',
      'OL',
      'P',
      'PRE',
      'SECTION',
      'TABLE',
      'TBODY',
      'THEAD',
      'TFOOT',
      'TR',
      'TD',
      'TH',
      'UL',
    ]);

    const append = (parts: string[], s: string) => {
      if (!s) return;
      parts.push(s);
    };

    const renderChildren = (nodes: ChildNode[]): string => {
      const parts: string[] = [];
      for (const n of nodes) append(parts, renderNode(n));
      return parts.join('');
    };

    const renderNode = (node: ChildNode): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const el = node as HTMLElement;
      const tag = (el.tagName ?? '').toUpperCase();
      if (!tag || STRIP_TAGS.has(tag)) return '';

      if (tag === 'BR') return '\n';

      if (tag === 'IMG') {
        // 兼容“模型直接输出 <img>”的情况：转成 markdown 图片，复用现有 mdImage 解析逻辑
        const src = (el.getAttribute('src') ?? '').trim();
        if (!src) return '';
        const alt = (el.getAttribute('alt') ?? el.getAttribute('title') ?? '').replace(/[\]\r\n]+/g, ' ').trim();
        const safeSrc = src.replace(/\)/g, '%29');
        return `\n![${alt}](${safeSrc})\n`;
      }

      if (tag === 'DETAILS') {
        const children = Array.from(el.childNodes) as ChildNode[];
        const summaryEl = Array.from(el.children).find(c => (c as HTMLElement).tagName?.toUpperCase() === 'SUMMARY') as
          | HTMLElement
          | undefined;

        const summary = summaryEl?.textContent?.trim() ?? '';
        const bodyNodes = children.filter(n => n !== summaryEl);
        const body = renderChildren(bodyNodes).trim();
        const header = summary ? `【${summary}】\n` : '';
        return `\n\n${header}${body}\n\n`;
      }

      if (tag === 'SUMMARY') {
        // <summary> 仅在 <details> 内使用；已由 <details> 分支处理
        return '';
      }

      if (tag === 'A') {
        const href = (el.getAttribute('href') ?? '').trim();
        const text = renderChildren(Array.from(el.childNodes) as ChildNode[]).trim();
        if (!href) return text;
        if (!text) return href;
        return `${text} (${href})`;
      }

      const childrenText = renderChildren(Array.from(el.childNodes) as ChildNode[]);
      const isInline =
        INLINE_TAGS.has(tag) ||
        (!BLOCK_TAGS.has(tag) && !childrenText.includes('\n') && childrenText.trim().length <= 120);

      // 默认：去标签保留内容；仅对“块语义”标签补一点换行，避免不同块粘连到一行
      if (isInline) return childrenText;
      return `\n${childrenText}\n`;
    };

    const rendered = renderChildren(Array.from(root.childNodes) as ChildNode[]);
    return (
      rendered
        // 防止块级标签产生大量空行
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  } catch {
    return input;
  }
}

function normalizeStoryText(raw: string): string {
  // 1) 隐藏绘图思维链
  // 2) 隐藏 <image> 包裹标签，但保留其中的 image###...### 供生图插件提取
  // 3) 优先应用“酒馆正则”，让用户能用酒馆自带正则更灵活地对齐/处理各种自定义 XML 块
  // 4) 将剩余的 XML/HTML 风格标签做“去标签保内容”的显示归一化（例如 <details>）
  // 5) 归一化空白行，减少图片/提示词前后的“被动拉高”
  const stripped = (raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/<imgthink>[\s\S]*?<\/imgthink>/gi, '')
    .replace(/<\/?image(?:\s[^>]*)?>/gi, '');

  const regexed = applyTavernDisplayRegex(stripped);
  const xmlNormalized = normalizeXmlishForDisplay(regexed);
  return xmlNormalized.replace(/\n{3,}/g, '\n\n');
}

type TagBlock = {
  start: number;
  end: number;
  openEnd: number;
  closeStart: number;
  tagName: 'content' | 'game';
  inner: string;
};

function findTagBlocks(raw: string): TagBlock[] {
  const re = /<(content|game)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  const blocks: TagBlock[] = [];
  for (const m of raw.matchAll(re)) {
    const tagName = (m[1]?.toLowerCase() as 'content' | 'game') ?? 'content';
    const full = m[0] ?? '';
    const inner = m[2] ?? '';
    const start = m.index ?? 0;
    const end = start + full.length;
    const openEnd = start + (full.indexOf('>') + 1);
    const closeStart = end - `</${tagName}>`.length;
    blocks.push({ start, end, openEnd, closeStart, tagName, inner });
  }
  return blocks;
}

function isInAnyRange(pos: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some(r => pos >= r.start && pos < r.end);
}

function removeSpans(raw: string, spans: Array<{ start: number; end: number }>): string {
  if (spans.length === 0) return raw;
  const sorted = spans
    .slice()
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = 0;
  for (const s of sorted) {
    if (s.start < cursor) continue;
    out += raw.slice(cursor, s.start);
    cursor = s.end;
  }
  out += raw.slice(cursor);
  return out;
}

function extractOptionBlock(raw: string): string {
  const m = raw.match(/<option(?:\s[^>]*)?>[\s\S]*?<\/option>/i);
  return m?.[0] ?? '';
}

function stripOptionBlock(raw: string): string {
  return raw.replace(/<option(?:\s[^>]*)?>[\s\S]*?<\/option>/gi, '');
}

function normalizeInjectedRaw(raw: string): string {
  const input = raw ?? '';
  if (!input.trim()) return '';

  const blocks = findTagBlocks(input);
  const ranges = blocks.map(b => ({ start: b.start, end: b.end }));

  // 收集已在 <content>/<game> 内的 image###...###，用于去重
  const promptsInBlocks = new Set<string>();
  for (const b of blocks) {
    for (const m of b.inner.matchAll(/image###([\s\S]*?)###/g)) promptsInBlocks.add(m[0]);
  }

  // 收集“块外”的 image###...###，并去重
  const outsideSpans: Array<{ start: number; end: number; raw: string }> = [];
  const outsidePrompts: string[] = [];
  for (const m of input.matchAll(/image###([\s\S]*?)###/g)) {
    const start = m.index ?? -1;
    if (start < 0) continue;
    const end = start + (m[0]?.length ?? 0);
    const inBlock = isInAnyRange(start, ranges);
    if (inBlock) continue;

    const rawPrompt = m[0] ?? '';
    if (!rawPrompt) continue;
    if (promptsInBlocks.has(rawPrompt)) continue;
    if (outsidePrompts.includes(rawPrompt)) continue;

    outsidePrompts.push(rawPrompt);
    outsideSpans.push({ start, end, raw: rawPrompt });
  }

  if (outsidePrompts.length === 0) return input;

  const removedOutside = removeSpans(input, outsideSpans);
  const optionBlock = extractOptionBlock(removedOutside);

  // 重新查找块（因为 removeSpans 会改变索引）
  const blocksAfter = findTagBlocks(removedOutside);
  const lastBlock = blocksAfter.length ? blocksAfter[blocksAfter.length - 1] : null;

  if (lastBlock) {
    const beforeClose = removedOutside.slice(0, lastBlock.closeStart);
    const afterClose = removedOutside.slice(lastBlock.closeStart);
    const injected = `\n\n${outsidePrompts.join('\n')}\n`;
    return `${beforeClose}${injected}${afterClose}`;
  }

  // 无 <content>/<game>：创建合成 <content>，并把 option 块保留在 raw 里供选项解析
  const bodyWithoutOption = stripOptionBlock(removedOutside).trim();
  const synthesized =
    `<content>\n` +
    `${bodyWithoutOption}\n\n` +
    `${outsidePrompts.join('\n')}\n` +
    `</content>\n` +
    `${optionBlock ? `\n${optionBlock}\n` : ''}`;
  return synthesized;
}

function extractMainStoryText(raw: string): string {
  const blocks = findTagBlocks(raw);
  if (blocks.length) return blocks.map(b => b.inner ?? '').join('\n');
  return stripOptionBlock(raw);
}

type TableBlock = {
  start: number;
  end: number;
  headers: string[];
  rows: string[][];
};

function buildSegments(text: string): Segment[] {
  // 系统消息块：>>> content <<<（可带 **）
  const systemBlockRe = /\*{0,2}>>>([\s\S]*?)<<<\*{0,2}/g;
  // 图片提示词块：image###prompt###（保留供插件提取）
  const imagePromptRe = /image###([\s\S]*?)###/g;
  // markdown 图片：![](url)
  const mdImageRe = /!\[(.*?)\]\((.*?)\)/g;
  // 单行系统提示：伊甸：... / 系统：... / System: ...
  const systemLineRe = /^(?:伊甸|系统|System)[：:].*$/gm;

  const out: Segment[] = [];
  let cursor = 0;
  let segId = 0;

  const pushInline = (chunk: string) => {
    const normalized = normalizeInlineChunk(chunk);
    if (!normalized) return;
    for (const seg of splitInline(normalized, () => `t${segId++}`)) out.push(seg);
  };

  while (cursor < text.length) {
    const nextTable = findNextTable(text, cursor);
    const nextSystemBlock = execFrom(systemBlockRe, text, cursor);
    const nextImagePrompt = execFrom(imagePromptRe, text, cursor);
    const nextMdImage = execFrom(mdImageRe, text, cursor);
    const nextSystemLine = execFrom(systemLineRe, text, cursor);

    const candidates: Array<
      | { kind: 'table'; start: number; end: number; table: TableBlock }
      | { kind: 'systemBlock'; start: number; end: number; content: string }
      | { kind: 'imagePrompt'; start: number; end: number; raw: string }
      | { kind: 'mdImage'; start: number; end: number; alt: string; url: string }
      | { kind: 'systemLine'; start: number; end: number; content: string }
    > = [];

    if (nextTable) candidates.push({ kind: 'table', start: nextTable.start, end: nextTable.end, table: nextTable });
    if (nextSystemBlock)
      candidates.push({
        kind: 'systemBlock',
        start: nextSystemBlock.index ?? 0,
        end: (nextSystemBlock.index ?? 0) + nextSystemBlock[0].length,
        content: nextSystemBlock[1] ?? '',
      });
    if (nextImagePrompt)
      candidates.push({
        kind: 'imagePrompt',
        start: nextImagePrompt.index ?? 0,
        end: (nextImagePrompt.index ?? 0) + nextImagePrompt[0].length,
        raw: nextImagePrompt[0],
      });
    if (nextMdImage)
      candidates.push({
        kind: 'mdImage',
        start: nextMdImage.index ?? 0,
        end: (nextMdImage.index ?? 0) + nextMdImage[0].length,
        alt: nextMdImage[1] ?? '',
        url: nextMdImage[2] ?? '',
      });
    if (nextSystemLine)
      candidates.push({
        kind: 'systemLine',
        start: nextSystemLine.index ?? 0,
        end: (nextSystemLine.index ?? 0) + nextSystemLine[0].length,
        content: nextSystemLine[0] ?? '',
      });

    if (candidates.length === 0) {
      pushInline(text.slice(cursor));
      break;
    }

    // 选择最靠前的块；同位置时按优先级：table > systemBlock > imagePrompt > mdImage > systemLine
    const priority: Record<string, number> = { table: 1, systemBlock: 2, imagePrompt: 3, mdImage: 4, systemLine: 5 };
    candidates.sort((a, b) => (a.start !== b.start ? a.start - b.start : priority[a.kind] - priority[b.kind]));
    const pick = candidates[0];

    if (pick.start > cursor) {
      pushInline(text.slice(cursor, pick.start));
    }

    if (pick.kind === 'table') {
      out.push({
        key: `table${segId++}`,
        isTable: true,
        tableHeaders: pick.table.headers,
        tableRows: pick.table.rows,
      });
    } else if (pick.kind === 'systemBlock') {
      out.push({
        key: `system${segId++}`,
        isSystem: true,
        className: 'system-message',
        text: pick.content.trim(),
      });
    } else if (pick.kind === 'imagePrompt') {
      out.push({
        key: `imgprompt${segId++}`,
        className: 'image-prompt',
        text: pick.raw,
      });
    } else if (pick.kind === 'mdImage') {
      out.push({
        key: `img${segId++}`,
        isImage: true,
        imageUrl: pick.url,
        altText: pick.alt,
        text: pick.url,
      });
    } else if (pick.kind === 'systemLine') {
      out.push({
        key: `system${segId++}`,
        isSystem: true,
        className: 'system-message',
        text: pick.content.trim(),
      });
    }

    cursor = Math.max(cursor, pick.end);
  }

  return out.length ? out : [{ key: 'empty', text: '(暂无正文)' }];
}

function normalizeInlineChunk(chunk: string): string {
  // 收敛块与块之间的空白（尤其是生图结果插入后常出现的多余空行）
  const normalized = chunk.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (!normalized.trim()) return '';
  return normalized;
}

function execFrom(re: RegExp, text: string, from: number): RegExpExecArray | null {
  re.lastIndex = from;
  return re.exec(text);
}

function splitInline(chunk: string, nextKey: () => string): Segment[] {
  if (!chunk) return [];

  // 需求：仅保留【】高亮；所有中英文引号/单引号都作为对话高亮
  const inlineRe = /【[^】\n]+】|“[^”\n]+”|‘[^’\n]+’|「[^」\n]+」|"[^"\n]+"|'[^'\n]+'/g;
  const parts: Segment[] = [];
  let cursor = 0;

  for (const m of chunk.matchAll(inlineRe)) {
    const start = m.index ?? 0;
    const raw = m[0] ?? '';
    if (start > cursor) {
      parts.push({ key: nextKey(), text: chunk.slice(cursor, start) });
    }

    const isBracket = raw.startsWith('【');
    parts.push({ key: nextKey(), text: raw, className: isBracket ? 'inline-bracket' : 'dialog-text' });
    cursor = start + raw.length;
  }

  if (cursor < chunk.length) {
    parts.push({ key: nextKey(), text: chunk.slice(cursor) });
  }

  return parts;
}

function findNextTable(text: string, from: number): TableBlock | null {
  // 从 from 之后的下一行开始找，避免从行中间误判
  let i = text.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  if (i < from) {
    const nl = text.indexOf('\n', from);
    if (nl === -1) return null;
    i = nl + 1;
  }

  while (i < text.length) {
    const lineEnd = text.indexOf('\n', i);
    const end = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(i, end);
    const trimmed = line.trim();

    if (trimmed.startsWith('|')) {
      const headerLine = trimmed;

      // 下一行必须是分隔行
      const nextLineStart = end + 1;
      if (nextLineStart >= text.length) return null;
      const nextLineEnd = text.indexOf('\n', nextLineStart);
      const nextEnd = nextLineEnd === -1 ? text.length : nextLineEnd;
      const delimiterLine = text.slice(nextLineStart, nextEnd).trim();

      if (isMarkdownTableDelimiter(delimiterLine)) {
        const headers = splitMarkdownTableRow(headerLine);
        const rows: string[][] = [];

        let rowStart = nextEnd + 1;
        let tableEnd = nextEnd;
        while (rowStart < text.length) {
          const rowLineEnd = text.indexOf('\n', rowStart);
          const rowEnd = rowLineEnd === -1 ? text.length : rowLineEnd;
          const rowLine = text.slice(rowStart, rowEnd);
          const rowTrimmed = rowLine.trim();

          if (!rowTrimmed.startsWith('|')) break;

          const cells = splitMarkdownTableRow(rowTrimmed);
          rows.push(normalizeRowCells(cells, headers.length));
          tableEnd = rowEnd;
          rowStart = rowEnd + 1;
        }

        if (headers.length >= 2) {
          return {
            start: i,
            end: tableEnd,
            headers,
            rows: rows.length ? rows : [normalizeRowCells([], headers.length)],
          };
        }
      }
    }

    i = end + 1;
  }

  return null;
}

function isMarkdownTableDelimiter(line: string): boolean {
  // | --- | :---: | ---: | 等
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitMarkdownTableRow(row: string): string[] {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);

  const cells: string[] = [];
  let buf = '';
  let escaped = false;

  for (let idx = 0; idx < s.length; idx++) {
    const ch = s[idx];
    if (escaped) {
      buf += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '|') {
      cells.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }

  cells.push(buf.trim());
  return cells;
}

function normalizeRowCells(cells: string[], width: number): string[] {
  const out = cells.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

// 格式化表格单元格（支持粗体、斜体等）- 安全处理防止 XSS
function formatTableCell(cell: string): string {
  // 先转义 HTML 特殊字符
  const safe = cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 再处理支持的格式
  return (
    safe
      // 修复被转义的 inline-bracket span（表格内常见）
      .replace(/&lt;span class="inline-bracket"&gt;([\s\S]*?)&lt;\/span&gt;/g, '<span class="inline-bracket">$1</span>')
      // 修复被转义为 “inline-bracket> [xxx]” 的残留文本
      .replace(/inline-bracket[`'"]?\s*&gt;\s*\[([^\]]+)\]/g, '<span class="inline-bracket">【$1】</span>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/【([^】\n]+)】/g, '<span class="inline-bracket">【$1】</span>')
      .replace(/“([^”\n]+)”/g, '<span class="dialog-text">“$1”</span>')
      .replace(/‘([^’\n]+)’/g, '<span class="dialog-text">‘$1’</span>')
      .replace(/「([^」\n]+)」/g, '<span class="dialog-text">「$1」</span>')
      .replace(/"([^"\n]+)"/g, '<span class="dialog-text">"$1"</span>')
      .replace(/'([^'\n]+)'/g, '<span class="dialog-text">\'$1\'</span>')
  );
}
</script>

<style scoped>
.markdown-table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 0.9em;
  background-color: var(--bg-medium);
  border-radius: 8px;
  overflow: hidden;
}

.markdown-table th,
.markdown-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.markdown-table th {
  background-color: var(--bg-dark);
  color: var(--accent-gold);
  font-weight: bold;
  font-size: 0.85em;
}

.markdown-table td {
  color: var(--text-color);
  line-height: 1.5;
}

.markdown-table td :deep(strong) {
  color: var(--text-strong);
}

.markdown-table td :deep(em) {
  color: var(--accent-blue);
}

.markdown-table td :deep(.inline-bracket) {
  color: var(--accent-blue);
  font-weight: 600;
}

.markdown-table tr:last-child td {
  border-bottom: none;
}

.markdown-table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.03);
}

/* 系统消息样式（伊甸：消息、>>> 消息 <<<） */
.system-message {
  background-color: rgba(0, 180, 216, 0.1);
  border: 1px solid rgba(0, 180, 216, 0.4);
  border-radius: 8px;
  padding: 9px 12px;
  margin: 8px 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.85em;
  line-height: 1.5;
  color: var(--accent-cyan, #00b4d8);
  overflow-x: auto;
}

.system-message pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* 【系统】消息样式 - 黄色 */
.system-hint {
  color: var(--accent-gold, #f1fa8c);
  font-weight: 500;
}

/* 【角色名】样式 - 蓝色高亮 */
.character-name {
  color: var(--accent-blue, #bd93f9);
  font-weight: 600;
}

/* 图片提示词样式 - 代码块形式保留供插件提取 */
.image-prompt {
  display: block;
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 6px 9px;
  margin: 6px 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.8em;
  color: var(--accent-gold);
  overflow-x: auto;
}

.inline-bracket {
  color: var(--accent-blue, #bd93f9);
  font-weight: 600;
}

.story-header-title {
  margin-bottom: 6px;
  padding-bottom: 4px;
  font-size: 1.02em;
}

.story-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  position: sticky;
  top: 0;
  z-index: 4;
  padding: 4px 5px;
  border-radius: 9px;
  background: linear-gradient(180deg, rgba(26, 27, 38, 0.96), rgba(26, 27, 38, 0.8));
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(2px);
}

.story-mini-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.story-mini-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.75em;
  line-height: 1.2;
  cursor: pointer;
}

.story-mini-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 4px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.26);
  font-size: 0.78em;
  opacity: 0.9;
}

.story-mini-tab.active {
  border-color: rgba(139, 233, 253, 0.52);
  background: rgba(139, 233, 253, 0.22);
  color: var(--text-strong);
}

.story-mini-tab.active .story-mini-tab-count {
  border-color: rgba(139, 233, 253, 0.65);
  background: rgba(139, 233, 253, 0.24);
}

.story-zoom-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.zoom-btn {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  font-size: 0.95em;
  cursor: pointer;
}

.zoom-value {
  min-width: 34px;
  text-align: center;
  font-size: 0.72em;
  opacity: 0.85;
}

.story-pane {
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 7px 8px;
}

.content-text.story-pane {
  font-size: var(--story-font-size, 1em);
}

.story-filter-toggle {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color);
  border-radius: 8px;
  padding: 5px 7px;
  font-size: 0.76em;
  text-align: left;
  margin-bottom: 6px;
  cursor: pointer;
}

.story-filter-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
}

.story-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.72em;
  cursor: pointer;
}

.story-filter-chip.active {
  border-color: rgba(80, 250, 123, 0.45);
  background: rgba(80, 250, 123, 0.18);
}

.chip-count {
  opacity: 0.78;
}

.story-filter-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.story-filter-action-btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  border-radius: 7px;
  padding: 3px 7px;
  font-size: 0.7em;
  cursor: pointer;
}

.story-filter-action-btn:hover {
  border-color: rgba(139, 233, 253, 0.45);
  background: rgba(139, 233, 253, 0.14);
}

.story-modules {
  display: grid;
  gap: 8px;
}

.meta-block {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
}

.meta-block-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  cursor: pointer;
  font-size: 0.8em;
  font-weight: 600;
  color: var(--accent-gold);
  list-style: none;
}

.meta-block-title::-webkit-details-marker {
  display: none;
}

.meta-block-tag {
  font-size: 0.74em;
  opacity: 0.72;
  color: var(--accent-blue);
}

.meta-block-body {
  margin: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 10px;
  font-size: 0.78em;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.story-modules-empty {
  font-size: 0.84em;
  opacity: 0.72;
  padding: 8px 9px;
}

@media (max-width: 480px) {
  .story-pane {
    padding: 6px 7px;
  }

  .story-mini-tab {
    padding: 3px 7px;
    font-size: 0.72em;
  }

  .story-filter-chip {
    font-size: 0.7em;
    padding: 3px 7px;
  }

  .story-filter-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
