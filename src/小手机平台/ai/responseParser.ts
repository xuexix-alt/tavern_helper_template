import { jsonrepair } from 'jsonrepair';

export interface ParsedMessage {
  sender: string;
  content: string;
}

export interface ParsedResponse {
  messages: ParsedMessage[];
}

export type RepairFunction = (candidate: string) => string;

export class ResponseParseError extends Error {
  readonly raw: string;

  constructor(message: string, raw: string) {
    super(message);
    this.name = 'ResponseParseError';
    this.raw = raw;
  }
}

function extractBalancedCandidates(text: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  const stack: string[] = [];
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{' || char === '[') {
      if (stack.length === 0) start = index;
      stack.push(char);
      continue;
    }
    if (char !== '}' && char !== ']') continue;
    if (stack.length === 0) continue;
    stack.pop();
    if (stack.length === 0 && start >= 0) {
      candidates.push(text.slice(start, index + 1));
      start = -1;
    }
  }
  return candidates;
}

function extractCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new ResponseParseError('响应为空，无 JSON 消息可解析', raw);

  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  if (fenced.length > 1) throw new ResponseParseError('响应包含多个 JSON 代码围栏候选', raw);
  const source = fenced.length === 1 ? fenced[0][1].trim() : trimmed;
  const candidates = extractBalancedCandidates(source);
  if (candidates.length > 1)
    throw new ResponseParseError(`响应必须包含且仅包含一个 JSON 候选，实际 ${candidates.length} 个`, raw);
  if (candidates.length === 1) return candidates[0];

  const starts = [source.indexOf('{'), source.indexOf('[')].filter(index => index >= 0);
  if (starts.length === 0) throw new ResponseParseError('响应中没有 JSON 候选的起始符', raw);
  return source.slice(Math.min(...starts)).trim();
}

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function hasDangerousKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key) || hasDangerousKey((value as Record<string, unknown>)[key])) return true;
  }
  return false;
}

function validate(value: unknown, members: readonly string[], raw: string): ParsedResponse {
  if (hasDangerousKey(value)) throw new ResponseParseError('响应 JSON 含原型危险字段', raw);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResponseParseError('响应 JSON 顶层必须是 {messages:[...]}', raw);
  }
  const root = value as Record<string, unknown>;
  if (Object.keys(root).length !== 1 || !Array.isArray(root.messages) || root.messages.length === 0) {
    throw new ResponseParseError('响应 JSON 必须只含非空 messages 数组', raw);
  }
  const allowed = new Set(members);
  const messages = root.messages.map((item, index): ParsedMessage => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ResponseParseError(`messages[${index}] 必须是消息对象`, raw);
    }
    const message = item as Record<string, unknown>;
    if (
      Object.keys(message).length !== 2 ||
      typeof message.sender !== 'string' ||
      message.sender.trim().length === 0 ||
      typeof message.content !== 'string' ||
      message.content.trim().length === 0
    ) {
      throw new ResponseParseError(`messages[${index}] 必须只含非空 sender/content 字符串`, raw);
    }
    if (!allowed.has(message.sender)) throw new ResponseParseError(`messages[${index}] sender 不属于当前成员`, raw);
    return { sender: message.sender, content: message.content };
  });
  return { messages };
}

export function parseResponse(
  raw: string,
  members: readonly string[],
  repair: RepairFunction = jsonrepair,
): ParsedResponse {
  const candidate = extractCandidate(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate) as unknown;
  } catch {
    try {
      parsed = JSON.parse(repair(candidate)) as unknown;
    } catch {
      throw new ResponseParseError('响应 JSON 解析失败，一次本地修复后仍无效', raw);
    }
  }
  return validate(parsed, members, raw);
}
