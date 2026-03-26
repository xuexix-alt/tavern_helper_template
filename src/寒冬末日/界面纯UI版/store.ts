import { Schema } from '../schema';
import { autoReprocessWhenLatestMessageMutated, reprocessLatestMessageVariables } from '../mvu_reprocess';
import { getViewMessageState, onViewMessageChanged, resolveViewMessageId } from './viewMessage';
import { normalizeRoomTag, parseRoomTag } from '../util/room';

const RESERVED_TOP_LEVEL_KEYS = new Set(['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC']);

// 完整的初始默认值 - 使用 Schema.parse({}) 会自动应用所有 prefault
const initialData: z.output<typeof Schema> = Schema.parse({});

function readUiStoreDebugFlag(): boolean {
  try {
    const search = new URLSearchParams(window.location.search);
    if (search.has('dev') || search.has('debug')) return true;
  } catch {
    // ignore
  }

  try {
    const vars = typeof getVariables === 'function' ? (getVariables({ type: 'chat' }) ?? {}) : {};
    return (
      _.get(vars, 'eden.debug.ui_store', false) === true ||
      _.get(vars, 'ui_settings.debug_ui_store', false) === true ||
      _.get(vars, 'ui_settings.debug', false) === true
    );
  } catch {
    return false;
  }
}

function isObjectRecord(val: any): val is Record<string, any> {
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

function countRoleLikeEntries(statData: any): number {
  if (!isObjectRecord(statData)) return 0;
  let count = 0;

  for (const key of Object.keys(statData)) {
    if (RESERVED_TOP_LEVEL_KEYS.has(key)) continue;
    const role = statData[key];
    if (isObjectRecord(role) && '登场状态' in role && '健康' in role) {
      count += 1;
    }
  }

  const tempNpc = statData.临时NPC;
  if (isObjectRecord(tempNpc)) {
    for (const npcName of Object.keys(tempNpc)) {
      const role = tempNpc[npcName];
      if (isObjectRecord(role) && '登场状态' in role && '健康' in role) {
        count += 1;
      }
    }
  }

  return count;
}

export const useDataStore = defineStore(
  'data',
  errorCatched(() => {
    const isDebug = readUiStoreDebugFlag();
    let hasWarnedFallback = false;
    const viewMessageState = ref(getViewMessageState());
    let stopViewMessageChanged: (() => void) | null = null;

    // 使用完整初始值，而不是空对象
    const data = ref<z.output<typeof Schema>>(initialData);

    const read_stat_data_once = (
      target_message_id: number | 'latest',
      source: 'current' | 'latest',
    ): { ok: true; source: 'current' | 'latest'; data: z.output<typeof Schema> } | { ok: false; reason: string } => {
      try {
        const mvu_data = Mvu.getMvuData({ type: 'message', message_id: target_message_id });
        const raw_stat_data = _.get(mvu_data, 'stat_data', null);
        const isObjectLike =
          !!raw_stat_data &&
          typeof raw_stat_data === 'object' &&
          !Array.isArray(raw_stat_data) &&
          Object.keys(raw_stat_data).length > 0;

        if (!isObjectLike) {
          return { ok: false, reason: `${source}: missing_or_empty_stat_data` };
        }

        const parsed = Schema.safeParse(raw_stat_data);
        if (!parsed.success) {
          const sanitized = sanitizeStatDataForUi(raw_stat_data);
          const reparsed = Schema.safeParse(sanitized);
          if (reparsed.success) {
             
            console.warn?.('[eden/ui_store] sanitized invalid stat_data for UI rendering', {
              source,
              issue: parsed.error.issues[0]?.message ?? 'schema_parse_failed',
            });
            return { ok: true, source, data: reparsed.data };
          }

          const firstIssue = reparsed.error.issues[0] ?? parsed.error.issues[0];
          const issuePath = firstIssue?.path?.length ? firstIssue.path.join('.') : 'root';
          return { ok: false, reason: `${source}: ${issuePath} ${firstIssue?.message ?? 'schema_parse_failed'}` };
        }

        return { ok: true, source, data: parsed.data };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return { ok: false, reason: `${source}: ${reason}` };
      }
    };

    const resolveLatestAssistantMessageId = (): number | null => {
      try {
        const ctx = (window as any)?.SillyTavern?.getContext?.();
        const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
        for (let i = chat.length - 1; i >= 0; i -= 1) {
          const msg = chat[i];
          if (!msg || typeof msg !== 'object') continue;
          if ((msg as any).is_user === true) continue;
          if ((msg as any).is_system === true) continue;
          return i;
        }
      } catch {
        // ignore
      }
      return null;
    };

    const resolveTargetMessageId = (): number | 'latest' => {
      const resolved = Number(resolveViewMessageId({ preferHistory: true }));
      if (Number.isFinite(resolved) && resolved >= 0) return Math.trunc(resolved);

      const latestAssistantId = resolveLatestAssistantMessageId();
      if (latestAssistantId != null) return latestAssistantId;

      try {
        const lastId = typeof getLastMessageId === 'function' ? Number(getLastMessageId()) : NaN;
        if (Number.isFinite(lastId) && lastId >= 0) return Math.trunc(lastId);
      } catch {
        // ignore
      }

      return 'latest';
    };

    const resolve_stat_data = (): {
      data: z.output<typeof Schema>;
      source: 'current' | 'latest' | 'default';
      target: number | 'latest';
    } => {
      const target = resolveTargetMessageId();
      const current = read_stat_data_once(target, 'current');
      if (current.ok) {
        return { data: current.data, source: 'current', target };
      }

      const latest = read_stat_data_once('latest', 'latest');
      if (latest.ok) {
        if (!hasWarnedFallback) {
          hasWarnedFallback = true;
           
          console.warn?.('[eden/ui_store] current message has no valid stat_data, fallback to latest', {
            target_message_id: target,
            reason: current.reason,
          });
        }
        return { data: latest.data, source: 'latest', target };
      }

      if (!hasWarnedFallback) {
        hasWarnedFallback = true;
         
        console.warn?.('[eden/ui_store] failed to load stat_data from current/latest, fallback to defaults', {
          target_message_id: target,
          reason_current: current.reason,
          reason_latest: latest.reason,
        });
      }

      return { data: initialData, source: 'default', target };
    };

    const refresh_from_mvu = () => {
      const resolved = resolve_stat_data();
      const next = resolved.data;
      if (!_.isEqual(next, data.value)) {
        data.value = next;
        if (isDebug) {
           
          console.debug?.('[eden/ui_store] refreshed from MVU', {
            source: resolved.source,
            target_message_id: resolved.target,
            mode: viewMessageState.value.mode,
          });
        }
      }
    };

    // 等待 MVU 初始化后读取数据并注册事件
    (async () => {
      await waitGlobalInitialized('Mvu');

      if (isDebug) {
         
        console.debug?.('[eden/ui_store] MVU initialized; binding listeners');
      }

      refresh_from_mvu();

      eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables: any, variables_before_update: any) => {
        refresh_from_mvu();

        // 兜底：某些“重新处理变量”流程会导致整份角色结构被清空，检测到从有到无时强制按最新楼层重算一次。
        const beforeCount = countRoleLikeEntries(_.get(variables_before_update, 'stat_data', {}));
        const afterCount = countRoleLikeEntries(_.get(variables, 'stat_data', {}));
        if (beforeCount > 0 && afterCount === 0) {
          void reprocessLatestMessageVariables({
            allowHistory: true,
            force: true,
            refreshMessage: false,
          }).then(result => {
            if (result.status === 'applied') {
              refresh_from_mvu();
              if (isDebug) {
                 
                console.debug?.('[eden/ui_store] repaired empty-role collapse after VARIABLE_UPDATE_ENDED', {
                  message_id: result.message_id,
                });
              }
            }
          });
        }
      });
      eventOn(Mvu.events.VARIABLE_INITIALIZED, refresh_from_mvu);

      // 兼容：当外部通过 setChatMessages(refresh:'affected'|'all') 刷新楼层时，主动同步一次。
      if (typeof tavern_events !== 'undefined') {
        const onMessageMutated = (updated_message_id: number) => {
          refresh_from_mvu();
          void autoReprocessWhenLatestMessageMutated(updated_message_id).then(result => {
            if (result.status === 'applied') {
              refresh_from_mvu();
              if (isDebug) {
                 
                console.debug?.('[eden/ui_store] auto reprocessed latest message after mutation', {
                  message_id: result.message_id,
                });
              }
            }
          });
        };

        eventOn(tavern_events.MESSAGE_UPDATED as any, onMessageMutated as any);
        eventOn(tavern_events.MESSAGE_EDITED as any, onMessageMutated as any);
        eventOn(tavern_events.MESSAGE_SWIPED as any, onMessageMutated as any);

        eventOn(tavern_events.MESSAGE_RECEIVED as any, (_message_id: number) => {
          refresh_from_mvu();
        });
      }

      if (!stopViewMessageChanged) {
        stopViewMessageChanged = onViewMessageChanged(nextState => {
          viewMessageState.value = nextState;
          refresh_from_mvu();
        });
      }
    })();

    return { data, viewMessageState };
  }),
);
