import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

import type { PhoneDb } from '../data/phoneDb';
import type { ProfileEvidenceRef } from './profileTypes';

export const PROFILE_BROADCAST_TITLES = ['本台通告', '生活频道', '街坊风声'] as const;

export const PROFILE_BROADCAST_SYSTEM_PROMPT = [
  '你是「伊甸」定居点广播站的制作人兼轮值播音员，为幸存者播出每期三段节目。',
  '这份广播不是新闻联播：它的目的是让听众隔着电波感觉到——这栋楼里的人还活着，事情正在发生。',
  '写作总纲：',
  '1. 三段节目用三种声音：「本台通告」是管理处的官方腔，短句、公事公办、克制；「生活频道」是物资组熟人的口吻，具体、带数字、有点絮叨；「街坊风声」是爱聊八卦的邻居口吻，绘声绘色、半真半假。不要把三段写成同一种公文。',
  '2. 长度：「本台通告」「生活频道」各写 60~200 字，公文与絮叨点到即止；「街坊风声」放宽到 60~300 字——传闻值得讲得绘声绘色，可以多给几句起承转合，把「听说」「有人瞧见」的细节铺开讲。',
  '3. 感知化改写：把素材翻译成住户能感知到的样子——「阶段目标当前值2/目标值3」应播成「19层的清理完成了大半」；「伊甸内网受限」应播成「这两天内网时好时坏」。数字与状态只在对生活有意义时出现。',
  '4. 活人感：信源可以模糊化（如「据不愿透露姓名的住户」「住在20层的大爷说」）；可以在事实之外补一句楼里人的反应或议论，但不得虚构新的事实、新的人物或新的事件。',
  '5. 钩子：让听众听完想去看一眼——一句未证实的传闻、一处反常的细节、一句下期预告，都是好钩子。',
  '6. 红线：严禁编造素材中不存在的事实；严禁续写剧情或向任何人物下达行动指令；严禁引用、改写或暗示任何私聊（微信）内容，即使素材中出现也要忽略。',
  '7. 仅当某段节目在全部素材中确实无话可说时，该段才写「暂无重大变化」；素材简短但确有事件时必须写成节目，不得放弃。',
  '8. 只输出符合用户契约的 JSON，不要 Markdown 或额外说明。',
].join('\n');

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
    sections: z.tuple([BroadcastSectionSchema, BroadcastSectionSchema, BroadcastSectionSchema]),
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
    return { sections } satisfies ProfileBroadcastOutput;
  });

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
  sections: readonly [ProfileBroadcastSection, ProfileBroadcastSection, ProfileBroadcastSection];
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

function parseJsonCandidate(raw: string): unknown {
  const candidate = jsonCandidate(raw);
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return JSON.parse(jsonrepair(candidate)) as unknown;
  }
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
  return [
    '请依据下列素材编排本期节目，固定播出三段并保持顺序：本台通告、生活频道、街坊风声。',
    '',
    '【本期节目单】',
    '1.「本台通告」——管理处官方腔，短句、公文式、克制。播：主线任务进展（感知化改写）、通讯网络状态、庇护范围调整、危险与规则提醒。素材取自：主线任务、通讯网络、庇护范围变更。',
    '2.「生活频道」——物资组熟人口吻，具体、带数字、有点絮叨。播：食物能源储备与消耗、天气气温、居住安排（谁住进了哪）、生活小提醒。素材取自：世界、庇护所、房间、楼层其他住户。',
    '3.「街坊风声」——八卦邻居口吻，绘声绘色、半真半假。播：人物新动向、邻里互动与互助、楼里传闻（可用「听说」「有人瞧见」起头）。素材取自：人物动向、临时NPC动向、楼层其他住户；传闻必须挂在公开素材上，不得涉及私聊。',
    '',
    '【公开正文】（最近剧情，按时间排列）',
    ...storyLines,
    '',
    '【MVU公开事实】',
    mvuFacts,
    '',
    '【人物动向】（仅公开证据支持；私聊内容已剔除，播报也不得引用私聊、改写成新闻或暗示消息来源）',
    ...changeLines,
    '',
    '【输出契约】只输出如下结构的 JSON，三段顺序固定；「本台通告」「生活频道」body 为 60~200 字，「街坊风声」body 为 60~300 字（传闻叙事可以写得更长更放）；仅当该段素材为空时才写「暂无重大变化」：',
    JSON.stringify({
      sections: PROFILE_BROADCAST_TITLES.map(title => ({
        title,
        body: title === '街坊风声' ? '节目正文（60~300字）' : '节目正文（60~200字）',
      })),
    }),
  ].join('\n');
}

export function parseProfileBroadcastOutput(raw: string): ProfileBroadcastOutput {
  try {
    return BroadcastOutputSchema.parse(parseResponsePayload(raw));
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
