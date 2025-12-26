import { Schema } from '../schema';

export const useDataStore = defineStore(
  'data',
  errorCatched(() => {
    const message_id = getCurrentMessageId();

    const data = ref(Schema.parse(_.get(getVariables({ type: 'message', message_id }), 'stat_data', {})));

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

// 获取店铺列表 (从当前楼层的 stat_data 中读取)
export function getShopList(): z.output<typeof Schema>['店铺列表'] {
  const store = useDataStore();
  return store.data.店铺列表;
}

// 响应式店铺列表 Store (简单包装)
export const useShopStore = defineStore('shop', () => {
  const dataStore = useDataStore();
  const shopList = computed({
    get: () => dataStore.data.店铺列表,
    set: val => {
      dataStore.data.店铺列表 = val;
    },
  });

  return { shopList };
});
