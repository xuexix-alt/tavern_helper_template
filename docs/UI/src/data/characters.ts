export interface Character {
  id: string;
  name: string;
  role: string;
  status: '活跃' | '待命' | '离线';
  stats: {
    str: number;
    int: number;
    agi: number;
  };
  description: string;
}

export const CHARACTERS: Character[] = [
  {
    id: 'char-01',
    name: '凯伦 "幽灵" 万斯',
    role: '潜入者',
    status: '活跃',
    stats: { str: 45, int: 88, agi: 92 },
    description: '专长于隐蔽行动和网络战。目前位置不明。'
  },
  {
    id: 'char-02',
    name: '734型 "堡垒"',
    role: '重装突击',
    status: '待命',
    stats: { str: 98, int: 30, agi: 25 },
    description: '重型装甲战斗合成人。需要 Alpha-7 授权码才能部署。'
  },
  {
    id: 'char-03',
    name: '阿里斯·索恩 博士',
    role: '神经技术专家',
    status: '离线',
    stats: { str: 20, int: 95, agi: 40 },
    description: '奇美拉计划的首席研究员。停电前最后一次出现在第4区。'
  },
    {
    id: 'char-04',
    name: 'xjiam',
    role: '神经技术专家',
    status: '离线',
    stats: { str: 20, int: 923, agi: 2331 },
    description: '奇美拉计划的首席研究员。停电前最后一次出现在第4区。'
  }
];
