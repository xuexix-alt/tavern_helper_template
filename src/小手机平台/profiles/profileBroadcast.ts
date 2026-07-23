import { z } from 'zod';

import type { PhoneDb } from '../data/phoneDb';
import type { ProfileEvidenceRef } from './profileTypes';

export const PROFILE_BROADCAST_TITLES = ['秩序与局势', '生存与资源', '人物与社会'] as const;

const BroadcastOutputSchema = z
  .object({
    sections: z.tuple([
      z.object({ title: z.literal('秩序与局势'), body: z.string().trim().min(1).max(1_500) }).strict(),
      z.object({ title: z.literal('生存与资源'), body: z.string().trim().min(1).max(1_500) }).strict(),
      z.object({ title: z.literal('人物与社会'), body: z.string().trim().min(1).max(1_500) }).strict(),
    ]),
  })
  .strict();

export interface ProfileBroadcastInput {
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
  ];
}

export interface StoredProfileBroadcastIssue extends ProfileBroadcastOutput {
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

function publicEvidenceOnly(refs: readonly ProfileEvidenceRef[]): boolean {
  return (
    refs.length > 0 &&
    refs.every(ref => ref.startsWith('story:') || ref.startsWith('mvu:'))
  );
}

export function buildProfileBroadcastPrompt(input: ProfileBroadcastInput): string {
  const publicProfileChanges = input.publicProfileChanges.filter(change =>
    publicEvidenceOnly(change.evidenceRefs),
  );
  return [
    '你是伊甸世界观中的末日公共广播编辑。',
    '广播是纯娱乐内容，只能根据下列公开证据写成新闻，不得续写剧情或向人物下达行动。',
    '固定输出三栏并保持顺序：秩序与局势、生存与资源、人物与社会。',
    '某一栏证据不足时必须写“暂无重大变化”。',
    '私聊不能引用；私聊独有事实不得改写成公共新闻，也不得暗示消息来源。',
    '只输出指定 JSON，不要 Markdown。',
    `公开正文：${JSON.stringify(input.publicStory)}`,
    `公开MVU事实：${JSON.stringify(input.publicMvuFacts)}`,
    `仅公开证据支持的人物变化：${JSON.stringify(publicProfileChanges)}`,
    `输出契约：${JSON.stringify({
      sections: PROFILE_BROADCAST_TITLES.map(title => ({ title, body: '新闻正文或暂无重大变化' })),
    })}`,
  ].join('\n');
}

export function parseProfileBroadcastOutput(raw: string): ProfileBroadcastOutput {
  try {
    const parsed: unknown = JSON.parse(jsonCandidate(raw));
    return BroadcastOutputSchema.parse(parsed) as ProfileBroadcastOutput;
  } catch (error) {
    throw new Error(`广播结构或字段无效：${error instanceof Error ? error.message : String(error)}`);
  }
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
