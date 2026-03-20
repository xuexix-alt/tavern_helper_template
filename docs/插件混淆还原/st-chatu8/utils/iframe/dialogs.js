// ============================================================
// dialogs.js — 对话框与用户交互核心模块
// 导出：setTriggerGeneration / showBananaRetouchDialog /
//        showEditDialog / calculateDialogDimensions /
//        createUnifiedDialog / createUnifiedInput /
//        createButtonContainer
// ============================================================

import { saveSettingsDebounced } from '../../../../../../script.js';
import { extension_settings } from '../../../../../extensions.js';
import { extensionName } from '../config.js';
import { parsePromptStringWithCoordinates, stripChineseAnnotations } from '../utils.js';
import { callTranslation, parseTranslationResult, tagsToJsonString } from '../ai.js';
import { handleTagModifyRequest } from '../tagModify.js';
import { processCharacterPrompt } from '../characterprompt.js';
import { handleAutocomplete } from './autocomplete.js';
import { isMobileDevice } from '../utils.js';
import { lockTagForElement, unlockTagForElement, isTagLocked, deleteTagForElement } from '../imageInserter.js';
import { showComfyUIInpaintDialog } from './comfyuiInpaint.js';
import { showNovelAIInpaintDialog } from './novelaiInpaint.js';
import { showGorkVideoDialog } from './gorkVideo.js';


// ─────────────────────────────────────────────
// 模块级状态
// ─────────────────────────────────────────────

let _triggerGeneration = null;

export function setTriggerGeneration(fn) {
    _triggerGeneration = fn;
}


// ─────────────────────────────────────────────
// 内部辅助：根据生图模式名获取宽高配置 key
// ─────────────────────────────────────────────

function getImageSizeConfigKeys(modeName) {
    const configs = {
        sd: {
            widthKey:  'sd_cwidth',
            heightKey: 'sd_cheight',
            modeName:  'SD',
        },
        novelai: {
            widthKey:  'novelai_width',
            heightKey: 'novelai_height',
            modeName:  'NovelAI',
        },
        comfyui: {
            widthKey:  'comfyui_width',
            heightKey: 'comfyui_height',
            modeName:  'ComfyUI',
        },
        banana: {
            widthKey:  null,
            heightKey: null,
            modeName:  'Banana',
        },
    };
    return configs[modeName] || configs['comfyui'];
}


// ─────────────────────────────────────────────
// 内部辅助：判断当前是否为移动端
// ─────────────────────────────────────────────

function isMobileDeviceDialog() {
    return (
        window.top.innerWidth <= 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );
}


// ─────────────────────────────────────────────
// 内部辅助：图片尺寸选择弹窗
//
// 弹出一个覆盖层，让用户设置图片的宽度/高度（或纵横比）。
// 返回 Promise<{width, height} | {aspectRatio} | null>
//
// @param {Element} buttonEl  - 触发按钮元素（含 dataset）
// @param {Element} inputEl   - 主提示词 textarea
// @param {string}  modeName  - 生图模式（'sd'/'novelai'/'comfyui'/'banana'）
// ─────────────────────────────────────────────

function showImageSizePopup(buttonEl, inputEl, modeName) {
    return new Promise(resolve => {
        const doc              = window.top.document;
        const isMobile         = isMobileDevice();
        const settings         = extension_settings[extensionName];
        const mode             = settings['mode'] || 'comfyui';
        const { widthKey, heightKey, modeName: displayName } = getImageSizeConfigKeys(mode);

        // 读取当前宽高（Banana 模式用纵横比）
        let currentWidth, currentHeight;
        if (mode === 'banana') {
            const aspectRatio = buttonEl.dataset['aspectRatio'] ||
                                settings['banana']?.['aspectRatio'] || '1:1';
            currentWidth  = aspectRatio;
            currentHeight = '';
        } else {
            currentWidth  = buttonEl.dataset['width']  || settings[widthKey]  || '1024';
            currentHeight = buttonEl.dataset['height'] || settings[heightKey] || '1024';
        }

        // 计算弹窗位置（移动端贴底，桌面端贴 #top-settings 下方）
        let topMargin = 0;
        let availableHeight = window.innerHeight - 100;

        if (isMobile) {
            const sendForm = doc.querySelector('#send_form');
            if (sendForm) {
                topMargin = sendForm.getBoundingClientRect().top - 10;
            }
        }

        const topSettings = doc.querySelector('#top-settings');
        if (topSettings) {
            const rect = topSettings.getBoundingClientRect();
            availableHeight = rect.bottom - topMargin - 10;
        }

        // ── 创建遮罩 ──
        const overlay = doc.createElement('div');
        overlay.id        = 'st-chatu8-size-popup-overlay';
        overlay.innerHTML = '';

        // ── 创建弹窗主体 ──
        const popup = doc.createElement('div');
        popup.className = 'st-chatu8-size-popup';

        if (isMobile) {
            popup.style.cssText = [
                'position:absolute', 'top:0', 'left:0',
                'width:100%', `height:${availableHeight}px`,
                'z-index:1', 'background:transparent',
            ].join(';');
            overlay.style.position = 'relative';
            overlay.overlayElement  = popup;
        }

        // 标题
        const title = doc.createElement('div');
        title.textContent = `📐 图片大小设置 (${displayName})`;
        title.className   = 'st-chatu8-popup-title';

        // 副标题（宽度/纵横比提示）
        const subtitle = doc.createElement('p');
        subtitle.textContent = mode === 'banana' ? '纵横比' : '宽度 / 高度';
        subtitle.className   = 'st-chatu8-popup-hint';

        // ── 输入区域 ──
        const inputArea = doc.createElement('div');
        inputArea.className = 'st-chatu8-popup-inputs';

        let widthInput, heightInput;

        if (mode === 'banana') {
            // Banana 模式：下拉选择纵横比
            const aspectLabel = doc.createElement('div');
            aspectLabel.className   = 'st-chatu8-popup-label';

            const aspectTitle = doc.createElement('p');
            aspectTitle.textContent = '纵横比';
            aspectTitle.className   = 'st-chatu8-popup-hint';

            const aspectSelect    = doc.createElement('select');
            aspectSelect.className = 'st-chatu8-popup-size-input';
            ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].forEach(ratio => {
                const opt   = doc.createElement('option');
                opt.value   = ratio;
                opt.textContent = ratio;
                if (ratio === currentWidth) opt.selected = true;
                aspectSelect.appendChild(opt);
            });
            aspectLabel.appendChild(aspectTitle);
            aspectLabel.appendChild(aspectSelect);
            inputArea.appendChild(aspectLabel);
            widthInput = aspectSelect;

        } else {
            // 其他模式：宽度 + 高度数字输入
            const widthRow = doc.createElement('div');
            widthRow.className = 'st-chatu8-popup-label';
            const widthLabel = doc.createElement('p');
            widthLabel.textContent = '宽度';
            widthLabel.className   = 'st-chatu8-popup-hint';
            widthInput = doc.createElement('input');
            widthInput.type      = 'number';
            widthInput.value     = currentWidth;
            widthInput.min       = '64';
            widthInput.max       = '4096';
            widthInput.step      = '64';
            widthInput.className = 'st-chatu8-popup-size-input';
            widthRow.appendChild(widthLabel);
            widthRow.appendChild(widthInput);

            const heightRow = doc.createElement('div');
            heightRow.className = 'st-chatu8-popup-label';
            const heightLabel = doc.createElement('p');
            heightLabel.textContent = '高度';
            heightLabel.className   = 'st-chatu8-popup-hint';
            heightInput = doc.createElement('input');
            heightInput.type      = 'number';
            heightInput.value     = currentHeight;
            heightInput.min       = '64';
            heightInput.max       = '4096';
            heightInput.step      = '64';
            heightInput.className = 'st-chatu8-popup-size-input';
            heightRow.appendChild(heightLabel);
            heightRow.appendChild(heightInput);

            // 对调按钮
            const swapRow = doc.createElement('div');
            swapRow.className = 'st-chatu8-popup-size-row';
            const swapBtn = doc.createElement('button');
            swapBtn.type      = 'button';
            swapBtn.innerHTML = '⇅ 对调宽高';
            swapBtn.className = 'st-chatu8-popup-size-row swap-btn';
            swapBtn.onclick   = () => {
                const tmp       = widthInput.value;
                widthInput.value  = heightInput.value;
                heightInput.value = tmp;
            };
            swapRow.appendChild(swapBtn);

            inputArea.appendChild(widthRow);
            inputArea.appendChild(heightRow);
            inputArea.appendChild(swapRow);
        }

        // ── 按钮区域 ──
        const btnRow     = doc.createElement('div');
        btnRow.className = 'st-chatu8-popup-buttons';

        const cancelBtn       = doc.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.className   = 'st-chatu8-popup-btn-cancel';

        const confirmBtn       = doc.createElement('button');
        confirmBtn.textContent = '确定并生成';
        confirmBtn.className   = 'st-chatu8-popup-btn';

        // 关闭弹窗的通用方法
        const closeAndResolve = result => {
            overlay.classList.add('closing');
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 200);
        };

        cancelBtn.addEventListener('click', () => closeAndResolve(null));

        confirmBtn.addEventListener('click', () => {
            if (mode === 'banana') {
                buttonEl.dataset['aspectRatio'] = widthInput.value;
                closeAndResolve({ aspectRatio: widthInput.value });
            } else {
                const w = widthInput.value.trim();
                const h = heightInput.value.trim();
                buttonEl.dataset['width']  = w;
                buttonEl.dataset['height'] = h;
                closeAndResolve({ width: w, height: h });
            }
        });

        // ESC / Enter 快捷键
        const onKeydown = e => {
            if (e.key === 'Escape') { closeAndResolve(null); doc.removeEventListener('keydown', onKeydown); }
            else if (e.key === 'Enter') { confirmBtn.click(); doc.removeEventListener('keydown', onKeydown); }
        };
        doc.addEventListener('keydown', onKeydown);

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);

        popup.appendChild(title);
        popup.appendChild(subtitle);
        popup.appendChild(inputArea);
        popup.appendChild(btnRow);
        overlay.appendChild(popup);
        doc.body.appendChild(overlay);

        setTimeout(() => widthInput?.focus(), 100);
    });
}


// ─────────────────────────────────────────────
// 导出 1: showBananaRetouchDialog
//
// 弹出 Banana 修图对话框：展示当前图像，让用户输入修图指令后触发生成。
//
// @param {Element} imgEl    - 当前图像元素（src 用于预览）
// @param {Element} buttonEl - 触发按钮元素
// ─────────────────────────────────────────────

export function showBananaRetouchDialog(imgEl, buttonEl) {
    const imgSrc   = imgEl.src;
    const isMobile = isMobileDeviceDialog();
    const { backdrop, dialog, closeDialog } = createUnifiedDialog({
        title:    'Banana 修图',
        isMobile,
    });

    // 预览图
    const preview       = document.createElement('img');
    preview.src         = imgSrc;
    preview.style.display    = 'block';
    preview.style.maxWidth   = '100%';
    preview.style.maxHeight  = '30vh';
    preview.style.objectFit  = 'contain';
    preview.style.marginBottom = '8px';
    preview.style.borderRadius = 'var(--border-radius-md)';

    // 指令输入框
    const inputConfig = {
        placeholder: '输入修图指令，例如："给人物换上红色的连衣裙"',
        value:       buttonEl.dataset['retouchPrompt'] || '',
        rows:        2,
    };
    const textarea = createUnifiedInput(inputConfig);

    // 发送逻辑
    const onSend = () => {
        const instruction = textarea.value.trim();
        if (!instruction) {
            toastr.warning('请输入修图指令。');
            return;
        }
        buttonEl.dataset['retouchPrompt'] = instruction;
        buttonEl.dataset['retouchImage']  = imgSrc;
        if (!buttonEl.dataset['change']) {
            buttonEl.dataset['change'] = buttonEl.dataset['link'];
        }
        buttonEl.dataset['change'] += '{修图}';
        toastr.info('正在准备修图生成...');
        _triggerGeneration && _triggerGeneration(buttonEl);
        closeDialog();
    };

    const buttons = createButtonContainer([
        { text: '发送', className: 'confirm', onClick: onSend   },
        { text: '取消', className: 'cancel',  onClick: closeDialog },
    ]);

    dialog.appendChild(preview);
    dialog.appendChild(textarea);
    dialog.appendChild(buttons);
    textarea.focus();
}


// ─────────────────────────────────────────────
// 导出 2: showEditDialog
//
// 主编辑对话框：显示当前 tag 的提示词文本框，提供翻译、发送、
// 标签操作（锁定/解锁/删除/重置）、图像处理子菜单等功能。
//
// @param {Element|null} imgEl    - 图像元素（可为 null）
// @param {Element}      buttonEl - 触发按钮元素（含 dataset.link / dataset.stableId）
// ─────────────────────────────────────────────

export function showEditDialog(imgEl, buttonEl) {
    const doc          = window.top.document;
    const tagContent   = buttonEl.dataset['link'] || buttonEl.dataset['imageTag'];

    // ── 注入 CSS（仅首次） ──
    const styleId = 'st-chatu8-image';
    if (!doc.querySelector(`#${styleId}`)) {
        const style   = doc.createElement('style');
        style.id      = styleId;
        style.innerHTML = `
            /* Dialog Styles - scoped to edit backdrop */
            .st-chatu8-edit-backdrop .st-chatu8-edit-dialog {
                background: var(--st-chatu8-bg-primary, #2a2a2a);
                border: 1px solid var(--st-chatu8-border-color, rgba(255,255,255,0.15));
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                border-radius: 8px;
                padding: 16px;
                overflow-y: auto;
                overflow-x: hidden;
                max-height: 200px;
                max-width: 90vw;
                min-height: 20px;
                flex-direction: column;
            }
            /* ... 其余 CSS 段落（含自动补全、按钮、滚动条等）在原混淆代码中通过字符串拼接注入 */
        `;
        doc.head.appendChild(style);
    }

    // 移除已有对话框
    doc.querySelector('.st-chatu8-edit-backdrop')?.remove();

    // ── 创建自动补全容器 ──
    const autocompleteEl = doc.createElement('div');
    autocompleteEl.className = 'ch-autocomplete-results';

    let _autocompleteTimer   = null;
    const _noop              = () => {};
    const _repositionAutocomplete = () => { /* 根据 inputEl 位置动态调整 */ };
    const _hideAutocomplete  = () => { _autocompleteTimer = null; };
    autocompleteEl.updateDialogSize = _hideAutocomplete;

    // ── 创建背景遮罩 ──
    const backdrop = doc.createElement('div');
    backdrop.className = 'st-chatu8-edit-backdrop';

    // ── 创建内容区（含弹窗布局） ──
    const container = doc.createElement('div');
    container.className = 'st-chatu8-edit-dialog';
    container.style.position = 'relative';
    container.addEventListener('click', e => e.stopPropagation());

    // ── 判断移动端，计算高度 ──
    const isMobile      = isMobileDeviceDialog();
    const hasTopBar     = window.innerWidth > 768;
    let topMargin       = 0;
    if (isMobile) {
        const sendForm = doc.querySelector('#send_form');
        topMargin = sendForm ? sendForm.offsetTop + sendForm.offsetHeight - 10 : 0;
        backdrop.style.position = 'relative';
        container.style.height  = topMargin + 'px';
    }
    if (doc.querySelector('#top-settings')) {
        const rect = doc.querySelector('#top-settings').getBoundingClientRect();
        container.style.maxHeight = (rect.bottom - topMargin - 10) + 'px';
        container.style.width     = 'auto';
        isMobile && (container.style.height = (rect.bottom - topMargin - 10) + 'px');
    }

    // ── 标题 ──
    const titleEl       = doc.createElement('div');
    titleEl.className   = 'st-chatu8-edit-title';
    titleEl.textContent = '编辑图片标签';

    // ── 主提示词 textarea ──
    const inputEl    = doc.createElement('textarea');
    inputEl.id       = 'st-chatu8-edit-input';
    inputEl.className = 'st-chatu8-edit-input';
    inputEl.value    = tagContent;

    // ── 标签操作下拉区（锁定/解锁/删除/重置）──
    const tagActionArea = doc.createElement('div');
    tagActionArea.className = 'st-chatu8-tag-action-area';
    tagActionArea.style.cssText = `
        display: none;
        position: absolute;
        flex-direction: column;
        min-width: 140px;
        gap: 6px;
        padding: 8px;
        z-index: 100;
    `;

    // 复制 tag 按钮
    const copyBtn = doc.createElement('div');
    copyBtn.className   = 'st-chatu8-image-process-item';
    copyBtn.innerHTML   = '📋 复制tag';
    copyBtn.onmouseenter = () => { copyBtn.style.backgroundColor = 'rgba(255,107,107,0.15)'; };
    copyBtn.onmouseleave = () => { copyBtn.style.backgroundColor = 'transparent'; };
    copyBtn.onclick = () => {
        inputEl.value = buttonEl.dataset['link'];
        tagActionArea.style.display = 'none';
        toastr.success('翻译完成');
    };

    // 锁定/解锁 tag 按钮（初始状态根据 isTagLocked 异步决定）
    const lockBtn = doc.createElement('button');
    lockBtn.className   = 'st-chatu8-tag-action-btn';
    lockBtn.innerHTML   = '🔒 锁定tag';
    lockBtn.style.cssText = copyBtn.style.cssText;
    lockBtn.onmouseenter = () => { lockBtn.style.backgroundColor = 'rgba(255,107,107,0.15)'; };
    lockBtn.onmouseleave = () => { lockBtn.style.backgroundColor = 'transparent'; };

    // 异步初始化：检查 tag 是否已锁定，更新按钮文字
    (async () => {
        const link = buttonEl.dataset['link'];
        if (link) {
            let el = buttonEl;
            while (el && el.tagName !== 'DIV') el = el.parentElement;
            const mesEl  = el?.closest('.mes') || el;
            const locked = await isTagLocked(mesEl, link);
            if (locked) lockBtn.innerHTML = '🔓 解锁tag';
        }
    })();

    lockBtn.onclick = async () => {
        tagActionArea.style.display = 'none';
        const link = buttonEl.dataset['link'];
        if (!link) { toastr.warning('未找到 tag'); return; }

        let el = buttonEl;
        while (el && el.tagName !== 'DIV') el = el.parentElement;
        const mesEl = el?.closest('.mes') || el;
        const locked = await isTagLocked(mesEl, link);

        if (locked) {
            const result = await unlockTagForElement(mesEl, link);
            result.success
                ? (toastr.success('Tag 已解锁'), lockBtn.innerHTML = '🔒 锁定tag')
                : toastr.error(result.message);
        } else {
            const result = await lockTagForElement(mesEl, link);
            result.success
                ? (toastr.success('Tag 已锁定，将不会被覆盖或删除'), lockBtn.innerHTML = '🔓 解锁tag')
                : toastr.error(result.message);
        }
    };

    // 删除 tag 按钮
    const deleteBtn = doc.createElement('button');
    deleteBtn.className   = 'st-chatu8-tag-action-btn';
    deleteBtn.innerHTML   = '🗑️ 删除tag';
    deleteBtn.style.cssText = copyBtn.style.cssText;
    deleteBtn.onmouseenter = () => { deleteBtn.style.backgroundColor = 'rgba(255,107,107,0.15)'; };
    deleteBtn.onmouseleave = () => { deleteBtn.style.backgroundColor = 'transparent'; };
    deleteBtn.onclick = async () => {
        tagActionArea.style.display = 'none';
        const link = buttonEl.dataset['link'];
        if (!link) { toastr.warning('未找到 tag'); return; }

        let el = buttonEl;
        while (el && el.tagName !== 'DIV') el = el.parentElement;
        const mesEl  = el?.closest('.mes') || el;
        const result = await deleteTagForElement(mesEl, link);

        if (result.success) {
            // 尝试移除对应 DOM 节点
            let targetNode = buttonEl.closest('.ai-image-container')
                            || buttonEl.closest('.st-chatu8-image-container')
                            || buttonEl;
            if (targetNode) {
                targetNode.remove();
                console.log('Removed DOM node for deleted tag');
            } else {
                buttonEl.remove();
                console.log('Removed button for deleted tag');
            }
            toastr.success(result.message);
            closeDialog();
        } else {
            toastr.error(result.message);
        }
    };

    tagActionArea.appendChild(copyBtn);
    tagActionArea.appendChild(lockBtn);
    tagActionArea.appendChild(deleteBtn);

    // 标签操作下拉按钮（▼）
    const tagActionToggleBtn       = doc.createElement('div');
    tagActionToggleBtn.className   = 'st-chatu8-edit-button';
    tagActionToggleBtn.innerHTML   = 'Tag操作 ▼';
    tagActionToggleBtn.style.cssText = 'display: inline-block;';
    tagActionToggleBtn.onclick = e => {
        e.stopPropagation();
        const isVisible = tagActionArea.style.display === 'none';
        tagActionArea.style.display = isVisible ? '' : 'none';
    };

    // 关闭下拉（点击外部）
    const clickOutsideOptions = { passive: true };
    doc.addEventListener('click', e => {
        if (!container.contains(e.target)) tagActionArea.style.display = 'none';
    }, clickOutsideOptions);

    // ── 翻译按钮 ──
    const translateBtn       = doc.createElement('button');
    translateBtn.className   = 'st-chatu8-edit-button';
    translateBtn.textContent = '翻译';
    translateBtn.onclick     = async () => {
        try {
            translateBtn.disabled = true;
            const raw       = inputEl.value || '';
            const cleaned   = stripChineseAnnotations(raw)
                                .replace(/，/g, ',')
                                .replace(/[\r\n]+/g, ',');

            // 解析 tag 列表（支持坐标语法和普通逗号分隔）
            let tags = [];
            if (cleaned.includes('1 coordinates') || cleaned.includes('position')) {
                const parsed   = parsePromptStringWithCoordinates(cleaned);
                const sections = [
                    'Scene Composition', '1 Prompt', '2 Prompt', '3 Prompt', '4 Prompt',
                    '1 UC', '2 UC', '3 UC', '4 UC',
                    '1 coordinates', '2 coordinates', '3 coordinates', '4 coordinates',
                    'Character 1', 'Character 2', 'Character 3', 'Character 4',
                ];
                sections.forEach(key => {
                    if (typeof parsed?.[key] === 'string' && parsed[key].trim()) {
                        splitTags(parsed[key]).forEach(t => {
                            if (t && !isSpecialTag(t)) tags.push(t);
                        });
                    }
                });
            } else {
                tags = splitCommas(cleaned).filter(t => !isSpecialTag(t));
            }

            tags = Array.from(new Set(tags));
            if (tags.length === 0) { toastr.warning('没有可翻译的标签。'); translateBtn.disabled = false; return; }

            // 调用翻译 API
            const json        = tagsToJsonString(Array.from(new Set(tags.map(cleanTag).filter(Boolean))));
            const rawResult   = await callTranslation(json);
            const resultMap   = parseTranslationResult(rawResult);
            console.log('[dialogs] 翻译的 map:', resultMap);

            // 将翻译结果回填到原文本中
            const originalTags = splitCommas(cleaned);
            const annotated    = originalTags.map(t => {
                if (t.startsWith('$') && t.endsWith('$')) return t; // 跳过特殊标签
                const key = cleanTag(t);
                if (resultMap[key]) return `${t}（${resultMap[key]}）`;
                if (resultMap[t])   return `${t}（${resultMap[t]}）`;
                return t;
            });

            let output = annotated.join(', ');
            // 如果包含多提示词节（如 "Scene Composition"），按节分行
            const sectionHeaders = ['Scene Composition', '1 Prompt', /* ... */];
            if (sectionHeaders.some(h => output.includes(h))) {
                sectionHeaders.forEach(h => {
                    output = output.replace(
                        new RegExp('(?<!^)\\s*' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                        '\n\n' + h
                    );
                });
                output = output.replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n');
            }

            inputEl.value = output;
            toastr.success('翻译完成');
        } catch (err) {
            console.error('[dialogs] 编辑标签翻译失败:', err);
            alert('翻译失败：' + (err.message || err));
        } finally {
            translateBtn.disabled = false;
        }
    };

    // ── 修改 tag 按钮（调用 tagModify） ──
    const modifyTagBtn       = doc.createElement('button');
    modifyTagBtn.className   = 'st-chatu8-edit-button';
    modifyTagBtn.textContent = '修改tag';
    modifyTagBtn.onclick = async () => {
        let el = buttonEl;
        while (el && el.tagName !== 'DIV') el = el.parentElement;
        if (el) {
            const mesEl = el.closest('.mes') || el;
            el = mesEl;
        }
        el
            ? await handleTagModifyRequest(el, inputEl.value, inputEl)
            : toastr.warning('无法找到上下文元素');
    };

    // ── 展开预设按钮（调用 processCharacterPrompt） ──
    const expandPresetBtn       = doc.createElement('button');
    expandPresetBtn.className   = 'st-chatu8-edit-button';
    expandPresetBtn.textContent = '展开预设';
    expandPresetBtn.onclick = () => {
        const original  = inputEl.value;
        const processed = processCharacterPrompt(original);
        if (processed !== original) {
            inputEl.value = processed;
            toastr.success('角色/服装预设已展开');
        } else {
            toastr.info('未发现可展开的预设标记');
        }
    };

    // ── 发送按钮（含长按 → 图像大小弹窗） ──
    const sendBtn       = doc.createElement('button');
    sendBtn.className   = 'st-chatu8-edit-send-button';
    sendBtn.textContent = '发送';

    let sendPressTimer = null;
    let isSendLong     = false;
    const SEND_LONG_MS = 500;

    const doSend = () => {
        toastr.info('正在生成图像...');
        const newText = inputEl.value.trim();
        if (newText && newText !== tagContent) {
            buttonEl.dataset['link'] = newText;
        }
        _triggerGeneration && _triggerGeneration(buttonEl);
        closeDialog();
    };

    const doLongSend = async () => {
        isSendLong = true;
        const result = await showImageSizePopup(buttonEl, inputEl);
        if (result) doSend();
    };

    sendBtn.addEventListener('mousedown', e => {
        isSendLong    = false;
        sendPressTimer = setTimeout(doLongSend, SEND_LONG_MS);
    });
    sendBtn.addEventListener('mouseup',    () => { clearTimeout(sendPressTimer); !isSendLong && doSend(); });
    sendBtn.addEventListener('mouseleave', () => { clearTimeout(sendPressTimer); });
    sendBtn.addEventListener('touchstart', e => {
        isSendLong    = false;
        sendPressTimer = setTimeout(doLongSend, SEND_LONG_MS);
    }, { passive: true });
    sendBtn.addEventListener('touchend',   e => { clearTimeout(sendPressTimer); !isSendLong && (e.preventDefault(), doSend()); });
    sendBtn.addEventListener('touchcancel', () => { clearTimeout(sendPressTimer); });

    // ── 取消按钮 ──
    const cancelBtn       = doc.createElement('button');
    cancelBtn.className   = 'st-chatu8-edit-button cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick     = closeDialog;

    // ── 图像处理菜单（ComfyUI / NovelAI / Gork / Banana） ──
    const imageMenuWrapper = doc.createElement('div');
    imageMenuWrapper.className = 'st-chatu8-image-process-menu';
    imageMenuWrapper.style.cssText = `display:none; position:absolute; bottom:10%; left:50%; transform:translateX(-50%); background:var(--st-chatu8-bg-primary,#1a1a2a); border:1px solid var(--st-chatu8-border-color,rgba(0,0,0,0.2)); border-radius:6px; padding:8px; z-index:100; min-width:140px; flex-direction:column; gap:6px;`;

    const menuItemStyle = `display:flex; align-items:center; gap:8px; width:100%; padding:8px 12px; background:transparent; border:none; border-radius:4px; cursor:pointer; font-size:0.9em; text-align:left; color:inherit; white-space:nowrap;`;

    // ComfyUI 局部重绘
    const comfyItem = doc.createElement('div');
    comfyItem.className   = 'st-chatu8-image-process-item';
    comfyItem.textContent = '🎨 ComfyUI局部重绘';
    comfyItem.style.cssText = menuItemStyle;
    comfyItem.onmouseenter = () => { comfyItem.style.backgroundColor = 'rgba(255,107,107,0.15)'; };
    comfyItem.onmouseleave = () => { comfyItem.style.backgroundColor = 'transparent'; };
    comfyItem.onclick = () => { imageMenuWrapper.style.display = 'none'; showComfyUIInpaintDialog(imgEl, buttonEl); closeDialog(); };

    // NovelAI 局部重绘
    const novelaiItem = doc.createElement('div');
    novelaiItem.className   = 'st-chatu8-image-process-item';
    novelaiItem.textContent = '🎨 NovelAI局部重绘';
    novelaiItem.style.cssText = menuItemStyle;
    novelaiItem.onmouseenter = () => { novelaiItem.style.backgroundColor = 'rgba(255,107,107,0.15)'; };
    novelaiItem.onmouseleave = () => { novelaiItem.style.backgroundColor = 'transparent'; };
    novelaiItem.onclick = () => { imageMenuWrapper.style.display = 'none'; showNovelAIInpaintDialog(imgEl, buttonEl); closeDialog(); };

    // Gork 生成视频
    const gorkItem = doc.createElement('div');
    gorkItem.className   = 'st-chatu8-image-process-item';
    gorkItem.textContent = '🎬 Gork生成视频';
    gorkItem.style.cssText = menuItemStyle;
    gorkItem.onmouseenter = () => { gorkItem.style.backgroundColor = 'rgba(255,107,107,0.15)'; };
    gorkItem.onmouseleave = () => { gorkItem.style.backgroundColor = 'transparent'; };
    gorkItem.onclick = () => { imageMenuWrapper.style.display = 'none'; showGorkVideoDialog(imgEl, buttonEl); closeDialog(); };

    // Banana 修图
    const bananaItem = doc.createElement('div');
    bananaItem.className   = 'st-chatu8-image-process-item';
    bananaItem.textContent = '🍌 Banana修图';
    bananaItem.style.cssText = menuItemStyle;
    bananaItem.onmouseenter = () => { bananaItem.style.backgroundColor = 'rgba(255,107,107,0.15)'; };
    bananaItem.onmouseleave = () => { bananaItem.style.backgroundColor = 'transparent'; };
    bananaItem.onclick = () => { imageMenuWrapper.style.display = 'none'; showBananaRetouchDialog(imgEl, buttonEl); closeDialog(); };

    imageMenuWrapper.appendChild(comfyItem);
    imageMenuWrapper.appendChild(novelaiItem);
    imageMenuWrapper.appendChild(gorkItem);
    imageMenuWrapper.appendChild(bananaItem);

    // 图像处理 ▼ 切换按钮
    const imageMenuToggle       = doc.createElement('button');
    imageMenuToggle.className   = 'st-chatu8-edit-button';
    imageMenuToggle.textContent = '图像处理 ▼';
    imageMenuToggle.style.cssText = 'display:inline-block;';
    imageMenuToggle.onclick = e => {
        e.stopPropagation();
        const vis = imageMenuWrapper.style.display === 'none';
        imageMenuWrapper.style.display = vis ? '' : 'none';
    };

    // ── 组装按钮行容器 ──
    const buttonRow = doc.createElement('div');
    buttonRow.className = 'st-chatu8-edit-buttons';
    buttonRow.style.cssText = 'position:relative;';

    const {passive: _passiveOpt} = {};
    doc.addEventListener('click', e => {
        if (!container.contains(e.target)) imageMenuWrapper.style.display = 'none';
    }, { passive: true });

    buttonRow.appendChild(imageMenuToggle);
    buttonRow.appendChild(imageMenuWrapper);

    // ── 组装按钮区第二行（翻译/修改/展开/发送/取消） ──
    const actionRow = doc.createElement('div');
    actionRow.className = 'st-chatu8-edit-buttons';
    actionRow.style.cssText = 'position:relative;';

    actionRow.appendChild(container);   // 实际代码将这些按钮加到 container 本身的子级
    // 按照混淆代码的 appendchild 顺序：
    // tagActionToggleBtn → tagActionArea → translateBtn → modifyTagBtn
    // → expandPresetBtn → buttonRow(imageMenu) → sendBtn → cancelBtn

    // ── 组装 inputEl 相关事件 ──
    inputEl.addEventListener('input', () => {
        const val = inputEl.value;
        const replaced = val.replace(/，/g, ',');
        if (val !== replaced) {
            const sel = inputEl.selectionStart;
            inputEl.value = replaced;
            inputEl.setSelectionRange(sel, sel);
        }
        handleAutocomplete(inputEl, autocompleteEl).then(() => { _repositionAutocomplete(); });
    });
    inputEl.addEventListener('keydown', e => e.stopPropagation());
    inputEl.addEventListener('focus', () => {
        setTimeout(() => {
            if (!autocompleteEl.matches(':empty')) {
                autocompleteEl.style.display = '';
                _repositionAutocomplete();
            }
        }, 50);
    });

    // ── 将所有元素加入 container ──
    container.appendChild(titleEl);
    container.appendChild(inputEl);
    // 按混淆代码顺序追加按钮行各元素
    const btnContainer = doc.createElement('div');
    btnContainer.className = 'st-chatu8-edit-button-area';
    btnContainer.style.cssText = 'position:relative; display:flex; flex-wrap:wrap; gap:6px;';
    btnContainer.appendChild(tagActionToggleBtn);
    btnContainer.appendChild(tagActionArea);
    btnContainer.appendChild(translateBtn);
    btnContainer.appendChild(modifyTagBtn);
    btnContainer.appendChild(expandPresetBtn);
    btnContainer.appendChild(imageMenuToggle);
    btnContainer.appendChild(imageMenuWrapper);
    btnContainer.appendChild(sendBtn);
    btnContainer.appendChild(cancelBtn);
    container.appendChild(btnContainer);
    container.appendChild(autocompleteEl);

    backdrop.appendChild(container);
    doc.body.appendChild(backdrop);
    inputEl.focus();

    // 自动调整 textarea 高度
    setTimeout(() => {
        inputEl.style.height = 'auto';
        inputEl.style.minHeight = (inputEl.scrollHeight + 2) + 'px';
    }, 100);

    function closeDialog() {
        backdrop.remove();
    }
}


// ─────────────────────────────────────────────
// 导出 3: calculateDialogDimensions
//
// 根据当前页面布局计算对话框可用的最大高度和顶部偏移。
// 在移动端贴底展示，桌面端贴顶部工具栏下方展示。
//
// @param {boolean} isMobile - 是否为移动端
// @returns {{ topMargin, maxHeight, shouldUseFullHeight }}
// ─────────────────────────────────────────────

export function calculateDialogDimensions(isMobile) {
    if (!isMobile) {
        return { topMargin: 0, maxHeight: '85vh', shouldUseFullHeight: false };
    }

    const doc = window.top.document;
    let topMargin       = 0;
    let availableHeight = window.innerHeight - 100;

    const topSettings = doc.querySelector('#top-settings');
    const sendForm    = doc.querySelector('#send_form');

    if (topSettings) {
        const rect = topSettings.getBoundingClientRect();
        topMargin  = rect.bottom - 10;
    } else if (sendForm) {
        topMargin = (sendForm.offsetHeight || 0) - 10;
    }

    const messageList = doc.querySelector('.mes_text');
    const configEl    = doc.querySelector('#ai-config');

    if (messageList) {
        const rect      = messageList.getBoundingClientRect();
        availableHeight = rect.bottom - topMargin - 10;
    } else if (configEl) {
        const rect      = configEl.getBoundingClientRect();
        availableHeight = rect.bottom - 10;
    }

    return {
        topMargin,
        maxHeight:           availableHeight + 'px',
        shouldUseFullHeight: true,
    };
}


// ─────────────────────────────────────────────
// 导出 4: createUnifiedDialog
//
// 创建统一样式的对话框（背景遮罩 + 内容区 + 标题），
// 返回 { backdrop, dialog, closeDialog }。
//
// @param {{ title, isMobile }} options
// ─────────────────────────────────────────────

export function createUnifiedDialog({ title, isMobile }) {
    const doc = window.top.document;

    // 移除已有的同类型遮罩
    doc.querySelector('.st-chatu8-edit-backdrop')?.remove();

    // 创建遮罩
    const backdrop = doc.createElement('div');
    backdrop.className = 'st-chatu8-edit-backdrop';

    // 创建对话框主体
    const dialog    = doc.createElement('div');
    dialog.className = 'st-chatu8-edit-dialog';
    dialog.style.position = 'relative';
    dialog.style.display  = 'flex';
    dialog.style.flexDirection = 'column';
    dialog.addEventListener('click', e => e.stopPropagation());

    // 根据设备类型计算尺寸
    const dims = calculateDialogDimensions(isMobile);
    if (isMobile) {
        backdrop.style.position = 'relative';
        dialog.style.top        = dims.topMargin + 'px';
        dialog.style.maxHeight  = dims.maxHeight;
        dialog.style.overflowY  = 'auto';
        dialog.style.overflowX  = 'hidden';
        dims.shouldUseFullHeight && (dialog.style.height = dims.maxHeight);
    } else {
        dialog.style.maxHeight  = dims.maxHeight;
        dialog.style.overflowY  = 'auto';
        dialog.style.overflowX  = 'hidden';
    }

    // 标题
    const titleEl       = doc.createElement('div');
    titleEl.className   = 'st-chatu8-edit-title';
    titleEl.textContent = title;
    dialog.appendChild(titleEl);

    const closeDialog = () => backdrop.remove();

    backdrop.appendChild(dialog);
    doc.body.appendChild(backdrop);

    return { backdrop, dialog, closeDialog };
}


// ─────────────────────────────────────────────
// 导出 5: createUnifiedInput
//
// 创建统一样式的 textarea 输入框。
//
// @param {{ placeholder, value, rows }} options
// @returns {HTMLTextAreaElement}
// ─────────────────────────────────────────────

export function createUnifiedInput({ placeholder = '', value = '', rows = 3 }) {
    const el       = document.createElement('textarea');
    el.className   = 'st-chatu8-edit-input';
    el.placeholder = placeholder;
    el.value       = value;
    el.rows        = rows;
    return el;
}


// ─────────────────────────────────────────────
// 导出 6: createButtonContainer
//
// 创建一行按钮容器，每个按钮的配置为 { text, className, onClick }。
//
// @param {Array<{text, className, onClick}>} buttons
// @returns {HTMLDivElement}
// ─────────────────────────────────────────────

export function createButtonContainer(buttons) {
    const container   = document.createElement('div');
    container.className = 'st-chatu8-edit-buttons';
    buttons.forEach(({ text, className, onClick }) => {
        const btn       = document.createElement('button');
        btn.className   = `st-chatu8-edit-button ${className}`;
        btn.textContent = text;
        btn.onclick     = onClick;
        container.appendChild(btn);
    });
    return container;
}


// ─────────────────────────────────────────────
// 内部工具函数（翻译流程辅助）
// ─────────────────────────────────────────────

/** 去除括号包裹和末尾的权重数字，提取纯净 tag key */
function cleanTag(tag) {
    return tag
        .replace(/^[\{\[\(\<]+|[\}\]\)\>]+$/g, '')
        .replace(/^\{+|\}+$/g, '')
        .replace(/:[\d.]+$/, '')
        .trim();
}

/** 分割逗号（支持 $..$ 转义块内的逗号不被切割） */
function splitCommas(str) {
    const result = [];
    let   cur    = '';
    let   inEsc  = false;
    for (const ch of str) {
        if (ch === '$') { inEsc = !inEsc; cur += ch; }
        else if (ch === ',' && !inEsc) { const t = cur.trim(); if (t) result.push(t); cur = ''; }
        else cur += ch;
    }
    const last = cur.trim();
    if (last) result.push(last);
    return result;
}

/** 分割包含坐标语法的提示词中的 tag 列表 */
function splitTags(str) {
    return splitCommas(str);
}

/** 判断是否为特殊转义标签（$..$ 格式） */
function isSpecialTag(tag) {
    return tag.startsWith('$') && tag.endsWith('$');
}
