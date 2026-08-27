import { WECHAT_APP_ICON_SRC } from '../assets/wechatIcon';
import type { PhoneHostAction } from '../core/types';
import type { ProfileEditPatch, ProfileVersion } from '../profiles/profileTypes';
import type { PhoneDb } from '../data/phoneDb';
import { collectProfiles } from './profileHelper';

export type PhoneRoute =
  | 'home'
  | 'messages'
  | 'contacts'
  | 'broadcasts'
  | 'tasks'
  | 'profiles'
  | 'profile-detail'
  | 'smart-tasks'
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
  /** 剧情时间戳标签（如「末日纪元，9527年12月14日 上午 - 08:00」），旧消息可能缺失 */
  timeLabel?: string;
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

export interface PhonePromptDebugEntryView {
  id: string;
  createdAt: number;
  mode: string;
  conversationId: string;
  replyAs: string;
  /** 组装提示词（宏未展开） */
  assembled: string;
  /** 宏展开后的最终提示词（发送给 AI 的） */
  expanded: string;
  /** AI 原始响应 */
  raw?: string;
  /** 解析后的微信消息 */
  messages?: readonly { sender: string; content: string }[];
  error?: string;
}

export interface PhoneDiagnosticsView {
  runtimeState: string;
  snapshotVersion: string;
  pendingLoreCount: number;
  pendingLoreRetryCount: number;
  moduleStates: readonly string[];
  recentErrors: readonly string[];
  promptDebug: readonly PhonePromptDebugEntryView[];
}

export interface PhoneProfileView {
  id: string;
  name: string;
  basicInfo: string;
  personalityBaseline: string;
  behaviorTuning: string;
  personalityTuning: string;
  speechStyleTuning: string;
  currentGoals: string;
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
  analysisNarrative?: string;
  changes?: readonly {
    field: string;
    before: string;
    after: string;
    reason: string;
    evidenceRefs: readonly string[];
  }[];
  rawResponse?: string;
  reasoningContent?: string;
  versions?: readonly ProfileVersion[];
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
  watchProfiles?(listener: () => void): () => void;
  getProfile?(personId: string): Promise<PhoneProfileView | null>;
  saveProfileEdit?(personId: string, patch: ProfileEditPatch): Promise<void>;
  restoreProfileVersion?(personId: string, versionId: string): Promise<void>;
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
  showOnHome?: boolean;
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

function field(document: Document, title: string, control: HTMLElement): HTMLLabelElement {
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

/** 电台三声腔：段名 -> 栏目气质标签（用于 UI 呈现） */
const BROADCAST_VOICE_LABELS: Record<string, string> = {
  notice: '管理处 · 官方',
  life: '物资组 · 生活',
  whisper: '街坊 · 道听途说',
  plain: '本台栏目',
};

function broadcastVoiceOf(title: string): keyof typeof BROADCAST_VOICE_LABELS {
  if (title.includes('通告')) return 'notice';
  if (title.includes('生活')) return 'life';
  if (title.includes('风声') || title.includes('街坊')) return 'whisper';
  return 'plain';
}

/** 档案编号：personId 的 FNV-1a 指纹，形如 EDN-3F2A */
function dossierFileNo(personId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < personId.length; i += 1) {
    hash ^= personId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `EDN-${hash.toString(16).toUpperCase().slice(-4).padStart(4, '0')}`;
}

export function createPhoneApps(services: PhoneAppServices): readonly PhoneAppDefinition[] {
  let currentConversationId: string | null = null;
  let currentConversationTitle = '';
  let selectedProfileId: string | null = null;

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
          // 微信风格时间分隔条：相邻消息时间标签相同则不重复；旧消息无标签时跳过且不打断比较
          let previousTimeLabel = '';
          for (const message of messages) {
            if (message.timeLabel && message.timeLabel !== previousTimeLabel) {
              const divider = text(document, 'li', message.timeLabel);
              divider.className = 'phone-chat__time';
              history.append(divider);
              previousTimeLabel = message.timeLabel;
            }
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
          conversation.setAttribute('aria-label', `打开${item.kind === 'eden-group' ? '群聊' : '私聊'}：${item.title}`);
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

        // 电台机头：频率 / ON AIR / 台名 / 调频刻度
        const hero = document.createElement('header');
        hero.className = 'radio-hero';
        const band = document.createElement('div');
        band.className = 'radio-hero__band';
        const freq = text(document, 'span', 'FM 87.6 MHz');
        freq.className = 'radio-hero__freq';
        const onair = document.createElement('span');
        onair.className = 'radio-hero__onair';
        onair.setAttribute('aria-hidden', 'true');
        const onairDot = document.createElement('i');
        onairDot.className = 'radio-hero__onair-dot';
        onair.append(onairDot, text(document, 'span', 'ON AIR'));
        band.append(freq, onair);
        const heading = text(document, 'h1', '末日公共广播');
        heading.className = 'radio-hero__title';
        const slogan = text(document, 'p', '伊甸楼宇广播站 · 娱乐播报，不进入正文');
        slogan.className = 'radio-hero__slogan';
        const dial = document.createElement('div');
        dial.className = 'radio-dial';
        dial.setAttribute('aria-hidden', 'true');
        const needle = document.createElement('span');
        needle.className = 'radio-dial__needle';
        dial.append(needle);
        const dialLabels = document.createElement('div');
        dialLabels.className = 'radio-dial__labels';
        dialLabels.setAttribute('aria-hidden', 'true');
        for (const label of ['88', '92', '96', '100', '104']) dialLabels.append(text(document, 'span', label));
        const regenerate = text(document, 'button', '播报新一期');
        regenerate.className = 'phone-button phone-broadcast-regenerate';
        regenerate.type = 'button';
        regenerate.disabled = !services.regenerateProfileRadio;
        context.listen(regenerate, 'click', () => {
          if (!services.regenerateProfileRadio) return;
          regenerate.disabled = true;
          hero.dataset.busy = 'true';
          void services
            .regenerateProfileRadio()
            .then(() => {
              context.announce('新一期广播已生成');
              context.requestRender();
            })
            .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              if (context.isActive()) regenerate.disabled = false;
              delete hero.dataset.busy;
            });
        });
        hero.append(band, heading, slogan, dial, dialLabels, regenerate);
        page.append(hero);

        if (items.length === 0) {
          const silence = empty(document, '本台尚未播报任何节目');
          silence.className = 'phone-empty radio-empty';
          const hint = text(document, 'p', '点击「播报新一期」，广播站将汇总近期的公开动静。');
          hint.className = 'radio-empty__hint';
          silence.append(hint);
          page.append(silence);
          return page;
        }

        const output = list(document);
        output.className = 'phone-list phone-broadcast-list';
        for (const item of items) {
          if (item.kind === 'profile-radio' && item.sections?.length) {
            // 三声联播节目存档：本台通告 / 生活频道 / 街坊风声
            const issue = document.createElement('li');
            issue.className = 'phone-broadcast-issue';
            const issueHeader = document.createElement('header');
            issueHeader.className = 'phone-broadcast-issue__header';
            const masthead = document.createElement('div');
            masthead.className = 'phone-broadcast-masthead';
            masthead.append(text(document, 'strong', item.source || '末日公共广播'));
            masthead.append(
              text(
                document,
                'time',
                item.generatedAt ? new Date(item.generatedAt).toLocaleString('zh-CN') : '历史一期',
              ),
            );
            const issueLabel = text(document, 'span', '末日公共广播 · 节目存档');
            issueLabel.className = 'phone-broadcast-issue__label';
            issueHeader.append(masthead, issueLabel);
            issue.append(issueHeader);
            const issueBody = document.createElement('div');
            issueBody.className = 'phone-broadcast-issue__body';
            for (const section of item.sections) {
              const voice = broadcastVoiceOf(section.title);
              const sectionNode = document.createElement('section');
              sectionNode.className = `phone-broadcast-section phone-broadcast-section--${voice}`;
              const sectionHead = document.createElement('div');
              sectionHead.className = 'phone-broadcast-section__head';
              sectionHead.append(text(document, 'h3', section.title));
              const voiceLabel = text(document, 'span', BROADCAST_VOICE_LABELS[voice] ?? '本台栏目');
              voiceLabel.className = 'phone-broadcast-section__voice';
              sectionHead.append(voiceLabel);
              sectionNode.append(sectionHead, text(document, 'p', section.body));
              issueBody.append(sectionNode);
            }
            issue.append(issueBody);
            output.append(issue);
            continue;
          }
          // 系统快讯：网络状态等确定性通知
          const node = document.createElement('li');
          node.className = 'phone-broadcast-notice';
          node.dataset.trust = item.trust;
          const noticeHead = document.createElement('div');
          noticeHead.className = 'phone-broadcast-notice__head';
          const chip = text(document, 'span', item.trust === 'confirmed' ? '伊甸确认' : '外部未核实');
          chip.className = 'phone-broadcast-notice__chip';
          noticeHead.append(chip, text(document, 'strong', item.source));
          node.append(noticeHead, text(document, 'p', item.content));
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
      glyph: '▤',
      async render(context) {
        return renderProfileListPage(services, context, personId => {
          selectedProfileId = personId;
          context.navigate('profile-detail');
        });
      },
    },
    {
      route: 'profile-detail',
      title: '人物档案',
      glyph: '‹',
      showOnHome: false,
      async render(context) {
        return renderProfileDetailPage(services, context, selectedProfileId, () => context.navigate('profiles'));
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
        if (diagnostics.promptDebug.length > 0) {
          const debugHeading = text(document, 'h3', '提示词调试');
          debugHeading.className = 'phone-debug-heading';
          output.append(debugHeading);
          for (const entry of [...diagnostics.promptDebug].reverse()) {
            const details = document.createElement('details');
            details.className = 'phone-debug-entry';
            const time = new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour12: false });
            const summary = text(document, 'summary', `#${entry.id} ${entry.mode} · ${entry.replyAs} · ${time}`);
            summary.className = 'phone-debug-entry__summary';
            details.append(summary);
            const body = document.createElement('div');
            body.className = 'phone-debug-entry__body';
            body.append(debugSection(document, '组装提示词（宏未展开）', entry.assembled));
            body.append(debugSection(document, '展开后提示词（发送给 AI）', entry.expanded));
            if (entry.raw !== undefined) body.append(debugSection(document, 'AI 原始响应', entry.raw));
            if (entry.messages !== undefined)
              body.append(debugSection(document, '解析结果', JSON.stringify(entry.messages, null, 2)));
            if (entry.error !== undefined) {
              const error = text(document, 'p', entry.error);
              error.className = 'phone-debug-entry__error';
              body.append(error);
            }
            details.append(body);
            output.append(details);
          }
        }
        return output;
      },
    },
  ];
}

async function renderProfileListPage(
  services: PhoneAppServices,
  context: PhoneAppRenderContext,
  openProfile: (personId: string) => void,
): Promise<HTMLElement> {
  const { document } = context;
  const container = document.createElement('main');
  container.className = 'phone-profiles phone-profiles--list';
  const stopWatching = services.watchProfiles?.(() => {
    if (context.isActive()) context.requestRender();
  });
  context.onDispose?.(stopWatching ?? (() => undefined));
  try {
    const [profiles, settings] = await Promise.all([
      collectProfiles(services),
      services.getProfileSettings?.() ?? { storyProgress: 0, autoRefreshEvery: 20, promptProfileMaxChars: 2_000 },
    ]);

    // 档案馆门头
    const hero = document.createElement('header');
    hero.className = 'dossier-hero';
    const kicker = text(document, 'span', 'ARCHIVE · 档案室');
    kicker.className = 'dossier-hero__kicker';
    const heroTitle = text(document, 'h1', '居民动态档案');
    heroTitle.className = 'dossier-hero__title';
    const heroIntro = text(document, 'p', '汇总正文与微信证据 · 分析结果写入世界书生效');
    heroIntro.className = 'dossier-hero__intro';
    hero.append(kicker, heroTitle, heroIntro);
    container.append(hero);

    // 工作台：刷新进度 + 批量操作 + 刷新参数
    const deck = document.createElement('section');
    deck.className = 'phone-profile-overview dossier-deck';
    const progressRow = document.createElement('div');
    progressRow.className = 'dossier-deck__progress';
    const progressTitle = text(
      document,
      'strong',
      `正文进度 ${Math.max(0, Math.floor(settings.storyProgress))} / ${settings.autoRefreshEvery}`,
    );
    progressTitle.className = 'phone-profile-progress';
    const meter = document.createElement('span');
    meter.className = 'dossier-progress__meter';
    meter.setAttribute('aria-hidden', 'true');
    const meterTicks = Math.max(1, Math.min(20, Math.floor(settings.autoRefreshEvery) || 20));
    const meterFilled = Math.max(
      0,
      Math.min(
        meterTicks,
        Math.round((Math.max(0, settings.storyProgress) / Math.max(1, settings.autoRefreshEvery)) * meterTicks),
      ),
    );
    for (let i = 0; i < meterTicks; i += 1) {
      const tick = document.createElement('i');
      tick.className = i < meterFilled ? 'dossier-progress__tick dossier-progress__tick--on' : 'dossier-progress__tick';
      meter.append(tick);
    }
    const meterNote = text(document, 'span', '正文累计达到阈值后自动刷新全部档案');
    meterNote.className = 'dossier-deck__note';
    progressRow.append(progressTitle, meter, meterNote);
    deck.append(progressRow);

    const actions = document.createElement('div');
    actions.className = 'phone-profile-actions';
    const runAction = (button: HTMLButtonElement, action: (() => Promise<void>) | undefined, success: string) => {
      if (!action) return;
      button.disabled = true;
      void action()
        .then(() => {
          context.announce(success);
          context.requestRender();
        })
        .catch(error => {
          context.announce(error instanceof Error ? error.message : String(error), 'error');
          context.requestRender();
        })
        .finally(() => {
          if (context.isActive()) button.disabled = false;
        });
    };
    const refreshAll = text(document, 'button', '刷新全部人物') as HTMLButtonElement;
    refreshAll.className = 'phone-button phone-button--primary phone-profile-refresh-all';
    refreshAll.type = 'button';
    refreshAll.disabled = !services.refreshAllProfiles;
    context.listen(refreshAll, 'click', () =>
      runAction(refreshAll, services.refreshAllProfiles?.bind(services), '全部人物档案刷新完成'),
    );
    const retry = text(document, 'button', '重试失败人物') as HTMLButtonElement;
    retry.className = 'phone-button phone-profile-retry';
    retry.type = 'button';
    retry.disabled = !services.retryFailedProfiles;
    context.listen(retry, 'click', () =>
      runAction(retry, services.retryFailedProfiles?.bind(services), '失败人物已重试'),
    );
    actions.append(refreshAll, retry);
    deck.append(actions);

    const settingsPanel = document.createElement('section');
    settingsPanel.className = 'phone-profile-settings';
    const threshold = input(document, 'number', String(settings.autoRefreshEvery));
    threshold.className = 'phone-profile-settings__threshold';
    threshold.min = '1';
    threshold.max = '50';
    threshold.step = '1';
    const budget = input(document, 'number', String(settings.promptProfileMaxChars));
    budget.className = 'phone-profile-settings__budget';
    budget.min = '1';
    budget.step = '100';
    const settingFields = document.createElement('div');
    settingFields.className = 'phone-profile-settings__fields';
    settingFields.append(field(document, '自动刷新条数', threshold), field(document, '档案提示词上限', budget));
    const saveSettings = text(document, 'button', '保存刷新设置') as HTMLButtonElement;
    saveSettings.className = 'phone-button phone-profile-settings__save';
    saveSettings.type = 'button';
    saveSettings.disabled = !services.saveProfileSettings;
    context.listen(saveSettings, 'click', () => {
      if (!services.saveProfileSettings) return;
      const autoRefreshEvery = Number(threshold.value);
      const promptProfileMaxChars = Number(budget.value);
      if (
        !Number.isSafeInteger(autoRefreshEvery) ||
        autoRefreshEvery < 1 ||
        autoRefreshEvery > 50 ||
        !Number.isSafeInteger(promptProfileMaxChars) ||
        promptProfileMaxChars <= 0
      ) {
        context.announce('刷新设置数值无效', 'error');
        return;
      }
      saveSettings.disabled = true;
      void services
        .saveProfileSettings({ storyProgress: settings.storyProgress, autoRefreshEvery, promptProfileMaxChars })
        .then(() => context.announce('档案刷新设置已保存'))
        .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
        .finally(() => {
          if (context.isActive()) saveSettings.disabled = false;
        });
    });
    settingsPanel.append(settingFields, saveSettings);
    deck.append(settingsPanel);
    container.append(deck);

    if (profiles.length === 0) {
      const vacant = empty(document, '尚无已添加人物');
      vacant.className = 'phone-empty dossier-empty';
      const hint = text(document, 'p', '在通讯录中添加人物后，档案室将为其建立卷宗。');
      hint.className = 'dossier-empty__hint';
      vacant.append(hint);
      container.append(vacant);
      return container;
    }

    // 卷宗卡片列表
    const listNode = list(document);
    listNode.className = 'phone-list phone-profile-list phone-profile-list--compact';
    for (const profile of profiles) {
      const item = document.createElement('li');
      item.className = 'phone-profile-item';
      item.dataset.status = profile.refreshStatus;
      const open = text(document, 'button', '') as HTMLButtonElement;
      open.className = 'phone-profile-row';
      open.type = 'button';
      open.setAttribute('aria-label', `打开${profile.name}的人物档案`);
      const avatar = text(document, 'span', profile.name.trim().charAt(0) || '档');
      avatar.className = 'phone-profile-row__avatar';
      avatar.setAttribute('aria-hidden', 'true');
      const main = document.createElement('span');
      main.className = 'phone-profile-row__main';
      const identity = document.createElement('span');
      identity.className = 'phone-profile-row__identity';
      identity.append(
        text(document, 'strong', profile.name),
        text(document, 'small', `NO.${dossierFileNo(profile.id)} · ${profile.sourceRange}`),
      );
      const summary = text(
        document,
        'span',
        profile.analysisNarrative || profile.personalityTuning || '尚无动态变化',
      );
      summary.className = 'phone-profile-row__summary';
      main.append(identity, summary);
      const status = document.createElement('span');
      status.className = 'phone-profile-row__status';
      status.dataset.status = profile.refreshStatus;
      status.textContent =
        profile.refreshStatus === 'refreshing'
          ? '分析中'
          : profile.refreshStatus === 'failed'
            ? '失败'
            : profile.refreshStatus === 'success'
              ? '已更新'
              : '待分析';
      const chevron = text(document, 'span', '›');
      chevron.className = 'phone-profile-row__chevron';
      chevron.setAttribute('aria-hidden', 'true');
      open.append(avatar, main, status, chevron);
      context.listen(open, 'click', () => openProfile(profile.id));
      const refresh = text(document, 'button', '↻') as HTMLButtonElement;
      refresh.className = 'phone-button phone-profile-refresh';
      refresh.type = 'button';
      refresh.setAttribute('aria-label', `刷新${profile.name}的档案`);
      refresh.disabled = !services.refreshProfile || profile.refreshStatus === 'refreshing';
      context.listen(refresh, 'click', event => {
        event.stopPropagation();
        runAction(
          refresh,
          services.refreshProfile ? () => services.refreshProfile!(profile.id) : undefined,
          `${profile.name}的档案已更新`,
        );
      });
      item.append(open, refresh);
      if (profile.lastError) {
        const error = text(document, 'p', profile.lastError);
        error.className = 'phone-profile-error';
        item.append(error);
      }
      listNode.append(item);
    }
    container.append(listNode);
    return container;
  } catch (error) {
    const failure = empty(document, '档案加载失败');
    const hint = text(document, 'p', error instanceof Error ? error.message : String(error));
    hint.className = 'phone-profile-error';
    failure.append(hint);
    return failure;
  }
}

async function renderProfileDetailPage(
  services: PhoneAppServices,
  context: PhoneAppRenderContext,
  personId: string | null,
  goBack: () => void,
): Promise<HTMLElement> {
  const { document } = context;
  if (!personId) {
    goBack();
    return empty(document, '请选择人物档案');
  }
  const page = document.createElement('main');
  page.className = 'phone-profile-detail';
  const stopWatching = services.watchProfiles?.(() => {
    if (context.isActive()) context.requestRender();
  });
  context.onDispose?.(stopWatching ?? (() => undefined));
  try {
    const profile = services.getProfile
      ? await services.getProfile(personId)
      : ((await collectProfiles(services)).find(item => item.id === personId) ?? null);
    if (!profile) return empty(document, '人物档案不存在');
    // 卷宗封面：返回 + 档案编号 + 姓名 + 更新时间 + 重新分析
    const header = document.createElement('header');
    header.className = 'phone-profile-detail__header dossier-cover';
    const back = text(document, 'button', '‹ 返回档案') as HTMLButtonElement;
    back.className = 'phone-button phone-profile-back';
    back.type = 'button';
    context.listen(back, 'click', goBack);
    const title = document.createElement('div');
    title.className = 'dossier-cover__main';
    const fileNo = text(document, 'span', `NO.${dossierFileNo(personId)} · 居民卷宗`);
    fileNo.className = 'dossier-cover__file';
    title.append(
      fileNo,
      text(document, 'h1', profile.name),
      text(
        document,
        'p',
        profile.refreshStatus === 'refreshing'
          ? '正在分析新证据'
          : `最近更新 ${profile.lastUpdated ? new Date(profile.lastUpdated).toLocaleString('zh-CN') : '尚未更新'}`,
      ),
    );
    const refresh = text(document, 'button', '重新分析') as HTMLButtonElement;
    refresh.className = 'phone-button phone-button--primary dossier-cover__refresh';
    refresh.type = 'button';
    refresh.disabled = !services.refreshProfile || profile.refreshStatus === 'refreshing';
    context.listen(refresh, 'click', () => {
      if (!services.refreshProfile) return;
      refresh.disabled = true;
      void services
        .refreshProfile(personId)
        .then(() => context.announce('人物档案已更新'))
        .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
        .finally(() => {
          if (context.isActive()) context.requestRender();
        });
    });
    header.append(back, title, refresh);
    page.append(header);
    if (profile.lastError) {
      const warning = text(document, 'p', `本次分析未应用：${profile.lastError}`);
      warning.className = 'phone-profile-error';
      page.append(warning);
    }
    const tabs = document.createElement('nav');
    tabs.className = 'phone-profile-tabs';
    const tabButtons: HTMLButtonElement[] = [];
    const content = document.createElement('div');
    content.className = 'phone-profile-detail__content';
    const tabNames = ['变化', '档案', '依据', '分析'] as const;
    const renderTab = (tab: (typeof tabNames)[number]) => {
      content.replaceChildren();
      for (const button of tabButtons)
        button.setAttribute('aria-selected', button.textContent === tab ? 'true' : 'false');
      if (tab === '变化') {
        const changes = profile.changes ?? [];
        content.append(sectionBlock(document, '本次自动写入', profile.analysisNarrative || '暂无新的动态变化。'));
        if (changes.length === 0)
          content.append(sectionBlock(document, '变化记录', '本次没有识别到可单独列出的字段变化。'));
        for (const change of changes) {
          const block = document.createElement('section');
          block.className = 'phone-profile-change';
          block.append(text(document, 'h3', change.field));
          const before = document.createElement('div');
          before.className = 'phone-profile-change__row phone-profile-change__row--before';
          before.append(text(document, 'span', '之前'), text(document, 'p', change.before || '暂无'));
          const after = document.createElement('div');
          after.className = 'phone-profile-change__row phone-profile-change__row--after';
          after.append(text(document, 'span', '现在'), text(document, 'p', change.after || '暂无'));
          const reason = text(document, 'p', `原因：${change.reason}`);
          reason.className = 'phone-profile-change__reason';
          const evidence = text(document, 'small', `依据：${change.evidenceRefs.join('、') || '未提供'}`);
          evidence.className = 'phone-profile-change__evidence';
          block.append(before, after, reason, evidence);
          content.append(block);
        }
      } else if (tab === '档案') {
        content.append(sectionBlock(document, '固定本色（世界书）', profile.personalityBaseline));
        const fields: [string, string][] = [
          ['基本信息', profile.basicInfo],
          ['行为模式', profile.behaviorTuning],
          ['性格微调', profile.personalityTuning],
          ['说话方式', profile.speechStyleTuning],
          ['当前目标', profile.currentGoals],
          ['当前处境', profile.currentStatus],
          ['关系解释', profile.relationship],
          ['正文互动', profile.storyInteractionSummary],
          ['微信互动', profile.chatInteractionSummary],
          ['玩家行动建议', profile.playerActionAdvice],
        ];
        const form = document.createElement('form');
        form.className = 'phone-profile-editor';
        for (const [label, value] of fields) {
          const control = document.createElement('textarea');
          control.value = value;
          control.dataset.field = label;
          control.rows = label === '基本信息' ? 3 : 4;
          form.append(field(document, label, control));
        }
        const save = text(document, 'button', '保存修改') as HTMLButtonElement;
        save.className = 'phone-button phone-button--primary';
        save.type = 'button';
        save.disabled = !services.saveProfileEdit;
        context.listen(save, 'click', () => {
          if (!services.saveProfileEdit) return;
          const controls = new Map(
            Array.from(form.querySelectorAll('textarea')).map(node => [node.dataset.field, node.value]),
          );
          save.disabled = true;
          void services
            .saveProfileEdit(personId, {
              basicInfoAdditions: (controls.get('基本信息') ?? '')
                .split(/[；;\n]/)
                .map(value => value.trim())
                .filter(Boolean),
              behaviorTuning: controls.get('行为模式') ?? '',
              personalityTuning: controls.get('性格微调') ?? '',
              speechStyleTuning: controls.get('说话方式') ?? '',
              currentGoals: controls.get('当前目标') ?? '',
              currentSituationSummary: controls.get('当前处境') ?? '',
              relationshipInterpretation: controls.get('关系解释') ?? '',
              storyInteractionSummary: controls.get('正文互动') ?? '',
              chatInteractionSummary: controls.get('微信互动') ?? '',
              playerActionAdvice: controls.get('玩家行动建议') ?? '',
            })
            .then(() => context.announce('玩家修改已保存并写入档案'))
            .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
            .finally(() => {
              if (context.isActive()) context.requestRender();
            });
        });
        form.append(save);
        content.append(form);
      } else if (tab === '依据') {
        content.append(
          sectionBlock(document, '正文范围', profile.sourceRange),
          sectionBlock(document, '最近微信', profile.lastWechatRound.join('\n') || '暂无'),
        );
        const evidence = profile.changes?.flatMap(change => change.evidenceRefs) ?? [];
        content.append(sectionBlock(document, '引用标记', [...new Set(evidence)].join('\n') || '暂无可展示的引用标记'));
        if (profile.versions?.length) {
          const versions = document.createElement('section');
          versions.className = 'phone-profile-detail__section';
          versions.append(text(document, 'h2', '历史版本'));
          for (const version of [...profile.versions].reverse()) {
            const sourceLabel =
              version.source === 'ai' ? 'AI' : version.source === 'player' ? '玩家' : '恢复';
            const timeLabel = new Date(version.savedAt).toLocaleString('zh-CN');
            const restore = text(document, 'button', '') as HTMLButtonElement;
            restore.className = 'phone-button phone-profile-version dossier-versions__restore';
            restore.type = 'button';
            restore.setAttribute('aria-label', `恢复${sourceLabel}版本 ${timeLabel}`);
            restore.disabled = !services.restoreProfileVersion;
            const chip = text(document, 'span', sourceLabel);
            chip.className = 'dossier-versions__chip';
            const time = text(document, 'span', timeLabel);
            time.className = 'dossier-versions__time';
            restore.append(chip, time);
            context.listen(restore, 'click', () => {
              if (!services.restoreProfileVersion) return;
              restore.disabled = true;
              void services
                .restoreProfileVersion(personId, version.id)
                .then(() => context.announce('已恢复该版本'))
                .catch(error => context.announce(error instanceof Error ? error.message : String(error), 'error'))
                .finally(() => {
                  if (context.isActive()) context.requestRender();
                });
            });
            versions.append(restore);
          }
          content.append(versions);
        }
      } else {
        content.append(sectionBlock(document, 'AI 分析说明', profile.analysisNarrative || '暂无'));
        if (profile.reasoningContent) content.append(sectionBlock(document, '模型推理回传', profile.reasoningContent));
        if (profile.rawResponse) content.append(sectionBlock(document, '原始结构化回传', profile.rawResponse));
        else content.append(sectionBlock(document, '原始结构化回传', '暂无，当前档案来自旧版本或玩家修改。'));
      }
    };
    for (const tab of tabNames) {
      const button = text(document, 'button', tab) as HTMLButtonElement;
      button.className = 'phone-profile-tab';
      button.type = 'button';
      button.setAttribute('aria-selected', tab === '变化' ? 'true' : 'false');
      context.listen(button, 'click', () => renderTab(tab));
      tabButtons.push(button);
      tabs.append(button);
    }
    page.append(tabs, content);
    renderTab('变化');
    return page;
  } catch (error) {
    const failure = empty(document, '档案详情加载失败');
    failure.append(text(document, 'p', error instanceof Error ? error.message : String(error)));
    return failure;
  }
}

function debugSection(document: Document, title: string, value: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'phone-debug-entry__section';
  section.append(text(document, 'h3', title));
  const pre = text(document, 'pre', value);
  pre.className = 'phone-debug-entry__pre';
  section.append(pre);
  return section;
}
function sectionBlock(document: Document, title: string, value: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'phone-profile-detail__section';
  section.append(text(document, 'h2', title), text(document, 'p', value.trim() || '暂无'));
  return section;
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
