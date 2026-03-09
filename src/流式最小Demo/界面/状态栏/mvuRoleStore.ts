import { Schema } from '../../../寒冬末日/schema';
import { normalizeRoomTag, parseRoomTag } from '../../../寒冬末日/util/room';

type SchemaType = z.output<typeof Schema>;
type RoleLike = SchemaType[string & keyof SchemaType] | Record<string, any>;

const RESERVED_TOP_LEVEL_KEYS = new Set(['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC']);
const initialData: SchemaType = Schema.parse({});

function isObjectRecord(val: unknown): val is Record<string, any> {
  return !!val && typeof val === 'object' && !Array.isArray(val);
}

function sanitizeRoleObjectInPlace(role: any) {
  if (!isObjectRecord(role)) return;
  const roomRaw = String(_.get(role, '所在房间', '') ?? '');
  const normalized = normalizeRoomTag(roomRaw);
  _.set(role, '所在房间', parseRoomTag(normalized).kind === 'none' ? '' : normalized);
}

function sanitizeStatDataForUi(raw: any): Record<string, any> {
  if (!isObjectRecord(raw)) return {};
  const next = _.cloneDeep(raw) as Record<string, any>;

  for (const key of Object.keys(next)) {
    const val = next[key];
    if (RESERVED_TOP_LEVEL_KEYS.has(key)) {
      if (key === '临时NPC') {
        if (!isObjectRecord(val)) {
          next[key] = {};
          continue;
        }
        for (const npcName of Object.keys(val)) {
          if (!isObjectRecord(val[npcName])) {
            delete val[npcName];
            continue;
          }
          sanitizeRoleObjectInPlace(val[npcName]);
        }
      } else if (!isObjectRecord(val)) {
        next[key] = {};
      }
      continue;
    }

    if (!isObjectRecord(val)) {
      delete next[key];
      continue;
    }
    sanitizeRoleObjectInPlace(val);
  }

  return next;
}

function readMvuStatData(messageId: number | 'latest'): { ok: true; data: SchemaType } | { ok: false } {
  try {
    const mvuData = Mvu.getMvuData({ type: 'message', message_id: messageId });
    const statData = sanitizeStatDataForUi(_.get(mvuData, 'stat_data', {}));
    const result = Schema.safeParse(statData);
    if (result.success) {
      return { ok: true, data: result.data };
    }
  } catch {
    // ignore
  }
  return { ok: false };
}

function resolveTargetMessageId(rawTarget: number | null | undefined): number | 'latest' {
  const numeric = Number(rawTarget);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.trunc(numeric);
  return 'latest';
}

export function useMvuRoleStore(targetMessageId: Ref<number | null | undefined>) {
  const data = ref<SchemaType>(initialData);
  const ready = ref(false);
  const source = ref<'current' | 'latest' | 'default'>('default');
  const resolvedMessageId = ref<number | 'latest'>('latest');
  const isDuringExtraAnalysis = ref(false);

  function refresh() {
    const target = resolveTargetMessageId(targetMessageId.value);
    resolvedMessageId.value = target;

    const current = readMvuStatData(target);
    if (current.ok) {
      data.value = current.data;
      source.value = 'current';
      ready.value = true;
    } else {
      const latest = readMvuStatData('latest');
      if (latest.ok) {
        data.value = latest.data;
        source.value = 'latest';
        ready.value = true;
      } else {
        data.value = initialData;
        source.value = 'default';
        ready.value = false;
      }
    }

    try {
      isDuringExtraAnalysis.value =
        (typeof Mvu?.isDuringExtraAnalysis === 'function' && Mvu.isDuringExtraAnalysis() === true) ||
        _.get(getVariables({ type: 'global' }) ?? {}, 'extra_analysis', false) === true;
    } catch {
      isDuringExtraAnalysis.value = false;
    }
  }

  const mainRoleEntries = computed(() =>
    Object.entries(data.value)
      .filter(([key, value]) => !RESERVED_TOP_LEVEL_KEYS.has(key) && isObjectRecord(value))
      .map(([key, value]) => ({ key, role: value as RoleLike }))
      .sort((a, b) => {
        const aActive = String((a.role as any)?.登场状态 ?? '').trim() === '登场' ? 0 : 1;
        const bActive = String((b.role as any)?.登场状态 ?? '').trim() === '登场' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const aName = String((a.role as any)?.姓名 ?? a.key ?? '').trim() || String(a.key);
        const bName = String((b.role as any)?.姓名 ?? b.key ?? '').trim() || String(b.key);
        return aName.localeCompare(bName, 'zh-Hans-CN');
      }),
  );

  const tempNpcEntries = computed(() => {
    const tempNpc = _.get(data.value, '临时NPC', {});
    if (!isObjectRecord(tempNpc)) return [] as Array<{ key: string; role: RoleLike }>;
    return Object.entries(tempNpc)
      .filter(([, value]) => isObjectRecord(value))
      .map(([key, value]) => ({ key, role: value as RoleLike }))
      .sort((a, b) => String(a.key).localeCompare(String(b.key), 'zh-Hans-CN'));
  });

  const hasAnyRole = computed(() => mainRoleEntries.value.length > 0 || tempNpcEntries.value.length > 0);

  onMounted(() => {
    (async () => {
      await waitGlobalInitialized('Mvu');
      refresh();

      eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, refresh);
      eventOn(Mvu.events.VARIABLE_INITIALIZED, refresh);

      if (typeof tavern_events !== 'undefined') {
        eventOn(tavern_events.MESSAGE_RECEIVED as any, refresh as any);
        eventOn(tavern_events.MESSAGE_UPDATED as any, refresh as any);
        eventOn(tavern_events.MESSAGE_EDITED as any, refresh as any);
        eventOn(tavern_events.MESSAGE_SWIPED as any, refresh as any);
      }
    })();
  });

  watch(targetMessageId, refresh);

  return {
    data,
    ready,
    source,
    resolvedMessageId,
    isDuringExtraAnalysis,
    hasAnyRole,
    mainRoleEntries,
    tempNpcEntries,
    refresh,
  };
}
