import { WECHAT_APP_ICON_SRC } from '../assets/wechatIcon';
import type { PhoneHostAction } from '../core/types';
import type { PhoneDb } from '../data/phoneDb';
import { collectProfiles } from './profileHelper';

export type PhoneRoute =
  | 'home'
  | 'messages'
  | 'contacts'
  | 'broadcasts'
  | 'tasks'
  | 'profiles'
  | 'settings'
  | 'diagnostics';

export interface PhoneConversationView {
  id: string;
  kind: 'private' | 'eden-group';
  title: string;
  preview: string;
  unread: number;
  status?: 'sent' | 'pending' | 'failed';
}

export interface PhoneMessageView {
  id: string;
  sender: string;
  content: string;
  direction: 'incoming' | 'outgoing';
  status: 'sent' | 'pending' | 'failed';
}

export interface PhoneContactView {
  id: string;
  name: string;
  detail: string;
  online: boolean;
  canSend: boolean;
  added: boolean;
  inEdenGroup: boolean;
}

export interface PhoneBroadcastView {
  id: string;
  source: string;
  content: string;
  trust: 'confirmed' | 'unverified';
  kind?: 'deterministic' | 'profile-radio';
  generatedAt?: number;
  sections?: readonly { title: string; body: string }[];
}

export interface PhoneTaskView {
  id: string;
  title: string;
  detail: string;
  sourceKey: string;
  actionText: string;
  actionMode?: PhoneHostAction['mode'];
}

export interface PhoneSettingsView {
  provider: string;
  apiUrl: string;
  model: string;
  parameters: string;
  theme: 'system' | 'light' | 'dark';
  notifications: boolean;
  hasApiKey: boolean;
}

export interface PhoneDiagnosticsView {
  runtimeState: string;
  snapshotVersion: string;
  pendingLoreCount: number;
  pendingLoreRetryCount: number;
  moduleStates: readonly string[];
  recentErrors: readonly string[];
}

export interface PhoneProfileView {
  id: string;
  name: string;
  basicInfo: string;
  personalityBaseline: string;
  personalityTuning: string;
  currentStatus: string;
  relationship: string;
  storyInteractionSummary: string;
  chatInteractionSummary: string;
  playerActionAdvice: string;
  lastWechatRound: readonly string[];
  sourceRange: string;
  refreshStatus: 'idle' | 'refreshing' | 'success' | 'failed';
  lastError?: string;
  lastUpdated: number;
}

export interface PhoneProfileSettingsView {
  storyProgress: number;
  autoRefreshEvery: number;
  promptProfileMaxChars: number;
}

export interface PhoneAppServices {
  listConversations(): Promise<readonly PhoneConversationView[]> | readonly PhoneConversationView[];
  listMessages(conversationId: string): Promise<readonly PhoneMessageView[]> | readonly PhoneMessageView[];
  listContacts(): Promise<readonly PhoneContactView[]> | readonly PhoneContactView[];
  listBroadcasts(): Promise<readonly PhoneBroadcastView[]> | readonly PhoneBroadcastView[];
  listTasks(): Promise<readonly PhoneTaskView[]> | readonly PhoneTaskView[];
  getSettings(): Promise<PhoneSettingsView> | PhoneSettingsView;
  getDiagnostics(): Promise<PhoneDiagnosticsView> | PhoneDiagnosticsView;
  openConversation(conversationId: string): Promise<void>;
  openOrCreateConversation(contactId: string): Promise<string>;
  addContact(contactId: string): Promise<void>;
  setContactGroupMembership(contactId: string, included: boolean): Promise<void>;
  retryFailedMessage(conversationId: string): Promise<void>;
  sendMessage(conversationId: string, content: string): Promise<void>;
  retryMessage(conversationId: string, messageId: string): Promise<void>;
  cancelMessage(conversationId: string, messageId: string): Promise<void>;
  watchConversation(conversationId: string, listener: () => void): () => void;
  retryPendingLore(): Promise<void>;
  saveSettings(settings: PhoneSettingsView, apiKey: string): Promise<void>;
  fetchModels(apiUrl: string, apiKey: string): Promise<readonly string[]>;
  clearApiKey(): Promise<void>;
  submitActionToHost(action: PhoneHostAction): Promise<void>;
  // 档案功能（可选，如果 AI 未配置则返回空）
  listProfiles?(): Promise<readonly PhoneProfileView[]> | readonly PhoneProfileView[];
  refreshProfile?(personId: string): Promise<void>;
  refreshAllProfiles?(): Promise<void>;
  retryFailedProfiles?(): Promise<void>;
  getProfileSettings?(): Promise<PhoneProfileSettingsView> | PhoneProfileSettingsView;
  saveProfileSettings?(settings: PhoneProfileSettingsView): Promise<void>;
  regenerateProfileRadio?(): Promise<void>;
  // 数据访问（用于档案功能）
  getDb?(): PhoneDb;
  getSessionKey?(): string;
}

export interface PhoneAppRenderContext {
  document: Document;
  listen(target: EventTarget, event: string, listener: EventListener): void;
  announce(message: string, kind?: 'info' | 'error'): void;
  requestRender(): void;
  navigate(route: PhoneRoute): void;
  onDispose?(disposer: () => void): void;
  isActive(): boolean;
}

export interface PhoneAppDefinition {
  route: Exclude<PhoneRoute, 'home'>;
  title: string;
  glyph: string;
  iconSrc?: string;
  render(context: PhoneAppRenderContext): Promise<HTMLElement>;
}

export function createTaskHostAction(task: PhoneTaskView): PhoneHostAction {
  if (!task.actionText.trim()) throw new Error('任务行动不能为空');
  if (!task.sourceKey.trim()) throw new Error('任务 sourceKey 不能为空');
  return {
    kind: 'composer.insert',
    text: task.actionText,
    sourceKey: task.sourceKey,
    mode: task.actionMode ?? 'replace',
  };
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

function row(document: Document, title: string, detail: string): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'phone-row';
  const copy = document.createElement('div');
  copy.className = 'phone-row__copy';
  const heading = text(document, 'strong', title);
  const description = text(document, 'p', detail);
  copy.append(heading, description);
  item.append(copy);
  return item;
}

function empty(document: Document, value: string): HTMLElement {
  const node = text(document, 'p', value);
  node.className = 'phone-empty';
  return node;
}

function field(document: Document, title: string, control: HTMLInputElement | HTMLSelectElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'phone-field';
  label.append(text(document, 'span', title), control);
  return label;
}

function input(document: Document, type: string, value: string): HTMLInputElement {
  const control = document.createElement('input');
  control.type = type;
  control.value = value;
  return control;
}

function select(
  document: Document,
  value: string,
  options: readonly { value: string; label: string }[],
): HTMLSelectElement {
  const control = document.createElement('select');
  const values = new Set(options.map(option => option.value));
  const actualOptions = values.has(value) ? options : [{ value, label: value }, ...options];
  for (const item of actualOptions) {
    const option = text(document, 'option', item.label);
    option.value = item.value;
    control.append(option);
  }
  control.value = value;
  return control;
}

function safeCount(value: number): string {
  return Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : '';
}

function avatar(document: Document, name: string, className: string): HTMLSpanElement {
  const node = text(document, 'span', Array.from(name.trim())[0] ?? '？');
  node.className = className;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

export function createPhoneApps(services: PhoneAppServices): readonly PhoneAppDefinition[] {
  let currentConversationId: string | null = null;
  let currentConversationTitle = '';

  return [
    {
      route: 'messages',
      title: '微信',
      glyph: '●',
      iconSrc: WECHAT_APP_ICON_SRC,
      async render(context) {
        const { document } = context;
        if (currentConversationId) {
          const conversationId = currentConversationId;
          const stopWatching = services.watchConversation(conversationId, () => {
            if (context.isActive()) context.requestRender();
          });
          context.onDispose?.(stopWatching);
          const messages = await services.listMessages(conversationId);
          const page = document.createElement('section');
          page.className = 'phone-chat';
          const back = text(document, 'button', `‹ ${currentConversationTitle || '返回会话列表'}`);
          back.className = 'phone-chat__back';
          back.type = 'button';
          back.setAttribute('aria-label', '返回会话列表');
          context.listen(back, 'click', () => {
            currentConversationId = null;
            currentConversationTitle = '';
            context.requestRender();
          });
          const history = list(document);
          history.className = 'phone-list phone-chat__history';
          for (const message of messages) {
            const item = document.createElement('li');
            item.className = `phone-message ${
              message.direction === 'outgoing' ? 'phone-message--outgoing' : 'phone-message--incoming'
            }`;
            const messageAvatar = avatar(
              document,
              message.direction === 'outgoing' ? '我' : message.sender,
              'phone-message__avatar',
            );
            const copy = document.createElement('div');
            copy.className = 'phone-message__copy';
            const sender = text(document, 'strong', message.sender);
            sender.className = 'phone-message__sender';
            const bubble = text(document, 'p', message.content);
            bubble.className = 'phone-message__bubble';
            copy.append(sender, bubble);
            item.append(messageAvatar, copy);
            if (message.status === 'failed') {
              const retry = text(document, 'button', '重试');
              retry.className = 'phone-message__retry';
              retry.type = 'button';
              context.listen(retry, 'click', () => {
                retry.disabled = true;
                void services
                  .retryMessage(conversationId, message.id)
                  .then(() => context.requestRender())
                  .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
                  .finally(() => {
                    if (context.isActive()) retry.disabled = false;
                  });
              });
              item.append(retry);
            } else if (message.status === 'pending') {
              const cancel = text(document, 'button', '取消');
              cancel.className = 'phone-message__cancel';
              cancel.type = 'button';
              context.listen(cancel, 'click', () => {
                cancel.disabled = true;
                void services
                  .cancelMessage(conversationId, message.id)
                  .then(() => context.requestRender())
                  .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
                  .finally(() => {
                    if (context.isActive()) cancel.disabled = false;
                  });
              });
              item.append(cancel);
            }
            history.append(item);
          }
          const composer = document.createElement('div');
          composer.className = 'phone-composer';
          const input = document.createElement('textarea');
          input.className = 'phone-composer__input';
          input.setAttribute('aria-label', '聊天消息');
          input.rows = 2;
          const send = text(document, 'button', '发送');
          send.className = 'phone-button phone-button--primary phone-composer__send';
          send.type = 'button';
          let sending = false;
          context.listen(send, 'click', () => {
            const content = input.value.trim();
            if (!content) {
              context.announce('消息不能为空', 'error');
              return;
            }
            if (sending) return;
            sending = true;
            send.disabled = true;
            void services
              .sendMessage(conversationId, content)
              .then(() => {
                if (context.isActive()) input.value = '';
                context.requestRender();
              })
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
              .finally(() => {
                sending = false;
                if (context.isActive()) send.disabled = false;
              });
          });
          composer.append(input, send);
          page.append(back, history, composer);
          return page;
        }
        const items = await services.listConversations();
        if (items.length === 0) return empty(document, '还没有会话');
        const output = list(document);
        output.className = 'phone-list phone-conversation-list';
        for (const item of items) {
          const status = item.status === 'failed' ? '· 发送失败' : item.status === 'pending' ? '· 发送中' : '';
          const node = document.createElement('li');
          node.className = 'phone-row';
          const conversation = document.createElement('button');
          conversation.className = 'phone-conversation';
          conversation.type = 'button';
          conversation.setAttribute(
            'aria-label',
            `打开${item.kind === 'eden-group' ? '伊甸住户群' : '私聊'}：${item.title}`,
          );
          const copy = document.createElement('span');
          copy.className = 'phone-row__copy';
          copy.append(text(document, 'strong', item.title), text(document, 'span', `${item.preview}${status}`));
          const conversationAvatar = avatar(
            document,
            item.kind === 'eden-group' ? '群' : item.title,
            `phone-conversation__avatar${item.kind === 'eden-group' ? ' phone-conversation__avatar--group' : ''}`,
          );
          const meta = document.createElement('span');
          meta.className = 'phone-conversation__meta';
          conversation.append(conversationAvatar, copy, meta);
          context.listen(conversation, 'click', () => {
            void services
              .openConversation(item.id)
              .then(() => {
                if (!context.isActive()) return;
                currentConversationId = item.id;
                currentConversationTitle = item.title;
                context.requestRender();
              })
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'));
          });
          const unread = safeCount(item.unread);
          if (unread) {
            const badge = text(document, 'span', unread);
            badge.className = 'phone-badge';
            badge.setAttribute('aria-label', `${unread} 条未读`);
            meta.append(badge);
          }
          node.append(conversation);
          if (item.status === 'failed') {
            const retry = text(document, 'button', '重试');
            retry.className = 'phone-retry';
            retry.type = 'button';
            retry.setAttribute('aria-label', `重试发送：${item.title}`);
            context.listen(retry, 'click', event => {
              event.stopPropagation();
              retry.disabled = true;
              void services
                .retryFailedMessage(item.id)
                .then(() => context.announce('已重试发送'))
                .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
                .finally(() => {
                  if (context.isActive()) retry.disabled = false;
                });
            });
            node.append(retry);
          }
          output.append(node);
        }
        return output;
      },
    },
    {
      route: 'contacts',
      title: '通讯录',
      glyph: '◉',
      async render(context) {
        const { document } = context;
        const items = await services.listContacts();
        if (items.length === 0) return empty(document, '当前变量中暂无人物');
        const output = document.createElement('div');
        const renderSection = (title: string, sectionItems: readonly PhoneContactView[]): void => {
          if (sectionItems.length === 0) return;
          output.append(text(document, 'h2', title));
          const section = list(document);
          for (const item of sectionItems) {
            const node = document.createElement('li');
            node.className = 'phone-row';
            if (!item.added) {
              const copy = document.createElement('div');
              copy.className = 'phone-row__copy';
              copy.append(text(document, 'strong', item.name), text(document, 'p', item.detail));
              const add = text(document, 'button', '添加');
              add.className = 'phone-button phone-button--primary';
              add.type = 'button';
              add.setAttribute('aria-label', `添加联系人：${item.name}`);
              context.listen(add, 'click', () => {
                add.disabled = true;
                void services
                  .addContact(item.id)
                  .then(() => context.requestRender())
                  .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
                  .finally(() => {
                    if (context.isActive()) add.disabled = false;
                  });
              });
              node.append(avatar(document, item.name, 'phone-contact__avatar'), copy, add);
              section.append(node);
              continue;
            }
            const button = document.createElement('button');
            button.className = 'phone-contact';
            button.type = 'button';
            button.setAttribute('aria-label', `打开与${item.name}的私聊`);
            const copy = document.createElement('span');
            copy.className = 'phone-row__copy';
            copy.append(
              text(document, 'strong', item.name),
              text(document, 'span', `${item.inEdenGroup ? '伊甸群成员' : '长期联系人'} · ${item.detail}`),
            );
            button.append(avatar(document, item.name, 'phone-contact__avatar'), copy);
            context.listen(button, 'click', () => {
              void services
                .openOrCreateConversation(item.id)
                .then(conversationId => {
                  if (!context.isActive()) return;
                  currentConversationId = conversationId;
                  currentConversationTitle = item.name;
                  context.navigate('messages');
                })
                .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'));
            });
            const group = text(document, 'button', item.inEdenGroup ? '移出群聊' : '邀请入群');
            group.className = 'phone-button';
            group.type = 'button';
            context.listen(group, 'click', () => {
              group.disabled = true;
              void services
                .setContactGroupMembership(item.id, !item.inEdenGroup)
                .then(() => context.requestRender())
                .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
                .finally(() => {
                  if (context.isActive()) group.disabled = false;
                });
            });
            node.append(button, group);
            section.append(node);
          }
          output.append(section);
        };
        renderSection(
          '联系人',
          items.filter(item => item.added),
        );
        renderSection(
          '可添加人物',
          items.filter(item => !item.added),
        );
        return output;
      },
    },
    {
      route: 'broadcasts',
      title: '广播',
      glyph: '▲',
      async render(context) {
        const { document } = context;
        const items = await services.listBroadcasts();
        const page = document.createElement('section');
        page.className = 'phone-broadcasts';
        const toolbar = document.createElement('div');
        toolbar.className = 'phone-broadcasts__toolbar';
        toolbar.append(text(document, 'strong', '末日公共广播'), text(document, 'span', '娱乐播报，不进入正文'));
        const regenerate = text(document, 'button', '重新生成本期广播');
        regenerate.className = 'phone-button phone-broadcast-regenerate';
        regenerate.type = 'button';
        regenerate.disabled = !services.regenerateProfileRadio;
        context.listen(regenerate, 'click', () => {
          if (!services.regenerateProfileRadio) return;
          regenerate.disabled = true;
          void services
            .regenerateProfileRadio()
            .then(() => {
              context.announce('新一期广播已生成');
              context.requestRender();
            })
            .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              if (context.isActive()) regenerate.disabled = false;
            });
        });
        toolbar.append(regenerate);
        page.append(toolbar);
        if (items.length === 0) {
          page.append(empty(document, '暂无广播'));
          return page;
        }
        const output = list(document);
        output.className = 'phone-list phone-broadcast-list';
        for (const item of items) {
          if (item.kind === 'profile-radio' && item.sections?.length) {
            const issue = document.createElement('li');
            issue.className = 'phone-broadcast-issue';
            const heading = document.createElement('header');
            heading.className = 'phone-broadcast-issue__header';
            heading.append(
              text(document, 'strong', item.source),
              text(
                document,
                'time',
                item.generatedAt ? new Date(item.generatedAt).toLocaleString('zh-CN') : '历史一期',
              ),
            );
            issue.append(heading);
            for (const section of item.sections) {
              const sectionNode = document.createElement('section');
              sectionNode.className = 'phone-broadcast-section';
              sectionNode.append(text(document, 'h3', section.title), text(document, 'p', section.body));
              issue.append(sectionNode);
            }
            output.append(issue);
            continue;
          }
          const trust = item.trust === 'confirmed' ? '伊甸确认' : '外部未核实';
          const node = row(document, `${trust} · ${item.source}`, item.content);
          node.className = 'phone-row phone-broadcast-notice';
          node.dataset.trust = item.trust;
          output.append(node);
        }
        page.append(output);
        return page;
      },
    },
    {
      route: 'tasks',
      title: '任务',
      glyph: '✓',
      async render(context) {
        const { document } = context;
        const items = await services.listTasks();
        if (items.length === 0) return empty(document, '暂无可执行任务');
        const output = list(document);
        for (const item of items) {
          const node = row(document, item.title, item.detail);
          const button = text(document, 'button', '送入输入框');
          button.className = 'phone-button phone-button--primary';
          button.type = 'button';
          context.listen(button, 'click', () => {
            button.disabled = true;
            void services
              .submitActionToHost(createTaskHostAction(item))
              .then(() => context.announce('已送入输入框'))
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
              .finally(() => {
                if (context.isActive()) button.disabled = false;
              });
          });
          node.append(button);
          output.append(node);
        }
        return output;
      },
    },
    {
      route: 'profiles',
      title: '档案',
      glyph: '◎',
      async render(context) {
        const { document } = context;
        try {
          const [profiles, settings] = await Promise.all([
            collectProfiles(services),
            services.getProfileSettings?.() ?? {
              storyProgress: 0,
              autoRefreshEvery: 20,
              promptProfileMaxChars: 2_000,
            },
          ]);
          const container = document.createElement('div');
          container.className = 'phone-profiles';

          const settingsPanel = document.createElement('section');
          settingsPanel.className = 'phone-profile-settings';
          const progress = text(
            document,
            'strong',
            `正文进度 ${Math.max(0, Math.floor(settings.storyProgress))} / ${settings.autoRefreshEvery}`,
          );
          progress.className = 'phone-profile-progress';
          const threshold = input(document, 'number', String(settings.autoRefreshEvery));
          threshold.className = 'phone-profile-settings__threshold';
          threshold.min = '1';
          threshold.max = '50';
          threshold.step = '1';
          threshold.inputMode = 'numeric';
          const budget = input(document, 'number', String(settings.promptProfileMaxChars));
          budget.className = 'phone-profile-settings__budget';
          budget.min = '1';
          budget.step = '100';
          budget.inputMode = 'numeric';
          const fields = document.createElement('div');
          fields.className = 'phone-profile-settings__fields';
          fields.append(field(document, '自动刷新条数', threshold), field(document, '档案提示词上限', budget));
          const saveProfileSettings = text(document, 'button', '保存刷新设置');
          saveProfileSettings.className = 'phone-button phone-profile-settings__save';
          saveProfileSettings.type = 'button';
          saveProfileSettings.disabled = !services.saveProfileSettings;
          context.listen(saveProfileSettings, 'click', () => {
            if (!services.saveProfileSettings) return;
            const autoRefreshEvery = Number(threshold.value);
            const promptProfileMaxChars = Number(budget.value);
            if (!Number.isSafeInteger(autoRefreshEvery) || autoRefreshEvery < 1 || autoRefreshEvery > 50) {
              context.announce('自动刷新条数必须是 1 到 50 的整数', 'error');
              return;
            }
            if (!Number.isSafeInteger(promptProfileMaxChars) || promptProfileMaxChars <= 0) {
              context.announce('档案提示词上限必须是正整数', 'error');
              return;
            }
            saveProfileSettings.disabled = true;
            void services
              .saveProfileSettings({
                storyProgress: settings.storyProgress,
                autoRefreshEvery,
                promptProfileMaxChars,
              })
              .then(() => {
                context.announce('档案刷新设置已保存');
                context.requestRender();
              })
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
              .finally(() => {
                if (context.isActive()) saveProfileSettings.disabled = false;
              });
          });
          settingsPanel.append(progress, fields, saveProfileSettings);

          const actions = document.createElement('div');
          actions.className = 'phone-profile-actions';
          const refreshAll = text(document, 'button', '刷新全部人物');
          refreshAll.className = 'phone-button phone-button--primary phone-profile-refresh-all';
          refreshAll.type = 'button';
          refreshAll.disabled = !services.refreshAllProfiles;
          const retryFailed = text(document, 'button', '重试失败人物');
          retryFailed.className = 'phone-button phone-profile-retry';
          retryFailed.type = 'button';
          retryFailed.disabled = !services.retryFailedProfiles;
          const runAction = (
            button: HTMLButtonElement,
            action: (() => Promise<void>) | undefined,
            success: string,
          ): void => {
            if (!action) return;
            button.disabled = true;
            void action()
              .then(() => {
                context.announce(success);
                context.requestRender();
              })
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
              .finally(() => {
                if (context.isActive()) button.disabled = false;
              });
          };
          context.listen(refreshAll, 'click', () =>
            runAction(refreshAll, services.refreshAllProfiles?.bind(services), '全部人物档案刷新完成'),
          );
          context.listen(retryFailed, 'click', () =>
            runAction(retryFailed, services.retryFailedProfiles?.bind(services), '失败人物已重试'),
          );
          actions.append(refreshAll, retryFailed);
          container.append(settingsPanel, actions);

          if (profiles.length === 0) {
            container.append(empty(document, '尚无已生成的人物档案'));
            return container;
          }
          const profileList = list(document);
          profileList.className = 'phone-list phone-profile-list';
          for (const profile of profiles) {
            const item = document.createElement('li');
            item.className = 'phone-profile-item';
            item.dataset.status = profile.refreshStatus;
            const header = document.createElement('header');
            header.className = 'phone-profile-header';
            const identity = document.createElement('div');
            identity.className = 'phone-profile-header__identity';
            identity.append(
              text(document, 'strong', profile.name),
              text(
                document,
                'span',
                profile.refreshStatus === 'refreshing'
                  ? '刷新中'
                  : profile.refreshStatus === 'failed'
                    ? '刷新失败'
                    : profile.refreshStatus === 'success'
                      ? '已更新'
                      : '待刷新',
              ),
            );
            const refresh = text(document, 'button', '↻');
            refresh.className = 'phone-button phone-profile-refresh';
            refresh.type = 'button';
            refresh.setAttribute('aria-label', `刷新${profile.name}的档案`);
            refresh.title = `刷新${profile.name}的档案`;
            refresh.disabled = !services.refreshProfile || profile.refreshStatus === 'refreshing';
            context.listen(refresh, 'click', () =>
              runAction(
                refresh,
                services.refreshProfile ? () => services.refreshProfile!(profile.id) : undefined,
                `${profile.name}的档案已更新`,
              ),
            );
            header.append(identity, refresh);
            const content = document.createElement('div');
            content.className = 'phone-profile-content';
            const addProfileField = (label: string, value: string): void => {
              const node = document.createElement('section');
              node.className = 'phone-profile-field';
              node.append(text(document, 'h3', label), text(document, 'p', value.trim() || '暂无'));
              content.append(node);
            };
            addProfileField('基本信息', profile.basicInfo);
            addProfileField('固定性格', profile.personalityBaseline);
            addProfileField('性格微调', profile.personalityTuning);
            addProfileField('当前处境', profile.currentStatus);
            addProfileField('关系', profile.relationship);
            addProfileField('正文互动小结', profile.storyInteractionSummary);
            addProfileField('微信聊天小结', profile.chatInteractionSummary);
            addProfileField('对玩家行动建议', profile.playerActionAdvice);
            addProfileField('最后一轮消息', profile.lastWechatRound.join('\n'));
            addProfileField('来源范围', profile.sourceRange);
            const meta = text(document, 'p', `更新于 ${new Date(profile.lastUpdated).toLocaleString('zh-CN')}`);
            meta.className = 'phone-profile-meta';
            content.append(meta);
            if (profile.lastError) {
              const failure = text(document, 'p', profile.lastError);
              failure.className = 'phone-profile-error';
              content.append(failure);
            }
            item.append(header, content);
            profileList.append(item);
          }
          container.append(profileList);
          return container;
        } catch (error) {
          const placeholder = empty(document, '档案加载失败');
          const hint = text(document, 'p', error instanceof Error ? error.message : String(error));
          hint.className = 'phone-profile-error';
          placeholder.append(hint);
          return placeholder;
        }
      },
    },
    {
      route: 'settings',
      title: '设置',
      glyph: '⚙',
      async render(context) {
        const { document } = context;
        const settings = await services.getSettings();
        const form = document.createElement('form');
        form.className = 'phone-settings';
        const provider = select(document, settings.provider, [
          { value: 'tavern', label: 'Tavern' },
          { value: 'openai-compatible', label: 'OpenAI-compatible' },
        ]);
        const apiUrl = input(document, 'url', settings.apiUrl);
        const apiKey = input(document, 'password', '');
        apiKey.autocomplete = 'off';
        apiKey.spellcheck = false;
        const model = input(document, 'text', settings.model);
        const modelChoices = select(document, '', []);
        modelChoices.className = 'phone-settings__models';
        const modelChoicesField = field(document, '可用模型', modelChoices);
        modelChoicesField.hidden = true;
        const parameters = input(document, 'text', settings.parameters);
        const theme = select(document, settings.theme, [
          { value: 'system', label: '跟随系统' },
          { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' },
        ]);
        const notifications = input(document, 'checkbox', '');
        notifications.checked = settings.notifications;
        const save = text(document, 'button', '保存设置');
        save.className = 'phone-button phone-button--primary phone-settings__save';
        save.type = 'button';
        const fetchModels = text(document, 'button', '拉取模型列表');
        fetchModels.className = 'phone-button phone-settings__fetch-models';
        fetchModels.type = 'button';
        const clearKey = text(document, 'button', '清除 Key');
        clearKey.className = 'phone-button phone-settings__clear-key';
        clearKey.type = 'button';
        const actions = document.createElement('div');
        actions.className = 'phone-settings__actions';
        actions.append(fetchModels, clearKey);
        const status = text(document, 'p', settings.hasApiKey ? '已保存 API Key；留空保存将保留' : '尚未保存 API Key');
        status.className = 'phone-settings__status';
        const report = (message: string, kind: 'info' | 'error' = 'info') => {
          status.textContent = message;
          status.dataset.kind = kind;
          context.announce(message, kind);
        };
        form.append(
          field(document, 'Provider', provider),
          field(document, 'API URL', apiUrl),
          field(document, 'API Key', apiKey),
          field(document, '模型', model),
          modelChoicesField,
          actions,
          field(document, '生成参数', parameters),
          field(document, '主题', theme),
          field(document, '通知', notifications),
          status,
          save,
        );
        context.listen(modelChoices, 'change', () => {
          if (modelChoices.value) model.value = modelChoices.value;
        });
        context.listen(fetchModels, 'click', () => {
          fetchModels.disabled = true;
          report('正在拉取模型列表…');
          void services
            .fetchModels(apiUrl.value, apiKey.value)
            .then(models => {
              const options = models.map(value => {
                const option = text(document, 'option', value);
                option.value = value;
                return option;
              });
              modelChoices.replaceChildren(...options);
              modelChoices.value = models.includes(model.value) ? model.value : (models[0] ?? '');
              modelChoicesField.hidden = false;
              report(`已拉取 ${models.length} 个模型`);
            })
            .catch(error => report(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              if (context.isActive()) fetchModels.disabled = false;
            });
        });
        context.listen(clearKey, 'click', () => {
          clearKey.disabled = true;
          void services
            .clearApiKey()
            .then(() => {
              settings.hasApiKey = false;
              apiKey.value = '';
              report('API Key 已清除');
            })
            .catch(error => report(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              if (context.isActive()) clearKey.disabled = false;
            });
        });
        context.listen(save, 'click', () => {
          save.disabled = true;
          const next: PhoneSettingsView = {
            provider: provider.value,
            apiUrl: apiUrl.value,
            model: model.value,
            parameters: parameters.value,
            theme: isPhoneTheme(theme.value) ? theme.value : 'system',
            notifications: notifications.checked,
            hasApiKey: settings.hasApiKey || apiKey.value.trim().length > 0,
          };
          void services
            .saveSettings(next, apiKey.value)
            .then(() => {
              settings.hasApiKey = next.hasApiKey;
              apiKey.value = '';
              report('设置已保存到本机');
            })
            .catch(error => report(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              if (context.isActive()) save.disabled = false;
            });
        });
        return form;
      },
    },
    {
      route: 'diagnostics',
      title: '诊断',
      glyph: '…',
      async render(context) {
        const { document } = context;
        const diagnostics = await services.getDiagnostics();
        const output = list(document);
        output.append(
          row(document, '运行时', diagnostics.runtimeState),
          row(document, '稳定快照', diagnostics.snapshotVersion),
          row(document, '待同步正文记忆', String(diagnostics.pendingLoreCount)),
          row(document, '可重试 ChatLore', String(diagnostics.pendingLoreRetryCount)),
        );
        if (diagnostics.pendingLoreRetryCount > 0) {
          const retry = text(document, 'button', '重试 ChatLore 同步');
          retry.className = 'phone-lore-retry';
          retry.type = 'button';
          context.listen(retry, 'click', () => {
            retry.disabled = true;
            void services
              .retryPendingLore()
              .then(() => {
                context.announce('ChatLore 重试完成');
                context.requestRender();
              })
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
              .finally(() => {
                if (context.isActive()) retry.disabled = false;
              });
          });
          output.append(retry);
        }
        for (const state of diagnostics.moduleStates) output.append(row(document, '模块', state));
        for (const error of diagnostics.recentErrors) output.append(row(document, '最近错误', redactDiagnostic(error)));
        return output;
      },
    },
  ];
}

function isPhoneTheme(value: string): value is PhoneSettingsView['theme'] {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function redactDiagnostic(value: string): string {
  return value
    .replace(/([?&](?:api[-_]?key|access[-_]?token|token|authorization)=)[^&#\s]*/gi, '$1[REDACTED]')
    .replace(/(["'](?:authorization|x-api-key|api[-_ ]?key)["']\s*:\s*["'])[^"']*(["'])/gi, '$1[REDACTED]$2')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(sk-[a-z0-9_-]{8,})\b/gi, '[REDACTED]')
    .replace(/\b(authorization|api[-_ ]?key|x-api-key)\b\s*[:=]\s*[^\s,;]+/gi, '$1: [REDACTED]');
}
