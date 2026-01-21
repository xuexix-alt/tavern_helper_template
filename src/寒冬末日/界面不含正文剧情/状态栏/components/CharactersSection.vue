<template>
  <section id="characters-section" class="section">
    <div class="section-header">
      <h2 class="section-title">👤 登场角色 👤</h2>
      <button class="role-add-btn" type="button" @click="openAddRole">+ 添加角色</button>
    </div>
    <div class="status-tabs-container">
      <template v-if="active_character_keys.length > 0">
        <div v-if="useVirtualTabs" class="tab-buttons virtual" v-bind="virtualTabContainerProps">
          <div v-bind="virtualTabWrapperProps" class="virtual-tabs-wrapper horizontal">
            <button
              v-for="item in virtualTabList"
              :key="item.data.key"
              class="tab-button"
              :class="{ active: active_character_key === item.data.key }"
              type="button"
              @click="setActiveCharacter(item.data.key)"
            >
              {{ item.data.label }}
              <span class="status-pill" :class="item.data.status">{{ item.data.status }}</span>
            </button>
          </div>
        </div>
        <div v-else class="tab-buttons">
          <button
            v-for="key in active_character_keys"
            :key="key"
            class="tab-button"
            :class="{ active: active_character_key === key }"
            type="button"
            @click="setActiveCharacter(key)"
          >
            {{ getCharacterDisplayName(key) }}
            <span class="status-pill" :class="getCharacterStatus(key)">{{ getCharacterStatus(key) }}</span>
          </button>
        </div>

        <div
          v-for="key in active_character_keys"
          v-show="active_character_key === key"
          :key="`${key}:tab`"
          class="tab-content"
          :class="{ active: active_character_key === key }"
        >
          <div class="status-grid">
            <div class="status-item health-section">
              <div class="health-section-header">
                <div class="label">❤️ 健康</div>
                <div class="value">
                  {{ getCharacter(key)?.健康 ?? '--' }}
                  <button
                    v-if="canDeleteRole(key)"
                    class="role-remove-btn"
                    type="button"
                    aria-label="删除角色"
                    :disabled="deletingRoleName === getRoleNameKey(key)"
                    @click="onClickDeleteRole(key)"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div class="health-status-subtext">{{ getCharacter(key)?.健康状况 ?? '--' }}</div>
              <div class="progress-bar-container">
                <div
                  class="progress-bar-value"
                  :style="{ width: `${healthPercent(key)}%`, background: healthBarGradient(key) }"
                ></div>
              </div>
              <div class="value-subtext">{{ getCharacterChange(key) }}</div>
            </div>

            <div class="status-item imprint-section">
              <div class="health-section-header">
                <div class="label">🔱 秩序刻印</div>
                <div class="value">{{ getCharacter(key)?.秩序刻印 ?? '--' }}</div>
              </div>
              <div class="imprint-status-subtext">
                {{ getRelationStage(key) }} · 关系倾向：{{ getRelationTendency(key) }}
              </div>
              <div class="progress-bar-container imprint-bar">
                <div class="progress-bar-value" :style="{ width: `${imprintPercent(key)}%` }"></div>
              </div>
              <div class="value-subtext imprint-change">
                {{ getImprintChange(key) || ' ' }}
              </div>
              <div class="value-subtext imprint-hint">
                区间：{{ getRelationRangeText(key) }}｜数值越高表示更深的秩序绑定
              </div>
            </div>

            <div class="details-grid">
              <div class="status-item">
                <div class="label">👚 衣着</div>
                <div class="value">{{ getCharacter(key)?.衣着 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">👅 舌唇</div>
                <div class="value">{{ getCharacter(key)?.舌唇 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">🍈 胸乳</div>
                <div class="value">{{ getCharacter(key)?.胸乳 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">🌸 私穴</div>
                <div class="value">{{ getCharacter(key)?.私穴 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">😊 神态样貌</div>
                <div class="value">{{ getCharacter(key)?.神态样貌 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">💃 动作姿势</div>
                <div class="value">{{ getCharacter(key)?.动作姿势 ?? '--' }}</div>
              </div>
            </div>

            <div class="status-item">
              <div class="label">💭 内心想法</div>
              <div class="value thought-text">{{ getCharacter(key)?.内心想法 ?? '--' }}</div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="content-text">暂无登场角色</div>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="addRoleOpen" class="role-modal-mask" @click.self="closeAddRole">
        <div class="role-modal" role="dialog" aria-modal="true" :style="{ maxHeight: roleModalMaxHeight }">
          <div class="role-modal-header">
            <div class="role-modal-title">✨ 添加角色</div>
            <div class="role-modal-actions">
              <button class="role-btn ghost role-generate-btn" type="button" @click="openGenerateRole">生成角色</button>
              <button class="role-icon-btn" type="button" @click="closeAddRole">✕</button>
            </div>
          </div>

          <div class="role-modal-body" :style="{ maxHeight: roleModalBodyMaxHeight }">
            <div class="role-form-hint">
              仅「姓名」为必填；文本留空写入空字符串。秩序刻印/健康留空将使用默认值（0/100）。
              关系/关系倾向/健康状况将回填为「无/中立/健康」。
            </div>

            <div class="role-form-grid">
              <div class="role-form-item">
                <label class="role-form-label">姓名 *</label>
                <input v-model="addRoleForm.姓名" class="role-form-input" type="text" placeholder="角色姓名" />
              </div>

              <div class="role-form-item role-form-toggle">
                <label class="role-form-label">临时NPC</label>
                <label class="role-switch">
                  <input v-model="addRoleIsTempNpc" type="checkbox" />
                  <span class="role-switch-slider"></span>
                  <span class="role-switch-text">写入临时NPC</span>
                </label>
              </div>

              <div class="role-form-item">
                <label class="role-form-label">关系</label>
                <select v-model="addRoleForm.关系" class="role-form-select">
                  <option value="">（留空）</option>
                  <option v-for="opt in relationStageOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>

              <div class="role-form-item">
                <label class="role-form-label">关系倾向</label>
                <select v-model="addRoleForm.关系倾向" class="role-form-select">
                  <option value="">（留空）</option>
                  <option v-for="opt in relationTendencyOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>

              <div class="role-form-item">
                <label class="role-form-label">秩序刻印</label>
                <input v-model="addRoleForm.秩序刻印" class="role-form-input" type="number" placeholder="数值" />
              </div>

              <div class="role-form-item">
                <label class="role-form-label">秩序刻印更新原因</label>
                <input
                  v-model="addRoleForm.秩序刻印更新原因"
                  class="role-form-input"
                  type="text"
                  placeholder="如：+3, 高级设施体验"
                />
              </div>

              <div class="role-form-item">
                <label class="role-form-label">健康</label>
                <input v-model="addRoleForm.健康" class="role-form-input" type="number" placeholder="数值" />
              </div>

              <div class="role-form-item">
                <label class="role-form-label">健康更新原因</label>
                <input
                  v-model="addRoleForm.健康更新原因"
                  class="role-form-input"
                  type="text"
                  placeholder="如：-2, 饥饿"
                />
              </div>

              <div class="role-form-item">
                <label class="role-form-label">健康状况</label>
                <select v-model="addRoleForm.健康状况" class="role-form-select">
                  <option value="">（留空）</option>
                  <option v-for="opt in healthStatusOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>

              <div class="role-form-item">
                <label class="role-form-label">所在房间</label>
                <input
                  v-model="addRoleForm.所在房间"
                  class="role-form-input"
                  type="text"
                  placeholder="如：楼层20/2002"
                />
              </div>

              <div class="role-form-item">
                <label class="role-form-label">登场状态</label>
                <select v-model="addRoleForm.登场状态" class="role-form-select">
                  <option v-for="opt in presenceOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>

              <div class="role-form-item full">
                <label class="role-form-label">衣着</label>
                <textarea
                  ref="roleTextareaClothes"
                  v-model="addRoleForm.衣着"
                  class="role-form-textarea"
                  rows="2"
                ></textarea>
              </div>

              <div class="role-form-item full">
                <label class="role-form-label">舌唇</label>
                <textarea
                  ref="roleTextareaMouth"
                  v-model="addRoleForm.舌唇"
                  class="role-form-textarea"
                  rows="2"
                ></textarea>
              </div>

              <div class="role-form-item full">
                <label class="role-form-label">胸乳</label>
                <textarea
                  ref="roleTextareaChest"
                  v-model="addRoleForm.胸乳"
                  class="role-form-textarea"
                  rows="2"
                ></textarea>
              </div>

              <div class="role-form-item full">
                <label class="role-form-label">私穴</label>
                <textarea
                  ref="roleTextareaPriv"
                  v-model="addRoleForm.私穴"
                  class="role-form-textarea"
                  rows="2"
                ></textarea>
              </div>

              <div class="role-form-item full">
                <label class="role-form-label">神态样貌</label>
                <textarea
                  ref="roleTextareaFace"
                  v-model="addRoleForm.神态样貌"
                  class="role-form-textarea"
                  rows="2"
                ></textarea>
              </div>

              <div class="role-form-item full">
                <label class="role-form-label">动作姿势</label>
                <textarea
                  ref="roleTextareaPose"
                  v-model="addRoleForm.动作姿势"
                  class="role-form-textarea"
                  rows="2"
                ></textarea>
              </div>

              <div class="role-form-item full">
                <label class="role-form-label">内心想法</label>
                <textarea
                  ref="roleTextareaMind"
                  v-model="addRoleForm.内心想法"
                  class="role-form-textarea"
                  rows="3"
                ></textarea>
              </div>
            </div>

            <div v-if="addRoleError" class="role-form-error">{{ addRoleError }}</div>
          </div>

          <div class="role-modal-footer">
            <button class="role-btn ghost" type="button" :disabled="addRoleLoading" @click="closeAddRole">取消</button>
            <button class="role-btn primary" type="button" :disabled="addRoleLoading" @click="submitAddRole">
              {{ addRoleLoading ? '正在写入…' : '添加角色' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="generateRoleOpen" class="role-generate-mask" @click.self="closeGenerateRole">
        <div class="role-generate-modal" role="dialog" aria-modal="true" :style="{ maxHeight: roleModalMaxHeight }">
          <div class="role-generate-header">
            <div class="role-modal-title">🧬 生成角色面板</div>
            <button class="role-icon-btn" type="button" @click="closeGenerateRole">✕</button>
          </div>

          <div class="role-generate-body" :style="{ maxHeight: roleModalBodyMaxHeight }">
            <div class="role-form-hint">请输入你想要的角色概况，示例：2B，女，冷酷性感的刀女，身份为……</div>
            <textarea
              ref="roleGenerateTextarea"
              v-model="generateRoleInput"
              class="role-form-textarea role-generate-input"
              rows="3"
              placeholder="输入角色信息提示词…"
            ></textarea>
            <div class="role-generate-actions">
              <button
                class="role-btn primary"
                type="button"
                :disabled="generateRoleLoading || !generateRoleInput.trim()"
                @click="onGenerateRole"
              >
                {{ generateRoleLoading ? '生成中…' : '点击生成' }}
              </button>
            </div>

            <div v-if="generateRoleError" class="role-form-error">{{ generateRoleError }}</div>

            <div v-if="generatedRoleForm" class="role-generate-result">
              <div class="role-generate-section">
                <div class="role-generate-title">角色变量预览</div>
                <textarea class="role-form-textarea" rows="6" readonly>{{ generatedRoleJsonText }}</textarea>
              </div>
              <div class="role-generate-section">
                <div class="role-generate-title">世界书关键词</div>
                <div class="role-generate-keys">
                  <span v-for="key in generatedWorldbookKeys" :key="key" class="role-chip">{{ key }}</span>
                  <span v-if="generatedWorldbookKeys.length === 0" class="role-generate-empty">（未提取）</span>
                </div>
              </div>
              <div class="role-generate-section">
                <div class="role-generate-title">世界书文本预览</div>
                <textarea class="role-form-textarea" rows="10" readonly>{{ generatedWorldbookText }}</textarea>
              </div>
              <label class="role-switch role-generate-toggle">
                <input v-model="generatedWriteWorldbook" type="checkbox" />
                <span class="role-switch-slider"></span>
                <span class="role-switch-text">同时写入世界书</span>
              </label>
            </div>
          </div>

          <div class="role-modal-footer">
            <button
              class="role-btn ghost"
              type="button"
              @click="applyGeneratedRoleToForm"
              :disabled="!generatedRoleForm"
            >
              应用到添加角色
            </button>
            <button
              class="role-btn primary"
              type="button"
              :disabled="generateRoleLoading || !generatedRoleForm"
              @click="writeGeneratedRole"
            >
              写入角色
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import _ from 'lodash';
import { useElementSize, useTextareaAutosize, useVirtualList } from '@vueuse/core';
import type { Schema as SchemaType } from '../../../schema';
import { useDataStore } from '../../store';

// 扩展 CharacterKey 以包含临时 NPC 的 key (格式: "临时NPC:姓名")
type CharacterKey =
  | Exclude<keyof SchemaType, '世界' | '庇护所' | '楼层其他住户' | '房间' | '主线任务' | '临时NPC'>
  | string;

const CHARACTER_ORDER = [
  '浅见亚美',
  '相田哲也',
  '星野琉璃',
  '早川遥',
  '早川舞',
  '藤井雪乃',
  '中村惠子',
  // '爱宫心爱',
  // '爱宫铃',
  '桃乐丝・泽巴哈',
  // '何铃',
  '王静',
  // '康绮月',
  // '薛萍',
  '小泽花',
] as const;

const store = useDataStore();
const rootEl = ref<HTMLElement | null>(null);

onMounted(() => {
  rootEl.value = document.documentElement;
});

const { height: viewportHeight } = useElementSize(rootEl);
const roleModalMaxHeightPx = computed(() => {
  const h = Number(viewportHeight.value) || window.innerHeight || 0;
  return Math.max(320, Math.floor(h * 0.7));
});
const roleModalMaxHeight = computed(() => `${roleModalMaxHeightPx.value}px`);
const roleModalBodyMaxHeight = computed(() => `${Math.max(200, roleModalMaxHeightPx.value - 160)}px`);

const RESERVED_KEYS = new Set(['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC']);

function isRoleLike(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  return '登场状态' in val && '健康' in val;
}

function listExtraCoreKeys(): string[] {
  const data = store.data as Record<string, any>;
  return Object.keys(data)
    .filter(key => !RESERVED_KEYS.has(key))
    .filter(key => !CHARACTER_ORDER.includes(key as (typeof CHARACTER_ORDER)[number]))
    .filter(key => typeof key === 'string' && key.length > 0 && !key.startsWith('_'))
    .filter(key => isRoleLike(data[key]))
    .sort();
}

const active_character_keys = computed<CharacterKey[]>(() => {
  const isActive = (key: CharacterKey) => getCharacter(key)?.登场状态 === '登场';

  const data = store.data as Record<string, any>;

  // 1. 固定角色按固定顺序
  const fixedKeys = CHARACTER_ORDER.filter(key => isRoleLike(data[key]));
  const fixedActive = fixedKeys.filter(isActive);
  const fixedInactive = fixedKeys.filter(k => !isActive(k));

  // 2. 追加角色（顶层非固定角色）
  const extraKeys = listExtraCoreKeys();
  const extraActive = extraKeys.filter(isActive);
  const extraInactive = extraKeys.filter(k => !isActive(k));

  // 3. 临时 NPC（按名称字典序）
  const tempActive: CharacterKey[] = [];
  const tempInactive: CharacterKey[] = [];
  const tempNPCs = store.data.临时NPC;
  if (tempNPCs && typeof tempNPCs === 'object') {
    const npcNames = Object.keys(tempNPCs).sort();
    const npcActive = npcNames.filter(name => isActive(`临时NPC:${name}`));
    const npcInactive = npcNames.filter(name => !isActive(`临时NPC:${name}`));
    npcActive.forEach(name => tempActive.push(`临时NPC:${name}`));
    npcInactive.forEach(name => tempInactive.push(`临时NPC:${name}`));
  }

  // 排序：登场角色优先；登场/离场内部顺序：固定名单 → 追加角色 → 临时NPC
  return [...fixedActive, ...extraActive, ...tempActive, ...fixedInactive, ...extraInactive, ...tempInactive];
});

const active_character_key = ref<CharacterKey | null>(null);
const deletingRoleName = ref<string | null>(null);
const addRoleOpen = ref(false);
const addRoleLoading = ref(false);
const addRoleError = ref('');
const addRoleIsTempNpc = ref(false);
const generateRoleOpen = ref(false);
const generateRoleInput = ref('');
const generateRoleLoading = ref(false);
const generateRoleError = ref('');
const generatedRoleForm = ref<AddRoleForm | null>(null);
const generatedRoleJsonText = ref('');
const generatedWorldbookText = ref('');
const generatedWorldbookKeys = ref<string[]>([]);
const generatedWriteWorldbook = ref(true);
const roleTextareaClothes = ref<HTMLTextAreaElement | null>(null);
const roleTextareaMouth = ref<HTMLTextAreaElement | null>(null);
const roleTextareaChest = ref<HTMLTextAreaElement | null>(null);
const roleTextareaPriv = ref<HTMLTextAreaElement | null>(null);
const roleTextareaFace = ref<HTMLTextAreaElement | null>(null);
const roleTextareaPose = ref<HTMLTextAreaElement | null>(null);
const roleTextareaMind = ref<HTMLTextAreaElement | null>(null);
const roleGenerateTextarea = ref<HTMLTextAreaElement | null>(null);

type AddRoleForm = {
  姓名: string;
  关系: string;
  关系倾向: string;
  秩序刻印: string;
  秩序刻印更新原因: string;
  健康: string;
  健康更新原因: string;
  健康状况: string;
  衣着: string;
  舌唇: string;
  胸乳: string;
  私穴: string;
  神态样貌: string;
  动作姿势: string;
  内心想法: string;
  所在房间: string;
  登场状态: string;
};

const relationStageOptions = ['无', '拒绝', '交易', '顺从', '忠诚', '性奴'] as const;
const relationTendencyOptions = ['极易', '易', '中立', '难', '极难', '不可'] as const;
const healthStatusOptions = ['健康', '亚健康', '生病/受伤', '重病/濒死', '无', '死亡'] as const;
const presenceOptions = ['登场', '离场'] as const;

const ROLE_GENERATE_SYSTEM_PROMPT = [
  '你是结构化角色/世界书生成器。',
  '只允许输出以下三段，顺序固定，段落外不得出现任何文字：',
  '1) <ROLE_JSON>JSON</ROLE_JSON>',
  '2) <WB_KEYS>JSON数组</WB_KEYS>',
  '3) <context>...必须包含 NOTE 与 ```yaml 代码块...</context>',
  '禁止输出解释、对话、剧情、思考、Markdown（context 内的 ```yaml 除外）。',
  '禁止复述用户输入或模板文本，必须直接给出最终可用内容。',
  'JSON 必须严格可解析（双引号、无注释、无尾逗号）。',
].join('\n');

const ROLE_GENERATE_PROMPT = [
  '你将根据用户输入生成“寒冬末日角色变量 + 世界书条目”。只输出以下三段，顺序固定：',
  '<ROLE_JSON>JSON对象</ROLE_JSON>',
  '<WB_KEYS>JSON数组</WB_KEYS>',
  '<context>模板内容</context>',
  '',
  '【ROLE_JSON】必须是 JSON 对象，且仅包含这些字段：',
  '"姓名","关系","关系倾向","秩序刻印","秩序刻印更新原因","健康","健康更新原因","健康状况","衣着","舌唇","胸乳","私穴","神态样貌","动作姿势","内心想法","所在房间","登场状态"',
  '数值范围：秩序刻印 -20~100，健康 0~100。',
  '缺省默认：关系=无，关系倾向=中立，健康状况=健康，秩序刻印=0，健康=100，',
  '秩序刻印更新原因="0, 无变化"，健康更新原因="0, 无变化"，所在房间=""，登场状态="登场"。',
  '允许自动生成英文名（用于关键词）。',
  '',
  '【WB_KEYS】必须是 JSON 数组，6~12 个词条，必须包含“主名”和“英文名”，可包含称号/代号、身份关键词、组织/势力、地名、核心特征等。',
  '',
  '【context】必须严格使用下方模板，替换所有占位符，不要输出省略号或示例字样。',
  '必须输出 NOTE 与 ```yaml 代码块；代码块内必须是完整可用的 YAML。',
].join('\n');

const WORLD_BOOK_TEMPLATE = [
  '<context>',
  'NOTE: 请新建一个 角色定义之后 条目, 将代码块中的内容复制到该条目中',
  '```yaml',
  '---',
  '角色详情:',
  '  ${主名}:',
  '    chinese name: ${主名}',
  '    english name: ${英文名}',
  '    title: ${如果有,称号与代号}',
  '    gender: ${性别}',
  '    age: ${年龄}',
  '    identity:',
  '      public: ${表面身份与职位}',
  '      hidden: ${隐藏身份与职位}',
  '    life_story:',
  '      childhood(0~x岁):',
  '        - ${至少15条经历，按年龄顺序；重要经历用**加粗**并用单引号包裹}',
  '      adolescence(x~y岁):',
  '        - ${至少5条经历}',
  '      adulthood(z~n岁):',
  '        - ${至少5条经历}',
  '    current state:',
  '      - ${当前状态要点}',
  '    social connection:',
  '      ${关联人}:',
  '        relationship: ${关联人和角色的关系}',
  '        major event: ${与 life story 相关的事件}',
  '    personality:',
  '      core:',
  '        ${性格特征关键词，2到5字}: ${对这种性格的具体描述}',
  '      conditional:',
  '        ${条件性格特征关键词，2到5字}: ${触发条件与原因}',
  '      hidden:',
  '        ${隐藏性格特征关键词，2到5字}: ${不可告人的一面，禁止使用占有欲等泛化词}',
  '    habit:',
  '      - ${日常习惯1}',
  '      - ${日常习惯2}',
  '    hidden behavior:',
  '      - ${隐藏行为1}',
  '      - ${隐藏行为2}',
  '    appearance:',
  '      height: ${xxx}cm',
  '      weight: ${xx}kg',
  '      measurement: B${xx}({ABCDE}罩杯) W${xx} H${xx}',
  '      style: ${风格词}',
  '      overview: ${整体形象概述}',
  '      attire:',
  '        ${场合}: ${该场合着装风格，<=20字}',
  '        casual: ${日常着装风格}',
  '      feature:',
  '        - ${特别特征1}',
  '        - ${特别特征2}',
  '    sexual preference:',
  '      role: ${性爱时常扮演的角色}',
  '      masturbation frequency: ${自慰频率/方式/原因}',
  '      orgasm response: ${高潮时的独特表现}',
  '      sensitve spot:',
  '        - ${敏感部位1}',
  '        - ${敏感部位2}',
  '      fetish:',
  '        - ${性癖1}',
  '        - ${性癖2}',
  '      special trait:',
  '        - ${性爱特质及原因}',
  'rule:',
  '  - 你必须在之后理解`角色关键信息`时recall角色对应的`角色详情`词条',
  '```',
  '</context>',
].join('\n');

const addRoleForm = ref<AddRoleForm>(createEmptyRoleForm());
useTextareaAutosize({ element: roleTextareaClothes, input: computed(() => addRoleForm.value.衣着) });
useTextareaAutosize({ element: roleTextareaMouth, input: computed(() => addRoleForm.value.舌唇) });
useTextareaAutosize({ element: roleTextareaChest, input: computed(() => addRoleForm.value.胸乳) });
useTextareaAutosize({ element: roleTextareaPriv, input: computed(() => addRoleForm.value.私穴) });
useTextareaAutosize({ element: roleTextareaFace, input: computed(() => addRoleForm.value.神态样貌) });
useTextareaAutosize({ element: roleTextareaPose, input: computed(() => addRoleForm.value.动作姿势) });
useTextareaAutosize({ element: roleTextareaMind, input: computed(() => addRoleForm.value.内心想法) });
useTextareaAutosize({ element: roleGenerateTextarea, input: computed(() => generateRoleInput.value) });

const tabItems = computed(() =>
  active_character_keys.value.map(key => ({
    key,
    label: getCharacterDisplayName(key),
    status: getCharacterStatus(key),
  })),
);
const useVirtualTabs = computed(() => tabItems.value.length > 6);
const {
  list: virtualTabList,
  containerProps: virtualTabContainerProps,
  wrapperProps: virtualTabWrapperProps,
} = useVirtualList(tabItems, { itemWidth: 160, overscan: 6 });

watch(
  active_character_keys,
  keys => {
    if (keys.length === 0) {
      active_character_key.value = null;
      return;
    }

    if (!active_character_key.value || !keys.includes(active_character_key.value)) {
      active_character_key.value = keys[0];
    }
  },
  { immediate: true },
);

function createEmptyRoleForm(): AddRoleForm {
  return {
    姓名: '',
    关系: '无',
    关系倾向: '中立',
    秩序刻印: '',
    秩序刻印更新原因: '',
    健康: '',
    健康更新原因: '',
    健康状况: '健康',
    衣着: '',
    舌唇: '',
    胸乳: '',
    私穴: '',
    神态样貌: '',
    动作姿势: '',
    内心想法: '',
    所在房间: '',
    登场状态: '登场',
  };
}

function resetAddRoleForm() {
  addRoleForm.value = createEmptyRoleForm();
  addRoleIsTempNpc.value = false;
}

function openAddRole() {
  resetAddRoleForm();
  addRoleError.value = '';
  addRoleOpen.value = true;
}

function closeAddRole() {
  addRoleOpen.value = false;
  addRoleError.value = '';
  addRoleLoading.value = false;
}

function resetGenerateRoleState() {
  generateRoleInput.value = '';
  generateRoleError.value = '';
  generatedRoleForm.value = null;
  generatedRoleJsonText.value = '';
  generatedWorldbookText.value = '';
  generatedWorldbookKeys.value = [];
  generatedWriteWorldbook.value = true;
}

function openGenerateRole() {
  if (!addRoleOpen.value) addRoleOpen.value = true;
  resetGenerateRoleState();
  generateRoleOpen.value = true;
}

function closeGenerateRole() {
  generateRoleOpen.value = false;
  generateRoleError.value = '';
  generateRoleLoading.value = false;
}

async function onGenerateRole() {
  if (generateRoleLoading.value) return;
  const input = generateRoleInput.value.trim();
  if (!input) {
    generateRoleError.value = '请先输入角色信息。';
    return;
  }

  generateRoleLoading.value = true;
  generateRoleError.value = '';

  try {
    const result = await generate({
      user_input: buildGeneratePrompt(input),
      max_chat_history: 0,
      overrides: {
        world_info_before: '',
        world_info_after: '',
        persona_description: '',
        char_description: '',
        char_personality: '',
        scenario: '',
        dialogue_examples: '',
        chat_history: {
          prompts: [],
          with_depth_entries: false,
          author_note: '',
        },
      },
      injects: [
        {
          role: 'system',
          content: ROLE_GENERATE_SYSTEM_PROMPT,
          position: 'in_chat',
          depth: 0,
          should_scan: false,
        },
      ],
    });
    const roleJson = extractRoleJsonFallback(result);
    const wbKeysRaw = extractKeysFallback(result);
    const wbContext = extractTagContent(result, 'context');

    if (!roleJson) throw new Error('未找到 ROLE_JSON 区块');
    const roleObj = safeParseRoleJson(roleJson);
    const normalizedForm = normalizeGeneratedRole(roleObj);
    if (!normalizedForm.姓名) throw new Error('角色姓名为空');

    const yamlContent = extractYamlBlock(wbContext);
    const englishName = extractEnglishNameFromYaml(yamlContent);
    const parsedKeys = parseWorldbookKeys(stripCodeFence(wbKeysRaw));
    const ensuredKeys = _.uniq([normalizedForm.姓名, englishName, ...parsedKeys].filter(Boolean)).slice(0, 12);

    generatedRoleForm.value = normalizedForm;
    generatedRoleJsonText.value = JSON.stringify(roleObj, null, 2);
    generatedWorldbookText.value = yamlContent;
    generatedWorldbookKeys.value = ensuredKeys;
  } catch (err: any) {
    console.error('[CharactersSection] generate role failed', err);
    generateRoleError.value = err?.message ?? String(err);
  } finally {
    generateRoleLoading.value = false;
  }
}

function applyGeneratedRoleToForm() {
  if (!generatedRoleForm.value) return;
  addRoleForm.value = { ...generatedRoleForm.value };
  addRoleIsTempNpc.value = false;
  generateRoleOpen.value = false;
  toastr.success('已将生成内容应用到添加角色');
}

async function writeGeneratedRole() {
  if (!generatedRoleForm.value || generateRoleLoading.value) return;
  const name = generatedRoleForm.value.姓名.trim();
  if (!name) {
    generateRoleError.value = '角色姓名为空';
    return;
  }

  generateRoleLoading.value = true;
  generateRoleError.value = '';

  try {
    const result = await writeRoleData({
      form: generatedRoleForm.value,
      name,
      isTemp: false,
      writeWorldbook: generatedWriteWorldbook.value,
      worldbookText: generatedWorldbookText.value,
      worldbookKeys: generatedWorldbookKeys.value,
    });

    if (result?.canceled) return;

    closeGenerateRole();
    closeAddRole();
    resetAddRoleForm();
    reloadIframe();
  } catch (err: any) {
    console.error('[CharactersSection] write generated role failed', err);
    generateRoleError.value = err?.message ?? String(err);
  } finally {
    generateRoleLoading.value = false;
  }
}

function normalizeTextInput(value: string) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeNumberInput(value: string) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const num = Number(s);
  return Number.isFinite(num) ? num : '';
}

function normalizeSelectInput(value: string, options: readonly string[], fallback: string) {
  const v = String(value ?? '').trim();
  if (!v) return fallback;
  return options.includes(v) ? v : fallback;
}

function buildGeneratePrompt(userInput: string) {
  return `${ROLE_GENERATE_PROMPT}\n\n${WORLD_BOOK_TEMPLATE}\n\n用户输入如下：\n${userInput}`.trim();
}

function extractTagContent(source: string, tag: string) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let last = '';
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    last = match[1];
  }
  return last ? last.trim() : '';
}

function extractYamlBlock(source: string) {
  const re = /```yaml\s*([\s\S]*?)```/i;
  const match = source.match(re);
  return match ? match[1].trim() : source.trim();
}

function extractEnglishNameFromYaml(source: string) {
  const match = source.match(/english name:\s*([^\n\r]+)/i);
  return match ? String(match[1]).trim() : '';
}

function stripCodeFence(source: string) {
  return source
    .replace(/```(?:json|yaml)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function extractJsonBlock(source: string, startChar: '{' | '[', endChar: '}' | ']') {
  const start = source.indexOf(startChar);
  if (start === -1) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === startChar) depth += 1;
    if (ch === endChar) depth -= 1;
    if (depth === 0) {
      return source.slice(start, i + 1).trim();
    }
  }
  return '';
}

function extractRoleJsonFallback(source: string) {
  const fenced = extractTagContent(source, 'ROLE_JSON');
  if (fenced) return fenced;
  const codeBlock = extractTagContent(source, 'json');
  if (codeBlock) return codeBlock;
  return extractJsonBlock(source, '{', '}');
}

function extractKeysFallback(source: string) {
  const fenced = extractTagContent(source, 'WB_KEYS');
  if (fenced) return fenced;
  return extractJsonBlock(source, '[', ']');
}

function safeParseRoleJson(raw: string) {
  const cleaned = stripCodeFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const fallback = extractJsonBlock(cleaned, '{', '}');
    if (!fallback) throw new Error('角色JSON解析失败');
    return JSON.parse(fallback);
  }
}

function parseWorldbookKeys(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => typeof item === 'string' || typeof item === 'number')
      .map(item => String(item ?? '').trim())
      .filter(item => item.length > 0);
  } catch {
    return [];
  }
}

function normalizeGeneratedRole(raw: Record<string, any>): AddRoleForm {
  return {
    姓名: String(raw?.姓名 ?? '').trim(),
    关系: normalizeSelectInput(String(raw?.关系 ?? ''), relationStageOptions, '无'),
    关系倾向: normalizeSelectInput(String(raw?.关系倾向 ?? ''), relationTendencyOptions, '中立'),
    秩序刻印: String(raw?.秩序刻印 ?? '').trim(),
    秩序刻印更新原因: normalizeTextInput(String(raw?.秩序刻印更新原因 ?? '0, 无变化')),
    健康: String(raw?.健康 ?? '').trim(),
    健康更新原因: normalizeTextInput(String(raw?.健康更新原因 ?? '0, 无变化')),
    健康状况: normalizeSelectInput(String(raw?.健康状况 ?? ''), healthStatusOptions, '健康'),
    衣着: normalizeTextInput(String(raw?.衣着 ?? '')),
    舌唇: normalizeTextInput(String(raw?.舌唇 ?? '')),
    胸乳: normalizeTextInput(String(raw?.胸乳 ?? '')),
    私穴: normalizeTextInput(String(raw?.私穴 ?? '')),
    神态样貌: normalizeTextInput(String(raw?.神态样貌 ?? '')),
    动作姿势: normalizeTextInput(String(raw?.动作姿势 ?? '')),
    内心想法: normalizeTextInput(String(raw?.内心想法 ?? '')),
    所在房间: normalizeTextInput(String(raw?.所在房间 ?? '')),
    登场状态: normalizeSelectInput(String(raw?.登场状态 ?? ''), presenceOptions, '登场'),
  };
}

function buildRolePayload(name: string, form: AddRoleForm = addRoleForm.value) {
  return {
    姓名: name,
    关系: normalizeSelectInput(form.关系, relationStageOptions, '无'),
    关系倾向: normalizeSelectInput(form.关系倾向, relationTendencyOptions, '中立'),
    秩序刻印: normalizeNumberInput(form.秩序刻印),
    秩序刻印更新原因: normalizeTextInput(form.秩序刻印更新原因),
    健康: normalizeNumberInput(form.健康),
    健康更新原因: normalizeTextInput(form.健康更新原因),
    健康状况: normalizeSelectInput(form.健康状况, healthStatusOptions, '健康'),
    衣着: normalizeTextInput(form.衣着),
    舌唇: normalizeTextInput(form.舌唇),
    胸乳: normalizeTextInput(form.胸乳),
    私穴: normalizeTextInput(form.私穴),
    神态样貌: normalizeTextInput(form.神态样貌),
    动作姿势: normalizeTextInput(form.动作姿势),
    内心想法: normalizeTextInput(form.内心想法),
    所在房间: normalizeTextInput(form.所在房间),
    登场状态: normalizeSelectInput(form.登场状态, presenceOptions, '登场'),
  };
}

function validateNumberRange(label: string, value: string, min: number, max: number) {
  const s = String(value ?? '').trim();
  if (!s) return { ok: true, value: '' as string | number };
  const num = Number(s);
  if (!Number.isFinite(num)) return { ok: false, error: `${label}必须是数字` };
  if (num < min || num > max) return { ok: false, error: `${label}范围应为 ${min}~${max}` };
  return { ok: true, value: num };
}

function validateRoleForm(form: AddRoleForm) {
  const imprintCheck = validateNumberRange('秩序刻印', form.秩序刻印, -20, 100);
  if (!imprintCheck.ok) return { ok: false, error: imprintCheck.error ?? '秩序刻印不合法' };
  const healthCheck = validateNumberRange('健康', form.健康, 0, 100);
  if (!healthCheck.ok) return { ok: false, error: healthCheck.error ?? '健康不合法' };
  return { ok: true, imprintCheck, healthCheck };
}

async function writeWorldbookEntry(name: string, content: string, keys: string[]) {
  const wbContent = String(content ?? '').trim();
  if (!wbContent) throw new Error('世界书内容为空');

  const rawKeys = Array.isArray(keys) ? keys : [];
  const normalizedKeys = _.uniq(rawKeys.map(item => String(item ?? '').trim()).filter(Boolean));
  const ensuredKeys = _.uniq([name, ...normalizedKeys]).slice(0, 12);

  const worldbook_name = await getOrCreateChatWorldbook('current');
  await createWorldbookEntries(
    worldbook_name,
    [
      {
        name: `角色档案_用户添加_${name}`,
        enabled: true,
        strategy: {
          type: 'selective',
          keys: ensuredKeys,
          keys_secondary: { logic: 'and_any', keys: [] },
          scan_depth: 'same_as_global',
        },
        position: {
          type: 'at_depth',
          role: 'user',
          depth: 4,
          order: 20,
        },
        content: wbContent,
      },
    ],
    { render: 'immediate' },
  );
}

async function writeRoleData(options: {
  form: AddRoleForm;
  name: string;
  isTemp: boolean;
  writeWorldbook?: boolean;
  worldbookText?: string;
  worldbookKeys?: string[];
}) {
  const { form, name, isTemp, writeWorldbook, worldbookText, worldbookKeys } = options;
  const check = validateRoleForm(form);
  if (!check.ok) {
    throw new Error(check.error ?? '角色数据不合法');
  }

  await waitGlobalInitialized('Mvu');
  const message_id = getCurrentMessageId();
  const mvu_data = Mvu.getMvuData({ type: 'message', message_id });
  if (!mvu_data || typeof mvu_data !== 'object') {
    throw new Error('未读取到当前楼层变量');
  }

  if (!mvu_data.stat_data || typeof mvu_data.stat_data !== 'object') {
    mvu_data.stat_data = {};
  }

  const statData = mvu_data.stat_data as Record<string, any>;
  const existedCore = _.has(statData, name);
  const existedTemp = _.has(statData, ['临时NPC', name]);
  if (existedCore || existedTemp) {
    const ok = await confirmOverwriteRole(name, existedCore, existedTemp, isTemp);
    if (!ok) return { canceled: true };
  }

  const payload = buildRolePayload(name, form);
  if (check.imprintCheck.value !== '') payload.秩序刻印 = check.imprintCheck.value;
  if (check.healthCheck.value !== '') payload.健康 = check.healthCheck.value;
  if (payload.秩序刻印 === '') payload.秩序刻印 = 0;
  if (payload.健康 === '') payload.健康 = 100;

  if (isTemp) {
    if (!statData.临时NPC || typeof statData.临时NPC !== 'object') {
      statData.临时NPC = {};
    }
    statData.临时NPC[name] = payload;
    if (existedCore) _.unset(statData, [name]);
  } else {
    statData[name] = payload;
    if (existedTemp) _.unset(statData, ['临时NPC', name]);
  }

  await Mvu.replaceMvuData(mvu_data, { type: 'message', message_id });

  let wbError = '';
  if (writeWorldbook) {
    try {
      await writeWorldbookEntry(name, String(worldbookText ?? ''), worldbookKeys ?? []);
    } catch (err: any) {
      wbError = err?.message ?? String(err);
    }
  }

  if (wbError) {
    toastr.warning(`角色已写入，但世界书失败：${wbError}`);
  } else if (writeWorldbook) {
    toastr.success(`已写入角色与世界书「${name}」`);
  } else {
    toastr.success(`已添加角色「${name}」`);
  }

  return { canceled: false };
}

async function confirmOverwriteRole(
  name: string,
  existedCore: boolean,
  existedTemp: boolean,
  targetTemp: boolean,
): Promise<boolean> {
  const existedLabels = [];
  if (existedCore) existedLabels.push('主要角色');
  if (existedTemp) existedLabels.push('临时NPC');
  const targetLabel = targetTemp ? '临时NPC' : '主要角色';
  const removeOther = (targetTemp && existedCore) || (!targetTemp && existedTemp);

  const content = [
    `发现同名角色「${name}」。`,
    existedLabels.length > 0 ? `当前存在于：${existedLabels.join('、')}` : '',
    `将写入到：${targetLabel}`,
    removeOther ? '将覆盖并从另一处移除以避免重复。' : '将覆盖当前数据。',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    if (typeof (SillyTavern as any)?.callGenericPopup === 'function') {
      const result = await SillyTavern.callGenericPopup(content, SillyTavern.POPUP_TYPE.CONFIRM);
      return result === SillyTavern.POPUP_RESULT.AFFIRMATIVE || result === true;
    }
  } catch {
    // ignore and fallback
  }

  return window.confirm(content);
}

async function submitAddRole() {
  if (addRoleLoading.value) return;
  const name = addRoleForm.value.姓名.trim();
  if (!name) {
    addRoleError.value = '姓名不能为空。';
    return;
  }

  const check = validateRoleForm(addRoleForm.value);
  if (!check.ok) {
    addRoleError.value = check.error ?? '角色数据不合法';
    return;
  }

  addRoleLoading.value = true;
  addRoleError.value = '';

  try {
    const result = await writeRoleData({
      form: addRoleForm.value,
      name,
      isTemp: addRoleIsTempNpc.value,
      writeWorldbook: false,
    });
    if (result?.canceled) return;

    closeAddRole();
    resetAddRoleForm();
    reloadIframe();
  } catch (e: any) {
    console.error('[CharactersSection] add role failed', e);
    addRoleError.value = e?.message ?? String(e);
  } finally {
    addRoleLoading.value = false;
  }
}

function getCharacter(key: CharacterKey) {
  // 某些转译流会把日文中点替换成占位符「?」，查找前先还原
  const normalizedKey = typeof key === 'string' ? key.replace(/\?/g, '・') : key;

  if (typeof key === 'string' && key.startsWith('临时NPC:')) {
    const realName = key.split(':')[1];
    return store.data.临时NPC[realName];
  }
  return store.data[normalizedKey as keyof typeof store.data] as any;
}

function isTempNpcKey(key: CharacterKey): boolean {
  return typeof key === 'string' && key.startsWith('临时NPC:');
}

function getTempNpcName(key: CharacterKey): string {
  if (!isTempNpcKey(key)) return '';
  return String(key.split(':')[1] ?? '').trim();
}

function getRoleNameKey(key: CharacterKey): string {
  if (isTempNpcKey(key)) return getTempNpcName(key);
  if (typeof key === 'string') return key.replace(/\?/g, '・');
  return String(key);
}

function canDeleteRole(key: CharacterKey): boolean {
  return !!getRoleNameKey(key);
}

async function confirmDeleteRole(name: string, isTemp: boolean): Promise<boolean> {
  const title = isTemp ? `确定删除临时NPC「${name}」？` : `确定删除角色「${name}」？`;
  const hint = isTemp
    ? '将从当前楼层变量中移除该临时NPC，并重载本楼层UI以刷新显示。'
    : '将从当前楼层变量中移除该角色（含固定角色/主角），并重载本楼层UI以刷新显示。';
  const content = `${title}\n\n${hint}`;

  try {
    if (typeof (SillyTavern as any)?.callGenericPopup === 'function') {
      const result = await SillyTavern.callGenericPopup(content, SillyTavern.POPUP_TYPE.CONFIRM);
      return result === SillyTavern.POPUP_RESULT.AFFIRMATIVE || result === true;
    }
  } catch {
    // ignore and fallback
  }

  return window.confirm(content);
}

function pruneNameFromRooms(stat_data: any, name: string) {
  const n = String(name ?? '').trim();
  if (!n) return;

  const rooms = _.get(stat_data, '房间', null);
  if (!rooms || typeof rooms !== 'object') return;

  const pruneList = (path: string) => {
    const list = _.get(rooms, path, null);
    if (!Array.isArray(list)) return;
    const next = list.filter(x => String(x ?? '').trim() !== n);
    if (!_.isEqual(next, list)) _.set(rooms, path, next);
  };

  pruneList('玄关.临时客房A入住者');
  pruneList('玄关.临时客房B入住者');
  pruneList('核心区.客厅使用者');
  pruneList('核心区.餐厅厨房使用者');
  pruneList('核心区.主卧室使用者');
  pruneList('核心区.主浴室使用者');

  const floorKeys = ['楼层房间.楼层20房间', '楼层房间.楼层19房间'];
  for (const baseKey of floorKeys) {
    const record = _.get(rooms, baseKey, null);
    if (!record || typeof record !== 'object') continue;
    for (const roomNumber of Object.keys(record)) {
      pruneList(`${baseKey}.${roomNumber}.入住者`);
    }
  }
}

async function onClickDeleteRole(key: CharacterKey) {
  const isTemp = isTempNpcKey(key);
  const name = getRoleNameKey(key);
  if (!name) return;
  if (deletingRoleName.value) return;

  const ok = await confirmDeleteRole(name, isTemp);
  if (!ok) return;

  try {
    deletingRoleName.value = name;
    await waitGlobalInitialized('Mvu');

    const message_id = getCurrentMessageId();
    const mvu_data = Mvu.getMvuData({ type: 'message', message_id });

    const existedCore = _.has(mvu_data, ['stat_data', name]);
    const existedTemp = _.has(mvu_data, ['stat_data', '临时NPC', name]);
    if (!existedCore && !existedTemp) {
      toastr.info(`角色「${name}」已不存在`);
      reloadIframe();
      return;
    }

    const removeCore = !isTemp && existedCore;
    const removeTemp = existedTemp;
    if (removeCore) _.unset(mvu_data, ['stat_data', name]);
    if (removeTemp) _.unset(mvu_data, ['stat_data', '临时NPC', name]);

    const keepCore = existedCore && !removeCore;
    const keepTemp = existedTemp && !removeTemp;
    if (!keepCore && !keepTemp) {
      pruneNameFromRooms(_.get(mvu_data, 'stat_data', {}), name);
    }

    await Mvu.replaceMvuData(mvu_data, { type: 'message', message_id });
    toastr.success(`已删除角色「${name}」`);
    reloadIframe();
  } catch (e: any) {
    console.error('[CharactersSection] delete role failed', e);
    toastr.error(`删除失败：${e?.message ?? e}`);
  } finally {
    deletingRoleName.value = null;
  }
}

function getCharacterChange(key: CharacterKey) {
  const char = getCharacter(key);
  if (!char || !char.健康更新原因) return '';
  return char.健康更新原因;
}

function getCharacterDisplayName(key: CharacterKey) {
  const char = getCharacter(key);
  const name = typeof char?.姓名 === 'string' ? char.姓名.trim() : '';
  // 如果是临时NPC，去掉前缀显示
  if (typeof key === 'string' && key.startsWith('临时NPC:')) {
    return key.split(':')[1];
  }
  return name ? name : key;
}

function getCharacterStatus(key: CharacterKey) {
  const char = getCharacter(key);
  return char?.登场状态 ?? '离场';
}

function setActiveCharacter(key: CharacterKey) {
  active_character_key.value = key;
}

function healthPercent(key: CharacterKey) {
  const char = getCharacter(key);
  const health = char?.健康;
  if (typeof health !== 'number') return 0;
  return _.clamp(health, 0, 100);
}

function imprintPercent(key: CharacterKey) {
  const char = getCharacter(key);
  const mark = char?.秩序刻印;
  if (typeof mark !== 'number') return 0;
  return _.clamp(mark, 0, 100);
}

function healthBarGradient(key: CharacterKey) {
  const percent = healthPercent(key);
  if (percent <= 30) return 'linear-gradient(90deg, #ff5c6c, #ff8a5c)';
  if (percent <= 60) return 'linear-gradient(90deg, #ff8a5c, #ffd166)';
  if (percent <= 80) return 'linear-gradient(90deg, #ffd166, #a7f3a0)';
  return 'linear-gradient(90deg, #7bd389, #34d399)';
}

function getRelationStage(key: CharacterKey) {
  const char = getCharacter(key);
  if (char?.关系) return char.关系;
  // fallback: 推断自秩序刻印数值
  const mark = typeof char?.秩序刻印 === 'number' ? char.秩序刻印 : null;
  if (mark === null) return '未知';
  if (mark <= 0) return '无';
  if (mark < 20) return '拒绝';
  if (mark < 40) return '交易';
  if (mark < 60) return '顺从';
  if (mark < 90) return '忠诚';
  return '性奴';
}

function getRelationTendency(key: CharacterKey) {
  const char = getCharacter(key);
  return char?.关系倾向 ?? '未知';
}

function getRelationRangeText(key: CharacterKey) {
  const relation = getRelationStage(key);
  switch (relation) {
    case '无':
      return '-20 - 0';
    case '拒绝':
      return '1 - 19';
    case '交易':
      return '20 - 39';
    case '顺从':
      return '40 - 59';
    case '忠诚':
      return '60 - 89';
    case '性奴':
      return '90 - 100';
    default:
      return '-20 - 100';
  }
}

function getImprintChange(key: CharacterKey) {
  const char = getCharacter(key);
  return char?.秩序刻印更新原因 ?? '';
}

onBeforeUnmount(() => {
  addRoleOpen.value = false;
  generateRoleOpen.value = false;
});
</script>

<style scoped>
.health-section .progress-bar-value {
  background: linear-gradient(90deg, #7aa2f7, #f1fa8c);
}
.imprint-section .progress-bar-value {
  background: linear-gradient(90deg, #7aa2f7, #f1fa8c);
}
.imprint-status-subtext {
  margin-top: 4px;
  color: var(--accent-blue, #8be9fd);
  font-size: 0.9em;
}
.imprint-hint {
  color: var(--text-color);
  opacity: 0.7;
}

.imprint-change {
  color: var(--accent-gold, #f1fa8c);
}
.imprint-bar {
  margin-top: 6px;
}
</style>

<style scoped>
.role-remove-btn {
  margin-left: 10px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255, 90, 90, 0.55);
  background: rgba(255, 90, 90, 0.12);
  color: rgba(255, 150, 150, 0.98);
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.12s ease,
    opacity 0.12s ease;
}

.role-remove-btn:hover {
  transform: scale(1.04);
}

.role-remove-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.status-pill {
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 0.75em;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
  background: rgba(255, 255, 255, 0.05);
}
.status-pill.登场 {
  color: #50fa7b;
  border-color: #50fa7b55;
  background: #50fa7b11;
}
.status-pill.离场 {
  color: #f1fa8c;
  border-color: #f1fa8c55;
  background: #f1fa8c11;
}

.tab-buttons.virtual {
  display: block;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 6px;
}

.virtual-tabs-wrapper.horizontal {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tab-buttons.virtual .tab-button {
  flex: 0 0 auto;
  width: 160px;
  justify-content: center;
  text-overflow: ellipsis;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.role-add-btn {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 180, 216, 0.45);
  background: rgba(0, 180, 216, 0.12);
  color: #e5faff;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    background 0.12s ease;
}

.role-add-btn:hover {
  transform: translateY(-1px);
  background: rgba(0, 180, 216, 0.2);
}

.role-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(10, 12, 24, 0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  z-index: 999;
}

.role-modal {
  width: min(70vw, 700px);
  max-height: 70vh;
  background: rgba(18, 20, 36, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
}

.role-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.role-modal-title {
  font-size: 1.05em;
  font-weight: 800;
  color: #f8f9ff;
}

.role-modal-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.role-generate-btn {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.9em;
}

.role-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.05);
  color: #f8f9ff;
  cursor: pointer;
}

.role-generate-mask {
  position: fixed;
  inset: 0;
  background: rgba(6, 8, 20, 0.78);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  z-index: 1001;
}

.role-generate-modal {
  width: min(72vw, 760px);
  max-height: 70vh;
  background: rgba(16, 18, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
}

.role-generate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.role-generate-body {
  padding: 16px 20px;
  overflow: auto;
}

.role-generate-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.role-generate-input {
  min-height: 72px;
}

.role-generate-result {
  margin-top: 16px;
  display: grid;
  gap: 14px;
}

.role-generate-section {
  display: grid;
  gap: 8px;
}

.role-generate-title {
  font-size: 0.9em;
  color: rgba(255, 255, 255, 0.78);
  font-weight: 700;
}

.role-generate-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(80, 250, 123, 0.15);
  border: 1px solid rgba(80, 250, 123, 0.35);
  color: #c8ffd9;
  font-size: 0.82em;
}

.role-generate-empty {
  font-size: 0.85em;
  color: rgba(255, 255, 255, 0.5);
}

.role-generate-toggle {
  margin-top: 8px;
}

.role-modal-body {
  padding: 16px 20px;
  overflow: auto;
}

.role-form-hint {
  font-size: 0.88em;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 12px;
}

.role-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px 16px;
}

.role-form-item.full {
  grid-column: 1 / -1;
}

.role-form-label {
  display: block;
  font-size: 0.85em;
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.78);
}

.role-form-input,
.role-form-select,
.role-form-textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  padding: 8px 10px;
  font-size: 0.95em;
  color-scheme: dark;
}

.role-form-textarea {
  resize: vertical;
}

.role-form-select option {
  background: #0f172a;
  color: #e5e7eb;
}

.role-form-toggle {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.role-switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.role-switch input {
  display: none;
}

.role-switch-slider {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  position: relative;
  transition: background 0.2s ease;
}

.role-switch-slider::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  top: 3px;
  left: 3px;
  transition: transform 0.2s ease;
}

.role-switch input:checked + .role-switch-slider {
  background: rgba(0, 180, 216, 0.65);
}

.role-switch input:checked + .role-switch-slider::after {
  transform: translateX(18px);
}

.role-switch-text {
  font-size: 0.9em;
  color: rgba(255, 255, 255, 0.85);
}

.role-form-error {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 90, 90, 0.15);
  color: rgba(255, 200, 200, 0.95);
  font-size: 0.9em;
}

.role-modal-footer {
  padding: 12px 20px 18px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.role-btn {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
  cursor: pointer;
  font-weight: 700;
}

.role-btn.primary {
  border-color: rgba(0, 180, 216, 0.55);
  background-color: rgba(0, 180, 216, 0.2);
  color: #e8fbff;
}

.role-btn.ghost {
  background: transparent;
}

.role-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
