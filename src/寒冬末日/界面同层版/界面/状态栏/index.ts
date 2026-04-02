// 接手前请先读：src/流式最小Demo/项目说明-背景业务链与Token约定.md
import '../../../界面/shared/theme-tokens.css';
import App from './App.vue';
import './global.css';
import './theme-tokens.css';

$(() => {
  (async () => {
    await waitGlobalInitialized('Mvu');
    const app = createApp(App);
    app.use(createPinia());
    app.mount('#app');
    $(window).on('pagehide', () => {
      app.unmount();
    });
  })();
});
