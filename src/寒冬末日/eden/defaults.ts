import { EdenDocumentSchema, type EdenAbility, type EdenDocument } from './model';

/** 只创建待确认草稿，绝不在载入时写入或覆盖世界书。 */
export function createDefaultEdenDocument(input: {
  missionLore: string;
  technologyLore: string;
  startDay: number;
}): EdenDocument {
  const ability = (
    name: string,
    group: EdenAbility['group'],
    level: number,
    effect: string,
    limit = '',
    condition = '',
  ) => ({
    name,
    group,
    level,
    effect,
    limit,
    condition,
    conditionConfirmed: false,
    enabled: true,
    replaces: [] as string[],
  });
  const document = EdenDocumentSchema.parse({
    version: 1,
    revision: 0,
    savedAt: '',
    level: 1,
    levelNames: ['室内生存', '稳定生活', '对外拓展', '楼层据点'],
    status: '运行',
    rooms: [],
    rescueStartDay: Math.max(0, input.startDay),
    achievements: {},
    missionLore: input.missionLore,
    technologyLore: input.technologyLore,
    abilities: {
      heat: ability('基础供暖供电', '供暖供电', 1, '2001室内具备基础供暖与生活用电', '不能外接，不能供工业生产'),
      door: ability('强化安防门', '防护安保', 1, '强化2001入口，延缓强闯', '只保护入口，强力破坏仍可损坏'),
      food: ability(
        '基础食物与净水',
        '食物与制造',
        1,
        '合成基础主食、罐头与纯水',
        '不含高级食物、工业原料；供给人数不超过8人',
      ),
      shower: ability('限时热水', '清洁与娱乐', 1, '提供热水淋浴与盥洗', '每次10分钟，冷却6小时；不能使用浴缸'),
      listening: ability(
        '近距监听',
        '通讯与情报',
        1,
        '监听2001门口和短距走廊的声音',
        '不能监听其他房间，不能准确识别人名',
      ),
      terminal: ability(
        '伊甸终端',
        '通讯与情报',
        1,
        '提供通讯录、私聊、住户群与情报入口',
        '添加联系人与邀请入群不等于已建立剧情关系',
      ),
      suit: ability(
        '基础防寒服',
        '外出装备',
        1,
        '提供1套适合公寓走廊的防寒服，可防简易割刺',
        '不能防御室外极寒、子弹与重击',
      ),
      load: ability('供能负载提升', '供暖供电', 2, '2001恒温26度，可供基础工业设备和安防设备用电', '仍不能外接'),
      medicine: ability(
        '基础药品',
        '食物与制造',
        2,
        '合成常见基础药品',
        '每天1次，每次1种1盒；无医疗器械、诊断或用药建议',
      ),
      hotwater: ability('全天热水', '清洁与娱乐', 2, '替代限时热水，2001全天可淋浴、盥洗和使用浴缸'),
      floorListening: ability(
        '20层监听',
        '通讯与情报',
        2,
        '升级为可监听20层各房间，结合已知档案辨认声音',
        '不能双向通话，不超出20层',
      ),
      outdoorSuit: ability(
        '室外防护服',
        '外出装备',
        2,
        '替代基础防寒服，数量增至2套，提供室外防寒与身体防弹防护',
        '头颈不防弹，不能抵御重武器、爆炸、火烧与毒气；可被抢夺',
      ),
      'external-power': ability(
        '供暖供电外扩',
        '供暖供电',
        3,
        '2001恒温26度并支持生活及基础工业用电；3级可向20层最多3间外部房间供暖供电，4级可覆盖20层已登记房间',
        '只外接暖、电，不附送供水、监控、制造或安防',
        '纪宁正式加入伊甸',
      ),
      security: ability(
        '近域电击安防',
        '防护安保',
        3,
        '在20层近域走廊与已授权庇护房间实施非致命电击',
        '不能整层压制、远程杀伤或超范围使用',
      ),
      tools: ability(
        '合金工具制造',
        '食物与制造',
        3,
        '制造合金、工具、医疗器械与简易生产设备',
        '需要专业知识及金属塑料原料；不能制造电子设备、汽车、燃料或高级工业品',
      ),
      cinema: ability('影院', '清洁与娱乐', 3, '伊甸可在原有影院放映电影'),
      intercom: ability(
        '楼内对讲与摄像头',
        '通讯与情报',
        3,
        '全楼音频监听与对讲；可人工安装摄像头回传音视频',
        '可视通话由房内发起，摄像头可被破坏；无全知视野',
      ),
      weapons: ability(
        '限量轻武器制造',
        '防护安保',
        4,
        '制造手枪、冲锋枪、步枪及配套弹药',
        '每天1把与20发子弹；不能生产重武器、爆炸物或防弹衣',
      ),
      gourmet: ability(
        '高级食材',
        '食物与制造',
        4,
        '可合成基础食物、纯水及末日前常见食材和饮品',
        '总供应不超过20人；大规模供给仍须建立自主生产',
      ),
      stage: ability(
        '幻景舞台',
        '清洁与娱乐',
        4,
        '在原有舞台酒廊呈现虚拟布景、灯光与声场',
        '限20人以下；不生成实物、改变温度或空间，不用于战斗、读心或直接改变Imp',
        '慕小小正式加入伊甸',
      ),
    },
  });
  const upgrades: Record<string, string[]> = {
    load: ['heat'],
    hotwater: ['shower'],
    floorListening: ['listening'],
    outdoorSuit: ['suit'],
    'external-power': ['heat', 'load'],
    intercom: ['listening', 'floorListening'],
    gourmet: ['food'],
  };
  for (const [id, replaces] of Object.entries(upgrades)) document.abilities[id].replaces = replaces;
  return document;
}
