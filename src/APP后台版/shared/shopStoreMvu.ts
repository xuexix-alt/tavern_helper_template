// Tavern Helper globals
declare function getVariables(scope: { type: string; script_id?: string; message_id?: number | string }): any;
// 尽量使用“增量写入”，避免覆盖其他变量（replaceVariables 会覆盖整个变量表）
declare function updateVariablesWith(
  updateFn: (vars: Record<string, any>) => Record<string, any>,
  scope: { type: string; script_id?: string; message_id?: number | string },
): void;
declare function insertOrAssignVariables(
  variables: Record<string, any>,
  scope: { type: string; script_id?: string; message_id?: number | string },
): void;
// 兜底（极少数环境缺失 updateVariablesWith / insertOrAssignVariables）
declare function replaceVariables(
  variables: any,
  scope: { type: string; script_id?: string; message_id?: number | string },
): void;
declare function getCurrentMessageId(): number;
declare function waitGlobalInitialized(name: string): Promise<void> | void;
declare const Mvu: any;

import { Schema, ShopItemSchema } from '../../美人团/schema';

// 对齐美人团 MVU：initvar.yaml 维护在 src/美人团/世界书/变量/initvar.yaml
// 店铺列表保存到当前楼层的 stat_data.店铺列表
export type MvuShop = (typeof Schema)['_output']['店铺列表'][number];

export interface AppShop extends MvuShop {
  id?: string; // 可选：渲染用补齐
}

function normalizeToArray(value: any): MvuShop[] {
  if (Array.isArray(value)) return value as MvuShop[];
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

// 为前端渲染补齐 ID（不写回 MVU，避免破坏 Schema）
function addViewIds(shops: MvuShop[]): AppShop[] {
  return (shops || []).map((shop, sIdx) => {
    const rawShopId = (shop as any).shop_id ?? (shop as any).id ?? `shop_${sIdx}`;
    const shopId = String(rawShopId);
    const packages = Array.isArray((shop as any).packages)
      ? (shop as any).packages.map((pkg: any, pIdx: number) => {
          const pkgId = pkg?.id ?? `${shopId}_pkg_${pIdx}`;
          return { ...pkg, id: String(pkgId), shop_id: shopId };
        })
      : [];
    return {
      ...(shop as any),
      id: String((shop as any).id ?? shopId),
      shop_id: (shop as any).shop_id,
      packages,
    };
  });
}

export const shopStoreMvu = {
  getShops(): AppShop[] {
    try {
      const message_id = getCurrentMessageId?.() ?? 'latest';

      if (typeof waitGlobalInitialized === 'function') {
        try {
          waitGlobalInitialized('Mvu');
        } catch {
          // ignore wait errors
        }
      }

      const data = ((): any => {
        if (typeof Mvu !== 'undefined' && Mvu?.getMvuData) {
          return Mvu.getMvuData({ type: 'message', message_id });
        }
        return getVariables({ type: 'message', message_id });
      })();

      const statData = data?.stat_data || data || {};
      const parsed = Schema.safeParse(statData);
      const shopList = parsed.success ? parsed.data.店铺列表 : normalizeToArray(statData['店铺列表']);
      return addViewIds(shopList);
    } catch (e) {
      console.error('[ShopStoreMVU] getShops failed', e);
      return [];
    }
  },

  saveShops(rawShops: any): { ok: boolean; saved: number } {
    try {
      const message_id = getCurrentMessageId?.() ?? 'latest';
      const shopsArray = normalizeToArray(rawShops);

      // 校验/裁剪为 Schema 期望的结构
      const safeShops = shopsArray
        .map(shop => ShopItemSchema.safeParse(shop))
        .filter(r => r.success)
        .map(r => r.data);

      if (safeShops.length === 0) {
        console.warn('[ShopStoreMVU] saveShops skipped: no valid shops');
        return { ok: false, saved: 0 };
      }

      const scope = { type: 'message', message_id } as const;

      if (typeof updateVariablesWith === 'function') {
        updateVariablesWith((vars: Record<string, any>) => {
          const next = vars && typeof vars === 'object' ? vars : {};
          const stat = next.stat_data && typeof next.stat_data === 'object' ? next.stat_data : {};
          next.stat_data = { ...stat, 店铺列表: safeShops };
          return next;
        }, scope);
      } else if (typeof insertOrAssignVariables === 'function') {
        const current = getVariables(scope) || {};
        const stat = current.stat_data && typeof current.stat_data === 'object' ? current.stat_data : {};
        const nextStat = { ...stat, 店铺列表: safeShops };
        insertOrAssignVariables({ stat_data: nextStat }, scope);
      } else {
        // 最后兜底：尽量保留已有变量结构
        const current = getVariables(scope) || {};
        const stat = current.stat_data && typeof current.stat_data === 'object' ? current.stat_data : {};
        const nextStat = { ...stat, 店铺列表: safeShops };
        replaceVariables({ ...(current || {}), stat_data: nextStat }, scope);
      }

      window.dispatchEvent(new CustomEvent('shop:cache:updated'));
      return { ok: true, saved: safeShops.length };
    } catch (e) {
      console.error('[ShopStoreMVU] saveShops failed', e);
      return { ok: false, saved: 0 };
    }
  },

  deleteShop(id: string) {
    try {
      const newShops = this.getShops().filter((s: any) => String((s as any).id ?? '') !== String(id));
      this.saveShops(newShops);
    } catch (e) {
      console.error('[ShopStoreMVU] deleteShop failed', e);
    }
  },
};
