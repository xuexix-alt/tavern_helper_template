// ============================================================
// 图像渲染与生成触发模块 (generation.js)
// 负责：
//   1. 将图像/视频渲染到 DOM 中的占位符 span
//   2. 触发事件系统中的图像生成请求，并监听响应
// ============================================================

import { eventSource } from '../../../../../../script.js';
import { extension_settings } from '../../../../../extensions.js';
import { EventType, extensionName } from '../config.js';
import { getItemImg } from '../database.js';
import { startGenerating, stopGenerating } from '../generation_status.js';
import { addLog, addSmoothShakeEffect, fixMp4Faststart } from '../utils.js';
import { showEditDialog } from './dialogs.js';

// ─────────────────────────────────────────────
// 内部辅助：data URL → Blob
// 对大文件做分片 + yield，避免阻塞主线程
// ─────────────────────────────────────────────

async function _dataUrlToBlob(dataUrl) {
  const commaIndex = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, commaIndex); // e.g. "data:video/mp4;base64"
  const mimeType = header.slice(header.indexOf(':') + 1, header.indexOf(';'));
  const base64Data = dataUrl.slice(commaIndex + 1);
  const chunkSize = 512;
  const chunks = [];

  for (let i = 0; i < base64Data.length; i += chunkSize) {
    const slice = base64Data.slice(i, i + chunkSize);
    const decoded = atob(slice);
    const uint8 = new Uint8Array(decoded.length);

    for (let j = 0; j < decoded.length; j++) {
      uint8[j] = decoded.charCodeAt(j);
    }

    chunks.push(uint8);

    // 每积累 1000 个分片 yield 一次，释放主线程
    if (chunks.length % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return new Blob(chunks, { type: mimeType });
}

// ─────────────────────────────────────────────
// 模块级状态：图像预览回调
// ─────────────────────────────────────────────

let _showImagePreview = null;

export function setShowImagePreview(callback) {
  _showImagePreview = callback;
}

// ─────────────────────────────────────────────
// 导出 1: createAndShowImage
//
// 将图像或视频渲染到指定 span 占位符中。
// 如果设置了折叠模式，会在外层包裹折叠 UI。
//
// @param {Element}  spanEl       - 目标占位符 span（data-stable-id 对应）
// @param {string}   dataUrl      - 图像/视频的 data URL 或普通 URL
// @param {string}   displayMode  - 显示模式（如 'generateImage'）
// @param {Element}  buttonEl     - 对应的触发按钮元素（可为 null）
// @param {*}        changeData   - 图像变更元数据
// @param {boolean}  isVideo      - 是否为视频
// @param {string}   originalUrl  - 视频播放失败时的回退 URL
// ─────────────────────────────────────────────

export function createAndShowImage(
  spanEl,
  dataUrl,
  displayMode,
  buttonEl,
  changeData,
  isVideo = false,
  originalUrl = '',
) {
  const ownerDoc = spanEl.ownerDocument;
  if (!ownerDoc) return;

  // 创建外层容器 div
  const container = ownerDoc.createElement('div');
  container.className = 'ai-image-container';

  let mediaEl;

  if (isVideo) {
    // ── 视频路径 ──
    mediaEl = ownerDoc.createElement('video');
    mediaEl.controls = true;
    mediaEl.autoplay = true;
    mediaEl.loop = true;
    mediaEl.muted = true;
    mediaEl.playsInline = true;
    mediaEl.style.width = '100%';
    mediaEl.style.height = 'auto';
    mediaEl.dataset['type'] = 'video';
    mediaEl.preload = true;

    if (dataUrl.startsWith('data:')) {
      // data URL → 转换为 Blob URL，再走 MP4 faststart 修复
      _dataUrlToBlob(dataUrl)
        .then(blob => fixMp4Faststart(blob))
        .then(fixedBlob => {
          const blobUrl = URL.createObjectURL(fixedBlob);
          mediaEl.dataset['blobUrl'] = blobUrl;
          mediaEl.src = blobUrl;
        })
        .catch(err => {
          // Blob 转换失败 → 直接使用原始 data URL
          console.error('[createAndShowImage] Video blob error:', err);
          mediaEl.src = dataUrl;
        });
    } else {
      mediaEl.src = dataUrl;
    }

    // 视频播放失败 → 尝试 originalUrl 回退，再失败则展示下载链接
    mediaEl.onerror = function () {
      const errorCode = this.error?.code;
      console.warn(`[createAndShowImage] Video error: code=${errorCode} src=${this.src?.substring(0, 80)}`);

      if (originalUrl && this.src !== originalUrl) {
        console.log('[createAndShowImage] Trying original URL fallback:', originalUrl);
        this.src = originalUrl;
        return;
      }

      // 彻底失败 → 插入下载链接 fallback
      const errorDiv = ownerDoc.createElement('div');
      errorDiv.className = 'st-chatu8-image';
      errorDiv.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 10px;
                background: rgba(0,0,0,0.05);
                border-radius: 8px;
                font-size: 14px;
            `;

      const hintEl = ownerDoc.createElement('p');
      hintEl.textContent = '视频';
      hintEl.style.color = '#888';

      const linkEl = ownerDoc.createElement('a');
      const blobUrl = mediaEl.dataset['blobUrl'] || dataUrl;
      linkEl.href = blobUrl;
      linkEl.download = '视频';
      linkEl.textContent = '此环境中无法播放，请下载查看';
      linkEl.style.cssText = `
                background: transparent;
                border: 1px solid #aaa;
                border-radius: 4px;
                padding: 4px 8px;
                cursor: pointer;
                font-size: 13px;
                color: inherit;
            `;
      linkEl.onclick = e => e.stopPropagation();

      errorDiv.appendChild(hintEl);
      errorDiv.appendChild(linkEl);
      this.parentNode?.appendChild(errorDiv);
    };
  } else {
    // ── 图像路径 ──
    mediaEl = ownerDoc.createElement('img');
    mediaEl.src = dataUrl;
    mediaEl.style.width = '100%';
    mediaEl.style.height = 'auto';
  }

  // 将变更元数据写入按钮的 dataset（供后续二次生成用）
  if (changeData) {
    buttonEl.dataset.change = changeData ? changeData : '';
  }

  // ── 长按计时器状态 ──
  let holdTimer = null; // 单次点击延迟（触发预览）
  let longTimer = null; // 长按计时器（触发编辑对话框）
  let isLongPress = false;
  const HOLD_MS = 200; // 单次点击延迟
  const LONG_MS = 500; // 长按阈值

  // 决定监听对象：视频时用 overlay div，图像时直接用 mediaEl
  let interactionTarget;

  if (isVideo) {
    // 创建覆盖在视频上的透明 overlay，拦截所有点击/触摸事件
    const overlay = ownerDoc.createElement('div');
    overlay.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'z-index:1',
      'background:transparent',
    ].join(';');
    container.style.position = 'relative';
    container.overlayElement = overlay; // 保存引用
    interactionTarget = overlay;
  } else {
    interactionTarget = mediaEl;
  }

  // ── 事件处理：mousedown / touchstart → 启动计时器 ──
  const onPressStart = e => {
    if (e.type === 'mousedown' && e.button !== 0) return;
    if (e.type === 'touchstart' && e.touches.length !== 1) return;

    isLongPress = false;
    longTimer = setTimeout(() => {
      longTimer = null;
      isLongPress = true;
      // 长按 → 先取消 holdTimer（防止触发预览），再弹出编辑对话框
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (buttonEl && extension_settings[extensionName]['longPressTime'] === 'true') {
        showEditDialog(mediaEl, buttonEl);
      }
    }, LONG_MS);
  };

  // ── 事件处理：mouseup / click / touchend → 取消长按计时器 ──
  const onPressEnd = () => {
    if (longTimer) {
      clearTimeout(longTimer);
      longTimer = null;
    }
  };

  // ── 事件处理：click → 单击展开预览 ──
  const onClick = e => {
    if (e.type === 'mousedown' && e.button !== 0) return;
    if (e.type === 'touchstart' && e.touches.length !== 1) return;

    if (isLongPress) return; // 长按不触发点击

    if (holdTimer) {
      // 第二次点击到来 → 取消 holdTimer，判断为双击，触发生成
      clearTimeout(holdTimer);
      holdTimer = null;
      if (extension_settings[extensionName]['longPressTime'] === 'true' && buttonEl) {
        addSmoothShakeEffect(mediaEl);
        triggerGeneration(buttonEl);
      }
    } else {
      // 第一次点击 → 等待 HOLD_MS，若期间无第二次点击则触发预览
      holdTimer = setTimeout(() => {
        holdTimer = null;
        isLongPress = true;
        if (buttonEl && extension_settings[extensionName]['longPressTime'] === 'true') {
          if (_showImagePreview) _showImagePreview(mediaEl, buttonEl);
        }
      }, HOLD_MS);
    }
  };

  // 注册所有事件监听
  interactionTarget.addEventListener('click', onClick);
  interactionTarget.addEventListener('mousedown', onPressStart);
  interactionTarget.addEventListener('mouseup', onPressEnd);
  interactionTarget.addEventListener('mouseleave', onPressEnd);
  interactionTarget.addEventListener('touchstart', onPressStart, { passive: true });
  interactionTarget.addEventListener('touchend', onPressEnd);
  interactionTarget.addEventListener('touchcancel', onPressEnd);

  // 右键菜单 → 如果开启了 longPressToEdit，阻止默认右键菜单并拦截
  interactionTarget.addEventListener('contextmenu', e => {
    if (extension_settings[extensionName]['longPressToEdit'] === 'true') {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  container.appendChild(mediaEl);

  // 如果之前创建了 overlay，把它加到 container 上
  if (container.overlayElement) {
    container.appendChild(container.overlayElement);
    delete container.overlayElement;
  }

  // ── 折叠模式：如果设置为 'true'，包裹折叠 UI ──
  if (String(extension_settings[extensionName]?.['collapse']) === 'true') {
    // 折叠包裹容器
    const wrapper = ownerDoc.createElement('div');
    wrapper.className = 'st-chatu8-collapse-image';
    wrapper.dataset.type = isVideo ? 'video' : 'image';
    wrapper.dataset['collapsed'] = 'true';

    // 折叠按钮行
    const btnRow = ownerDoc.createElement('div');
    btnRow.className = 'st-chatu8-collapse-btn';

    const arrow = ownerDoc.createElement('span');
    arrow.className = 'st-chatu8-collapse-icon';
    arrow.textContent = '▼';

    const typeLabel = ownerDoc.createElement('span');
    typeLabel.className = 'st-chatu8-collapse-type';
    typeLabel.textContent = isVideo ? '📹 点击展开视频' : '📷 点击展开图片';

    const stateLabel = ownerDoc.createElement('span');
    stateLabel.className = 'st-chatu8-collapse-state';
    stateLabel.textContent = '已折叠';

    // 内容区包裹器（折叠时隐藏）
    const contentWrapper = ownerDoc.createElement('div');
    contentWrapper.className = 'st-chatu8-collapse-content';
    contentWrapper.appendChild(container);

    btnRow.appendChild(arrow);
    btnRow.appendChild(typeLabel);
    btnRow.appendChild(stateLabel);

    // 点击按钮行 → 切换折叠状态
    btnRow.addEventListener('click', e => {
      e.stopPropagation();
      const isCollapsed = wrapper.dataset['collapsed'] === 'true';
      if (isCollapsed) {
        // 展开
        wrapper.dataset['collapsed'] = 'false';
        stateLabel.textContent = '';
        typeLabel.textContent = isVideo ? '📹 点击折叠视频' : '📷 点击折叠图片';
      } else {
        // 折叠
        wrapper.dataset['collapsed'] = 'true';
        stateLabel.textContent = '已折叠';
        typeLabel.textContent = isVideo ? '📹 点击展开视频' : '📷 点击展开图片';
      }
    });

    wrapper.appendChild(btnRow);
    wrapper.appendChild(contentWrapper);

    // 替换 spanEl 为折叠包裹器
    spanEl.replaceWith(wrapper);
  } else {
    // 非折叠模式 → 直接替换 spanEl
    spanEl.replaceWith(container);
  }
}

// ─────────────────────────────────────────────
// 导出 2: triggerGeneration
//
// 当用户点击"生成图片"按钮时调用。
// 流程：
//   1. 防重入检查（同一标签是否正在生成）
//   2. 注册一次性响应监听器
//   3. 若本地缓存已有图像 → 直接展示，不发请求
//   4. 否则 → 发送 GENERATE_IMAGE_REQUEST 事件，启动生成
//
// @param {Element} buttonEl - 触发按钮元素（含 dataset.link, dataset.stableId 等）
// ─────────────────────────────────────────────

export const triggerGeneration = buttonEl => {
  // 防重入：按钮上已有 data-loading="true" 时跳过
  if (buttonEl.getAttribute('data-loading')) {
    addLog('[triggerGeneration] 图像生成请求已在进行中: ' + buttonEl.dataset['link']?.substring(0, 30));
    return;
  }

  const prompt = buttonEl.dataset['link']; // 图像提示词（纯净标签内容）
  const stableId = buttonEl.dataset['stableId']; // 稳定 ID，用于定位对应的 span 占位符

  // ── 一次性响应处理器 ──
  const onResponse = responseData => {
    // 过滤不属于本次请求的响应
    if (responseData.id !== stableId) return;

    console.log('[triggerGeneration] 收到响应:', responseData);

    // 销毁监听器
    eventSource.removeListener(EventType.GENERATE_IMAGE_RESPONSE, onResponse);
    addLog(`[triggerGeneration] 图像响应监听器已销毁 (stableId=${stableId})`);

    const {
      success,
      imageData,
      error,
      prompt: respondedPrompt,
      change: changeData,
      isVideo,
      originalUrl,
    } = responseData;

    // 停止生成状态
    if (respondedPrompt) stopGenerating(respondedPrompt);

    // 收集 document + 所有 iframe 的 contentDocument
    const allDocs = [
      document,
      ...Array.from(document.querySelectorAll('iframe'))
        .map(f => f.contentDocument)
        .filter(Boolean),
    ];

    allDocs.forEach(doc => {
      // 找所有 data-stable-id 匹配的 span 占位符
      const spans = doc.querySelectorAll(`span[data-stable-id="${stableId}"]`);
      // 找所有 data-stable-id 匹配的按钮
      const buttons = doc.querySelectorAll(`button.image-tag-button[data-stable-id="${stableId}"]`);

      if (spans.length <= 0) return;

      if (success) {
        addLog(
          `[triggerGeneration] ${isVideo ? '视频' : '图像'}生成成功 (stableId=${stableId}),` +
            ` 目标 span 数: ${spans.length}.`,
        );

        // 逐个 span 调用 createAndShowImage
        spans.forEach(span => {
          const prevButton = span.previousElementSibling;
          if (prevButton && prevButton.matches(`button.image-tag-button[data-stable-id="${stableId}"]`)) {
            // span 前有对应按钮 → 传入按钮
            createAndShowImage(span, imageData, 'Generated Image', prevButton, changeData, isVideo, originalUrl || '');
          } else {
            // 找不到按钮 → buttonEl 为 null
            createAndShowImage(span, imageData, 'Generated Image', null, changeData, isVideo, originalUrl || '');
          }
        });

        // 更新所有按钮状态
        buttons.forEach(btn => {
          btn.removeAttribute('data-loading');
          if (extension_settings[extensionName]['dbclike'] === 'true') {
            btn.style.setProperty('--display-mode', 'none', 'important');
          } else {
            btn.disabled = false;
            btn.textContent = '生成图片';
          }
        });
      } else {
        // 生成失败 → 提示错误，重置按钮
        addLog(`[triggerGeneration] 生成失败: ${stableId} → ${error}`);
        toastr.error('图像生成失败: ' + (error || '未知错误'));

        buttons.forEach(btn => {
          btn.removeAttribute('data-loading');
          btn.disabled = false;
          btn.textContent = '生成图片';
        });
      }
    });
  };

  // 注册响应监听器
  eventSource.on(EventType.GENERATE_IMAGE_RESPONSE, onResponse);
  addLog(`[triggerGeneration] 图像响应监听器已创建 (stableId=${stableId})`);

  // ── 先检查本地是否已有缓存图像 ──
  //    搜索范围：document + 所有 iframe contentDocument
  const allDocs = [
    document,
    ...Array.from(document.querySelectorAll('iframe'))
      .map(f => f.contentDocument)
      .filter(Boolean),
  ];

  // 检查任意 doc 中是否已存在匹配 span，且其前兄弟节点不是 .image-tag-button
  // （即已经被 createAndShowImage 替换过，说明图像已渲染）
  let alreadyRendered = false;
  for (const doc of allDocs) {
    const span = doc.querySelector(`span[data-stable-id="${stableId}"]`);
    if (span && span.closest('.ai-image-container, .st-chatu8-collapse-image')) {
      console.log('[triggerGeneration] span 已被替换为图像容器，说明图像已渲染，' + '重新触发生成...');
      alreadyRendered = true;
      break;
    }
  }

  if (alreadyRendered) {
    // 图像已渲染 → 直接调用 onResponse 触发逻辑（不再发送事件）
    _callGenerationCallback();
  } else {
    // 尝试从本地缓存加载
    getItemImg(prompt).then(([imageUrl, changeData, , width, height]) => {
      if (imageUrl) {
        // ── 命中缓存 → 直接展示，并向事件系统广播成功响应 ──
        addLog(`[triggerGeneration] 命中缓存 "${prompt}"，跳过生成，直接展示...`);

        for (const doc of allDocs) {
          const buttons = doc.querySelectorAll(`button.image-tag-button[data-stable-id="${stableId}"]`);
          for (const btn of buttons) {
            const span = btn.nextElementSibling;
            if (span && span.matches(`span[data-stable-id="${stableId}"]`)) {
              createAndShowImage(span, imageUrl, 'Generated Image', btn, changeData, width, imageUrl || '');
              btn.removeAttribute('data-loading');
              if (extension_settings[extensionName]['dbclike'] === 'true') {
                btn.style.setProperty('--display-mode', 'none', 'important');
              } else {
                btn.disabled = false;
                btn.textContent = '生成图片';
              }
            }
          }
        }

        // 广播成功响应事件，通知其他监听器
        eventSource.emit(EventType.GENERATE_IMAGE_RESPONSE, {
          id: stableId,
          success: true,
          imageData: imageUrl,
          prompt: prompt,
          change: changeData,
          width: width,
          isVideo: false,
          isCached: true,
        });
      } else {
        // ── 未命中缓存 → 发送生成请求 ──
        buttonEl.setAttribute('data-loading', 'true');
        buttonEl.textContent = '加载中...';
        startGenerating(prompt);

        // 构建请求载荷
        const payload = { id: stableId, prompt };
        const changeField = buttonEl.dataset['change'];
        const width = buttonEl.dataset['width'] || null;
        const height = buttonEl.dataset['height'] || null;
        payload.width = width;
        payload.height = height;

        if (changeField) {
          payload.change = changeField;

          // 如果 change 字段包含 blob: → 附带 videoPrompt 和 videoImage
          if (changeField.includes('blob:')) {
            payload.videoPrompt = buttonEl.dataset['videoPrompt'] || '';
            payload.videoImage = buttonEl.dataset['videoImage'] || '';
            // 清除 change 字段中的 blob URL（避免重复传输）
            buttonEl.dataset['change'] = buttonEl.dataset['change'].replaceAll('blob:', '');
          }

          // 如果 change 字段包含 data: → 同样附带 videoPrompt 和 videoImage
          if (changeField.includes('data:')) {
            payload.videoPrompt = buttonEl.dataset['videoPrompt'] || '';
            payload.videoImage = buttonEl.dataset['videoImage'] || '';
            buttonEl.dataset['change'] = buttonEl.dataset['change'].replaceAll('data:', '');
          }
        }

        // 发送生成请求事件
        eventSource.emit(EventType.GENERATE_IMAGE_REQUEST, payload);
        addLog(`[triggerGeneration] 图像生成请求已发送 (id=${payload.id})`);
      }
    });
  }

  // 占位（实际逻辑已在 getItemImg.then 内处理）
  function _callGenerationCallback() {
    // 当图像已渲染时，直接触发 onResponse 等价逻辑
    // （此处为简化，实际代码通过 _3a256c 闭包完成）
    onResponse({ id: stableId, success: true });
  }
};
