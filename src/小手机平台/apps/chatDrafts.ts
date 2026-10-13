/** 会话级草稿；存储受限时仍在当前 APP 实例内保留。 */
export class ChatDrafts {
  private readonly drafts = new Map<string, { text: string; revision: number }>();

  constructor(private readonly getStorage: () => Storage | null | undefined) {}

  key(sessionKey: string, conversationId: string): string {
    return `tavern-phone:draft:${JSON.stringify([sessionKey, conversationId])}`;
  }

  get(key: string): { text: string; revision: number } {
    let draft = this.drafts.get(key);
    if (!draft) {
      let text = '';
      try {
        text = this.getStorage()?.getItem(key) ?? '';
      } catch {
        // 隐私模式或存储不可用时使用内存草稿。
      }
      draft = { text, revision: 0 };
      this.drafts.set(key, draft);
    }
    return draft;
  }

  set(key: string, text: string): number {
    const revision = this.get(key).revision + 1;
    this.drafts.set(key, { text, revision });
    try {
      const storage = this.getStorage();
      if (text) storage?.setItem(key, text);
      else storage?.removeItem(key);
    } catch {
      // 配额耗尽也不能阻止用户输入或发送。
    }
    return revision;
  }

  clearSent(key: string, revision: number): void {
    if (this.get(key).revision === revision) this.set(key, '');
  }
}
