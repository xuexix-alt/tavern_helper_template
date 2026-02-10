/**
 * 敏感内容去敏感化映射表
 *
 * 用于将不符合平台规范的敏感内容映射为中性表述。
 * 所有界面显示文本应使用映射后的值，而非原始敏感内容。
 */

// ============================================
// 品牌与应用名称映射
// ============================================
export const brandMapping: Record<string, string> = {
  // 原始名称 -> 去敏感化名称
  美人团外卖: '创角工坊',
  美人团: '创角工坊',
  'APP 后台版': '创作后台',
};

// ============================================
// 分类标签映射
// ============================================
export const categoryMapping: Record<string, string> = {
  // 原始标签 -> 去敏感化标签
  路人: '随机',
  偶遇: '邂逅',
  AV: '影视',
  街拍: '外景',
  熟人: '相识',
  乱伦: '家族',
  职场: '办公',
  友妻: '朋友',
};

// ============================================
// 生成关键词映射（用于指令中心）
// ============================================
export const keywordMapping: Record<string, string> = {
  // 原始关键词 -> 去敏感化关键词
  各类路人商品: '随机角色包',
  路人商品: '随机角色',
  路人: '随机',
  熟人商品: '相识角色',
  各类熟人商品: '相识角色包',
  色情片中的AV女优主题: '影视演员主题',
  心动女孩: '心动角色',
  心动美女: '心动角色',
  '乱伦主题（不得含母子）': '家族关系主题（不涉及直系血亲）',
  各类职场主题: '办公场景主题',
  各类朋友妻主题: '朋友相关主题',
};

// ============================================
// DLC与特殊内容映射
// ============================================
export const dlcMapping: Record<string, string> = {
  // 原始名称 -> 去敏感化名称
  国企往事: '企业故事',
  组织部派来一个年轻人: '组织派遣',
  组织部: '调配中心',
};

// ============================================
// 角色名称映射（示例角色名）
// ============================================
// 注意：角色名称本身不敏感，无需映射。此处保留结构以备将来特殊需求。
export const characterNameMapping: Record<string, string> = {
  // 角色名称无需去敏感化
};

// ============================================
// 界面文本映射（显示文本）
// ============================================
export const uiTextMapping: Record<string, string> = {
  // 原始文本 -> 去敏感化文本
  一站式角色扮演入口: '一站式角色创作入口',
  '生成店铺、下单演绎、回收订单': '生成角色、选择剧本、完成任务',
  三步开局: '三步上手',
  生成店铺: '创建角色',
  挑选套餐: '选择剧本',
  沉浸剧情: '沉浸演绎',
  '正文连贯输出，订单闭环': '内容连贯输出，流程闭环',
  侧边商场随时下单: '侧边栏随时选择',
  指令中心: '创作中心',
  '输入关键词或点分类，直接生成店铺': '输入关键词或选择分类，直接生成角色',
  '输入关键词，生成店铺与套餐': '输入关键词，生成角色与剧本',
  'DLC 专案': '专题创作',
  一键路人: '随机生成',
  公告与说明: '使用说明',
  活动: '更新',
  玩法: '提示',
  进入正文: '开始创作',
  浏览店铺: '浏览角色',
  立即生成: '开始生成',
  '生成中...': '创作中...',
  店铺详情: '角色详情',
  商品详情: '剧本详情',
  精选套餐: '精选剧本',
  私密写真: '相册展示',
  露脸图: '头像照',
  时装秀: '服装展示',
  私密拍: '私房照',
  玩法和备注: '要求与备注',
  特色玩法: '剧本特色',
  顾客评价: '用户评价',
  玩法特色: '剧本特色',
  历史订单: '历史记录',
  订单状态: '服务状态',
  订单列表: '服务列表',
  订单消费: '消费金额',
  订单详情: '详情',
  下单: '预订',
  下单备注: '预订备注',
  再次下单: '再次预订',
  发送下单指令: '发送预订指令',
  立即下单: '立即预订',
  下单次数: '复购次数',
  已发送下单指令: '已发送预订指令',
  店铺: '角色包',
  套餐: '剧本',
  商城与套餐: '剧本与角色',
  服务中的订单: '进行中的服务',
  订单价格: '价格',
  服务进度: '互动进度',
  服务次数: '互动次数',
  心跳: '脉搏',
};

// ============================================
// 下单备注占位符敏感词映射
// ============================================
export const placeholderMapping: Record<string, string> = {
  // 原始敏感词 -> 去敏感化表述
  时空替换: '身份变换',
  NTR: '情感波折',
  NTL: '关系突破',
  露出: '公开场合',
  换装秀: '服装变换',
  反差婊: '反差萌',
};

// ============================================
// 服务状态字段映射（身体/性相关）
// ============================================
export const serviceFieldMapping: Record<string, string> = {
  // 原始字段 -> 去敏感化字段

  // 身体特征相关
  罩杯: '身材',
  乳形: '身形',
  乳房: '上装',
  胸部: '上装',
  私处: '下装',
  姿势: '体态',

  // 性经验相关
  处女: '初次经历',
  性伴侣数量: '交往经历数',
  性经验: '情感经历',

  // 服务统计相关
  本次服务性交次数: '本次互动次数',
  内射次数: '深度互动次数',
  服务统计: '互动统计',
  服务进度: '互动进度',
  服务次数: '互动次数',
  怀孕几率: '受孕概率',

  // 心理状态
  当前所想: '当前心情',
  性格类型: '性格特征',
};

// ============================================
// 套餐/商品类型映射
// ============================================
export const packageTypeMapping: Record<string, string> = {
  // 原始类型 -> 去敏感化类型
  综合: '完整',
  服务中: '进行中',
  服务结束: '已完成',
  商品类型: '剧本类型',
};

// ============================================
// 导出文件名映射
// ============================================
export const exportFileMapping: Record<string, string> = {
  // 原始文件名部分 -> 去敏感化
  美人团: '创作工具',
  店铺导出: '角色包导出',
};

// ============================================
// 统一的去敏感化函数
// ============================================

/**
 * 对文本进行去敏感化处理
 * @param text 原始文本
 * @returns 去敏感化后的文本
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  // 按优先级依次替换（先替换长文本，再替换短文本）
  const mappings = [
    brandMapping,
    dlcMapping,
    keywordMapping,
    categoryMapping,
    uiTextMapping,
    placeholderMapping,
    serviceFieldMapping,
    packageTypeMapping,
    exportFileMapping,
  ];

  for (const mapping of mappings) {
    for (const [original, sanitized] of Object.entries(mapping)) {
      if (result.includes(original)) {
        result = result.split(original).join(sanitized);
      }
    }
  }

  return result;
}

/**
 * 对对象进行深度去敏感化处理
 * @param obj 原始对象
 * @param keys 要处理的键列表（支持嵌套路径，如 '基础信息.姓名'）
 * @returns 去敏感化后的对象
 */
export function sanitizeObject(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== 'object') return obj;

  const result = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of keys) {
    const path = key.split('.');
    let current = result;

    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) break;
      current = current[path[i]];
    }

    const lastKey = path[path.length - 1];
    if (current[lastKey] !== undefined) {
      if (typeof current[lastKey] === 'string') {
        current[lastKey] = sanitizeText(current[lastKey]);
      }
    }
  }

  return result;
}

/**
 * 对导出文件名进行去敏感化处理
 * @param originalName 原始文件名
 * @returns 去敏感化后的文件名
 */
export function sanitizeExportFileName(originalName: string): string {
  let result = originalName;
  for (const [original, sanitized] of Object.entries(exportFileMapping)) {
    result = result.split(original).join(sanitized);
  }
  return result;
}

/**
 * 获取去敏感化后的显示文本
 * @param category 原始分类名
 * @returns 去敏感化后的分类名
 */
export function getSanitizedCategory(category: string): string {
  return categoryMapping[category] || category;
}

/**
 * 获取去敏感化后的字段标签
 * @param field 原始字段名
 * @returns 去敏感化后的字段标签
 */
export function getSanitizedFieldLabel(field: string): string {
  return serviceFieldMapping[field] || field;
}

/**
 * 获取去敏感化后的界面文本
 * @param text 原始文本
 * @returns 去敏感化后的文本
 */
export function getSanitizedUiText(text: string): string {
  return uiTextMapping[text] || text;
}

// ============================================
// 导出完整映射表供外部使用
// ============================================
export const allMappings = {
  brand: brandMapping,
  category: categoryMapping,
  keyword: keywordMapping,
  dlc: dlcMapping,
  characterName: characterNameMapping,
  uiText: uiTextMapping,
  placeholder: placeholderMapping,
  serviceField: serviceFieldMapping,
  packageType: packageTypeMapping,
  exportFile: exportFileMapping,
};
