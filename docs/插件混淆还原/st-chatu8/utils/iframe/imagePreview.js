// ============================================================
// imagePreview.js — 图片/视频预览模块
//
// 职责：
//   提供全屏图片/视频预览弹窗，支持多图缩略图切换、下载、
//   删除，以及视频源的 blob 化处理。
//
// 导出：
//   downloadBlob(blob, filename)   — 通用 Blob 下载
//   showImagePreview(mediaEl, buttonEl) — 弹出预览弹窗
// ============================================================

import { getItemImg, updateImageIndex, deleteImage, getItemBlob, dbs } from '../database.js';
import { showEditDialog }                from './dialogs.js';
import { createAndShowImage, triggerGeneration } from './generation.js';
import { fixMp4Faststart }              from '../utils.js';


// ─────────────────────────────────────────────
// 内部辅助：将 base64 data URL 转为 BlobURL 并设置到 video 元素
//
// 1. 解析 data URL → Uint8Array 分块 → Blob
// 2. 用 fixMp4Faststart 修复 MP4 moov atom 位置
// 3. 创建 BlobURL，赋值给 videoEl.src
// 4. 若 onCanPlayCallback 存在，则注册 canplay 事件一次性触发
//
// @param {HTMLVideoElement} videoEl
// @param {string}           dataUrl   — data:video/mp4;base64,... 或 BlobURL
// @param {string}           [onCanPlayCallback] — 可选，canplay 后执行
// ─────────────────────────────────────────────

async function applyVideoSrc(videoEl, dataUrl, onCanPlayCallback = '') {
    // 先释放旧的 BlobURL
    if (videoEl.src && videoEl.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoEl.src);
    }

    try {
        // 将 base64 data URL 解码为 Blob（分块处理，避免大文件内存溢出）
        const parts      = dataUrl.split(',');
        const mimeType   = dataUrl.slice(5, dataUrl.indexOf(';'));
        const base64Data = dataUrl.slice(parts[0].length + 1);
        const chunkSize  = 512 * 1024; // 512KB per chunk
        const chunks     = [];

        for (let i = 0; i < base64Data.length; i += chunkSize) {
            const chunkB64  = base64Data.slice(i, i + chunkSize);
            const decoded   = atob(chunkB64);
            const uint8     = new Uint8Array(decoded.length);
            for (let j = 0; j < decoded.length; j++) {
                uint8[j] = decoded.charCodeAt(j);
            }
            chunks.push(uint8);
            // 每 10 块 yield 一次，防止阻塞
            if ((chunks.length % 10) === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        const rawBlob    = new Blob(chunks, { type: mimeType });
        const fixedBlob  = await fixMp4Faststart(rawBlob);
        const blobUrl    = URL.createObjectURL(fixedBlob);

        videoEl.dataset['blobUrl'] = blobUrl;
        videoEl.src = blobUrl;

        if (onCanPlayCallback) {
            const handler = function () {
                videoEl.removeEventListener('canplay', handler);
                if (onCanPlayCallback && videoEl.src !== onCanPlayCallback) {
                    console.log('[imagePreview] BlobURL applied, original src:', onCanPlayCallback);
                    videoEl.src = onCanPlayCallback;
                }
            };
            videoEl.addEventListener('canplay', handler);
        }
    } catch (err) {
        console.warn('[imagePreview] VideoSrc 失败，回退:', err);
        videoEl.src = onCanPlayCallback || dataUrl;
    }
}


// ─────────────────────────────────────────────
// 导出 1: downloadBlob
//
// 创建临时 <a> 标签触发 Blob 文件下载。
// 使用 window.top 的 document / URL，以支持在 iframe 中调用。
//
// @param {Blob}   blob
// @param {string} filename
// ─────────────────────────────────────────────

export async function downloadBlob(blob, filename) {
    const doc = window.top.document;
    const URL = window.top.URL;

    if (!URL) {
        console.error('[imagePreview] window.top.URL is not available.');
        toastr.error('浏览器不支持下载功能。');
        return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const a       = doc.createElement('a');
    a.href              = blobUrl;
    a.download          = filename;
    a.style.display     = 'none';
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);

    setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
    }, 30000);
}


// ─────────────────────────────────────────────
// 导出 2: showImagePreview
//
// 弹出全屏图片/视频预览弹窗。
//
// 弹窗结构：
//   overlay（全屏遮罩）
//   └─ dialog（内容区）
//       ├─ closeBtn（关闭 ×）
//       ├─ mainArea（主预览区：左箭头 + 主图/视频 + 右箭头）
//       ├─ actionBar（操作栏：下载 + 删除）
//       └─ thumbnailRow（缩略图行）
//
// @param {HTMLElement} mediaEl   - 当前图像/视频元素（用于定位来源按钮）
// @param {HTMLElement} buttonEl  - 触发按钮（含 dataset.uuid / link / imageTag）
// ─────────────────────────────────────────────

export function showImagePreview(mediaEl, buttonEl) {
    const doc      = window.top.document;
    const uuid     = buttonEl.dataset['uuid'];

    // ── 注入样式（全局只注一次） ──
    const STYLE_ID = 'st-chatu8-image';
    if (!doc.querySelector(`#${STYLE_ID}`)) {
        const style   = doc.createElement('style');
        style.id      = STYLE_ID;
        style.innerHTML = `
            .st-chatu8-preview-container {
                position: fixed;
                top: 0; left: 0;
                width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.95);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 40px;
                box-sizing: border-box;
                backdrop-filter: blur(10px);
            }
            .st-chatu8-preview-dialog {
                display: flex;
                flex-direction: column;
                width: 100vw;
                height: 100dvh;
                position: fixed;
                top: 0; left: 0;
                background: #1a1a2e;
            }
        `;
        doc.head.appendChild(style);
    }

    // ── 创建覆盖层 ──
    const overlay = doc.createElement('div');
    overlay.className = 'st-chatu8-preview-container';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.95);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        z-index: 10000;
        padding: 40px;
        box-sizing: border-box;
    `;

    // ── 创建对话框（内容区） ──
    const dialog = doc.createElement('div');
    dialog.className = 'st-chatu8-preview-dialog';
    dialog.addEventListener('click', e => e.stopPropagation());
    dialog.style.cssText = `
        display: flex; flex-direction: column;
        width: 100vw;
        height: 100dvh;
        position: fixed; top: 0; left: 0;
        padding: 0;
        box-sizing: border-box;
        background: #1a1a2e;
        overflow: hidden;
    `;

    // ── 关闭按钮 ──
    const closeBtn = doc.createElement('div');
    closeBtn.className  = 'st-chatu8-preview-close';
    closeBtn.innerHTML  = '&times;';
    closeBtn.onclick    = () => {
        // 清理所有 BlobURL
        dialog.querySelectorAll('video,img').forEach(el => {
            if (el.src && el.src.startsWith('blob:')) {
                window.top.URL.revokeObjectURL(el.src);
            }
        });
        dialog.querySelectorAll('img').forEach(el => {
            if (el.src && el.src.startsWith('blob:')) {
                window.top.URL.revokeObjectURL(el.src);
            }
        });
        overlay.remove();
    };

    // ── 导航栏（标题/计数） ──
    const navbar = doc.createElement('div');
    navbar.className = 'st-chatu8-preview-navbar';
    navbar.style.cssText = `
        display: flex; align-items: center; justify-content: center;
        width: 100%; height: 36px;
        background: rgba(0, 0, 0, 0.5);
        color: #fff;
        font-size: 12px;
        z-index: 10001;
        filter: blur(0);
        backdrop-filter: blur(5px);
        background: rgba(255, 255, 255, 0.1);
    `;
    navbar.textContent = '生成图片';

    // ── 主显示区样式（供左右按钮共用） ──
    const navBtnStyle = `
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 50%;
        height: 100%;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        z-index: 10001;
        transition: all 0.3s ease;
        box-shadow: 0 0 0 rgba(0, 0, 0, 0.2);
        user-select: none;
        font-size: 14px; font-weight: bold;
        background: rgba(255, 255, 255, 0.2);
    `;

    // ── 左箭头按钮 ──
    const prevBtn = doc.createElement('div');
    prevBtn.className   = 'st-chatu8-preview-action-button';
    prevBtn.innerHTML   = '&#10094;';
    prevBtn.style.cssText = navBtnStyle + 'left: 0;';
    prevBtn.onmouseenter = () => { prevBtn.style.transform = 'translateY(-50%) scale(1.1)'; };
    prevBtn.onmouseleave = () => { prevBtn.style.transform = navBtnStyle; };
    prevBtn.onclick = () => {
        gotoIndex(((currentIndex - 1) + blobs.length) % blobs.length);
    };

    // ── 右箭头按钮 ──
    const nextBtn = doc.createElement('div');
    nextBtn.className   = 'st-chatu8-preview-action-button';
    nextBtn.innerHTML   = '&#10095;';
    nextBtn.style.cssText = navBtnStyle + 'right: 0;';
    nextBtn.onmouseenter = () => { nextBtn.style.transform = 'translateY(-50%) scale(1.1)'; };
    nextBtn.onmouseleave = () => { nextBtn.style.transform = navBtnStyle; };
    nextBtn.onclick = () => {
        gotoIndex((currentIndex + 1) % blobs.length);
    };

    // ── 主预览容器（放置主图或视频） ──
    const mainContainer = doc.createElement('div');
    mainContainer.className = 'st-chatu8-preview-large-wrapper';
    mainContainer.style.cssText = `
        position: relative;
        width: 100%; flex: 1 1 auto;
        overflow: hidden;
    `;

    // 主图区（用于图片显示）
    const mainImageArea = doc.createElement('div');
    mainImageArea.className = 'st-chatu8-preview-large-image';
    mainImageArea.style.cssText = `
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
    `;
    mainContainer.appendChild(mainImageArea);

    // ── 操作栏（下载 + 删除） ──
    const actionBar  = doc.createElement('div');
    actionBar.style.cssText = `
        display: flex; align-items: center; justify-content: center;
        width: 100%; flex-shrink: 0;
        gap: 6px;
        padding: 5px;
    `;

    // 下载按钮
    const downloadBtn = doc.createElement('button');
    downloadBtn.textContent = '下载当前媒体';
    downloadBtn.className   = 'st-chatu8-preview-action-button';
    downloadBtn.onclick = async () => {
        try {
            toastr.info('正在准备下载...');
            const blob = await getItemBlob(uuid, currentIndex);
            if (blob) {
                const imgData   = imageData[currentIndex];
                const ext       = imgData && imgData['isVideo'] ? 'mp4' : 'png';
                const safeName  = uuid.replace(/[^a-z0-9]/gi, '_').slice(0, 20)
                                  + '-' + currentIndex + '.' + ext;
                await downloadBlob(blob, safeName);
            } else {
                toastr.error('无法加载图片数据进行下载。');
                console.error('[imagePreview] Could not find media blob for download.');
            }
        } catch (err) {
            toastr.error('下载过程中发生错误。');
            console.error('[imagePreview] Error during download:', err);
        }
    };

    // 删除按钮
    const deleteBtn = doc.createElement('button');
    deleteBtn.textContent = '删除当前图片';
    deleteBtn.className   = 'st-chatu8-preview-action-button';
    actionBar.appendChild(downloadBtn);
    actionBar.appendChild(deleteBtn);

    // ── 缩略图行 ──
    const thumbnailRow = doc.createElement('div');
    thumbnailRow.className = 'st-chatu8-preview-thumbnail-container';
    thumbnailRow.style.cssText = `
        display: flex; align-items: center; justify-content: center;
        flex-direction: row;
        width: 100%; overflow-x: hidden;
        gap: 5px; padding: 6px 0;
    `;

    // 组装 dialog
    dialog.appendChild(closeBtn);
    dialog.appendChild(navbar);
    dialog.appendChild(mainContainer);
    dialog.appendChild(actionBar);
    dialog.appendChild(thumbnailRow);
    overlay.appendChild(dialog);
    doc.body.appendChild(overlay);

    // ── 状态变量 ──
    let blobs        = [];  // 当前所有图片的 Blob 对象
    let imageData    = [];  // 对应的 isVideo 等元数据
    let currentIndex = 0;
    let mainMedia    = null; // 当前主显示媒体元素

    // ── 删除逻辑 ──
    deleteBtn.onclick = async () => {
        if (!window.top.confirm('确定要删除这张图片吗？')) return;

        const targetUuid  = uuid;
        const targetIndex = currentIndex;
        await deleteImage(targetUuid, targetIndex);
        toastr.success('图片已删除');

        // 用 CryptoJS MD5 重新查询剩余图片
        const hash     = CryptoJS['MD5'](targetUuid)['toString']();
        const result   = await dbs['getMergedAndSortedImages'](hash);

        if (result['images']['length'] === 0) {
            // 没有剩余图片：移除原始 DOM 元素并关闭弹窗
            const srcEl  = mediaEl.closest('.st-chatu8-image-container');
            const conEl  = mediaEl.closest('.st-chatu8-image-con' + 'tainer');
            if (srcEl) srcEl.remove();
            else if (conEl) conEl.remove();

            if (buttonEl) {
                buttonEl.style.display = 'none';
                buttonEl.textContent   = '生成图片';
                buttonEl.disabled      = false;
            }
            overlay.remove();
            return;
        }

        // 还有剩余图片：重建 blobs/imageData，重新渲染缩略图
        imageData = result['images'].map(img => ({ isVideo: img['isVideo'] || false }));

        const blobJobs = result['images'].map(async (img) => {
            const isVid = img['isVideo'] || false;
            if (img['source'] === 'server' && img['path']) {
                try {
                    const resp = await fetch(img['path']);
                    if (resp.ok) return await resp.blob();
                } catch (e) { console.warn('[imagePreview] Failed to fetch media from server:', e); }
            } else if (img['source'] === 'db' && img['uuid']) {
                const record = await dbs['storeReadOnly'](img['uuid']);
                if (record && record['data']) {
                    const mime = isVid ? 'video/mp4' : 'image/png';
                    return new Blob([record['data']], { type: mime });
                }
            }
            return null;
        });
        const allBlobs  = await Promise.all(blobJobs);
        const validIdxs = [];
        blobs = allBlobs.filter((b, i) => {
            if (b !== null) { validIdxs.push(i); return true; }
            return false;
        });
        imageData = validIdxs.map(i => imageData[i]);

        // 清理旧缩略图 BlobURLs
        thumbnailRow.querySelectorAll('img,video').forEach(el => {
            if (el.src && el.src.startsWith('blob:')) {
                window.top.URL.revokeObjectURL(el.src);
            }
        });
        thumbnailRow.innerHTML = '';

        // 重新生成缩略图及主图
        const thumbJobs = validIdxs.map(idx => result['images'][idx]);
        const thumbResults = await Promise.all(thumbJobs.map(async (img, ti) => {
            const isVid = img['isVideo'] || false;
            if (isVid) {
                if (img['source'] === 'server' && img['serverPath']) {
                    try {
                        const r = await fetch(img['serverPath']);
                        if (r.ok) return await r.blob();
                    } catch (e) { console.warn('[imagePreview] etch video for thumbnail:', e); }
                }
                if (img['thumbnail_uuid']) {
                    const tb = await dbs['getImageThumbnailBlob'](img['thumbnail_uuid']);
                    if (tb) return tb;
                }
                return console.warn('[imagePreview] No thumbnail available for video', ti), null;
            }
            return blobs[ti];
        }));

        thumbResults.forEach((b, i) => {
            const thumb = doc.createElement('img');
            b
                ? (thumb.src = window.top.URL.createObjectURL(b))
                : (thumb.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3QgdmlkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvc3ZnPg==',
                  thumb.alt  = 'Video');
            thumb.className = 'st-chatu8-preview-thumbnail';
            thumb.dataset['index'] = String(i);
            thumb.onclick = () => gotoIndex(i);
            thumbnailRow.appendChild(thumb);
        });

        // 更新当前 index（保证不越界）
        let newIdx = currentIndex;
        if (newIdx >= blobs.length) newIdx = blobs.length - 1;
        gotoIndex(newIdx);

        // 刷新来源按钮显示
        const [newData, newChangeData,, newIsVideoFlag, newOrigUrl] = await getItemImg(targetUuid, newIdx);
        if (newData) {
            const newIsVideo = (newIsVideoFlag === true);
            const isTagType  = (mediaEl['tagName'] === 'VIDEO');
            if (newIsVideo !== isTagType) {
                // 类型发生变化，用 createAndShowImage 替换原元素
                const wrapEl = mediaEl.closest('.st-chatu8-image-container') || mediaEl.closest('.st-chatu8-image-con' + 'tainer');
                const parent = wrapEl?.parentElement || null;
                if (parent) {
                    createAndShowImage(parent, newData, 'generateImage', buttonEl, newChangeData, newIsVideoFlag, newOrigUrl || '');
                }
            } else {
                // 同类型：直接更新 src
                if (mediaEl['tagName'] === 'VIDEO' && newData.startsWith('data:')) {
                    applyVideoSrc(mediaEl, newData, newOrigUrl || '');
                } else {
                    mediaEl.src = newData;
                }
            }
        }
    };

    // ── 主切换函数 ──
    async function gotoIndex(idx) {
        if (idx < 0 || idx >= blobs.length) return;

        currentIndex = idx;
        navbar.textContent = `${currentIndex + 1} / ${blobs.length}`;

        // 更新箭头显示（只有多图时才显示）
        const hasMultiple = blobs.length > 1;
        prevBtn.style.display = hasMultiple ? '' : 'none';
        nextBtn.style.display = hasMultiple ? '' : 'none';

        // 释放上一个主媒体 BlobURL
        if (mainMedia) {
            if (mainMedia.src && mainMedia.src.startsWith('blob:')) {
                window.top.URL.revokeObjectURL(mainMedia.src);
            }
            mainMedia.remove();
        }

        const blob      = blobs[idx];
        const blobUrl   = window.top.URL.createObjectURL(blob);
        const isVid     = imageData[idx]?.['isVideo'];

        if (isVid) {
            // ── 视频播放元素 ──
            mainMedia = doc.createElement('video');
            mainMedia.src          = blobUrl;
            mainMedia.autoplay     = true;
            mainMedia.controls     = true;
            mainMedia.muted        = true;
            mainMedia.loop         = true;
            mainMedia.playsInline  = true;
            mainMedia.style.cssText = `
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                border-radius: 8px;
            `;
            mainMedia.onerror = function () {
                // 视频格式不支持时显示下载链接
                console.error('[imagePreview] Preview video failed');
                const errDiv = doc.createElement('div');
                errDiv.style.cssText = `
                    display: flex; align-items: center; justify-content: center;
                    flex-direction: column;
                    width: 100%; min-height: 200px;
                    background: linear-gradient(135deg, #0%, #16213e 100%);
                    border-radius: 8px; padding: 20px;
                    text-align: center;
                `;
                errDiv.innerHTML = `
                    <div style="font-size: 64px; margin: 0 auto">🎬</div>
                    <div style="margin: 15px; opacity: 0.8;">视频格式不支持浏览器播放</div>
                    <a href="${blobUrl}" download="video.mp4"
                       style="background: rgba(255,255,255,0.2); padding: 12px 24px;
                              border-radius: 4px; color: #fff; text-decoration: none;">
                        📥 下载视频
                    </a>
                `;
                errDiv.className       = 'st-chatu8-preview-large-image';
                errDiv.dataset['index'] = String(idx);
                if (mainMedia?.parentNode) {
                    mainMedia.parentNode.replaceChild(errDiv, mainMedia);
                    mainMedia = errDiv;
                }
            };
            mainImageArea.appendChild(mainMedia);
        } else {
            // ── 图片元素 ──
            mainMedia = doc.createElement('img');
            mainMedia.src       = blobUrl;
            mainMedia.className = 'st-chatu8-preview-large-image-item';
            mainMedia.style.cssText = `
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                border-radius: 8px;
            `;
            mainMedia.dataset['index'] = String(idx);
            mainImageArea.appendChild(mainMedia);
        }

        // 高亮当前缩略图
        const thumbEls = thumbnailRow.querySelectorAll('.st-chatu8-preview-thumbnail, .st-chatu8-preview-thumbnail-container img');
        thumbEls.forEach((el, i) => {
            if (i === idx) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        // 将当前缩略图滚动到视图中
        if (thumbEls[idx]) {
            thumbEls[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }

    // ── 主流程：初始化（IIFE 异步） ──
    (async () => {
        const hash     = CryptoJS['MD5'](uuid)['toString']();
        const result   = await dbs['getMergedAndSortedImages'](hash);

        if (result['images']['length'] === 0) return;

        // 构建 imageData 元数据
        imageData = result['images'].map(img => ({ isVideo: img['isVideo'] || false }));

        // 异步加载所有 Blob（按 source 分流）
        const blobJobs = result['images'].map(async img => {
            const isVid = img['isVideo'] || false;
            if (img['source'] === 'server' && img['path']) {
                try {
                    const resp = await fetch(img['path']);
                    if (resp.ok) return await resp.blob();
                } catch (e) {
                    console.warn('[imagePreview] Failed to fetch media from server', e);
                }
            } else if (img['source'] === 'db' && img['uuid']) {
                const record = await dbs['storeReadOnly'](img['uuid']);
                if (record && record['data']) {
                    const mime = isVid ? 'video/mp4' : 'image/png';
                    return new Blob([record['data']], { type: mime });
                }
            }
            return null;
        });

        const allBlobs  = await Promise.all(blobJobs);
        const validIdxs = [];
        blobs = allBlobs.filter((b, i) => {
            if (b !== null) { validIdxs.push(i); return true; }
            return false;
        });
        imageData = validIdxs.map(i => imageData[i]);

        if (blobs.length === 0) return;

        // ── 生成缩略图 ──
        // 对视频用 thumbnail blob，对图片直接用主 Blob
        const thumbJobs = validIdxs.map(vi => result['images'][vi]);
        const thumbResults = await Promise.all(thumbJobs.map(async (img, ti) => {
            const isVid = img['isVideo'] || false;
            if (isVid) {
                if (img['source'] === 'server' && img['serverPath']) {
                    try {
                        const r = await fetch(img['serverPath']);
                        if (r.ok) return await r.blob();
                    } catch (e) { console.warn('[imagePreview] fetch video for thumbnail', e); }
                }
                if (img['thumbnail_uuid']) {
                    const tb = await dbs['getImageThumbnailBlob'](img['thumbnail_uuid']);
                    if (tb) return tb;
                }
                return console.warn('[imagePreview] No thumbnail available for video', ti), null;
            }
            return blobs[ti];
        }));

        thumbResults.forEach((b, i) => {
            const thumb = doc.createElement('img');
            if (b) {
                thumb.src = window.top.URL.createObjectURL(b);
            } else {
                // 占位 SVG（视频无缩略图时）
                thumb.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3QgdmlkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvc3ZnPg==';
                thumb.alt = 'Video';
            }
            thumb.className      = 'st-chatu8-preview-thumbnail';
            thumb.dataset['index'] = String(i);
            thumb.onclick        = () => gotoIndex(i);
            thumbnailRow.appendChild(thumb);
        });

        // ── 确定初始 index ──
        // 从触发该预览的缩略图元素读取 data-index
        const triggerEl = mediaEl.closest('.st-chatu8-image-container, .st-chatu8-preview-thumbnail')
                        || mediaEl;
        const rawIdx    = triggerEl?.dataset?.['index'];
        const startIdx  = rawIdx !== undefined
                          ? Math.min(parseInt(rawIdx, 10), blobs.length - 1)
                          : 0;

        // 定位到起始 index
        gotoIndex(startIdx >= 0 ? startIdx : blobs.length - 1);

        // 通知 generation.js 当前 imageIndex
        updateImageIndex(uuid, currentIndex);

        // ── 更新来源元素（触发点击的原始图片/视频） ──
        const [imgData, changeData,, isVideoFlag, origUrl] = await getItemImg(uuid, currentIndex);
        if (imgData) {
            const isVid  = (isVideoFlag === true);
            const elIsVid = (mediaEl['tagName'] === 'VIDEO');
            if (isVid !== elIsVid) {
                const wrapEl = mediaEl.closest('.st-chatu8-image-container');
                const conEl  = mediaEl.closest('.st-chatu8-image-con' + 'tainer');
                const parent = wrapEl?.parentElement || conEl?.parentElement;
                if (parent) {
                    createAndShowImage(parent, imgData, 'generateImage', buttonEl, changeData, isVideoFlag, origUrl || '');
                }
            } else {
                if (mediaEl['tagName'] === 'VIDEO' && imgData.startsWith('data:')) {
                    applyVideoSrc(mediaEl, imgData, origUrl || '');
                } else {
                    mediaEl.src = imgData;
                }
            }
        }
    })();
}
