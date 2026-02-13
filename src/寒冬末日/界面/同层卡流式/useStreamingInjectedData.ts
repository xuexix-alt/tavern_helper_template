import type { StreamingMessageContext } from '@util/streaming';

type ParsedInjectedData = {
  raw: string;
  mainText: string;
  options: string[];
};

const HIDDEN_BLOCK_TAGS = ['imgthink', 'drawprompt', 'imageprompt', 'genimage'];
const MAIN_BODY_TAGS = ['content', 'game'];
const EXCLUDE_BODY_TAGS = [
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
];
const IMAGE_PROMPT_TOKEN_RE = /(?:^|[\s>])[\w\u4e00-\u9fa5-]+###([\s\S]+?)###/i;

function hasTag(raw: string, tagName: string): boolean {
  return new RegExp('<' + tagName + '(?:\\s[^>]*)?>', 'i').test(raw);
}

function stripTagBlocks(raw: string, tags: string[]): string {
  let text = raw;
  for (const tag of tags) {
    text = text
      .replace(new RegExp('<' + tag + '(?:\\s[^>]*)?>[\\s\\S]*?<\\/' + tag + '>', 'gi'), '\n')
      .replace(new RegExp('<' + tag + '(?:\\s[^>]*)?\\s*/\\s*>', 'gi'), '\n');
  }
  return text;
}

function stripOptionBlock(raw: string): string {
  return raw.replace(/<option(?:\s[^>]*)?>[\s\S]*?<\/option>/gi, '');
}

function extractOptionLines(raw: string): string[] {
  const m = raw.match(/(<option(?:\s[^>]*)?>(?![\s\S]*?<option(?:\s[^>]*)?>)[\s\S]*?(?:<\/option>|$))/i);
  if (!m?.[1]) return [];

  return m[1]
    .replace(/^<option(?:\s[^>]*)?>/i, '')
    .replace(/<\/option>\s*$/i, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function extractByMainBodyTags(raw: string): string {
  const fullBlocks: string[] = [];

  for (const tag of MAIN_BODY_TAGS) {
    const fullRe = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'gi');
    for (const m of raw.matchAll(fullRe)) {
      const body = String(m[1] ?? '').trim();
      if (body) fullBlocks.push(body);
    }
  }

  if (fullBlocks.length > 0) return fullBlocks.join('\n');

  const openRe = /<(content|game)(?:\s[^>]*)?>([\s\S]*)$/i;
  const loose = raw.match(openRe);
  if (loose?.[2]) return String(loose[2] ?? '');

  return raw;
}

function normalizeRaw(raw: string): string {
  return stripTagBlocks(String(raw ?? ''), HIDDEN_BLOCK_TAGS).replace(/\r\n/g, '\n');
}

export function hasStructuredPayload(raw: string): boolean {
  const text = String(raw ?? '').trim();
  if (!text) return false;
  if (MAIN_BODY_TAGS.some(tag => hasTag(text, tag))) return true;
  if (hasTag(text, 'option')) return true;
  return IMAGE_PROMPT_TOKEN_RE.test(text);
}

export function parseStreamingInjectedData(raw: string): ParsedInjectedData {
  const normalized = normalizeRaw(raw);
  const options = extractOptionLines(normalized);
  const main = extractByMainBodyTags(normalized);
  const cleanedMain = stripTagBlocks(stripOptionBlock(main), EXCLUDE_BODY_TAGS)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    raw: normalized,
    mainText: cleanedMain,
    options,
  };
}

export function useStreamingInjectedData(context: Pick<StreamingMessageContext, 'message'>) {
  const parsed = computed(() => parseStreamingInjectedData(String(context.message ?? '')));

  const raw = computed(() => parsed.value.raw);
  const mainText = computed(() => parsed.value.mainText);
  const options = computed(() => parsed.value.options);

  return {
    raw,
    mainText,
    options,
  };
}

