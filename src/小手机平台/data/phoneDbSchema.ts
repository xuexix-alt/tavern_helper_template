import { z } from 'zod';

import type { PhoneBusinessRecord, PhoneBusinessStore, PhoneMessage } from './phoneDb';
import { PHONE_BUSINESS_STORES } from './phoneDb';

/**
 * PhoneDB 数据边界的 zod schema。
 * zod 的 object 解析默认剥离未知键——与响应解析器同哲学：导入侧宽容（剥离+跳过坏条目），
 * 但结构校验从严（类型/条件规则不满足的条目跳过并报告，不给脏数据进库的机会）。
 */

export const PHONE_EXPORT_VERSION = 1;

const messageTypeSchema = z.enum(['private', 'group', 'broadcast']);
const trustSchema = z.enum(['confirmed', 'unverified']);

/** 消息结构：与 validateMessage 的规则一致，解析时剥离未知键 */
export const phoneMessageSchema = z
  .object({
    id: z.string().min(1),
    sessionKey: z.string().min(1),
    conversationId: z.string().min(1),
    type: messageTypeSchema,
    sender: z.string().min(1),
    content: z.string(),
    createdAt: z.number().finite(),
    groupName: z.string().optional(),
    participants: z.array(z.string()).optional(),
    gameDate: z.string().optional(),
    gameTime: z.string().optional(),
    source: z.string().optional(),
    trust: trustSchema.optional(),
    syncedToLore: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'group' && (value.groupName !== undefined || value.participants !== undefined)) {
      ctx.addIssue({ code: 'custom', message: '群名和参与者只能用于 group 消息' });
    }
    if (value.type !== 'broadcast' && (value.source !== undefined || value.trust !== undefined)) {
      ctx.addIssue({ code: 'custom', message: 'source 和 trust 只能用于 broadcast 消息' });
    }
    if (value.type === 'broadcast' && !value.source?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'broadcast source（来源）不能为空' });
    }
    if (value.type === 'broadcast' && value.trust === undefined) {
      ctx.addIssue({ code: 'custom', message: 'broadcast trust（可信度）不能为空' });
    }
  });

/** 业务记录结构：id/sessionKey 之外的字段各 store 自定义，宽松透传 */
export const phoneBusinessRecordSchema = z.object({
  id: z.string().min(1),
  sessionKey: z.string().min(1),
});

/** 导出包：单会话全量（消息 + 各业务 store 记录） */
export const phoneExportBundleSchema = z.object({
  version: z.literal(PHONE_EXPORT_VERSION),
  kind: z.literal('phone-session-export'),
  exportedAt: z.number().finite(),
  sessionKey: z.string().min(1),
  messages: z.array(z.unknown()),
  records: z.record(z.string(), z.array(z.unknown())),
});

export type PhoneExportBundleInput = z.infer<typeof phoneExportBundleSchema>;

/** 校验通过的导出包：消息已剥离未知键并通过条件校验 */
export interface PhoneExportBundle {
  version: typeof PHONE_EXPORT_VERSION;
  kind: 'phone-session-export';
  exportedAt: number;
  sessionKey: string;
  messages: readonly PhoneMessage[];
  records: Partial<Record<PhoneBusinessStore, readonly PhoneBusinessRecord[]>>;
}

/** 与 phoneDb.containsApiKey 相同的密钥扫描，独立导出供导入路径复用 */
export function containsApiKey(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(
    ([key, nested]) => /^api[_-]?key$/i.test(key) || /api\s+key/i.test(key) || containsApiKey(nested, seen),
  );
}

export interface SkippedEntry {
  store: string;
  id?: string;
  reason: string;
}

export interface ParsedBundleReport {
  bundle: PhoneExportBundle;
  skipped: readonly SkippedEntry[];
}

export function bundleParseError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * 解析导出包（宽容模式）：结构性错误（版本/类型/会话键）整体拒绝；
 * 单条消息/记录结构不符或含 API key 则跳过并记录原因，其余照常导入。
 */
export function parsePhoneExportBundle(input: unknown): ParsedBundleReport {
  const bundle = phoneExportBundleSchema.parse(input);
  const skipped: SkippedEntry[] = [];

  const messages: PhoneMessage[] = [];
  for (const [index, raw] of bundle.messages.entries()) {
    const parsed = phoneMessageSchema.safeParse(raw);
    if (!parsed.success) {
      // 结构 parse 失败时尽量回取原 id，便于排查；取不到则用序号
      const rawId = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : `#${index}`;
      skipped.push({ store: 'messages', id: rawId, reason: bundleParseError(parsed.error) });
      continue;
    }
    if (parsed.data.sessionKey !== bundle.sessionKey) {
      skipped.push({ store: 'messages', id: parsed.data.id, reason: 'sessionKey 与导出包声明不一致' });
      continue;
    }
    // 密钥扫描必须检查原始输入：zod 剥离未知键后 parsed.data 里已看不到被剥掉的密钥字段
    if (containsApiKey(raw)) {
      skipped.push({ store: 'messages', id: parsed.data.id, reason: '不得包含 API key' });
      continue;
    }
    messages.push({ ...parsed.data, syncedToLore: parsed.data.syncedToLore ?? false });
  }

  const records: PhoneExportBundle['records'] = {};
  for (const [storeName, rawList] of Object.entries(bundle.records)) {
    if (!(PHONE_BUSINESS_STORES as readonly string[]).includes(storeName)) {
      skipped.push({ store: storeName, reason: '未知 store，整组跳过' });
      continue;
    }
    const store = storeName as PhoneBusinessStore;
    const parsedList: PhoneBusinessRecord[] = [];
    for (const [index, raw] of rawList.entries()) {
      const parsed = phoneBusinessRecordSchema.safeParse(raw);
      if (!parsed.success) {
        const rawId = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : `#${index}`;
        skipped.push({ store: storeName, id: rawId, reason: bundleParseError(parsed.error) });
        continue;
      }
      if (parsed.data.sessionKey !== bundle.sessionKey) {
        skipped.push({ store: storeName, id: parsed.data.id, reason: 'sessionKey 与导出包声明不一致' });
        continue;
      }
      if (containsApiKey(raw)) {
        skipped.push({ store: storeName, id: parsed.data.id, reason: '不得包含 API key' });
        continue;
      }
      // 原样保留自定义字段（已在 containsApiKey 扫描中确认无密钥）
      parsedList.push(structuredClone(raw) as PhoneBusinessRecord);
    }
    if (parsedList.length > 0) records[store] = parsedList;
  }

  return { bundle: { ...bundle, messages, records }, skipped };
}

/** 组装导出包（结构化克隆副本，调用方可安全 JSON.stringify） */
export function buildPhoneExportBundle(input: {
  sessionKey: string;
  messages: readonly PhoneMessage[];
  records: Partial<Record<PhoneBusinessStore, readonly PhoneBusinessRecord[]>>;
}): PhoneExportBundle {
  return structuredClone({
    version: PHONE_EXPORT_VERSION,
    kind: 'phone-session-export',
    exportedAt: Date.now(),
    sessionKey: input.sessionKey,
    messages: input.messages,
    records: input.records,
  });
}
