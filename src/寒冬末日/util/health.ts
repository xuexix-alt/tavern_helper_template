export type HealthRules = {
  decayPer6h: number;
  recoverPer12h: number;
  decayMultiplier: number;
  recoverMultiplier: number;
};

export type OffstageHealthContext = {
  worldModeId?: string;
  daysSinceDisaster?: number;
};

/** 一轮跨越灾变时，只结算灾变起至当前时刻，避免把灾前数周一次性补扣。 */
export function capOffstageHoursAtDisaster(
  deltaHours: number | null,
  previousDay: unknown,
  currentDay: unknown,
  currentMinutes: number | null,
): number | null {
  if (
    deltaHours === null ||
    typeof previousDay !== 'number' ||
    !Number.isFinite(previousDay) ||
    previousDay >= 0 ||
    typeof currentDay !== 'number' ||
    !Number.isFinite(currentDay) ||
    currentDay < 0
  )
    return deltaHours;
  if (currentMinutes === null || !Number.isFinite(currentMinutes) || currentMinutes < 0 || currentMinutes >= 1440)
    return 0;
  return Math.min(deltaHours, Math.max(0, Math.floor(currentDay) * 24 + currentMinutes / 60));
}

export function clampHealth(v: number): number {
  return _.clamp(Number(v) || 0, 0, 100);
}

export function healthCondition(health: number): string {
  const h = clampHealth(health);
  if (h <= 0) return '死亡';
  if (h < 30) return '重病/濒死';
  if (h < 60) return '生病/受伤';
  if (h < 80) return '亚健康';
  return '健康';
}

export function computeOffstageHealthDelta(
  deltaHours: number,
  sheltered: boolean,
  rules: HealthRules,
  context: OffstageHealthContext = {},
): { delta: number; reason: string } {
  const dh = Number(deltaHours);
  if (!Number.isFinite(dh) || dh <= 0) return { delta: 0, reason: '0, 无变化' };

  // 末日天数才是当前剧情阶段；A档存档进入灾后也应恢复正常结算。
  // 旧存档缺少有效天数时，才使用A档开局作为灾前兜底。
  const days = context.daysSinceDisaster;
  const hasDisasterDay = typeof days === 'number' && Number.isFinite(days);
  const isPreDisaster = hasDisasterDay
    ? days < 0
    : String(context.worldModeId ?? '')
        .trim()
        .toUpperCase() === 'A';
  if (isPreDisaster) return { delta: 0, reason: '0, 无变化' };

  const decayPer6h = Math.max(0, Number(rules.decayPer6h) || 0);
  const recoverPer12h = Math.max(0, Number(rules.recoverPer12h) || 0);
  const decayMultiplier = Math.max(0, Number(rules.decayMultiplier) || 0);
  const recoverMultiplier = Math.max(0, Number(rules.recoverMultiplier) || 0);

  if (sheltered) {
    const steps = Math.floor(dh / 12);
    const delta = Math.floor(steps * recoverPer12h * recoverMultiplier);
    if (!delta) return { delta: 0, reason: '0, 无变化' };
    return { delta, reason: `+${delta}, 离场受庇护休整` };
  }

  const steps = Math.floor(dh / 6);
  const delta = -Math.floor(steps * decayPer6h * decayMultiplier);
  if (!delta) return { delta: 0, reason: '0, 无变化' };
  return { delta, reason: `${delta}, 离场未受庇护自然衰减` };
}
