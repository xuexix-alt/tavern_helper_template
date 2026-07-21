export interface ChatGenerationController {
  start(): AbortController | null;
  finish(operationController: AbortController): void;
  abort(): void;
  getStatus(): { isGenerating: boolean };
}

export function createChatGenerationController(): ChatGenerationController {
  let currentController: AbortController | null = null;

  return {
    start() {
      if (currentController) return null;
      currentController = new AbortController();
      return currentController;
    },

    finish(operationController) {
      if (currentController === operationController) {
        currentController = null;
      }
    },

    abort() {
      const operationController = currentController;
      currentController = null;
      operationController?.abort();
    },

    getStatus() {
      return { isGenerating: currentController !== null };
    },
  };
}
