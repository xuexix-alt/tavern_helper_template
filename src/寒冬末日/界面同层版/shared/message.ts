export const STREAM_DEMO_MARKER = '[stream-demo:minimal]';

export type StreamDemoPhase = 'stream' | 'done';

const CONTENT_BLOCK_RE = /<content(?:\s[^>]*)?>([\s\S]*?)<\/content>/i;
const CONTENT_OPEN_RE = /<content(?:\s[^>]*)?>/i;
const PHASE_BLOCK_RE = /<demo_phase>(stream|done)<\/demo_phase>/i;
const OPTION_BLOCK_RE = /<option(?:\s[^>]*)?>([\s\S]*?)(?:<\/option>|$)/gi;
const OPTION_LINE_MARKER_RE = /^(?:[-*•]+|\d+[.)、]|[（(]?\d+[)）、])\s*/;

export function isStreamDemoMessage(raw: string): boolean {
  return String(raw ?? '').includes(STREAM_DEMO_MARKER);
}

export function buildStreamDemoMessage(text: string, phase: StreamDemoPhase): string {
  const body = String(text ?? '').trim();
  return [
    STREAM_DEMO_MARKER,
    `<demo_phase>${phase}</demo_phase>`,
    '<content>',
    body || (phase === 'stream' ? '正在接收流式内容…' : '(空回复)'),
    '</content>',
  ].join('\n');
}

export function extractStreamDemoPhase(raw: string): StreamDemoPhase {
  const match = String(raw ?? '').match(PHASE_BLOCK_RE);
  return match?.[1] === 'stream' ? 'stream' : 'done';
}

export function extractStreamDemoContent(raw: string): string {
  const source = String(raw ?? '');
  const phaseMatch = source.match(PHASE_BLOCK_RE);
  const searchFrom = phaseMatch ? phaseMatch.index + phaseMatch[0].length : 0;
  const sliced = source.slice(Math.max(0, searchFrom));
  const contentOpenMatch = sliced.match(CONTENT_OPEN_RE);
  const wrapperCloseIndex = source.toLowerCase().lastIndexOf('</content>');

  if (contentOpenMatch && wrapperCloseIndex >= 0) {
    const wrapperOpenIndex = Math.max(0, searchFrom) + contentOpenMatch.index;
    const wrapperContentStart = wrapperOpenIndex + contentOpenMatch[0].length;
    if (wrapperContentStart <= wrapperCloseIndex) {
      return source.slice(wrapperContentStart, wrapperCloseIndex).trim();
    }
  }

  const contentMatch = source.match(CONTENT_BLOCK_RE);
  if (contentMatch?.[1]) return contentMatch[1].trim();
  return source.replace(STREAM_DEMO_MARKER, '').replace(PHASE_BLOCK_RE, '').trim();
}

export function extractStreamDemoOptions(raw: string): string[] {
  const source = String(raw ?? '');
  const options: string[] = [];
  for (const match of source.matchAll(OPTION_BLOCK_RE)) {
    const block = String(match[1] ?? '');
    const lines = block
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?li(?:\s[^>]*)?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .split('\n')
      .map(line => line.replace(OPTION_LINE_MARKER_RE, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    for (const line of lines) {
      if (!options.includes(line)) options.push(line);
    }
  }
  return options;
}

export function stripTagsForPreview(raw: string): string {
  return String(raw ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripStreamDemoRuntimeTags(raw: string): string {
  return String(raw ?? '')
    .replace(STREAM_DEMO_MARKER, '')
    .replace(PHASE_BLOCK_RE, '')
    .trim();
}
