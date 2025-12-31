// Tavern Helper globals
declare function getVariables(scope: { type: string; script_id?: string; message_id?: number | string }): any;
declare function replaceVariables(
  variables: any,
  scope: { type: string; script_id?: string; message_id?: number | string },
): void;
declare function getCurrentMessageId(): number;
declare function waitGlobalInitialized(name: string): Promise<void> | void;
declare const Mvu: any;

import { Schema, ShopItemSchema } from '../../美人团/schema';

// 对齐美人团 Schema：店铺列表是数组（ShopItemSchema[]），作用域为当前楼层 stat_data
export type MvuShop = (typeof Schema)['_output']['店铺列表'][number];

export interface AppShop extends MvuShop {
  id?: string; // 可选，若 json_patch 为 record 则来自 key
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

  saveShops(rawShops: any) {
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
        return;
      }

      const current = getVariables({ type: 'message', message_id }) || {};
      const stat = current.stat_data || {};
      const nextStat = { ...stat, 店铺列表: safeShops };

      replaceVariables({ stat_data: nextStat }, { type: 'message', message_id });

      window.dispatchEvent(new CustomEvent('shop:cache:updated'));
    } catch (e) {
      console.error('[ShopStoreMVU] saveShops failed', e);
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
