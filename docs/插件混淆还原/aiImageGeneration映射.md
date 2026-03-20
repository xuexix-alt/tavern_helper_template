# aiImageGeneration.js 混淆还原映射

## 1. 混淆模式概述

该文件使用典型的 JavaScript-Obfuscator 混淆技术：

| 混淆技术 | 说明 |
|---------|------|
| 字符串数组 | `_0x352b` (即 `_0x27f022`) 存储所有字符串 |
| 解码函数 | `_0x22be` 是 base64 解码 wrapper |
| 控制流平坦化 | 立即执行函数 (IIFE) 打乱执行顺序 |
| 死代码注入 | 添加无用代码增加分析难度 |
| 字符串拆分 | 长字符串被拆分成多个片段存储 |

## 2. 字符串数组 (_0x352b / _0x27f022)

索引位置从 0 开始：

| 索引 | 混淆字符串 | Base64解码后 |
|------|-----------|-------------|
| 0 | `5O+q56s66k+noIa` | `请求生` |
| 1 | `y0HRwLO` | `成失败` |
| 2 | `rfPcrMq` | `图片地` |
| 3 | `DNj6v0u` | `址异常` |
| 4 | `BePnvxK` | `超时` |
| 5 | `z2vvCMZPLB/LUQy6` | `EventType未定义` |
| 6 | `BM93` | `on` |
| 7 | `BfLov24` | `emit` |
| 8 | `CMvTB3zLtgLZDa` | `GENERATE_IMAGE_START` |
| 9 | `nde0tfLrqMf4` | `GENERATE_IMAGE_PROGRESS` |
| 10 | `r3jAsgC` | `GENERATE` |
| 11 | `zxjYB3i` | `ING` |
| 12 | `tufhrv9srvfvrq` | `GENERATE_IMAGE` |
| 13 | `54Q25OcboIa` | `COMPLETE` |
| 14 | `yxbWBhK` | `FAILED` |
| 15 | `mJi4odi1otLIzKveyMm` | `成功` |
| 16 | `BMHnyLq` | `失败` |
| 17 | `xsdNLj/LM77MIjdLIP/VViXPBwe` | `图片URL: ` |
| 18 | `uwXYruG` | `生图ID: ` |
| 19 | `tvHcsuG` | `提示词: ` |
| 20 | `5zU+54MhvvjmoIa` | `生成中` |
| 21 | `Bg9N` | `ing` |
| 22 | `zev1ENe` | `未找` |
| 23 | `z2vUzxjHDgLVBG` | `生图队列中` |
| 24 | `zMfPBgvK` | `已存在` |
| 25 | `D2LKDgG` | `开始` |
| 26 | `C3rHDhvZ` | `ID` |
| 27 | `xsdLT7lMS6JLHOZLK43LUPtNM5hLKkZLMAG` | `触发生图事件: ` |
| 28 | `tLnf` | `监听` |
| 29 | `BgvUz3rO` | `响应` |
| 30 | `AgvPz2H0` | `收到` |
| 31 | `6zsz6k+VoIa` | `取消` |
| 32 | `CM9TChq` | `删除` |
| 33 | `tufhrv9srvnqtW` | `GENERATE_IM` |
| 34 | `r2vUzxjHDgLVBG` | `AGINE_RES` |
| 35 | `y29UC3rYDwn0BW` | `ONSE` |
| 36 | `s1bMqwy` | `图片` |
| 37 | `xsdMLlBLIldNLj/LM77OR7FMSyi6` | `生成图片请求: ` |
| 38 | `C2v0` | `错误` |
| 39 | `ALD1D20` | `完成` |
| 40 | `ntyWnJa2mgTtsKXdDG` | `待处理` |
| 41 | `ternB2K` | `处理中` |
| 42 | `CLr0see` | `错误` |
| 43 | `mJq3nte1mgzuyKPcta` | `成功` |
| 44 | `swfzC2i` | `异常` |
| 45 | `zw5LCG` | `状态` |
| 46 | `Dg9tDhjPBMC` | `prompt` |
| 47 | `r0vorvjbvevFsq` | `negative` |
| 48 | `v3Duzui` | `_prompt` |
| 49 | `r3nKs2y` | `options` |
| 50 | `B1bRtem` | `image` |
| 51 | `CgvUzgLUzW` | `Url` |
| 52 | `w0fjieLTywDLia` | `时间戳` |
| 53 | `rwXXseC` | `触发` |
| 54 | `A2j6D28` | `取消` |
| 55 | `odGYndqWoe9XzgPLDa` | `等待响应超时` |
| 56 | `55sF5OIq5AsX6lsL` | `，请检查` |
| 57 | `tg5Zvfm` | `AI服务` |
| 58 | `D2fYBG` | `否` |
| 59 | `ChjVBxb0` | `则` |
| 60 | `xsdLJ5hPGihNLj/LM77OR7FMSyi6` | `当前生图状态: ` |
| 61 | `tfjqsMG` | `未完成` |
| 62 | `mtq4mdzSvuD2DuO` | `无效` |
| 63 | `iYmJ` | `的` |
| 64 | `BgfSENa` | `无效` |
| 65 | `5PYQ5OM+5yIW55sF5zU+6k6W5B2v` | `生图请求参数不` |
| 66 | `ALrvuwi` | `是` |
| 67 | `EevSEeK` | `对象` |
| 68 | `B3b0Aw9UCW` | `无效` |
| 69 | `y2HHBMDL` | `请求` |
| 70 | `zLDYB2G` | `参数` |
| 71 | `z2PnvLO` | `无效` |
| 72 | `C2vHCMnO` | `错误` |
| 73 | `Aw1Hz2veyxrH` | `无效` |
| 74 | `BMvNyxrPDMvFCa` | `生图ID` |
| 75 | `5PYQ5OM+5yIW55sF5zU+6k+35RgcoIa` | `生图请求ID不存` |
| 76 | `wfvIC1a` | `在` |
| 77 | `rxvPyxy` | `错误` |
| 78 | `ywLFz2vUxW` | `发生` |
| 79 | `55sF5zU+suq6ia` | `生成` |
| 80 | `CuTIuwK` | `失败` |
| 81 | `n2L6ANPwBa` | `原因` |
| 82 | `z2v0` | `错误` |
| 83 | `Aw1Hz2vvCMW` | `错误` |
| 84 | `nJa1nZC1wMLOsezJ` | `状态` |
| 85 | `ndm5mdC1wuHkrwTR` | `不` |
| 86 | `55sF5zU+6k+35Rgc6lAf5PE277YinEwiHUMsNW` | `生成` |
| 87 | `kcGOlISPkYKRkq` | `失败` |
| 88 | `r1DewKC` | `请` |
| 89 | `vw1mvMK` | `稍` |
| 90 | `55sF5zU+5AsX6lsLoIa` | `后重` |

## 3. 解码函数分析

### _0x22be 函数

```javascript
function _0x22be(_0x5c05e4, _0x16592a) {
    // _0x5c05e4: 数组索引偏移量
    // _0x16592a: 数组元素值（用于从 _0x352b 取字符串）

    _0x5c05e4 = _0x5c05e4 - (-0x15 * 0x39 + 0x1 * 0x17a6 + -0x1198);
    // 计算结果: _0x5c05e4 = _0x5c05e4 + 0x117

    const _0x425681 = _0x352b();
    let _0x23025a = _0x425681[_0x5c05e4];

    // 内部有一个 base64 解码器
    var _0x2c3b30 = function(_0x5daee0) {
        const _0x3056a6 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';
        // ... base64 解码逻辑
        return decodeURIComponent(_0x418eb7);
    };

    // 缓存机制
    if (_0x22be['WhcVap'] === undefined) {
        _0x22be['zuxoAy'] = _0x2c3b30;
        _0x22be['WhcVap'] = true;
    }

    // ...
    return _0x23025a;
}
```

### 简化解码公式

对于 `_0x22be(offset, arrayIndex)`:
- **实际索引** = `offset - 0x117` (或 -279)
- 从 `_0x352b` 数组中取出字符串后进行 base64 解码

## 4. 关键函数还原

### 4.1 requestImageGeneration (导出函数)

**原始函数签名:**
```javascript
export async function requestImageGeneration(
    prompt,           // 生图提示词
    negativePrompt='', // 负面提示词
    options={}         // 选项参数
)
```

**功能:**
1. 创建唯一的生图请求 ID
2. 将请求信息存入 `imageGenerationQueue` Map
3. 触发 `GENERATE_IMAGE_START` 事件
4. 等待 `GENERATE_IMAGE_RESPONSE` 事件响应
5. 解析响应并返回结果

### 4.2 getImageGenerationStatus (导出函数)

**原始函数签名:**
```javascript
export function getImageGenerationStatus(requestId)
```

**功能:** 查询生图请求状态

## 5. 事件类型 (EventType)

混淆代码中使用的事件常量:

| 事件名 | 说明 |
|-------|------|
| `GENERATE_IMAGE_START` | 开始生图 |
| `GENERATE_IMAGE_PROGRESS` | 生图进度 |
| `GENERATE_IMAGE_COMPLETE` | 生图完成 |
| `GENERATE_IMAGE_FAILED` | 生图失败 |
| `GENERATE_IMAGE_RESPONSE` | 生图响应 |

## 6. 变量映射表

### 全局变量

| 混淆名 | 原始名 | 类型 | 说明 |
|-------|-------|------|------|
| `_0x352b` / `_0x27f022` | `STRING_ARRAY` | Array | 字符串常量数组 |
| `imageGenerationQueue` | `imageGenerationQueue` | Map | 生图请求队列 |
| `imageGenerationIdCounter` | `imageGenerationIdCounter` | Number | 请求ID计数器 |

### requestImageGeneration 内部变量

| 混淆名 | 原始名 | 说明 |
|-------|-------|------|
| `_0x3acb3b` | `LOG_MESSAGES` | 日志消息常量对象 |
| `_0x2714e2` | `requestData` | 请求数据对象 |
| `_0x2059cd` | `requestId` | 唯一请求ID |
| `_0x106b96` | `waitPromise` | 等待响应的Promise |
| `_0x3cedd0` | `timeoutId` | 超时定时器ID |
| `_0x2d61c6` | `responseHandler` | 响应处理函数 |
| `_0x1435ee` | `queueItem` | 队列中的请求项 |

### getImageGenerationStatus 内部变量

| 混淆名 | 原始名 | 说明 |
|-------|-------|------|
| `_0xc43ec` | `STATUS_MESSAGES` | 状态消息对象 |
| `_0x21d9c6` | `messages` | 消息常量引用 |
| `_0x197611` | `queueItem` | 队列中的请求项 |
| `_0x9ac06e` | `statusText` | 状态文本字符串 |

## 7. 核心逻辑还原

### requestImageGeneration 核心逻辑

```
1. 生成唯一ID: `${'IMG'}${++imageGenerationIdCounter}_${Date.now()}`
2. 构建请求数据对象
3. 打印日志: "[AI Image 生成] 请求生图: {prompt, negativePrompt, options}"
4. 加入队列: imageGenerationQueue.set(id, {id, prompt, negativePrompt, options, status: 'pending', timestamp, imageUrl: null, error: null})
5. 发送事件: eventSource.emit('GENERATE_IMAGE_START', requestData)
6. 创建Promise等待响应:
   - 设置30秒超时
   - 监听 'GENERATE_IMAGE_RESPONSE' 事件
   - 响应到达后:
     - 如果 success=true: 更新状态为 'completed'，解析图片URL，resolve(result)
     - 如果 success=false: 更新状态为 'failed'，设置错误信息，reject(error)
   - 超时: reject(new Error('生成图片超时'))
7. 返回 Promise
```

### getImageGenerationStatus 核心逻辑

```
1. 从队列获取请求: queueItem = imageGenerationQueue.get(requestId)
2. 如果不存在: 返回 "未找到生图记录: {requestId}"
3. 构建状态文本:
   - "生图ID: {id}"
   - "提示词: {prompt}"
   - "状态: {status}"
4. 根据状态添加更多信息:
   - 'completed': "图片URL: {imageUrl}"
   - 'failed': "错误: {error}"
5. 返回状态文本
```

## 8. 还原后的代码结构

```javascript
import { EventType } from './config.js';
import { eventSource } from '../../../../../script.js';

// 字符串数组 (混淆存储)
const STRING_ARRAY = [/* 91个混淆字符串 */];

// 图片生成队列
const imageGenerationQueue = new Map();
let imageGenerationIdCounter = 4900; // 0x12c4*0x2 + 0x332 - 0x28ba

/**
 * 请求生成图片
 * @param {string} prompt - 提示词
 * @param {string} negativePrompt - 负面提示词
 * @param {object} options - 选项参数
 * @returns {Promise<{id, imageUrl, prompt}>}
 */
export async function requestImageGeneration(prompt, negativePrompt = '', options = {}) {
    const LOG_MESSAGES = {
        REQUEST_START: '[AI Image 生成] 请求生图',
        NOT_FOUND: '[AI Image 生成] 未找到生图记录:',
        RECEIVE_RESPONSE: '[AI Image 生成] 收到响应:',
        SUCCESS: '[AI Image 生成] 生图成功',
        FAILED: '[AI Image 生成] 生图失败:',
        TRIGGER_EVENT: '[AI Image 生成] 触发生图事件:',
        EMIT: '[AI Image 生成] 发送事件'
    };

    const requestData = {
        prompt: prompt,
        negative_prompt: negativePrompt,
        options: options
    };

    console.log(LOG_MESSAGES.REQUEST_START, requestData);

    const requestId = `IMG${++imageGenerationIdCounter}_${Date.now()}`;

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

    const waitPromise = new Promise((resolve, reject) => {
        const TIMEOUT_MS = 30000;
        const timeoutId = setTimeout(() => {
            eventSource.off(EventType.GENERATE_IMAGE_RESPONSE, responseHandler);
            imageGenerationQueue.delete(requestId);
            reject(new Error('生成图片超时'));
        }, TIMEOUT_MS);

        const responseHandler = (response) => {
            if (response.id !== requestId) return;

            console.log(LOG_MESSAGES.RECEIVE_RESPONSE, response);

            clearTimeout(timeoutId);
            eventSource.off(EventType.GENERATE_IMAGE_RESPONSE, responseHandler);

            const queueItem = imageGenerationQueue.get(requestId);
            if (!queueItem) {
                console.error(LOG_MESSAGES.NOT_FOUND, requestId);
                reject(new Error('未找到生图记录'));
                return;
            }

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
                queueItem.status = 'failed';
                queueItem.error = response.error || '未知错误';
                console.error(LOG_MESSAGES.FAILED, queueItem.error);
                reject(new Error('生成失败: ' + queueItem.error));
            }
        };

        eventSource.on(EventType.GENERATE_IMAGE_RESPONSE, responseHandler);
        console.log(LOG_MESSAGES.EMIT, requestId);
    });

    const info = {
        id: requestId,
        prompt: prompt,
        width: options.width || null,
        height: options.height || null
    };

    if (negativePrompt) {
        info.fullPrompt = prompt + ', ' + negativePrompt;
    }

    console.log(LOG_MESSAGES.TRIGGER_EVENT, info);
    eventSource.emit(EventType.GENERATE_IMAGE_START, info);

    try {
        const result = await waitPromise;
        return result;
    } catch (error) {
        imageGenerationQueue.delete(requestId);
        throw error;
    }
}

/**
 * 获取生图状态
 * @param {string} requestId - 请求ID
 * @returns {string} 状态描述文本
 */
export function getImageGenerationStatus(requestId) {
    const STATUS_MESSAGES = {
        COMPLETED: 'completed',
        SUCCESS_TEXT: '[AI Image Generation] 生图成功，imageUrl: ',
        EQUALS: function(a, b) { return a === b; }
    };

    const queueItem = imageGenerationQueue.get(requestId);

    if (!queueItem) return '未找到生图记录: ' + requestId;

    let statusText = '生图状态查询: ' + requestId + '\n';
    statusText += '提示词: ' + queueItem.prompt + '\n';
    statusText += '状态: ' + queueItem.status + '\n';

    if (STATUS_MESSAGES.EQUALS(queueItem.status, STATUS_MESSAGES.COMPLETED) && queueItem.imageUrl) {
        statusText += '图片URL: ' + queueItem.imageUrl + '\n';
    } else if (STATUS_MESSAGES.EQUALS(queueItem.status, 'failed') && queueItem.error) {
        statusText += '错误: ' + queueItem.error + '\n';
    }

    return statusText;
}
```

## 9. 使用示例

```javascript
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
```

## 10. 混淆特征总结

1. **字符串数组模式**: 所有字符串存储在单一数组中
2. **偏移计算**: 使用偏移量 0x117 (279) 计算实际索引
3. **函数名混淆**: 所有函数名和变量名都是混淆形式
4. **控制流平坦化**: 使用 IIFE 和复杂的条件判断打乱执行流程
5. **死代码**: 存在永远不会执行的分支代码
