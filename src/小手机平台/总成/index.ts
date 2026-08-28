/**
 * 小手机平台总成
 *
 * 一条 import 依次加载平台必需闭包（00运行时管理器 -> 50通信与情报APP），
 * 替代角色卡内六份散装平台脚本；角色专用适配器（如小手机-90寒冬适配器）
 * 仍作为独立脚本安装，负责 owner/session/Shell。
 *
 * 版本控制：
 * - 发布时更新 PLATFORM_ASSEMBLY_VERSION（建议与 git tag 一致）；
 * - 加载后把版本戳写到 window.top.__TAVERN_PHONE_ASSEMBLY__，
 *   重复安装/混版总成会双通道告警（控制台 + toastr）；
 * - 与散装脚本同版本重复注册是幂等的（注册表按 manifest version 去重），
 *   混版本重复注册由模块注册表直接抛错拦截。
 */

import '../脚本/00运行时管理器';
import '../脚本/10平台服务';
import '../脚本/20数据与同步';
import '../脚本/30AI与调度';
import '../脚本/40手机外壳';
import '../脚本/50通信与情报APP';

export const PLATFORM_ASSEMBLY_VERSION = '1.0.0';

export const PLATFORM_ASSEMBLY_MODULES = [
  '00运行时管理器',
  '10平台服务',
  '20数据与同步',
  '30AI与调度',
  '40手机外壳',
  '50通信与情报APP',
] as const;

interface PhoneModuleSnapshotLike {
  capabilities?: readonly string[];
}

interface PhoneAssemblyStamp {
  version: string;
  modules: readonly string[];
  loadedAt: number;
}

interface PhoneAssemblyTopWindow {
  __TAVERN_PHONE_ASSEMBLY__?: PhoneAssemblyStamp;
  TavernPhone?: { getModules?: () => readonly PhoneModuleSnapshotLike[] };
}

/** 总成就绪后等待角色适配器的窗口；超时仍未出现则提示（适配器网络失败/未安装时避免静默失效）。 */
const ADAPTER_WAIT_TIMEOUT_MS = 15_000;

$(() => {
  const topWindow = window.top as unknown as PhoneAssemblyTopWindow | null | undefined;
  if (!topWindow) return;
  const existing = topWindow.__TAVERN_PHONE_ASSEMBLY__;
  if (existing) {
    const message =
      existing.version === PLATFORM_ASSEMBLY_VERSION
        ? `[小手机平台] 总成 v${PLATFORM_ASSEMBLY_VERSION} 已加载过，请检查是否在多个脚本槽重复安装`
        : `[小手机平台] 检测到另一版本总成 v${existing.version}，当前 v${PLATFORM_ASSEMBLY_VERSION} 的重复注册将被注册表拒绝，请清理旧脚本`;
    console.warn(message);
    try {
      toastr.warning(message, '小手机平台总成', { timeOut: 12_000, extendedTimeOut: 4_000 });
    } catch {
      // toastr 不可用时仅保留控制台告警
    }
    return;
  }
  topWindow.__TAVERN_PHONE_ASSEMBLY__ = {
    version: PLATFORM_ASSEMBLY_VERSION,
    modules: [...PLATFORM_ASSEMBLY_MODULES],
    loadedAt: Date.now(),
  };
  console.info(
    `[小手机平台] 总成 v${PLATFORM_ASSEMBLY_VERSION} 已加载（${PLATFORM_ASSEMBLY_MODULES.length} 个模块；角色适配器需单独安装）`,
  );

  // 适配器（phone.adapter）是初始化的根模块：它缺席时平台各模块保持待命，手机不会出现。
  // 适配器脚本与总成是两个独立的网络请求，可能迟到；超时仍查不到该能力则给出一次性提示。
  try {
    topWindow.setTimeout?.(() => {
      if (!topWindow.__TAVERN_PHONE_ASSEMBLY__) return;
      try {
        const modules = topWindow.TavernPhone?.getModules?.() ?? [];
        if (modules.some(module => module.capabilities?.includes('phone.adapter'))) return;
      } catch {
        return;
      }
      const message =
        '[小手机平台] 总成已就绪，但角色适配器（如 小手机-90寒冬适配器）长时间未注册；请确认适配器脚本已安装。';
      console.warn(message);
      try {
        toastr?.warning(message, '小手机平台总成', { timeOut: 12_000, extendedTimeOut: 4_000 });
      } catch {
        // toastr 不可用时仅保留控制台告警
      }
    }, ADAPTER_WAIT_TIMEOUT_MS);
  } catch {
    // 宿主不支持 setTimeout 时保持静默
  }
});
