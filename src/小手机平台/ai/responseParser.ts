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

function extractCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new ResponseParseError('响应为空，无 JSON 消息可解析', raw);

  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  const sources =
    fenced.length > 0 ? fenced.map(match => match[1].trim()).filter(source => source.length > 0) : [trimmed];
  const candidates: string[] = [];
  for (const source of sources) {
    const balanced = extractBalancedCandidates(source);
    if (balanced.length > 0) {
      candidates.push(...balanced);
      continue;
    }
    const starts = [source.indexOf('{'), source.indexOf('[')].filter(index => index >= 0);
    if (starts.length > 0) candidates.push(source.slice(Math.min(...starts)).trim());
  }
  if (candidates.length === 0) throw new ResponseParseError('响应中没有 JSON 候选的起始符', raw);
  return candidates;
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
  if (!Array.isArray(root.messages)) {
    throw new ResponseParseError('响应 JSON 缺少 messages 数组', raw);
  }
  const allowed = new Set(members);
  // 坏消息（非对象、缺字段、空白内容、sender 非成员）跳过；多余字段随构造剥离
  const messages: ParsedMessage[] = [];
  for (const item of root.messages) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const message = item as Record<string, unknown>;
    if (
      typeof message.sender !== 'string' ||
      message.sender.trim().length === 0 ||
      typeof message.content !== 'string' ||
      message.content.trim().length === 0 ||
      !allowed.has(message.sender)
    ) {
      continue;
    }
    messages.push({ sender: message.sender, content: message.content });
  }
  if (messages.length === 0) throw new ResponseParseError('响应 JSON 没有可用的消息', raw);
  return { messages };
}

function parseCandidate(candidate: string, repair: RepairFunction, raw: string): unknown {
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    try {
      return JSON.parse(repair(candidate)) as unknown;
    } catch {
      throw new ResponseParseError('响应 JSON 解析失败，一次本地修复后仍无效', raw);
    }
  }
}

export function parseResponse(
  raw: string,
  members: readonly string[],
  repair: RepairFunction = jsonrepair,
): ParsedResponse {
  const candidates = extractCandidates(raw);
  let lastError: ResponseParseError | null = null;
  // AI 通常先输出思考或草稿、最后输出正式结果，故从尾部候选开始，取第一个合法结果
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      return validate(parseCandidate(candidates[index], repair, raw), members, raw);
    } catch (error) {
      if (!(error instanceof ResponseParseError)) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new ResponseParseError('响应 JSON 解析失败', raw);
}
