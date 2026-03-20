// ============================================================
// AI 图像生成队列管理模块
// 依赖: EventType (from config.js), eventSource (from script.js)
// ============================================================

import { eventSource } from '../../../../../script.js';
import { EventType } from './config.js';

// 存储所有进行中的图像生成任务
const imageGenerationQueue = new Map();

// 用于生成唯一ID的计数器
let imageGenerationIdCounter = 0;

/**
 * 请求生成一张图像（异步）
 *
 * @param {string} prompt          - 正向提示词
 * @param {string} negativePrompt  - 负向提示词（可选，默认为空字符串）
 * @param {object} options         - 其他选项（可选，默认为空对象）
 * @returns {Promise<{id, imageUrl, prompt}>} 生成结果
 */
export async function requestImageGeneration(prompt, negativePrompt = '', options = {}) {
  // 打印请求参数（调试用）
  console.log('[AI Image Generation] 发起请求:', {
    prompt,
    negative_prompt: negativePrompt,
    options,
  });

  // 生成唯一请求ID
  const requestId = 'img_' + ++imageGenerationIdCounter + '_' + Date.now();

  // 将任务记录到队列
  imageGenerationQueue.set(requestId, {
    id: requestId,
    prompt: prompt,
    negative_prompt: negativePrompt,
    options: options,
    status: 'pending',
    timestamp: Date.now(),
    imageUrl: null,
    error: null,
  });

  // 构造向外部系统发送的事件载荷
  const requestPayload = {
    id: requestId,
    prompt: prompt,
    width: options.width || null,
    height: options.height || null,
  };

  // 如果有负向提示词，附加到主提示词后面（以某种分隔符拼接）
  if (negativePrompt) {
    requestPayload.prompt = prompt + ' ### ' + negativePrompt;
  }

  console.log('[AI Image Generation] 发送事件:', requestPayload);

  // 发送"开始生图"事件，触发外部图像生成逻辑
  eventSource.emit(EventType.GENERATE_IMAGE_REQUEST, requestPayload);

  // 创建 Promise，等待外部系统通过事件系统回传结果
  const responsePromise = new Promise((resolve, reject) => {
    // 超时处理：60000ms 后自动超时
    const timeoutHandle = setTimeout(() => {
      eventSource.removeListener(EventType.GENERATE_IMAGE_RESPONSE, onResponse);
      imageGenerationQueue.delete(requestId);
      reject(new Error('图像生成超时'));
    }, 60000);

    // 监听"生图响应"事件
    function onResponse(responseData) {
      // 过滤掉不属于本次请求的响应
      if (responseData.id !== requestId) return;

      console.log('[AI Image Generation] 收到响应:', responseData);

      // 清除超时定时器，移除监听器
      clearTimeout(timeoutHandle);
      eventSource.removeListener(EventType.GENERATE_IMAGE_RESPONSE, onResponse);

      // 从队列中取出任务记录
      const task = imageGenerationQueue.get(requestId);
      if (!task) {
        console.warn('[AI Image Generation] 未找到生图记录:', requestId);
        reject(new Error('[AI Image Generation] 未找到生图记录: ' + requestId));
        return;
      }

      if (responseData.success) {
        // 成功：更新任务状态，解析结果
        task.status = 'completed';
        task.imageUrl = responseData.imageUrl || responseData.image_url;

        console.log(
          '[AI Image Generation] 生图成功，imageUrl:',
          task.imageUrl?.substring(0, 80), // 只打印URL前80个字符，避免日志过长
        );

        resolve({
          requestId: requestId,
          imageUrl: task.imageUrl,
          prompt: prompt,
        });
      } else {
        // 失败：更新任务状态，拒绝 Promise
        task.status = 'failed';
        task.error = responseData.error || '未知错误';

        console.error('[AI Image Generation] 生图失败:', task.error);
        reject(new Error('[AI Image Generation] 生图失败: ' + task.error));
      }
    }

    // 注册响应事件监听器
    eventSource.on(EventType.GENERATE_IMAGE_RESPONSE, onResponse);
    console.log('[AI Image Generation] 等待响应，requestId:', requestId);
  });

  // 等待结果并返回（失败时从队列清除并重新抛出错误）
  try {
    return await responsePromise;
  } catch (error) {
    imageGenerationQueue.delete(requestId);
    throw error;
  }
}

/**
 * 查询某个图像生成任务的当前状态（文本格式）
 *
 * @param {string} requestId - 由 requestImageGeneration 返回的请求ID
 * @returns {string}         - 状态描述文本
 */
export function getImageGenerationStatus(requestId) {
  const task = imageGenerationQueue.get(requestId);

  if (!task) {
    return '未找到生图记录: ' + requestId;
  }

  let result = '生图ID: ' + requestId + '\n';
  result += '提示词: ' + task.prompt + '\n';
  result += '状态: ' + task.status + '\n';

  if (task.status === 'completed' && task.imageUrl) {
    result += '图片URL: ' + task.imageUrl + '\n';
  } else if (task.status === 'failed' && task.error) {
    result += '错误: ' + task.error + '\n';
  }

  return result;
}
