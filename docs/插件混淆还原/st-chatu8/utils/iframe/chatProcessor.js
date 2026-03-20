// ============================================================
// chatProcessor.js — 聊天消息 DOM 处理模块
//
// 职责：
//   遍历页面中所有 .mes_text 元素和 <iframe> 元素，
//   按可见性/尺寸条件过滤后，调用 placeholder 模块注入
//   生图按钮，并为 iframe 内文档注入样式 + 触发按钮扫描。
//
// 导出：
//   processMesTextElements()  — 扫描所有 .mes_text 并注入按钮
//   processIframes()          — 扫描所有 <iframe> 并注入样式/按钮
// ============================================================

import { extension_settings }             from '../../../../../extensions.js';
import { extensionName, EventType }       from '../config.js';
import { checkSendBuClass }               from '../utils.js';
import { getItemImg }                     from '../database.js';
import {
    isElementVisible,
    isIframeVisible,
    generateStableId,
}                                         from './utils.js';
import { findAndReplaceInElement }        from './placeholder.js';
import { createAndShowImage, triggerGeneration } from './generation.js';
import { showEditDialog }                 from './dialogs.js';
import { injectButtonStyleToDocument }    from '../settings/buttonstyle.js';
import { injectFrameStyleToDocument }     from '../settings/framestyle.js';
import { injectCollapseStyleToDocument }  from '../settings/collapsestyle.js';
import { taskQueue, TaskType }            from '../taskQueue.js';
import { eventSource }                    from '../../../../../../script.js';


// ─────────────────────────────────────────────
// 导出 1: processMesTextElements
//
// 遍历页面中所有 class="mes_text" 的元素。
// 若插件未启用（scriptEnabled === false）或 checkSendBuClass()
// 返回 true，则直接跳过整个函数。
//
// 对每个元素：
//   - 若 zidongdianji（自动批量生图）未启动，且该元素不在视口内
//     → 跳过（continue）
//   - 否则调用 findAndReplaceInElement(element)，注入生图按钮
// ─────────────────────────────────────────────

export function processMesTextElements() {
    // 插件未启用 或 send 按钮正在处理中，直接返回
    if (!extension_settings[extensionName]['scriptEnabled'] || checkSendBuClass()) {
        return;
    }

    const mesTextEls  = document.getElementsByClassName('mes_text');
    const isAutoClick = window.zidongdianji === true;

    for (const el of mesTextEls) {
        // 非自动批量模式下，跳过不在视口内的元素
        if (!isAutoClick && !isElementVisible(el, 2000)) {
            continue;
        }
        findAndReplaceInElement(el);
    }
}


// ─────────────────────────────────────────────
// 导出 2: processIframes
//
// 遍历页面中所有 <iframe> 元素。
// 若插件未启用或 checkSendBuClass() 返回 true，直接返回。
//
// 对每个 iframe：
//   1. 非自动批量模式下，跳过不在视口内的 iframe
//   2. 尝试访问 iframe.contentDocument
//      - 若无法访问（跨域等），catch 并 console.warn
//   3. 若 contentDocument.body 存在：
//      a. 向 iframe 文档注入三类样式：
//           injectButtonStyleToDocument
//           injectFrameStyleToDocument
//           injectCollapseStyleToDocument
//      b. 获取 iframe 内的 defaultView（window）尺寸
//      c. 构建性能统计对象 stats
//      d. 用 _processNode 深度遍历 iframe body 内的所有 .mes_text 元素
//         （通过 :scope > div 逐层筛选，按可见性、尺寸条件过滤）
//      e. 对每个符合条件的叶子节点调用 findAndReplaceInElement
//
// 内部辅助函数（均为 processIframes 局部作用域）：
//   isInViewport(el)  — 判断元素是否在 iframe 视口内（含 margin 缓冲）
//   hasSize(el)       — 判断元素是否有非零尺寸且未被 hidden/none 隐藏
//   getTextLength(el) — 统计元素内所有文本节点的总字符数
//   processNode(el)   — 递归处理节点：过滤 → 调用 findAndReplaceInElement
// ─────────────────────────────────────────────

export function processIframes() {
    // 插件未启用 或 send 按钮正在处理中，直接返回
    if (!extension_settings[extensionName]['scriptEnabled'] || checkSendBuClass()) {
        return;
    }

    const iframeEls   = document.querySelectorAll('iframe');
    const isAutoClick = window.zidongdianji === true;

    iframeEls.forEach(iframeEl => {
        // 非自动批量模式下，跳过不在视口内的 iframe
        if (!isAutoClick && !isIframeVisible(iframeEl, 2000)) {
            return;
        }

        // ── 处理单个 iframe ──
        const processThisIframe = () => {
            try {
                const iDoc = iframeEl.contentDocument;
                if (!iDoc || !iDoc.body) return;

                // 注入样式
                injectButtonStyleToDocument(iDoc);
                injectFrameStyleToDocument(iDoc);
                injectCollapseStyleToDocument(iDoc);

                const iWin         = iDoc.defaultView;
                const viewHeight   = iWin?.innerHeight  || 0;
                const viewWidth    = iWin?.innerWidth   || 0;
                const MARGIN       = 0;      // 视口缓冲像素
                const MIN_CHARS    = 10;     // 最小文本字符数（太短则跳过）
                const MAX_CHARS    = 100000; // 最大文本字符数上限（异常大则跳过）

                // 性能/调试统计
                const stats = {
                    totalVisited:     0,
                    visibleElements:  0,
                    skippedHidden:    0,
                    skippedOutOfView: 0,
                    stoppedAtContent: 0,
                    leafProcessed:    0,
                    startTime:        performance.now(),
                };

                // ── 判断元素是否在 iframe 视口内 ──
                const isInViewport = el => {
                    if (!el || !el.getBoundingClientRect) return false;
                    const r       = el.getBoundingClientRect();
                    const inVert  = r.top >= -MARGIN  && r.bottom <= viewHeight + MARGIN;
                    const inHoriz = r.left >= -MARGIN && r.right  <= viewWidth  + MARGIN;
                    return inVert && inHoriz;
                };

                // ── 判断元素是否有实际尺寸且可见 ──
                const hasSize = el => {
                    if (!el || !el.getBoundingClientRect) return false;
                    const r = el.getBoundingClientRect();
                    // 宽高都为 0 → 不处理
                    if (r.width === 0 && r.height === 0) return false;
                    // CSS 隐藏检测
                    const cs = iDoc.defaultView?.getComputedStyle(el);
                    if (cs && (cs['visibility'] === 'hidden' || cs['display'] === 'none')) {
                        return false;
                    }
                    return true;
                };

                // ── 统计元素内文本节点总长度 ──
                const getTextLength = el => {
                    let len = 0;
                    for (const child of el.childNodes) {
                        if (child.nodeType === Node.TEXT_NODE) {
                            len += child.textContent.trim().length;
                        }
                    }
                    return len;
                };

                // ── 递归处理节点 ──
                const processNode = node => {
                    stats.totalVisited++;

                    // 无尺寸 → 跳过
                    if (!hasSize(node)) {
                        stats.skippedHidden++;
                        return;
                    }

                    // 非自动批量模式下，不在视口 → 跳过
                    if (!isAutoClick && !isInViewport(node)) {
                        stats.skippedOutOfView++;
                        return;
                    }

                    stats.visibleElements++;

                    // 文本长度检查
                    const textLen = node.textContent?.length || 0;
                    if (textLen < MIN_CHARS || textLen > MAX_CHARS) {
                        // 尝试检测该节点是否含有 mes_text 子节点
                        const mesChildren = node.querySelectorAll('.mes_text');
                        if (mesChildren.length > 0) {
                            // 有子 mes_text → 递归进入（不在此层处理）
                            stats.stoppedAtContent++;
                            for (const child of mesChildren) {
                                processNode(child);
                            }
                        } else {
                            stats.skippedBySize++;
                        }
                        return;
                    }

                    // 叶子节点或含内容的节点 → 注入按钮
                    stats.leafProcessed++;
                    findAndReplaceInElement(node);
                };

                // 从 iframe body 直接子 div 开始遍历
                const topDivs = iDoc.body.querySelectorAll(':scope > div');
                for (const div of topDivs) {
                    // 查找 div 内所有 mes_text
                    const mesEls = div.querySelectorAll('.mes_text');
                    if (mesEls.length > 0) {
                        for (const mel of mesEls) {
                            processNode(mel);
                        }
                    } else {
                        // 没有子 mes_text，直接当作候选节点处理
                        processNode(div);
                    }
                }
            } catch (err) {
                console.warn('无法访问 iframe:', err);
            }
        };

        // iframe 可能尚未加载完毕
        const readyState = iframeEl.contentDocument?.readyState;
        if (readyState === 'complete') {
            processThisIframe();
        } else {
            iframeEl.addEventListener('load', processThisIframe);
        }
    });
}
