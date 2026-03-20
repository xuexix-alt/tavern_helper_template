// ============================================================
// index.js — 插件入口模块 (st-chatu8)
//
// 职责：
//   1. 加载所有 CSS 样式
//   2. 异步加载第三方库（JSZip / CryptoJS / msgpack）
//   3. 合并 defaultSettings 与 extension_settings
//   4. 自动迁移旧版视频路径格式（.mp4 → idle/dragging）
//   5. 初始化 UI (initUI)、换行修复 (initializeNewlineFixer)
//   6. 注入设置按钮 (addNewElement)
//   7. 定时循环调用 chenk()（替换各平台图片生成按钮）
//   8. 启动时检查远端版本更新 (checkForUpdates)
//   9. check_update / update_extension：调用 ST 内置扩展更新 API
// ============================================================

import { extension_settings, extensionTypes } from '../../../extensions.js';
import {
    saveSettingsDebounced,
    eventSource,
    event_types,
    reloadCurrentChat,
    saveChatConditional,
    chat,
    messageFormatting,
    saveChat,
} from '../../../../script.js';
import { defaultSettings, extensionName, extensionFolderPath } from './utils/config.js';
import { replaceWithSd }        from './utils/sd.js';
import { replaceWithnovelai }   from './utils/novelai.js';
import { initUI }               from './utils/ui.js';
import { replaceWithBanana }    from './utils/banana.js';
import { checkSendBuClass }     from './utils/utils.js';
import { replaceWithcomfyui }   from './utils/comfyui.js';
import { initializeNewlineFixer } from './utils/newline_fix.js';
import { installGlobalErrorHandler } from './utils/errorCollector.js';


// ─────────────────────────────────────────────
// 动态加载第三方库
// 每个函数返回 Promise，成功后 resolve，失败则 reject
// ─────────────────────────────────────────────

function loadJSZip() {
    return new Promise((resolve, reject) => {
        const script  = document.createElement('script');
        script.src    = extensionFolderPath + '/jszip.min.js';
        script.onload = () => resolve();
        script.onerror = err => reject(err);
        document.head.appendChild(script);
    });
}

function loadcrypto() {
    return new Promise((resolve, reject) => {
        const script  = document.createElement('script');
        script.src    = extensionFolderPath + '/crypto-js.min.js';
        script.onload = () => resolve();
        script.onerror = err => reject(err);
        document.head.appendChild(script);
    });
}

function loadmsgpack() {
    return new Promise((resolve, reject) => {
        const script  = document.createElement('script');
        script.src    = extensionFolderPath + '/msgpack.min.js';
        script.onload = () => resolve();
        script.onerror = err => reject(err);
        document.head.appendChild(script);
    });
}


// ─────────────────────────────────────────────
// HTTP 工具
// ─────────────────────────────────────────────

function getRequestHeaders(csrfToken) {
    return {
        'X-CSRF-Token':  csrfToken,
        'Content-Type':  'application/json',
    };
}

/**
 * 将 extensionName 映射到 ST 的 extensionTypes 枚举值。
 * 支持精确匹配和 'third-party' 前缀前缀匹配。
 */
function getExtensionType(name) {
    const key = Object.keys(extensionTypes).find(
        k => k === name || (k.startsWith('third-party') && k.endsWith(name))
    );
    return key ? extensionTypes[key] : 'global';
}


// ─────────────────────────────────────────────
// 扩展更新相关
// ─────────────────────────────────────────────

/**
 * 调用 SillyTavern 内置 /api/extensions/update 接口触发更新。
 *
 * @param {string}  extName   — 扩展名
 * @param {boolean} isGlobal  — 是否为全局扩展
 * @returns {Response}
 */
async function update_extension(extName, isGlobal) {
    const body = {
        extensionName: extName,
        global:        isGlobal,
    };
    const response = await fetch('/api/extensions/update', {
        method:  'POST',
        headers: getRequestHeaders(token),
        body:    JSON.stringify(body),
    });
    return response;
}

/**
 * 触发插件自我更新，成功后弹出提示并 reload。
 */
async function check_update() {
    const isGlobal = getExtensionType(extensionName) === extensionTypes['global'] ? true : false;
    const onSuccess = () => {
        toastr.success('成功更新插件');
        console.log('成功更新插件');
        setTimeout(() => location.reload(), 2000);
    };

    const response = await update_extension(extensionName, isGlobal);
    if (response.ok) {
        const data = await response.json();
        if (data.isUpToDate) {
            toastr.success('插件是最新版本');
            console.log('插件是最新版本');
        } else {
            onSuccess();
        }
    } else {
        console.error('[st-chatu8] Extension update failed:', response.status);
    }
}


// ─────────────────────────────────────────────
// 定时调用：替换各平台按钮
//
// chenk() 被 setInterval 每 ~2000ms 调用一次。
// 若插件未启用或 send 按钮正忙，直接跳过。
// ─────────────────────────────────────────────

async function chenk() {
    if (
        !(extension_settings[extensionName]['scriptEnabled'] === true ||
          extension_settings[extensionName]['scriptEnabled'] === 'true') ||
        checkSendBuClass()
    ) {
        return;
    }

    replaceWithcomfyui();
    replaceWithBanana();
    replaceWithnovelai();
    replaceWithSd();
}


// ─────────────────────────────────────────────
// 版本更新检查
//
// 从远端 manifest.json 拉取最新版本号，与本地版本对比。
// 若有新版本，在设置面板中显示更新按钮和更新说明。
// ─────────────────────────────────────────────

async function checkForUpdates() {
    try {
        // 拉取远端 manifest（加时间戳防缓存）
        const remoteRes = await fetch(
            extensionFolderPath + '/manifest.json?t=' + new Date().getTime(),
            { cache: 'no-cache' }
        );
        if (!remoteRes.ok) throw new Error('Failed to fetch remote manifest');

        const remoteManifest = await remoteRes.json();
        const remoteVersion  = remoteManifest.version;

        // 拉取本地 manifest（防缓存）
        const localRes = await fetch(
            extensionFolderPath + '/manifest.json?t=' + new Date().getTime(),
            { cache: 'no-cache' }
        );
        if (!localRes.ok) throw new Error('Failed to fetch local manifest');

        const localManifest = await localRes.json();
        const localVersion  = localManifest.version;

        console.log(`[st-chatu8] Checking for updates: local=${localVersion}, remote=${remoteVersion}`);

        if (remoteVersion && localVersion && remoteVersion !== localVersion) {
            // 有新版本 — 在设置面板插入更新按钮
            const panel = document.querySelector('#option_toggle_AN88') ||
                          document.querySelector('.chatu8SettingsPanel');
            if (panel) {
                const existing = document.getElementById('chatu8UpdateBtn');
                if (!existing) {
                    const updateBtn  = document.createElement('div');
                    updateBtn.id     = 'chatu8UpdateBtn';
                    updateBtn.className = 'st-chatu8-update-banner';

                    const msgSpan      = document.createElement('span');
                    msgSpan.textContent = `New version available: ${remoteVersion} (current: ${localVersion})`;

                    const clickBtn      = document.createElement('button');
                    clickBtn.id         = 'ch-update-trigger';
                    clickBtn.textContent = '打开设置';
                    clickBtn.addEventListener('click', check_update);

                    const notesDiv      = document.createElement('div');
                    notesDiv.className  = 'chatu8-update-notes';
                    notesDiv.textContent = remoteManifest.notes || '';

                    updateBtn.appendChild(msgSpan);
                    updateBtn.appendChild(clickBtn);
                    updateBtn.appendChild(notesDiv);
                    panel.insertBefore(updateBtn, panel.firstChild);
                }
            }

            toastr.info(`New version ${remoteVersion} available!`);
        } else {
            console.log('[st-chatu8] Extension is up to date.');
        }
    } catch (err) {
        console.warn('[st-chatu8] Failed to fetch remote manifest for update check:', err);
    }
}


// ─────────────────────────────────────────────
// 注入 CSS 样式文件
//
// 通过动态创建 <link rel="stylesheet"> 加载，
// 每次附加时间戳防止浏览器缓存。
// ─────────────────────────────────────────────

function loadCSS(filename) {
    const link  = document.createElement('link');
    link.rel    = 'stylesheet';
    link.href   = extensionFolderPath + '/' + filename + '.css?' + new Date().getTime();
    document.head.appendChild(link);
}


// ─────────────────────────────────────────────
// 注入设置入口按钮
//
// 在 SillyTavern 顶部工具栏注入"打开文生图设置"按钮。
// 若已存在（id = chatu8_fab）则跳过，避免重复注入。
// ─────────────────────────────────────────────

function addNewElement() {
    const toolbar = document.querySelector('#top-settings');
    if (!toolbar) return;

    if (!document.getElementById('chatu8_fab')) {
        // 创建入口 <a> 按钮
        const fabLink     = document.createElement('a');
        fabLink.id        = 'chatu8_fab';

        const fabIcon     = document.createElement('i');
        fabIcon.className = 'fa-solid fa-lg fa-solid fa-note-sticky';
        fabLink.appendChild(fabIcon);

        const fabSpan         = document.createElement('span');
        fabSpan.setAttribute('data-i18n', '打开文生图设置');
        fabSpan.textContent   = '打开文生图设置';
        fabLink.appendChild(fabSpan);

        fabLink.className = 'st-chatu8-fab xbtns';
        fabLink.onclick   = () => {
            const panel = document.querySelector('#option_toggle_AN88');
            if (panel) panel.click();
        };

        // 插入到 toolbar 适当位置
        const nextEl = toolbar.querySelector('.fa-lg.fa-solid');
        if (nextEl && nextEl.parentNode) {
            nextEl.parentNode.insertBefore(fabLink, nextEl.nextSibling);
        } else {
            toolbar.appendChild(fabLink);
        }

        console.log('[st-chatu8] Settings button added.');
    }
}


// ─────────────────────────────────────────────
// 主入口
//
// SillyTavern 在扩展加载完成后会 import 此模块，
// 随即调用 main()。
// ─────────────────────────────────────────────

async function main() {
    // ── 加载所有 CSS ──
    const cssFiles = [
        'styles/main',
        'styles/forms',
        'styles/image_cache',
        'styles/idle.chatu8',         // 静息画面样式
        'styles/responsive',
        'styles/about',
        'styles/fab',
        'styles/modals',
        'styles/ai-assistant',
        'styles/font-awesome-custom', // 含 fa-note-sticky 等自定义图标
    ];
    cssFiles.forEach(loadCSS);

    console.log('[st-chatu8] Initializing...');

    // ── 合并设置（defaultSettings 为基底，用户保存的 extension_settings 覆盖） ──
    const merged = {
        ...JSON.parse(JSON.stringify(defaultSettings)),
        ...extension_settings[extensionName],
    };

    // ── 自动迁移旧版视频路径格式 ──
    // 旧版将视频路径存储为单一字符串；新版分拆为 idle / dragging 两个字段
    if (merged['chatu8_video_paths']) {
        let migrated = false;

        // 迁移 idle 路径
        if (merged['chatu8_video_paths']['idle'] &&
            merged['chatu8_video_paths']['idle'].includes('static')) {
            merged['chatu8_video_paths']['idle'] =
                merged['chatu8_video_paths']['idle']
                    .replace('.mp4', '')
                    .replace(/\/static\/.*$/, '/idle.chatu8');
            migrated = true;
        }

        // 迁移 dragging 路径
        if (merged['chatu8_video_paths']['dragging'] &&
            merged['chatu8_video_paths']['dragging'].includes('static')) {
            merged['chatu8_video_paths']['dragging'] =
                merged['chatu8_video_paths']['dragging']
                    .replace('.mp4', '')
                    .replace(/\/static\/.*$/, '/dragging.chatu8');
            migrated = true;
        }

        if (migrated) {
            console.log('[st-chatu8] 自动迁移旧版视频路径格式完成');
        }
    }

    // 写回合并后的设置
    extension_settings[extensionName] = merged;
    console.log('[st-chatu8] Settings loaded:', extension_settings[extensionName]);

    // ── 安装全局错误处理器 ──
    installGlobalErrorHandler();

    // ── 初始化 UI ──
    const uiCallbacks = { check_update };
    await initUI(uiCallbacks);

    // ── 初始化换行修复 ──
    initializeNewlineFixer();

    // ── 延迟注入设置入口按钮（等 DOM 完全就绪） ──
    setTimeout(addNewElement, 500);

    // ── 定时触发按钮替换（约 2s 一次） ──
    setInterval(chenk, 2000);

    // ── 检查远端版本更新 ──
    await checkForUpdates();
}


// ── 加载第三方库后启动主流程 ──
await loadJSZip().then(() => {
    console.log('[st-chatu8] Initializing..JSZip.');
});

await loadcrypto().then(() => {
    console.log('[st-chatu8] Initializing..CryptoJS.');
});

await loadmsgpack().then(() => {
    console.log('[st-chatu8] Initializing..msgpack.');
});

main();
