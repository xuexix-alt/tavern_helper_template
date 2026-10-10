import { useEventListener, useThrottleFn } from '@vueuse/core';
import { onBeforeUnmount, onMounted, readonly, ref, type InjectionKey } from 'vue';
import { createPreWebFullscreenController, forwardEscapeToHostOverlay } from './preWebFullscreen';

export const preWebFullscreenKey: InjectionKey<ReturnType<typeof usePreWebFullscreen>> = Symbol('pre-web-fullscreen');

export function usePreWebFullscreen() {
  const isFullscreen = ref(false);
  const viewportHeight = ref(0);
  const dismissOverlay = ref<(() => boolean) | null>(null);
  const frame = window.frameElement as HTMLIFrameElement | null;
  const controller = frame
    ? createPreWebFullscreenController(frame, state => {
        isFullscreen.value = state.active;
        viewportHeight.value = state.height;
      })
    : null;
  const exit = () => controller?.exit();
  const updateViewport = useThrottleFn(() => controller?.updateViewport(), 50);

  function toggle() {
    try {
      if (isFullscreen.value) exit();
      else if (!controller?.enter()) toastr.warning('当前环境无法进入网页全屏');
    } catch (error) {
      console.warn('[PRE] 网页全屏不可用', error);
      toastr.warning('当前环境无法进入网页全屏，已恢复原布局');
    }
  }

  // Host-side overlays (including Eden terminal) own their own Escape handling.
  // Events inside an iframe do not bubble to the host document.
  useEventListener(
    window,
    'keydown',
    event => {
      if (!isFullscreen.value || event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (frame && forwardEscapeToHostOverlay(frame)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const phoneRoot = frame?.ownerDocument.querySelector<HTMLElement>('[data-tavern-phone-root]');
      if (phoneRoot && !phoneRoot.hidden) return;
      if (!dismissOverlay.value?.()) exit();
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
  useEventListener(window, 'pagehide', exit);
  const host = frame?.ownerDocument.defaultView;
  if (host) {
    useEventListener(host, 'resize', updateViewport);
    if (host.visualViewport) {
      useEventListener(host.visualViewport, 'resize', updateViewport);
      useEventListener(host.visualViewport, 'scroll', updateViewport);
    }
  }
  let chatListener: EventOnReturn | undefined;
  onMounted(() => {
    chatListener = eventOn(tavern_events.CHAT_CHANGED, exit);
  });
  onBeforeUnmount(() => {
    chatListener?.stop();
    exit();
  });

  return {
    isFullscreen: readonly(isFullscreen),
    viewportHeight: readonly(viewportHeight),
    toggle,
    exit,
    dismissOverlay,
  };
}
