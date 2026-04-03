/**
 * @deprecated 已废弃。CSS 离屏隐藏方案已被 is_hidden: true 方案替代。
 * 保留文件仅供参考，不再被任何模块导入。
 */

export const HOST_VISIBILITY_CLASS = 'stream-demo-hide-host-chat';
export const HOST_VISIBILITY_STYLE_ID = 'stream-demo-hide-host-chat-style';

export function buildHostTranscriptVisibilitySelector(containerMessageId: number): string {
  const normalizedId = Number.isFinite(Number(containerMessageId)) ? Math.trunc(Number(containerMessageId)) : 0;
  return `body.${HOST_VISIBILITY_CLASS} #chat > .mes[mesid]:not([mesid='${normalizedId}'])`;
}

export function createHostTranscriptVisibilityController() {
  let suspendDepth = 0;

  return {
    isSuspended() {
      return suspendDepth > 0;
    },
    suspend() {
      suspendDepth += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        suspendDepth = Math.max(0, suspendDepth - 1);
      };
    },
  };
}
