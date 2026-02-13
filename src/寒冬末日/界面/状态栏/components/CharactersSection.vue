<template>
  <section id="characters-section" class="section">
    <div class="section-header">
      <h2 class="section-title">{{ isCreationMode ? '🛠️ 创作 🛠️' : '👤 登场角色 👤' }}</h2>
      <div class="section-header-actions">
        <template v-if="isCreationMode">
          <button class="role-add-btn" type="button" @click="openAddRole">+ 添加角色</button>
          <button class="role-add-btn secondary" type="button" @click="openGenerateRole">🧬 生成角色</button>
        </template>
        <template v-else>
          <button class="section-view-btn" type="button" @click="openWorldInfoModal">基础信息</button>
          <button class="section-view-btn" type="button" @click="openReportDigestModal">汇总摘要</button>
        </template>
      </div>
    </div>

    <div v-if="isCreationMode" class="creation-entry">
      <div class="creation-entry-hint">
        在此页面集中进行角色新增与批量创作。点击上方按钮可打开对应创作弹窗。
      </div>
      <div class="creation-entry-actions">
        <button class="role-add-btn" type="button" @click="openAddRole">+ 添加角色</button>
        <button class="role-add-btn secondary" type="button" @click="openGenerateRole">🧬 生成角色</button>
      </div>
    </div>

    <div v-else class="status-tabs-container">
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
              <TextHighlight :text="item.data.label" :query="query" />
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
            <TextHighlight :text="getCharacterDisplayName(key)" :query="query" />
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
        <div class="content-text">{{ hasQuery ? '当前关键词下暂无匹配角色' : '暂无登场角色' }}</div>
      </template>
    </div>

    <Teleport to="body">
      <div
        v-if="!isCreationMode && worldInfoModalOpen"
        class="role-modal-mask role-modal-mask--overview"
        @click.self="closeWorldInfoModal"
      >
        <div class="role-modal overview-modal" role="dialog" aria-modal="true" :style="{ maxHeight: roleModalMaxHeight }">
          <div class="role-modal-header">
            <div class="role-modal-title">基础信息</div>
            <div class="role-modal-actions">
              <button class="role-icon-btn" type="button" @click="closeWorldInfoModal">✕</button>
            </div>
          </div>
          <div class="role-modal-body overview-modal-body" :style="{ maxHeight: roleModalBodyMaxHeight }">
            <WorldSection :query="query" />
          </div>
        </div>
      </div>

      <div
        v-if="!isCreationMode && reportDigestModalOpen"
        class="role-modal-mask role-modal-mask--overview"
        @click.self="closeReportDigestModal"
      >
        <div class="role-modal overview-modal" role="dialog" aria-modal="true" :style="{ maxHeight: roleModalMaxHeight }">
          <div class="role-modal-header">
            <div class="role-modal-title">汇总摘要</div>
            <div class="role-modal-actions">
              <button class="role-icon-btn" type="button" @click="closeReportDigestModal">✕</button>
            </div>
          </div>
          <div class="role-modal-body overview-modal-body" :style="{ maxHeight: roleModalBodyMaxHeight }">
            <ReportSection :query="query" />
          </div>
        </div>
      </div>

      <div v-if="isCreationMode && addRoleOpen" class="role-modal-mask">
        <div class="role-modal" role="dialog" aria-modal="true" :style="{ maxHeight: roleModalMaxHeight }">
          <div class="role-modal-header">
            <div class="role-modal-title">✨ 添加角色</div>
            <div class="role-modal-actions">
              <button class="role-btn primary role-generate-btn" type="button" @click="openGenerateRole">
                生成角色
              </button>
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
            </div>

            <div v-if="addRoleError" class="role-form-error">{{ addRoleError }}</div>
          </div>

          <div class="role-modal-footer">
            <button class="role-btn danger" type="button" :disabled="addRoleLoading" @click="closeAddRole">关闭</button>
            <button class="role-btn primary" type="button" :disabled="addRoleLoading" @click="submitAddRole">
              {{ addRoleLoading ? '正在写入…' : '添加角色' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="isCreationMode && generateRoleOpen" class="role-generate-mask">
        <div class="role-generate-modal" role="dialog" aria-modal="true" :style="{ maxHeight: roleModalMaxHeight }">
          <div class="role-generate-header">
            <div class="role-modal-title">🧬 生成角色面板</div>
            <div class="role-generate-header-actions">
              <input
                ref="roleImportInput"
                class="role-file-input"
                type="file"
                accept="application/json"
                @change="onImportRoleFile"
              />
              <button class="role-btn ghost role-header-btn" type="button" @click="triggerImportRole">导入</button>
              <button class="role-btn ghost role-header-btn" type="button" @click="exportGeneratedRoles">导出</button>
              <button class="role-icon-btn" type="button" @click="closeGenerateRole">✕</button>
            </div>
          </div>

          <div class="role-generate-body" :style="{ maxHeight: roleModalBodyMaxHeight }">
            <div class="role-generate-input-block primary">
              <div class="role-generate-title">🌟 第1步：生成首稿</div>
              <div class="role-form-hint">请输入你想要的角色概况，示例：2B，女，冷酷性感的刀女，身份为……</div>
              <textarea
                ref="roleGenerateTextarea"
                v-model="generateRoleInput"
                class="role-form-textarea role-generate-input"
                rows="3"
                placeholder="输入角色信息提示词…"
              ></textarea>
              <div class="role-generate-actions toolbar">
                <div class="role-generate-toggle-group">
                  <button class="role-btn ghost" type="button" @click="showPromptPanel = !showPromptPanel">
                    提示词
                  </button>
                  <button class="role-btn ghost" type="button" @click="showTemplatePanel = !showTemplatePanel">
                    模板
                  </button>
                  <button class="role-btn ghost" type="button" @click="showWorldbookPanel = !showWorldbookPanel">
                    世界书
                  </button>
                  <button
                    class="role-btn"
                    type="button"
                    :class="includeContextTwoLayers ? 'primary' : 'ghost'"
                    @click="includeContextTwoLayers = !includeContextTwoLayers"
                  >
                    包含上下文（两层）
                  </button>
                </div>
                <button
                  class="role-btn primary"
                  type="button"
                  :disabled="generateRoleLoading || !generateRoleInput.trim()"
                  @click="onGenerateRole"
                >
                  {{ generateRoleLoading ? '生成中…' : '生成首稿' }}
                </button>
              </div>
            </div>

            <div class="role-generate-settings">
              <div class="role-generate-title">生成设置</div>
              <div class="role-form-hint">
                只使用当前预设 + 选中的世界书子集，{{
                  includeContextTwoLayers ? '包含最近两层聊天上下文。' : '不携带聊天上下文。'
                }}可保存为默认配置。
              </div>
              <div v-if="showPromptPanel" class="role-generate-setting-item">
                <label class="role-form-label">系统提示词</label>
                <textarea v-model="roleGenerateSystemPromptText" class="role-form-textarea" rows="4"></textarea>
              </div>
              <div v-if="showPromptPanel" class="role-generate-setting-item">
                <label class="role-form-label">生成提示词</label>
                <textarea v-model="roleGeneratePromptText" class="role-form-textarea" rows="6"></textarea>
              </div>
              <div v-if="showTemplatePanel" class="role-generate-setting-item">
                <label class="role-form-label">世界书模板</label>
                <textarea v-model="roleGenerateTemplateText" class="role-form-textarea" rows="8"></textarea>
              </div>
              <div v-if="showPromptPanel" class="role-generate-setting-item">
                <label class="role-form-label">最终提示词（只读）</label>
                <textarea class="role-form-textarea" rows="6" readonly :value="finalGeneratePromptText"></textarea>
                <div class="role-generate-actions">
                  <button class="role-btn ghost" type="button" @click="saveGenerateSettings">保存为默认</button>
                  <button class="role-btn ghost" type="button" @click="resetGenerateSettings">重置默认</button>
                  <button class="role-btn ghost" type="button" @click="copyFinalPrompt">复制最终提示词</button>
                </div>
              </div>

              <div v-if="showWorldbookPanel" class="role-generate-setting-item">
                <div class="role-generate-title">世界书条目子集（多选）</div>
                <div class="role-generate-worldbook-toolbar">
                  <input
                    v-model="worldbookFilterText"
                    class="role-form-input"
                    type="text"
                    placeholder="筛选条目名称…"
                  />
                  <button
                    class="role-btn ghost"
                    type="button"
                    :disabled="isWorldbookLoading"
                    @click="loadWorldbookEntryOptions"
                  >
                    {{ isWorldbookLoading ? '加载中…' : '刷新列表' }}
                  </button>
                  <button class="role-btn ghost" type="button" @click="selectAllEnabledWorldbookEntries">
                    勾选已启用
                  </button>
                  <button class="role-btn ghost" type="button" @click="clearWorldbookSelection">清空</button>
                  <div class="role-generate-meta">已选 {{ selectedWorldbookCount }} 条</div>
                </div>
                <div class="role-generate-worldbook-list">
                  <label
                    v-for="item in filteredWorldbookEntryOptions"
                    :key="item.id"
                    class="role-generate-worldbook-item"
                  >
                    <input v-model="selectedWorldbookEntryIds" type="checkbox" :value="item.id" />
                    <span class="role-worldbook-label" :class="{ disabled: !item.enabled }">
                      {{ item.label }}
                    </span>
                  </label>
                  <div v-if="filteredWorldbookEntryOptions.length === 0" class="role-generate-empty">暂无条目</div>
                </div>
              </div>
            </div>

            <div v-if="generateRoleError" class="role-form-error">{{ generateRoleError }}</div>

            <div v-if="generatedRoles.length > 0" class="role-generate-input-block">
              <div class="role-generate-title">🧪 第2步：检查修正</div>
              <div class="role-form-hint">{{ REVIEW_STEP_INTRO_TEXT }}</div>
              <textarea
                v-model="generateRoleReviewInput"
                class="role-form-textarea role-generate-review-input"
                rows="3"
                placeholder="可留空（按默认设置校验修正）；也可在此补充修正意见…"
              ></textarea>
              <div class="role-generate-actions toolbar">
                <div class="role-generate-meta">{{ roleReviewMetaText }}</div>
                <button
                  class="role-btn primary"
                  type="button"
                  :disabled="generateRoleLoading || !canRunRoleReview"
                  @click="onReviewGeneratedRoles"
                >
                  {{ generateRoleReviewState === 'running' ? '检查中…' : '执行检查修正' }}
                </button>
              </div>
            </div>

            <div v-if="generatedRoles.length > 0" class="role-generate-result">
              <div class="role-generate-tabs">
                <button
                  v-for="(item, index) in generatedRoles"
                  :key="item.id"
                  class="role-tab-btn"
                  :class="{ active: activeGeneratedIndex === index }"
                  type="button"
                  @click="activeGeneratedIndex = index"
                >
                  {{ item.form.姓名 || `角色${index + 1}` }}
                  <span v-if="item.status === 'success'" class="role-status success">已写入</span>
                  <span v-else-if="item.status === 'error'" class="role-status error">失败</span>
                </button>
              </div>

              <div v-if="activeGeneratedRole" class="role-generate-panel">
                <div class="role-generate-section">
                  <div class="role-generate-title">角色变量编辑</div>
                  <div class="role-form-grid">
                    <div class="role-form-item">
                      <label class="role-form-label">姓名 *</label>
                      <input v-model="activeGeneratedRole.form.姓名" class="role-form-input" type="text" />
                    </div>

                    <div class="role-form-item role-form-toggle">
                      <label class="role-form-label">临时NPC</label>
                      <label class="role-switch">
                        <input v-model="activeGeneratedRole.isTemp" type="checkbox" />
                        <span class="role-switch-slider"></span>
                        <span class="role-switch-text">写入临时NPC</span>
                      </label>
                    </div>

                    <div class="role-form-item">
                      <label class="role-form-label">关系</label>
                      <select v-model="activeGeneratedRole.form.关系" class="role-form-select">
                        <option value="">（留空）</option>
                        <option v-for="opt in relationStageOptions" :key="opt" :value="opt">{{ opt }}</option>
                      </select>
                    </div>

                    <div class="role-form-item">
                      <label class="role-form-label">关系倾向</label>
                      <select v-model="activeGeneratedRole.form.关系倾向" class="role-form-select">
                        <option value="">（留空）</option>
                        <option v-for="opt in relationTendencyOptions" :key="opt" :value="opt">{{ opt }}</option>
                      </select>
                    </div>

                    <div class="role-form-item">
                      <label class="role-form-label">秩序刻印</label>
                      <input v-model="activeGeneratedRole.form.秩序刻印" class="role-form-input" type="number" />
                    </div>

                    <div class="role-form-item">
                      <label class="role-form-label">秩序刻印更新原因</label>
                      <input v-model="activeGeneratedRole.form.秩序刻印更新原因" class="role-form-input" type="text" />
                    </div>

                    <div class="role-form-item">
                      <label class="role-form-label">健康</label>
                      <input v-model="activeGeneratedRole.form.健康" class="role-form-input" type="number" />
                    </div>

                    <div class="role-form-item">
                      <label class="role-form-label">健康更新原因</label>
                      <input v-model="activeGeneratedRole.form.健康更新原因" class="role-form-input" type="text" />
                    </div>

                    <div class="role-form-item">
                      <label class="role-form-label">健康状况</label>
                      <select v-model="activeGeneratedRole.form.健康状况" class="role-form-select">
                        <option value="">（留空）</option>
                        <option v-for="opt in healthStatusOptions" :key="opt" :value="opt">{{ opt }}</option>
                      </select>
                    </div>

                    <div class="role-form-item">
                      <label class="role-form-label">所在房间</label>
                      <input v-model="activeGeneratedRole.form.所在房间" class="role-form-input" type="text" />
                    </div>

                    <div class="role-form-item">
                      <label class="role-form-label">登场状态</label>
                      <select v-model="activeGeneratedRole.form.登场状态" class="role-form-select">
                        <option v-for="opt in presenceOptions" :key="opt" :value="opt">{{ opt }}</option>
                      </select>
                    </div>

                    <div class="role-form-item full">
                      <label class="role-form-label">衣着</label>
                      <textarea v-model="activeGeneratedRole.form.衣着" class="role-form-textarea" rows="2"></textarea>
                    </div>
                    <div class="role-form-item full">
                      <label class="role-form-label">舌唇</label>
                      <textarea v-model="activeGeneratedRole.form.舌唇" class="role-form-textarea" rows="2"></textarea>
                    </div>
                    <div class="role-form-item full">
                      <label class="role-form-label">胸乳</label>
                      <textarea v-model="activeGeneratedRole.form.胸乳" class="role-form-textarea" rows="2"></textarea>
                    </div>
                    <div class="role-form-item full">
                      <label class="role-form-label">私穴</label>
                      <textarea v-model="activeGeneratedRole.form.私穴" class="role-form-textarea" rows="2"></textarea>
                    </div>
                    <div class="role-form-item full">
                      <label class="role-form-label">神态样貌</label>
                      <textarea
                        v-model="activeGeneratedRole.form.神态样貌"
                        class="role-form-textarea"
                        rows="2"
                      ></textarea>
                    </div>
                    <div class="role-form-item full">
                      <label class="role-form-label">动作姿势</label>
                      <textarea
                        v-model="activeGeneratedRole.form.动作姿势"
                        class="role-form-textarea"
                        rows="2"
                      ></textarea>
                    </div>
                    <div class="role-form-item full">
                      <label class="role-form-label">内心想法</label>
                      <textarea
                        v-model="activeGeneratedRole.form.内心想法"
                        class="role-form-textarea"
                        rows="3"
                      ></textarea>
                    </div>
                  </div>
                </div>

                <div class="role-generate-section">
                  <div class="role-generate-title">世界书关键词（逗号分隔）</div>
                  <input
                    class="role-form-input"
                    type="text"
                    :value="getWorldbookKeysText(activeGeneratedRole)"
                    @input="onWorldbookKeysInput(activeGeneratedRole, $event)"
                  />
                </div>

                <div class="role-generate-section">
                  <div class="role-generate-title">世界书文本（可编辑）</div>
                  <textarea v-model="activeGeneratedRole.worldbookText" class="role-form-textarea" rows="10"></textarea>
                </div>

                <label class="role-switch role-generate-toggle">
                  <input v-model="activeGeneratedRole.excludeWorldbook" type="checkbox" />
                  <span class="role-switch-slider"></span>
                  <span class="role-switch-text">排除世界书</span>
                </label>

                <div v-if="activeGeneratedRole.errorMessage" class="role-form-error">
                  {{ activeGeneratedRole.errorMessage }}
                </div>
              </div>
            </div>

            <div v-if="generateRoleRawResponse && generatedRoles.length === 0" class="role-generate-section">
              <div class="role-generate-title">原始响应（解析失败时用于排查）</div>
              <textarea class="role-form-textarea" rows="8" readonly :value="generateRoleRawResponse"></textarea>
            </div>
          </div>

          <div class="role-modal-footer">
            <div
              v-if="generatedRoles.length > 0 && !canWriteGeneratedRoles"
              class="role-form-hint role-generate-write-hint"
            >
              {{ roleWriteHintText }}
            </div>
            <div v-else-if="generatedRoles.length > 0" class="role-form-hint role-generate-write-hint">
              {{ roleWriteHintText }}
            </div>
            <button
              class="role-btn primary"
              type="button"
              :disabled="generateRoleLoading || !canWriteGeneratedRoles"
              @click="writeGeneratedRole"
            >
              写入角色
            </button>
            <button
              class="role-btn primary"
              type="button"
              :disabled="generateRoleLoading || !canWriteGeneratedRoles"
              @click="writeAllGeneratedRoles"
            >
              写入全部
            </button>
            <button class="role-btn danger" type="button" @click="closeGenerateRole">关闭</button>
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
import {
  CHAT_VAR_KEYS_ROLE,
  isRoleEnabledBySelectorState,
  readRoleSelectorStateFromStatData,
} from '../../../role_control';
import { useDataStore } from '../../store';
import { getViewMessageState, resolveViewMessageId } from '../../viewMessage';
import ReportSection from './ReportSection.vue';
import TextHighlight from './TextHighlight.vue';
import WorldSection from './WorldSection.vue';

type CharactersSectionMode = 'characters' | 'creation';

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
const props = withDefaults(
  defineProps<{
    query?: string;
    mode?: CharactersSectionMode;
  }>(),
  {
    query: '',
    mode: 'characters',
  },
);
const query = computed(() => props.query ?? '');
const normalizedQuery = computed(() => query.value.trim().toLowerCase());
const hasQuery = computed(() => normalizedQuery.value.length > 0);
const isCreationMode = computed(() => props.mode === 'creation');
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
const worldInfoModalOpen = ref(false);
const reportDigestModalOpen = ref(false);

function openWorldInfoModal() {
  if (isCreationMode.value) return;
  reportDigestModalOpen.value = false;
  worldInfoModalOpen.value = true;
}

function closeWorldInfoModal() {
  worldInfoModalOpen.value = false;
}

function openReportDigestModal() {
  if (isCreationMode.value) return;
  worldInfoModalOpen.value = false;
  reportDigestModalOpen.value = true;
}

function closeReportDigestModal() {
  reportDigestModalOpen.value = false;
}

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

function matchCharacterByQuery(key: CharacterKey): boolean {
  if (!normalizedQuery.value) return true;
  const char = getCharacter(key) as Record<string, any> | undefined;
  if (!char) return false;

  const chunks = [
    key,
    getCharacterDisplayName(key),
    char.姓名,
    char.登场状态,
    char.关系,
    char.关系倾向,
    char.健康,
    char.健康状况,
    char.秩序刻印,
    char.所在房间,
    char.衣着,
    char.舌唇,
    char.胸乳,
    char.私穴,
    char.神态样貌,
    char.动作姿势,
    char.内心想法,
  ];

  return chunks
    .map(v => String(v ?? ''))
    .join('\n')
    .toLowerCase()
    .includes(normalizedQuery.value);
}

const active_character_keys = computed<CharacterKey[]>(() => {
  const isActive = (key: CharacterKey) => getCharacter(key)?.登场状态 === '登场';

  const data = store.data as Record<string, any>;
  const roleSelector = (() => {
    try {
      const chatVars = typeof getVariables === 'function' ? (getVariables({ type: 'chat' }) ?? {}) : {};
      const roleRoot = _.get(chatVars, CHAT_VAR_KEYS_ROLE.ROOT, null);
      if (roleRoot && typeof roleRoot === 'object') {
        return readRoleSelectorStateFromStatData({ 主线任务: { $meta: { 角色控制: roleRoot } } });
      }
    } catch {
      // ignore and fallback
    }
    return readRoleSelectorStateFromStatData(data);
  })();
  const isEnabled = (roleName: string) => isRoleEnabledBySelectorState(roleSelector, roleName);

  // 1. 固定角色按固定顺序
  const fixedKeys = CHARACTER_ORDER.filter(key => isRoleLike(data[key]) && isEnabled(key));
  const fixedActive = fixedKeys.filter(isActive);
  const fixedInactive = fixedKeys.filter(k => !isActive(k));

  // 2. 追加角色（顶层非固定角色）
  const extraKeys = listExtraCoreKeys().filter(key => isEnabled(String(key)));
  const extraActive = extraKeys.filter(isActive);
  const extraInactive = extraKeys.filter(k => !isActive(k));

  // 3. 临时 NPC（按名称字典序）
  const tempActive: CharacterKey[] = [];
  const tempInactive: CharacterKey[] = [];
  const tempNPCs = store.data.临时NPC;
  if (tempNPCs && typeof tempNPCs === 'object') {
    const npcNames = Object.keys(tempNPCs)
      .filter(name => isEnabled(name))
      .sort();
    const npcActive = npcNames.filter(name => isActive(`临时NPC:${name}`));
    const npcInactive = npcNames.filter(name => !isActive(`临时NPC:${name}`));
    npcActive.forEach(name => tempActive.push(`临时NPC:${name}`));
    npcInactive.forEach(name => tempInactive.push(`临时NPC:${name}`));
  }

  // 排序：登场角色优先；登场/离场内部顺序：固定名单 → 追加角色 → 临时NPC
  const ordered = [...fixedActive, ...extraActive, ...tempActive, ...fixedInactive, ...extraInactive, ...tempInactive];
  if (!normalizedQuery.value) return ordered;
  return ordered.filter(matchCharacterByQuery);
});

const active_character_key = ref<CharacterKey | null>(null);
const deletingRoleName = ref<string | null>(null);
const addRoleOpen = ref(false);
const addRoleLoading = ref(false);
const addRoleError = ref('');
const addRoleIsTempNpc = ref(false);
const generateRoleOpen = ref(false);
const generateRoleInput = ref('');
const generateRoleReviewInput = ref('');
const generateRoleLoading = ref(false);
const generateRoleError = ref('');
const generateRoleRawResponse = ref('');
const generateRoleReviewMessage = ref('');
const generateRoleReviewState = ref<'idle' | 'running' | 'done' | 'failed'>('idle');
const roleGenerateSystemPromptText = ref('');
const roleGeneratePromptText = ref('');
const roleGenerateTemplateText = ref('');
const showPromptPanel = ref(false);
const showTemplatePanel = ref(false);
const showWorldbookPanel = ref(false);
const worldbookFilterText = ref('');
const worldbookEntryOptions = ref<WorldbookEntryOption[]>([]);
const selectedWorldbookEntryIds = ref<string[]>([]);
const includeContextTwoLayers = ref(false);
const isWorldbookLoading = ref(false);
const generatedRoles = ref<GeneratedRoleItem[]>([]);
const activeGeneratedIndex = ref(0);
const roleGenerateTextarea = ref<HTMLTextAreaElement | null>(null);
const roleImportInput = ref<HTMLInputElement | null>(null);

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

type WorldbookEntryOption = {
  id: string;
  worldbook: string;
  entry: WorldbookEntry;
  enabled: boolean;
  label: string;
};

type GeneratedRoleItem = {
  id: string;
  form: AddRoleForm;
  rawJson: string;
  worldbookText: string;
  worldbookKeys: string[];
  excludeWorldbook: boolean;
  isTemp: boolean;
  status: 'idle' | 'writing' | 'success' | 'error';
  errorMessage: string;
};

const relationStageOptions = ['无', '拒绝', '交易', '顺从', '忠诚', '性奴'] as const;
const relationTendencyOptions = ['极易', '易', '中立', '难', '极难', '不可'] as const;
const healthStatusOptions = ['健康', '亚健康', '生病/受伤', '重病/濒死', '无', '死亡'] as const;
const presenceOptions = ['登场', '离场'] as const;

// 角色生成用“知识库”提示词：直接嵌入到生成提示中，避免依赖外部预设/插件内容。
const ROLE_GENERATE_KNOWLEDGE_TEXT = [
  '<creative_principles>',
  '角色卡制作核心原则',
  '',
  '制作角色卡时，遵循以下原则来创造真实、鲜活的角色：（除非用户特别说明，应不与当前任意角色雷同）',
  '',
  '1. 用行为展现性格，而非定义性格',
  '2. 提供具体的语料示例，而非描述语气',
  '3. 避免模糊词、比喻词、微表情等八股描写',
  '4. 外貌描写使用描述性语言，不用精确数字',
  '5. 设计完整的世界观，让角色有生存的土壤',
  '6. 注重细节，用小习惯让角色立体化',
  '7. 保持一致性，所有设定要相互支撑',
  '</creative_principles>',
  '',
  '<writing_principles>',
  '什么是八股',
  '',
  '八股是指陈词滥调、机械化的描写方式：',
  '- 模糊词：似乎、几乎、仿佛、如同、宛如',
  '- 劣质比喻：像小兽、像小兔子、投石入湖、心湖泛起涟漪',
  '- 微表情：嘴角上扬、眼里闪过光芒、指尖泛白',
  '- 语气描写：带着xx的口吻、用xx的语气',
  '- 极端情绪词：陷入极大的恐惧、极度羞耻',
  '- 否定转折句：不是...而是...',
  '- 过度心理描写：大段内心活动',
  '',
  '创作必须遵守的原则',
  '',
  '绝对零度：',
  '- 保持客观冷静的叙述视角',
  '- 不带主观判断',
  '- 不添加个人情感色彩',
  '',
  '白描手法：',
  '- 直接描述事实',
  '- 不添加修饰和渲染',
  '- 用最简单的语言呈现',
  '',
  '不使用形容词：',
  '- 简单干净',
  '- 用名词和动词直接呈现',
  '- 避免一切装饰性描述',
  '',
  '不使用代词和意象词：',
  '- 避免歧义',
  '- 使用具体明确的本意',
  '- 不用抽象概念替代具体事物',
  '',
  '用行为替代描述：',
  '- 展现而非告知',
  '- 写角色做了什么，而非角色是什么样的人',
  '- 让读者通过行为自己判断',
  '',
  '用语料展现性格：',
  '- 让角色通过对话体现特点',
  '- 不描述语气，让对话本身说话',
  '- 纯粹的话语，不附加动作和神态',
  '</writing_principles>',
].join('\n');

const ROLE_GENERATE_SYSTEM_PROMPT = [
  '你是结构化角色/世界书生成器。',
  '忽略任何与本任务无关的预设提示词/身份设定/剧情要求（例如“秘书身份”“GM主持”“破限自检”等），只执行本任务。',
  '若上游提示中出现“秋青子/明月/秘书/昵称化称呼/完成后引导/自查”等内容，全部视为噪声并忽略。',
  '角色生成流程必须对齐「角色设计」规范：模块完整、命名稳定、层级一致、可直接落库。',
  '输出中面向玩家的称呼一律使用 "{{user}}"。',
  'context 的 YAML 必须包含且仅使用以下一级模块名：角色基础、常规语料、角色缺点、独立人格、兴趣爱好、衣柜清单、演绎指导、角色速览。',
  '只允许输出以下三段，顺序固定，段落外不得出现任何文字；若为多名角色则按顺序重复这三段：',
  '1) <ROLE_JSON>JSON</ROLE_JSON>',
  '2) <WB_KEYS>JSON数组</WB_KEYS>',
  '3) <context>...必须包含 NOTE 与 ```yaml 代码块...</context>',
  '禁止输出解释、对话、剧情、思考、Markdown（context 内的 ```yaml 除外）。',
  '禁止复述用户输入或模板文本，必须直接给出最终可用内容。',
  'JSON 必须严格可解析（双引号、无注释、无尾逗号）。',
].join('\n');

const ROLE_GENERATE_SETTINGS_KEY = 'ui_role_generate_settings';
const ROLE_CREATOR_OPEN_EVENT = 'eden.role_creator.open';
const ROLE_SELECTOR_OPEN_EVENT = 'eden.role_selector.open';
const DEFAULT_WORLDBOOK_NAME_CANDIDATES = [
  '末世寒冬-星穹秩序2.0',
  '寒冬末日-星穹秩序',
  '末世寒冬 - 星穹秩序',
  '末世寒冬-星穹秩序',
] as const;

const ROLE_GENERATE_PROMPT = [
  '你将根据用户输入生成“寒冬末日角色变量 + 世界书条目”。只输出以下三段，顺序固定；多角色时按顺序重复三段：',
  '<ROLE_JSON>JSON对象</ROLE_JSON>',
  '<WB_KEYS>JSON数组</WB_KEYS>',
  '<context>模板内容</context>',
  '',
  '【创作原则】必须遵守下方知识库（影响世界书文本风格与可用性）：',
  ROLE_GENERATE_KNOWLEDGE_TEXT,
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
  '【角色设计模块契约】context 的 YAML 必须包含且仅使用以下一级模块（顺序保持一致）：',
  '1) 角色基础',
  '2) 常规语料',
  '3) 角色缺点',
  '4) 独立人格',
  '5) 兴趣爱好',
  '6) 衣柜清单',
  '7) 演绎指导',
  '8) 角色速览',
  '',
  '【输出前自查（不要输出检查过程）】',
  '1) 是否遵守模块与模板；2) 命名/层级是否一致；3) 是否引入未要求机制；',
  '4) 是否与既有世界观冲突；5) 是否所有占位符都被替换；6) 最终文本是否可直接写入。',
  '',
  '【context】必须严格使用下方模板，替换所有占位符，不要输出省略号或示例字样。',
  '必须输出 NOTE 与 ```yaml 代码块；代码块内必须是完整可用的 YAML。',
].join('\n');

const WORLD_BOOK_TEMPLATE = [
  '<context>',
  'NOTE: 请新建一个 角色定义之后 条目, 将代码块中的内容复制到该条目中',
  '```yaml',
  '<角色档案 - ${主名}>',
  '角色档案:',
  '  角色基础:',
  '    基本信息:',
  '      姓名: ${主名}',
  '      english name: ${英文名}',
  '      年龄: ${年龄}',
  '      性别: ${性别}',
  '      身份: ${身份/职业/住址}',
  '      婚姻状况: ${婚姻状况}',
  '      与{{user}}关系: ${与{{user}}关系}',
  '    外貌特征:',
  '      体型: ${体型}',
  '      发型:',
  '        - ${发型与打理方式1}',
  '        - ${发型与打理方式2}',
  '      穿着:',
  '        - ${日常穿着（物品组合）}',
  '        - ${需要行动时穿着（物品组合）}',
  '      手部肢体习惯:',
  '        - ${身体细节/动作习惯1}',
  '        - ${身体细节/动作习惯2}',
  '    背景设定:',
  '      职业经历:',
  '        - ${职业经历1}',
  '        - ${职业经历2}',
  '      生活习惯:',
  '        - ${习惯1}',
  '        - ${习惯2}',
  '      过往经历:',
  '        - ${经历1}',
  '',
  '  常规语料:',
  '    说话方式:',
  '      - ${说话习惯1}',
  '      - ${说话习惯2}',
  '    示例:',
  '      - "${台词1}"',
  '      - "${台词2}"',
  '',
  '  角色缺点:',
  '    - ${缺点1}',
  '    - ${缺点2}',
  '',
  '  独立人格:',
  '    个人原则:',
  '      - ${原则1}',
  '      - ${原则2}',
  '    边界与底线:',
  '      - ${底线1}',
  '',
  '  兴趣爱好:',
  '    喜好:',
  '      - ${喜好1}',
  '      - ${喜好2}',
  '    厌恶:',
  '      - ${厌恶1}',
  '',
  '  衣柜清单:',
  '    日常:',
  '      - ${日常服饰1}',
  '      - ${日常服饰2}',
  '    行动:',
  '      - ${行动服饰1}',
  '',
  '  演绎指导:',
  '    行为准则:',
  '      - ${行为准则1}',
  '      - ${行为准则2}',
  '    对{{user}}互动要点:',
  '      - ${互动要点1}',
  '',
  '  角色速览:',
  '    身份标签:',
  '      - ${身份标签1}',
  '      - ${身份标签2}',
  '    当前目标: ${当前目标}',
  '    核心冲突: ${核心冲突}',
  '</角色档案 - ${主名}>',
  '```',
  '</context>',
].join('\n');

const ROLE_DESIGN_REQUIRED_MODULES = [
  '角色基础',
  '常规语料',
  '角色缺点',
  '独立人格',
  '兴趣爱好',
  '衣柜清单',
  '演绎指导',
  '角色速览',
] as const;

function escapeRegExp(value: string) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRoleGenerateExcludedWorldbookEntryName(entryName: string) {
  const name = String(entryName ?? '').trim();
  if (!name) return false;
  if (name.includes('角色档案_动态注入')) return true;
  if (name.includes('角色档案') && name.includes('动态注入')) return true;
  if (name.includes('@INJECT') && name.includes('角色档案')) return true;
  return false;
}

function validateRoleDesignWorldbookText(roleName: string, source: string) {
  const text = String(source ?? '').trim();
  if (!text) {
    throw new Error(`角色「${roleName}」世界书内容为空`);
  }
  if (/\$\{[^}]+\}/.test(text)) {
    throw new Error(`角色「${roleName}」世界书仍包含模板占位符，请先执行检查修正`);
  }
  const missingModules = ROLE_DESIGN_REQUIRED_MODULES.filter(moduleName => {
    const re = new RegExp(`(^|\\n)\\s{2}${escapeRegExp(moduleName)}\\s*:`, 'm');
    return !re.test(text);
  });
  if (missingModules.length > 0) {
    throw new Error(`角色「${roleName}」世界书缺少模块：${missingModules.join('、')}`);
  }
  if (!/(^|\n)\s+english name\s*:/i.test(text) && !/(^|\n)\s+英文名\s*:/i.test(text)) {
    throw new Error(`角色「${roleName}」世界书缺少英文名字段`);
  }
  return text;
}

roleGenerateSystemPromptText.value = ROLE_GENERATE_SYSTEM_PROMPT;
roleGeneratePromptText.value = ROLE_GENERATE_PROMPT;
roleGenerateTemplateText.value = WORLD_BOOK_TEMPLATE;

const addRoleForm = ref<AddRoleForm>(createEmptyRoleForm());
useTextareaAutosize({ element: roleGenerateTextarea, input: computed(() => generateRoleInput.value) });

const REVIEW_STEP_INTRO_TEXT =
  '生成成功！接下来需要对生成的角色进行再次校验，请你查看下面变量和世界书内容，提出修正意见，留空则按默认设置进行校验修正。';

const filteredWorldbookEntryOptions = computed(() => {
  const keyword = worldbookFilterText.value.trim();
  if (!keyword) return worldbookEntryOptions.value;
  return worldbookEntryOptions.value.filter(item => item.label.includes(keyword));
});

const selectedWorldbookCount = computed(() => selectedWorldbookEntryIds.value.length);

const finalGeneratePromptText = computed(() => buildGeneratePrompt(generateRoleInput.value));

const canRunRoleReview = computed(() => generatedRoles.value.length > 0);

const roleReviewMetaText = computed(() => generateRoleReviewMessage.value || REVIEW_STEP_INTRO_TEXT);

const roleWriteHintText = computed(() => {
  if (generatedRoles.value.length === 0) return '';
  if (generateRoleReviewState.value === 'running') return '正在校验修正中，请稍候…';
  if (generateRoleReviewState.value === 'done') {
    return '校验修正完成：请检查并按需编辑下方角色变量与世界书文本，确认后可“写入角色”或“写入全部”进行保存。变量支持按你的需要继续修改。';
  }
  if (generateRoleReviewState.value === 'failed') {
    return '校验修正失败：已保留首稿。你仍可先检查并编辑下方角色变量与世界书文本，再执行写入保存。变量支持按你的需要继续修改。';
  }
  return '请先执行“检查修正”后再写入；留空修正意见会按默认设置完成校验修正。';
});

const canWriteGeneratedRoles = computed(() => {
  if (generatedRoles.value.length === 0) return false;
  if (generateRoleReviewState.value === 'running') return false;
  // 推荐：检查后写入；但检查失败时允许写入首稿避免流程卡死
  return generateRoleReviewState.value === 'done' || generateRoleReviewState.value === 'failed';
});

const activeGeneratedRole = computed(() => generatedRoles.value[activeGeneratedIndex.value] ?? null);

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
  if (!isCreationMode.value) return;
  resetAddRoleForm();
  addRoleError.value = '';
  addRoleOpen.value = true;
}

let roleCreatorOpenStop: { stop: () => void } | null = null;
onMounted(() => {
  if (typeof eventOn !== 'function') return;
  roleCreatorOpenStop = eventOn(ROLE_CREATOR_OPEN_EVENT as any, () => {
    openAddRole();
  });
});
onBeforeUnmount(() => {
  roleCreatorOpenStop?.stop?.();
  roleCreatorOpenStop = null;
});

function closeAddRole() {
  addRoleOpen.value = false;
  addRoleError.value = '';
  addRoleLoading.value = false;
}

function readGenerateSettings(): Record<string, any> | null {
  try {
    const vars = getVariables({ type: 'chat' });
    const data = _.get(vars, ROLE_GENERATE_SETTINGS_KEY, null);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function replaceRoleGenerateAliases(text: string): string {
  return String(text ?? '')
    .replaceAll('小哥哥', '{{user}}')
    .replaceAll('哥哥', '{{user}}')
    .replaceAll('主人', '{{user}}');
}

function removeTemplateHintLines(text: string): string {
  return String(text ?? '')
    .split('\n')
    .filter(line => !line.trim().startsWith('# 提示：'))
    .join('\n');
}

function sanitizeGenerateSystemPromptText(text: string): string {
  return replaceRoleGenerateAliases(text);
}

function sanitizeGenerateBasePromptText(text: string): string {
  return replaceRoleGenerateAliases(text);
}

function sanitizeGenerateTemplateText(text: string): string {
  return removeTemplateHintLines(replaceRoleGenerateAliases(text));
}

function normalizeSelectedEntryIds(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((id: any) => String(id ?? '').trim()).filter(Boolean);
}

function normalizeIncludeContextTwoLayers(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'on';
}

function buildSanitizedGenerateSettings(settings: Record<string, any>): Record<string, any> {
  const next = { ...settings };
  if (typeof settings.system_prompt === 'string') {
    next.system_prompt = sanitizeGenerateSystemPromptText(settings.system_prompt);
  }
  if (typeof settings.base_prompt === 'string') {
    next.base_prompt = sanitizeGenerateBasePromptText(settings.base_prompt);
  }
  if (typeof settings.template === 'string') {
    next.template = sanitizeGenerateTemplateText(settings.template);
  }
  if (Array.isArray(settings.selected_entry_ids)) {
    next.selected_entry_ids = normalizeSelectedEntryIds(settings.selected_entry_ids);
  }
  if (settings.include_context_two_layers !== undefined) {
    next.include_context_two_layers = normalizeIncludeContextTwoLayers(settings.include_context_two_layers);
  }
  return next;
}

function migrateGenerateSettingsInChat(settings: Record<string, any> | null) {
  if (!settings) return;

  const next = buildSanitizedGenerateSettings(settings);
  const prevComparable = {
    system_prompt: typeof settings.system_prompt === 'string' ? settings.system_prompt : undefined,
    base_prompt: typeof settings.base_prompt === 'string' ? settings.base_prompt : undefined,
    template: typeof settings.template === 'string' ? settings.template : undefined,
    selected_entry_ids: Array.isArray(settings.selected_entry_ids)
      ? normalizeSelectedEntryIds(settings.selected_entry_ids)
      : undefined,
    include_context_two_layers:
      settings.include_context_two_layers === undefined
        ? undefined
        : normalizeIncludeContextTwoLayers(settings.include_context_two_layers),
  };
  const nextComparable = {
    system_prompt: typeof next.system_prompt === 'string' ? next.system_prompt : undefined,
    base_prompt: typeof next.base_prompt === 'string' ? next.base_prompt : undefined,
    template: typeof next.template === 'string' ? next.template : undefined,
    selected_entry_ids: Array.isArray(next.selected_entry_ids)
      ? normalizeSelectedEntryIds(next.selected_entry_ids)
      : undefined,
    include_context_two_layers:
      next.include_context_two_layers === undefined
        ? undefined
        : normalizeIncludeContextTwoLayers(next.include_context_two_layers),
  };

  if (_.isEqual(prevComparable, nextComparable)) return;

  updateVariablesWith(
    vars => {
      _.set(vars, ROLE_GENERATE_SETTINGS_KEY, next);
      return vars;
    },
    { type: 'chat' },
  );
}

function applyGenerateSettings(settings: Record<string, any> | null) {
  if (!settings) return;
  if (typeof settings.system_prompt === 'string') {
    roleGenerateSystemPromptText.value = sanitizeGenerateSystemPromptText(settings.system_prompt);
  }
  if (typeof settings.base_prompt === 'string') {
    roleGeneratePromptText.value = sanitizeGenerateBasePromptText(settings.base_prompt);
  }
  if (typeof settings.template === 'string') {
    roleGenerateTemplateText.value = sanitizeGenerateTemplateText(settings.template);
  }
  if (Array.isArray(settings.selected_entry_ids)) {
    selectedWorldbookEntryIds.value = settings.selected_entry_ids.map((id: any) => String(id ?? '')).filter(Boolean);
  }
  if (settings.include_context_two_layers !== undefined) {
    includeContextTwoLayers.value = normalizeIncludeContextTwoLayers(settings.include_context_two_layers);
  }
}

function saveGenerateSettings() {
  roleGenerateSystemPromptText.value = sanitizeGenerateSystemPromptText(roleGenerateSystemPromptText.value);
  roleGeneratePromptText.value = sanitizeGenerateBasePromptText(roleGeneratePromptText.value);
  roleGenerateTemplateText.value = sanitizeGenerateTemplateText(roleGenerateTemplateText.value);

  updateVariablesWith(
    vars => {
      _.set(vars, ROLE_GENERATE_SETTINGS_KEY, {
        system_prompt: roleGenerateSystemPromptText.value,
        base_prompt: roleGeneratePromptText.value,
        template: roleGenerateTemplateText.value,
        selected_entry_ids: selectedWorldbookEntryIds.value,
        include_context_two_layers: includeContextTwoLayers.value,
      });
      return vars;
    },
    { type: 'chat' },
  );
  toastr.success('已保存为默认生成配置');
}

function resetGenerateSettings() {
  roleGenerateSystemPromptText.value = ROLE_GENERATE_SYSTEM_PROMPT;
  roleGeneratePromptText.value = ROLE_GENERATE_PROMPT;
  roleGenerateTemplateText.value = WORLD_BOOK_TEMPLATE;
  selectedWorldbookEntryIds.value = [];
  includeContextTwoLayers.value = false;
  updateVariablesWith(
    vars => {
      _.set(vars, ROLE_GENERATE_SETTINGS_KEY, {
        system_prompt: roleGenerateSystemPromptText.value,
        base_prompt: roleGeneratePromptText.value,
        template: roleGenerateTemplateText.value,
        selected_entry_ids: selectedWorldbookEntryIds.value,
        include_context_two_layers: includeContextTwoLayers.value,
      });
      return vars;
    },
    { type: 'chat' },
  );
  toastr.info('已重置并保存为默认生成配置');
}

async function loadWorldbookEntryOptions() {
  if (isWorldbookLoading.value) return;
  isWorldbookLoading.value = true;
  try {
    const names = new Set<string>();
    const chatWb = getChatWorldbookName('current');
    if (chatWb) names.add(chatWb);

    const globalWb = getGlobalWorldbookNames();
    globalWb.forEach(name => name && names.add(name));

    try {
      const charWb = getCharWorldbookNames('current');
      if (charWb?.primary) names.add(charWb.primary);
      charWb?.additional?.forEach(name => name && names.add(name));
    } catch {
      // ignore
    }

    const items: WorldbookEntryOption[] = [];
    for (const name of Array.from(names)) {
      try {
        const entries = await getWorldbook(name);
        entries.forEach(entry => {
          const entryName = String(entry?.name ?? '').trim();
          if (isRoleGenerateExcludedWorldbookEntryName(entryName)) return;
          items.push({
            id: `${name}::${entry.uid}`,
            worldbook: name,
            entry,
            enabled: !!entry.enabled,
            label: `${name} / ${entry.name || `#${entry.uid}`}`,
          });
        });
      } catch (err) {
        console.warn('[CharactersSection] load worldbook failed', name, err);
      }
    }

    const preferredNorm = new Set(DEFAULT_WORLDBOOK_NAME_CANDIDATES.map(name => name.replace(/\s+/g, '')));
    items.sort((a, b) => {
      const aNorm = a.worldbook.replace(/\s+/g, '');
      const bNorm = b.worldbook.replace(/\s+/g, '');
      const aScore = preferredNorm.has(aNorm) ? 0 : 1;
      const bScore = preferredNorm.has(bNorm) ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return a.label.localeCompare(b.label, 'zh-Hans');
    });

    worldbookEntryOptions.value = items;

    const existingIds = new Set(items.map(item => item.id));
    selectedWorldbookEntryIds.value = selectedWorldbookEntryIds.value.filter(id => existingIds.has(id));

    if (selectedWorldbookEntryIds.value.length === 0) {
      const preferred = items.filter(item => {
        const name = item.worldbook.replace(/\s+/g, '');
        return preferredNorm.has(name);
      });
      const isDefaultEntry = (entryName: string) => {
        if (entryName.includes('世界观')) return true;
        if (entryName.includes('文明阶段')) return true;
        if (entryName.includes('庇护所') && entryName.includes('能力')) return true;
        return false;
      };
      const pick = preferred.length > 0 ? preferred : items;
      selectedWorldbookEntryIds.value = pick
        .filter(item => item.enabled)
        .filter(item => isDefaultEntry(String(item.entry?.name ?? '')))
        .map(item => item.id);
    }
  } finally {
    isWorldbookLoading.value = false;
  }
}

function resetGenerateRoleState() {
  generateRoleInput.value = '';
  generateRoleReviewInput.value = '';
  generateRoleError.value = '';
  generateRoleRawResponse.value = '';
  generateRoleReviewMessage.value = '';
  generateRoleReviewState.value = 'idle';
  generatedRoles.value = [];
  activeGeneratedIndex.value = 0;
  showPromptPanel.value = false;
  showTemplatePanel.value = false;
  showWorldbookPanel.value = false;
}

function openGenerateRole() {
  if (!isCreationMode.value) return;
  if (!addRoleOpen.value) addRoleOpen.value = true;
  resetGenerateRoleState();
  generateRoleOpen.value = true;
  const settings = readGenerateSettings();
  applyGenerateSettings(settings);
  migrateGenerateSettingsInChat(settings);
  loadWorldbookEntryOptions();
}

function closeGenerateRole() {
  generateRoleOpen.value = false;
  generateRoleError.value = '';
  generateRoleLoading.value = false;
  generateRoleReviewMessage.value = '';
  generateRoleReviewState.value = 'idle';
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
  generateRoleReviewState.value = 'idle';
  generateRoleReviewMessage.value = '';

  try {
    const result = await generateRoleRawWithRetry(input);
    generateRoleRawResponse.value = result;
    const items = parseGeneratedRolesFromRaw(result, generatedRoles.value);

    generatedRoles.value = items;
    activeGeneratedIndex.value = 0;
    generateRoleReviewInput.value = '';
    generateRoleReviewState.value = 'idle';
    generateRoleReviewMessage.value = REVIEW_STEP_INTRO_TEXT;
  } catch (err: any) {
    console.error('[CharactersSection] generate role failed', err);
    generateRoleError.value = err?.message ?? String(err);
  } finally {
    generateRoleLoading.value = false;
  }
}

async function generateRoleRawWithRetry(input: string): Promise<string> {
  const first = await generateRaw(buildRoleGenerateConfig(input));
  if (String(first ?? '').trim()) return first;

  const retryInput = `${input}\n\n【重试要求】上一轮输出为空。请严格输出 <ROLE_JSON>/<WB_KEYS>/<context> 三段，禁止空回复。`;
  const second = await generateRaw(buildRoleGenerateConfig(retryInput));
  if (String(second ?? '').trim()) {
    toastr.info('检测到首次空回复，已自动重试一次');
    return second;
  }

  throw new Error(
    '模型返回空回复（completion_tokens=0）。请检查预设中的 stop（如 <end>）和外部角色扮演提示词污染后重试。',
  );
}

async function onReviewGeneratedRoles() {
  if (generateRoleLoading.value) return;
  const reviewInputRaw = generateRoleReviewInput.value.trim();
  const reviewInput = replaceRoleGenerateAliases(reviewInputRaw).trim();
  if (reviewInputRaw && reviewInput !== reviewInputRaw) {
    generateRoleReviewInput.value = reviewInput;
  }
  if (generatedRoles.value.length === 0) {
    generateRoleError.value = '请先生成首稿。';
    return;
  }

  generateRoleLoading.value = true;
  generateRoleError.value = '';
  generateRoleReviewState.value = 'running';
  generateRoleReviewMessage.value = '正在执行检查修正…';

  try {
    const originalInput = generateRoleInput.value.trim();
    const result = await generateRaw(buildRoleReviewConfig(originalInput, reviewInput, generatedRoles.value));
    if (!String(result ?? '').trim()) {
      throw new Error('检查修正返回空回复，请调整修正意见后重试');
    }

    generateRoleRawResponse.value = result;
    const reviewedItems = parseGeneratedRolesFromRaw(result, generatedRoles.value);
    generatedRoles.value = reviewedItems;
    activeGeneratedIndex.value = Math.min(activeGeneratedIndex.value, Math.max(0, reviewedItems.length - 1));

    generateRoleReviewState.value = 'done';
    generateRoleReviewMessage.value =
      '校验修正完成！请检查并按需编辑下方角色变量与世界书文本，确认后点击“写入角色”或“写入全部”进行保存。变量可按需要继续修改。';
    toastr.success('校验修正完成，请检查并写入变量/世界书');
  } catch (err: any) {
    generateRoleReviewState.value = 'failed';
    const reason = err?.message ?? String(err);
    generateRoleReviewMessage.value = `检查修正失败：${reason}（已保留首稿，可直接写入）`;
    generateRoleError.value = reason;
    toastr.warning('检查失败，已保留首稿');
  } finally {
    generateRoleLoading.value = false;
  }
}

function getActiveGeneratedRole() {
  return generatedRoles.value[activeGeneratedIndex.value] ?? null;
}

async function writeGeneratedRole() {
  if (generateRoleLoading.value) return;
  const active = getActiveGeneratedRole();
  if (!active) return;
  const name = active.form.姓名.trim();
  if (!name) {
    generateRoleError.value = '角色姓名为空';
    return;
  }

  generateRoleLoading.value = true;
  generateRoleError.value = '';
  active.status = 'writing';
  active.errorMessage = '';

  try {
    const result = await writeRoleData({
      form: active.form,
      name,
      isTemp: active.isTemp,
      writeWorldbook: !active.excludeWorldbook,
      worldbookText: active.worldbookText,
      worldbookKeys: active.worldbookKeys,
    });

    if (result?.canceled) return;

    active.status = 'success';
    if (generatedRoles.value.length <= 1) {
      closeGenerateRole();
      closeAddRole();
      resetAddRoleForm();
      reloadIframe();
    }
  } catch (err: any) {
    console.error('[CharactersSection] write generated role failed', err);
    generateRoleError.value = err?.message ?? String(err);
    active.status = 'error';
    active.errorMessage = err?.message ?? String(err);
  } finally {
    generateRoleLoading.value = false;
  }
}

async function writeAllGeneratedRoles() {
  if (generateRoleLoading.value || generatedRoles.value.length === 0) return;
  generateRoleLoading.value = true;
  generateRoleError.value = '';
  for (const item of generatedRoles.value) {
    const name = item.form.姓名.trim();
    if (!name) {
      item.status = 'error';
      item.errorMessage = '角色姓名为空';
      continue;
    }
    item.status = 'writing';
    item.errorMessage = '';
    try {
      const result = await writeRoleData({
        form: item.form,
        name,
        isTemp: item.isTemp,
        writeWorldbook: !item.excludeWorldbook,
        worldbookText: item.worldbookText,
        worldbookKeys: item.worldbookKeys,
      });
      if (result?.canceled) {
        item.status = 'idle';
        continue;
      }
      item.status = 'success';
    } catch (err: any) {
      item.status = 'error';
      item.errorMessage = err?.message ?? String(err);
      console.error('[CharactersSection] write generated role failed', err);
    }
  }
  generateRoleLoading.value = false;
  closeGenerateRole();
  closeAddRole();
  resetAddRoleForm();
  if (typeof eventEmit === 'function') {
    eventEmit(ROLE_SELECTOR_OPEN_EVENT as any);
  }
  reloadIframe();
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
  const basePrompt = sanitizeGenerateBasePromptText(roleGeneratePromptText.value);
  const templatePrompt = sanitizeGenerateTemplateText(roleGenerateTemplateText.value);
  return `${basePrompt}\n\n${templatePrompt}\n\n用户输入如下：\n${userInput}`.trim();
}

function buildRoleReviewPrompt(originalInput: string, reviewInput: string, draftItems: GeneratedRoleItem[]) {
  const normalizedOriginalInput = replaceRoleGenerateAliases(String(originalInput ?? '').trim());
  const normalizedReviewInput = replaceRoleGenerateAliases(String(reviewInput ?? '').trim());
  const defaultReviewInput =
    '（留空，按默认设置进行校验修正：优先保证角色变量结构完整、关键字段合理、世界书内容可直接写入，并提出必要修正建议）';
  const effectiveReviewInput = normalizedReviewInput || defaultReviewInput;
  const effectiveOriginalInput = normalizedOriginalInput || normalizedReviewInput || '请基于首稿执行默认校验修正。';

  const draftText = draftItems
    .map((item, index) => {
      const roleJson = JSON.stringify(item.form, null, 2);
      const wbKeys = JSON.stringify(item.worldbookKeys ?? [], null, 2);
      const worldbookText = String(item.worldbookText ?? '').trim();
      return [
        `【首稿角色${index + 1}】`,
        `<ROLE_JSON>${roleJson}</ROLE_JSON>`,
        `<WB_KEYS>${wbKeys}</WB_KEYS>`,
        '<context>',
        'NOTE: 以下为当前世界书草稿',
        '```yaml',
        worldbookText || '# 当前为空',
        '```',
        '</context>',
      ].join('\n');
    })
    .join('\n\n');

  return [
    buildGeneratePrompt(effectiveOriginalInput),
    '',
    '【检查修正任务】',
    '请基于“首稿”进行一次定向检查与修正，目标是减少套路化命名、保证设定一致性、补齐关键信息。',
    '若某项已合理可保持；但最终必须完整输出可直接写入的最终稿。',
    `本轮修正意见：\n${effectiveReviewInput}`,
    '',
    '【首稿如下】',
    draftText,
  ]
    .join('\n')
    .trim();
}

function buildWorldbookSubsetText() {
  const selected = new Set(selectedWorldbookEntryIds.value);
  const parts = worldbookEntryOptions.value
    .filter(item => selected.has(item.id))
    .filter(item => !isRoleGenerateExcludedWorldbookEntryName(String(item.entry?.name ?? '')))
    .map(item => `【世界书:${item.worldbook}/${item.entry.name || `#${item.entry.uid}`}】\n${item.entry.content}`);
  return parts.join('\n\n').trim();
}

function buildRoleGenerateConfig(userInput: string): GenerateRawConfig {
  const worldbookText = buildWorldbookSubsetText();
  const systemPrompt = sanitizeGenerateSystemPromptText(roleGenerateSystemPromptText.value);
  const includeContext = includeContextTwoLayers.value;
  const ordered_prompts: NonNullable<GenerateRawConfig['ordered_prompts']> = [
    { role: 'system', content: systemPrompt },
    'world_info_before',
    ...(includeContext ? (['chat_history'] as const) : []),
    'user_input',
  ];
  return {
    user_input: buildGeneratePrompt(userInput),
    max_chat_history: includeContext ? 2 : 0,
    overrides: {
      persona_description: '',
      char_description: '',
      char_personality: '',
      scenario: '',
      dialogue_examples: '',
      world_info_before: worldbookText,
      world_info_after: '',
      chat_history: includeContext
        ? {
            with_depth_entries: false,
            author_note: '',
          }
        : {
            prompts: [],
            with_depth_entries: false,
            author_note: '',
          },
    },
    ordered_prompts,
  };
}

function buildRoleReviewConfig(
  originalInput: string,
  reviewInput: string,
  draftItems: GeneratedRoleItem[],
): GenerateRawConfig {
  const worldbookText = buildWorldbookSubsetText();
  const systemPrompt = sanitizeGenerateSystemPromptText(roleGenerateSystemPromptText.value);
  const includeContext = includeContextTwoLayers.value;
  const ordered_prompts: NonNullable<GenerateRawConfig['ordered_prompts']> = [
    { role: 'system', content: systemPrompt },
    'world_info_before',
    ...(includeContext ? (['chat_history'] as const) : []),
    'user_input',
  ];
  return {
    user_input: buildRoleReviewPrompt(originalInput, reviewInput, draftItems),
    max_chat_history: includeContext ? 2 : 0,
    overrides: {
      persona_description: '',
      char_description: '',
      char_personality: '',
      scenario: '',
      dialogue_examples: '',
      world_info_before: worldbookText,
      world_info_after: '',
      chat_history: includeContext
        ? {
            with_depth_entries: false,
            author_note: '',
          }
        : {
            prompts: [],
            with_depth_entries: false,
            author_note: '',
          },
    },
    ordered_prompts,
  };
}

function parseGeneratedRolesFromRaw(result: string, previousItems: GeneratedRoleItem[] = []): GeneratedRoleItem[] {
  const roleBlocks = extractRoleJsonBlocks(result);
  if (roleBlocks.length === 0) throw new Error('未找到 ROLE_JSON 区块');

  const keyBlocks = extractWorldbookKeyBlocks(result);
  const contextBlocks = extractTagContents(result, 'context');
  const previousByName = new Map(previousItems.map(item => [String(item.form.姓名 ?? '').trim(), item]));
  const items: GeneratedRoleItem[] = [];

  roleBlocks.forEach((block, index) => {
    const roleObj = safeParseRoleJson(block);
    const normalizedForm = normalizeGeneratedRole(roleObj);
    if (!normalizedForm.姓名) {
      throw new Error(`角色${index + 1}姓名为空`);
    }

    const keyBlock = keyBlocks[index] ?? keyBlocks[keyBlocks.length - 1] ?? '';
    const contextBlock = contextBlocks[index] ?? contextBlocks[contextBlocks.length - 1] ?? '';
    const yamlContent = validateRoleDesignWorldbookText(normalizedForm.姓名, extractYamlBlock(contextBlock));
    const englishName = extractEnglishNameFromYaml(yamlContent);
    const parsedKeys = parseWorldbookKeys(stripCodeFence(keyBlock));
    const ensuredKeys = _.uniq([normalizedForm.姓名, englishName, ...parsedKeys].filter(Boolean)).slice(0, 12);
    const previous = previousByName.get(normalizedForm.姓名) ?? previousItems[index];

    items.push({
      id: `${normalizedForm.姓名}-${index}`,
      form: normalizedForm,
      rawJson: JSON.stringify(roleObj, null, 2),
      worldbookText: yamlContent,
      worldbookKeys: ensuredKeys,
      excludeWorldbook: previous?.excludeWorldbook ?? false,
      isTemp: previous?.isTemp ?? false,
      status: 'idle',
      errorMessage: '',
    });
  });

  return items;
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

function extractTagContents(source: string, tag: string) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const list: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    list.push(match[1].trim());
  }
  return list;
}

function extractYamlBlock(source: string) {
  const re = /```yaml\s*([\s\S]*?)```/i;
  const match = source.match(re);
  return match ? match[1].trim() : source.trim();
}

function extractEnglishNameFromYaml(source: string) {
  const match = source.match(/english name:\s*([^\n\r]+)/i);
  if (match) return String(match[1]).trim();
  const matchZh = source.match(/英文名:\s*([^\n\r]+)/i);
  return matchZh ? String(matchZh[1]).trim() : '';
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

function extractRoleJsonBlocks(source: string) {
  const blocks = extractTagContents(source, 'ROLE_JSON');
  if (blocks.length) return blocks;
  const listBlock = extractTagContent(source, 'ROLE_JSON_LIST');
  if (listBlock) {
    try {
      const parsed = JSON.parse(stripCodeFence(listBlock));
      if (Array.isArray(parsed)) {
        return parsed.map(item => JSON.stringify(item));
      }
    } catch {
      // ignore
    }
  }
  const fallback = extractRoleJsonFallback(source);
  return fallback ? [fallback] : [];
}

function extractWorldbookKeyBlocks(source: string) {
  const blocks = extractTagContents(source, 'WB_KEYS');
  if (blocks.length) return blocks;
  const fallback = extractKeysFallback(source);
  return fallback ? [fallback] : [];
}

function selectAllEnabledWorldbookEntries() {
  selectedWorldbookEntryIds.value = worldbookEntryOptions.value.filter(item => item.enabled).map(item => item.id);
}

function clearWorldbookSelection() {
  selectedWorldbookEntryIds.value = [];
}

async function copyFinalPrompt() {
  try {
    await navigator.clipboard.writeText(finalGeneratePromptText.value);
    toastr.success('已复制最终提示词');
  } catch (err) {
    console.error('[CharactersSection] copy prompt failed', err);
    toastr.error('复制失败，请手动复制');
  }
}

function getWorldbookKeysText(item: GeneratedRoleItem) {
  return item.worldbookKeys.join(', ');
}

function onWorldbookKeysInput(item: GeneratedRoleItem, event: Event) {
  const value = (event.target as HTMLInputElement | null)?.value ?? '';
  item.worldbookKeys = value
    .split(/[,\n]/)
    .map(token => String(token ?? '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function triggerImportRole() {
  if (!roleImportInput.value) return;
  roleImportInput.value.value = '';
  roleImportInput.value.click();
}

async function onImportRoleFile(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const roles = normalizeImportedRoles(parsed);
    if (roles.length === 0) {
      throw new Error('未解析到可用角色数据');
    }
    generatedRoles.value = roles;
    activeGeneratedIndex.value = 0;
    toastr.success(`已导入 ${roles.length} 个角色`);
  } catch (err: any) {
    console.error('[CharactersSection] import roles failed', err);
    toastr.error(err?.message ?? '导入失败');
  }
}

function normalizeImportedRoles(payload: any): GeneratedRoleItem[] {
  const list: any[] = [];

  if (Array.isArray(payload)) {
    list.push(...payload);
  } else if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.roles)) {
      list.push(...payload.roles);
    } else if (payload.role || payload.form || payload.姓名) {
      list.push(payload);
    }
  }

  const normalized: GeneratedRoleItem[] = [];
  list.forEach((item, index) => {
    const rawForm = item?.form ?? item?.role ?? item;
    if (!rawForm || typeof rawForm !== 'object') return;
    const normalizedForm = normalizeGeneratedRole(rawForm);
    if (!normalizedForm.姓名) return;

    const wbText = String(
      item?.worldbook?.text ?? item?.worldbookText ?? payload?.worldbook?.text ?? payload?.worldbookText ?? '',
    ).trim();
    const wbKeysRaw =
      item?.worldbook?.keys ?? item?.worldbookKeys ?? payload?.worldbook?.keys ?? payload?.worldbookKeys;
    const wbKeys = Array.isArray(wbKeysRaw)
      ? wbKeysRaw.map((key: any) => String(key ?? '').trim()).filter(Boolean)
      : [];

    normalized.push({
      id: `${normalizedForm.姓名}-${index}`,
      form: normalizedForm,
      rawJson: JSON.stringify(rawForm, null, 2),
      worldbookText: wbText,
      worldbookKeys: wbKeys,
      excludeWorldbook: !!item?.excludeWorldbook,
      isTemp: !!item?.isTemp,
      status: 'idle',
      errorMessage: '',
    });
  });

  return normalized;
}

function exportGeneratedRoles() {
  if (generatedRoles.value.length === 0) {
    toastr.error('当前没有可导出的角色');
    return;
  }
  const payload = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    roles: generatedRoles.value.map(item => ({
      form: item.form,
      worldbook: {
        text: item.worldbookText,
        keys: item.worldbookKeys,
      },
      excludeWorldbook: item.excludeWorldbook,
      isTemp: item.isTemp,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `角色导出_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toastr.success('已导出角色 JSON');
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

function buildManualWorldbookText(name: string, form: AddRoleForm = addRoleForm.value): string {
  const payload = buildRolePayload(name, form);
  const imprint = payload.秩序刻印 === '' ? 0 : payload.秩序刻印;
  const health = payload.健康 === '' ? 100 : payload.健康;
  const lines = [
    `<角色档案 - ${name}>`,
    '角色档案:',
    `  姓名: ${name}`,
    `  关系: ${payload.关系}`,
    `  关系倾向: ${payload.关系倾向}`,
    `  秩序刻印: ${imprint}`,
    `  健康: ${health}`,
    payload.所在房间 ? `  所在房间: ${payload.所在房间}` : '',
    payload.神态样貌 ? `  神态样貌: ${payload.神态样貌}` : '',
    payload.内心想法 ? `  内心想法: ${payload.内心想法}` : '',
    `</角色档案 - ${name}>`,
  ];
  return lines.filter(Boolean).join('\n');
}

type NumberRangeValidationResult = { ok: true; value: string | number } | { ok: false; error: string };

type RoleFormValidationResult =
  | {
      ok: true;
      imprintCheck: Extract<NumberRangeValidationResult, { ok: true }>;
      healthCheck: Extract<NumberRangeValidationResult, { ok: true }>;
    }
  | { ok: false; error: string };

function validateNumberRange(label: string, value: string, min: number, max: number): NumberRangeValidationResult {
  const s = String(value ?? '').trim();
  if (!s) return { ok: true, value: '' as string | number };
  const num = Number(s);
  if (!Number.isFinite(num)) return { ok: false, error: `${label}必须是数字` };
  if (num < min || num > max) return { ok: false, error: `${label}范围应为 ${min}~${max}` };
  return { ok: true, value: num };
}

function validateRoleForm(form: AddRoleForm): RoleFormValidationResult {
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

  const worldbook_name = await resolveDefaultWorldbookName();
  await createWorldbookEntries(
    worldbook_name,
    [
      {
        // 与“角色档案_动态注入”保持一致：条目名固定为 `角色档案 - <姓名>`，默认不启用，由 @INJECT 负责按需注入。
        name: `角色档案 - ${name}`,
        enabled: false,
        strategy: {
          type: 'selective',
          keys: ensuredKeys,
          keys_secondary: { logic: 'and_any', keys: [] },
          scan_depth: 'same_as_global',
        },
        position: {
          type: 'after_character_definition',
          role: 'system',
          depth: 0,
          order: 10,
        },
        recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
        content: wbContent,
      },
    ],
    { render: 'immediate' },
  );
}

type DossierIndexItem = {
  name: string;
  aliases: string[];
  identity?: string;
  summary?: string;
  location?: string;
  defaultSelected?: boolean;
};

function parseDossierIndex(text: string): DossierIndexItem[] {
  try {
    const data = JSON.parse(String(text ?? ''));
    if (!Array.isArray(data)) return [];
    const out: DossierIndexItem[] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const name = String((row as any).name ?? '').trim();
      if (!name) continue;
      const aliases = Array.isArray((row as any).aliases) ? (row as any).aliases : [];
      out.push({
        name,
        aliases: aliases.map((v: any) => String(v ?? '').trim()).filter(Boolean),
        identity: typeof (row as any).identity === 'string' ? String((row as any).identity).trim() : undefined,
        summary: typeof (row as any).summary === 'string' ? String((row as any).summary).trim() : undefined,
        location: typeof (row as any).location === 'string' ? String((row as any).location).trim() : undefined,
        defaultSelected: (row as any).defaultSelected === true,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function buildDossierIndexText(list: DossierIndexItem[]): string {
  // 仅输出 JSON，供 @INJECT EJS 用 JSON.parse() 读取。
  return JSON.stringify(list, null, 2);
}

function normalizeDossierAliases(roleName: string, keys: string[]): string[] {
  const out = _.uniq(
    (Array.isArray(keys) ? keys : [])
      .map(k => String(k ?? '').trim())
      .filter(Boolean)
      .filter(k => k !== roleName),
  )
    .filter(k => k.length >= 2)
    .slice(0, 12);
  return out;
}

async function ensureDossierIndexEntry(worldbookName: string) {
  const worldbook = await getWorldbook(worldbookName);
  const exists = worldbook.some(entry => String(entry?.name ?? '').trim() === '角色档案索引');
  if (exists) return;

  await createWorldbookEntries(
    worldbookName,
    [
      {
        name: '角色档案索引',
        enabled: false,
        strategy: {
          type: 'constant',
          keys: [],
          keys_secondary: { logic: 'and_any', keys: [] },
          scan_depth: 'same_as_global',
        },
        position: {
          type: 'after_character_definition',
          role: 'system',
          depth: 0,
          order: 8,
        },
        recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
        content: '[]',
      },
    ],
    { render: 'immediate' },
  );
}

async function appendRoleToDossierIndex(options: {
  roleName: string;
  keys: string[];
  identity?: string;
  summary?: string;
  location?: string;
  defaultSelected?: boolean;
}) {
  const roleName = String(options.roleName ?? '').trim();
  if (!roleName) return;

  const worldbookName = await resolveDefaultWorldbookName();
  await ensureDossierIndexEntry(worldbookName);

  const aliases = normalizeDossierAliases(roleName, options.keys ?? []);
  const identity = typeof options.identity === 'string' ? options.identity.trim() : '';
  const summary = typeof options.summary === 'string' ? options.summary.trim() : '';
  const location = typeof options.location === 'string' ? options.location.trim() : '';

  await updateWorldbookWith(
    worldbookName,
    worldbook => {
      const idx = worldbook.findIndex(entry => String(entry?.name ?? '').trim() === '角色档案索引');
      if (idx === -1) return worldbook;

      const entry = worldbook[idx];
      const list = parseDossierIndex(String(entry?.content ?? ''));
      const found = list.find(item => item.name === roleName);
      if (!found) {
        const next: DossierIndexItem = { name: roleName, aliases };
        if (identity) next.identity = identity;
        if (summary) next.summary = summary;
        if (location) next.location = location;
        if (options.defaultSelected === true) next.defaultSelected = true;
        list.push(next);
      } else {
        found.aliases = _.uniq([...(found.aliases ?? []), ...aliases])
          .map(s => String(s ?? '').trim())
          .filter(Boolean)
          .filter(s => s.length >= 2)
          .slice(0, 12);
        if (identity) found.identity = identity;
        if (summary) found.summary = summary;
        if (location) found.location = location;
        if (options.defaultSelected === true) found.defaultSelected = true;
      }

      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'));
      worldbook[idx] = { ...entry, content: buildDossierIndexText(list) };
      return worldbook;
    },
    { render: 'immediate' },
  );
}

async function resolveDefaultWorldbookName() {
  const originalNames = getWorldbookNames();
  const names = originalNames.map(name => name.replace(/\s+/g, ''));
  for (const candidate of DEFAULT_WORLDBOOK_NAME_CANDIDATES) {
    const idx = names.indexOf(candidate.replace(/\s+/g, ''));
    if (idx !== -1) return originalNames[idx] ?? candidate;
  }

  try {
    const charWb = getCharWorldbookNames('current');
    if (charWb?.primary) {
      const primaryNorm = charWb.primary.replace(/\s+/g, '');
      if (DEFAULT_WORLDBOOK_NAME_CANDIDATES.some(name => name.replace(/\s+/g, '') === primaryNorm)) {
        return charWb.primary;
      }
    }
  } catch {
    // ignore
  }

  throw new Error(
    `未找到默认世界书（${DEFAULT_WORLDBOOK_NAME_CANDIDATES.join(' / ')}），请确认当前角色卡已绑定该世界书`,
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
  if (getViewMessageState().mode === 'history') {
    throw new Error('回看模式仅查看，请先返回最新楼层后再进行角色写入。');
  }

  await waitGlobalInitialized('Mvu');
  const message_id = resolveViewMessageId({ preferHistory: false });
  const targetMessageId = Number(message_id);
  if (!Number.isFinite(targetMessageId)) {
    throw new Error('未能解析最新楼层号');
  }
  const mvu_data = Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
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

  await Mvu.replaceMvuData(mvu_data, { type: 'message', message_id: targetMessageId });

  let wbError = '';
  let idxError = '';
  if (writeWorldbook) {
    try {
      await writeWorldbookEntry(name, String(worldbookText ?? ''), worldbookKeys ?? []);
    } catch (err: any) {
      wbError = err?.message ?? String(err);
    }

    if (!wbError) {
      try {
        await appendRoleToDossierIndex({
          roleName: name,
          keys: worldbookKeys ?? [],
          summary: String(form?.内心想法 ?? form?.神态样貌 ?? ''),
          location: String(form?.所在房间 ?? ''),
        });
      } catch (err: any) {
        idxError = err?.message ?? String(err);
      }
    }
  }

  if (wbError) {
    toastr.warning(`角色已写入，但世界书失败：${wbError}`);
  } else if (idxError) {
    toastr.warning(`角色已写入，但角色档案索引更新失败：${idxError}`);
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
      writeWorldbook: true,
      worldbookText: buildManualWorldbookText(name, addRoleForm.value),
      worldbookKeys: [name],
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

function isTempNpcKey(key: CharacterKey): key is string {
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
  if (getViewMessageState().mode === 'history') {
    toastr.info('回看模式仅查看，请先返回最新楼层后再删除角色。');
    return;
  }

  const ok = await confirmDeleteRole(name, isTemp);
  if (!ok) return;

  try {
    deletingRoleName.value = name;
    await waitGlobalInitialized('Mvu');

    const message_id = resolveViewMessageId({ preferHistory: false });
    const targetMessageId = Number(message_id);
    if (!Number.isFinite(targetMessageId)) {
      throw new Error('未能解析最新楼层号');
    }
    const mvu_data = Mvu.getMvuData({ type: 'message', message_id: targetMessageId });

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

    await Mvu.replaceMvuData(mvu_data, { type: 'message', message_id: targetMessageId });
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
  worldInfoModalOpen.value = false;
  reportDigestModalOpen.value = false;
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

.section-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.section-view-btn {
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid rgba(139, 233, 253, 0.4);
  background: rgba(139, 233, 253, 0.14);
  color: #e8f7ff;
  font-size: 0.78em;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    background-color 0.12s ease;
}

.section-view-btn:hover {
  transform: translateY(-1px);
  background: rgba(139, 233, 253, 0.22);
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

.role-add-btn.secondary {
  border-color: rgba(188, 161, 255, 0.5);
  background: rgba(188, 161, 255, 0.12);
}

.role-add-btn.secondary:hover {
  background: rgba(188, 161, 255, 0.2);
}

.creation-entry {
  border-radius: 12px;
  border: 1px dashed rgba(139, 233, 253, 0.32);
  background: rgba(139, 233, 253, 0.08);
  padding: 10px 12px;
  display: grid;
  gap: 10px;
}

.creation-entry-hint {
  font-size: 0.84em;
  line-height: 1.45;
  color: rgba(226, 243, 255, 0.92);
}

.creation-entry-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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

.role-modal-mask--overview {
  z-index: 997;
}

.overview-modal {
  width: min(84vw, 980px);
}

.overview-modal-body {
  padding: 10px 12px;
}

.role-modal {
  width: min(82vw, 920px);
  max-height: 76vh;
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
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(0, 180, 216, 0.25);
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
  width: min(82vw, 940px);
  max-height: 76vh;
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

.role-generate-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.role-header-btn {
  padding: 6px 12px;
  border-radius: 10px;
  font-size: 0.88em;
}

.role-file-input {
  display: none;
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

.role-generate-actions.toolbar {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.role-generate-toggle-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.role-generate-input {
  min-height: 72px;
}

.role-generate-review-input {
  min-height: 76px;
}

.role-generate-write-hint {
  margin: 0 auto 0 0;
  max-width: 520px;
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

.role-generate-settings {
  display: grid;
  gap: 14px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  margin-bottom: 16px;
}

.role-generate-setting-item {
  display: grid;
  gap: 8px;
}

.role-generate-worldbook-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.role-generate-meta {
  font-size: 0.8em;
  color: rgba(255, 255, 255, 0.6);
}

.role-generate-worldbook-list {
  max-height: 180px;
  overflow: auto;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px;
  display: grid;
  gap: 6px;
  background: rgba(255, 255, 255, 0.03);
}

.role-generate-worldbook-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  color: rgba(255, 255, 255, 0.75);
}

.role-worldbook-label.disabled {
  opacity: 0.5;
  text-decoration: line-through;
}

.role-generate-input-block {
  margin-top: 16px;
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  background: linear-gradient(135deg, rgba(14, 116, 144, 0.2), rgba(15, 23, 42, 0.3));
  box-shadow: 0 12px 24px rgba(14, 116, 144, 0.25);
}

.role-generate-input-block.primary .role-generate-title {
  font-size: 1em;
  color: rgba(255, 255, 255, 0.92);
}

.role-generate-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.role-tab-btn {
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.85em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.role-tab-btn.active {
  border-color: rgba(80, 250, 123, 0.6);
  background: rgba(80, 250, 123, 0.12);
}

.role-status {
  font-size: 0.7em;
  padding: 2px 6px;
  border-radius: 999px;
}

.role-status.success {
  background: rgba(80, 250, 123, 0.2);
  color: #b8ffcf;
}

.role-status.error {
  background: rgba(255, 90, 90, 0.2);
  color: #ffc4c4;
}

.role-generate-panel {
  display: grid;
  gap: 12px;
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

.role-btn.danger {
  border-color: rgba(255, 90, 90, 0.55);
  background-color: rgba(255, 90, 90, 0.18);
  color: rgba(255, 215, 215, 0.95);
}
.role-btn.ghost {
  background: transparent;
}

.role-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .section-header {
    align-items: flex-start;
  }

  .section-header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .section-view-btn,
  .role-add-btn {
    font-size: 0.76em;
    padding: 5px 10px;
  }
}
</style>
