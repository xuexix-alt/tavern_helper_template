export class ChatVisibilityManager {
  private hiddenIds = new Set<number>();
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;

    await this.hideAllExistingChats();
    this.setupAutoHideListener();
    this.setupChatChangedListener();

    this.isInitialized = true;
  }

  private async hideAllExistingChats() {
    const lastId = getLastMessageId();
    if (lastId <= 0) return;

    const messages = getChatMessages(`1-${lastId}`, {
      include_swipes: false,
    });

    const idsToHide = messages.map(m => m.message_id).filter(id => id > 0 && !this.hiddenIds.has(id));

    if (idsToHide.length > 0) {
      await setChatMessages(idsToHide.map(id => ({ message_id: id, is_hidden: true })));
      idsToHide.forEach(id => this.hiddenIds.add(id));
    }
  }

  private setupAutoHideListener() {
    eventOn(tavern_events.MESSAGE_SENT, async (messageId: number) => {
      if (this.hiddenIds.has(messageId)) return;

      await setChatMessages([
        {
          message_id: messageId,
          is_hidden: true,
        },
      ]);
      this.hiddenIds.add(messageId);
    });
  }

  private setupChatChangedListener() {
    eventOn(tavern_events.CHAT_CHANGED, () => {
      this.hiddenIds.clear();
      this.isInitialized = false;
      this.initialize();
    });
  }

  async showAll() {
    if (this.hiddenIds.size === 0) return;

    const messages = getChatMessages(Array.from(this.hiddenIds).join('-'), { hide_state: 'hidden' });

    await setChatMessages(messages.map(m => ({ message_id: m.message_id, is_hidden: false })));
    this.hiddenIds.clear();
  }

  getHiddenCount() {
    return this.hiddenIds.size;
  }
}

export const chatVisibilityManager = new ChatVisibilityManager();
