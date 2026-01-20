<template>
  <section class="section">
    <h2 class="section-title">📖 正文剧情 📖</h2>
    <div class="content-text">
      <template v-for="seg in segments" :key="seg.key">
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
          <pre>{{ seg.text }}</pre>
        </div>
        <pre v-else-if="seg.className === 'image-prompt'" class="image-prompt">{{ seg.text }}</pre>
        <span v-else :class="seg.className">{{ seg.text }}</span>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
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

const props = defineProps<{
  raw: string;
}>();

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
  padding: 12px 16px;
  margin: 12px 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
  line-height: 1.6;
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
  padding: 8px 12px;
  margin: 8px 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.85em;
  color: var(--accent-gold);
  overflow-x: auto;
}

.inline-bracket {
  color: var(--accent-blue, #bd93f9);
  font-weight: 600;
}
</style>
