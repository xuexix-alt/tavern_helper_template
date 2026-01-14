export type RoomLocation =
  | { kind: 'entrance'; room: '临时客房A' | '临时客房B' | '玄关' | '净化/隔离区' }
  | { kind: 'core'; room: '客厅' | '餐厅/厨房' | '主卧室' | '主浴室' }
  | { kind: 'floor'; floor: string; roomNumber: string }
  | { kind: 'outdoor'; area: string }
  | { kind: 'none' };

type RoomsStatData = any;

export function normalizeRoomTag(tag: string): string {
  const raw = String(tag ?? '').trim();
  if (!raw) return '';

  // 清理误输入的空白（兼容旧存档/手动编辑造成的断行空格）
  const t = raw.replace(/\s+/g, '');

  // 兼容旧命名/别名
  if (t === '核心区/餐厅厨房') return '核心区/餐厅/厨房';
  if (
    t === '玄关/隔离区' ||
    t === '玄关/净化区' ||
    t === '玄关/净化隔离区' ||
    t === '玄关/净化/隔离区' ||
    t === '玄关（净化/隔离区）'
  )
    return '玄关/净化/隔离区';
  if (t.startsWith('室外/')) return `户外/${t.slice('室外/'.length)}`;
  if (t === '室外') return '户外';

  return t;
}

export function parseRoomTag(tag: string): RoomLocation {
  const t = normalizeRoomTag(tag);
  if (!t) return { kind: 'none' };

  if (t === '玄关/临时客房A') return { kind: 'entrance', room: '临时客房A' };
  if (t === '玄关/临时客房B') return { kind: 'entrance', room: '临时客房B' };
  if (t === '玄关/净化/隔离区') return { kind: 'entrance', room: '净化/隔离区' };
  if (t === '玄关') return { kind: 'entrance', room: '玄关' };

  if (t === '核心区/主卧室') return { kind: 'core', room: '主卧室' };
  if (t === '核心区/主浴室') return { kind: 'core', room: '主浴室' };
  if (t === '核心区/客厅') return { kind: 'core', room: '客厅' };
  if (t === '核心区/餐厅/厨房') return { kind: 'core', room: '餐厅/厨房' };

  const m = t.match(/^楼层(\d+)\/(.+)$/);
  if (m) {
    const floor = String(m[1] ?? '').trim();
    const roomNumber = String(m[2] ?? '').trim();
    // 严格限制房号为纯数字（避免“2001门外/门口”等不规范字符串进入系统）
    if (floor && roomNumber && /^\d{4}$/.test(roomNumber)) return { kind: 'floor', floor, roomNumber };
  }

  const outdoor = t.match(/^户外\/(.+)$/);
  if (outdoor) {
    const area = String(outdoor[1] ?? '').trim();
    if (area) return { kind: 'outdoor', area };
    return { kind: 'outdoor', area: '' };
  }
  if (t === '户外') return { kind: 'outdoor', area: '' };

  return { kind: 'none' };
}

export function roomTagFromLocation(loc: RoomLocation): string {
  if (loc.kind === 'entrance') {
    if (loc.room === '临时客房A') return '玄关/临时客房A';
    if (loc.room === '临时客房B') return '玄关/临时客房B';
    if (loc.room === '净化/隔离区') return '玄关/净化/隔离区';
    return '玄关';
  }
  if (loc.kind === 'core') {
    if (loc.room === '客厅') return '核心区/客厅';
    if (loc.room === '餐厅/厨房') return '核心区/餐厅/厨房';
    if (loc.room === '主卧室') return '核心区/主卧室';
    return '核心区/主浴室';
  }
  if (loc.kind === 'floor') return `楼层${loc.floor}/${loc.roomNumber}`;
  if (loc.kind === 'outdoor') return loc.area ? `户外/${loc.area}` : '户外';
  return '';
}

export function findRoleLocation(rooms: RoomsStatData, roleName: string): RoomLocation {
  const name = roleName ?? '';
  if (!name) return { kind: 'none' };

  const entranceA: string[] = _.get(rooms, '玄关.临时客房A入住者', []);
  if (Array.isArray(entranceA) && entranceA.includes(name)) return { kind: 'entrance', room: '临时客房A' };

  const entranceB: string[] = _.get(rooms, '玄关.临时客房B入住者', []);
  if (Array.isArray(entranceB) && entranceB.includes(name)) return { kind: 'entrance', room: '临时客房B' };

  const purify: string[] = _.get(rooms, '玄关.净化隔离区入住者', []);
  if (Array.isArray(purify) && purify.includes(name)) return { kind: 'entrance', room: '净化/隔离区' };

  const bedroom: string[] = _.get(rooms, '核心区.主卧室使用者', []);
  if (Array.isArray(bedroom) && bedroom.includes(name)) return { kind: 'core', room: '主卧室' };

  const bathroom: string[] = _.get(rooms, '核心区.主浴室使用者', []);
  if (Array.isArray(bathroom) && bathroom.includes(name)) return { kind: 'core', room: '主浴室' };

  const livingRoom: string[] = _.get(rooms, '核心区.客厅使用者', []);
  if (Array.isArray(livingRoom) && livingRoom.includes(name)) return { kind: 'core', room: '客厅' };

  const kitchen: string[] = _.get(rooms, '核心区.餐厅厨房使用者', []);
  if (Array.isArray(kitchen) && kitchen.includes(name)) return { kind: 'core', room: '餐厅/厨房' };

  const floor20: Record<string, any> = _.get(rooms, '楼层房间.楼层20房间', {});
  if (floor20 && typeof floor20 === 'object') {
    for (const [roomNumber, data] of Object.entries(floor20)) {
      const residents: string[] = (data as any)?.入住者 ?? [];
      if (Array.isArray(residents) && residents.includes(name)) return { kind: 'floor', floor: '20', roomNumber };
    }
  }

  const floor19: Record<string, any> = _.get(rooms, '楼层房间.楼层19房间', {});
  if (floor19 && typeof floor19 === 'object') {
    for (const [roomNumber, data] of Object.entries(floor19)) {
      const residents: string[] = (data as any)?.入住者 ?? [];
      if (Array.isArray(residents) && residents.includes(name)) return { kind: 'floor', floor: '19', roomNumber };
    }
  }

  return { kind: 'none' };
}
