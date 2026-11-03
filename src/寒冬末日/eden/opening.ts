import type { PartialDeep } from 'type-fest';
import { createOpeningEdenDocument, EdenOpeningConfigSchema, type EdenOpeningConfig } from './openingConfig';
import { saveEdenDocument, type EdenWorldbookDeps, type SavedEden } from './worldbook';
import { EdenDocumentSchema, type EdenDocument } from './model';

export interface EdenOpeningSaveDeps extends EdenWorldbookDeps {
  assertUnstarted(): void;
  synchronize(saved: SavedEden, startDay: number): Promise<void>;
}

export class EdenOpeningSyncError extends Error {
  constructor(
    public readonly saved: SavedEden,
    cause: unknown,
  ) {
    super(
      `世界书已保存，初始化同步未完成：${cause instanceof Error ? cause.message : String(cause)}。可重试，不会重新计时。`,
    );
  }
}

export async function confirmEdenOpening(
  input: {
    chatId: string;
    config: EdenOpeningConfig;
    existingDocument?: EdenDocument;
    missionLore: string;
    technologyLore: string;
    openingEntry: PartialDeep<WorldbookEntry>;
    expectedRevision: number;
    expectedWorldbookName: string | null;
  },
  deps: EdenOpeningSaveDeps,
): Promise<SavedEden> {
  deps.assertUnstarted();
  const config = EdenOpeningConfigSchema.parse(input.config);
  const fresh = createOpeningEdenDocument(config, input.missionLore, input.technologyLore);
  const document = input.existingDocument
    ? EdenDocumentSchema.parse({
        ...fresh,
        rescueStartDay: input.existingDocument.rescueStartDay,
        achievements: input.existingDocument.achievements,
      })
    : fresh;
  const bytes = new TextEncoder().encode(JSON.stringify({ config, content: input.openingEntry.content }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  document.openingSetup = { fingerprint, startDay: config.startDay };
  deps.assertUnstarted();
  const saved = await saveEdenDocument(
    input.chatId,
    document,
    input.expectedRevision,
    { day: config.startDay, messageId: 0, anchors: {} },
    deps,
    input.expectedWorldbookName,
    { openingEntry: input.openingEntry, assertCanSave: () => deps.assertUnstarted() },
  );
  try {
    deps.assertUnstarted();
    await deps.synchronize(saved, config.startDay);
    deps.assertUnstarted();
  } catch (error) {
    throw new EdenOpeningSyncError(saved, error);
  }
  return saved;
}
