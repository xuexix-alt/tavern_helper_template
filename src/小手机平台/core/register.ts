import type { PhoneModuleRegistration, TavernPhonePublicApi } from './types';

export const PENDING_KEY = '__TAVERN_PHONE_PENDING_MODULES__';
export const RUNTIME_KEY = 'TavernPhone';
export const PHONE_RUNTIME_INSTALLED_EVENT = 'tavern-phone:runtime-installed';

export interface PhoneTopWindow {
  TavernPhone?: TavernPhonePublicApi;
  __TAVERN_PHONE_PENDING_MODULES__?: PhoneModuleRegistration[];
  dispatchEvent?: (event: Event) => boolean;
}

export function dispatchPhoneRuntimeInstalled(topWindow: PhoneTopWindow): void {
  if (typeof topWindow.dispatchEvent !== 'function') return;
  try {
    topWindow.dispatchEvent(new Event(PHONE_RUNTIME_INSTALLED_EVENT));
  } catch {
    // Runtime publication must remain usable when host event delivery is unavailable.
  }
}

export function getPhoneTopWindow(): PhoneTopWindow {
  try {
    if (typeof window === 'undefined' || !window.top) throw new Error('window.top is unavailable');
    void window.top.location.href;
    return window.top as unknown as PhoneTopWindow;
  } catch (error) {
    throw new Error('TavernPhone requires access to window.top; iframe-local fallback is forbidden', { cause: error });
  }
}

/** 模块进入 pending 队列后，runtime 超过该时长仍未安装则向宿主告警（00运行时管理器脚本未加载/加载失败）。 */
const PENDING_RUNTIME_TIMEOUT_MS = 15_000;

export function registerPhoneModule(registration: PhoneModuleRegistration): void {
  const topWindow = getPhoneTopWindow();
  if (topWindow.TavernPhone) {
    topWindow.TavernPhone.registerModule(registration);
    return;
  }

  const pending = topWindow.__TAVERN_PHONE_PENDING_MODULES__ ?? [];
  pending.push(registration);
  topWindow.__TAVERN_PHONE_PENDING_MODULES__ = pending;

  // 脚本加载顺序与时序不定：晚到的 runtime 安装会统一消费 pending，这里只需要
  // 在 runtime 长时间缺席（00 脚本网络失败/被禁用）时给出一次性提示，避免静默失效。
  if ((pending as { timeoutScheduled?: boolean }).timeoutScheduled) return;
  (pending as { timeoutScheduled?: boolean }).timeoutScheduled = true;
  try {
    topWindow.setTimeout?.(() => {
      const stillPending = topWindow.__TAVERN_PHONE_PENDING_MODULES__;
      if (topWindow.TavernPhone || !stillPending?.length) return;
      const names = stillPending.map(item => item.manifest.id).join('、');
      const message = `[小手机平台] 运行时（00运行时管理器）长时间未就绪，${stillPending.length} 个模块仍在等待注册：${names}`;
      console.warn(message);
      try {
        toastr?.warning(message, '小手机平台', { timeOut: 12_000, extendedTimeOut: 4_000 });
      } catch {
        // toastr 不可用时仅保留控制台告警
      }
    }, PENDING_RUNTIME_TIMEOUT_MS);
  } catch {
    // 宿主不支持 setTimeout 时保持静默（测试环境），不影响注册流程
  }
}
