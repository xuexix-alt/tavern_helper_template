import { Schema } from '../schema';

export const useDataStore = defineStore(
  'data',
  errorCatched(() => {
    const message_id = getCurrentMessageId();

    const read_stat_data = () => {
      const mvu_data = Mvu.getMvuData({ type: 'message', message_id });
      return Schema.parse(_.get(mvu_data, 'stat_data', {}));
    };

    const data = ref(read_stat_data());

    const refresh_from_mvu = () => {
      try {
        const next = read_stat_data();
        if (!_.isEqual(next, data.value)) data.value = next;
      } catch {
        // ignore
      }
    };

    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, refresh_from_mvu);
    eventOn(Mvu.events.VARIABLE_INITIALIZED, refresh_from_mvu);

    watchDebounced(
      data,
      new_data => {
        const parsed = Schema.parse(new_data);
        if (!_.isEqual(parsed, new_data)) {
          data.value = parsed;
        }

        updateVariablesWith(
          variables => {
            _.set(variables, 'stat_data', parsed);
            return variables;
          },
          { type: 'message', message_id },
        );
      },
      { deep: true, debounce: 500 },
    );

    return { data };
  }),
);

