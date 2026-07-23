import type { PhoneAppDefinition, PhoneAppRenderContext, PhoneAppServices } from './phoneApps';
import type { PersonProfile, SmartTask } from '../intelligence/profileTypes';

/**
 * 扩展的 APP 服务接口，包含档案和任务功能
 */
export interface IntelligentAppServices extends PhoneAppServices {
  /** 列出所有人员档案 */
  listProfiles(): Promise<readonly PersonProfile[]> | readonly PersonProfile[];
  /** 获取单个档案 */
  getProfile(personId: string): Promise<PersonProfile | null> | PersonProfile | null;
  /** 刷新档案（触发 AI 增强） */
  refreshProfile(personId: string): Promise<void>;
  /** 列出智能任务 */
  listSmartTasks(): Promise<readonly SmartTask[]> | readonly SmartTask[];
  /** 刷新智能任务（重新解析聊天） */
  refreshSmartTasks(): Promise<void>;
  /** 删除任务 */
  deleteSmartTask(taskId: string): Promise<void>;
}

function text<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, value: string) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function list(document: Document): HTMLUListElement {
  const node = document.createElement('ul');
  node.className = 'phone-list';
  return node;
}

function empty(document: Document, value: string): HTMLElement {
  const node = text(document, 'p', value);
  node.className = 'phone-empty';
  return node;
}

/**
 * 创建人员档案 APP
 */
export function createProfileApp(services: IntelligentAppServices): PhoneAppDefinition {
  return {
    route: 'profiles',
    title: '档案',
    glyph: '◎',
    async render(context: PhoneAppRenderContext) {
      const { document } = context;
      const profiles = await services.listProfiles();

      if (profiles.length === 0) {
        return empty(document, '暂无人员档案');
      }

      const container = document.createElement('div');
      container.className = 'phone-profiles';

      // 刷新所有档案按钮
      const refreshAll = text(document, 'button', '🔄 刷新所有档案');
      refreshAll.className = 'phone-button phone-button--primary';
      refreshAll.type = 'button';
      refreshAll.style.cssText = 'width: 100%; margin-bottom: 12px;';
      context.listen(refreshAll, 'click', () => {
        refreshAll.disabled = true;
        refreshAll.textContent = '刷新中...';
        const refreshPromises = profiles.map(p => services.refreshProfile(p.id));
        void Promise.all(refreshPromises)
          .then(() => {
            context.announce('所有档案已更新');
            context.requestRender();
          })
          .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
          .finally(() => {
            if (context.isActive()) {
              refreshAll.disabled = false;
              refreshAll.textContent = '🔄 刷新所有档案';
            }
          });
      });
      container.append(refreshAll);

      // 档案列表
      const profileList = list(document);
      for (const profile of profiles) {
        const item = document.createElement('li');
        item.className = 'phone-profile-item';

        // 头部：姓名 + 刷新按钮
        const header = document.createElement('div');
        header.className = 'phone-profile-header';
        const nameEl = text(document, 'strong', profile.name);
        nameEl.style.cssText = 'font-size: 16px;';
        const refreshBtn = text(document, 'button', '🔄');
        refreshBtn.className = 'phone-button';
        refreshBtn.type = 'button';
        refreshBtn.style.cssText = 'padding: 4px 8px; font-size: 12px;';
        refreshBtn.setAttribute('aria-label', `刷新${profile.name}的档案`);
        context.listen(refreshBtn, 'click', () => {
          refreshBtn.disabled = true;
          void services
            .refreshProfile(profile.id)
            .then(() => {
              context.announce(`${profile.name}的档案已更新`);
              context.requestRender();
            })
            .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              if (context.isActive()) refreshBtn.disabled = false;
            });
        });
        header.append(nameEl, refreshBtn);

        // 内容区域
        const content = document.createElement('div');
        content.className = 'phone-profile-content';
        content.style.cssText = 'margin-top: 8px; font-size: 14px; line-height: 1.6;';

        const addField = (label: string, value: string, emoji = '') => {
          const field = document.createElement('p');
          field.style.cssText = 'margin: 4px 0;';
          const labelSpan = text(document, 'span', `${emoji} ${label}：`);
          labelSpan.style.cssText = 'color: #888; font-size: 13px;';
          const valueSpan = text(document, 'span', value);
          field.append(labelSpan, valueSpan);
          content.append(field);
        };

        addField('基本信息', profile.basicInfo, '👤');
        addField('性格', profile.personality, '💭');
        addField('当前状态', profile.currentStatus, '📍');
        addField('关系', profile.relationship, '🤝');
        addField('最近互动', profile.recentInteraction, '💬');

        // 数据来源标记
        const sources: string[] = [];
        if (profile.sources.fromMvu) sources.push('MVU');
        if (profile.sources.fromChat) sources.push('微信');
        if (profile.sources.fromBroadcast) sources.push('广播');
        if (profile.sources.fromStory) sources.push('正文');
        if (sources.length > 0) {
          const sourcesEl = text(document, 'p', `数据来源: ${sources.join(' · ')}`);
          sourcesEl.style.cssText = 'margin-top: 8px; font-size: 12px; color: #999;';
          content.append(sourcesEl);
        }

        // 更新时间
        const updatedTime = new Date(profile.lastUpdated).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const timeEl = text(document, 'p', `更新时间: ${updatedTime}`);
        timeEl.style.cssText = 'margin-top: 4px; font-size: 11px; color: #aaa;';
        content.append(timeEl);

        item.append(header, content);
        profileList.append(item);
      }

      container.append(profileList);
      return container;
    },
  };
}

/**
 * 创建智能任务 APP
 */
export function createSmartTasksApp(services: IntelligentAppServices): PhoneAppDefinition {
  return {
    route: 'smart-tasks',
    title: '任务',
    glyph: '✓',
    async render(context: PhoneAppRenderContext) {
      const { document } = context;
      const tasks = await services.listSmartTasks();

      const container = document.createElement('div');
      container.className = 'phone-smart-tasks';

      // 刷新任务按钮
      const refreshBtn = text(document, 'button', '🔄 重新解析聊天');
      refreshBtn.className = 'phone-button phone-button--primary';
      refreshBtn.type = 'button';
      refreshBtn.style.cssText = 'width: 100%; margin-bottom: 12px;';
      context.listen(refreshBtn, 'click', () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '解析中...';
        void services
          .refreshSmartTasks()
          .then(() => {
            context.announce('任务已更新');
            context.requestRender();
          })
          .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
          .finally(() => {
            if (context.isActive()) {
              refreshBtn.disabled = false;
              refreshBtn.textContent = '🔄 重新解析聊天';
            }
          });
      });
      container.append(refreshBtn);

      if (tasks.length === 0) {
        container.append(empty(document, '暂无可执行任务'));
        return container;
      }

      // 按类型分组
      const mvuTasks = tasks.filter(t => t.type === 'mvu-stage');
      const chatTasks = tasks.filter(t => t.type === 'chat-derived');
      const broadcastTasks = tasks.filter(t => t.type === 'broadcast-derived');

      const renderTaskSection = (title: string, sectionTasks: readonly SmartTask[]) => {
        if (sectionTasks.length === 0) return;

        const heading = text(document, 'h2', title);
        heading.style.cssText = 'font-size: 15px; margin: 16px 0 8px; color: #666;';
        container.append(heading);

        const taskList = list(document);
        for (const task of sectionTasks) {
          const item = document.createElement('li');
          item.className = 'phone-task-item';
          item.style.cssText = 'padding: 12px; border-bottom: 1px solid #eee;';

          // 标题行
          const titleRow = document.createElement('div');
          titleRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

          const titleEl = text(document, 'strong', task.title);
          const priorityColors = { high: '#ff3b30', medium: '#ff9500', low: '#34c759' };
          const priorityLabels = { high: '🔴', medium: '🟡', low: '🟢' };
          const priorityEl = text(document, 'span', priorityLabels[task.priority]);
          priorityEl.style.cssText = `color: ${priorityColors[task.priority]}; font-size: 14px;`;

          titleRow.append(titleEl, priorityEl);

          // 详情
          const detailEl = text(document, 'p', task.detail);
          detailEl.style.cssText = 'margin: 6px 0; font-size: 13px; color: #666;';

          // 相关人物
          if (task.relatedPersons.length > 0) {
            const personsEl = text(document, 'p', `相关: ${task.relatedPersons.join('、')}`);
            personsEl.style.cssText = 'margin: 4px 0; font-size: 12px; color: #888;';
            item.append(titleRow, detailEl, personsEl);
          } else {
            item.append(titleRow, detailEl);
          }

          // 操作按钮
          const actions = document.createElement('div');
          actions.style.cssText = 'margin-top: 8px; display: flex; gap: 8px;';

          // 执行按钮（送入输入框）
          if (task.actionText) {
            const executeBtn = text(document, 'button', '📝 执行');
            executeBtn.className = 'phone-button phone-button--primary';
            executeBtn.type = 'button';
            executeBtn.style.cssText = 'flex: 1; font-size: 13px;';
            context.listen(executeBtn, 'click', () => {
              executeBtn.disabled = true;
              void services
                .submitActionToHost({
                  kind: 'composer.insert',
                  text: task.actionText!,
                  sourceKey: `smart-task-${task.id}`,
                  mode: 'replace',
                })
                .then(() => context.announce('已送入输入框'))
                .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
                .finally(() => {
                  if (context.isActive()) executeBtn.disabled = false;
                });
            });
            actions.append(executeBtn);
          }

          // 删除按钮
          const deleteBtn = text(document, 'button', '🗑️');
          deleteBtn.className = 'phone-button';
          deleteBtn.type = 'button';
          deleteBtn.style.cssText = 'padding: 6px 12px; font-size: 13px;';
          deleteBtn.setAttribute('aria-label', '删除任务');
          context.listen(deleteBtn, 'click', () => {
            deleteBtn.disabled = true;
            void services
              .deleteSmartTask(task.id)
              .then(() => context.requestRender())
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
              .finally(() => {
                if (context.isActive()) deleteBtn.disabled = false;
              });
          });
          actions.append(deleteBtn);

          item.append(actions);
          taskList.append(item);
        }
        container.append(taskList);
      };

      renderTaskSection('📋 MVU 阶段任务', mvuTasks);
      renderTaskSection('💬 微信聊天任务', chatTasks);
      renderTaskSection('📡 广播任务', broadcastTasks);

      return container;
    },
  };
}
