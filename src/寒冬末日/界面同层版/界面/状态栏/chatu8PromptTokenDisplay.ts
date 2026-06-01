import { collectChatu8PromptTokens } from './hostBridge.ts';

function stripPromptTokensFromText(input: string): string {
  let output = String(input ?? '');
  for (const token of collectChatu8PromptTokens(output)) {
    output = output.split(token).join('');
  }
  return output;
}

/**
 * 把"可见文本"里的 `image###...###` 提示词整段切掉。
 *
 * 供流式阶段的纯文本渲染（`<pre v-text>` 分支）复用，避免重跑 HTML 解析。
 * 和 `stripVisibleChatu8PromptTokensHtml` 同语义，只针对 plain string。
 */
export function stripVisibleChatu8PromptTokensText(input: string): string {
  const source = String(input ?? '');
  if (!source.includes('###')) return source;
  return stripPromptTokensFromText(source);
}

function escapeHtml(input: string): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createPromptTokenMarkerHtml(token: string): string {
  return `<span class="chatu8-native-prompt-token" data-chatu8-native-prompt-token="true">${escapeHtml(token)}</span>`;
}

function replacePromptTokensInTextNodeValue(input: string): string {
  let output = String(input ?? '');
  for (const token of collectChatu8PromptTokens(output)) {
    output = output.split(token).join(createPromptTokenMarkerHtml(token));
  }
  return output;
}

export function preserveChatu8PromptTokenPlacementMarkersHtml(html: string): string {
  const source = String(html ?? '');
  if (!source.trim() || !source.includes('###')) return source;

  if (typeof document === 'undefined' || !document?.implementation?.createHTMLDocument) {
    const protectedSegments: string[] = [];
    const protectedSource = source.replace(
      /<([a-z][\w:-]*)\b(?=[^>]*\bdata-chatu8-native-prompt-token=(?:"true"|'true'))[^>]*>[\s\S]*?<\/\1>/gi,
      match => {
        const marker = `__CHATU8_NATIVE_PROMPT_TOKEN_${protectedSegments.length}__`;
        protectedSegments.push(match);
        return marker;
      },
    );
    let marked = protectedSource
      .split(/(<[^>]*>)/g)
      .map(part => (part.startsWith('<') ? part : replacePromptTokensInTextNodeValue(part)))
      .join('');
    protectedSegments.forEach((segment, index) => {
      marked = marked.replaceAll(`__CHATU8_NATIVE_PROMPT_TOKEN_${index}__`, segment);
    });
    return marked;
  }

  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = source;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of textNodes) {
    const nodeValue = String(node.nodeValue ?? '');
    if (!nodeValue.includes('###')) continue;
    if ((node.parentElement as Element | null)?.closest?.('[data-chatu8-native-prompt-token="true"]')) continue;
    const markedHtml = replacePromptTokensInTextNodeValue(nodeValue);
    if (markedHtml === nodeValue) continue;
    const template = doc.createElement('template');
    template.innerHTML = markedHtml;
    node.replaceWith(template.content.cloneNode(true));
  }

  return doc.body.innerHTML.trim();
}

export function stripVisibleChatu8PromptTokensHtml(html: string): string {
  const source = String(html ?? '');
  if (!source.trim() || !source.includes('###')) return source;

  if (typeof document === 'undefined' || !document?.implementation?.createHTMLDocument) {
    const protectedSegments: string[] = [];
    const protectedSource = source.replace(
      /<([a-z][\w:-]*)\b(?=[^>]*\bdata-chatu8-native-prompt-token=(?:"true"|'true'))[^>]*>[\s\S]*?<\/\1>/gi,
      match => {
        const marker = `__CHATU8_NATIVE_PROMPT_TOKEN_${protectedSegments.length}__`;
        protectedSegments.push(match);
        return marker;
      },
    );
    let cleaned = protectedSource
      .split(/(<[^>]*>)/g)
      .map(part => (part.startsWith('<') ? part : stripPromptTokensFromText(part)))
      .join('')
      .trim();
    protectedSegments.forEach((segment, index) => {
      cleaned = cleaned.replaceAll(`__CHATU8_NATIVE_PROMPT_TOKEN_${index}__`, segment);
    });
    return cleaned;
  }

  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = source;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of textNodes) {
    if (!String(node.nodeValue ?? '').includes('###')) continue;
    if ((node.parentElement as Element | null)?.closest?.('[data-chatu8-native-prompt-token="true"]')) continue;
    node.nodeValue = stripPromptTokensFromText(node.nodeValue ?? '');
  }

  return doc.body.innerHTML.trim();
}
