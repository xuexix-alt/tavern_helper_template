// ==================== 小手机主程序 (PhoneSystem) ====================
// 手机系统的壳与总线：入口按钮、iframe 壳、APP 注册表、事件总线、副 API
// 导出到 window.parent.PhoneSystem
// 依赖：util/script.ts 中的 createScriptIdIframe

import { createScriptIdIframe } from '../../../../util/script';
import * as vue from 'vue';
import { createPhoneAppController, type PhoneAppRenderer } from './phoneAppController';
import { type PhoneApp, upsertPhoneApp } from './phoneAppRegistry';

const { computed, createApp, h, nextTick, reactive, ref } = vue;

interface APIConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

interface PhoneSettings {
  wallpaper: string;
  apiConfig: APIConfig;
}

const DEFAULT_SETTINGS: PhoneSettings = {
  wallpaper: '',
  apiConfig: {
    apiUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    maxTokens: 800,
    temperature: 0.85,
  },
};

$(() => {
  // ==================== 事件总线 ====================
  const listeners = new Map<string, Set<(...args: any[]) => void>>();

  const bus = {
    on(event: string, fn: (...args: any[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off(event: string, fn: (...args: any[]) => void) {
      listeners.get(event)?.delete(fn);
    },
    emit(event: string, ...args: any[]) {
      listeners.get(event)?.forEach(fn => {
        try {
          fn(...args);
        } catch (e) {
          console.warn(`[PhoneSystem] 事件 ${event} 错误:`, e);
        }
      });
    },
  };

  // ==================== APP 注册表 ====================
  const registeredApps = reactive<PhoneApp[]>([]);

  function registerApp(app: PhoneApp): void {
    upsertPhoneApp(registeredApps, app);
    console.log(`[PhoneSystem] APP已注册: ${app.name} (${app.id})`);
  }

  // ==================== 设置管理 ====================

  function getCurrentCharName(): string {
    try {
      const ctx = (window.parent as any).SillyTavern?.getContext?.();
      if (ctx?.name2) return ctx.name2;
      if (ctx?.characterId) return ctx.characterId;
    } catch {
      /* 静默 */
    }
    return 'default_chara';
  }

  function getStorageKey(): string {
    return `tavernPhoneSettings_${getCurrentCharName()}`;
  }

  function getSettings(): PhoneSettings {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          wallpaper: parsed.wallpaper ?? DEFAULT_SETTINGS.wallpaper,
          apiConfig: { ...DEFAULT_SETTINGS.apiConfig, ...(parsed.apiConfig || {}) },
        };
      }
    } catch {
      /* 静默 */
    }
    return { ...DEFAULT_SETTINGS, apiConfig: { ...DEFAULT_SETTINGS.apiConfig } };
  }

  function setSettings(partial: Partial<PhoneSettings>): void {
    const current = getSettings();
    const updated: PhoneSettings = {
      ...current,
      ...partial,
      apiConfig: { ...current.apiConfig, ...(partial.apiConfig || {}) },
    };
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
    } catch {
      /* 静默 */
    }
    bus.emit('settings-updated', updated);
  }

  function getAPIConfig(): APIConfig {
    return getSettings().apiConfig;
  }

  // ==================== 副 API 调用 ====================

  function normalizeApiUrl(url: string): string {
    if (!url || url.includes('/chat/completions')) return url;
    let fixed = url;
    if (!fixed.endsWith('/')) fixed += '/';
    fixed += fixed.includes('/v1') ? 'chat/completions' : 'v1/chat/completions';
    return fixed;
  }

  async function callExternalAPI(
    messages: { role: string; content: string }[],
    options?: { maxTokens?: number; temperature?: number; signal?: AbortSignal },
  ): Promise<string> {
    const config = getAPIConfig();
    if (!config.apiUrl || !config.apiKey) throw new Error('请先在手机设置中配置副 API');

    const apiUrl = normalizeApiUrl(config.apiUrl);
    const body = JSON.stringify({
      model: config.model,
      messages,
      max_tokens: options?.maxTokens ?? config.maxTokens,
      temperature: options?.temperature ?? config.temperature,
      top_p: 0.95,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
    });

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body,
      signal: options?.signal,
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`API请求失败 (${resp.status}): ${err.substring(0, 300)}`);
    }

    const data = await resp.json();
    if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
    throw new Error('API返回格式异常');
  }

  // ==================== API 设置 Vue 组件 (用 h() 渲染函数) ====================

  const SettingsPanel = {
    setup() {
      const settings = reactive(getSettings());
      const state = reactive({
        isLoadingModels: false,
        modelList: [] as string[],
      });

      const save = () => {
        console.log('[PhoneSystem] 保存设置:', settings.apiConfig);
        setSettings({ apiConfig: { ...settings.apiConfig } });
        alert('✅ 设置已保存');
      };

      const fetchModels = async () => {
        if (!settings.apiConfig.apiUrl || !settings.apiConfig.apiKey) {
          alert('⚠️ 请先填写 API URL 和 API Key');
          return;
        }

        state.isLoadingModels = true;
        try {
          const baseUrl = settings.apiConfig.apiUrl.trim();
          let modelsUrl = baseUrl;

          // 构建 /models 端点
          if (!modelsUrl.endsWith('/')) modelsUrl += '/';
          if (!modelsUrl.includes('/v1')) modelsUrl += 'v1/';
          modelsUrl += 'models';

          const resp = await fetch(modelsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${settings.apiConfig.apiKey}`,
            },
          });

          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
          }

          const data = await resp.json();
          if (data.data && Array.isArray(data.data)) {
            state.modelList = data.data
              .map((m: any) => {
                const modelId = m.id || m.name || String(m);
                return typeof modelId === 'string' ? modelId.trim() : String(modelId).trim();
              })
              .filter(Boolean);
            if (state.modelList.length === 0) {
              alert('⚠️ 未找到可用模型');
            }
          } else {
            throw new Error('API 返回格式异常');
          }
        } catch (e: any) {
          alert('❌ 拉取模型失败：' + (e.message || '未知错误'));
          state.modelList = [];
        } finally {
          state.isLoadingModels = false;
        }
      };

      const selectModel = (modelId: string) => {
        settings.apiConfig.model = modelId.trim();
        state.modelList = [];
      };

      return () =>
        h('div', { style: 'padding:12px;color:#fff;font-size:12px;overflow-y:auto;height:100%;' }, [
          h('div', { style: 'font-size:14px;font-weight:600;margin-bottom:10px;' }, '⚙️ 副 API 设置'),
          h('div', { style: 'margin-bottom:8px;' }, [
            h('div', { style: 'font-size:11px;color:#aaa;margin-bottom:2px;' }, 'API URL (OpenAI 兼容)'),
            h('input', {
              value: settings.apiConfig.apiUrl,
              onInput: (e: any) => {
                settings.apiConfig.apiUrl = e.target.value;
              },
              placeholder: 'https://api.deepseek.com',
              style:
                'width:100%;padding:6px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:#1a1a2e;color:#fff;font-size:11px;',
            }),
          ]),
          h('div', { style: 'margin-bottom:8px;' }, [
            h('div', { style: 'font-size:11px;color:#aaa;margin-bottom:2px;' }, 'API Key'),
            h('input', {
              value: settings.apiConfig.apiKey,
              onInput: (e: any) => {
                settings.apiConfig.apiKey = e.target.value;
              },
              type: 'password',
              placeholder: 'sk-...',
              style:
                'width:100%;padding:6px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:#1a1a2e;color:#fff;font-size:11px;',
            }),
          ]),
          h('div', { style: 'margin-bottom:8px;' }, [
            h('div', { style: 'font-size:11px;color:#aaa;margin-bottom:2px;display:flex;justify-content:space-between;align-items:center;' }, [
              h('span', '模型'),
              h(
                'button',
                {
                  onClick: fetchModels,
                  disabled: state.isLoadingModels,
                  style:
                    'padding:2px 8px;border-radius:4px;border:none;background:#007aff;color:#fff;font-size:10px;cursor:pointer;' +
                    (state.isLoadingModels ? 'opacity:0.5;' : ''),
                },
                state.isLoadingModels ? '⏳ 加载中...' : '🔄 拉取模型',
              ),
            ]),
            h('input', {
              value: settings.apiConfig.model,
              onInput: (e: any) => {
                settings.apiConfig.model = e.target.value;
              },
              placeholder: 'gpt-4o-mini',
              style:
                'width:100%;padding:6px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:#1a1a2e;color:#fff;font-size:11px;',
            }),
            // 模型列表下拉
            state.modelList.length > 0
              ? h(
                  'div',
                  {
                    style:
                      'margin-top:4px;max-height:150px;overflow-y:auto;background:#1a1a2e;border:1px solid rgba(255,255,255,0.15);border-radius:4px;',
                  },
                  state.modelList.map(modelId =>
                    h(
                      'div',
                      {
                        key: modelId,
                        onClick: () => selectModel(modelId),
                        style:
                          'padding:6px 8px;cursor:pointer;font-size:11px;border-bottom:1px solid rgba(255,255,255,0.05);' +
                          (settings.apiConfig.model === modelId ? 'background:#007aff;color:#fff;' : ''),
                        onMouseenter: (e: any) => {
                          if (settings.apiConfig.model !== modelId) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                          }
                        },
                        onMouseleave: (e: any) => {
                          if (settings.apiConfig.model !== modelId) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        },
                      },
                      modelId,
                    ),
                  ),
                )
              : null,
          ]),
          h(
            'button',
            {
              onClick: save,
              style:
                'padding:8px 20px;border-radius:6px;border:none;background:#07c160;color:#fff;font-size:13px;font-weight:600;cursor:pointer;width:100%;',
            },
            '💾 保存设置',
          ),
          h(
            'div',
            {
              style:
                'margin-top:16px;padding:10px;background:rgba(255,255,255,0.04);border-radius:6px;font-size:10px;color:#888;line-height:1.6;',
            },
            [
              h('div', '提示：'),
              h('div', '• 支持任意 OpenAI 兼容 API'),
              h('div', '• 地址无需带 /v1/chat/completions'),
              h('div', '• Key 仅保存在浏览器本地'),
            ],
          ),
        ]);
    },
  };

  // ==================== 手机桌面组件 (用 h() 渲染函数) ====================

  let phoneIframe: ReturnType<typeof createScriptIdIframe> | null = null;
  let phoneApp: ReturnType<typeof createApp> | null = null;
  const currentApp = ref<string | null>(null);

  const controller = createPhoneAppController({
    vue,
    scheduleMount: run => {
      void nextTick(run);
    },
    getContainer: appId =>
      (phoneIframe?.[0] as HTMLIFrameElement | undefined)?.contentDocument?.getElementById(`app-content-${appId}`) ??
      null,
    ensurePhoneVisible: () => {
      if (!phoneIframe) openPhone();
      else phoneIframe.show();
    },
    isRegisteredApp: appId => registeredApps.some(app => app.id === appId),
    setCurrentApp: appId => {
      currentApp.value = appId;
    },
    showPlaceholder: (container, message) => {
      container.innerHTML = '';
      container.textContent = message;
    },
    showError: (container, error) => {
      container.innerHTML = '';
      container.textContent = `APP 加载失败：${String((error as Error)?.message || error)}`;
    },
    logError: error => console.error('[PhoneSystem] renderer 清理失败:', error),
  });

  function registerRenderer(appId: string, renderer: PhoneAppRenderer): void {
    controller.registerRenderer(appId, renderer);
  }

  function unregisterRenderer(appId: string): void {
    controller.unregisterRenderer(appId);
  }

  function openApp(appId: string): boolean {
    return controller.openApp(appId);
  }

  function goHome(): void {
    controller.goHome();
  }

  const PhoneDesktop = {
    setup() {
      const sorted = computed(() => [...registeredApps].sort((a, b) => a.order - b.order));

      const appsForDock = computed(() => sorted.value.slice(0, 4));

      return () => {
        // 桌面模式
        if (!currentApp.value) {
          return h(
            'div',
            {
              style:
                'width:100%;height:100%;display:flex;flex-direction:column;background:linear-gradient(180deg,#1a1a2e 0%,#16213e 100%);color:#fff;font-family:"Microsoft YaHei",sans-serif;border-radius:16px;overflow:hidden;',
            },
            [
              // 状态栏
              h(
                'div',
                {
                  style:
                    'padding:8px 16px;display:flex;justify-content:space-between;font-size:11px;color:#aaa;flex-shrink:0;',
                },
                [
                  h('span', new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2, '0')),
                  h('span', '📶 🔋'),
                ],
              ),
              // APP 桌面网格
              h(
                'div',
                {
                  style: 'flex:1;overflow-y:auto;padding:12px;padding-bottom:60px;',
                },
                [
                  h(
                    'div',
                    {
                      style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;',
                    },
                    sorted.value.map((app: PhoneApp) =>
                      h(
                        'div',
                        {
                          key: app.id,
                          onClick: () => openApp(app.id),
                          style:
                            'display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:8px;border-radius:12px;',
                          onMouseenter: (e: any) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                          },
                          onMouseleave: (e: any) => {
                            e.currentTarget.style.background = 'transparent';
                          },
                        },
                        [
                          h(
                            'div',
                            {
                              style: `width:48px;height:48px;border-radius:12px;background:${app.color};display:flex;align-items:center;justify-content:center;font-size:24px;`,
                            },
                            app.icon,
                          ),
                          h('span', { style: 'font-size:11px;text-align:center;color:#ccc;' }, app.name),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              // 底部 Dock
              h(
                'div',
                {
                  style:
                    'position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:12px;padding:8px 0;background:rgba(0,0,0,0.2);border-top:1px solid rgba(255,255,255,0.06);',
                },
                appsForDock.value.map((app: PhoneApp) =>
                  h(
                    'div',
                    {
                      key: 'dock_' + app.id,
                      onClick: () => openApp(app.id),
                      style: 'cursor:pointer;',
                    },
                    [
                      h(
                        'div',
                        {
                          style: `width:40px;height:40px;border-radius:10px;background:${app.color};display:flex;align-items:center;justify-content:center;font-size:20px;`,
                        },
                        app.icon,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        }

        // APP 内页模式
        const app = sorted.value.find((a: PhoneApp) => a.id === currentApp.value);
        return h(
          'div',
          {
            style:
              'width:100%;height:100%;display:flex;flex-direction:column;background:linear-gradient(180deg,#1a1a2e 0%,#16213e 100%);color:#fff;font-family:"Microsoft YaHei",sans-serif;border-radius:16px;overflow:hidden;',
          },
          [
            h(
              'div',
              {
                style:
                  'padding:8px 12px;display:flex;align-items:center;gap:10px;background:rgba(0,0,0,0.3);cursor:pointer;flex-shrink:0;',
                onClick: goHome,
              },
              [
                h('span', { style: 'font-size:16px;' }, '←'),
                h('span', { style: 'font-size:13px;font-weight:600;' }, app?.name || '返回'),
              ],
            ),
            h('div', { id: `app-content-${currentApp.value}`, style: 'flex:1;overflow:hidden;' }),
          ],
        );
      };
    },
  };

  // ==================== 创建手机 iframe + 入口按钮 ====================

  function togglePhoneVisibility(): void {
    if (!phoneIframe) {
      openPhone();
      return;
    }
    if (phoneIframe.is(':visible')) phoneIframe.hide();
    else phoneIframe.show();
  }

  function openPhone(): void {
    if (phoneIframe) return;

    phoneIframe = createScriptIdIframe({ tailwind: true }) as JQuery<HTMLIFrameElement>;

    // 计算初始位置和尺寸：确保完全在视口内
    // 注意：使用 window.parent 获取主窗口的视口尺寸（因为脚本可能在 iframe 中运行）
    const viewportWidth = $(window.parent).width() || window.parent.innerWidth || 1249;
    const viewportHeight = $(window.parent).height() || window.parent.innerHeight || 1221;

    console.log('[PhoneSystem] 视口尺寸:', { viewportWidth, viewportHeight });

    // 移动端缩小尺寸以适应屏幕
    const isMobile = viewportWidth < 768;
    const phoneWidth = isMobile ? Math.min(330, viewportWidth - 20) : 330;
    const phoneHeight = isMobile ? Math.min(580, viewportHeight - 100) : 580;

    console.log('[PhoneSystem] 手机尺寸:', { phoneWidth, phoneHeight, isMobile });

    // 计算初始位置：右下角，但确保不超出视口
    // 如果空间够：right=20px, bottom=90px
    // 如果空间不够：调整到能容纳的最小边距
    const initialRight = viewportWidth > phoneWidth + 20 ? 20 : Math.max(0, viewportWidth - phoneWidth);
    const initialBottom = viewportHeight > phoneHeight + 90 ? 90 : Math.max(0, viewportHeight - phoneHeight);

    console.log('[PhoneSystem] 初始位置:', { initialRight, initialBottom });

    phoneIframe.appendTo(window.parent.document.body);

    // 计算 left 和 top 位置（从右下角反推）
    const left = viewportWidth - phoneWidth - initialRight;
    const top = viewportHeight - phoneHeight - initialBottom;

    // 使用 cssText 原子设置所有样式，避免逐个设置被其他规则覆盖
    const phoneEl = phoneIframe[0] as HTMLIFrameElement;
    const updatePhoneStyle = (el: HTMLIFrameElement) => {
      // Recompute based on current viewport
      const vw = window.parent.innerWidth;
      const vh = window.parent.innerHeight;
      const pw = Math.min(330, vw < 768 ? vw - 20 : 330);
      const ph = Math.min(580, vh - 100);
      const clampedL = Math.max(0, Math.min(vw - pw, vw - pw - 20));
      const clampedT = Math.max(0, Math.min(vh - ph, vh - ph - 90));

      el.style.cssText = [
        'position: fixed',
        `left: ${clampedL}px`,
        `top: ${clampedT}px`,
        `width: ${pw}px`,
        `height: ${ph}px`,
        `min-width: ${pw}px`,
        `min-height: ${ph}px`,
        'border-radius: 20px',
        'border: 2px solid rgba(255,255,255,0.15)',
        'z-index: 9999',
        'box-shadow: 0 8px 32px rgba(0,0,0,0.5)',
        'background: #1a1a2e',
      ].join(';');
    };

    updatePhoneStyle(phoneEl);

    phoneIframe.on('load', () => {
      const doc = (phoneIframe![0] as HTMLIFrameElement).contentDocument!;
      const mountTarget = doc.createElement('div');
      mountTarget.id = 'phone-mount';
      doc.body!.appendChild(mountTarget);

      phoneApp = createApp(PhoneDesktop);
      phoneApp.mount(mountTarget);

      // 挂载后重新确认 iframe 尺寸（防止被第三方样式覆盖）
      void nextTick(() => {
        updatePhoneStyle(phoneIframe![0] as HTMLIFrameElement);
        controller.refreshCurrent();
      });

      bus.emit('phone-opened');
      console.log('[PhoneSystem] 📱 手机已打开');
    });

    // 窗口大小变化时保持在可见范围
    $(window.parent).on('resize', () => {
      if (!phoneIframe || destroyed) return;
      updatePhoneStyle(phoneIframe[0] as HTMLIFrameElement);
    });
  }

  // ==================== 手机入口按钮（参考 FloatingMenuManager 模式） ====================

  const parentDocument = window.parent.document;
  const BTN_SIZE = 52;
  const ENTRY_STORAGE_KEY = 'tavernPhone_entryPosition';

  // 从 localStorage 恢复位置，或默认右下角
  const entryPos = (() => {
    try {
      const raw = localStorage.getItem(ENTRY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
          return { left: parsed.left, top: parsed.top };
        }
      }
    } catch { /* ignore */ }
    // 默认：右下角，距离边缘 20px
    const vw = window.parent.innerWidth;
    const vh = window.parent.innerHeight;
    return { left: vw - BTN_SIZE - 20, top: vh - BTN_SIZE - 80 };
  })();

  // 使用 parentDocument 创建元素
  const entryEl = parentDocument.createElement('div');
  entryEl.id = 'phone-entry-btn';
  entryEl.textContent = '📱';
  const entryStyles: Record<string, string> = {
    position: 'fixed',
    left: entryPos.left + 'px',
    top: entryPos.top + 'px',
    width: BTN_SIZE + 'px',
    height: BTN_SIZE + 'px',
    borderRadius: '26px',
    background: '#1a1a2e',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '26px',
    cursor: 'pointer',
    zIndex: '9998',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    border: '2px solid rgba(255,255,255,0.15)',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
  };
  Object.entries(entryStyles).forEach(([k, v]) => { entryEl.style.setProperty(k, v); });
  parentDocument.body.appendChild(entryEl);

  // 保存位置
  function saveEntryPosition() {
    try {
      localStorage.setItem(ENTRY_STORAGE_KEY, JSON.stringify({
        left: parseInt(entryEl.style.left),
        top: parseInt(entryEl.style.top),
      }));
    } catch { /* ignore */ }
  }

  // 调整位置到可见范围
  function adjustEntryToViewport() {
    const vw = window.parent.innerWidth;
    const vh = window.parent.innerHeight;
    let l = parseInt(entryEl.style.left) || entryPos.left;
    let t = parseInt(entryEl.style.top) || entryPos.top;
    let changed = false;
    if (l > vw - BTN_SIZE / 2) { l = vw - BTN_SIZE / 2; changed = true; }
    if (l < -BTN_SIZE / 2) { l = -BTN_SIZE / 2; changed = true; }
    if (t > vh - BTN_SIZE) { t = vh - BTN_SIZE; changed = true; }
    if (t < 0) { t = 0; changed = true; }
    if (changed) {
      entryEl.style.left = l + 'px';
      entryEl.style.top = t + 'px';
      saveEntryPosition();
    }
  }
  adjustEntryToViewport();

  // 拖拽（参考 FloatingMenuManager）
  let entryDragMoved = false;
  let entryDragData = { startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };
  let entryRafId: number | null = null;

  function entryHandleStart(e: MouseEvent | TouchEvent) {
    const touch = (e as TouchEvent).touches?.[0] || e;
    entryDragMoved = false;
    entryDragData.startX = touch.clientX;
    entryDragData.startY = touch.clientY;
    const rect = entryEl.getBoundingClientRect();
    entryDragData.initialLeft = rect.left;
    entryDragData.initialTop = rect.top;
    e.preventDefault();
  }

  function entryHandleMove(e: MouseEvent | TouchEvent) {
    const touch = (e as TouchEvent).touches?.[0] || e;
    const dx = touch.clientX - entryDragData.startX;
    const dy = touch.clientY - entryDragData.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) entryDragMoved = true;

    if (entryRafId) cancelAnimationFrame(entryRafId);
    entryRafId = requestAnimationFrame(() => {
      const vw = window.parent.innerWidth;
      const vh = window.parent.innerHeight;
      const newLeft = Math.max(-BTN_SIZE / 2, Math.min(vw - BTN_SIZE / 2, entryDragData.initialLeft + dx));
      const newTop = Math.max(0, Math.min(vh - BTN_SIZE, entryDragData.initialTop + dy));
      entryEl.style.left = newLeft + 'px';
      entryEl.style.top = newTop + 'px';
      entryRafId = null;
    });
    e.preventDefault();
  }

  function entryHandleEnd(e: MouseEvent | TouchEvent) {
    if (!entryDragMoved) {
      togglePhoneVisibility();
    }
    saveEntryPosition();
    entryDragMoved = false;
    e.preventDefault();
  }

  // 鼠标事件
  entryEl.addEventListener('mousedown', entryHandleStart);
  parentDocument.addEventListener('mousemove', entryHandleMove);
  parentDocument.addEventListener('mouseup', entryHandleEnd);

  // 触摸事件
  entryEl.addEventListener('touchstart', entryHandleStart, { passive: false });
  parentDocument.addEventListener('touchmove', entryHandleMove, { passive: false });
  parentDocument.addEventListener('touchend', entryHandleEnd, { passive: false });

  // 窗口大小变化时调整
  window.parent.addEventListener('resize', () => {
    adjustEntryToViewport();
  });

  // ==================== 卸载清理 ====================

  let destroyed = false;
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    controller.destroy();
    if (phoneApp) {
      try {
        phoneApp.unmount();
      } catch (error) {
        console.warn(error);
      }
      phoneApp = null;
    }
    phoneIframe?.remove();
    phoneIframe = null;
    // 清理入口按钮和事件监听
    if (entryEl.parentNode) entryEl.remove();
    parentDocument.removeEventListener('mousemove', entryHandleMove);
    parentDocument.removeEventListener('mouseup', entryHandleEnd);
    parentDocument.removeEventListener('touchmove', entryHandleMove);
    parentDocument.removeEventListener('touchend', entryHandleEnd);
    console.log('[PhoneSystem] 🗑️  已卸载');
  }

  // ==================== 注册内置设置APP ====================

  registerApp({
    id: 'settings',
    name: '设置',
    icon: '⚙️',
    color: '#8e8e93',
    order: 99,
  });

  registerRenderer('settings', ({ container, vue }) => {
    const app = vue.createApp(SettingsPanel);
    app.mount(container);
    console.log('[PhoneSystem] ⚙️ 设置已挂载');
    return () => {
      app.unmount();
    };
  });

  // 监听 pagehide 事件（脚本被关闭时触发），执行反注册
  $(window).on('pagehide', () => {
    destroyed = true;
    $(window.parent).off('resize');
    destroy();
  });

  // ==================== 导出到全局 ====================

  const PhoneSystem = {
    registerApp,
    registerRenderer,
    unregisterRenderer,
    openApp,
    goHome,
    registeredApps,
    getSettings,
    setSettings,
    getAPIConfig,
    getStorageKey,
    getCurrentCharName,
    normalizeApiUrl,
    callExternalAPI,
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    emit: bus.emit.bind(bus),
  };

  (window.parent as any).PhoneSystem = PhoneSystem;

  if (typeof (window as any).initializeGlobal === 'function') {
    (window as any).initializeGlobal('PhoneSystem', PhoneSystem);
  }

  console.log('✅ [小手机主程序] PhoneSystem 已加载 → window.parent.PhoneSystem');
  console.log('[小手机主程序] 📱 右下角浮动按钮可打开手机');
});
