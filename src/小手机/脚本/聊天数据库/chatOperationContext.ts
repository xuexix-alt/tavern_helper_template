export interface ChatOperationContext<TDatabase> {
  chatId: string;
  dbPromise: Promise<TDatabase>;
}
export function createChatOperationContextFactory<TDatabase>(deps: {
  readChatId(): string | null | undefined;
  openDatabase(): Promise<TDatabase>;
  onDiagnosticChatId(chatId: string): void;
}): () => ChatOperationContext<TDatabase> {
  return () => {
    const chatId = String(deps.readChatId() || 'default');
    deps.onDiagnosticChatId(chatId);
    return { chatId, dbPromise: deps.openDatabase() };
  };
}
