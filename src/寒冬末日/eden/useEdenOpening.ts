import { cloneDeep } from 'lodash';
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { OpeningPayload } from '../界面同层版/shared/opening.schema';
import type { RuntimeOpeningPreset } from '../界面同层版/shared/runtimeOpeningPreset.schema';
import { buildRuntimeOpeningWorldbookEntry } from '../same-layer-pre/界面/状态栏/runtimeOpeningWorldbookSync';
import missionLore from '../世界书/寒冬末日/末日救亡任务.txt?raw';
import technologyLore from '../世界书/寒冬末日/伊甸技术.txt?raw';
import { createDefaultEdenDocument } from './defaults';
import { describeEden, projectEdenToMvu, type EdenDocument } from './model';
import { confirmEdenOpening, EdenOpeningSyncError } from './opening';
import {
  createOpeningEdenDocument,
  EdenOpeningConfigSchema,
  toEdenOpeningConfig,
  type EdenOpeningConfig,
  defaultEdenOpeningStartDay,
} from './openingConfig';
import { currentEdenChatId, getEdenHostDeps, notifyEdenSaved, readEdenContext } from './runtime';
import { loadEdenDocument, type SavedEden } from './worldbook';

const DRAFT_PATH = 'stream_demo.opening_eden_draft';

export function useEdenOpening(input: {
  enabled: Ref<boolean>;
  worldModeId: Ref<string>;
  payload: Ref<OpeningPayload>;
  hasStory: Ref<boolean>;
  buildPreset(): RuntimeOpeningPreset;
}) {
  const startDay = ref(defaultEdenOpeningStartDay(input.worldModeId.value));
  const draft = ref<EdenDocument>(createDefaultEdenDocument({ missionLore, technologyLore, startDay: startDay.value }));
  const loaded = ref<SavedEden | null>(null);
  const loading = ref(false);
  const error = ref('');
  const notice = ref('');
  let chatId = currentEdenChatId();
  let binding: string | null = null;
  let epoch = 0;
  let dayEdited = false;
  let listener: { stop(): void } | undefined;

  async function load() {
    const token = ++epoch;
    if (!input.enabled.value) {
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = '';
    notice.value = '';
    chatId = currentEdenChatId();
    try {
      const deps = getEdenHostDeps();
      const expectedBinding = deps.boundWorldbook();
      const formal = await loadEdenDocument(chatId, deps);
      if (token !== epoch) return;
      if (deps.boundWorldbook() !== expectedBinding) throw new Error('聊天世界书绑定已改变，请重新读取');
      binding = expectedBinding;
      loaded.value = formal;
      const rawDraft = _.get(getVariables({ type: 'chat' }), DRAFT_PATH);
      const persisted = EdenOpeningConfigSchema.safeParse(rawDraft?.config ?? rawDraft);
      const matchesFormal =
        persisted.success &&
        rawDraft?.baseRevision === (formal?.document.revision ?? 0) &&
        rawDraft?.worldbookName === expectedBinding;
      const defaultDay = defaultEdenOpeningStartDay(input.worldModeId.value);
      if (matchesFormal && !input.hasStory.value) {
        startDay.value = persisted.data.startDay;
        const restored = createOpeningEdenDocument(persisted.data, missionLore, technologyLore);
        draft.value = formal
          ? { ...cloneDeep(formal.document), ...persisted.data, rescueStartDay: formal.document.rescueStartDay }
          : restored;
        dayEdited = true;
      } else if (formal) {
        startDay.value = formal.document.openingSetup?.startDay ?? readEdenContext().day ?? defaultDay;
        draft.value = cloneDeep(formal.document);
        dayEdited = true;
        if (persisted.success && rawDraft?.baseRevision !== undefined && !matchesFormal)
          notice.value = '草稿对应的正式版本已变化，当前显示最新正式配置。';
      } else if (persisted.success && !input.hasStory.value) {
        startDay.value = persisted.data.startDay;
        draft.value = createOpeningEdenDocument(persisted.data, missionLore, technologyLore);
        dayEdited = true;
      } else {
        startDay.value = defaultDay;
        draft.value = createDefaultEdenDocument({ missionLore, technologyLore, startDay: defaultDay });
        dayEdited = false;
      }
    } catch (cause) {
      if (token === epoch) error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (token === epoch) loading.value = false;
    }
  }

  function setStartDay(value: number) {
    dayEdited = true;
    startDay.value = value;
  }
  function installConfig(config: EdenOpeningConfig) {
    if (input.hasStory.value) throw new Error('已有剧情，不能导入伊甸初始配置；请使用新聊天');
    const parsed = EdenOpeningConfigSchema.parse(config);
    draft.value = loaded.value
      ? { ...cloneDeep(loaded.value.document), ...parsed }
      : createOpeningEdenDocument(parsed, missionLore, technologyLore);
    setStartDay(parsed.startDay);
  }
  function exportConfig() {
    return toEdenOpeningConfig(cloneDeep(draft.value), startDay.value);
  }
  const confirmed = computed(
    () =>
      !!loaded.value &&
      JSON.stringify(exportConfig()) ===
        JSON.stringify(
          toEdenOpeningConfig(loaded.value.document, loaded.value.document.openingSetup?.startDay ?? startDay.value),
        ),
  );
  function abilitySummary() {
    return describeEden(draft.value, { day: startDay.value, messageId: 0 });
  }

  function assertUnstarted(target = chatId) {
    if (target !== currentEdenChatId()) throw new Error('聊天已切换，已终止开局初始化');
    const carrierId = getCurrentMessageId();
    const others = getChatMessages(`0-${getLastMessageId()}`, { include_swipes: false }).filter(
      message => message.message_id !== carrierId && String(message.message ?? '').trim(),
    );
    if (input.hasStory.value || others.length) throw new Error('已有剧情，初始配置不能覆盖当前进度；请使用新聊天');
  }

  async function confirm() {
    if (loading.value || error.value) throw new Error(error.value || '正在读取伊甸配置');
    assertUnstarted();
    const target = chatId;
    const targetEpoch = epoch;
    const deps = getEdenHostDeps();
    let operationBinding = binding;
    const assertTarget = () => {
      assertUnstarted(target);
      if (epoch !== targetEpoch) throw new Error('开局配置已重新载入，请重新预览');
      if (deps.boundWorldbook() !== operationBinding) throw new Error('聊天绑定世界书已改变，请重新预览');
    };
    const config = exportConfig();
    const openingEntry = buildRuntimeOpeningWorldbookEntry(input.buildPreset(), cloneDeep(input.payload.value));
    openingEntry.content += `\n<opening_eden_reference>起始末日天数：${config.startDay}。能力与救亡状态以当前伊甸、当前救亡任务、当前伊甸技术为准；初始技术不算新成果。</opening_eden_reference>`;
    try {
      const saved = await confirmEdenOpening(
        {
          chatId: target,
          existingDocument: loaded.value?.document,
          config,
          missionLore: loaded.value?.document.missionLore ?? missionLore,
          technologyLore: loaded.value?.document.technologyLore ?? technologyLore,
          openingEntry,
          expectedRevision: loaded.value?.document.revision ?? 0,
          expectedWorldbookName: binding,
        },
        {
          ...deps,
          async ensureWorldbook() {
            const name = await deps.ensureWorldbook();
            operationBinding = name;
            return name;
          },
          assertUnstarted: assertTarget,
          async synchronize(saved, day) {
            await waitGlobalInitialized('Mvu');
            assertTarget();
            if (deps.boundWorldbook() !== saved.worldbookName) throw new Error('聊天绑定世界书已改变');
            const latest = await loadEdenDocument(target, deps);
            assertTarget();
            if (latest?.document.revision !== saved.document.revision) throw new Error('正式配置已更新，请重新读取');
            const carrierId = getCurrentMessageId();
            const data = Mvu.getMvuData({ type: 'message', message_id: carrierId });
            if (!data?.stat_data) throw new Error('开局变量尚未就绪，请稍后重试');
            data.stat_data.世界 ??= {};
            data.stat_data.世界.末日天数 = day;
            const timeText = input.payload.value.meta.time;
            const date = timeText.match(/(?:公元)?(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (date) data.stat_data.世界.日期 = `公元${date[1]}年${date[2]}月${date[3]}日`;
            const clock = timeText.match(/(\d{1,2}):(\d{2})/);
            if (clock && Number(clock[1]) < 24 && Number(clock[2]) < 60) {
              const hour = Number(clock[1]);
              const period =
                hour < 5
                  ? '凌晨'
                  : hour < 8
                    ? '清晨'
                    : hour < 11
                      ? '上午'
                      : hour < 13
                        ? '中午'
                        : hour < 17
                          ? '下午'
                          : hour < 19
                            ? '傍晚'
                            : hour < 23
                              ? '夜间'
                              : '深夜';
              data.stat_data.世界.时间 = `${period} - ${clock[1].padStart(2, '0')}:${clock[2]}`;
            }
            if (input.payload.value.meta.location.trim())
              data.stat_data.世界.地址 = input.payload.value.meta.location.trim();
            projectEdenToMvu(saved.document, { day, messageId: carrierId, anchors: {} }, data.stat_data);
            assertTarget();
            await Mvu.replaceMvuData(data, { type: 'message', message_id: carrierId });
            assertTarget();
            await notifyEdenSaved(saved, target);
          },
        },
      );
      assertTarget();
      loaded.value = saved;
      binding = saved.worldbookName;
      return saved;
    } catch (cause) {
      if (currentEdenChatId() === target && epoch === targetEpoch) {
        binding = deps.boundWorldbook();
        if (cause instanceof EdenOpeningSyncError) loaded.value = cause.saved;
      }
      throw cause;
    }
  }

  watch(
    [draft, startDay],
    () => {
      if (loading.value || !input.enabled.value || input.hasStory.value || currentEdenChatId() !== chatId) return;
      const config = EdenOpeningConfigSchema.safeParse({ ...cloneDeep(draft.value), startDay: startDay.value });
      if (!config.success) return;
      updateVariablesWith(
        vars => {
          _.set(vars, DRAFT_PATH, {
            config: config.data,
            baseRevision: loaded.value?.document.revision ?? 0,
            worldbookName: binding,
          });
          return vars;
        },
        { type: 'chat' },
      );
    },
    { deep: true, flush: 'sync' },
  );
  watch(input.worldModeId, value => {
    if (!dayEdited && !loaded.value) startDay.value = defaultEdenOpeningStartDay(value);
  });
  watch(input.enabled, () => {
    void load();
  });
  onMounted(() => {
    void load();
    listener = eventOn(tavern_events.CHAT_CHANGED, () => {
      void load();
    });
  });
  onBeforeUnmount(() => {
    epoch++;
    listener?.stop();
  });
  return {
    draft,
    startDay,
    loaded,
    loading,
    error,
    notice,
    confirmed,
    load,
    setStartDay,
    installConfig,
    exportConfig,
    abilitySummary,
    confirm,
  };
}
