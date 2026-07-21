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
      const save = () => {
        setSettings({ apiConfig: { ...settings.apiConfig } });
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
            h('div', { style: 'font-size:11px;color:#aaa;margin-bottom:2px;' }, '模型'),
            h('input', {
              value: settings.apiConfig.model,
              onInput: (e: any) => {
                settings.apiConfig.model = e.target.value;
              },
              placeholder: 'gpt-4o-mini',
              style:
                'width:100%;padding:6px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:#1a1a2e;color:#fff;font-size:11px;',
            }),
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
    phoneIframe
      .css({
        position: 'fixed',
        bottom: '90px',
        right: '20px',
        width: '330px',
        height: '580px',
        'border-radius': '20px',
        border: '2px solid rgba(255,255,255,0.15)',
        'z-index': '9999',
        'box-shadow': '0 8px 32px rgba(0,0,0,0.5)',
        background: '#1a1a2e',
      })
      .appendTo('body');

    phoneIframe.on('load', () => {
      const doc = (phoneIframe![0] as HTMLIFrameElement).contentDocument!;
      const mountTarget = doc.createElement('div');
      mountTarget.id = 'phone-mount';
      doc.body!.appendChild(mountTarget);

      phoneApp = createApp(PhoneDesktop);
      phoneApp.mount(mountTarget);
      void nextTick(() => controller.refreshCurrent());
      bus.emit('phone-opened');
      console.log('[PhoneSystem] 📱 手机已打开');
    });
  }

  // 入口按钮
  const $entry = $('<div>')
    .attr('id', 'phone-entry-btn')
    .css({
      position: 'fixed',
      bottom: '80px',
      right: '20px',
      width: '52px',
      height: '52px',
      'border-radius': '26px',
      background: '#1a1a2e',
      color: '#fff',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'font-size': '26px',
      cursor: 'pointer',
      'z-index': '9998',
      'box-shadow': '0 4px 16px rgba(0,0,0,0.4)',
      border: '2px solid rgba(255,255,255,0.15)',
      transition: 'transform 0.2s',
    })
    .text('📱')
    .appendTo('body');

  // 拖拽（mousedown 判断，轻微移动算 drag）
  let dragMoved = false;
  $entry.on('mousedown', function (e) {
    dragMoved = false;
    const startX = e.clientX,
      startY = e.clientY;
    const origLeft = parseInt($entry.css('left') || '0');
    const origTop = parseInt($entry.css('top') || '0');

    function onMove(ev: JQuery.MouseMoveEvent) {
      const dx = ev.clientX - startX,
        dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      $entry.css({ left: origLeft + dx + 'px', top: origTop + dy + 'px', bottom: 'auto', right: 'auto' });
    }
    function onUp() {
      $(document).off('mousemove', onMove).off('mouseup', onUp);
    }
    $(document).on('mousemove', onMove).on('mouseup', onUp);
  });

  $entry.on('click', () => {
    if (!dragMoved) togglePhoneVisibility();
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
    $entry.remove();
    $(document).off('.phoneDrag');
    console.log('[PhoneSystem] 🗑️  已卸载');
  }

  // 监听 pagehide 事件（脚本被关闭时触发），执行反注册
  $(window).on('pagehide', destroy);

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
