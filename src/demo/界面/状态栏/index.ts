import { waitUntil } from 'async-wait-until';
import App from './App.vue';
import './global.css';
import { chatVisibilityManager } from './lib/ChatVisibilityManager';

$(async () => {
  await waitGlobalInitialized('Mvu');
  await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'));

  await chatVisibilityManager.initialize();

  createApp(App).use(createPinia()).mount('#app');

  $(window).on('pagehide', async () => {
    await chatVisibilityManager.showAll();
  });
});
