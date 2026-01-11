import { z } from 'zod';
import { watch } from 'vue';
import { useDataStore } from '../store';
import { CHAT_VAR_KEYS } from '../outbound';

import shelterBlueprintRaw from '../../世界书/寒冬末日/庇护所升级能力.txt?raw';

type Ability = { name: string; desc: string };

const ShelterUpgradeStateSchema = z
  .object({
    last_roll_date: z.string().prefault(''),
    days_since_upgrade: z.coerce.number().prefault(0),
  })
  .prefault({
    last_roll_date: '',
    days_since_upgrade: 0,
  });

function clampLevel(level: number): number {
  return _.clamp(Number(level) || 1, 1, 10);
}

function parseDaysSinceUpgrade(distanceText: any): number {
  const s = String(distanceText ?? '').trim();
  const m = s.match(/^(\d+)\s*天/);
  if (!m) return 0;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function formatDistanceText(daysSinceUpgrade: number): string {
  const days = Math.max(0, Math.floor(daysSinceUpgrade));
  const remaining = Math.max(0, 7 - days);
  return `${days}天 | 剩余保底升级天数：${remaining}天`;
}

function formatRollText(roll: number | null, upgraded: boolean, reason?: string): string {
  if (reason === 'guarantee') return '今日已投掷: 保底升级！';
  const r = typeof roll === 'number' && Number.isFinite(roll) ? Math.floor(roll) : 0;
  return `今日已投掷: ${r}点 (${upgraded ? '触发幸运升级！' : '未升级'})`;
}

function parseShelterAbilitiesByLevel(raw: string): Record<number, Ability[]> {
  const out: Record<number, Ability[]> = {};
  const parts = String(raw ?? '').split(/###\s*庇护所等级\s*(\d+)\s*:/g);
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const level = Number(parts[i]);
    const section = String(parts[i + 1] ?? '');
    if (!Number.isFinite(level)) continue;

    const lines = section.split(/\r?\n/);
    const abilities: Ability[] = [];

    let curName: string | null = null;
    let curDesc: string[] = [];
    let inDesc = false;

    const commit = () => {
      if (!curName) return;
      const desc = curDesc
        .map(x => String(x ?? '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      abilities.push({ name: curName.trim(), desc });
      curName = null;
      curDesc = [];
      inDesc = false;
    };

    const looksLikeAbilityName = (line: string) => {
      const t = line.trim();
      if (!t) return false;
      // 能力名在蓝图中均以 emoji 开头；描述换行通常以中文开头，避免误判为“新能力”
      try {
        if (!/^\p{Extended_Pictographic}/u.test(t)) return false;
      } catch {
        // fallback：不支持 Unicode 属性转义时，退化为“常见图标前缀”判断
        if (!/^[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(t)) return false;
      }
      if (t.startsWith('#') || t.startsWith('<')) return false;
      if (t.startsWith('---')) return false;
      if (t.startsWith('简介')) return false;
      if (t.startsWith('-')) return false;
      return true;
    };

    for (const lineRaw of lines) {
      const line = String(lineRaw ?? '').trimEnd();
      const t = line.trim();
      if (!t) {
        if (inDesc) curDesc.push('');
        continue;
      }
      if (t.startsWith('---')) {
        if (curName) commit();
        continue;
      }

      const descMatch = t.match(/^简介[:：]\s*(.*)$/);
      if (descMatch && curName) {
        inDesc = true;
        curDesc.push(descMatch[1] ?? '');
        continue;
      }

      if (looksLikeAbilityName(t)) {
        if (curName) commit();
        curName = t;
        curDesc = [];
        inDesc = false;
        continue;
      }

      if (inDesc && curName) {
        curDesc.push(t);
      }
    }
    if (curName) commit();

    if (abilities.length > 0) out[level] = abilities;
  }
  return out;
}

const __shelterAbilitiesByLevel = parseShelterAbilitiesByLevel(shelterBlueprintRaw);

function applyShelterUpgradeRewards(stat_data: any, level: number) {
  const lv = clampLevel(level);

  const abilityRecord = _.get(stat_data, ['庇护所', '庇护所能力'], {});
  if (!abilityRecord || typeof abilityRecord !== 'object') _.set(stat_data, ['庇护所', '庇护所能力'], {});

  const merged: Record<string, { desc: string }> = { ...(_.get(stat_data, ['庇护所', '庇护所能力']) ?? {}) };
  for (let i = 1; i <= lv; i++) {
    for (const ab of __shelterAbilitiesByLevel[i] ?? []) {
      const existing = merged[ab.name];
      if (!existing) {
        merged[ab.name] = { desc: ab.desc };
        continue;
      }
      const oldDesc = String((existing as any)?.desc ?? '').trim();
      if (!oldDesc && ab.desc) merged[ab.name] = { desc: ab.desc };
    }
  }
  _.set(stat_data, ['庇护所', '庇护所能力'], merged);

  // 可扩展区域：只按“明确等级解锁”的部分做同步，避免覆盖任务解锁逻辑
  const med = lv >= 9 ? '专家级自动医师' : lv >= 6 ? '外科手术台' : lv >= 3 ? '初级医疗舱' : '未解锁';
  _.set(stat_data, ['庇护所', '可扩展区域', '医疗翼'], med);

  if (lv >= 7) {
    const cur = String(_.get(stat_data, ['庇护所', '可扩展区域', '载具格纳库'], '') ?? '');
    if (!cur || cur === '未解锁') _.set(stat_data, ['庇护所', '可扩展区域', '载具格纳库'], '先驱者制造单元');
  }
}

async function readShelterUpgradeState(): Promise<z.output<typeof ShelterUpgradeStateSchema>> {
  try {
    const vars = (typeof getVariables === 'function' ? getVariables({ type: 'chat' }) : {}) ?? {};
    const raw = _.get(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, {});
    return ShelterUpgradeStateSchema.parse(raw);
  } catch {
    return ShelterUpgradeStateSchema.parse({});
  }
}

function writeShelterUpgradeState(next: z.output<typeof ShelterUpgradeStateSchema>) {
  if (typeof updateVariablesWith !== 'function') return;
  updateVariablesWith(
    vars => {
      _.set(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, next);
      return vars;
    },
    { type: 'chat' },
  );
}

export function useShelterDailyRoll() {
  const store = useDataStore();

  let inFlight = false;

  watch(
    () => store.data.世界.日期,
    async date => {
      const today = String(date ?? '').trim();
      if (!today) return;
      if (inFlight) return;
      inFlight = true;
      try {
        const state = await readShelterUpgradeState();

        // 首次进入：只做“对齐/建档”，避免一加载 UI 就立刻 roll
        if (!state.last_roll_date) {
          const seededDays = parseDaysSinceUpgrade(store.data.庇护所.距离上次升级);
          writeShelterUpgradeState({ last_roll_date: today, days_since_upgrade: seededDays });
          return;
        }

        if (state.last_roll_date === today) return;

        await waitGlobalInitialized('Mvu');
        const message_id = getCurrentMessageId();
        const mvu_data = Mvu.getMvuData({ type: 'message', message_id });
        const stat_data = _.get(mvu_data, 'stat_data', {});
        if (!stat_data || typeof stat_data !== 'object') _.set(mvu_data, 'stat_data', {});

        const currentLevel = clampLevel(_.get(stat_data, ['庇护所', '庇护所等级'], store.data.庇护所.庇护所等级));

        // 以 chat 变量为单一真源（不受楼层删除影响）；必要时用 stat_data 文本兜底
        const daysSinceUpgrade = Number.isFinite(state.days_since_upgrade)
          ? Math.max(0, Math.floor(state.days_since_upgrade))
          : parseDaysSinceUpgrade(_.get(stat_data, ['庇护所', '距离上次升级'], store.data.庇护所.距离上次升级));

        const isGuarantee = daysSinceUpgrade >= 7;
        const roll = isGuarantee ? null : Math.floor(Math.random() * 11);
        const isLucky = roll === 7 || roll === 10;
        const upgraded = isGuarantee || isLucky;

        const nextLevel = upgraded ? clampLevel(currentLevel + 1) : currentLevel;
        const nextDays = upgraded ? 0 : daysSinceUpgrade + 1;

        _.set(
          mvu_data,
          ['stat_data', '庇护所', '今日投掷点数'],
          formatRollText(roll, upgraded, isGuarantee ? 'guarantee' : undefined),
        );
        _.set(mvu_data, ['stat_data', '庇护所', '距离上次升级'], formatDistanceText(nextDays));

        const didLevelUp = upgraded && nextLevel !== currentLevel;
        if (didLevelUp) {
          _.set(mvu_data, ['stat_data', '庇护所', '庇护所等级'], nextLevel);
          applyShelterUpgradeRewards(_.get(mvu_data, 'stat_data', {}), nextLevel);
        }

        await Mvu.replaceMvuData(mvu_data, { type: 'message', message_id });

        if (didLevelUp) {
          toastr?.success?.('本日roll点成功，庇护所已升级！');
        }

        writeShelterUpgradeState({ last_roll_date: today, days_since_upgrade: nextDays });
      } catch (e) {
        console.error('[eden/shelter_daily_roll] failed', e);
      } finally {
        inFlight = false;
      }
    },
    { immediate: true },
  );
}
