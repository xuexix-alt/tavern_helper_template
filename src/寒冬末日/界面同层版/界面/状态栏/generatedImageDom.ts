export function buildIframeMessageRootSelectors(messageId: number): string[] {
  const mesid = Math.trunc(messageId);
  return [
    `.assistant-body-wrap[data-message-id='${mesid}']`,
    `.assistant-body[data-message-id='${mesid}']`,
    `.transcript-entry[data-message-id='${mesid}'] .assistant-body-wrap`,
    `.transcript-entry[data-message-id='${mesid}'] .assistant-body`,
  ];
}
