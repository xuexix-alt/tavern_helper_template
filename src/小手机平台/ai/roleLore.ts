import type { PromptSourceEntry } from './promptAssembler';

/**
 * 世界书条目的最小结构（与酒馆 WorldbookEntry 兼容，便于脱离酒馆环境测试）
 */
export interface RoleLoreSourceEntry {
  uid: number;
  name: string;
  enabled: boolean;
  strategy: {
    /** constant=蓝灯常驻；selective=绿灯按 keys 触发；vectorized 不参与角色匹配 */
    type: 'constant' | 'selective' | 'vectorized';
    keys: (string | RegExp)[];
  };
  content: string;
}

/**
 * 把世界书条目转换为按角色归组的提示词条目：
 * - 蓝灯（constant，启用）：常驻条目，不归属任何角色
 * - 绿灯（selective，启用）：触发词精确匹配角色名（支持正则触发词）的条目，归属对应角色
 * - 向量化（vectorized）与未启用条目：跳过
 */
export function buildRoleLoreEntries(
  entries: readonly RoleLoreSourceEntry[],
  roleNames: readonly string[],
): PromptSourceEntry[] {
  const result: PromptSourceEntry[] = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    if (entry.strategy.type === 'constant') {
      result.push({ id: String(entry.uid), content: entry.content, relevant: true });
      continue;
    }
    if (entry.strategy.type !== 'selective') continue;
    const roles: string[] = [];
    for (const key of entry.strategy.keys) {
      for (const roleName of roleNames) {
        const matches = typeof key === 'string' ? key === roleName : key.test(roleName);
        if (matches && !roles.includes(roleName)) roles.push(roleName);
      }
    }
    if (roles.length > 0) {
      result.push({ id: String(entry.uid), content: entry.content, relevant: false, roles });
    }
  }
  return result;
}
