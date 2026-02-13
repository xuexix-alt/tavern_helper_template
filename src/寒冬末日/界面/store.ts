import { Schema } from '../schema';
import { getViewMessageState, onViewMessageChanged } from './viewMessage';

const ROLE_SELECTOR_UPDATED_EVENT = 'eden.role_selector.updated';

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
          const firstIssue = parsed.error.issues[0];
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
      const mode = viewMessageState.value.mode;
      const selectedId = Number(viewMessageState.value.message_id);
      if (mode === 'history' && Number.isFinite(selectedId) && selectedId >= 0) {
        return Math.trunc(selectedId);
      }

      const latestAssistantId = resolveLatestAssistantMessageId();
      if (latestAssistantId != null) return latestAssistantId;

      try {
        const lastId = typeof getLastMessageId === 'function' ? Number(getLastMessageId()) : NaN;
        if (Number.isFinite(lastId) && lastId >= 0) return Math.trunc(lastId);
      } catch {
        // ignore
      }

      try {
        const currentId = Number(getCurrentMessageId?.());
        if (Number.isFinite(currentId) && currentId >= 0) return Math.trunc(currentId);
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
          // eslint-disable-next-line no-console
          console.warn?.('[eden/ui_store] current message has no valid stat_data, fallback to latest', {
            target_message_id: target,
            reason: current.reason,
          });
        }
        return { data: latest.data, source: 'latest', target };
      }

      if (!hasWarnedFallback) {
        hasWarnedFallback = true;
        // eslint-disable-next-line no-console
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
          // eslint-disable-next-line no-console
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
        // eslint-disable-next-line no-console
        console.debug?.('[eden/ui_store] MVU initialized; binding listeners');
      }

      refresh_from_mvu();

      eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, refresh_from_mvu);
      eventOn(Mvu.events.VARIABLE_INITIALIZED, refresh_from_mvu);

      // 角色选择器保存后会主动广播该事件，避免必须手动重载 UI。
      eventOn(ROLE_SELECTOR_UPDATED_EVENT as any, refresh_from_mvu);

      // 兼容：当外部通过 setChatMessages(refresh:'affected'|'all') 刷新楼层时，主动同步一次。
      if (typeof tavern_events !== 'undefined') {
        eventOn(tavern_events.MESSAGE_UPDATED as any, (_updated_message_id: number) => {
          refresh_from_mvu();
        });
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
