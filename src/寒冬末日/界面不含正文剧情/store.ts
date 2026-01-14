import { Schema } from '../schema';

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
    const message_id = getCurrentMessageId();
    const isDebug = readUiStoreDebugFlag();

    // 使用完整初始值，而不是空对象
    const data = ref<z.output<typeof Schema>>(initialData);

    const read_stat_data = () => {
      const mvu_data = Mvu.getMvuData({ type: 'message', message_id });
      return Schema.parse(_.get(mvu_data, 'stat_data', {}));
    };

    const refresh_from_mvu = () => {
      try {
        const next = read_stat_data();
        if (!_.isEqual(next, data.value)) {
          data.value = next;
          if (isDebug) {
            // eslint-disable-next-line no-console
            console.debug?.('[eden/ui_store] refreshed from MVU', { message_id });
          }
        }
      } catch (err) {
        if (isDebug) {
          const reason = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.warn?.('[eden/ui_store] failed to refresh from MVU', { message_id, reason });
        }
      }
    };

    // 等待 MVU 初始化后读取数据并注册事件
    (async () => {
      await waitGlobalInitialized('Mvu');

      if (isDebug) {
        // eslint-disable-next-line no-console
        console.debug?.('[eden/ui_store] MVU initialized; binding listeners', { message_id });
      }

      refresh_from_mvu();

      eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, refresh_from_mvu);
      eventOn(Mvu.events.VARIABLE_INITIALIZED, refresh_from_mvu);
    })();

    return { data };
  }),
);
