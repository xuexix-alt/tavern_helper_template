import { PROMPT_DEFINITIONS } from '../ai/promptCatalog';
import { renderPromptTemplate } from '../ai/promptTemplates';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

import type { PhoneDb } from '../data/phoneDb';
import type { ProfileEvidenceRef } from './profileTypes';

export const PROFILE_BROADCAST_TITLES = ['本台通告', '生活频道', '街坊风声', '床头床尾'] as const;

export const PROFILE_BROADCAST_SYSTEM_PROMPT = PROMPT_DEFINITIONS.find(item => item.id === 'broadcast.system')!.text;

type BroadcastTitle = (typeof PROFILE_BROADCAST_TITLES)[number];

/**
 * 各栏体量与兜底文案。min/max 取自 broadcast.body【输出契约】的字数区间，用于拼装输出骨架；
 * hard 只作截断护栏，防止某一栏吞掉整期篇幅。
 * 想给某栏单独的兜底文案就改这里——不要把兜底句再写进 prompt（两处措辞不一致时模型会随机挑）。
 */
export const PROFILE_BROADCAST_SECTION_LIMITS: Readonly<
  Record<BroadcastTitle, { min: number; max: number; hard: number; fallback: string }>
> = {
  本台通告: { min: 60, max: 200, hard: 600, fallback: '暂无重大变化' },
  生活频道: { min: 60, max: 200, hard: 600, fallback: '暂无重大变化' },
  街坊风声: { min: 60, max: 300, hard: 900, fallback: '暂无重大变化' },
  床头床尾: { min: 60, max: 200, hard: 600, fallback: '暂无重大变化' },
};

/**
 * 各栏塞进输出骨架的硬性提示：只复述 broadcast.body 里该栏已有的要求，
 * 让约束出现在模型抄写该栏正文的同一位置，而不是散落在长 prompt 中段。
 * 「床头床尾」不在此列——那一栏写什么由提示词作者决定，这里只给定位指针。
 */
export const PROFILE_BROADCAST_SECTION_HINTS: Readonly<Record<BroadcastTitle, string>> = {
  本台通告: '公共事件或局势变化 + 可听出的立场；机构与立场须有素材依据',
  生活频道: '≥2 位具名人物 + 一处已发生的具体举动 + 主持人评价（体谅/打趣/挑明不公平）',
  街坊风声: '一处关系反差 + 带刺的主持人看法 + 谁受益、谁难堪、谁承担代价',
  床头床尾: '按【本期节目单】第 4 条「床头床尾」的说明执行',
};

/** 输出前自检：只在代码层追加，不写进 promptCatalog，改提示词时不受影响。 */
export const PROFILE_BROADCAST_SELF_CHECK = [
  '【输出前自检：逐条核对，不达标的栏当场改写】',
  '1. 四栏都写到具体的人与事，而不是泛泛的局势或生活道理。',
  '2. 生活频道、街坊风声能让听众认出是哪两个人、哪件事。',
  '3. 每栏都落在素材已有的动作、物件、措辞或现场细节上，没有新增气味、天气、伤亡、价格、人数或路人反应。',
  '4. 同一事件没有被重复播报。',
  '5. 私聊没有被洗成公众已知事实；没有编造消息来源、目击者、引语或未来结果。',
  '6. 四栏体量符合各自字数区间；素材不足时短而具体，不凑字。',
  '7. body 是可直接念出的广播词；标题与顺序不得改动。',
].join('\n');

function normalizeSectionBody(title: BroadcastTitle, body: string): string {
  const trimmed = body.trim();
  if (trimmed === '') return PROFILE_BROADCAST_SECTION_LIMITS[title].fallback;
  const { hard } = PROFILE_BROADCAST_SECTION_LIMITS[title];
  return trimmed.length > hard ? trimmed.slice(0, hard) : trimmed;
}

const BroadcastSectionSchema = z
  .object({
    title: z.string().trim(),
    body: z
      .union([z.string(), z.null(), z.undefined()])
      .transform(value => (typeof value === 'string' ? value.trim() : '')),
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
      const matched = byTitle.get(title) ?? unclaimed.shift();
      return { title, body: normalizeSectionBody(title, matched?.body ?? '') };
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
  const body = renderPromptTemplate('broadcast.body', {
    story: storyLines.join('\n'),
    wechat: JSON.stringify(
      (input.wechat ?? []).slice(-30).map(message => ({ ...message, content: message.content.slice(0, 500) })),
    ),
    mvuFacts: mvuFacts,
    changes: changeLines.join('\n'),
    value1: JSON.stringify({
      sections: PROFILE_BROADCAST_TITLES.map(title => {
        const { min, max } = PROFILE_BROADCAST_SECTION_LIMITS[title];
        return { title, body: `节目正文（${min}~${max}字）——${PROFILE_BROADCAST_SECTION_HINTS[title]}` };
      }),
    }),
  });
  // 自检块追加在骨架之后：模型读到它的位置最靠近生成，也不依赖用户对 broadcast.body 的改写顺序。
  return `${body.trimEnd()}\n\n${PROFILE_BROADCAST_SELF_CHECK}`;
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
