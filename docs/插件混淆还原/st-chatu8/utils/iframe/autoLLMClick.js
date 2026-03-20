// ============================================================
// autoLLMClick.js — 自动LLM点击触发模块
//
// 职责：
//   监听 SillyTavern 的 GENERATION_STARTED / GENERATION_ENDED
//   两个事件，在 LLM 生成结束后自动找到对应消息的 DOM 元素并
//   调用 handlePromptRequest，触发图片生成流程。
//
// 导出：
//   setAutoLLMClick(bool)   — 手动设置 window.autoLLMClick 标志
//   getAutoLLMClick()       — 读取 window.autoLLMClick 标志
//   initAutoLLMClick()      — 初始化模块（打印启动日志）
// ============================================================

import { eventSource, event_types } from '../../../../../../script.js';
import { extension_settings }        from '../../../../../extensions.js';
import { extensionName }             from '../config.js';
import { getContext }                from '../../../../../st-context.js';
import { handlePromptRequest }       from '../promptReq.js';
import {
    debugLog,
    debugBranch,
    debugTimer,
    debugStartSession,
    debugContent,
    debugElement,
    debugMilestone,
} from '../debugLogger.js';


// ─────────────────────────────────────────────
// 模块级状态
// ─────────────────────────────────────────────

/** 5 秒自动关闭计时器句柄 */
let autoLLMClickTimer = null;

/**
 * window.autoLLMClick
 * 全局标志位，表示当前是否处于"自动LLM点击激活"状态。
 * 激活后 5 秒内若未再次触发则自动复位为 false。
 */
window.autoLLMClick = false;

/** 记录 GENERATION_STARTED 时刻的 chat 数组长度 */
let generationStartChatLength   = 0;

/** 记录 GENERATION_STARTED 时刻最后一条消息的 swipes 数组长度 */
let generationStartSwipesLength = 0;


// ─────────────────────────────────────────────
// 内部辅助：检查脚本总开关是否启用
// ─────────────────────────────────────────────

function isPluginEnabled() {
    const scriptEnabled = extension_settings[extensionName]?.['scriptEnabled'];
    const result = scriptEnabled === true || scriptEnabled === 'true';

    debugLog(
        'autoLLMClick.isPluginEnabled()',
        '检查插件是否启用',
        { scriptEnabled, 结果: result }
    );
    return result;
}


// ─────────────────────────────────────────────
// 内部辅助：检查自动LLM生图开关是否启用
// ─────────────────────────────────────────────

function isAutoLLMEnabled() {
    if (!isPluginEnabled()) {
        debugBranch(
            'autoLLMClick.isAutoLLMEnabled()',
            '插件未启用',
            true,
            { 条件: 'isPluginEnabled() === false' }
        );
        return false;
    }

    const autoLLMImageGen = extension_settings[extensionName]?.['autoLLMImageGen'];
    const result = autoLLMImageGen === true || autoLLMImageGen === 'true';

    const data = { autoLLMImageGen, 结果: result };
    debugLog(
        'autoLLMClick.isAutoLLMEnabled()',
        '检查自动LLM生图是否启用',
        data
    );
    return result;
}


// ─────────────────────────────────────────────
// 内部辅助：按 messageId 查找目标 DOM 元素
//
// 等待 300ms 后在 document 中查找
//   div.mes[mesid="<messageId>"] .mes_text
// 返回找到的元素，或 null。
// ─────────────────────────────────────────────

async function findElement(messageId) {
    const timer = debugTimer(
        'autoLLMClick.findElement',
        '查找目标元素'
    );

    // 等待 DOM 更新
    await new Promise(resolve => setTimeout(resolve, 300));

    const selector = `div.mes[mesid="${messageId}"] .mes_text`;
    const element  = document.querySelector(selector);

    if (element) {
        console.log(
            '[st-chatu8] Got element for messageId:',
            messageId
        );
        debugBranch(
            'autoLLMClick.findElement',
            '找到真实元素',
            true,
            { messageId }
        );
        debugElement('autoLLMClick.findElement', '目标元素', element);
        timer.end('找到真实DOM元素');
        return element;
    }

    console.log('[st-chatu8] Element not found for messageId:', messageId);
    debugBranch(
        'autoLLMClick.findElement',
        '未找到元素',
        false,
        { messageId }
    );
    timer.end('元素查找失败');
    return null;
}


// ─────────────────────────────────────────────
// 内部辅助：激活自动LLM点击状态
//
// 将 window.autoLLMClick 设为 true，并启动 5 秒倒计时，
// 超时后自动复位为 false。若已有计时器则先清除旧的。
// ─────────────────────────────────────────────

function activateAutoLLMClick() {
    debugLog(
        'autoLLMClick.activateAutoLLMClick',
        '尝试激活自动LLM点击状态'
    );

    if (!isAutoLLMEnabled()) {
        debugBranch(
            'autoLLMClick.activateAutoLLMClick',
            '跳过 - 功能未启用',
            true
        );
        return;
    }

    window.autoLLMClick = true;
    debugLog(
        'autoLLMClick.activateAutoLLMClick',
        '自动LLM点击状态已激活，5秒后自动关闭'
    );

    // 清除旧计时器
    if (autoLLMClickTimer) {
        clearTimeout(autoLLMClickTimer);
        debugLog('autoLLMClick.activateAutoLLMClick', '清除之前的定时器');
    }

    // 5 秒后自动关闭
    autoLLMClickTimer = setTimeout(() => {
        window.autoLLMClick = false;
        autoLLMClickTimer   = null;
        debugLog(
            'autoLLMClick.activateAutoLLMClick',
            '5秒超时 - 自动关闭 autoLLMClick'
        );
    }, 5000);

    debugMilestone(
        'autoLLMClick.activateAutoLLMClick',
        '激活，5秒后自动关闭'
    );
}


// ─────────────────────────────────────────────
// 事件监听 1: GENERATION_STARTED
//
// 记录生成开始时刻的 chat 数组长度和最后一条消息的
// swipes 长度，用于后续判断是否有新内容产生。
// ─────────────────────────────────────────────

eventSource.on(event_types['GENERATION_STARTED'], eventData => {
    console.log('[st-chatu8] GENERATION_STARTED event data:', eventData);
    debugStartSession('js_generation_started');

    debugLog(
        'autoLLMClick.GENERATION_STARTED',
        'LLM生成开始事件触发',
        { eventData }
    );

    const context = getContext();
    const chat    = context?.['chat'];

    if (chat && chat.length > 0) {
        generationStartChatLength   = chat.length;
        const lastMessage           = chat[generationStartChatLength - 1];
        generationStartSwipesLength = lastMessage?.['swipes']?.['length'] || 0;

        console.log('[st-chatu8] Start chat length:', generationStartChatLength);
        console.log('[st-chatu8] Start swipes length:', generationStartSwipesLength);

        debugLog(
            'autoLLMClick.GENERATION_STARTED',
            '记录生成开始时的状态',
            {
                chatLength:   generationStartChatLength,
                swipesLength: generationStartSwipesLength,
            }
        );
    } else {
        // chat 为空或不存在
        generationStartChatLength   = 0;
        generationStartSwipesLength = 0;
        console.log('[st-chatu8] GENERATION_STARTED - chat not available');

        debugBranch(
            'autoLLMClick.GENERATION_STARTED',
            'Chat为空',
            true,
            { chatExists: !!chat, chatLength: chat?.['length'] }
        );
    }
});


// ─────────────────────────────────────────────
// 事件监听 2: GENERATION_ENDED
//
// 生成结束后执行核心逻辑：
//   1. 检查 chat/swipes 是否有增量（新消息或新 swipe）
//   2. 无增量 → 跳过
//   3. 检查 autoLLMImageGen 开关
//   4. 计算 messageId（chat 末尾下标）
//   5. 检查消息内容长度（> 200 才触发）
//   6. 处理 insertOriginalText 标志（自动启用 inser）
//   7. findElement 找 DOM
//   8. 调用 handlePromptRequest(element, 'gesture1')
// ─────────────────────────────────────────────

eventSource.on(event_types['GENERATION_ENDED'], async eventData => {
    const timer = debugTimer('autoLLMClick.GENERATION_ENDED', '处理LLM生成结束事件');

    console.log('[st-chatu8] GENERATION_ENDED data:', eventData);
    console.log(
        '[st-chatu8] Current startChatLength:',    generationStartChatLength,
        'startSwipesLength:', generationStartSwipesLength
    );

    debugLog(
        'autoLLMClick.GENERATION_ENDED',
        'LLM生成结束事件触发',
        {
            eventData,
            startChatLength:   generationStartChatLength,
            startSwipesLength: generationStartSwipesLength,
        }
    );

    // ── 获取当前 context ──
    const context       = getContext();
    const chat          = context?.['chat'];
    const currentChatLength  = chat?.['length'] ?? -1;
    const lastMessage   = (chat && currentChatLength > 0)
                            ? chat[currentChatLength - 1]
                            : null;
    const currentSwipesLength = lastMessage?.['swipes']?.['length'] ?? 0;

    console.log('[st-chatu8] Current chat length:', currentChatLength, 'swipes length:', currentSwipesLength);
    debugLog(
        'autoLLMClick.GENERATION_ENDED',
        '获取当前状态',
        { currentChatLength, currentSwipesLength }
    );

    // ── 判断是否有新增量 ──
    const isChatIncreased   = currentChatLength   > generationStartChatLength;
    const isSwipesIncreased = !isChatIncreased && currentSwipesLength > generationStartSwipesLength;

    console.log(
        '[st-chatu8] Chat increased:', isChatIncreased,
        'Swipes increased:', isSwipesIncreased
    );
    debugBranch(
        'autoLLMClick.GENERATION_ENDED',
        'Chat和Swipes变化检测',
        isChatIncreased || isSwipesIncreased,
        {
            isChatIncreased,
            isSwipesIncreased,
            chatDelta:   currentChatLength   - generationStartChatLength,
            swipesDelta: currentSwipesLength - generationStartSwipesLength,
        }
    );

    if (!isChatIncreased && !isSwipesIncreased) {
        console.log('[st-chatu8] No chat or swipes array increase detected, skipping');
        debugLog(
            'autoLLMClick.GENERATION_ENDED',
            '无变化 - 跳过处理',
            { 原因: 'Chat或Swipes均未增加' }
        );
        timer.end('无变化 - 跳过处理');
        return;
    }

    // ── 检查功能开关 ──
    if (!isAutoLLMEnabled()) {
        console.log('[st-chatu8] autoLLM not enabled - skipping');
        debugBranch(
            'autoLLMClick.GENERATION_ENDED',
            '自动LLM生图未启用',
            true,
            { 条件: 'isAutoLLMEnabled() === false' }
        );
        timer.end('跳过 - 功能未启用');
        return;
    }

    // ── 计算 messageId（chat 末尾索引） ──
    const messageId = currentChatLength - 1;
    debugLog(
        'autoLLMClick.GENERATION_ENDED',
        '计算消息ID',
        { eventData, messageId }
    );

    if (messageId < 0) {
        console.log('[st-chatu8] messageId < 0, skipping');
        debugBranch(
            'autoLLMClick.GENERATION_ENDED',
            '消息查找',
            false,
            { messageId, 原因: 'messageId有误' }
        );
        return;
    }

    // ── 验证消息存在且内容足够长 ──
    const message = chat?.[messageId];
    if (!message) {
        console.log('[st-chatu8] No message found for messageId:', messageId);
        debugBranch(
            'autoLLMClick.GENERATION_ENDED',
            '消息查找',
            false,
            {
                messageId,
                chatExists: !!chat,
                原因:       '消息不存在',
            }
        );
        return;
    }

    const messageContent = message['mes'];
    console.log('[st-chatu8] Last message content:', messageContent);
    debugContent('autoLLMClick.GENERATION_ENDED', '消息内容', messageContent, 200);

    if (!messageContent || messageContent.length <= 200) {
        console.log(
            '[st-chatu8] Message content too short (<= 200), skipping. Length:',
            messageContent?.length ?? 0
        );
        debugBranch(
            'autoLLMClick.GENERATION_ENDED',
            '消息长度检查',
            false,
            {
                条件:   '消息内容长度 > 200',
                实际长度: messageContent?.length ?? 0,
                要求:   '> 200',
            }
        );
        timer.end('跳过 - 消息过短');
        return;
    }

    debugBranch(
        'autoLLMClick.GENERATION_ENDED',
        '消息长度检查通过',
        true,
        { 消息长度: messageContent.length }
    );

    // ── 处理 insertOriginalText 标志 ──
    // 若 insertOriginalText 当前为 'true'，自动将其改为 false（checked），
    // 同时勾选对应 checkbox，并保存设置。
    if (extension_settings[extensionName]?.['insertOriginalText'] === 'true') {
        extension_settings[extensionName]['insertOriginalText'] = false;
        console.log('[st-chatu8] Auto-enabled insertOriginalText');
        debugLog(
            'autoLLMClick.GENERATION_ENDED',
            '自动启用 insertOriginalText',
            { 原因: '自动启用 inser' }
        );

        // 同步 DOM checkbox
        const checkbox = document.querySelector('#scriptEnabled-insertOriginalText');
        if (checkbox) checkbox.checked = true;

        // 持久化保存（动态 import 避免循环依赖）
        try {
            const { saveSettingsDebounced } = await import('../../../../../../../script.js');
            saveSettingsDebounced();
        } catch (err) {
            console.error('[st-chatu8] Failed to save settings:', err);
        }
    }

    // ── 查找 DOM 元素 ──
    const element = await findElement(messageId);
    if (!element) {
        console.log('[st-chatu8] Element not found for messageId:', messageId, 'DOM元素未找到');
        debugBranch(
            'autoLLMClick.GENERATION_ENDED',
            '元素查找失败',
            false,
            { messageId, 原因: 'DOM元素未找到' }
        );
        return;
    }

    console.log(
        '[st-chatu8] Got element for messageId:',
        messageId,
        'isConnected:', element.isConnected
    );
    debugElement(
        'autoLLMClick.GENERATION_ENDED 真实mes_text',
        '目标元素',
        element
    );

    // ── 调用 handlePromptRequest ──
    try {
        console.log('[st-chatu8] Triggering handlePromptRequest');
        debugMilestone(
            'autoLLMClick.GENERATION_ENDED',
            '调用 handlePromptRequest'
        );
        debugLog(
            'autoLLMClick.GENERATION_ENDED',
            '调用 handlePromptRequest',
            {
                gestureId:        'gesture1',
                messageId,
                elementConnected: element.isConnected,
            }
        );

        handlePromptRequest(element, 'gesture1');
    } catch (err) {
        console.error('[st-chatu8] handlePromptRequest 调用失败:', err);
        debugLog(
            'autoLLMClick.GENERATION_ENDED',
            '调用失败',
            { message: err.message }
        );
    }

    activateAutoLLMClick();
    timer.end('处理完成');
});


// ─────────────────────────────────────────────
// 事件监听 3: js_generation_ended（插件内部事件）
//
// 触发与 GENERATION_ENDED 相同的 activateAutoLLMClick 逻辑，
// 用于内部生图完成后的额外激活。
// ─────────────────────────────────────────────

eventSource.on('js_generation_ended', async eventData => {
    const data = { eventData };
    debugLog(
        'autoLLMClick.js_generation_ended',
        'JS生成结束事件触发',
        data
    );
    activateAutoLLMClick();
});


// ─────────────────────────────────────────────
// 导出 1: setAutoLLMClick
//
// 手动设置 window.autoLLMClick 标志位。
// @param {boolean} value
// ─────────────────────────────────────────────

export function setAutoLLMClick(value) {
    window.autoLLMClick = value;
}


// ─────────────────────────────────────────────
// 导出 2: getAutoLLMClick
//
// 读取当前 window.autoLLMClick 标志位。
// @returns {boolean}
// ─────────────────────────────────────────────

export function getAutoLLMClick() {
    return window.autoLLMClick;
}


// ─────────────────────────────────────────────
// 导出 3: initAutoLLMClick
//
// 模块初始化入口，仅打印启动日志。
// 实际监听已在模块加载时注册完毕。
// ─────────────────────────────────────────────

export function initAutoLLMClick() {
    console.log('[st-chatu8] .autoLLMClick 模块已初始化');
    debugLog(
        'autoLLMClick.initAutoLLMClick',
        'autoLLMClick 模块已初始化'
    );
}
