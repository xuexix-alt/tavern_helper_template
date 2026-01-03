import App from './App.vue';
import './global.css';

// 声明全局类型
declare const Mvu: {
  events: {
    VARIABLE_UPDATE_ENDED: string;
    VARIABLE_INITIALIZED: string;
  };
  getMvuData: (options: { type: 'message'; message_id: number }) => { stat_data: Record<string, any> };
};
declare const eventOn: <T extends string>(event_type: T, listener: (...args: any[]) => void) => { stop: () => void };

$(async () => {
  // 等待 MVU 初始化完成
  await waitGlobalInitialized('Mvu');

  // 挂载 Vue 应用
  const app = createApp(App);
  app.use(createPinia());
  app.mount('#app');
});

// 卸载时清理资源
$(window).on('pagehide', () => {
  eventClearAll();
});
