import App from './App.vue';
import './global.css';

$(() => {
  const app = createApp(App);
  app.mount('#app');

  $(window).on('pagehide', () => {
    app.unmount();
  });
});
