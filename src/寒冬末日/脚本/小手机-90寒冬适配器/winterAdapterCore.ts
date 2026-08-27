import { loreEntryNameFor, type LoreSyncType } from '../../../小手机平台/data/chatLoreSync';
import type { PhoneSchedulerJob, SchedulerPriority } from '../../../小手机平台/scheduler/phoneScheduler';

export const WINTER_CHARACTER_NAME = '末世寒冬 - 星穹秩序';

const WINTER_NON_CHARACTER_ROOT_KEYS = new Set([
  '世界',
  '通讯网络',
  '庇护所',
  '伊甸一次性指令',
  '房间',
  '主线任务',
  '临时NPC',
  '楼层其他住户',
]);

export interface WinterContactCandidate {
  id: string;
  name: string;
  temporary: boolean;
}

export function extractWinterContactCandidates(statData: unknown): WinterContactCandidate[] {
  if (!isRecord(statData)) return [];
  const candidates: WinterContactCandidate[] = [];
  const collect = (key: string, value: unknown, temporary: boolean): void => {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, '登场状态')) return;
    const explicitName = typeof value.姓名 === 'string' ? value.姓名.trim() : '';
    candidates.push({
      id: `${temporary ? 'temporary' : 'main'}:${key}`,
      name: explicitName || key,
      temporary,
    });
  };
  for (const [key, value] of Object.entries(statData)) {
    if (!WINTER_NON_CHARACTER_ROOT_KEYS.has(key)) collect(key, value, false);
  }
  for (const [key, value] of Object.entries(isRecord(statData.临时NPC) ? statData.临时NPC : {})) {
    collect(key, value, true);
  }
  return candidates;
}

export interface SnapshotCompletionGateState {
  generationActive: boolean;
  mvuUpdateActive: boolean;
  awaitingMvuCompletion: boolean;
  pendingAssistantMessageId: number | null;
}

export type SnapshotCompletionGateEvent =
  | { type: 'generation-started' }
  | { type: 'generation-ended'; assistantMessageId: number }
  | { type: 'mvu-started' }
  | { type: 'mvu-ended' };

export function advanceSnapshotCompletionGate(
  state: SnapshotCompletionGateState = {
    generationActive: false,
    mvuUpdateActive: false,
    awaitingMvuCompletion: false,
    pendingAssistantMessageId: null,
  },
  event: SnapshotCompletionGateEvent,
): { state: SnapshotCompletionGateState; publishAssistantMessageId: number | null } {
  let next: SnapshotCompletionGateState;
  switch (event.type) {
    case 'generation-started':
      next = {
        generationActive: true,
        mvuUpdateActive: false,
        awaitingMvuCompletion: true,
        pendingAssistantMessageId: null,
      };
      break;
    case 'generation-ended':
      next = { ...state, generationActive: false, pendingAssistantMessageId: event.assistantMessageId };
      break;
    case 'mvu-started':
      next = { ...state, mvuUpdateActive: true };
      break;
    case 'mvu-ended':
      next = { ...state, mvuUpdateActive: false, awaitingMvuCompletion: false };
      break;
  }
  const publishAssistantMessageId =
    !next.generationActive &&
    !next.mvuUpdateActive &&
    !next.awaitingMvuCompletion &&
    next.pendingAssistantMessageId !== null
      ? next.pendingAssistantMessageId
      : null;
  if (publishAssistantMessageId !== null) next = { ...next, pendingAssistantMessageId: null };
  return { state: next, publishAssistantMessageId };
}

export interface HostEpochSnapshot {
  characterName: string;
  chatId: string;
  sessionKey: string;
}

export interface HostEpochCapture {
  epoch: number;
  host: HostEpochSnapshot;
}

export function isHostEpochCaptureCurrent(
  captured: HostEpochCapture,
  currentEpoch: number,
  currentHost: HostEpochSnapshot,
): boolean {
  return (
    captured.epoch === currentEpoch &&
    captured.host.characterName === currentHost.characterName &&
    captured.host.chatId === currentHost.chatId &&
    captured.host.sessionKey === currentHost.sessionKey
  );
}

export async function runPendingDispatchPreparation<T>(options: {
  markPending(): Promise<unknown>;
  prepareAndDispatch(): Promise<T>;
  markFailed(error: unknown): Promise<void>;
}): Promise<T> {
  await options.markPending();
  try {
    return await options.prepareAndDispatch();
  } catch (error) {
    await options.markFailed(error);
    throw error;
  }
}

export interface SnapshotPublicationInput {
  assistantMessageId: number | null;
  mvu: unknown;
  assistantCompleted?: boolean;
}

export interface StableSnapshotIdentity {
  chatId: string;
  assistantMessageId: number;
  mvuSignature: string;
}

export function canPublishSnapshot(input: SnapshotPublicationInput): boolean {
  if (!Number.isSafeInteger(input.assistantMessageId) || (input.assistantMessageId ?? -1) < 0) return false;
  if (input.assistantCompleted !== true) return false;
  if (!isRecord(input.mvu)) return false;
  const statData = input.mvu.stat_data;
  return isRecord(statData) && Object.keys(statData).length > 0;
}

export function createStableSnapshotKey(identity: StableSnapshotIdentity): string {
  const chatId = identity.chatId.trim();
  const mvuSignature = identity.mvuSignature.trim();
  if (
    !chatId ||
    !mvuSignature ||
    !Number.isSafeInteger(identity.assistantMessageId) ||
    identity.assistantMessageId < 0
  ) {
    throw new Error('稳定快照需要 chatId、assistantMessageId 与 mvuSignature');
  }
  return `${chatId}::${identity.assistantMessageId}::${mvuSignature}`;
}

export function isCapturedSessionCurrent(capturedSessionKey: string, currentSessionKey: string | null): boolean {
  return capturedSessionKey.trim() !== '' && capturedSessionKey === currentSessionKey;
}

export function isStableSnapshotCurrent(
  captured: StableSnapshotIdentity,
  current: StableSnapshotIdentity | null,
): boolean {
  return current !== null && createStableSnapshotKey(captured) === createStableSnapshotKey(current);
}

export function capturedWritebackSessionKey(capturedSessionKey: string): string {
  const sessionKey = capturedSessionKey.trim();
  if (!sessionKey) throw new Error('AI 回写缺少捕获的 sessionKey');
  return sessionKey;
}

export interface IdentityMigration {
  from: `temporary:${string}`;
  to: `main:${string}`;
}

export interface IdentityMigrationPlan {
  migrations: IdentityMigration[];
  diagnostics: string[];
}

export function planTemporaryNpcMigration(
  temporaryNames: readonly string[],
  mainNames: readonly string[],
): IdentityMigrationPlan {
  const temporaryCounts = countNormalizedNames(temporaryNames);
  const mainCounts = countNormalizedNames(mainNames);
  const migrations: IdentityMigration[] = [];
  const diagnostics: string[] = [];
  for (const [name, temporaryCount] of temporaryCounts) {
    const mainCount = mainCounts.get(name) ?? 0;
    if (mainCount === 0) continue;
    if (temporaryCount !== 1 || mainCount !== 1) {
      diagnostics.push(`姓名「${name}」存在歧义，未自动迁移 (ambiguous identity)`);
      continue;
    }
    migrations.push({ from: `temporary:${name}`, to: `main:${name}` });
  }
  return { migrations, diagnostics };
}

export function planTemporaryNpcPromotion(
  previousTemporaryNames: readonly string[],
  previousMainNames: readonly string[],
  currentMainNames: readonly string[],
): IdentityMigrationPlan {
  const previousMainCounts = countNormalizedNames(previousMainNames);
  const currentMainCounts = countNormalizedNames(currentMainNames);
  const newlyAddedMainNames: string[] = [];
  for (const [name, currentCount] of currentMainCounts) {
    const addedCount = Math.max(0, currentCount - (previousMainCounts.get(name) ?? 0));
    for (let index = 0; index < addedCount; index += 1) newlyAddedMainNames.push(name);
  }
  return planTemporaryNpcMigration(previousTemporaryNames, newlyAddedMainNames);
}

interface ConversationIdentityRecord {
  id: string;
  participants: string[];
  [key: string]: unknown;
}

interface MessageIdentityRecord {
  id: string;
  sender: string;
  content: string;
  [key: string]: unknown;
}

export interface PhoneIdentityRecords {
  conversations: ConversationIdentityRecord[];
  contactPreferences: Record<string, unknown>;
  messages: MessageIdentityRecord[];
}

export function migrateTemporaryNpcIdentity(
  plan: IdentityMigrationPlan,
  records: PhoneIdentityRecords,
): PhoneIdentityRecords {
  const replacements = new Map(plan.migrations.map(item => [item.from, item.to]));
  const contactPreferences: Record<string, unknown> = {};
  for (const [identity, preference] of Object.entries(records.contactPreferences)) {
    contactPreferences[replacements.get(identity as IdentityMigration['from']) ?? identity] =
      structuredClone(preference);
  }
  return {
    conversations: records.conversations.map(item => ({
      ...structuredClone(item),
      participants: item.participants.map(
        identity => replacements.get(identity as IdentityMigration['from']) ?? identity,
      ),
    })),
    contactPreferences,
    messages: records.messages.map(item => ({
      ...structuredClone(item),
      sender: replacements.get(item.sender as IdentityMigration['from']) ?? item.sender,
    })),
  };
}

export function characterProfileEntryName(name: string): string {
  return `角色档案 - ${name.trim()}`;
}

export interface ProfileEntry {
  name: string;
  content: string;
}

export function selectCharacterProfile(
  name: string,
  entries: readonly ProfileEntry[],
  temporaryNpc = false,
): string | undefined {
  if (temporaryNpc) return undefined;
  const exactName = characterProfileEntryName(name);
  return entries.find(entry => entry.name === exactName)?.content;
}

export function resolveWinterPersonMvu(personId: string, statData: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(statData)) return {};
  const separator = personId.indexOf(':');
  if (separator < 1) return {};
  const scope = personId.slice(0, separator);
  const name = personId.slice(separator + 1);
  const value =
    scope === 'temporary' ? (isRecord(statData.临时NPC) ? statData.临时NPC[name] : undefined) : statData[name];
  return isRecord(value) ? value : {};
}

/**
 * 从 MVU 世界状态提取剧情时间戳；空白字段省略，供消息落库时由系统盖章。
 * 时间不由 AI 生成——AI 输出的时间容易错乱且可伪造，真实微信的时间戳同样由客户端/服务器加盖。
 */
export function resolveWinterWorldTime(statData: unknown): { gameDate?: string; gameTime?: string } {
  if (!isRecord(statData) || !isRecord(statData.世界)) return {};
  const gameDate = typeof statData.世界.日期 === 'string' ? statData.世界.日期.trim() : '';
  const gameTime = typeof statData.世界.时间 === 'string' ? statData.世界.时间.trim() : '';
  return {
    ...(gameDate ? { gameDate } : {}),
    ...(gameTime ? { gameTime } : {}),
  };
}

export function selectDynamicProfile(
  personId: string,
  entries: readonly { name: string; content: string }[],
): string | undefined {
  return entries.find(entry => entry.name === `[人物动态]${personId}`)?.content;
}

/**
 * 广播（profile-radio）公开 MVU 事实的定向投影：只输出「播新闻所必须」的字段。
 * - 世界/通讯网络：整体公开（日期时间锚点 + 网络通断头条）。
 * - 庇护所：仅保留等级/升级距离/能力总述/可扩展区域/庇护范围变更备注；剔除游戏机制字段（今日投掷点数）与工程接口字段（接口覆盖范围等）。
 * - 主线任务：剔除 $meta（角色底牌、楼层号等剧透元数据）。
 * - 房间/楼层其他住户：递归剔除空字符串、空数组与空对象，只留有效居住信息。
 * - 临时NPC：仅输出公开动向投影（关系档位/健康状况/所在房间/登场状态），且仅收录关系档位非「无」者；私密字段（内心想法、衣着等）与主要角色动态键一律不进入。
 */
export function selectPublicWinterMvuFacts(statData: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(statData)) return {};

  const facts: Record<string, unknown> = {};

  if (hasOwnField(statData, '世界')) facts.世界 = structuredClone(statData.世界);
  if (hasOwnField(statData, '通讯网络')) facts.通讯网络 = structuredClone(statData.通讯网络);

  if (isRecord(statData.庇护所)) {
    const scopeChangeNote = isRecord(statData.庇护所.庇护范围变更) ? statData.庇护所.庇护范围变更.note : undefined;
    const shelter = pickMeaningful({
      庇护所等级: statData.庇护所.庇护所等级,
      距离上次升级: statData.庇护所.距离上次升级,
      庇护所能力总述: statData.庇护所.庇护所能力总述,
      可扩展区域: statData.庇护所.可扩展区域,
    });
    if (typeof scopeChangeNote === 'string' && scopeChangeNote.trim() !== '') {
      shelter.庇护范围变更 = scopeChangeNote;
    }
    if (Object.keys(shelter).length > 0) facts.庇护所 = shelter;
  }

  if (hasOwnField(statData, '主线任务')) {
    const missions = structuredClone(statData.主线任务);
    if (isRecord(missions)) {
      delete missions.$meta;
      facts.主线任务 = missions;
    }
  }

  if (isRecord(statData.房间)) {
    const rooms = stripEmptyDeep(statData.房间);
    if (rooms !== undefined) facts.房间 = rooms;
  }

  if (isRecord(statData.楼层其他住户)) {
    const residents = stripEmptyDeep(statData.楼层其他住户);
    if (residents !== undefined) facts.楼层其他住户 = residents;
  }

  if (isRecord(statData.临时NPC)) {
    const movements: Record<string, unknown> = {};
    for (const [name, npc] of Object.entries(statData.临时NPC)) {
      if (!isRecord(npc) || typeof npc.关系 !== 'string' || npc.关系 === '无') continue;
      movements[name] = pickMeaningful({
        关系: npc.关系,
        健康状况: npc.健康状况 === '无' ? undefined : npc.健康状况,
        所在房间: npc.所在房间,
        登场状态: npc.登场状态,
      });
    }
    if (Object.keys(movements).length > 0) facts.临时NPC动向 = movements;
  }

  return facts;
}

function hasOwnField(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** 仅保留已定义且非空白字符串的键（0/false 等有效值照常保留）。 */
function pickMeaningful(entries: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    result[key] = value;
  }
  return result;
}

/** 递归剔除空字符串/空数组/空对象；全部为空时返回 undefined（数字与布尔原样保留）。 */
function stripEmptyDeep(value: unknown): unknown {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (Array.isArray(value)) {
    const items = value.map(stripEmptyDeep).filter(item => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const stripped = stripEmptyDeep(item);
      if (stripped !== undefined) result[key] = stripped;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return value;
}

export interface WinterTask {
  id: string;
  title: string;
  detail: string;
  sourceKey: string;
  triggerKey: string;
  actionText: string;
}

export function buildWinterTasks(mvu: unknown): WinterTask[] {
  if (!isRecord(mvu) || !isRecord(mvu.主线任务)) return [];
  const tasks: WinterTask[] = [];
  const goals = mvu.主线任务.阶段目标;
  if (isRecord(goals)) {
    for (const [name, rawGoal] of Object.entries(goals)) {
      if (!isRecord(rawGoal)) continue;
      const description = textValue(rawGoal.描述);
      const current = finiteNumber(rawGoal.当前值);
      const target = finiteNumber(rawGoal.目标值);
      tasks.push({
        id: `goal:${name}`,
        title: name,
        detail: `${description}（${current}/${target}）`,
        sourceKey: `winter:goal:${name}`,
        triggerKey: `goal:${name}:${current}:${target}`,
        actionText: `推进阶段目标「${name}」：${description}`,
      });
    }
  }
  const fragments = mvu.主线任务.情报碎片;
  if (isRecord(fragments)) {
    for (const [key, rawFragment] of Object.entries(fragments)) {
      if (!isRecord(rawFragment)) continue;
      const number = textValue(rawFragment.编号) || key;
      const description = textValue(rawFragment.描述);
      const value = textValue(rawFragment.价值);
      const risk = textValue(rawFragment.风险);
      const status = textValue(rawFragment.状态);
      tasks.push({
        id: `intel:${key}`,
        title: `情报 ${number}`,
        detail: `${description}｜价值：${value}｜风险：${risk}｜${status}`,
        sourceKey: `winter:intel:${key}`,
        triggerKey: `intel:${key}:${status}`,
        actionText: `调查情报碎片「${number}」：${description}`,
      });
    }
  }
  return tasks;
}

export interface EdenNotice {
  id: string;
  source: string;
  content: string;
  trust: 'confirmed' | 'unverified';
  triggerKey: string;
}

export interface EdenNoticeInput {
  communicationNetwork: Record<string, unknown>;
  tasks: readonly WinterTask[];
  confirmedChanges: readonly string[];
  scheduledExternalBroadcasts?: readonly { id: string; source: string; content: string }[];
}

export function buildEdenNotices(input: EdenNoticeInput): EdenNotice[] {
  const networkSignature = Object.entries(input.communicationNetwork)
    .map(([key, value]) => `${key}:${textValue(value)}`)
    .join('|');
  const notices: EdenNotice[] = [
    {
      id: 'network',
      source: '伊甸网络',
      content: networkSignature,
      trust: 'confirmed',
      triggerKey: `network:${networkSignature}`,
    },
    ...input.tasks.map(task => ({
      id: task.id,
      source: '伊甸任务',
      content: task.detail,
      trust: 'confirmed' as const,
      triggerKey: `task:${task.triggerKey}`,
    })),
    ...input.confirmedChanges.map((change, index) => ({
      id: `confirmed:${index}`,
      source: 'MVU确认变化',
      content: change,
      trust: 'confirmed' as const,
      triggerKey: `confirmed:${change}`,
    })),
  ];
  for (const broadcast of input.scheduledExternalBroadcasts ?? []) {
    notices.push({
      id: broadcast.id,
      source: broadcast.source,
      content: broadcast.content,
      trust: 'unverified',
      triggerKey: `external:${broadcast.id}`,
    });
  }
  return notices;
}

export interface WinterSchedulerJobInput {
  sessionKey: string;
  snapshotKey: string;
  conversationId: string;
  worldbookName: string;
  speaker: string;
  participants: readonly string[];
  notices: readonly EdenNotice[];
  /** 事件发生时的剧情时间戳（resolveWinterWorldTime 的输出），随 payload 透传供落库盖章 */
  gameDate?: string;
  gameTime?: string;
}

export function buildWinterSchedulerJobs(input: WinterSchedulerJobInput): PhoneSchedulerJob[] {
  const priorityFor = (notice: EdenNotice): SchedulerPriority =>
    notice.id === 'network' ? 'P0' : notice.id.startsWith('confirmed:') ? 'P1' : 'P2';
  const worldTime = {
    ...(input.gameDate ? { gameDate: input.gameDate } : {}),
    ...(input.gameTime ? { gameTime: input.gameTime } : {}),
  };
  const jobs: PhoneSchedulerJob[] = input.notices.map(notice => ({
    triggerKey: `deterministic:${notice.triggerKey}`,
    sessionKey: input.sessionKey,
    snapshotKey: input.snapshotKey,
    conversationId: 'broadcast:eden',
    contactKey: notice.source,
    topicKey: `notice:${notice.id}`,
    topicVersion: notice.triggerKey,
    priority: priorityFor(notice),
    source: 'deterministic_notice',
    requiresAi: false,
    payload: {
      kind: 'broadcast',
      worldbookName: input.worldbookName,
      source: notice.source,
      content: notice.content,
      trust: notice.trust,
      ...worldTime,
    },
  }));
  if (!input.speaker.trim()) return jobs;
  for (const notice of input.notices) {
    const source =
      notice.id === 'network'
        ? 'network_change'
        : notice.id.startsWith('goal:') || notice.id.startsWith('intel:')
          ? 'task_intel_change'
          : null;
    if (!source) continue;
    jobs.push({
      triggerKey: `ai:${notice.triggerKey}`,
      sessionKey: input.sessionKey,
      snapshotKey: input.snapshotKey,
      conversationId: input.conversationId,
      contactKey: input.speaker,
      topicKey: `proactive:${notice.id}`,
      topicVersion: notice.triggerKey,
      priority: priorityFor(notice),
      source,
      requiresAi: true,
      payload: {
        kind: 'proactive-ai',
        worldbookName: input.worldbookName,
        source: notice.source,
        content: notice.content,
        trust: notice.trust,
        speaker: input.speaker,
        participants: [...input.participants],
        ...worldTime,
      },
    });
  }
  return jobs;
}

export function submitWinterSchedulerJobs(
  scheduler: Pick<
    import('../../../小手机平台/scheduler/phoneScheduler').ControlledPhoneScheduler,
    'enqueue' | 'runAvailable'
  >,
  jobs: readonly PhoneSchedulerJob[],
): number {
  let accepted = 0;
  for (const job of jobs) {
    if (scheduler.enqueue(job)) accepted += 1;
  }
  scheduler.runAvailable();
  return accepted;
}

export function diffConfirmedMvuChanges(before: unknown, after: unknown, maxChanges = 20): string[] {
  if (!Number.isSafeInteger(maxChanges) || maxChanges <= 0) throw new Error('MVU 变化数量上限必须是正安全整数');
  const changes: string[] = [];
  collectChanges('', before, after, changes);
  return changes.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)).slice(0, maxChanges);
}

export function collectChatLoreContext(
  entries: readonly { name: string; content: string }[],
  type: LoreSyncType,
  conversationId?: string,
  characterBudget = 6_000,
  groupName?: string,
): string {
  if (!Number.isSafeInteger(characterBudget) || characterBudget <= 0)
    throw new Error('ChatLore 字符预算必须是正安全整数');
  const entryName = loreEntryNameFor(type, conversationId, groupName);
  return entries
    .filter(entry => entry.name === entryName)
    .map(entry => `${entry.name}\n${entry.content}`)
    .join('\n\n')
    .slice(0, characterBudget);
}

function collectChanges(path: string, before: unknown, after: unknown, output: string[]): void {
  if (Object.is(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) collectChanges(path ? `${path}.${key}` : key, before[key], after[key], output);
    return;
  }
  output.push(`${path || 'stat_data'}:${boundedValue(before)}→${boundedValue(after)}`);
}

function boundedValue(value: unknown): string {
  const rendered =
    typeof value === 'string'
      ? value
      : value === undefined
        ? '未定义'
        : value === null || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value);
  return (rendered ?? '').slice(0, 80);
}

function countNormalizedNames(names: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rawName of names) {
    const name = rawName.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function finiteNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
