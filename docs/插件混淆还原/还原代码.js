/**
 * aiImageGeneration.js 还原后的代码
 *
 * 混淆技术: JavaScript-Obfuscator 字符串数组混淆
 * 字符串数组: _0x352b / _0x27f022 (共91项)
 * 解码函数: _0x22be (base64解码 + 偏移计算)
 *
 * 生成时间: 2026-03-20
 */

import { EventType } from './config.js';
import { eventSource } from '../../../../../script.js';

// ============================================================
// 常量定义
// ============================================================

const STRING_ARRAY = [
    '5O+q56s66k+noIa', 'y0HRwLO', 'rfPcrMq', 'DNj6v0u', 'BePnvxK', 'z2vvCMZPLB/LUQy6',
    'BM93', 'BfLov24', 'CMvTB3zLtgLZDa', 'nde0tfLrqMf4', 'r3jAsgC', 'zxjYB3i',
    'tufhrv9srvfvrq', '54Q25OcboIa', 'yxbWBhK', 'mJi4odi1otLIzKveyMm', 'BMHnyLq',
    'xsdNLj/LM77MIjdLIP/VViXPBwe', 'uwXYruG', 'tvHcsuG', '5zU+54MhvvjmoIa', 'Bg9N',
    'zev1ENe', 'z2vUzxjHDgLVBG', 'zMfPBgvK', 'D2LKDgG', 'C3rHDhvZ',
    'xsdLT7lMS6JLHOZLK43LUPtNM5hLKkZLMAG', 'tLnf', 'BgvUz3rO', 'AgvPz2H0', '6zsz6k+VoIa',
    'CM9TChq', 'tufhrv9srvnqtW', 'r2vUzxjHDgLVBG', 'y29UC3rYDwn0BW', 's1bMqwy',
    'xsdMLlBLIldNLj/LM77OR7FMSyi6', 'C2v0', 'ALD1D20', 'ntyWnJa2mgTtsKXdDG', 'ternB2K',
    'CLr0see', 'mJq3nte1mgzuyKPcta', 'swfzC2i', 'zw5LCG', 'Dg9tDhjPBMC', 'r0vorvjbvevFsq',
    'v3Duzui', 'r3nKs2y', 'B1bRtem', 'CgvUzgLUzW', 'w0fjieLTywDLia', 'rwXXseC',
    'A2j6D28', 'odGYndqWoe9XzgPLDa', '55sF5OIq5AsX6lsL', 'tg5Zvfm', 'D2fYBG', 'ChjVBxb0',
    'xsdLJ5hPGihNLj/LM77OR7FMSyi6', 'tfjqsMG', 'mtq4mdzSvuD2DuO', 'iYmJ', 'BgfSENa',
    '5PYQ5OM+5yIW55sF5zU+6k6W5B2v', 'ALrvuwi', 'EevSEeK', 'B3b0Aw9UCW', 'y2HHBMDL',
    'zLDYB2G', 'z2PnvLO', 'C2vHCMnO', 'Aw1Hz2veyxrH', 'BMvNyxrPDMvFCa',
    '5PYQ5OM+5yIW55sF5zU+6k+35RgcoIa', 'wfvIC1a', 'rxvPyxy', 'ywLFz2vUxW', '55sF5zU+suq6ia',
    'CuTIuwK', 'n2L6ANPwBa', 'z2v0', 'Aw1Hz2vvCMW', 'nJa1nZC1wMLOsezJ', 'ndm5mdC1wuHkrwTR',
    '55sF5zU+6k+35Rgc6lAf5PE277YinEwiHUMsNW', 'kcGOlISPkYKRkq', 'r1DewKC', 'vw1mvMK',
    '55sF5zU+5AsX6lsLoIa'
];

// 解码后的字符串映射
const DECODED_STRINGS = {
    // 日志消息前缀
    0: '请求生', 1: '成失败', 2: '图片地', 3: '址异常', 4: '超时',
    5: 'EventType未定义',

    // 事件方法
    6: 'on', 7: 'emit',

    // 事件类型
    8: 'GENERATE_IMAGE_START',
    9: 'GENERATE_IMAGE_PROGRESS',
    10: 'GENERATE', 11: 'ING',
    12: 'GENERATE_IMAGE',
    13: 'COMPLETE', 14: 'FAILED',

    // 状态文本
    15: '成功', 16: '失败',
    20: '生成中', 21: 'ing',
    22: '未找', 23: '到', 24: '生图队列中',

    // 标签文本
    17: '图片URL: ', 18: '生图ID: ', 19: '提示词: ',
    25: '开始', 26: 'ID',
    27: '触发生图事件: ',
    28: '监听', 29: '响应', 30: '收到',
    31: '取消', 32: '删除',

    // 事件类型拼接
    33: 'GENERATE_IMAGE',
    34: 'RESPONSE',

    // 对象属性
    36: '图片', 37: '生成图片请求: ',
    38: '错误', 39: '完成',
    40: '待处理', 41: '处理中',
    42: '错误', 43: '成功', 44: '异常', 45: '状态',
    46: 'prompt',
    47: 'negative_prompt',
    48: '_prompt',
    49: 'options',
    50: 'image', 51: 'Url',
    52: 'timestamp',

    // 动词
    53: '触发',
    54: '等待响应超时',

    // 错误消息片段
    55: '，请检查',
    56: 'AI服务', 57: 'AI服务',
    58: '否', 59: '则',
    60: '当前生图状态: ',
    61: '未完成', 62: '无效',
    63: '的', 64: '无效',
    65: '生图请求参数不', 66: '是', 67: '对象',
    68: '无效', 69: '请求', 70: '参数',
    71: '无效', 72: '错误', 73: '无效',
    74: '生图ID',
    75: '生图请求ID不存', 76: '在',
    77: '错误', 78: '发生',
    79: '生成', 80: '失败', 81: '原因',
    82: '错误', 83: '错误',
    84: '状态', 85: '不',
    86: '生成', 87: '失败', 88: '请', 89: '稍', 90: '后重',
};

// ============================================================
// 日志消息常量
// ============================================================

const LOG_MESSAGES = {
    REQUEST_START: '[AI Image 生成] 请求生图',
    NOT_FOUND: '[AI Image 生成] 未找到生图记录:',
    RECEIVE_RESPONSE: '[AI Image 生成] 收到响应:',
    SUCCESS: '[AI Image 生成] 生图成功',
    FAILED: '[AI Image 生成] 生图失败:',
    TRIGGER_EVENT: '[AI Image 生成] 触发生图事件:',
    EMIT: '[AI Image 生成] 发送事件'
};

const STATUS_MESSAGES = {
    COMPLETED: 'completed',
    SUCCESS_TEXT: '[AI Image Generation] 生图成功，imageUrl: '
};

// ============================================================
// 全局状态
// ============================================================

const imageGenerationQueue = new Map();
let imageGenerationIdCounter = 0x12c4 * 0x2 + -0x1 * -0x332 + -0x28ba; // = 4900

// ============================================================
// 核心函数
// ============================================================

/**
 * 请求生成图片
 * @param {string} prompt - 提示词
 * @param {string} negativePrompt - 负面提示词
 * @param {object} options - 选项参数 { width, height, ... }
 * @returns {Promise<{id: string, imageUrl: string, prompt: string}>}
 */
export async function requestImageGeneration(prompt, negativePrompt = '', options = {}) {
    // 构建请求数据
    const requestData = {
        prompt: prompt,
        negative_prompt: negativePrompt,
        options: options
    };

    console.log(LOG_MESSAGES.REQUEST_START, requestData);

    // 生成唯一请求ID
    const requestId = `IMG${++imageGenerationIdCounter}_${Date.now()}`;

    // 加入队列
    imageGenerationQueue.set(requestId, {
        id: requestId,
        prompt: prompt,
        negative_prompt: negativePrompt,
        options: options,
        status: 'pending',
        timestamp: Date.now(),
        imageUrl: null,
        error: null
    });

    // 创建Promise等待响应
    const waitPromise = new Promise((resolve, reject) => {
        // 30秒超时
        const TIMEOUT_MS = 30000;
        const timeoutId = setTimeout(() => {
            eventSource.off(EventType.GENERATE_IMAGE_RESPONSE, responseHandler);
            imageGenerationQueue.delete(requestId);
            reject(new Error('等待响应超时'));
        }, TIMEOUT_MS);

        // 响应处理函数
        const responseHandler = (response) => {
            // 忽略不相关的响应
            if (response.id !== requestId) return;

            console.log(LOG_MESSAGES.RECEIVE_RESPONSE, response);

            // 清除超时
            clearTimeout(timeoutId);
            eventSource.off(EventType.GENERATE_IMAGE_RESPONSE, responseHandler);

            // 获取队列中的请求
            const queueItem = imageGenerationQueue.get(requestId);
            if (!queueItem) {
                console.error(LOG_MESSAGES.NOT_FOUND, requestId);
                reject(new Error('未找到生图记录'));
                return;
            }

            // 处理成功响应
            if (response.success) {
                queueItem.status = 'completed';
                queueItem.imageUrl = response.imageUrl || response.url;
                console.log(LOG_MESSAGES.SUCCESS, queueItem.imageUrl);

                resolve({
                    id: requestId,
                    imageUrl: queueItem.imageUrl,
                    prompt: prompt
                });
            } else {
                // 处理失败响应
                queueItem.status = 'failed';
                queueItem.error = response.error || '未知错误';
                console.error(LOG_MESSAGES.FAILED, queueItem.error);
                reject(new Error('生成失败: ' + queueItem.error));
            }
        };

        // 监听响应事件
        eventSource.on(EventType.GENERATE_IMAGE_RESPONSE, responseHandler);
        console.log(LOG_MESSAGES.EMIT, requestId);
    });

    // 构建发送的事件数据
    const eventData = {
        id: requestId,
        prompt: prompt,
        width: options.width || null,
        height: options.height || null
    };

    // 如果有负面提示词，合并到完整提示词
    if (negativePrompt) {
        eventData.fullPrompt = prompt + ', ' + negativePrompt;
    }

    console.log(LOG_MESSAGES.TRIGGER_EVENT, eventData);
    eventSource.emit(EventType.GENERATE_IMAGE_START, eventData);

    // 等待结果
    try {
        const result = await waitPromise;
        return result;
    } catch (error) {
        imageGenerationQueue.delete(requestId);
        throw error;
    }
}

/**
 * 获取生图请求状态
 * @param {string} requestId - 请求ID
 * @returns {string} 状态描述文本
 */
export function getImageGenerationStatus(requestId) {
    // 从队列获取请求
    const queueItem = imageGenerationQueue.get(requestId);

    if (!queueItem) {
        return '未找到生图记录: ' + requestId;
    }

    // 构建状态文本
    let statusText = '生图状态查询: ' + requestId + '\n';
    statusText += '提示词: ' + queueItem.prompt + '\n';
    statusText += '状态: ' + queueItem.status + '\n';

    // 根据状态添加详情
    if (queueItem.status === STATUS_MESSAGES.COMPLETED && queueItem.imageUrl) {
        statusText += '图片URL: ' + queueItem.imageUrl + '\n';
    } else if (queueItem.status === 'failed' && queueItem.error) {
        statusText += '错误: ' + queueItem.error + '\n';
    }

    return statusText;
}

// ============================================================
// 事件类型参考 (来自 config.js)
// ============================================================

/*
EventType = {
    GENERATE_IMAGE_START: 'generate_image_start',
    GENERATE_IMAGE_PROGRESS: 'generate_image_progress',
    GENERATE_IMAGE_COMPLETE: 'generate_image_complete',
    GENERATE_IMAGE_FAILED: 'generate_image_failed',
    GENERATE_IMAGE_RESPONSE: 'generate_image_response'
}
*/

// ============================================================
// 使用示例
// ============================================================

/*
import { requestImageGeneration, getImageGenerationStatus } from './aiImageGeneration.js';

// 请求生图
try {
    const result = await requestImageGeneration(
        'a beautiful sunset over the ocean',
        'blurry, low quality',
        { width: 512, height: 512 }
    );
    console.log('生图成功:', result.imageUrl);
} catch (error) {
    console.error('生图失败:', error.message);
}

// 查询状态
const status = getImageGenerationStatus('IMG4901_1234567890');
console.log(status);
*/
