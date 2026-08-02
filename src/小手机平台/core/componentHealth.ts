import type { PhoneModuleSnapshot, PhoneModuleStatus, TavernPhonePublicApi } from './types';

export const PHONE_RUNTIME_VERSION = '1.1.0';

export interface PhoneComponentRequirement {
  readonly id: string;
  readonly label: string;
  readonly version: string;
  readonly activation: 'ready' | 'standby';
}

export type PhoneComponentStatus = PhoneModuleStatus | 'MISSING';

export interface PhoneComponentCheck extends PhoneComponentRequirement {
  readonly actualVersion: string | null;
  readonly status: PhoneComponentStatus;
}

export interface PhoneComponentHealthReport {
  readonly healthy: boolean;
  readonly total: number;
  readonly detected: number;
  readonly active: number;
  readonly standby: number;
  readonly components: readonly PhoneComponentCheck[];
  readonly issues: readonly string[];
}

export interface PhoneComponentHealthSummary {
  readonly level: 'success' | 'warning';
  readonly title: string;
  readonly message: string;
  readonly report: PhoneComponentHealthReport;
}

export const PHONE_COMPONENT_REQUIREMENTS: readonly PhoneComponentRequirement[] = Object.freeze([
  Object.freeze({
    id: 'phone.runtime',
    label: '小手机-00运行时管理器',
    version: PHONE_RUNTIME_VERSION,
    activation: 'ready',
  }),
  Object.freeze({ id: 'platform.services', label: '小手机-10平台服务', version: '1.0.0', activation: 'ready' }),
  Object.freeze({ id: 'data.sync', label: '小手机-20数据与同步', version: '1.0.0', activation: 'ready' }),
  Object.freeze({ id: 'ai.scheduler', label: '小手机-30AI与调度', version: '1.0.1', activation: 'ready' }),
  Object.freeze({ id: 'phone.shell', label: '小手机-40手机外壳', version: '1.0.1', activation: 'ready' }),
  Object.freeze({ id: 'communication.apps', label: '小手机-50通信与情报APP', version: '1.0.1', activation: 'ready' }),
  Object.freeze({ id: 'intelligence.services', label: '60智能情报', version: '1.0.0', activation: 'standby' }),
  Object.freeze({ id: 'wechat.adapter', label: '70微信APP适配器', version: '1.0.0', activation: 'standby' }),
  Object.freeze({ id: 'main.adapter', label: '90主适配器', version: '1.0.0', activation: 'standby' }),
  Object.freeze({ id: 'winter.adapter', label: '小手机-90寒冬适配器', version: '1.1.1', activation: 'ready' }),
]);

export function evaluatePhoneComponentHealth(
  moduleSnapshots: readonly PhoneModuleSnapshot[],
): PhoneComponentHealthReport {
  const modules = new Map(moduleSnapshots.map(snapshot => [snapshot.id, snapshot]));
  const components = PHONE_COMPONENT_REQUIREMENTS.map(requirement => {
    if (requirement.id === 'phone.runtime') {
      return Object.freeze({ ...requirement, actualVersion: PHONE_RUNTIME_VERSION, status: 'READY' as const });
    }
    const snapshot = modules.get(requirement.id);
    return Object.freeze({
      ...requirement,
      actualVersion: snapshot?.version ?? null,
      status: snapshot?.status ?? ('MISSING' as const),
    });
  });
  const issues: string[] = [];
  for (const component of components) {
    if (component.status === 'MISSING') {
      issues.push(`${component.label}：缺失`);
      continue;
    }
    if (component.actualVersion !== component.version) {
      issues.push(`${component.label}：当前 ${component.actualVersion ?? '未知'}，需要 ${component.version}`);
    }
    if (component.activation === 'ready' && component.status !== 'READY') {
      issues.push(`${component.label}：未初始化（${component.status}）`);
    } else if (
      component.activation === 'standby' &&
      component.status !== 'READY' &&
      component.status !== 'REGISTERED'
    ) {
      issues.push(`${component.label}：状态异常（${component.status}）`);
    }
  }
  return Object.freeze({
    healthy: issues.length === 0,
    total: components.length,
    detected: components.filter(component => component.status !== 'MISSING').length,
    active: components.filter(component => component.status === 'READY').length,
    standby: components.filter(component => component.status === 'REGISTERED').length,
    components: Object.freeze(components),
    issues: Object.freeze(issues),
  });
}

export function formatPhoneComponentHealth(report: PhoneComponentHealthReport): PhoneComponentHealthSummary {
  const title = '伊甸终端组件检查';
  if (report.healthy) {
    return Object.freeze({
      level: 'success',
      title,
      message: `${report.detected}/${report.total} 个组件版本一致；${report.active} 个运行中，${report.standby} 个待命`,
      report,
    });
  }
  return Object.freeze({
    level: 'warning',
    title,
    message: `${report.detected}/${report.total} 个组件已检测\n${report.issues.join('\n')}`,
    report,
  });
}

export interface PhoneComponentNotificationOptions {
  readonly delayMs?: number;
  readonly schedule?: (callback: () => void, delayMs: number) => number;
  readonly cancel?: (timer: number) => void;
  readonly notify: (summary: PhoneComponentHealthSummary) => void;
  readonly onError?: (error: unknown) => void;
}

export function startPhoneComponentHealthNotification(
  runtime: TavernPhonePublicApi,
  options: PhoneComponentNotificationOptions,
): () => void {
  const delayMs = options.delayMs ?? 3_000;
  const schedule = options.schedule ?? ((callback, delay) => window.setTimeout(callback, delay));
  const cancel = options.cancel ?? (timer => window.clearTimeout(timer));
  let timer: number | null = null;
  let active = true;
  let notified = false;
  let stopListening = (): void => undefined;

  const run = (): void => {
    timer = null;
    if (!active || notified) return;
    notified = true;
    stopListening();
    try {
      options.notify(formatPhoneComponentHealth(evaluatePhoneComponentHealth(runtime.getModules())));
    } catch (error) {
      options.onError?.(error);
    }
  };
  const queue = (): void => {
    if (!active || notified) return;
    if (timer !== null) cancel(timer);
    timer = schedule(run, delayMs);
  };
  stopListening = runtime.on('modules', queue);
  queue();

  return () => {
    if (!active) return;
    active = false;
    if (timer !== null) cancel(timer);
    timer = null;
    stopListening();
  };
}
