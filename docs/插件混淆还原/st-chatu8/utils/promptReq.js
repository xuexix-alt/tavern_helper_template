// ============================================================
// promptReq.js — LLM 生图请求核心调度模块
//
// 职责：
//   承接 autoLLMClick 传来的 DOM 元素，完成从"找到消息"到
//   "LLM 返回 Prompt → 解析图片标签 → 插入 DOM"的完整流程。
//
// 导出：
//   handlePromptRequest(element, gestureId) — 主入口
//
// 同时再导出来自其他模块的公共 API（让外部可以统一从此文件引入）
// ============================================================

import { getContext }          from '../../../../st-context.js';
import { extensionName }       from '../utils/config.js';
import { extension_settings }  from '../../../../extensions.js';
import { updateCombinedPrompt } from './settings/llm.js';
import {
    generateCharacterListText,
    generateCommonCharacterListText,
    generateOutfitEnableListText,
    getEnabledCharacterImages,
    getEnabledOutfitImages,
    getCommonCharacterImages,
} from './settings/worldbook.js';
import { isMobileDevice, removeThinkingTags } from './utils.js';
import { LLM_IMAGE_GEN_GET_PROMPT, LLM_IMAGE_GEN } from './llmRequest.js';
import { processWorldBooksWithTrigger }           from './worldbookProcessor.js';
import { getElContext }                           from './chatDataUtils.js';
import { parseImagesFromPrompt, insertImagesIntoElement } from './imageInserter.js';
import { getProcessedPrompt, replaceAllPlaceholders, mergeAdjacentMessages } from './promptProcessor.js';
import { buildPromptForRequestType }              from './settings/llmService.js';
import {
    debugLog, debugBranch, debugTimer, debugMilestone, debugError,
} from './debugLogger.js';

// ── 透传导出（让外部可以统一从 promptReq 引入） ──
export {
    generateRequestId,
    LLM_GET_PROMPT, LLM_IMAGE_GEN_GET_PROMPT, LLM_CHAR_DESIGN_GET_PROMPT,
    LLM_CHAR_DISPLAY_GET_PROMPT, LLM_CHAR_MODIFY_GET_PROMPT, LLM_TAG_MODIFY_GET_PROMPT,
    LLM_EXECUTE, LLM_IMAGE_GEN, LLM_CHAR_DESIGN, LLM_CHAR_DISPLAY,
    LLM_CHAR_MODIFY, LLM_TAG_MODIFY,
} from './llmRequest.js';
export { processWorldBooksWithTrigger }           from './worldbookProcessor.js';
export {
    setcharData, getcharData, getElContext, getrWorlds, getcharWorld,
    getglobalSelectWorld, getWorldEntries,
} from './chatDataUtils.js';
export {
    parseImagesFromPrompt, insertImagesIntoElement, fuzzyMatchLine,
    calculateLineSimilarity, calculateNgramSimilarity, generateElKey,
    saveImageGroup, generateStableId, findTagInImageGroups,
} from './imageInserter.js';


// ─────────────────────────────────────────────
// 内部辅助：用户需求输入弹窗
//
// 弹出一个模态弹窗，让用户输入补充的生图需求文字，
// 并可上传多张参考图片（base64 编码存入内存）。
//
// @returns {Promise<{text: string, images: Array} | null>}
//          用户点击"确定"返回 {text, images}；点击"取消"返回 null
// ─────────────────────────────────────────────

function showUserDemandPopup() {
    return new Promise(resolve => {
        const isMobile    = isMobileDevice();
        const uploadedImgs = [];  // [{ base64, description }, ...]

        // 计算弹窗高度（移动端贴底部）
        let topOffset  = 0;
        let maxHeightPx = 'auto';
        if (isMobile) {
            const settingsEl = document.querySelector('#top-settings');
            if (settingsEl) {
                const rect = settingsEl.getBoundingClientRect();
                topOffset = Math.max(
                    0,
                    Math.min(rect.bottom - 10, window.innerHeight * 0.5)
                );
            }
            const available = Math.max(0, window.innerHeight - topOffset - 40);
            maxHeightPx = available + 'px';
        }

        // ── 创建遮罩 ──
        const overlay = document.createElement('div');
        overlay.id        = 'user-demand-popup-overlay';
        overlay.className = 'st-chatu8-popup-overlay';

        // ── 创建弹窗主体 ──
        const popup = document.createElement('div');
        popup.className = 'st-chatu8-popup-bubble';
        if (isMobile) {
            popup.classList.add('mobile');
            popup.style.top       = topOffset + 'px';
            popup.style.maxHeight = maxHeightPx;
        }

        // 标题
        const title = document.createElement('div');
        title.textContent = '🖼️ 输入生图需求';
        title.className   = 'st-chatu8-popup-title';

        // 提示说明
        const hint = document.createElement('p');
        hint.textContent = '请描述您希望生成的图片的具体需求（可选）';
        hint.className   = 'st-chatu8-popup-y-hint';

        // 文本输入框
        const textarea = document.createElement('textarea');
        textarea.placeholder = '例如：重点描绘场景氛围，光线柔和...';
        textarea.className   = 'st-chatu8-popup-text';

        // 参考图片区域容器
        const refSection = document.createElement('div');
        refSection.className = 'st-chatu8-popup-upload-section';

        // ── 参考图片标签 ──
        const refLabel = document.createElement('div');
        refLabel.className = 'st-chatu8-popup-upload-label';

        const refLabelSpan = document.createElement('span');
        refLabelSpan.textContent = '📎 参考图片（可选）';
        refLabelSpan.className   = 'st-chatu8-popup-hint';

        // 隐藏 file input
        const fileInput = document.createElement('input');
        fileInput.type     = 'file';
        fileInput.accept   = 'image/*';
        fileInput.multiple = true;
        fileInput.style.display = 'none';

        // 添加图片按钮（触发 fileInput）
        const addImgBtn = document.createElement('button');
        addImgBtn.className  = 'st-chatu8-popup-btn-add';
        addImgBtn.innerHTML  = '<i class="fa-solid fa-plus"></i> 添加图片';
        addImgBtn.className  = 'st-chatu8-popup-btn-add';
        addImgBtn.onclick    = () => fileInput.click();
        addImgBtn.addEventListener('click', () => fileInput.click());

        refLabel.appendChild(refLabelSpan);
        refLabel.appendChild(addImgBtn);

        // 已上传图片列表区域
        const imgListArea = document.createElement('div');
        imgListArea.className = 'st-chatu8-popup-preview-container';

        // 重新渲染上传图片列表
        function renderUploadedImages() {
            imgListArea.innerHTML = '';
            if (uploadedImgs.length === 0) {
                const emptyHint = document.createElement('div');
                emptyHint.textContent = '点击上方按钮添加参考图片';
                emptyHint.className   = 'st-chatu8-popup-empty';
                imgListArea.appendChild(emptyHint);
                return;
            }
            uploadedImgs.forEach((imgObj, idx) => {
                const item = document.createElement('div');
                item.className = 'st-chatu8-popup-img-item';

                // 缩略图
                const imgEl  = document.createElement('div');
                imgEl.className = 'st-chatu8-popup-img-preview';
                const img    = document.createElement('img');
                img.src = imgObj.base64;

                // 删除按钮
                const delBtn = document.createElement('div');
                delBtn.className   = 'st-chatu8-popup-btn-delete';
                delBtn.innerHTML   = '×';
                delBtn.style.cssText = 'cursor:pointer;position:absolute;top:2px;right:2px;';
                delBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    uploadedImgs.splice(idx, 1);
                    renderUploadedImages();
                });
                imgEl.appendChild(img);
                imgEl.appendChild(delBtn);

                // 描述输入框
                const descInput = document.createElement('textarea');
                descInput.className   = 'st-chatu8-popup-img-desc';
                descInput.placeholder = '图 ' + (idx + 1);
                descInput.value       = imgObj.description || '';
                descInput.addEventListener('change', e => {
                    uploadedImgs[idx].description = e.target.value;
                });

                item.appendChild(imgEl);
                item.appendChild(descInput);
                imgListArea.appendChild(item);
            });
        }

        // 文件选择处理
        fileInput.addEventListener('change', async e => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;
                try {
                    const base64 = await readFileAsDataURL(file);
                    uploadedImgs.push({ base64, description: '' });
                } catch (err) {
                    console.error('[promptReq] 读取图片失败:', err);
                }
            }
            renderUploadedImages();
            fileInput.value = '';
        });

        refSection.appendChild(refLabel);
        refSection.appendChild(fileInput);
        refSection.appendChild(imgListArea);

        // ── 按钮行 ──
        const btnRow   = document.createElement('div');
        btnRow.className = 'st-chatu8-popup-bubb';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.className   = 'st-chatu8-popup-btn-cancel';

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确定生成';
        confirmBtn.className   = 'st-chatu8-popup-btn-confirm';

        // 关闭并 resolve
        const closeAndResolve = result => {
            overlay.classList.add('closing');
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 200);
        };

        cancelBtn.addEventListener('click', () => closeAndResolve(null));
        confirmBtn.addEventListener('click', () =>
            closeAndResolve({ text: textarea.value.trim() || '', images: [...uploadedImgs] })
        );

        // ESC / Ctrl+Enter 快捷键
        const onKeydown = e => {
            if (e.key === 'Escape') {
                closeAndResolve(null);
                document.removeEventListener('keydown', onKeydown);
            } else if (e.key === 'Enter' && e.ctrlKey) {
                closeAndResolve({ text: textarea.value.trim() || '', images: [...uploadedImgs] });
                document.removeEventListener('keydown', onKeydown);
            }
        };
        document.addEventListener('keydown', onKeydown);

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);

        popup.appendChild(title);
        popup.appendChild(hint);
        popup.appendChild(textarea);
        popup.appendChild(refSection);
        popup.appendChild(btnRow);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        setTimeout(() => textarea.focus(), 100);

        renderUploadedImages();
    });
}

/** FileReader 包装：读取文件为 base64 data URL */
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader   = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}


// ─────────────────────────────────────────────
// 内部辅助：找到最后一条 role==="user" 消息的 index
//
// @param {Array} messages — OpenAI 格式消息数组
// @returns {number} index 或 -1
// ─────────────────────────────────────────────

function findLastUserMessageIndex(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') return i;
    }
    return -1;
}


// ─────────────────────────────────────────────
// 内部辅助：向指定消息追加图片内容块
//
// 将 images 数组（base64 字符串或 {base64, description} 对象）
// 追加到 messages[targetIdx].content 中，格式为 OpenAI vision 格式：
//   { type: 'text',      text: '[以下是用户上传的N张参考图片]' }
//   { type: 'text',      text: '[图1]' }
//   { type: 'image_url', image_url: { url: '...', detail: 'auto' } }
//   ...
//
// @param {Array}  messages
// @param {number} targetIdx
// @param {Array}  images      — base64 字符串或 {base64, description}
// @param {string} [label]     — 图片用途标签，默认 "参考图片"
// @returns {Array} 新的 messages 数组（浅拷贝）
// ─────────────────────────────────────────────

function appendImagesToMessage(messages, targetIdx, images, label = '参考图片') {
    if (!images || images.length === 0 || targetIdx < 0 || targetIdx >= messages.length) {
        return messages;
    }

    const newMessages  = [...messages];
    const targetMsg    = newMessages[targetIdx];
    const contentParts = [];

    // 原 content 处理
    if (typeof targetMsg.content === 'string') {
        contentParts.push({ type: 'text', text: targetMsg.content });
    } else if (Array.isArray(targetMsg.content)) {
        contentParts.push(...targetMsg.content);
    }

    // 图片头说明文字
    if (images.length > 0) {
        contentParts.push({
            type: 'text',
            text: `\n[以下是用户上传的${images.length}张${label}]`,
        });
    }

    // 逐张加入
    images.forEach((imgItem, idx) => {
        const base64Raw = typeof imgItem === 'string' ? imgItem : imgItem.base64;
        const desc      = typeof imgItem === 'object' && imgItem.description
            ? imgItem.description
            : '' + label + (idx + 1);

        // 文字标签
        contentParts.push({ type: 'text', text: `[${desc}]` });

        // 确保有 data: 前缀
        let dataUrl = base64Raw;
        if (!base64Raw.startsWith('data:')) {
            dataUrl = 'data:image/png;base64,' + base64Raw;
        }

        // image_url 块
        contentParts.push({
            type:      'image_url',
            image_url: { url: dataUrl, detail: 'auto' },
        });
    });

    const newMsg    = { ...targetMsg };
    newMsg.content  = contentParts;
    newMessages[targetIdx] = newMsg;
    return newMessages;
}


// ─────────────────────────────────────────────
// 导出：handlePromptRequest
//
// 完整的生图请求处理流程：
//
//   1. [可选] 弹出用户需求弹窗，获取补充文字 + 参考图片
//   2. getElContext(element, historyDepth) — 获取当前消息上下文
//   3. processWorldBooksWithTrigger(context) — 处理世界书触发
//   4. buildPromptForRequestType('image_gen') — 构建 LLM 消息数组
//   5. replaceAllPlaceholders(messages, data) — 替换 {{占位符}}
//      其中 data 包含：context / body / variables /
//                      worldBookContent / userDemand /
//                      characterListText / outfitEnableListText /
//                      commonCharacterListText
//   6. mergeAdjacentMessages — 合并相邻同角色消息
//   7. appendImagesToMessage — 插入角色/服装参考图片 + 用户上传图片
//   8. LLM_IMAGE_GEN(messages, {timeoutMs:300000}) — 发起 LLM 请求
//   9. removeThinkingTags(response) — 清理 <think> 标签
//  10. parseImagesFromPrompt(cleanedText) — 解析图片标签
//  11. insertImagesIntoElement(element, imageTags) — 插入 DOM
//  12. [若 zidongdianji 启用] 通过 taskQueue 管理自动批量生图状态
//
// @param {HTMLElement} element   — mes_text DOM 元素
// @param {string}      gestureId — 触发来源标识（如 'gesture1' / 'AUTO_CLICK'）
// ─────────────────────────────────────────────

export async function handlePromptRequest(element, gestureId) {
    const timer = debugTimer('handlePromptRequest', '开始处理图片生成请求');
    debugMilestone('handlePromptRequest', '请求初始化');
    debugLog(
        'handlePromptRequest',
        '处理手势识别后的图片生成请求',
        {
            gestureId,
            '目标元素': element?.tagName || element?.id,
            '功能说明': '正文图片生成核心流程',
        }
    );

    // ── Step 1：用户需求弹窗（若 imageGenDemandEnabled 开启） ──
    const demandEnabled = extension_settings[extensionName]?.['imageGenDemandEnabled'] ?? false;
    let userDemand   = '';
    let uploadedImgs = [];

    if (demandEnabled) {
        debugBranch('handlePromptRequest', '显示用户需求弹窗', true);
        debugLog('handlePromptRequest', '用户需求弹窗已启用，等待用户输入');

        const popupTimer = debugTimer('showUserDemandPopup', '显示用户需求弹窗');
        const result     = await showUserDemandPopup();
        popupTimer.end('用户已响应');

        if (result === null) {
            // 用户点了取消
            debugBranch('handlePromptRequest', '用户取消请求', true);
            debugLog('handlePromptRequest', '用户取消了生图请求');
            toastr.info('已取消生图请求');
            timer.end('用户取消');
            return;
        }

        userDemand   = result.text || extension_settings[extensionName]?.['imageGenDemand'] || '';
        uploadedImgs = result.images || [];

        debugLog(
            'handlePromptRequest',
            '用户需求已获取',
            { '需求文本长度': userDemand.length, '上传图片数量': uploadedImgs.length }
        );
    } else {
        debugBranch('handlePromptRequest', '跳过用户需求弹窗', true);
        userDemand = extension_settings[extensionName]?.['imageGenDemand'] || '';
    }

    toastr.info('正在处理正文生图请求...');

    // ── Step 2：获取元素上下文消息 ──
    const context = getContext();
    const historyDepth = (extension_settings[extensionName]?.['llm_history_depth'] ?? 0) + 1;
    debugLog('handlePromptRequest', '获取元素上下文消息', { '历史层数': historyDepth });

    const ctxTimer   = debugTimer('handlePromptRequest', '获取元素上下文消息');
    const ctxMessages = await getElContext(element, historyDepth);
    ctxTimer.end('消息数量：' + (ctxMessages?.length || 0) + ' 条上下文');

    // 最后一条消息（正文 body）
    const bodyMsg = ctxMessages[ctxMessages.length - 1];

    // ── Step 3：世界书触发处理 ──
    let worldBookContent = '';
    if (ctxMessages) {
        const ctxForWB       = userDemand ? [...ctxMessages, userDemand] : ctxMessages;
        debugLog('handlePromptRequest', '消息数量', { '数量': ctxForWB.length });

        const wbTimer        = debugTimer('processWorldBooksWithTrigger', '处理世界书触发');
        worldBookContent     = await processWorldBooksWithTrigger(ctxForWB);
        wbTimer.end('触发内容长度：' + (worldBookContent?.length || 0));

        if (worldBookContent) {
            debugLog('handlePromptRequest', '世界书触发内容已获取', {
                '内容预览': worldBookContent.substring(0, 100) + '...',
            });
        }
    }

    // ── Step 4：获取变量表、上下文片段 ──
    const variables    = context.chatMetadata?.variables || {};
    const recentCtx    = ctxMessages && ctxMessages.length > 0
                         ? ctxMessages.slice(-10, -1)
                         : [];

    // ── Step 5：合并上下文拼接成单一文本（用于角色列表等） ──
    const ctxLines = [];
    if (userDemand)  ctxLines.push(userDemand);
    if (bodyMsg)     ctxLines.push(bodyMsg);
    if (ctxMessages && ctxMessages.length > 1) ctxLines.push(ctxMessages.join('\n'));
    if (worldBookContent) ctxLines.push(worldBookContent);
    const combinedContext = ctxLines.join('\n');

    // ── Step 6：构建 LLM 消息数组 ──
    debugLog('handlePromptRequest', '构建请求类型 Prompt',
        { '请求类型': 'image_gen', '条目触发文本长度': combinedContext.length });

    const buildTimer = debugTimer('buildPromptForRequestType', '构建 Prompt');
    let messages = buildPromptForRequestType('image_gen', combinedContext);
    buildTimer.end('消息数量：' + (messages?.length || 0));

    // ── Step 7：生成角色/服装列表文本 ──
    const characterListText       = generateCharacterListText(combinedContext);
    const outfitEnableListText    = generateOutfitEnableListText();
    const commonCharacterListText = generateCommonCharacterListText();

    debugLog('handlePromptRequest', '生成角色/服装列表', {
        '角色列表长度':   characterListText?.length || 0,
        '服装列表长度':   outfitEnableListText?.length || 0,
        '通用角色列表长度': commonCharacterListText?.length || 0,
    });

    // 所有支持的占位符 key 列表（用于诊断未替换变量）
    const knownPlaceholders = [
        '{{上下文}}', '{{正文}}',
        '{{角色启用列表}}', '{{通用角色启用列表}}',
        '{{通用服装启用列表}}', '{{用户需求}}',
        '{{角色名称}}', '{{世界书触发}}',
    ];

    debugLog('handlePromptRequest', '占位符替换处理');
    messages = mergeAdjacentMessages(messages);

    // 占位符替换数据包
    const placeholderData = {
        context:               recentCtx.join('\n'),
        body:                  bodyMsg,
        worldBookContent,
        variables,
        userDemand,
        characterListText,
        outfitEnableListText,
        commonCharacterListText,
    };

    const replaceTimer = debugTimer('replaceAllPlaceholders', '占位符替换处理');
    const { messages: replacedMessages, replacedVariables } =
        replaceAllPlaceholders(messages, placeholderData);
    messages = replacedMessages;
    replaceTimer.end('替换了 ' + replacedVariables.size + ' 个变量');

    // ── Step 8：插入用户上传图片 ──
    const lastUserIdx = findLastUserMessageIndex(messages);
    if (uploadedImgs.length > 0 && lastUserIdx >= 0) {
        debugLog('handlePromptRequest', '附加用户上传图片',
            { '数量': uploadedImgs.length, '目标消息索引': lastUserIdx });
        messages = appendImagesToMessage(messages, lastUserIdx, uploadedImgs, '参考图片');
    }

    // ── Step 9：插入角色/服装参考图片 ──
    try {
        debugLog('handlePromptRequest', '收集角色/服装图片');
        const charImages   = await getEnabledCharacterImages(combinedContext);
        const outfitImages = await getEnabledOutfitImages();
        const commonImages = await getCommonCharacterImages();
        const allRefImages = [...charImages, ...outfitImages, ...commonImages];

        debugLog('handlePromptRequest', '角色/服装图片收集完成', {
            '角色图片数':   charImages.length,
            '服装图片数':   outfitImages.length,
            '通用角色图片数': commonImages.length,
            '总计':        allRefImages.length,
        });

        if (allRefImages.length > 0 && lastUserIdx >= 0) {
            messages = appendImagesToMessage(messages, lastUserIdx, allRefImages, '角色服装参考图片');
        }
    } catch (err) {
        debugError('handlePromptRequest', '收集角色/服装图片失败', err);
        console.error('[promptReq] 收集角色/服装图片失败:', err);
    }

    // ── Step 10：生成诊断文本（未替换变量提示） ──
    let diagText = '';
    if (replacedVariables.size > 0) {
        diagText = '诊断：检测到以下变量被使用：\n' +
                   [...replacedVariables].join('、') + '\n';
    } else {
        diagText = '诊断：没有检测到变量被使用。\n';
    }

    const unusedPlaceholders = knownPlaceholders.filter(
        k => !replacedVariables.has(k) && !k.includes('::')
    );
    if (unusedPlaceholders.length > 0) {
        diagText += '未使用的变量：' + unusedPlaceholders.join('、') + '\n\n';
    } else {
        diagText += '所有基础变量都已使用。\n';
    }

    updateCombinedPrompt(messages, diagText);

    // ── Step 11：正则测试模式（仅展示 Prompt，不发 LLM） ──
    const regexTestMode = extension_settings[extensionName]?.['regexTestMode'] ?? false;
    if (regexTestMode) {
        debugBranch('handlePromptRequest', '正则测试模式 - 停止LLM请求', true);
        toastr.info('🧪 正则测试模式已启用，请求，仅展示最终 Prompt');
        timer.end('正则测试模式 - 未发起LLM请求');
        return;
    }

    // ── Step 12：发起 LLM 请求 ──
    debugMilestone('handlePromptRequest', '发起LLM请求');
    debugLog('handlePromptRequest', '发起 LLM 图片生成请求',
        { '消息数量': messages?.length || 0, '请求类型': 'image_gen' });

    const llmTimer  = debugTimer('LLM_IMAGE_GEN', '开始 LLM 请求');
    const llmResult = await LLM_IMAGE_GEN(messages, { timeoutMs: 300000 });
    llmTimer.end('响应长度: ' + (llmResult?.result?.length || 0));

    // LLM 测试模式（返回固定内容）
    if (llmResult.testMode) {
        debugBranch('handlePromptRequest', 'LLM返回测试模式', true);
        timer.end('LLM 测试模式返回');
        return;
    }

    const rawResponse  = llmResult.result;
    const cleanedResp  = removeThinkingTags(rawResponse);
    debugLog('handlePromptRequest', 'LLM生成结束事件触发');

    // ── Step 13：解析图片标签 ──
    const parseTimer = debugTimer('parseImagesFromPrompt', '解析图片标签');
    const imageTags  = parseImagesFromPrompt(cleanedResp);
    parseTimer.end(imageTags.length + ' 个图片标签待处理');

    debugLog('handlePromptRequest', '图片标签解析完成', {
        '数量': imageTags.length,
        '标签预览': imageTags.slice(0, 3).map(t =>
            t.tag || t.prompt?.slice(0, 20) || '...'
        ),
    });

    if (imageTags.length === 0 || !element) {
        debugLog('handlePromptRequest', '图片标签解析完成');
        timer.end('图片生成流程完成');
        return;
    }

    // ── Step 14：插入 DOM ──
    debugLog('handlePromptRequest', '发起 LLM 图片生成请求');
    const insertTimer = debugTimer('insertImagesIntoElement', '插入图片标签到 DOM');
    await insertImagesIntoElement(element, imageTags);
    insertTimer.end('插入完成');

    // ── Step 15：若 zidongdianji（自动批量生图）已启用，接管任务调度 ──
    const autoClickEnabled =
        extension_settings[extensionName]?.['zidongdianji'] === 'true';

    if (autoClickEnabled) {
        // 动态导入 taskQueue 和 eventSource（避免循环依赖）
        const { taskQueue, TaskType, TaskStatus } =
            await import('./taskQueue.js');
        const { eventSource } =
            await import('./../../../../../../../script.js');

        // 创建任务
        const taskDesc = {
            name:        '自动批量生图 (' + imageTags.length + ' 张)',
            type:        TaskType['image_gen'],
            description: '共 ' + imageTags.length + ' 张图片',
        };
        const taskId = taskQueue.addTask(taskDesc);
        taskQueue.updateStatus(taskId, TaskStatus['RUNNING']);

        window.zidongdianji      = true;
        window.autoClickTaskId   = taskId;

        // 监听 auto_click_complete 事件（每张图完成后触发）
        const onAutoClickComplete = event => {
            if (event.taskId !== taskId) return;

            taskQueue.completeTask(taskId, event.result !== false);
            eventSource.removeEventListener('st_chatu8_auto_click_complete', onAutoClickComplete);
            window.autoClickTaskId = null;

            // 若 zidongdianji2（连续生图）也开启，延迟重置标志
            if (extension_settings[extensionName]?.['zidongdianji2'] === 'true') {
                setTimeout(() => { window.zidongdianji = false; }, 2000);
            }
        };
        eventSource.on('st_chatu8_auto_click_complete', onAutoClickComplete);

        // 超时保护：若任务不在队列中则自动清理
        setTimeout(() => {
            if (!taskQueue.isTaskInQueue(taskId)) {
                console.log('[promptReq] 自动点击任务已被取消');
                window.zidongdianji    = false;
                window.autoClickTaskId = null;
                eventSource.removeEventListener('st_chatu8_auto_click_complete', onAutoClickComplete);
                return;
            }

            // 动态导入 chatProcessor 处理所有图片占位符
            import('./iframe/index.js')
                .then(({ processAllImagePlaceholders }) => {
                    if (!taskQueue.isTaskInQueue(taskId)) {
                        console.log('[promptReq] 自动点击任务已被取消');
                        window.zidongdianji    = false;
                        window.autoClickTaskId = null;
                        eventSource.removeEventListener('st_chatu8_auto_click_complete', onAutoClickComplete);
                        return;
                    }
                    processAllImagePlaceholders();
                })
                .catch(err => {
                    debugError('handlePromptRequest', '[promptReq] 加载 iframe 模块失败:', err);
                    taskQueue.completeTask(taskId, false);
                    eventSource.removeEventListener('st_chatu8_auto_click_complete', onAutoClickComplete);
                    window.autoClickTaskId = null;
                });
        }, 0);
    }

    debugMilestone('handlePromptRequest', '图片生成流程完成');
    timer.end('全流程完成');
}
