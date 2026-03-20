// ============================================================
// iframe 图像按钮插入模块
// 负责：在聊天消息的 DOM 中查找图像标签并插入生成按钮
// ============================================================

import { eventSource, saveChatConditional } from '../../../../../../script.js';
import { extension_settings } from '../../../../../extensions.js';
import { getContext } from '../../../../../st-context.js';
import { extensionName } from '../config.js';
import { getItemImg } from '../database.js';
import { fuzzyMatchLine, removeThinkingTextOnly } from '../imageInserter.js';
import { getcharData, setcharData } from '../promptReq.js';
import { showEditDialog } from './dialogs.js';
import { createAndShowImage, triggerGeneration } from './generation.js';
import { findNodeAtPosition, generateElKey, generateStableId } from './utils.js';

// ─────────────────────────────────────────────
// 辅助：读取插件设置中配置的图像标签
// ─────────────────────────────────────────────

function getImageTags() {
  const settings = extension_settings[extensionName];
  const startTag = settings?.startTag || '###'; // 默认值 '###'（混淆数组中解码得到）
  const endTag = settings?.endTag || '###';
  return { startTag, endTag };
}

// ─────────────────────────────────────────────
// 辅助：从带有 startTag/endTag 包裹的标签字符串中
//       提取纯净的内部内容
// ─────────────────────────────────────────────

function extractPureTag(tagString, startTag, endTag) {
  if (!tagString) return tagString;

  // 转义特殊字符，构建正则
  const escapedStart = startTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = endTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedStart + '(.+?)' + escapedEnd);
  const match = tagString.match(regex);

  if (match) return match[1].trim();
  return tagString;
}

// ─────────────────────────────────────────────
// 导出 1: getSavedImageMatches
//
// 在聊天消息的文本内容中查找与已保存图像记录匹配的位置，
// 返回需要插入按钮的 { content, insertPosition } 列表。
//
// @param {string}      rawText       - 消息的原始文本（含换行）
// @param {Element}     element       - 消息对应的 DOM 元素
// @param {string}      processedText - 去除 <think> 标签后的处理文本
// @param {number}      searchOffset  - 插入位置搜索偏移量（默认 0）
// @returns {Promise<Array<{content, insertPosition}>>}
// ─────────────────────────────────────────────

export async function getSavedImageMatches(rawText, element, processedText, searchOffset = 0) {
  const matches = [];

  try {
    // 如果已经有 ai-image-container，说明已处理完毕，直接返回空数组
    const existingContainer = element.querySelector('.ai-image-container');
    if (existingContainer) return matches;

    const offset = searchOffset > 0 ? searchOffset : 0;
    const cleanedText = removeThinkingTextOnly(processedText || rawText);

    // ── 路径 A：该元素有 data-message-index，从 context.chat 读取图像记录 ──
    if (element?.dataset?.['messageIndex']) {
      let messageIndexStr = element.getAttribute('data-message-index');
      if (!messageIndexStr) {
        // 尝试从父元素获取
        const parent = element.closest?.('.mes')?.parentElement;
        messageIndexStr = parent?.getAttribute('data-message-index');
      }

      if (messageIndexStr) {
        const messageIndex = parseInt(messageIndexStr, 10);
        const context = getContext();

        if (context.chat && context.chat[messageIndex]) {
          // 当前 swipe 的图像列表
          const swipeId = context.chat[messageIndex].extra?.swipe_id ?? 0;
          const imageGroup = context.chat[messageIndex].extra?.images?.[swipeId];

          if (Array.isArray(imageGroup) && imageGroup.length > 0) {
            const { startTag, endTag } = getImageTags();

            for (const imgRecord of imageGroup) {
              // 判断 tag 字段是否已经包含了开始/结束标签
              const hasWrappedTag = imgRecord.tag.includes(startTag) && imgRecord.tag.includes(endTag);
              // 构建用于搜索的完整标签字符串
              const searchTag = hasWrappedTag ? imgRecord.tag : '' + startTag + imgRecord.tag + endTag;
              // 判断是否已经存在于原始文本 / 处理后文本中
              const existsInRaw = hasWrappedTag ? rawText.includes(searchTag) : cleanedText.includes(searchTag);
              // 提取纯净内容（去掉包裹的 startTag/endTag）
              const pureTag = hasWrappedTag
                ? (() => {
                    const es = startTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const ee = endTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const m = imgRecord.tag.match(new RegExp(es + '(.+?)' + ee));
                    return m ? m[1].trim() : imgRecord.tag;
                  })()
                : imgRecord.tag;

              // 查找对应的 DOM 按钮是否已存在
              const existingButton = element.querySelector(
                `button.image-tag-button[data-link="${CSS.escape(pureTag)}"], ` +
                  `button.image-tag-button[data-image-tag="${CSS.escape(pureTag)}"]`,
              );

              // 如果按钮不存在 且 文本中也找不到该标签 → 用模糊匹配兜底
              if (!existingButton && !existsInRaw) {
                const fuzzyResult = fuzzyMatchLine(cleanedText, imgRecord.regex, 0.5);
                if (fuzzyResult) {
                  let insertPos = fuzzyResult.endIndex;
                  const matchedLine = fuzzyResult.matchedLine;
                  let foundIdx = rawText.indexOf(matchedLine, offset);

                  if (foundIdx === -1) foundIdx = rawText.indexOf(matchedLine);
                  if (foundIdx !== -1) insertPos = foundIdx + matchedLine.length;

                  matches.push({ content: imgRecord.tag, insertPosition: insertPos });
                }
              } else {
                // 已存在 → 直接用保存的 insertPosition
                matches.push({ content: imgRecord.tag, insertPosition: imgRecord.insertPosition });
              }
            }

            if (matches.length > 0) {
              console.log(`[iframe] Matched images from chat[${messageIndex}] swipe[${swipeId}]:`, matches.length);
            }
            return matches;
          }

          // ── imageGroup 不存在时：尝试从 charData 迁移 ──
          const charData = (await getcharData('props')) || {};
          const elKey = generateElKey(rawText);

          if (elKey && charData[elKey]) {
            const savedGroup = charData[elKey];

            // 确保 extra / extra.images 对象存在
            if (!context.chat[messageIndex].extra) {
              context.chat[messageIndex].extra = {};
            }
            if (!context.chat[messageIndex].extra.images) {
              context.chat[messageIndex].extra.images = {};
            }

            // 迁移：把 charData 里的记录写进 chat
            context.chat[messageIndex].extra.images[swipeId] = savedGroup;
            delete charData[elKey];
            await setcharData('props', charData);
            saveChatConditional();

            console.log(
              '[iframe] Migrated image group from charData to chat[' + messageIndex + '][' + swipeId + ']:',
              elKey,
            );

            const { startTag, endTag } = getImageTags();

            for (const imgRecord of savedGroup) {
              const hasWrappedTag = imgRecord.tag.includes(startTag) && imgRecord.tag.includes(endTag);
              const searchTag = hasWrappedTag ? imgRecord.tag : '' + startTag + imgRecord.tag + endTag;
              const existsInRaw = hasWrappedTag ? rawText.includes(searchTag) : cleanedText.includes(searchTag);
              const pureTag = hasWrappedTag
                ? (() => {
                    const es = startTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const ee = endTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const m = imgRecord.tag.match(new RegExp(es + '(.+?)' + ee));
                    return m ? m[1].trim() : imgRecord.tag;
                  })()
                : imgRecord.tag;

              const existingButton = element.querySelector(
                `button.image-tag-button[data-link="${CSS.escape(pureTag)}"], ` +
                  `button.image-tag-button[data-image-tag="${CSS.escape(pureTag)}"]`,
              );

              if (!existingButton && !existsInRaw) {
                const fuzzyResult = fuzzyMatchLine(cleanedText, imgRecord.regex, 0.5);
                if (fuzzyResult) {
                  let insertPos = fuzzyResult.endIndex;
                  const matchedLine = fuzzyResult.matchedLine;
                  let foundIdx = rawText.indexOf(matchedLine, offset);

                  if (foundIdx === -1) foundIdx = rawText.indexOf(matchedLine);
                  if (foundIdx !== -1) insertPos = foundIdx + matchedLine.length;

                  matches.push({ content: imgRecord.tag, insertPosition: insertPos });
                }
              } else {
                matches.push({ content: imgRecord.tag, insertPosition: imgRecord.insertPosition });
              }
            }

            if (matches.length > 0) {
              console.log('[iframe] Matched image group key:', elKey, '->', matches.length);
            }
            return matches;
          }
        }
      }
    }

    // ── 路径 B：无 messageIndex，从全局 charData 读取 ──
    const charData = (await getcharData('props')) || {};
    const elKey = generateElKey(rawText);

    if (!elKey) return matches;

    const savedGroup = charData[elKey];
    if (!Array.isArray(savedGroup) || savedGroup.length === 0) return matches;

    const { startTag, endTag } = getImageTags();

    for (const imgRecord of savedGroup) {
      const hasWrappedTag = imgRecord.tag.includes(startTag) && imgRecord.tag.includes(endTag);
      const searchTag = hasWrappedTag ? imgRecord.tag : '' + startTag + imgRecord.tag + endTag;
      const existsInRaw = hasWrappedTag ? rawText.includes(searchTag) : cleanedText.includes(searchTag);
      const pureTag = hasWrappedTag
        ? (() => {
            const es = startTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const ee = endTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const m = imgRecord.tag.match(new RegExp(es + '(.+?)' + ee));
            return m ? m[1].trim() : imgRecord.tag;
          })()
        : imgRecord.tag;

      const existingButton = element.querySelector(
        `button.image-tag-button[data-link="${CSS.escape(pureTag)}"], ` +
          `button.image-tag-button[data-image-tag="${CSS.escape(pureTag)}"]`,
      );

      // 不存在按钮 且 文本中也没有 → 加入待插入列表
      if (!existingButton && !existsInRaw) {
        matches.push({ content: imgRecord.tag, insertPosition: imgRecord.insertPosition });
      }
    }

    if (matches.length > 0) {
      console.log('[iframe] Matched (from charData):', elKey, '->', matches.length);
    }
  } catch (err) {
    console.error('[iframe] Error in getSavedImageMatches:', err);
  }

  return matches;
}

// ─────────────────────────────────────────────
// 导出 2: createButtonAtPosition
//
// 在 DOM 的指定文本位置插入一个"生成图片"按钮，
// 并在已有图像缓存时立即展示图像。
//
// @param {number}   insertPosition - 在文本中的字符偏移量
// @param {string}   tagContent     - 图像标签内容（可能带 startTag/endTag 包裹）
// @param {Array}    nodeList       - TreeWalker 产生的节点-偏移量映射表
// @param {Document} doc            - 所属 document
// @param {Element}  element        - 消息 DOM 元素
// @param {object}   settings       - 插件设置对象
// @param {boolean}  autoTrigger    - 是否自动触发生成（无缓存时）
// @param {string}   displayMode    - 图像显示模式（默认 'generateImage'）
// ─────────────────────────────────────────────

export async function createButtonAtPosition(
  insertPosition,
  tagContent,
  nodeList,
  doc,
  element,
  settings,
  autoTrigger,
  displayMode = 'generateImage',
) {
  const { startTag, endTag } = getImageTags();

  // 判断 tagContent 是否已经包含 startTag/endTag
  const hasWrappedTag = tagContent.includes(startTag) && tagContent.includes(endTag);
  // 提取纯净内容
  const pureTag = extractPureTag(tagContent, startTag, endTag);

  // 提取按钮前置文字（startTag 之前的部分，如果有的话）
  let prefixText = '';
  if (hasWrappedTag && pureTag !== tagContent) {
    const es = startTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ee = endTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(es + '.+?' + ee);
    const m = tagContent.match(regex);
    if (m) {
      const idx = tagContent.indexOf(m[0]);
      if (idx > 0) prefixText = tagContent.substring(0, idx);
    }
  }

  // 规范化标签：全角尖括号 → ASCII，去除换行
  const normalizedTag = pureTag.replaceAll('《', '<').replaceAll('》', '>').replace('\n', '');

  // 生成稳定 ID
  const stableId = generateStableId(normalizedTag);
  const markerAttr = 'tag-inserted-' + stableId;
  const attrKey = 'data-' + markerAttr;

  // ── 防重复检查 1：element 上已有该 attribute ──
  if (element.hasAttribute?.(attrKey)) {
    // 检查 DOM 中是否真的存在对应按钮
    const existingButton = element.querySelector(
      `button.image-tag-button[data-link="${CSS.escape(normalizedTag)}"], ` +
        `button.image-tag-button[data-image-tag="${CSS.escape(normalizedTag)}"]`,
    );
    if (existingButton) {
      console.log('[iframe] Button already inserted, skipping:', tagContent.substring(0, 30));
      element.setAttribute(attrKey, 'true'); // 刷新标记
      return null;
    } else {
      // attribute 存在但按钮丢失 → 清除 attribute，允许重新插入
      console.log('[iframe] Button attr exists but button not found, re-inserting:', tagContent.substring(0, 30));
      element.removeAttribute(attrKey);
    }
  }

  // ── 防重复检查 2：DOM 中已存在同标签按钮 ──
  const existingBtn = element.querySelector(
    `button.image-tag-button[data-link="${CSS.escape(normalizedTag)}"], ` +
      `button.image-tag-button[data-image-tag="${CSS.escape(normalizedTag)}"]`,
  );
  if (existingBtn) {
    console.log(
      '[iframe] Button already exists:',
      normalizedTag.substring(0, 20),
      'loading:',
      existingBtn.getAttribute('data-loading'),
    );
    element.hasAttribute?.(attrKey) && element.setAttribute(attrKey, 'true');
    return null;
  }

  // ── 定位目标文本节点 ──
  const targetNode = findNodeAtPosition(nodeList, insertPosition);
  if (!targetNode) {
    console.warn('[iframe] Could not find target node for position:', insertPosition);
    return null;
  }

  // 设置 element 上的标记 attribute
  element.hasAttribute?.(attrKey) && element.setAttribute(attrKey, 'pending');

  // ── 创建按钮元素 ──
  const button = doc.createElement('button');
  button.className = 'image-tag-button';
  button.textContent = '生成图片'; // "Generate Image"
  button.dataset.link = normalizedTag;
  button.dataset.stableId = stableId;
  button.dataset['imageTag'] = normalizedTag;

  // 长按状态追踪
  let longPressTimer = null;
  let isLongPress = false;
  const LONG_PRESS_MS = 500;

  // mousedown / touchstart → 启动长按计时器
  const onPressStart = e => {
    // 只响应主键 / 单指
    if (e.type === 'mousedown' && e.button !== 0) return;
    if (e.type === 'touchstart' && e.touches.length !== 1) return;

    isLongPress = false;
    longPressTimer = setTimeout(() => {
      isLongPress = true;
      longPressTimer = null;
      e.preventDefault();
      e.stopPropagation();
      // 长按 → 打开编辑对话框
      if (settings.longPressTime === 'true') {
        showEditDialog(null, button);
      }
    }, LONG_PRESS_MS);
  };

  // mouseup / touchend / mouseleave 等 → 清除计时器
  const onPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  // click → 如果是长按则拦截，否则触发生成
  button.addEventListener('click', e => {
    if (isLongPress) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    triggerGeneration(button);
  });

  button.addEventListener('mousedown', onPressStart);
  button.addEventListener('mouseup', onPressEnd);
  button.addEventListener('mouseleave', onPressEnd);
  button.addEventListener('touchstart', onPressStart);
  button.addEventListener('touchend', onPressEnd);
  button.addEventListener('touchcancel', onPressEnd);

  // ── 创建 span 占位符（用于标记插入位置） ──
  const span = doc.createElement('span');
  span.className = 'image-tag-placeholder';
  span.dataset.stableId = stableId;

  // ── 用 Range 在目标位置插入 span + button ──
  const range = doc.createRange();
  try {
    const { node: targetTextNode, start: nodeStart } = targetNode;
    const offsetInNode = insertPosition - nodeStart;

    if (targetTextNode.nodeType === Node.TEXT_NODE) {
      range.setStart(targetTextNode, offsetInNode);
      range.setEnd(targetTextNode, offsetInNode);
    } else {
      range.setStartBefore(targetTextNode);
      range.setEndBefore(targetTextNode);
    }

    range.insertNode(span);
    range.insertNode(button);

    // 如果有前置文本，插入一个 <p> 段落
    if (prefixText) {
      const textNode = doc.createTextNode(prefixText);
      const p = doc.createElement('p');
      p.appendChild(textNode);
      range.insertNode(p);
    }
  } catch (err) {
    console.error('[iframe] Error inserting button at position:', err);
    return null;
  }

  // ── 尝试从缓存加载已有图像 ──
  const [imageUrl, metadata, , width, height] = await getItemImg(normalizedTag);
  if (imageUrl) {
    createAndShowImage(span, imageUrl, displayMode, button, metadata, width, height);
    // 如果是"类数据库"模式 → 设置 CSS 自定义属性
    if (settings.dbclike === 'true') {
      button.style.setProperty('--display-mode', 'none', 'important');
    }
  } else if (autoTrigger) {
    // 无缓存 且 autoTrigger → 立即触发生成
    console.log('[iframe] Auto-triggering generation:', button);
    triggerGeneration(button);
  }

  return button;
}

// ─────────────────────────────────────────────
// 导出 3: findAndReplaceInElement
//
// 扫描整个消息 DOM 元素，找出所有图像标签并批量插入按钮。
// 这是主入口，由外部在消息渲染完成后调用。
//
// @param {Element} element     - 消息对应的 DOM 元素
// @param {string}  displayMode - 图像显示模式（默认 'generateImage'）
// ─────────────────────────────────────────────

export async function findAndReplaceInElement(element, displayMode = 'generateImage') {
  if (!element) return;

  // ── 重复处理检测：比较已存储的文本长度与当前长度 ──
  if (element.dataset && element.dataset['chatu8Processed'] === 'true') {
    const currentLength = element.textContent?.length ?? 0;
    const storedLength = parseInt(element.dataset['chatu8ContentLength'] || '0', 10);

    if (currentLength !== storedLength) {
      // 内容发生变化 → 清除处理标记，允许重新扫描
      const placeholder = element.querySelector('.ai-image-container');
      if (placeholder) return; // 已有容器 → 跳过

      console.log('[iframe] Element marked processed but content changed, re-processing:', {
        stored: storedLength,
        current: currentLength,
      });
      delete element.dataset['chatu8Processed'];
      delete element.dataset['chatu8ContentLength'];
    } else {
      // 内容未变，且有已插入的按钮 → 跳过
      const existingBtn = element.querySelector('button.image-tag-button[data-loading="true"]');
      if (existingBtn) {
        console.log('[iframe] Element already fully processed, skipping.');
        return;
      }
    }
  }

  // ── 读取插件设置，检查是否启用 ──
  const settings = extension_settings[extensionName];
  if (!settings.enabled || !settings.startTag) {
    console.warn('[iframe] Extension not enabled or startTag empty, skipping placeholder processing.');
    return;
  }

  // 判断是否使用 CodeMirror（日文输入法适配）
  const useCodeMirror = settings['ji'] === 'CodeMirror' && window['CodeMirror'];

  // 构建转义函数（用于将 startTag/endTag 转义为正则安全字符串）
  const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 构建匹配所有图像标签的正则（全局模式）
  const tagRegex = new RegExp(escapeRegex(settings.startTag) + '(.+?)' + escapeRegex(settings.endTag), 'g');

  // 获取消息内容的根节点（ownerDocument 或自身）
  const ownerDoc = element.ownerDocument || element;
  // 查找第一个 <div>（用于排除 placeholder 等辅助元素）
  const firstDiv = element.querySelector('div');
  firstDiv && console.log('[placeholder] Exclude first <div> from processing:', firstDiv.textContent?.substring(0, 30));

  // ── 用 TreeWalker 遍历所有文本节点和 BR 节点 ──
  //    同时收集 rawText（完整文本）和节点位置映射表（nodeList）
  let placeholderStart = -1; // placeholder <div> 在文本中的起始位置
  let placeholderEnd = -1; // placeholder <div> 在文本中的结束位置
  const nodeList = []; // [{ node, start, end }]
  let rawText = '';

  // 需要跳过的标签名集合
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'SELECT', 'OPTION', 'TEXTAREA', 'CODE']);

  // 含特定类名/属性则跳过整个子树
  const SKIP_CLASSES = [
    'image-tag-button',
    'st-chatu8-image',
    'ai-image-container',
    'image-tag-placeholder',
    'CodeMirror',
    'image-tag-container',
  ];

  const walker = ownerDoc.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const parent = node.parentElement;
      const parentTag = parent?.tagName;

      // 接受所有 BR 元素（换行用）
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
        return NodeFilter.FILTER_ACCEPT;
      }

      // 跳过特定标签的子树
      if (SKIP_TAGS.has(parentTag)) {
        return NodeFilter.FILTER_REJECT;
      }

      // 跳过含特定类名 / ID 的元素子树
      if (parent?.classList.contains('image-tag-button') || parent?.id.includes('st-chatu8-image')) {
        return NodeFilter.FILTER_REJECT;
      }

      // 跳过含特定 class 属性值的元素
      if (parent?.className && typeof parent.className === 'string') {
        for (const cls of SKIP_CLASSES) {
          if (parent.className.includes(cls)) {
            return NodeFilter.FILTER_REJECT;
          }
        }
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let currentNode;
  while ((currentNode = walker.nextNode())) {
    const currentPos = rawText.length;
    let nodeText = '';

    if (currentNode.nodeType === Node.TEXT_NODE) {
      nodeText = currentNode.textContent;
    } else if (currentNode.tagName === 'BR') {
      nodeText = '\n';
    }

    // 记录 placeholder <div> 的范围
    if (firstDiv && nodeText.length > 0) {
      const isInPlaceholder = currentNode === firstDiv || firstDiv.contains(currentNode);
      if (isInPlaceholder) {
        if (placeholderStart === -1) placeholderStart = currentPos;
        placeholderEnd = currentPos + nodeText.length;
      }
    }

    rawText += nodeText;
    nodeList.push({ node: currentNode, start: currentPos, end: rawText.length });
  }

  // ── 剔除 placeholder 范围，得到用于匹配的有效文本 ──
  let matchText = rawText;
  if (firstDiv && placeholderStart !== -1 && placeholderEnd > placeholderStart) {
    const before = rawText.substring(0, placeholderStart);
    const after = rawText.substring(placeholderEnd);
    matchText = before + after;
    console.log(
      '[placeholder] Excluded first <div> from processing (removed',
      placeholderEnd - placeholderStart,
      'chars)',
    );
  }

  // ── 在 rawText 中找出所有正则匹配的图像标签 ──
  const patternMatches = [];
  let regexResult;
  while ((regexResult = tagRegex.exec(rawText)) !== null) {
    patternMatches.push({
      fullMatch: regexResult[0],
      content: regexResult[1],
      startIndex: regexResult.index,
      endIndex: regexResult.index + regexResult[0].length,
      isPatternMatch: true,
    });
  }

  // ── 从保存的记录中也找出匹配位置 ──
  const savedMatches = await getSavedImageMatches(rawText, element, matchText, placeholderEnd > 0 ? placeholderEnd : 0);

  // 如果两者都为空，则无需处理
  if (patternMatches.length === 0 && savedMatches.length === 0) return;

  // ── 处理 savedMatches：按插入位置降序，逐个调用 createButtonAtPosition ──
  const pendingPromises = [];
  const autoTriggerQueue = [];
  const sortedSavedMatches = [...savedMatches].sort((a, b) => b.insertPosition - a.insertPosition);

  for (const savedMatch of sortedSavedMatches) {
    const promise = createButtonAtPosition(
      savedMatch.insertPosition,
      savedMatch.content,
      nodeList,
      ownerDoc,
      element,
      settings,
      false, // savedMatches 不自动触发
      displayMode,
    );
    pendingPromises.push(promise);
  }

  // ── 处理 patternMatches：按索引降序（从后往前插入，避免偏移问题）──
  for (let i = patternMatches.length - 1; i >= 0; i--) {
    const pm = patternMatches[i];

    // 找出该匹配在哪个节点范围内
    const coveringNodes = nodeList.filter(n => pm.startIndex < n.end && pm.endIndex > n.start);
    if (coveringNodes.length === 0) continue;

    const firstCovering = coveringNodes[0];
    const lastCovering = coveringNodes[coveringNodes.length - 1];
    const firstNodeText = firstCovering.node.textContent;

    const range = ownerDoc.createRange();
    try {
      // 计算在第一个覆盖节点中的偏移
      const startOffset = pm.startIndex - firstCovering.start;

      if (firstCovering.node.nodeType === Node.TEXT_NODE) {
        const textLen = firstCovering.node.textContent?.length ?? 0;
        if (textLen === 0 || startOffset > textLen) {
          console.warn('[iframe] startOffset out of bounds:', {
            startOffset,
            textLen,
            match: pm,
          });
          continue;
        }
        range.setStart(firstCovering.node, startOffset);
      } else {
        range.setStartBefore(firstCovering.node);
      }

      // 计算在最后一个覆盖节点中的偏移
      const lastNode = lastCovering.node;
      const endOffset = pm.endIndex - lastCovering.start;

      if (lastNode.nodeType === Node.TEXT_NODE) {
        const lastTextLen = lastNode.textContent?.length ?? 0;
        if (lastTextLen === 0 || endOffset > lastTextLen) {
          console.warn('[iframe] endOffset out of bounds:', {
            endOffset,
            lastTextLen,
            match: pm,
          });
          continue;
        }
        range.setEnd(lastNode, endOffset);
      } else {
        range.setEndAfter(lastNode);
      }
    } catch (err) {
      console.error('[iframe] Error setting range:', err, pm);
      continue;
    }

    // 删除原始标签文本
    range.deleteContents();

    // 规范化内容
    const normalizedContent = pm.content.replaceAll('《', '<').replaceAll('》', '>').replace('\n', '');
    const stableId = generateStableId(normalizedContent);
    const markerAttr = 'tag-inserted-' + stableId;
    const attrKey = 'data-' + markerAttr;

    // 防重复：attribute 存在时检查按钮是否真实存在
    if (element.hasAttribute?.('te') && element.hasAttribute?.(attrKey)) {
      const existingButton = element.querySelector(
        `button.image-tag-button[data-link="${CSS.escape(normalizedContent)}"]`,
      );
      if (existingButton) {
        console.log('[iframe] Button already exists with button tag:', normalizedContent.substring(0, 20));
        continue;
      } else {
        console.log('[iframe] Attr exists but button missing, re-inserting:', normalizedContent.substring(0, 20));
        element.removeAttribute(attrKey);
      }
    }

    // 检查 DOM 中是否已有按钮
    const existingBtn = element.querySelector(
      `button.image-tag-button[data-image-tag="${CSS.escape(normalizedContent)}"]`,
    );
    if (existingBtn) {
      console.log(
        '[iframe] Button already exists:',
        normalizedContent.substring(0, 20),
        'loading:',
        existingBtn.getAttribute('data-loading'),
      );
      element.hasAttribute?.('te') && element.setAttribute(attrKey, 'true');
      continue;
    }

    // 设置已处理标记
    element.hasAttribute?.(attrKey) && element.setAttribute(attrKey, 'true');

    // 创建新按钮
    const newButton = ownerDoc.createElement('button');
    newButton.className = 'image-tag-button';
    newButton.textContent = '生成图片';
    newButton.dataset.link = normalizedContent;
    newButton.dataset.stableId = stableId;
    newButton.dataset['imageTag'] = normalizedContent;

    // 长按逻辑（与 createButtonAtPosition 相同）
    let longPressTimer2 = null;
    let isLongPress2 = false;
    const LONG_PRESS_MS2 = 500;

    const onPressStart2 = e => {
      if (e.type === 'mousedown' && e.button !== 0) return;
      if (e.type === 'touchstart' && e.touches.length !== 1) return;

      isLongPress2 = false;
      longPressTimer2 = setTimeout(() => {
        isLongPress2 = true;
        longPressTimer2 = null;
        e.preventDefault();
        e.stopPropagation();
        if (extension_settings[extensionName].longPressTime === 'true') {
          showEditDialog(null, newButton);
        }
      }, LONG_PRESS_MS2);
    };

    const onPressEnd2 = () => {
      if (longPressTimer2) {
        clearTimeout(longPressTimer2);
        longPressTimer2 = null;
      }
    };

    newButton.addEventListener('click', e => {
      if (isLongPress2) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      triggerGeneration(newButton);
    });

    newButton.addEventListener('mousedown', onPressStart2);
    newButton.addEventListener('mouseup', onPressEnd2);
    newButton.addEventListener('mouseleave', onPressEnd2);
    newButton.addEventListener('touchstart', onPressStart2);
    newButton.addEventListener('touchend', onPressEnd2);
    newButton.addEventListener('touchcancel', onPressEnd2);

    // 插入 span 占位符 + 按钮
    const span2 = ownerDoc.createElement('span');
    span2.className = 'image-tag-placeholder image-tag-container';
    span2.dataset.stableId = stableId;

    range.insertNode(span2);
    range.insertNode(newButton);

    // 异步：查缓存图像 / 加入自动触发队列
    const imagePromise = (async () => {
      const [imageUrl, metadata, , width, height] = await getItemImg(normalizedContent);
      if (imageUrl) {
        createAndShowImage(span2, imageUrl, displayMode, newButton, metadata, width, height);
        if (extension_settings[extensionName].dbclike === 'true') {
          newButton.style.setProperty('--display-mode', 'none', 'important');
        }
      } else if (useCodeMirror) {
        // CodeMirror 模式 → 加入自动触发队列
        autoTriggerQueue.push(newButton);
      }
    })();

    pendingPromises.push(imagePromise);
  }

  // ── 等待所有异步操作完成 ──
  Promise.allSettled(pendingPromises).then(() => {
    // 触发自动生成队列
    if (autoTriggerQueue.length > 0) {
      console.log('[iframe] Auto-triggering queued buttons:', autoTriggerQueue.length);
      for (const btn of autoTriggerQueue) {
        console.log('[iframe] Auto-triggering:', btn);
        triggerGeneration(btn);
      }
    }

    // 如果有自动点击任务 ID → 发送完成事件
    if (window['autoClickTaskId']) {
      eventSource.emit('st-chatu8:auto_click_complete', {
        taskId: window['autoClickTaskId'],
        success: true,
      });
      console.log('[iframe] Auto-click complete event emitted.');
    }
  });

  // ── 标记 element 已处理，并记录当前文本长度（用于下次变化检测）──
  if (element.dataset) {
    element.dataset['chatu8Processed'] = 'true';
    element.dataset['chatu8ContentLength'] = String(element.textContent?.length || 0);
  }
}
