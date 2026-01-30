import { ref } from 'vue';

export const historyOverlayOpen = ref(false);

// /play 页面：角色/商城/导航等面板弹窗
export const playPanelsOpen = ref(false);

// /play 页面：商城与套餐独立侧栏
// /play 页面：商城浮层
export const shopOverlayOpen = ref(false);

// /play 页面：面板小窗模式
export const playPanelsMini = ref(false);

// 联动高亮：文本生成区 & 商城区
export type FocusArea = 'text' | 'market' | null;
export const focusArea = ref<FocusArea>(null);
