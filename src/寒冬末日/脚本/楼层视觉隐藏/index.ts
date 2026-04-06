import { z } from 'zod';

const SCRIPT_VERSION = '1.0.0';
const HIDDEN_CLASS = 'mes_hidden_visual';
const HIDDEN_STYLE_ID = 'mes-hidden-visual-style';
const BTN_TOGGLE = '楼层视觉隐藏-开关';

const SettingsSchema = z
  .object({
    enabled: z.boolean().prefault(true),
  })
  .prefault({
    enabled: true,
  });

type VisualHideSettings = z.output<typeof SettingsSchema>;

function scriptVarOption() {
  try {
    if (typeof getScriptId === 'function') {
      return { type: 'script' as const, script_id: getScriptId() };
    }
  } catch {
    // ignore
  }
  return { type: 'script' as const };
}

function readSettings(): VisualHideSettings {
  try {
    const raw = getVariables(scriptVarOption()) ?? {};
    return SettingsSchema.parse(raw);
  } catch {
    return SettingsSchema.parse({});
  }
}

function writeSettings(next: VisualHideSettings) {
  try {
    replaceVariables(next, scriptVarOption());
  } catch {
    // ignore
  }
}

/**
 * 获取主窗口文档
 */
function getHostDocument(): Document {
  try {
    return window.parent.document;
  } catch {
    return document;
  }
}

/**
 * 注入隐藏样式到酒馆页面
 */
function injectHiddenStyle() {
  const hostDoc = getHostDocument();
  if (hostDoc.getElementById(HIDDEN_STYLE_ID)) return;

  const style = hostDoc.createElement('style');
  style.id = HIDDEN_STYLE_ID;
  style.textContent = `
    .mes.${HIDDEN_CLASS} {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      overflow: hidden !important;
      pointer-events: none !important;
    }
  `;
  hostDoc.head.appendChild(style);
}

/**
 * 同步单个楼层的视觉隐藏状态
 */
function syncMessageVisualHide(messageId: number) {
  try {
    // 获取消息的 is_hidden 状态
    const messages = getChatMessages(messageId, { hide_state: 'all' });
    if (messages.length === 0) return;

    const message = messages[0];
    const isHidden = message.is_hidden === true;

    // 获取主窗口中的楼层容器 DOM 元素
    const hostDoc = getHostDocument();
    const $mes = $(hostDoc).find(`.mes[mesid="${messageId}"]`);
    if ($mes.length === 0) return;

    // 应用或移除隐藏样式
    if (isHidden) {
      $mes.addClass(HIDDEN_CLASS);
    } else {
      $mes.removeClass(HIDDEN_CLASS);
    }
  } catch (error) {
    console.warn('[楼层视觉隐藏] syncMessageVisualHide error:', error);
  }
}

/**
 * 同步所有楼层的视觉隐藏状态
 */
function syncAllVisualHide() {
  try {
    const lastMessageId = getLastMessageId();
    if (lastMessageId < 0) return;

    // 获取所有消息
    const messages = getChatMessages(`0-${lastMessageId}`, { hide_state: 'all' });

    // 同步每个楼层
    messages.forEach(message => {
      syncMessageVisualHide(message.message_id);
    });
  } catch (error) {
    console.warn('[楼层视觉隐藏] syncAllVisualHide error:', error);
  }
}

/**
 * 切换视觉隐藏状态
 */
function toggleVisualHide() {
  const settings = readSettings();
  const nextEnabled = !settings.enabled;
  writeSettings({ ...settings, enabled: nextEnabled });

  const hostDoc = getHostDocument();

  if (nextEnabled) {
    // 启用：注入样式并同步
    injectHiddenStyle();
    syncAllVisualHide();
    console.info('[楼层视觉隐藏] 已启用');
  } else {
    // 禁用：移除样式类
    $(hostDoc).find(`.${HIDDEN_CLASS}`).removeClass(HIDDEN_CLASS);
    console.info('[楼层视觉隐藏] 已禁用');
  }
}

/**
 * 注册按钮
 */
function registerButtons() {
  if (typeof appendInexistentScriptButtons === 'function') {
    appendInexistentScriptButtons([{ name: BTN_TOGGLE, visible: true }]);
  }

  if (typeof getButtonEvent !== 'function') return;

  eventOn(getButtonEvent(BTN_TOGGLE), () => {
    toggleVisualHide();
  });
}

/**
 * 设置事件监听
 */
function setupEventListeners() {
  // 监听消息更新事件
  eventOn(tavern_events.MESSAGE_UPDATED, (messageId: number) => {
    const settings = readSettings();
    if (!settings.enabled) return;
    setTimeout(() => syncMessageVisualHide(messageId), 50);
  });

  // 监听聊天切换事件
  eventOn(tavern_events.CHAT_CHANGED, () => {
    const settings = readSettings();
    if (!settings.enabled) return;
    setTimeout(() => syncAllVisualHide(), 100);
  });

  // 监听用户消息渲染完成
  eventOn(tavern_events.USER_MESSAGE_RENDERED, (messageId: number) => {
    const settings = readSettings();
    if (!settings.enabled) return;
    setTimeout(() => syncMessageVisualHide(messageId), 50);
  });

  // 监听角色消息渲染完成
  eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, (messageId: number) => {
    const settings = readSettings();
    if (!settings.enabled) return;
    setTimeout(() => syncMessageVisualHide(messageId), 50);
  });

  // 监听生成结束
  eventOn(tavern_events.GENERATION_ENDED, () => {
    const settings = readSettings();
    if (!settings.enabled) return;
    setTimeout(() => syncAllVisualHide(), 100);
  });

  // 监听消息删除
  eventOn(tavern_events.MESSAGE_DELETED, () => {
    const settings = readSettings();
    if (!settings.enabled) return;
    setTimeout(() => syncAllVisualHide(), 100);
  });

  // 监听消息编辑
  eventOn(tavern_events.MESSAGE_EDITED, (messageId: number) => {
    const settings = readSettings();
    if (!settings.enabled) return;
    setTimeout(() => syncMessageVisualHide(messageId), 50);
  });
}

$(() => {
  const settings = readSettings();
  console.info(`[楼层视觉隐藏] v${SCRIPT_VERSION} 已加载; enabled=${settings.enabled}`);

  // 注册按钮
  registerButtons();

  // 注入隐藏样式到主窗口
  injectHiddenStyle();

  // 初始同步
  if (settings.enabled) {
    syncAllVisualHide();
  }

  // 设置事件监听
  setupEventListeners();

  console.info('[楼层视觉隐藏] 事件监听已启动');
});
