export function shouldForceTranscriptDomRefresh(reason: string): boolean {
  const normalized = String(reason ?? '').trim();
  return normalized.startsWith('image:request:') || normalized.startsWith('image:persist:');
}

export function buildTranscriptEntryKey(messageId: number, domRevision = 0): string {
  const normalizedMessageId = Number.isFinite(Number(messageId)) ? Math.trunc(Number(messageId)) : 0;
  const normalizedRevision = Number.isFinite(Number(domRevision)) ? Math.trunc(Number(domRevision)) : 0;
  return `${normalizedMessageId}:${normalizedRevision}`;
}
