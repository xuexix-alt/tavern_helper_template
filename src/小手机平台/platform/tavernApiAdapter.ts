/**
 * SillyTavern API 适配器
 *
 * 通过酒馆助手的 window.TavernHelper.generateRaw 和 stopGenerationById 访问酒馆 API
 *
 * 重要：脚本运行在 iframe 中，应该通过 window.parent.TavernHelper 访问
 * 参考：@types/function/index.d.ts 和 @types/function/generate.d.ts
 */

export interface TavernGenerateOptions {
  generation_id: string;
  should_stream: false;
  should_silence: true;
  max_chat_history: 0;
  ordered_prompts: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

/**
 * 从可达的窗口中获取酒馆助手的 TavernHelper.generateRaw 函数
 */
function resolveGenerateRawFunction(): ((options: TavernGenerateOptions) => Promise<string>) | null {
  // 脚本运行在 iframe 中，应该通过 window.parent.TavernHelper 访问
  const tryGetFunction = (targetWindow: Window | null): ((options: TavernGenerateOptions) => Promise<string>) | null => {
    if (!targetWindow) return null;
    try {
      const tavernHelper = (targetWindow as any)?.TavernHelper;
      if (tavernHelper && typeof tavernHelper.generateRaw === 'function') {
        return tavernHelper.generateRaw;
      }
    } catch {
      // 跨域访问失败，忽略
    }
    return null;
  };

  // 依次尝试 window.parent（脚本应该用这个）、window.top、window
  const candidates = [
    () => window.parent,
    () => window.top,
    () => window,
  ];

  for (const getCandidate of candidates) {
    try {
      const targetWindow = getCandidate();
      const fn = tryGetFunction(targetWindow);
      if (fn) return fn;
    } catch {
      // 访问失败，继续下一个
    }
  }

  return null;
}

/**
 * 从可达的窗口中获取 TavernHelper.stopGenerationById 函数
 */
function resolveStopGenerationByIdFunction(): ((id: string) => void) | null {
  const tryGetFunction = (targetWindow: Window | null): ((id: string) => void) | null => {
    if (!targetWindow) return null;
    try {
      const tavernHelper = (targetWindow as any)?.TavernHelper;
      if (tavernHelper && typeof tavernHelper.stopGenerationById === 'function') {
        return tavernHelper.stopGenerationById;
      }
    } catch {
      // 跨域访问失败，忽略
    }
    return null;
  };

  // 依次尝试 window.parent、window.top、window
  const candidates = [
    () => window.parent,
    () => window.top,
    () => window,
  ];

  for (const getCandidate of candidates) {
    try {
      const targetWindow = getCandidate();
      const fn = tryGetFunction(targetWindow);
      if (fn) return fn;
    } catch {
      // 访问失败，继续下一个
    }
  }

  return null;
}

/**
 * 创建 generateRaw 实现
 *
 * 该函数返回一个包装后的 generateRaw，用于 TavernProvider
 */
export function createGenerateRaw(): (options: TavernGenerateOptions) => Promise<string> {
  return async (options: TavernGenerateOptions): Promise<string> => {
    const generateRaw = resolveGenerateRawFunction();

    if (!generateRaw) {
      throw new Error('无法访问酒馆助手的 generateRaw 函数，请确保小手机在酒馆助手环境中运行');
    }

    try {
      const result = await Promise.resolve(generateRaw(options));

      if (typeof result !== 'string') {
        throw new Error(`generateRaw 返回类型错误，期望 string，得到 ${typeof result}`);
      }

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`酒馆助手 generateRaw 调用失败: ${error.message}`);
      }
      throw new Error(`酒馆助手 generateRaw 调用失败: ${String(error)}`);
    }
  };
}

/**
 * 创建 stopGenerationById 实现
 *
 * 该函数返回一个包装后的 stopGenerationById，用于 TavernProvider
 */
export function createStopGenerationById(): (id: string) => void {
  return (id: string): void => {
    const stopGenerationById = resolveStopGenerationByIdFunction();

    if (!stopGenerationById) {
      console.warn('[小手机平台] 无法访问酒馆助手的 stopGenerationById 函数，无法停止生成:', id);
      return;
    }

    try {
      stopGenerationById(id);
    } catch (error) {
      console.warn('[小手机平台] 停止生成失败:', error);
    }
  };
}

/**
 * 检查酒馆助手 API 是否可用
 */
export function checkTavernApiAvailability(): {
  available: boolean;
  hasGenerateRaw: boolean;
  hasStopGenerationById: boolean;
  error?: string;
} {
  try {
    const generateRaw = resolveGenerateRawFunction();
    const stopGenerationById = resolveStopGenerationByIdFunction();

    if (!generateRaw) {
      return {
        available: false,
        hasGenerateRaw: false,
        hasStopGenerationById: false,
        error: '无法访问酒馆助手的 generateRaw 函数',
      };
    }

    return {
      available: true,
      hasGenerateRaw: typeof generateRaw === 'function',
      hasStopGenerationById: typeof stopGenerationById === 'function',
    };
  } catch (error) {
    return {
      available: false,
      hasGenerateRaw: false,
      hasStopGenerationById: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
