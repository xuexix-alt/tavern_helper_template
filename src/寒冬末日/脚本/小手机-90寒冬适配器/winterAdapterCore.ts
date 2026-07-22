import type { PhoneSchedulerJob, SchedulerPriority } from '../../../小手机平台/scheduler/phoneScheduler';

export const WINTER_CHARACTER_NAME = '末世寒冬 - 星穹秩序';
export const EDEN_TERMINAL_T2_ABILITY = 'social.shift_ration_protocol_t2';
export const EDEN_TERMINAL_T4_ABILITY = 'social.eden_phone_mass_t4';

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

export interface EdenAssignmentInput {
  abilities: readonly string[];
  assignedCount: number;
}

export function canAssignEdenTerminal(input: EdenAssignmentInput): boolean {
  if (!Number.isSafeInteger(input.assignedCount) || input.assignedCount < 0) return false;
  if (input.abilities.includes(EDEN_TERMINAL_T4_ABILITY)) return true;
  return input.abilities.includes(EDEN_TERMINAL_T2_ABILITY) && input.assignedCount < 5;
}

export function isEdenTerminalDeploymentAllowed(input: EdenAssignmentInput): boolean {
  if (!Number.isSafeInteger(input.assignedCount) || input.assignedCount < 0) return false;
  if (input.abilities.includes(EDEN_TERMINAL_T4_ABILITY)) return true;
  return input.abilities.includes(EDEN_TERMINAL_T2_ABILITY) && input.assignedCount <= 5;
}

type NetworkState = '在线' | '受限' | '中断';
type TerminalType = '无设备' | '普通手机' | '伊甸终端T2';
type TerminalStatus = '无设备' | '正常' | '关机' | '损坏' | '遗失';
type SignalStatus = '在线' | '离线' | '失联';

export interface ContactAvailabilityInput {
  established: boolean;
  terminalType: TerminalType;
  terminalStatus: TerminalStatus;
  signalStatus: SignalStatus;
  publicNetwork?: NetworkState;
  edenNetwork?: NetworkState;
  edenAccessAllowed?: boolean;
}

export interface ContactAvailability {
  online: boolean;
  canSend: boolean;
  network: '公共通信网' | '伊甸内网' | null;
}

export interface EdenGroupContact {
  id: string;
  established: boolean;
  terminalType: TerminalType;
  terminalStatus: TerminalStatus;
  signalStatus: SignalStatus;
}

export function deriveEdenGroupMemberIds(input: {
  contacts: readonly EdenGroupContact[];
  edenNetwork: NetworkState;
  edenAccessAllowed: boolean;
}): string[] {
  if (input.edenNetwork !== '在线' || !input.edenAccessAllowed) return [];
  return input.contacts
    .filter(
      contact =>
        contact.established &&
        contact.terminalType === '伊甸终端T2' &&
        contact.terminalStatus === '正常' &&
        contact.signalStatus === '在线',
    )
    .map(contact => contact.id);
}

export function deriveContactAvailability(input: ContactAvailabilityInput): ContactAvailability {
  const network =
    input.terminalType === '普通手机' ? '公共通信网' : input.terminalType === '伊甸终端T2' ? '伊甸内网' : null;
  const networkState =
    network === '公共通信网' ? input.publicNetwork : network === '伊甸内网' ? input.edenNetwork : undefined;
  const online = Boolean(
    input.established &&
    network &&
    input.terminalStatus === '正常' &&
    input.signalStatus === '在线' &&
    (network !== '伊甸内网' || input.edenAccessAllowed === true) &&
    networkState === '在线',
  );
  return { online, canSend: online, network };
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

export interface BoundedMemberContextInput {
  name: string;
  profile?: string;
  mvuFields: unknown;
  recentCompletedStory: string;
  characterBudget: number;
}

export function buildBoundedMemberContext(input: BoundedMemberContextInput): string {
  if (!Number.isSafeInteger(input.characterBudget) || input.characterBudget <= 0) {
    throw new Error('角色资料字符预算必须是正安全整数');
  }
  const source = input.profile?.trim()
    ? `姓名：${input.name.trim()}\n角色档案：${input.profile.trim()}`
    : `姓名：${input.name.trim()}\nMVU字段：${JSON.stringify(input.mvuFields)}\n近期已完成正文：${input.recentCompletedStory}`;
  return source.slice(0, input.characterBudget);
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
}

export function buildWinterSchedulerJobs(input: WinterSchedulerJobInput): PhoneSchedulerJob[] {
  const priorityFor = (notice: EdenNotice): SchedulerPriority =>
    notice.id === 'network' ? 'P0' : notice.id.startsWith('confirmed:') ? 'P1' : 'P2';
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

const CHAT_LORE_ENTRY_NAMES = new Set(['[手机通讯]私聊记录', '[手机通讯]伊甸住户群', '[手机情报]广播摘要']);

export function collectChatLoreContext(
  entries: readonly { name: string; content: string }[],
  characterBudget = 6_000,
): string {
  if (!Number.isSafeInteger(characterBudget) || characterBudget <= 0)
    throw new Error('ChatLore 字符预算必须是正安全整数');
  return entries
    .filter(entry => CHAT_LORE_ENTRY_NAMES.has(entry.name))
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
