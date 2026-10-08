import { PROMPT_DEFINITIONS } from '../ai/promptCatalog';
import { renderPromptTemplate } from '../ai/promptTemplates';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

import type { PhoneDb } from '../data/phoneDb';
import type { ProfileEvidenceRef } from './profileTypes';

export const PROFILE_BROADCAST_TITLES = ['本台通告', '生活频道', '街坊风声', '床头床尾'] as const;

export const PROFILE_BROADCAST_SYSTEM_PROMPT = PROMPT_DEFINITIONS.find(item => item.id === 'broadcast.system')!.text;

const BroadcastSectionSchema = z
  .object({
    title: z.string().trim(),
    body: z
      .union([z.string(), z.null(), z.undefined()])
      .transform(value =>
        typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 1_500) : '暂无重大变化',
      ),
  })
  .strip();

const BroadcastOutputSchema = z
  .object({
    sections: z.tuple([BroadcastSectionSchema, BroadcastSectionSchema, BroadcastSectionSchema, BroadcastSectionSchema]),
  })
  .strip()
  // 段目按标题识别并回填固定节目单顺序：乱序重排、未知标题按剩余位置认领，
  // 避免整期广播因标题/顺序瑕疵被判失败。
  .transform(output => {
    const byTitle = new Map<string, { title: string; body: string }>();
    const unclaimed: { title: string; body: string }[] = [];
    for (const section of output.sections) {
      if ((PROFILE_BROADCAST_TITLES as readonly string[]).includes(section.title) && !byTitle.has(section.title)) {
        byTitle.set(section.title, section);
      } else {
        unclaimed.push(section);
      }
    }
    const sections = PROFILE_BROADCAST_TITLES.map(title => {
      const matched = byTitle.get(title);
      if (matched) return matched;
      const fallback = unclaimed.shift();
      return fallback ? { ...fallback, title } : { title, body: '暂无重大变化' };
    });
    return { sections: [sections[0], sections[1], sections[2], sections[3]] } satisfies ProfileBroadcastOutput;
  });

export interface ProfileBroadcastInput {
  wechat?: readonly { conversationId: string; type: 'private' | 'group'; sender: string; content: string }[];
  publicStory: readonly string[];
  publicMvuFacts: Readonly<Record<string, unknown>>;
  publicProfileChanges: readonly {
    content: string;
    evidenceRefs: readonly ProfileEvidenceRef[];
  }[];
}

export interface ProfileBroadcastSection {
  title: (typeof PROFILE_BROADCAST_TITLES)[number];
  body: string;
}

export interface ProfileBroadcastOutput {
  sections: readonly [
    ProfileBroadcastSection,
    ProfileBroadcastSection,
    ProfileBroadcastSection,
    ProfileBroadcastSection,
  ];
}

export interface StoredProfileBroadcastIssue extends Omit<ProfileBroadcastOutput, 'sections'> {
  /** 新期为四栏；旧三栏存档仍可展示，不凭空补造历史节目。 */
  sections:
    | ProfileBroadcastOutput['sections']
    | readonly [ProfileBroadcastSection, ProfileBroadcastSection, ProfileBroadcastSection];
  id: string;
  sessionKey: string;
  kind: 'profile-radio';
  sourceStoryCursor: string;
  generatedAt: number;
  rawText: string;
}

function jsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function parseJsonCandidate(raw: string): unknown {
  const candidate = jsonCandidate(raw);
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return JSON.parse(jsonrepair(candidate)) as unknown;
  }
}

/** 分开提取草稿和正式结果，避免首尾花括号把多个 JSON 拼成一个。 */
function broadcastJsonCandidates(raw: string): string[] {
  const text = raw.replace(/<(think|thinking|analysis)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').trim();
  const candidates = [text];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) {
    candidates.push(match[1].trim());
  }
  let start = -1;
  let depth = 0;
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
    if (depth > 0 && (char === '"' || char === "'")) {
      quote = char;
    } else if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) candidates.push(text.slice(start, index + 1));
    }
  }
  return candidates;
}
/** 防御性解包 OpenAI 兼容信封（choices[0].message.content / content 字段）。 */
function parseResponsePayload(raw: string): unknown {
  const parsed = parseJsonCandidate(raw);
  if (!parsed || typeof parsed !== 'object') return parsed;
  const message = (parsed as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message;
  if (typeof message?.content === 'string') return parseJsonCandidate(message.content);
  const content = (parsed as { content?: unknown }).content;
  if (typeof content === 'string') return parseJsonCandidate(content);
  return parsed;
}

function publicEvidenceOnly(refs: readonly ProfileEvidenceRef[]): boolean {
  return refs.length > 0 && refs.every(ref => ref.startsWith('story:') || ref.startsWith('mvu:'));
}

/**
 * 人物动向素材选择：正文小结必须是有内容的实际动向——
 * 契约层兜底文案（「暂无正文互动」等「暂无」语义）不是素材，不得混入广播提示词。
 */
export function isMeaningfulStorySummary(summary: string): boolean {
  const trimmed = summary.trim();
  return trimmed !== '' && !trimmed.startsWith('暂无');
}

export function buildProfileBroadcastPrompt(input: ProfileBroadcastInput): string {
  const publicProfileChanges = input.publicProfileChanges.filter(change => publicEvidenceOnly(change.evidenceRefs));
  const storyLines =
    input.publicStory.length > 0
      ? input.publicStory.map((line, index) => `${index + 1}. ${line}`)
      : ['（本期暂无公开正文记录）'];
  const changeLines =
    publicProfileChanges.length > 0
      ? publicProfileChanges.map((change, index) => `${index + 1}. ${change.content}`)
      : ['（本期暂无人物动向）'];
  const mvuFacts =
    Object.keys(input.publicMvuFacts).length > 0
      ? JSON.stringify(input.publicMvuFacts, null, 2)
      : '（本期暂无公开事实）';
  return renderPromptTemplate('broadcast.body', {
    story: storyLines.join('\n'),
    wechat: JSON.stringify(
      (input.wechat ?? []).slice(-30).map(message => ({ ...message, content: message.content.slice(0, 500) })),
    ),
    mvuFacts: mvuFacts,
    changes: changeLines.join('\n'),
    value1: JSON.stringify({
      sections: PROFILE_BROADCAST_TITLES.map(title => ({
        title,
        body: title === '街坊风声' ? '节目正文（60~300字）' : '节目正文（60~200字）',
      })),
    }),
  });
}

export function parseProfileBroadcastOutput(raw: string): ProfileBroadcastOutput {
  const candidates = broadcastJsonCandidates(raw);
  let lastError: unknown;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      return BroadcastOutputSchema.parse(parseResponsePayload(candidates[index]));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`广播结构或字段无效：${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function saveProfileBroadcastIssue(
  db: PhoneDb,
  input: {
    id: string;
    sessionKey: string;
    sourceStoryCursor: string;
    generatedAt: number;
    rawText: string;
    output: ProfileBroadcastOutput;
  },
): Promise<StoredProfileBroadcastIssue> {
  const issue: StoredProfileBroadcastIssue = {
    id: input.id,
    sessionKey: input.sessionKey,
    kind: 'profile-radio',
    sourceStoryCursor: input.sourceStoryCursor,
    generatedAt: input.generatedAt,
    sections: input.output.sections,
    rawText: input.rawText,
  };
  await db.putRecord('broadcastIssues', structuredClone(issue));
  return issue;
}
