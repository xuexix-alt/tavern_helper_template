export const HOST_VISIBILITY_CLASS = 'stream-demo-hide-host-chat';
export const HOST_VISIBILITY_STYLE_ID = 'stream-demo-hide-host-chat-style';

export function buildHostTranscriptVisibilitySelector(containerMessageId: number): string {
  const normalizedId = Number.isFinite(Number(containerMessageId)) ? Math.trunc(Number(containerMessageId)) : 0;
  return `body.${HOST_VISIBILITY_CLASS} #chat > .mes[mesid]:not([mesid='${normalizedId}'])`;
}
