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

export function stripVisibleChatu8PromptTokensHtml(html: string): string {
  const source = String(html ?? '');
  if (!source.trim() || !source.includes('###')) return source;

  if (typeof document === 'undefined' || !document?.implementation?.createHTMLDocument) {
    return source
      .split(/(<[^>]*>)/g)
      .map(part => (part.startsWith('<') ? part : stripPromptTokensFromText(part)))
      .join('')
      .trim();
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
    node.nodeValue = stripPromptTokensFromText(node.nodeValue ?? '');
  }

  return doc.body.innerHTML.trim();
}
