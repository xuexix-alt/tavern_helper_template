import type { PhoneHostAction } from '../core/types';

export type PhoneRoute = 'home' | 'messages' | 'contacts' | 'broadcasts' | 'tasks' | 'settings' | 'diagnostics';

export interface PhoneConversationView {
  id: string;
  kind: 'private' | 'eden-group';
  title: string;
  preview: string;
  unread: number;
  status?: 'sent' | 'pending' | 'failed';
}

export interface PhoneContactView {
  id: string;
  name: string;
  detail: string;
  online: boolean;
  canSend: boolean;
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
}

export interface PhoneDiagnosticsView {
  runtimeState: string;
  snapshotVersion: string;
  pendingLoreCount: number;
  moduleStates: readonly string[];
  recentErrors: readonly string[];
}

export interface PhoneAppServices {
  listConversations(): Promise<readonly PhoneConversationView[]> | readonly PhoneConversationView[];
  listContacts(): Promise<readonly PhoneContactView[]> | readonly PhoneContactView[];
  listBroadcasts(): Promise<readonly PhoneBroadcastView[]> | readonly PhoneBroadcastView[];
  listTasks(): Promise<readonly PhoneTaskView[]> | readonly PhoneTaskView[];
  getSettings(): Promise<PhoneSettingsView> | PhoneSettingsView;
  getDiagnostics(): Promise<PhoneDiagnosticsView> | PhoneDiagnosticsView;
  openConversation(conversationId: string): Promise<void>;
  retryFailedMessage(conversationId: string): Promise<void>;
  saveSettings(settings: PhoneSettingsView): Promise<void>;
  submitActionToHost(action: PhoneHostAction): Promise<void>;
}

export interface PhoneAppRenderContext {
  document: Document;
  listen(target: EventTarget, event: string, listener: EventListener): void;
  announce(message: string, kind?: 'info' | 'error'): void;
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

export function createPhoneApps(services: PhoneAppServices): readonly PhoneAppDefinition[] {
  return [
    {
      route: 'messages',
      title: '消息',
      glyph: '●',
      async render(context) {
        const { document } = context;
        const items = await services.listConversations();
        if (items.length === 0) return empty(document, '还没有会话');
        const output = list(document);
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
          conversation.append(copy);
          context.listen(conversation, 'click', () => {
            void services
              .openConversation(item.id)
              .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'));
          });
          const unread = safeCount(item.unread);
          if (unread) {
            const badge = text(document, 'span', unread);
            badge.className = 'phone-badge';
            badge.setAttribute('aria-label', `${unread} 条未读`);
            conversation.append(badge);
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
                  retry.disabled = false;
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
      async render({ document }) {
        const items = await services.listContacts();
        if (items.length === 0) return empty(document, '暂无可通讯角色');
        const output = list(document);
        for (const item of items) {
          const availability = item.online ? (item.canSend ? '在线' : '只读') : '离线·历史可读';
          output.append(row(document, item.name, `${availability} · ${item.detail}`));
        }
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
                button.disabled = false;
              });
          });
          node.append(button);
          output.append(node);
        }
        return output;
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
        const model = input(document, 'text', settings.model);
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
        form.append(
          field(document, 'Provider', provider),
          field(document, 'API URL', apiUrl),
          field(document, '模型', model),
          field(document, '生成参数', parameters),
          field(document, '主题', theme),
          field(document, '通知', notifications),
          save,
        );
        context.listen(save, 'click', () => {
          save.disabled = true;
          const next: PhoneSettingsView = {
            provider: provider.value,
            apiUrl: apiUrl.value,
            model: model.value,
            parameters: parameters.value,
            theme: isPhoneTheme(theme.value) ? theme.value : 'system',
            notifications: notifications.checked,
          };
          void services
            .saveSettings(next)
            .then(() => context.announce('设置已保存'))
            .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              save.disabled = false;
            });
        });
        return form;
      },
    },
    {
      route: 'diagnostics',
      title: '诊断',
      glyph: '…',
      async render({ document }) {
        const diagnostics = await services.getDiagnostics();
        const output = list(document);
        output.append(
          row(document, '运行时', diagnostics.runtimeState),
          row(document, '稳定快照', diagnostics.snapshotVersion),
          row(document, '待同步正文记忆', String(diagnostics.pendingLoreCount)),
        );
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

function redactDiagnostic(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(sk-[a-z0-9_-]{8,})\b/gi, '[REDACTED]')
    .replace(/\b(authorization|api[-_ ]?key|x-api-key)\b\s*[:=]\s*[^\s,;]+/gi, '$1: [REDACTED]');
}
