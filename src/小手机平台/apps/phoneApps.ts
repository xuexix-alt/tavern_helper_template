import type { PhoneHostAction } from '../core/types';
import type { PhoneDb } from '../data/phoneDb';
import { collectProfiles, refreshSingleProfile } from './profileHelper';
import { ProfileAnalyzer } from './profileAnalyzer';

export type PhoneRoute = 'home' | 'messages' | 'contacts' | 'broadcasts' | 'tasks' | 'profiles' | 'settings' | 'diagnostics';

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
  personality: string;
  currentStatus: string;
  relationship: string;
  recentInteraction: string;
  lastUpdated: number;
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

  // 初始化档案分析器（需要时才创建）
  let profileAnalyzer: ProfileAnalyzer | null = null;

  const getAnalyzer = () => {
    if (!profileAnalyzer) {
      // 尝试多种方式获取数据库和运行时
      const db =
        (window as any).phoneDb ||
        (window as any).parent?.phoneDb ||
        (window as any).top?.phoneDb;

      const runtime =
        (window as any).tavernPhone ||
        (window as any).parent?.tavernPhone ||
        (window as any).top?.tavernPhone;

      const session = runtime?.getSession?.();
      const sessionKey = session?.sessionKey;

      if (db && sessionKey) {
        profileAnalyzer = new ProfileAnalyzer(db, sessionKey);
      } else {
        console.error('[档案] 无法获取数据库或会话', {
          db: !!db,
          runtime: !!runtime,
          session: !!session,
          sessionKey: !!sessionKey,
        });
      }
    }
    return profileAnalyzer;
  };

  return [
    {
      route: 'messages',
      title: '微信',
      glyph: '●',
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
      async render({ document }) {
        const items = await services.listBroadcasts();
        if (items.length === 0) return empty(document, '暂无广播');
        const output = list(document);
        for (const item of items) {
          const trust = item.trust === 'confirmed' ? '伊甸确认' : '外部未核实';
          const node = row(document, `${trust} · ${item.source}`, item.content);
          node.dataset.trust = item.trust;
          output.append(node);
        }
        return output;
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

        // 直接从全局获取数据库和会话信息（尝试多种方式）
        const db =
          (window as any).phoneDb ||
          (window as any).parent?.phoneDb ||
          (window as any).top?.phoneDb;

        const runtime =
          (window as any).tavernPhone ||
          (window as any).parent?.tavernPhone ||
          (window as any).top?.tavernPhone;

        const session = runtime?.getSession?.();
        const sessionKey = session?.sessionKey;

        console.log('[档案] 调试信息:', {
          hasDb: !!db,
          hasRuntime: !!runtime,
          hasSession: !!session,
          hasSessionKey: !!sessionKey,
          windowKeys: Object.keys(window).filter(k => k.includes('phone') || k.includes('tavern')),
          parentKeys: Object.keys((window as any).parent || {}).filter(k => k.includes('phone') || k.includes('tavern')),
        });

        if (!db || !sessionKey) {
          const placeholder = document.createElement('div');
          placeholder.className = 'phone-empty';
          placeholder.textContent = '档案功能不可用';
          const hint = document.createElement('p');
          hint.style.cssText = 'margin-top: 12px; font-size: 13px; color: #888;';
          hint.textContent = `无法访问数据库或会话 (db: ${!!db}, session: ${!!sessionKey})`;
          placeholder.append(hint);
          return placeholder;
        }

        // 直接调用档案助手收集数据
        const profiles = await collectProfiles(db, sessionKey);

        if (profiles.length === 0) {
          return empty(document, '暂无人员档案');
        }

        const container = document.createElement('div');
        container.className = 'phone-profiles';

        // 操作按钮组
        const buttonGroup = document.createElement('div');
        buttonGroup.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';

        // 刷新所有档案按钮
        const refreshAll = text(document, 'button', '🔄 刷新数据');
        refreshAll.className = 'phone-button';
        refreshAll.type = 'button';
        refreshAll.style.cssText = 'flex: 1;';
        context.listen(refreshAll, 'click', () => {
          refreshAll.disabled = true;
          refreshAll.textContent = '刷新中...';
          void (async () => {
            await collectProfiles(db, sessionKey);
            context.announce('所有档案已更新');
            context.requestRender();
          })()
            .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              if (context.isActive()) {
                refreshAll.disabled = false;
                refreshAll.textContent = '🔄 刷新数据';
              }
            });
        });

        // AI 分析所有按钮
        const analyzeAll = text(document, 'button', '🤖 AI 分析');
        analyzeAll.className = 'phone-button phone-button--primary';
        analyzeAll.type = 'button';
        analyzeAll.style.cssText = 'flex: 1;';
        context.listen(analyzeAll, 'click', () => {
          const analyzer = getAnalyzer();
          if (!analyzer) {
            context.announce('分析器初始化失败', 'error');
            return;
          }

          analyzeAll.disabled = true;
          analyzeAll.textContent = '分析中...';

          // 获取所有人物
          void (async () => {
            const recentChat = analyzer['getRecentChat'](30);
            const contacts = await analyzer['getContactsFromMvu']();
            const activeContacts = contacts.filter(c => recentChat.includes(c.name));

            if (activeContacts.length === 0) {
              context.announce('最近对话中没有人物活动', 'error');
              return;
            }

            // 依次分析每个人物
            for (const contact of activeContacts) {
              try {
                await analyzer.analyzeContact(contact.name, recentChat);
                context.announce(`${contact.name} 分析完成`);
              } catch (e) {
                context.announce(`${contact.name} 分析失败`, 'error');
              }
            }

            context.announce('所有分析已完成');
            context.requestRender();
          })()
            .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              if (context.isActive()) {
                analyzeAll.disabled = false;
                analyzeAll.textContent = '🤖 AI 分析';
              }
            });
        });

        buttonGroup.append(refreshAll, analyzeAll);
        container.append(buttonGroup);

        // 档案列表
        const profileList = list(document);
        for (const profile of profiles) {
          const item = document.createElement('li');
          item.className = 'phone-profile-item';
          item.style.cssText = 'padding: 12px; border-bottom: 1px solid var(--phone-border, #eee);';

          // 头部：姓名 + 操作按钮
          const header = document.createElement('div');
          header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
          const nameEl = text(document, 'strong', profile.name);
          nameEl.style.cssText = 'font-size: 16px;';

          const btnGroup = document.createElement('div');
          btnGroup.style.cssText = 'display: flex; gap: 4px;';

          // 刷新按钮
          const refreshBtn = text(document, 'button', '🔄');
          refreshBtn.className = 'phone-button';
          refreshBtn.type = 'button';
          refreshBtn.style.cssText = 'padding: 4px 8px; font-size: 12px;';
          refreshBtn.setAttribute('aria-label', `刷新${profile.name}的档案`);
          context.listen(refreshBtn, 'click', () => {
            refreshBtn.disabled = true;
            void refreshSingleProfile(db, sessionKey, profile.id)
              .then(() => {
                context.announce(`${profile.name}的档案已更新`);
                context.requestRender();
              })
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
              .finally(() => {
                if (context.isActive()) refreshBtn.disabled = false;
              });
          });

          // AI 分析按钮
          const analyzeBtn = text(document, 'button', '🤖');
          analyzeBtn.className = 'phone-button';
          analyzeBtn.type = 'button';
          analyzeBtn.style.cssText = 'padding: 4px 8px; font-size: 12px;';
          analyzeBtn.setAttribute('aria-label', `AI分析${profile.name}`);
          context.listen(analyzeBtn, 'click', () => {
            const analyzer = getAnalyzer();
            if (!analyzer) {
              context.announce('分析器初始化失败', 'error');
              return;
            }

            analyzeBtn.disabled = true;
            void analyzer
              .analyzeContact(profile.name)
              .then(() => {
                context.announce(`${profile.name} AI分析完成`);
                context.requestRender();
              })
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
              .finally(() => {
                if (context.isActive()) analyzeBtn.disabled = false;
              });
          });

          btnGroup.append(refreshBtn, analyzeBtn);
          header.append(nameEl, btnGroup);

          // 内容区域
          const content = document.createElement('div');
          content.style.cssText = 'font-size: 14px; line-height: 1.6; color: var(--phone-text, #333);';

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

          // 更新时间
          const updatedTime = new Date(profile.lastUpdated).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          const timeEl = text(document, 'p', `更新: ${updatedTime}`);
          timeEl.style.cssText = 'margin-top: 8px; font-size: 11px; color: #aaa;';
          content.append(timeEl);

          item.append(header, content);
          profileList.append(item);
        }

        container.append(profileList);
        return container;
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
