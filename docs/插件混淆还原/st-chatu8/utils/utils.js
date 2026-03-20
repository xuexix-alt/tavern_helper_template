// ============================================================
// utils.js — 通用工具函数模块
//
// 涵盖：
//   - URL / 类型检查
//   - SD WebUI API（鉴权、获取/切换模型）
//   - 延迟、睡眠、锁机制
//   - 对象深合并
//   - 图片处理（压缩、参考图缩放、base64 转换、JPEG 转换）
//   - MP4 faststart 修复
//   - 提示词处理（坐标解析、角色替换、去重）
//   - 日志、确认弹窗、样式工具
//   - 抖动特效
// ============================================================

import { extension_settings }                   from '../../../../extensions.js';
import { extensionName, EventType }             from './config.js';
import { setItemImg, getItemImg }               from './database.js';
import { saveSettingsDebounced, eventSource }   from '../../../../../script.js';


// ── 常量 ──────────────────────────────────────
const REFERENCE_PIXEL_COUNT  = 1024 * 1024;   // 参考像素基准（1M px）
const SIGMA_MAGIC_NUMBER      = 14.614;        // SD skip_cfg_above_sigma 魔数（通用）
const SIGMA_MAGIC_NUMBER_V4_5 = 15.0;         // SD skip_cfg_above_sigma 魔数（v4.5）


// ─────────────────────────────────────────────
// URL 验证
// ─────────────────────────────────────────────

export function isValidUrl(url) {
    if (!url || url.trim() === '') return true;   // 空字符串视为"有效"（不填也可）
    const re = /^(https?:\/\/)?(localhost|([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)*$/;
    return re.test(url);
}


// ─────────────────────────────────────────────
// 检查发送按钮是否正忙
//
// 返回 true 表示"发送中"，此时各替换函数应跳过。
// 同时检查 send_but 和 mes_stop 两个按钮的 display。
// ─────────────────────────────────────────────

export function checkSendBuClass() {
    const sendBtn  = document.getElementById('send_but');
    const stopBtn  = document.getElementById('mes_stop');
    const sendHidden = !sendBtn  || getComputedStyle(sendBtn)['display']  === 'none';
    const stopShown  =  stopBtn &&  getComputedStyle(stopBtn)['display'] !== 'none';
    return sendHidden || stopShown;
}


// ─────────────────────────────────────────────
// 内部：Base64 工具
// ─────────────────────────────────────────────

function stringToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const chars = Array.from(bytes, b => String.fromCodePoint(b)).join('');
    return btoa(chars);
}


// ─────────────────────────────────────────────
// SD WebUI 鉴权
// ─────────────────────────────────────────────

export function getsdAuth() {
    return 'Basic ' + stringToBase64(extension_settings[extensionName]['sd_auth'] || '');
}


// ─────────────────────────────────────────────
// SD WebUI：获取当前模型名称
//
// GET {baseUrl}/sdapi/v1/options
// @param {string} baseUrl
// @returns {string} checkpoint 名称
// ─────────────────────────────────────────────

export async function getSDMode(baseUrl) {
    try {
        const url = new URL(baseUrl);
        url.pathname = '/sdapi/v1/options';
        const res = await fetch(url, {
            method:  'GET',
            headers: { 'Authorization': getsdAuth() },
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`获取 SD 选项失败，状态码: ${res.status}\n${text}`);
        }
        const data  = await res.json();
        const model = data['sd_model_checkpoint'];
        addLog('当前 SD 模型：' + model);
        return model;
    } catch (err) {
        addLog('获取 SD 模型失败：' + err.message);
        throw err;
    }
}


// ─────────────────────────────────────────────
// SD WebUI：切换模型
//
// POST {baseUrl}/sdapi/v1/options  { sd_model_checkpoint: modelName }
// @param {string} baseUrl
// @param {string} modelName
// ─────────────────────────────────────────────

export async function setSDMode(baseUrl, modelName) {
    addLog('正在切换模型...为：' + modelName + '，模型: ' + modelName);
    try {
        const url = new URL(baseUrl);
        url.pathname = '/sdapi/v1/options';
        const res = await fetch(url, {
            method:  'POST',
            headers: {
                'Authorization': getsdAuth(),
                'Content-Type':  'application/json',
            },
            body: JSON.stringify({ sd_model_checkpoint: modelName }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`切换模型失败: ${res.status}\n${text}`);
        }
        // 等待模型加载
        addLog('切换 SD 模型 API 调用成功，等待模型加载... model loaded: ' + modelName);
        return await res.json();
    } catch (err) {
        addLog('切换模型失败: ' + err.message);
        throw err;
    }
}


// ─────────────────────────────────────────────
// 延迟工具
// ─────────────────────────────────────────────

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// ─────────────────────────────────────────────
// 对象类型检查（内部）
// ─────────────────────────────────────────────

function isObject(val) {
    return val && typeof val === 'object' && !Array.isArray(val);
}


// ─────────────────────────────────────────────
// 深合并两个对象
//
// 以 target 为基础，source 的属性递归覆盖。
// 遇到嵌套对象时递归合并；遇到数组时直接覆盖。
// ─────────────────────────────────────────────

export function deepMerge(target, source) {
    let result = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (key in target) {
                    result[key] = deepMerge(target[key], source[key]);
                } else {
                    result[key] = source[key];
                }
            } else {
                result[key] = source[key];
            }
        });
    }
    return result;
}


// ─────────────────────────────────────────────
// 内部：从 URL / File / base64 加载 Image 元素
// ─────────────────────────────────────────────

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img    = new Image();
        img.onload   = () => resolve(img);
        img.onerror  = () => reject(new Error('图片加载失败'));
        if (src instanceof File) {
            img.src = URL.createObjectURL(src);
        } else if (typeof src === 'string') {
            img.src = src;
        }
    });
}


// ─────────────────────────────────────────────
// 处理参考图片
//
// 1. 加载图片
// 2. 如果图片尺寸超过限制（面积 > REFERENCE_PIXEL_COUNT），按比例缩小
// 3. 用 Canvas 绘制并导出为 image/png base64 data URL
// 4. 返回 base64 字符串（不含 data:image/png;base64, 前缀）
//
// @param {string|File|Blob} src
// @returns {string} base64
// ─────────────────────────────────────────────

export async function processReferenceImage(src) {
    addLog('开始处理参考图...');
    try {
        const img    = await loadImage(src);
        let { width, height } = img;
        addLog('参考图原始尺寸: ' + width + ' x ' + height);

        const pixelCount = width * height;
        if (pixelCount > REFERENCE_PIXEL_COUNT) {
            const ratio = Math.sqrt(REFERENCE_PIXEL_COUNT / pixelCount);
            width  = Math.floor(width  * ratio);
            height = Math.floor(height * ratio);
            addLog('正在缩放参考图..., 比例: ' + ratio.toFixed(3));
        }

        const canvas = new OffscreenCanvas(width, height);
        const ctx    = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const blob   = await canvas.convertToBlob({ type: 'image/png' });
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onload  = e => {
                const dataUrl = e.target.result;
                const base64  = dataUrl.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        addLog('参考图加载失败: ' + err.message);
        throw err;
    }
}


// ─────────────────────────────────────────────
// 计算 skip_cfg_above_sigma
//
// 按像素面积和模型类型（v4.5 或通用），计算
// SD skip_cfg_above_sigma 超参数值。
//
// @param {number} width
// @param {number} height
// @param {string} [modelName]
// @returns {number}
// ─────────────────────────────────────────────

export function calculateSkipCfgAboveSigma(width, height, modelName) {
    addLog('计算 skip_cfg_above_sigma... 宽度:' + width + 'NxXhu' + height + 'AdkcB' + modelName);
    const magic = modelName?.includes('ion-4-5') ? SIGMA_MAGIC_NUMBER_V4_5 : SIGMA_MAGIC_NUMBER;
    addLog('使用的 magicConstant：' + magic);

    const pixels     = width * height;
    const ratio      = pixels / REFERENCE_PIXEL_COUNT;
    const sigma      = Math.pow(ratio, -0.5) * magic;

    addLog('计算结果 skip_cfg_above_sigma: ' + sigma.toFixed(4) + ', 像素: ' + pixels + ', 比例: ' + ratio.toFixed(4));
    return sigma;
}


// ─────────────────────────────────────────────
// 提示词标签去重
//
// 按逗号拆分标签，去除空标签，大小写不敏感去重，
// 保留第一次出现的原始大小写。
//
// @param {string} prompt
// @returns {string}
// ─────────────────────────────────────────────

export function deduplicateTags(prompt) {
    if (!prompt || typeof prompt !== 'string') return '';
    const tags    = prompt.split(',').map(t => t.trim()).filter(t => t.length > 0);
    if (tags.length === 0) return '';

    const seen    = new Map();
    for (const tag of tags) {
        const key = tag.toLowerCase();
        if (!seen.has(key)) seen.set(key, tag);
    }

    const result  = Array.from(seen.values()).join(', ');
    if (tags.length !== seen.size) {
        addLog('[去重] ' + tags.length + ' 个标签 (移除 ' + (tags.length - seen.size) + ' 个重复)');
    }
    return result;
}


// ─────────────────────────────────────────────
// 坐标网格辅助（内部）
//
// 将 "a1" ~ "e5" 这样的网格位置字符串转换为 {x, y} 小数坐标（0~1）
// ─────────────────────────────────────────────

function centersToCoordinates(center) {
    if (!center) return {};
    const m = center.match(/([a-e])([1-5])/i);
    if (!m) return {};
    const col = m[1].toLowerCase();
    const row = parseInt(m[2]);

    const colMap = { a: 0.1, b: 0.3, c: 0.5, d: 0.7, e: 0.9 };
    const rowMap = { 1: 0.1, 2: 0.3, 3: 0.5, 4: 0.7, 5: 0.9 };

    return {
        x: colMap[col] ?? 0.5,
        y: rowMap[row] ?? 0.5,
    };
}


// ─────────────────────────────────────────────
// 解析带坐标的提示词字符串
//
// 解析如下格式：
//   "main prompt; UC: negative; 1 UC: neg1; 2 UC: neg2;
//    1 centers c3; 1 Prompt: char1 prompt; ..."
//
// 返回结构体：
//   {
//     prompt:      string,           // 主提示词
//     negPrompt:   string,           // 主负面
//     insertions:  [{type, uc, prompt, center, coordinates}],
//     modifiedPrompt: string,        // 替换后的完整 prompt（含插入）
//   }
// ─────────────────────────────────────────────

export function parsePromptStringWithCoordinates(raw) {
    if (!raw || typeof raw !== 'string') return { prompt: raw, negPrompt: '', insertions: [], modifiedPrompt: raw };

    // 切分主 prompt 和 UC
    const parts     = raw.split(/;\s*UC:/i);
    const mainPart  = parts[0]?.trim() || '';
    const ucPart    = parts[1]?.trim() || '';

    // 从 mainPart 提取各插入块
    // 格式: "N UC: ...; N centers X; N Prompt: ..."
    const insertions = [];

    // 解析: "N UC:([^;]+)"
    const ucMatches = [...raw.matchAll(/(\d+)\s+UC:\s*([^;]+)/gi)];
    for (const m of ucMatches) {
        const idx = parseInt(m[1]);
        insertions.push({ index: idx, uc: m[2].trim(), type: 'uc' });
    }

    // 解析: "N centers X"
    const centerMatches = [...raw.matchAll(/(\d+)\s+centers?\s+([a-e][1-5])/gi)];
    for (const m of centerMatches) {
        const idx   = parseInt(m[1]);
        const coord = centersToCoordinates(m[2]);
        const existing = insertions.find(i => i.index === idx);
        if (existing) {
            existing.center      = m[2];
            existing.coordinates = coord;
        } else {
            insertions.push({ index: idx, center: m[2], coordinates: coord, type: 'center' });
        }
    }

    // 解析: "N Prompt:(.+)" （角色子提示词）
    const promptMatches = [...raw.matchAll(/(\d+)\s+Prompt:\s*([^;]+)/gi)];
    for (const m of promptMatches) {
        const idx = parseInt(m[1]);
        const existing = insertions.find(i => i.index === idx);
        if (existing) {
            existing.prompt = m[2].trim();
        } else {
            insertions.push({ index: idx, prompt: m[2].trim(), type: 'prompt' });
        }
    }

    // 日志
    addLog('解析出的插入内容: ' + insertions.length + ' 条');

    return {
        prompt:         mainPart,
        negPrompt:      ucPart,
        insertions,
        modifiedPrompt: raw,
    };
}


// ─────────────────────────────────────────────
// 输入框样式化（返回 Promise<value>）
//
// 创建一个模态输入框，让用户输入文本后 resolve。
//
// @param {string} placeholder
// @returns {Promise<string>}
// ─────────────────────────────────────────────

export function stylInput(placeholder) {
    return new Promise(resolve => {
        const overlay     = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex; align-items: center; justify-content: center;
        `;

        const box          = document.createElement('div');
        box.style.cssText  = `
            background: #1a1a2e;
            border-radius: 8px;
            padding: 20px;
            width: 400px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        `;

        const input        = document.createElement('input');
        input.type         = 'text';
        input.placeholder  = placeholder || '';
        input.style.cssText = `
            width: 100%; padding: 8px;
            border: 1px solid #333;
            background: #0f3460;
            color: #fff;
            border-radius: 4px;
            margin-bottom: 12px;
        `;

        const btnRow       = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';

        const cancelBtn    = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 6px 14px; border-radius: 4px;
            background: rgba(255,255,255,0.1); color: #fff; border: none; cursor: pointer;
        `;

        const confirmBtn   = document.createElement('button');
        confirmBtn.textContent = '确定';
        confirmBtn.style.cssText = `
            padding: 6px 14px; border-radius: 4px;
            background: #1a73e8; color: #fff; border: none; cursor: pointer;
        `;

        cancelBtn.onclick  = () => { overlay.remove(); resolve(''); };
        confirmBtn.onclick = () => { overlay.remove(); resolve(input.value || ''); };
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { overlay.remove(); resolve(input.value || ''); }
            if (e.key === 'Escape') { overlay.remove(); resolve(''); }
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        box.appendChild(input);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        input.focus();
    });
}


// ─────────────────────────────────────────────
// 将图片存入数据库（base64 格式）
//
// 使用 FileReader.readAsDataURL，完成后调用 setItemImg。
// ─────────────────────────────────────────────

export async function convertImageToBase64(uuid, file) {
    const reader    = new FileReader();
    reader.onload   = e => {
        const dataUrl = e.target.result;
        setItemImg(uuid, dataUrl);
    };
    reader.readAsDataURL(file);
}


// ─────────────────────────────────────────────
// 自定义确认弹窗
//
// 替代原生 confirm()，返回 Promise<boolean>。
// ─────────────────────────────────────────────

export function stylishConfirm(message) {
    return new Promise(resolve => {
        const overlay     = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex; align-items: center; justify-content: center;
        `;

        const box          = document.createElement('div');
        box.style.cssText  = `
            background: #1a1a2e; border-radius: 8px;
            padding: 24px; max-width: 360px; width: 90%;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            color: #fff; text-align: center;
        `;

        const msg          = document.createElement('p');
        msg.textContent    = message;
        msg.style.cssText  = 'margin-bottom: 20px; font-size: 15px;';

        const btnRow       = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:12px; justify-content:center;';

        const cancelBtn    = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 8px 20px; border-radius: 4px;
            background: rgba(255,255,255,0.1); color: #fff; border: none; cursor: pointer;
        `;

        const confirmBtn   = document.createElement('button');
        confirmBtn.textContent = '确定';
        confirmBtn.style.cssText = `
            padding: 8px 20px; border-radius: 4px;
            background: #c757d; color: #fff; border: none; cursor: pointer;
        `;

        cancelBtn.onclick  = () => { overlay.remove(); resolve(false); };
        confirmBtn.onclick = () => { overlay.remove(); resolve(true);  };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        box.appendChild(msg);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}


// ─────────────────────────────────────────────
// 字符串工具
// ─────────────────────────────────────────────

export function removeTrailingSlash(str) {
    return str.endsWith('/') ? str.slice(0, -1) : str;
}

export function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// ─────────────────────────────────────────────
// 锁机制（基于 window 状态）
//
// waitForLock  — 等待锁释放（监听 'xianchengReleased' 事件）
// releaseLock  — 释放锁（设置标志并 dispatch 事件）
// acquireLock  — 获取锁（清除标志）
// ─────────────────────────────────────────────

export function waitForLock() {
    return new Promise(resolve => {
        const check = () => {
            if (window.xianchengReleased) {
                window.removeEventListener('xianchengReleased', check);
                resolve();
            }
        };
        if (window.xianchengReleased) {
            resolve();
            return;
        }
        window.addEventListener('xianchengReleased', check);
    });
}

export function releaseLock() {
    window.xianchengReleased = true;
    window.dispatchEvent(new Event('xianchengReleased'));
}

export function acquireLock() {
    window.xiancheng = false;
}


// ─────────────────────────────────────────────
// 平滑抖动特效
//
// 在给定元素上施加正弦曲线横向抖动动画（600ms）。
// 若元素 position 为 static，先改为 relative。
// ─────────────────────────────────────────────

export function addSmoothShakeEffect(el) {
    if (getComputedStyle(el).position === 'static') {
        el.style.position = 'relative';
    }

    const startTime   = Date.now();
    const duration    = 600;    // ms
    const amplitude   = 8;      // px
    const frequency   = 3;      // cycles

    const animate = () => {
        const elapsed  = Date.now() - startTime;
        const progress = elapsed / duration;
        if (progress >= 1) {
            el.style.transform = '';
            return;
        }
        const decay    = 1 - progress;
        const offset   = amplitude * decay * Math.sin(2 * Math.PI * frequency * progress);
        el.style.transform = `translateX(${offset}px)`;
        requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
}


// ─────────────────────────────────────────────
// 生成随机种子（SD 用）
// ─────────────────────────────────────────────

export function generateRandomSeed() {
    return Math.floor(Math.random() * 2147483647);
}


// ─────────────────────────────────────────────
// 检测移动设备
// ─────────────────────────────────────────────

export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}


// ─────────────────────────────────────────────
// 正面提示词提取（zhengmian）
//
// 从完整的 prompt 字符串中提取正面提示词部分。
// 格式：前置前 | 前置后 | 正文 | 后置前 | 后置后 | 最后置
// ─────────────────────────────────────────────

export async function zhengmian(uuid, index) {
    const [dataUrl] = await getItemImg(uuid, index);
    if (!dataUrl) return '';
    return dataUrl;
}


// ─────────────────────────────────────────────
// 负面提示词提取（fumian）
// ─────────────────────────────────────────────

export async function fumian(uuid, index) {
    const [, , negPrompt] = await getItemImg(uuid, index);
    return negPrompt || '';
}


// ─────────────────────────────────────────────
// Prompt 替换（通用版）
//
// 对提示词字符串按规则数组逐条替换。
// 每条规则格式：{ trigger, content, type }
//   type: 'replace' | 'insert_before' | 'insert_after' | 'prefix' | 'suffix' | ...
//
// @param {string}   promptStr
// @param {Array}    rules
// @param {string}   [context]  — 用于日志
// @returns {string}
// ─────────────────────────────────────────────

export async function prompt_replace(promptStr, rules, context = '') {
    if (!rules || rules.length === 0) {
        addLog('无有效替换规则，返回原始 Prompt。');
        return promptStr;
    }
    if (!promptStr) {
        addLog('无有效替换规则或空Prompt，返回原始Prompt。');
        return promptStr;
    }

    addLog('Prompt 替换: ' + context);
    addLog('  - 主要提示词: ' + promptStr.substring(0, 80));

    let result = promptStr;
    for (const rule of rules) {
        if (!rule || !rule.trigger) continue;
        const trigger  = rule.trigger.trim();
        const content  = rule.content  || '';
        const type     = rule.type     || 'replace';

        addLog('  替换: "' + trigger + '" -> "' + content.substring(0, 40) + '" (type=' + type + ')');

        const re = new RegExp(escapeRegExp(trigger), 'g');
        if (type === 'replace') {
            result = result.replace(re, content);
        } else if (type === 'insert_before') {
            result = result.replace(re, content + '$&');
        } else if (type === 'insert_after') {
            result = result.replace(re, '$&' + content);
        }
    }

    addLog('替换/删除后的 Prompt: ' + result.substring(0, 80));
    return result;
}


// ─────────────────────────────────────────────
// Prompt 替换（Banana 版）
//
// Banana 平台专用替换。支持：
//   前置前/前置后/后置前/后置后/最后置 五段式结构
//   + 分角色子提示词
//
// @param {string} basePrompt
// @param {object} settings   — 来自 extension_settings
// @returns {{ prompt, negPrompt }}
// ─────────────────────────────────────────────

export async function prompt_replace_banana(basePrompt, settings) {
    addLog('[Banana] 原始 Prompt。');
    if (!basePrompt) {
        addLog('[Banana] 无有效替换规则或空Prompt，返回原始Prompt。');
        return { prompt: basePrompt, negPrompt: '' };
    }

    const prePre  = settings?.prePre  || '';
    const prePost = settings?.prePost || '';
    const postPre = settings?.postPre || '';
    const postPost= settings?.postPost|| '';
    const last    = settings?.last    || '';
    const negFixed= settings?.negFixed|| '';

    addLog('  - 前置前: ' + prePre);
    addLog('  - 前置后: ' + prePost);
    addLog('  - 后置前: ' + postPre);
    addLog('  - 后置后: ' + postPost);
    addLog('  - 固定负面提示词: ' + negFixed);

    const combined = [prePre, prePost, basePrompt, postPre, postPost, last]
        .filter(Boolean).join(', ');

    addLog('组合后的正面提示词: ' + combined.substring(0, 100));

    const negCombined = negFixed;
    addLog('组合后的负面提示词: ' + negCombined.substring(0, 100));

    return { prompt: combined, negPrompt: negCombined };
}


// ─────────────────────────────────────────────
// Banana 分角色提示词替换
// ─────────────────────────────────────────────

export function prompt_replace_banana_for_character(basePrompt, charSettings, charName) {
    addLog('[Banana] 分角色 Prompt 替换，角色: ' + charName);
    if (!basePrompt) return basePrompt;

    const charRules = charSettings?.rules || [];
    let result = basePrompt;
    for (const rule of charRules) {
        if (!rule.trigger) continue;
        const re = new RegExp(escapeRegExp(rule.trigger), 'g');
        result   = result.replace(re, rule.content || '');
        addLog('  替换: "' + rule.trigger + '" -> "' + (rule.content || '').substring(0, 40) + '"');
    }
    addLog('角色替换后的 Prompt: ' + result.substring(0, 80));
    return result;
}


// ─────────────────────────────────────────────
// 通用分角色提示词替换
// ─────────────────────────────────────────────

export function prompt_replace_for_character(basePrompt, rules, charName) {
    addLog('分角色 Prompt 替换 (用于分角色替换)，角色: ' + charName);
    if (!basePrompt || !rules || rules.length === 0) return basePrompt;

    let result = basePrompt;
    for (const rule of rules) {
        if (!rule.trigger) continue;
        const re = new RegExp(escapeRegExp(rule.trigger), 'g');
        result   = result.replace(re, rule.content || '');
    }
    return result;
}


// ─────────────────────────────────────────────
// 生成唯一 ID
// ─────────────────────────────────────────────

export function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}


// ─────────────────────────────────────────────
// Prompt 提取（透传）
// ─────────────────────────────────────────────

export function extractPrompt(prompt) {
    return prompt;
}


// ─────────────────────────────────────────────
// 通用 HTTP 请求（包装 fetch）
//
// @param {{ method, url, headers, data, responseType }} config
// @returns {Promise<any>}
// ─────────────────────────────────────────────

export function request({ method = 'GET', url, headers, data, responseType }) {
    const init = { method, headers, body: data };
    return fetch(url, init).then(async res => {
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
        }
        if (responseType === 'json' || !responseType) return res.json();
        if (responseType === 'arraybuffer')            return res.arrayBuffer();
        if (responseType === 'blob')                   return res.blob();
        return res.text();
    });
}


// ─────────────────────────────────────────────
// 构造请求头
// ─────────────────────────────────────────────

export function getRequestHeaders(csrfToken) {
    return {
        'Content-Type':  'application/json',
        'X-CSRF-Token':  csrfToken,
    };
}


// ─────────────────────────────────────────────
// 日志系统
//
// addLog  — 追加一条带时间戳的日志，并更新 #ch-log-textarea
// clearLog — 清空日志
// getLog  — 获取全部日志文本
// ─────────────────────────────────────────────

export function addLog(msg) {
    if (!extension_settings[extensionName]['log']) {
        extension_settings[extensionName]['log'] = '';
    }
    const ts    = new Date().toLocaleString();
    const line  = '[' + ts + '] ' + msg + '\n';
    extension_settings[extensionName]['log'] += line;

    const textarea = document.getElementById('ch-log-textarea');
    if (textarea) {
        textarea.value     = getLog();
        textarea.scrollTop = textarea.scrollHeight;
    }
}

export function clearLog() {
    extension_settings[extensionName]['log'] = '';
}

export function getLog() {
    return extension_settings[extensionName]['log'] || '';
}


// ─────────────────────────────────────────────
// 处理上传的图片（存入数据库）
//
// 读取 File 对象为 base64，存入 DB，
// 若 compress=true 且为移动端则先压缩。
//
// @param {File}    file
// @param {boolean} [compress=false]
// @returns {Promise<string>} dataUrl
// ─────────────────────────────────────────────

export async function processUploadedImage(file, compress = false) {
    return new Promise((resolve, reject) => {
        const reader   = new FileReader();
        reader.onload  = async e => {
            let dataUrl = e.target.result;
            if (compress && isMobileDevice()) {
                try {
                    const img    = await loadImage(dataUrl);
                    const canvas = new OffscreenCanvas(img.width, img.height);
                    const ctx    = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const blob   = await canvas.convertToBlob({ type: 'image/png' });
                    dataUrl = await blobToDataURL(blob);
                    addLog('图片已在移动端压缩 ' + file.size + ' bytes');
                } catch (err) {
                    addLog('图片加载失败: ' + err.message);
                }
            }
            resolve(dataUrl);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}


// ─────────────────────────────────────────────
// 处理上传图片 → 返回 Blob
// ─────────────────────────────────────────────

export async function processUploadedImageToBlob(file) {
    const dataUrl = await processUploadedImage(file);
    const res     = await fetch(dataUrl);
    return res.blob();
}


// ─────────────────────────────────────────────
// 内部：Blob → data URL
// ─────────────────────────────────────────────

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader   = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}


// ─────────────────────────────────────────────
// 移除 <thinking>...</thinking> 标签
// ─────────────────────────────────────────────

export function removeThinkingTags(text) {
    if (!text || typeof text !== 'string') return text || '';
    return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}


// ─────────────────────────────────────────────
// 移除中文括号注释
//
// 反复删除 （...） 直到稳定，用于清理 LLM 输出中的中文说明注释。
// ─────────────────────────────────────────────

export function stripChineseAnnotations(text) {
    if (!text) return '';
    let curr = text, prev;
    do {
        prev = curr;
        curr = curr.replace(/（[^（）]*）/g, '');
    } while (curr !== prev);
    return curr;
}


// ─────────────────────────────────────────────
// 图片格式转换：任意格式 → JPEG
//
// 用 OffscreenCanvas 绘制后以 image/jpeg 格式导出（质量 0.98）。
// ─────────────────────────────────────────────

export async function convertImageToJpeg(src) {
    const img    = await loadImage(src);
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const blob   = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.98 });
    addLog('(JPEG 质量 0.98). 原始大小: ' + (src?.size || 0) + ' bytes, 压缩后大小: ' + blob.size + ' bytes');
    return blob;
}


// ─────────────────────────────────────────────
// MP4 Faststart 修复
//
// 将 MP4 文件的 moov atom 移到文件头部（web faststart），
// 使浏览器能够在下载完成前就开始播放。
//
// 算法：
//   1. 解析 box 列表，找到 moov 和 mdat 的位置与大小
//   2. 若 moov 已在 mdat 之前，直接返回原 blob
//   3. 否则将 moov 移到 ftyp 之后、mdat 之前
//   4. 更新 moov 内 stco box 的所有偏移量（加上 moov 移动引起的偏移差）
// ─────────────────────────────────────────────

export async function fixMp4Faststart(blob) {
    try {
        const buffer = await blob.arrayBuffer();
        const view   = new DataView(buffer);
        const bytes  = new Uint8Array(buffer);

        // ── 解析所有顶层 box ──
        const boxes  = [];
        let offset   = 0;
        while (offset < bytes.length - 8) {
            const size = view.getUint32(offset, false);
            const type = String.fromCharCode(
                bytes[offset+4], bytes[offset+5],
                bytes[offset+6], bytes[offset+7]
            );
            if (size < 8) break;
            boxes.push({ type, offset, size });
            offset += size;
        }

        const moovBox = boxes.find(b => b.type === 'moov');
        const mdatBox = boxes.find(b => b.type === 'mdat');
        const ftypBox = boxes.find(b => b.type === 'ftyp');

        if (!moovBox || !mdatBox) {
            addLog('[mp4fix] faststart 修复失败：找不到 moov 或 mdat box');
            return blob;
        }

        // moov 已在 mdat 之前，无需修复
        if (moovBox.offset < mdatBox.offset) {
            addLog('[mp4fix] faststart 已就位，无需修复.');
            return blob;
        }

        // ── 重排：ftyp + moov + 其余 ──
        const ftypBytes = ftypBox
            ? bytes.slice(ftypBox.offset, ftypBox.offset + ftypBox.size)
            : new Uint8Array(0);
        const moovBytes = bytes.slice(moovBox.offset, moovBox.offset + moovBox.size);

        // 其余 box（排除 ftyp 和 moov）
        const restParts = boxes
            .filter(b => b.type !== 'ftyp' && b.type !== 'moov')
            .map(b => bytes.slice(b.offset, b.offset + b.size));

        // 计算偏移差：moov 在新文件中的起始位置
        const newMoovOffset = ftypBytes.length;
        const oldMoovOffset = moovBox.offset;
        const offsetDelta   = newMoovOffset - oldMoovOffset;

        // ── 修复 moov 内的 stco box 偏移 ──
        const moovCopy = new Uint8Array(moovBytes);
        _addToStcoOffsets(moovCopy, new DataView(moovCopy.buffer), 0, offsetDelta);

        // ── 拼接最终文件 ──
        const totalSize = ftypBytes.length + moovCopy.length +
                          restParts.reduce((s, p) => s + p.length, 0);
        const out        = new Uint8Array(totalSize);
        let pos          = 0;
        out.set(ftypBytes, pos); pos += ftypBytes.length;
        out.set(moovCopy,  pos); pos += moovCopy.length;
        for (const part of restParts) { out.set(part, pos); pos += part.length; }

        addLog('[mp4fix] faststart 修复完成，moov 已移至文件头');
        return new Blob([out], { type: 'video/mp4' });
    } catch (err) {
        addLog('[mp4fix] faststart 修复失败，使用原始 Blob: ' + err.message);
        return blob;
    }
}


// ─────────────────────────────────────────────
// 内部：递归遍历 moov 内部 box，找到 stco 并累加偏移
// ─────────────────────────────────────────────

function _addToStcoOffsets(bytes, view, containerStart, delta) {
    let off = containerStart;
    const end = bytes.length;
    while (off < end - 8) {
        const size = view.getUint32(off, false);
        const type = String.fromCharCode(
            bytes[off+4], bytes[off+5], bytes[off+6], bytes[off+7]
        );
        if (size < 8 || size > end - off) break;

        if (type === 'stco') {
            // stco: version(1) + flags(3) + entry_count(4) + offsets...
            const count = view.getUint32(off + 12, false);
            for (let i = 0; i < count; i++) {
                const pos   = off + 16 + i * 4;
                const old   = view.getUint32(pos, false);
                view.setUint32(pos, old + delta, false);
            }
        } else if (['moov','trak','mdia','minf','stbl','dinf'].includes(type)) {
            // 容器 box，递归进入
            _addToStcoOffsets(bytes, view, off + 8, delta);
        }
        off += size;
    }
}
