export type RefreshDomain = 'transcript' | 'mvuSources' | 'roleSidebar' | 'gallery';

export type RefreshEventInput = {
  type: string;
  messageId?: number | null;
  selectedSourceMessageId?: number | null;
  affectsTranscript?: boolean;
};

function pushDomain(out: RefreshDomain[], domain: RefreshDomain) {
  if (!out.includes(domain)) out.push(domain);
}

export function resolveRefreshDomainsForEvent(input: RefreshEventInput): RefreshDomain[] {
  const type = String(input.type ?? '').trim();
  const out: RefreshDomain[] = [];

  switch (type) {
    case 'host.stream_token_received':
    case 'host.smooth_stream_token_received':
    case 'host.generation_started':
      pushDomain(out, 'transcript');
      return out;

    case 'host.message_received':
    case 'host.message_updated':
    case 'host.message_swiped':
    case 'host.message_deleted':
    case 'host.more_messages_loaded':
    case 'host.chat_changed':
      pushDomain(out, 'transcript');
      pushDomain(out, 'mvuSources');
      pushDomain(out, 'gallery');
      return out;

    case 'host.message_sent':
    case 'host.message_edited':
    case 'host.generation_ended':
      pushDomain(out, 'transcript');
      pushDomain(out, 'gallery');
      return out;

    case 'gallery.changed':
      pushDomain(out, 'gallery');
      return out;

    case 'mvu.variable_initialized':
    case 'mvu.variable_update_ended':
      pushDomain(out, 'mvuSources');
      if (
        Number.isFinite(Number(input.messageId)) &&
        Number.isFinite(Number(input.selectedSourceMessageId)) &&
        Math.trunc(Number(input.messageId)) === Math.trunc(Number(input.selectedSourceMessageId))
      ) {
        pushDomain(out, 'roleSidebar');
      }
      if (input.affectsTranscript === true) {
        pushDomain(out, 'transcript');
      }
      return out;

    case 'mvu.variable_update_started':
      pushDomain(out, 'roleSidebar');
      return out;

    default:
      pushDomain(out, 'transcript');
      return out;
  }
}
