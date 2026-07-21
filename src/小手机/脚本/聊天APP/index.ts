// ==================== 聊天APP ====================
// 注册到 PhoneSystem 手机桌面，提供 Vue 聊天界面渲染函数
// 界面由小手机主程序在手机 iframe 内调用渲染

import type { VNode } from 'vue';

$(() => {
  // ==================== Pinia Store ====================

  // 轻量级响应式 store（不依赖 pinia npm 包，避免外部依赖问题）
  function createChatStore() {
    const { reactive, ref, computed } = (window.parent as any).Vue || {};

    // 回退：如果 Vue 不可用，直接用 vanilla
    if (!reactive) {
      // vanilla 回退：不使用响应式
      const store = {
        conversations: [] as any[],
        activeConvId: null as string | null,
        messages: [] as any[],
        isGenerating: false,
        inputText: '',
        activeConv: null as any,
      };
      return { store, isVue: false };
    }

    const conversations = reactive<any[]>([]);
    const activeConvId = ref<string | null>(null);
    const messages = reactive<any[]>([]);
    const isGenerating = ref(false);
    const inputText = ref('');
    const activeConv = computed(() => conversations.find((c: any) => c.id === activeConvId.value));

    return {
      store: { conversations, activeConvId, messages, isGenerating, inputText, activeConv },
      isVue: true,
      reactive,
      ref,
      computed,
    };
  }

  // ==================== 渲染函数 ====================

  // 用 h() 渲染函数构建聊天界面（兼容无模板编译器）
  function createChatRenderer(h: any) {
    type ChatStore = ReturnType<typeof createChatStore>['store'];

    return {
      setup() {
        const vue = (window.parent as any).Vue;
        const store = vue.reactive({
          conversations: [] as any[],
          activeConvId: null as string | null,
          messages: [] as any[],
          isGenerating: false,
          inputText: '',
          activeConv: null as any,
        });

        const loadConversations = async () => {
          try {
            const ChatDB = (window.parent as any).ChatDB;
            if (ChatDB) {
              const convs = await ChatDB.getConversations();
              store.conversations.length = 0;
              store.conversations.push(...convs);
            }
          } catch (e) { console.warn('[聊天APP] 加载会话失败:', e); }
        };

        // ===== 从 MVU 租客列表扫描并创建会话 =====
        const scanTenantsAndCreateChats = async () => {
          try {
            const ChatDB = (window.parent as any).ChatDB;
            if (!ChatDB) { console.warn('[聊天APP] ChatDB 未就绪'); return; }

            // 尝试从 MVU stat_data 读取租客列表
            let tenants: string[] = [];
            try {
              if ((window.parent as any).Mvu?.getMvuData) {
                const mvu = (window.parent as any).Mvu.getMvuData({ type: 'message', message_id: -1 });
                const tenantList = mvu?.stat_data?.租客列表 || mvu?.stat_data?.tenants;
                if (tenantList && typeof tenantList === 'object') {
                  tenants = Object.keys(tenantList);
                }
              }
            } catch { /* MVU 不可用 */ }

            // 如果 MVU 没数据，尝试从角色卡世界书读 variables
            if (tenants.length === 0) {
              try {
                const vars = (window.parent as any).getVariables?.({ type: 'chat' }) || {};
                const tl = vars?.租客列表 || vars?.tenants;
                if (tl && typeof tl === 'object') tenants = Object.keys(tl);
              } catch { /* 无变量 */ }
            }

            if (tenants.length === 0) {
              alert('未找到租客数据。\n\n请确认：\n1. 当前角色卡有 stat_data.租客列表\n2. MVU 变量框架已启用\n3. 至少进行过一轮对话');
              return;
            }

            // 过滤已存在的会话
            const existing = await ChatDB.getConversations();
            const existingNames = new Set(existing.map((c: any) => c.name));
            let created = 0;

            for (const name of tenants) {
              if (existingNames.has(name)) continue;
              await ChatDB.createConversation({ type: 'private', members: [name], name });
              created++;
            }

            // 如果没有租客群聊，创建一个
            const hasGroup = existing.some((c: any) => c.type === 'group');
            if (!hasGroup && tenants.length > 1) {
              await ChatDB.createConversation({ type: 'group', members: tenants, name: tenants[0] + '等人的群聊' });
              created++;
            }

            await loadConversations();
            console.log(`[聊天APP] ✅ 已创建 ${created} 个新会话`);
          } catch (e) {
            console.error('[聊天APP] 扫描租客失败:', e);
            alert('创建会话失败: ' + (e as any).message);
          }
        };

        const loadMessages = async (convId: string) => {
          try {
            const ChatDB = (window.parent as any).ChatDB;
            if (ChatDB) {
              const msgs = await ChatDB.getRecentMessages(convId, 50);
              store.messages.length = 0;
              store.messages.push(...msgs);
            }
          } catch (e) { console.warn('[聊天APP] 加载消息失败:', e); }
        };

        const openConversation = async (conv: any) => {
          store.activeConvId = conv.id;
          store.activeConv = conv;
          await loadMessages(conv.id);
          scrollChatBottom();
        };

        const goBack = () => {
          store.activeConvId = null;
          store.activeConv = null;
          store.messages.length = 0;
        };

        const scrollChatBottom = () => {
          setTimeout(() => {
            const el = document.getElementById('phone-chat-msgs');
            if (el) el.scrollTop = el.scrollHeight;
          }, 80);
        };

        const sendMessage = async () => {
          const text = store.inputText.trim();
          if (!text || store.isGenerating) return;
          store.inputText = '';
          store.isGenerating = true;

          try {
            const ChatCore = (window.parent as any).ChatCore;
            const ChatDB = (window.parent as any).ChatDB;
            const conv = store.activeConv;
            if (!ChatCore || !ChatDB || !conv) {
              store.isGenerating = false;
              return;
            }

            const userMsg = await ChatDB.addMessage(conv.id, '<user>', text);
            store.messages.push(userMsg);
            scrollChatBottom();

            let replies: any[];
            if (conv.type === 'group') {
              replies = await ChatCore.generateGroupReply(conv.id, text);
            } else {
              replies = await ChatCore.generatePrivateReply(conv.id, text);
            }
            if (replies) {
              for (const r of replies) store.messages.push(r);
            }

            const ChatSync = (window.parent as any).ChatSync;
            if (ChatSync) ChatSync.instantSync(conv.id);
          } catch (e: any) {
            if (e.message !== 'AbortError') {
              store.messages.push({ sender: '<system>', content: '❌ 发送失败: ' + (e.message || '未知'), gameTime: null, syncedToLore: true });
            }
          } finally {
            store.isGenerating = false;
            scrollChatBottom();
          }
        };

        vue.onMounted(() => { loadConversations(); });

        return () => {
          // 会话列表视图
          if (!store.activeConvId) {
            return h('div', {
              style: 'width:100%;height:100%;display:flex;flex-direction:column;background:#ededed;color:#000;font-family:"Microsoft YaHei",sans-serif;overflow:hidden;',
            }, [
              h('div', {
                style: 'padding:10px 14px;font-size:14px;font-weight:600;color:#333;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ddd;flex-shrink:0;',
              }, [
                h('span', '💬 聊天'),
                h('span', { onClick: loadConversations, style: 'font-size:12px;color:#07c160;cursor:pointer;' }, '🔄'),
              ]),
              h('div', { style: 'flex:1;overflow-y:auto;padding:8px;' },
                store.conversations.length === 0
                  ? [h('div', { style: 'text-align:center;padding:30px 20px;color:#999;' }, [
                      h('div', { style: 'font-size:40px;margin-bottom:10px;' }, '💬'),
                      h('p', { style: 'font-size:13px;' }, '暂无聊天记录'),
                      h('p', { style: 'font-size:11px;margin-bottom:12px;' }, '请从角色卡导入租客以创建会话'),
                      h('button', {
                        onClick: scanTenantsAndCreateChats,
                        style: 'padding:8px 20px;border-radius:8px;border:none;background:#07c160;color:#fff;font-size:13px;font-weight:600;cursor:pointer;',
                      }, '📥 从角色卡导入租客'),
                    ])]
                  : store.conversations.map((conv: any) =>
                      h('div', {
                        key: conv.id,
                        onClick: () => openConversation(conv),
                        style: 'display:flex;align-items:center;gap:10px;padding:12px;margin:4px 0;background:#fff;border-radius:8px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.05);',
                      }, [
                        h('div', {
                          style: 'width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#07c160,#00a650);display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;flex-shrink:0;',
                        }, conv.type === 'group' ? '👥' : '👤'),
                        h('div', { style: 'flex:1;min-width:0;' }, [
                          h('div', { style: 'font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' },
                            conv.name || (conv.type === 'private' ? conv.members?.[0] : '群聊')),
                          h('div', { style: 'font-size:11px;color:#999;' }, conv.type === 'group' ? (conv.members?.length || 0) + '人' : '私聊'),
                        ]),
                      ]),
                    ),
              ),
            ]);
          }

          // 聊天视图
          const conv = store.activeConv;
          return h('div', {
            style: 'width:100%;height:100%;display:flex;flex-direction:column;background:#ededed;color:#000;font-family:"Microsoft YaHei",sans-serif;overflow:hidden;',
          }, [
            h('div', {
              style: 'padding:8px 12px;background:#f0f0f0;display:flex;align-items:center;gap:8px;border-bottom:1px solid #ddd;flex-shrink:0;',
            }, [
              h('span', { onClick: goBack, style: 'cursor:pointer;font-size:16px;' }, '←'),
              h('span', { style: 'font-weight:600;font-size:14px;' }, conv?.name || conv?.members?.[0] || '聊天'),
            ]),
            h('div', {
              id: 'phone-chat-msgs',
              style: 'flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;',
            }, [
              ...store.messages.map((msg: any, i: number) => {
                const isMe = msg.sender === '<user>';
                const isSys = msg.sender === '<system>';
                return h('div', {
                  key: msg.id || i,
                  style: `display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};`,
                }, [
                  (!isMe && !isSys)
                    ? h('div', { style: 'font-size:10px;color:#888;margin-bottom:1px;padding:0 4px;' }, msg.sender)
                    : null,
                  h('div', {
                    style: `max-width:78%;padding:7px 10px;border-radius:8px;font-size:13px;line-height:1.5;word-break:break-word;background:${isMe ? '#95ec69' : isSys ? '#ffe0e0' : '#fff'};color:#000;box-shadow:0 1px 2px rgba(0,0,0,0.04);`,
                  }, msg.content),
                  msg.gameTime?.时间
                    ? h('div', { style: 'font-size:9px;color:#bbb;margin-top:1px;padding:0 2px;' }, msg.gameTime.时间)
                    : null,
                ].filter(Boolean));
              }),
              store.isGenerating
                ? h('div', { style: 'text-align:center;color:#999;font-size:12px;padding:8px;' }, '⏳ 对方正在输入...')
                : null,
            ]),
            h('div', {
              style: 'padding:6px 8px;background:#f7f7f7;display:flex;gap:6px;border-top:1px solid #ddd;flex-shrink:0;',
            }, [
              h('input', {
                value: store.inputText,
                onInput: (e: any) => { store.inputText = e.target.value; },
                onKeydown: (e: any) => { if (e.key === 'Enter') sendMessage(); },
                placeholder: '输入消息…',
                style: 'flex:1;padding:8px 10px;border-radius:6px;border:1px solid #ddd;font-size:13px;outline:none;min-width:0;',
              }),
              h('button', {
                onClick: sendMessage,
                disabled: store.isGenerating || !store.inputText.trim(),
                style: `padding:8px 14px;border-radius:6px;border:none;background:#07c160;color:#fff;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;opacity:${store.isGenerating || !store.inputText.trim() ? 0.5 : 1};`,
              }, '发送'),
            ]),
          ]);
        };
      },
    };
  }

  // ==================== 注册到 PhoneSystem ====================

  async function registerToPhoneSystem(): Promise<void> {
    // 轮询等待 PhoneSystem 就绪
    const PS: any = await new Promise(resolve => {
      const check = () => {
        const ps = (window.parent as any).PhoneSystem;
        if (ps) resolve(ps);
        else setTimeout(check, 300);
      };
      check();
    });

    console.log('[聊天APP] PhoneSystem 已就绪，注册...');

    // 注册到桌面
    PS.registerApp({
      id: 'chat-app',
      name: '微信',
      icon: '💬',
      color: '#07c160',
      order: 1,
    });

    // 监听 APP 打开事件
    PS.on('app-opened', (appId: string) => {
      if (appId !== 'chat-app') return;

      // 延迟等待 DOM 挂载点就绪
      const tryMount = (retries = 0) => {
        if (retries > 20) return;

        // ===== 关键修复：容器在手机 iframe 内部，不在脚本自身 DOM 中 =====
        // 手机 iframe 挂载在父页面的 body 上，需要通过父窗口访问
        const phoneFrame = (window.parent.document.getElementById('phone-entry-btn')
          ?.nextElementSibling as HTMLIFrameElement | null)
          || (window.parent.document.querySelector('iframe[script_id]') as HTMLIFrameElement | null);

        if (!phoneFrame?.contentDocument) {
          setTimeout(() => tryMount(retries + 1), 100);
          return;
        }

        const container = phoneFrame.contentDocument.getElementById('app-content-chat-app');
        if (!container) {
          setTimeout(() => tryMount(retries + 1), 100);
          return;
        }

        // 清空旧内容
        container.innerHTML = '';

        const mountEl = document.createElement('div');
        mountEl.id = 'chat-app-vue-mount';
        container.appendChild(mountEl);

        const vue = (window.parent as any).Vue;
        if (!vue?.createApp) {
          console.error('[聊天APP] Vue 不可用');
          return;
        }

        if ((window as any).__chatAppInstance) {
          (window as any).__chatAppInstance.unmount();
        }

        try {
          const app = vue.createApp(createChatRenderer(vue.h));
          app.mount(mountEl);
          (window as any).__chatAppInstance = app;
          console.log('[聊天APP] ✅ 聊天界面已挂载到手机');
        } catch (e) {
          console.error('[聊天APP] 挂载失败:', e);
        }
      };

      setTimeout(() => tryMount(), 200);
    });

    console.log('[聊天APP] ✅ 已注册到手机桌面');
  }

  registerToPhoneSystem();
  console.log('✅ [聊天APP] 已加载，等待 PhoneSystem...');
});
