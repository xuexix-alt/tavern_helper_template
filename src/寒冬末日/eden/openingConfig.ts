import { z } from 'zod';
import { EdenDocumentSchema, type EdenDocument } from './model';

export const EdenOpeningConfigSchema = EdenDocumentSchema.pick({
  level: true,
  levelNames: true,
  status: true,
  rooms: true,
  abilities: true,
  initialTechnologies: true,
}).extend({ startDay: z.number().finite().int() });
export type EdenOpeningConfig = z.infer<typeof EdenOpeningConfigSchema>;
export function toEdenOpeningConfig(document: EdenDocument, startDay: number): EdenOpeningConfig {
  return EdenOpeningConfigSchema.parse({ ...document, startDay });
}
export function createOpeningEdenDocument(
  config: EdenOpeningConfig,
  missionLore: string,
  technologyLore: string,
): EdenDocument {
  const { startDay, ...settings } = EdenOpeningConfigSchema.parse(config);
  return EdenDocumentSchema.parse({
    ...settings,
    version: 1,
    revision: 0,
    savedAt: '',
    achievements: {},
    rescueStartDay: Math.max(0, startDay),
    missionLore,
    technologyLore,
  });
}
export function defaultEdenOpeningStartDay(worldModeId: string): number {
  return worldModeId === 'A' ? -90 : 372;
}
export function defaultEdenOpeningTime(worldModeId: string): string {
  return worldModeId === 'A' ? '公元2026年9月14日·14:00' : '公元2027年12月21日·14:00';
}
