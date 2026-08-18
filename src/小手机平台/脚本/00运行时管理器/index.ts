import { startPhoneComponentHealthNotification } from '../../core/componentHealth';
import { installPhoneRuntime } from '../../core/runtime';

$(() => {
  const runtime = installPhoneRuntime();
  const stopHealthNotification = startPhoneComponentHealthNotification(runtime, {
    notify: summary => {
      if (summary.level === 'success') toastr.success(summary.message, summary.title);
      else toastr.warning(summary.message, summary.title, { timeOut: 12_000, extendedTimeOut: 4_000 });
    },
    onError: error => console.warn('[小手机平台] 组件检查通知失败:', error),
  });
  $(window).one('pagehide', stopHealthNotification);
});
