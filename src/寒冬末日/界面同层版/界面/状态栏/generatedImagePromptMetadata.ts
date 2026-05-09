export function parsePromptBodyFromToken(promptToken: string): string {
  const token = String(promptToken ?? '').trim();
  if (!token) return '';
  const match = token.match(/^[^#]+###([\s\S]*?)###$/);
  return String(match?.[1] ?? token).trim();
}

export function normalizeImageLabel(input: string, fallback = '未命名图像'): string {
  const value = String(input ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value || fallback;
}

export function formatImageDisplayName(input: string, fallback = '未命名图像'): string {
  const value = normalizeImageLabel(input, '').replace(/\s*[\(（]\s*origin(?:al)?\s*[\)）]\s*$/i, '').trim();
  return value || fallback;
}

type PngTextChunk = {
  keyword: string;
  text: string;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PROMPT_TEXT_CHUNK_KEYWORDS = new Set(['description', 'comment', 'prompt', 'parameters']);

function decodeBase64ToBytes(base64: string): Uint8Array {
  const clean = String(base64 ?? '').replace(/\s+/g, '');
  if (!clean) return new Uint8Array();

  if (typeof atob === 'function') {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
    return bytes;
  }

  const bufferCtor = (globalThis as { Buffer?: { from(input: string, encoding: 'base64'): Uint8Array } }).Buffer;
  if (bufferCtor?.from) return new Uint8Array(bufferCtor.from(clean, 'base64'));

  return new Uint8Array();
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
  return Array.from(bytes, byte => String.fromCharCode(byte)).join('');
}

function readUInt32Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 0x1000000 + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)) >>> 0;
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let index = start; index < end; index += 1) out += String.fromCharCode(bytes[index] ?? 0);
  return out;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export function extractPngTextChunksFromDataUri(dataUri: string): PngTextChunk[] {
  const uri = String(dataUri ?? '').trim();
  const match = uri.match(/^data:image\/png(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (!match?.[1]) return [];

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64ToBytes(match[1]);
  } catch {
    return [];
  }

  if (!isPng(bytes)) return [];

  const chunks: PngTextChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUInt32Be(bytes, offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;
    if (length < 0 || dataEnd > bytes.length || nextOffset > bytes.length) break;

    const type = readAscii(bytes, typeStart, typeStart + 4);
    if (type === 'tEXt') {
      const data = bytes.slice(dataStart, dataEnd);
      const separatorIndex = data.indexOf(0);
      if (separatorIndex > 0) {
        const keyword = decodeUtf8(data.slice(0, separatorIndex)).trim();
        const text = decodeUtf8(data.slice(separatorIndex + 1)).trim();
        if (keyword && text) chunks.push({ keyword, text });
      }
    }

    offset = nextOffset;
    if (type === 'IEND') break;
  }

  return chunks;
}

function decodeJsonStringLiteral(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
  }
}

function extractPromptFromMetadataText(text: string): string {
  const value = String(text ?? '').trim();
  if (!value) return '';

  try {
    const parsed = JSON.parse(value) as { prompt?: unknown; v4_prompt?: { caption?: { base_caption?: unknown } } };
    if (typeof parsed?.prompt === 'string' && parsed.prompt.trim()) return parsed.prompt.trim();
    const baseCaption = parsed?.v4_prompt?.caption?.base_caption;
    if (typeof baseCaption === 'string' && baseCaption.trim()) return baseCaption.trim();
  } catch {
    const promptMatch = value.match(/"prompt"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (promptMatch?.[1]) return decodeJsonStringLiteral(promptMatch[1]).trim();
  }

  return value;
}

export function extractPromptFromPngDataUri(dataUri: string): string {
  const chunks = extractPngTextChunksFromDataUri(dataUri);
  for (const chunk of chunks) {
    if (!PROMPT_TEXT_CHUNK_KEYWORDS.has(chunk.keyword.toLowerCase())) continue;
    const prompt = extractPromptFromMetadataText(chunk.text);
    if (prompt) return prompt;
  }
  return '';
}

export function extractCharacterNameFromPngDataUri(dataUri: string): string {
  return extractCharacterNameFromPrompt(extractPromptFromPngDataUri(dataUri));
}

export function extractImageTitleFromPngDataUri(dataUri: string): string {
  return extractImageTitleFromPrompt(extractPromptFromPngDataUri(dataUri));
}

function extractNameFromJsonBlock(block: string): string {
  try {
    const parsed = JSON.parse(block) as { name?: unknown };
    if (typeof parsed?.name === 'string') return normalizeImageLabel(parsed.name, '');
  } catch {
    const match = block.match(/["']name["']\s*:\s*["']([^"']{1,64})["']/i);
    if (match?.[1]) return normalizeImageLabel(match[1], '');
  }
  return '';
}

function extractStructuredNameFromPrompt(prompt: string): string {
  for (const match of prompt.matchAll(/\$\s*(\{[\s\S]*?\})\s*\$/g)) {
    const name = extractNameFromJsonBlock(match[1] ?? '');
    if (name) return name;
  }

  const inlineJsonName = prompt.match(/["']name["']\s*:\s*["']([^"']{1,64})["']/i);
  if (inlineJsonName?.[1]) return normalizeImageLabel(inlineJsonName[1], '');

  return '';
}

export function extractCharacterNameFromPrompt(promptToken: string): string {
  const prompt = parsePromptBodyFromToken(promptToken);
  if (!prompt) return '';

  const loraMatch = prompt.match(/<lora:([^:>]+)(?::[\d.]+)?>/i);
  if (loraMatch?.[1]) return normalizeImageLabel(loraMatch[1]);

  const structuredName = extractStructuredNameFromPrompt(prompt);
  if (structuredName) return structuredName;

  const namedMatch = prompt.match(/(?:角色|人物|character|name)\s*[:：]\s*([^,，|\n<>]{1,32})/i);
  if (namedMatch?.[1]) return normalizeImageLabel(namedMatch[1]);

  const quoteMatch = prompt.match(/[“"'「『]([^“”"'」』]{1,24})[”"'」』]/);
  if (quoteMatch?.[1]) return normalizeImageLabel(quoteMatch[1]);

  const firstSegment = prompt
    .split(/[,，|\n]/)
    .map(segment => normalizeImageLabel(segment, ''))
    .find(
      segment =>
        segment.length >= 2 && segment.length <= 24 && !/\b(masterpiece|best quality|1girl|solo)\b/i.test(segment),
    );
  return firstSegment ?? '';
}

export function extractImageTitleFromPrompt(promptToken: string): string {
  const characterName = extractCharacterNameFromPrompt(promptToken);
  if (characterName) return characterName;

  const prompt = parsePromptBodyFromToken(promptToken);
  if (!prompt) return '';

  const cleaned = prompt.replace(/<lora:[^>]+>/gi, '').trim();
  const firstSegment = cleaned
    .split(/[,，|\n]/)
    .map(segment => normalizeImageLabel(segment, ''))
    .find(Boolean);
  if (!firstSegment) return '';
  return firstSegment.length > 32 ? `${firstSegment.slice(0, 32)}…` : firstSegment;
}
