// ==================== 聊天 APP ====================
// PhoneSystem owns the iframe and passes the exact container and Vue runtime to this renderer.

import type * as VueRuntime from 'vue';
import { createLatestMessageOperationGuard } from './chatMessageOperation';
import { createConversationCreationCoordinator } from './conversationCreationCoordinator';
import { decideGroupConversation, decidePrivateConversation, type ConversationLike } from './conversationCreation';
import { mountChatRenderer, waitForPhoneSystem } from './chatRendererLifecycle';
import { loadStatDataRootNames, type StatDataRootNameFailure } from './statDataRootNames';

declare const substitudeMacros: (source: string) => string;

type Vue = typeof VueRuntime;
type ListState = 'loading' | 'ready' | 'error';
type CandidateState = 'idle' | 'loading' | 'ready' | 'error';
type CreationMode = 'private' | 'group' | null;

interface ChatStore {
  conversations: ConversationLike[];
  listState: ListState;
  listError: string;
  notice: string;
  modalOpen: boolean;
  creationMode: CreationMode;
  candidateState: CandidateState;
  candidates: string[];
  candidateError: string;
  selectedNames: string[];
  groupName: string;
  creationError: string;
  isCreating: boolean;
  componentGeneration: number;
  modalGeneration: number;
  activeConvId: string | null;
  activeConv: ConversationLike | null;
  messages: any[];
  isGenerating: boolean;
  inputText: string;
}

interface PhoneSystemLike {
  registerApp(app: { id: string; name: string; icon: string; color: string; order: number }): void;
  registerRenderer(
    appId: string,
    renderer: (context: { container: HTMLElement; vue: Vue }) => void | (() => void),
  ): void;
  unregisterRenderer(appId: string): void;
  getContextGeneration(): number;
}

const chatMetadata = {
  id: 'chat-app',
  name: '微信',
  icon: '💬',
  color: '#07c160',
  order: 1,
};

const candidateErrorMessage: Record<StatDataRootNameFailure, string> = {
  'source-error': '无法读取 stat_data，请稍后重试',
  'macro-unexpanded': 'stat_data 宏尚未展开，请确认当前消息已有变量数据',
  'parse-error': 'stat_data 格式无法解析',
  'not-object': 'stat_data 根节点不是角色对象',
  empty: 'stat_data 根列表中没有可选角色',
};

const creationErrorMessage = {
  'select-one': '私聊需要选择一名角色',
  'select-at-least-two': '群聊至少需要选择两名角色',
  'lookup-error': '读取现有会话失败，请重试',
  'create-error': '创建会话失败，请重试',
  busy: '正在创建会话，请稍候',
  stale: '',
} as const;

function createChatRenderer(vue: Vue, PS: PhoneSystemLike) {
  return {
    setup() {
      let disposed = false;
      let scrollTimer: ReturnType<typeof setTimeout> | null = null;
      const messageListElement = vue.ref<HTMLElement | null>(null);
      const messageOperation = createLatestMessageOperationGuard();
      const store = vue.reactive<ChatStore>({
        conversations: [],
        listState: 'loading',
        listError: '',
        notice: '',
        modalOpen: false,
        creationMode: null,
        candidateState: 'idle',
        candidates: [],
        candidateError: '',
        selectedNames: [],
        groupName: '',
        creationError: '',
        isCreating: false,
        componentGeneration: 0,
        modalGeneration: 0,
        activeConvId: null,
        activeConv: null,
        messages: [],
        isGenerating: false,
        inputText: '',
      });

      function captureComponentContext() {
        return {
          component: store.componentGeneration,
          phone: PS.getContextGeneration(),
        };
      }

      function isComponentContextCurrent(token: ReturnType<typeof captureComponentContext>): boolean {
        return !disposed && token.component === store.componentGeneration
          && token.phone === PS.getContextGeneration();
      }

      function captureModalContext() {
        return {
          ...captureComponentContext(),
          modal: store.modalGeneration,
        };
      }

      function isModalContextCurrent(token: ReturnType<typeof captureModalContext>): boolean {
        return isComponentContextCurrent(token) && token.modal === store.modalGeneration;
      }

      function replaceItems<T>(target: T[], items: T[]): void {
        target.splice(0, target.length, ...items);
      }

      async function loadConversations(): Promise<void> {
        const context = captureComponentContext();
        store.listState = 'loading';
        store.listError = '';
        try {
          const ChatDB = (window.parent as any).ChatDB;
          if (!ChatDB) throw new Error('ChatDB 未就绪');
          const conversations = await ChatDB.getConversations();
          if (!isComponentContextCurrent(context)) return;
          replaceItems(store.conversations, conversations);
          store.listState = 'ready';
        } catch (error) {
          if (!isComponentContextCurrent(context)) return;
          store.listState = 'error';
          store.listError = error instanceof Error ? error.message : '未知错误';
        }
      }

      function scrollChatBottom(
        context: ReturnType<typeof captureComponentContext>,
        convId: string | null,
      ): void {
        if (scrollTimer !== null) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          scrollTimer = null;
          if (!isComponentContextCurrent(context) || store.activeConvId !== convId) return;
          const el = messageListElement.value;
          if (el) el.scrollTop = el.scrollHeight;
        }, 80);
      }

      async function loadMessages(convId: string): Promise<void> {
        const context = captureComponentContext();
        try {
          const ChatDB = (window.parent as any).ChatDB;
          if (!ChatDB) throw new Error('ChatDB 未就绪');
          const messages = await ChatDB.getRecentMessages(convId, 50);
          if (!isComponentContextCurrent(context) || store.activeConvId !== convId) return;
          replaceItems(store.messages, messages);
          scrollChatBottom(context, convId);
        } catch (error) {
          if (isComponentContextCurrent(context) && store.activeConvId === convId) {
            console.warn('[聊天APP] 加载消息失败:', error);
          }
        }
      }

      async function openConversation(conv: ConversationLike): Promise<void> {
        store.activeConvId = conv.id;
        store.activeConv = conv;
        replaceItems(store.messages, []);
        await loadMessages(conv.id);
      }

      function goBack(): void {
        store.activeConvId = null;
        store.activeConv = null;
        replaceItems(store.messages, []);
      }

      async function openCreationModal(): Promise<void> {
        store.modalGeneration += 1;
        const context = captureModalContext();
        store.modalOpen = true;
        store.creationMode = null;
        store.candidates = [];
        store.candidateError = '';
        store.selectedNames = [];
        store.groupName = '';
        store.creationError = '';
        store.isCreating = false;
        store.candidateState = 'loading';
        await vue.nextTick();
        if (!isModalContextCurrent(context)) return;
        await loadCreationCandidates();
      }

      async function loadCreationCandidates(): Promise<void> {
        store.modalGeneration += 1;
        const context = captureModalContext();
        store.candidateState = 'loading';
        store.candidateError = '';
        await vue.nextTick();
        if (!isModalContextCurrent(context) || !store.modalOpen) return;
        const result = loadStatDataRootNames(source => substitudeMacros(source));
        if (!isModalContextCurrent(context)) return;
        if (result.ok) {
          store.candidates = result.names;
          store.selectedNames = store.selectedNames.filter(name => result.names.includes(name));
          store.candidateState = 'ready';
        } else {
          store.candidates = [];
          store.candidateState = 'error';
          store.candidateError = candidateErrorMessage[result.reason];
        }
      }

      function closeCreationModal(): void {
        store.modalGeneration += 1;
        store.modalOpen = false;
        store.creationMode = null;
        store.candidateState = 'idle';
        store.candidates = [];
        store.candidateError = '';
        store.selectedNames = [];
        store.groupName = '';
        store.creationError = '';
        store.isCreating = false;
      }

      const coordinator = createConversationCreationCoordinator({
        getConversations: () => (window.parent as any).ChatDB.getConversations(),
        createConversation: payload => (window.parent as any).ChatDB.createConversation(payload),
        captureContext: captureModalContext,
        isCurrent: isModalContextCurrent,
        onCommit: conversation => {
          const index = store.conversations.findIndex(item => item.id === conversation.id);
          if (index === -1) store.conversations.push(conversation);
          else store.conversations.splice(index, 1, conversation);
          closeCreationModal();
          void openConversation(conversation);
        },
        refreshConversations: loadConversations,
        onRefreshError: () => {
          if (!disposed) store.notice = '列表刷新失败，请稍后重试';
        },
      });

      async function submitCreation(): Promise<void> {
        if (store.isCreating || store.candidateState !== 'ready' || store.creationMode === null) return;
        const submitContext = captureModalContext();
        store.isCreating = true;
        store.creationError = '';
        try {
          const result = store.creationMode === 'private'
            ? await coordinator.confirmPrivate([...store.selectedNames])
            : await coordinator.confirmGroup([...store.selectedNames], store.groupName);
          if (isModalContextCurrent(submitContext) && !result.ok && result.reason !== 'stale') {
            store.creationError = creationErrorMessage[result.reason];
          }
        } catch (error) {
          console.error('[聊天APP] 会话提交回调失败:', error);
          if (isModalContextCurrent(submitContext)) {
            closeCreationModal();
            goBack();
            store.notice = '会话状态需要刷新，已返回列表，请稍后重试';
            void loadConversations();
          }
        } finally {
          if (isModalContextCurrent(submitContext)) store.isCreating = coordinator.isBusy();
        }
      }

      function chooseMode(mode: Exclude<CreationMode, null>): void {
        if (store.isCreating) return;
        store.creationMode = mode;
        store.selectedNames = [];
        store.groupName = '';
        store.creationError = '';
      }

      function toggleCandidate(name: string): void {
        if (store.isCreating || store.creationMode === null) return;
        if (store.creationMode === 'private') {
          store.selectedNames = [name];
          return;
        }
        store.selectedNames = store.selectedNames.includes(name)
          ? store.selectedNames.filter(item => item !== name)
          : [...store.selectedNames, name];
      }

      function canSubmitCreation(): boolean {
        if (store.candidateState !== 'ready' || store.isCreating || store.creationMode === null) return false;
        return store.creationMode === 'private'
          ? decidePrivateConversation(store.selectedNames, store.conversations).ok
          : decideGroupConversation(store.selectedNames, store.groupName).ok;
      }

      async function sendMessage(): Promise<void> {
        const text = store.inputText.trim();
        if (!text || store.isGenerating) return;
        const sendContext = captureComponentContext();
        const conv = store.activeConv;
        if (!conv) return;
        const operationToken = messageOperation.start();
        store.inputText = '';
        store.isGenerating = true;

        try {
          const ChatCore = (window.parent as any).ChatCore;
          const ChatDB = (window.parent as any).ChatDB;
          if (!ChatCore || !ChatDB) return;

          const userMsg = await ChatDB.addMessage(conv.id, '<user>', text);
          if (!messageOperation.isCurrent(operationToken) || !isComponentContextCurrent(sendContext)) return;
          if (store.activeConvId === conv.id) {
            store.messages.push(userMsg);
            scrollChatBottom(sendContext, conv.id);
          }

          let replies: any[];
          if (conv.type === 'group') replies = await ChatCore.generateGroupReply(conv.id, text);
          else replies = await ChatCore.generatePrivateReply(conv.id, text);
          if (!messageOperation.isCurrent(operationToken) || !isComponentContextCurrent(sendContext)) return;
          if (store.activeConvId === conv.id && replies) store.messages.push(...replies);

          const ChatSync = (window.parent as any).ChatSync;
          if (ChatSync) ChatSync.instantSync(conv.id);
        } catch (error: any) {
          if (messageOperation.isCurrent(operationToken) && isComponentContextCurrent(sendContext)
            && store.activeConvId === conv.id && error?.message !== 'AbortError') {
            store.messages.push({
              sender: '<system>',
              content: `❌ 发送失败: ${error?.message || '未知'}`,
              gameTime: null,
              syncedToLore: true,
            });
          }
        } finally {
          const ownsActiveConversation = messageOperation.isCurrent(operationToken)
            && isComponentContextCurrent(sendContext) && store.activeConvId === conv.id;
          if (isComponentContextCurrent(sendContext)) {
            if (messageOperation.finish(operationToken)) {
              store.isGenerating = false;
              if (ownsActiveConversation) scrollChatBottom(sendContext, conv.id);
            }
          }
        }
      }

      vue.onMounted(() => { void loadConversations(); });
      vue.onBeforeUnmount(() => {
        try {
          (window.parent as any).ChatCore?.abort?.();
        } catch (error) {
          console.warn('[聊天APP] 中止生成失败:', error);
        }
        messageOperation.invalidate();
        disposed = true;
        store.componentGeneration += 1;
        store.modalGeneration += 1;
        if (scrollTimer !== null) clearTimeout(scrollTimer);
        scrollTimer = null;
      });

      const h = vue.h;
      const renderConversationRows = () => store.conversations.map(conv => h('button', {
        key: conv.id,
        type: 'button',
        onClick: () => { void openConversation(conv); },
        style: 'width:100%;display:flex;align-items:center;gap:10px;padding:12px;margin:4px 0;background:#fff;border:0;border-radius:8px;cursor:pointer;text-align:left;box-shadow:0 1px 2px rgba(0,0,0,.05);',
      }, [
        h('span', { style: 'width:42px;height:42px;border-radius:50%;background:#07c160;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;flex-shrink:0;' }, conv.type === 'group' ? '👥' : '👤'),
        h('span', { style: 'flex:1;min-width:0;' }, [
          h('span', { style: 'display:block;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, conv.name || conv.members[0]),
          h('span', { style: 'display:block;font-size:11px;color:#999;margin-top:3px;' }, conv.type === 'group' ? `${conv.members.length}人` : '私聊'),
        ]),
      ]));

      const renderCreationModal = () => {
        if (!store.modalOpen) return null;
        const candidateContent = store.candidateState === 'loading'
          ? h('p', { style: 'color:#888;text-align:center;' }, '正在读取角色…')
          : store.candidateState === 'error'
            ? h('div', { style: 'color:#c33;font-size:12px;text-align:center;' }, [
                h('p', store.candidateError),
                h('button', {
                  type: 'button',
                  disabled: store.isCreating,
                  onClick: () => { void loadCreationCandidates(); },
                }, '重新读取'),
              ])
            : h('div', { style: 'display:flex;flex-wrap:wrap;gap:7px;' }, store.candidates.map(name => {
                const selected = store.selectedNames.includes(name);
                return h('button', {
                  key: name,
                  type: 'button',
                  disabled: store.creationMode === null || store.isCreating,
                  onClick: () => toggleCandidate(name),
                  style: `padding:7px 10px;border-radius:14px;border:1px solid ${selected ? '#07c160' : '#ccc'};background:${selected ? '#e7f8ee' : '#fff'};color:#333;`,
                }, `${selected ? '✓ ' : ''}${name}`);
              }));
        return h('div', {
          style: 'position:absolute;inset:0;background:rgba(0,0,0,.38);display:flex;align-items:flex-end;z-index:20;',
          onClick: (event: MouseEvent) => { if (event.target === event.currentTarget && !store.isCreating) closeCreationModal(); },
        }, [h('div', { style: 'width:100%;max-height:86%;overflow:auto;background:#fff;border-radius:16px 16px 0 0;padding:16px;box-sizing:border-box;' }, [
          h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;' }, [
            h('strong', '新建聊天'),
            h('button', { type: 'button', disabled: store.isCreating, onClick: closeCreationModal, style: 'border:0;background:transparent;font-size:20px;' }, '×'),
          ]),
          h('div', { style: 'display:flex;gap:8px;margin-bottom:12px;' }, [
            h('button', { type: 'button', disabled: store.isCreating, onClick: () => chooseMode('private'), style: `flex:1;padding:9px;border-radius:8px;border:1px solid #07c160;background:${store.creationMode === 'private' ? '#07c160' : '#fff'};color:${store.creationMode === 'private' ? '#fff' : '#07c160'};` }, '新建私聊'),
            h('button', { type: 'button', disabled: store.isCreating, onClick: () => chooseMode('group'), style: `flex:1;padding:9px;border-radius:8px;border:1px solid #07c160;background:${store.creationMode === 'group' ? '#07c160' : '#fff'};color:${store.creationMode === 'group' ? '#fff' : '#07c160'};` }, '新建群聊'),
          ]),
          store.creationMode === null ? h('p', { style: 'font-size:12px;color:#888;' }, '请先选择私聊或群聊') : null,
          candidateContent,
          store.creationMode === 'group' ? h('input', {
            value: store.groupName,
            disabled: store.isCreating,
            onInput: (event: InputEvent) => { store.groupName = (event.target as HTMLInputElement).value; },
            placeholder: '群聊名称（可选）',
            style: 'width:100%;box-sizing:border-box;margin-top:12px;padding:9px;border:1px solid #ddd;border-radius:8px;',
          }) : null,
          store.creationError ? h('p', { style: 'color:#c33;font-size:12px;' }, store.creationError) : null,
          h('button', {
            type: 'button',
            disabled: store.candidateState !== 'ready' || store.isCreating || store.creationMode === null || !canSubmitCreation(),
            onClick: () => { void submitCreation(); },
            style: `width:100%;margin-top:14px;padding:10px;border:0;border-radius:8px;background:#07c160;color:#fff;opacity:${canSubmitCreation() ? 1 : .45};`,
          }, store.isCreating ? '创建中…' : '确认创建'),
        ])]);
      };

      return () => {
        if (!store.activeConvId) {
          let listContent;
          if (store.listState === 'loading') {
            listContent = h('div', { style: 'text-align:center;padding:30px;color:#999;' }, '正在加载聊天记录…');
          } else if (store.listState === 'error') {
            listContent = h('div', { style: 'text-align:center;padding:30px;color:#999;' }, [
              h('p', '聊天记录加载失败'),
              h('p', { style: 'font-size:11px;' }, store.listError),
              h('button', { type: 'button', onClick: () => { void loadConversations(); } }, '重试'),
            ]);
          } else if (store.listState === 'ready' && store.conversations.length === 0) {
            listContent = h('div', { style: 'text-align:center;padding:30px 20px;color:#999;' }, [
              h('div', { style: 'font-size:40px;margin-bottom:10px;' }, '💬'),
              h('p', { style: 'font-size:13px;' }, '暂无聊天记录'),
              h('p', { style: 'font-size:11px;' }, '点击右上角 ＋ 新建私聊或群聊'),
            ]);
          } else {
            listContent = renderConversationRows();
          }

          return h('div', { style: 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;background:#ededed;color:#000;font-family:"Microsoft YaHei",sans-serif;overflow:hidden;' }, [
            h('div', { style: 'padding:10px 14px;font-size:14px;font-weight:600;color:#333;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ddd;flex-shrink:0;' }, [
              h('span', '💬 聊天'),
              h('span', { style: 'display:flex;align-items:center;gap:12px;' }, [
                h('button', { type: 'button', onClick: () => { void loadConversations(); }, style: 'border:0;background:transparent;color:#07c160;cursor:pointer;' }, '刷新'),
                h('button', { type: 'button', onClick: () => { void openCreationModal(); }, style: 'border:0;background:transparent;color:#07c160;font-size:22px;cursor:pointer;' }, '＋'),
              ]),
            ]),
            store.notice ? h('div', { style: 'padding:6px 10px;background:#fff5d6;color:#7a5a00;font-size:11px;' }, store.notice) : null,
            h('div', { style: 'flex:1;overflow-y:auto;padding:8px;' }, listContent),
            renderCreationModal(),
          ]);
        }

        const conv = store.activeConv;
        return h('div', { style: 'width:100%;height:100%;display:flex;flex-direction:column;background:#ededed;color:#000;font-family:"Microsoft YaHei",sans-serif;overflow:hidden;' }, [
          h('div', { style: 'padding:8px 12px;background:#f0f0f0;display:flex;align-items:center;gap:8px;border-bottom:1px solid #ddd;flex-shrink:0;' }, [
            h('button', { type: 'button', onClick: goBack, style: 'border:0;background:transparent;cursor:pointer;font-size:16px;' }, '←'),
            h('span', { style: 'font-weight:600;font-size:14px;' }, conv?.name || conv?.members[0] || '聊天'),
          ]),
          h('div', { ref: messageListElement, id: 'phone-chat-msgs', style: 'flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;' }, [
            ...store.messages.map((msg: any, index: number) => {
              const isMe = msg.sender === '<user>';
              const isSystem = msg.sender === '<system>';
              return h('div', { key: msg.id || index, style: `display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};` }, [
                !isMe && !isSystem ? h('div', { style: 'font-size:10px;color:#888;margin-bottom:1px;padding:0 4px;' }, msg.sender) : null,
                h('div', { style: `max-width:78%;padding:7px 10px;border-radius:8px;font-size:13px;line-height:1.5;word-break:break-word;background:${isMe ? '#95ec69' : isSystem ? '#ffe0e0' : '#fff'};color:#000;box-shadow:0 1px 2px rgba(0,0,0,.04);` }, msg.content),
                msg.gameTime?.时间 ? h('div', { style: 'font-size:9px;color:#bbb;margin-top:1px;padding:0 2px;' }, msg.gameTime.时间) : null,
              ]);
            }),
            store.isGenerating ? h('div', { style: 'text-align:center;color:#999;font-size:12px;padding:8px;' }, '⏳ 对方正在输入...') : null,
          ]),
          h('div', { style: 'padding:6px 8px;background:#f7f7f7;display:flex;gap:6px;border-top:1px solid #ddd;flex-shrink:0;' }, [
            h('input', {
              value: store.inputText,
              onInput: (event: InputEvent) => { store.inputText = (event.target as HTMLInputElement).value; },
              onKeydown: (event: KeyboardEvent) => { if (event.key === 'Enter') void sendMessage(); },
              placeholder: '输入消息…',
              style: 'flex:1;padding:8px 10px;border-radius:6px;border:1px solid #ddd;font-size:13px;outline:none;min-width:0;',
            }),
            h('button', {
              type: 'button',
              onClick: () => { void sendMessage(); },
              disabled: store.isGenerating || !store.inputText.trim(),
              style: `padding:8px 14px;border-radius:6px;border:0;background:#07c160;color:#fff;font-size:13px;font-weight:600;opacity:${store.isGenerating || !store.inputText.trim() ? .5 : 1};`,
            }, '发送'),
          ]),
        ]);
      };
    },
  };
}

let scriptDisposed = false;
let registeredPhoneSystem: PhoneSystemLike | null = null;
let stopWaitingForPhoneSystem: (() => void) | null = null;

function disposeChatAppScript(): void {
  if (scriptDisposed) return;
  scriptDisposed = true;
  stopWaitingForPhoneSystem?.();
  stopWaitingForPhoneSystem = null;
  registeredPhoneSystem?.unregisterRenderer('chat-app');
  registeredPhoneSystem = null;
}

$(() => {
  stopWaitingForPhoneSystem = waitForPhoneSystem({
    read: () => scriptDisposed ? null : ((window.parent as any).PhoneSystem as PhoneSystemLike | undefined),
    schedule: run => setTimeout(run, 300),
    cancel: timer => clearTimeout(timer),
    onReady: PS => {
      if (scriptDisposed) return;
      registeredPhoneSystem = PS;
      PS.registerApp(chatMetadata);
      PS.registerRenderer('chat-app', ({ container, vue }) =>
        mountChatRenderer({ container, vue, component: createChatRenderer(vue, PS) }));
      console.log('[聊天APP] 已注册到手机桌面');
    },
  });
  $(window).on('pagehide', disposeChatAppScript);
  console.log('[聊天APP] 已加载，等待 PhoneSystem...');
});
