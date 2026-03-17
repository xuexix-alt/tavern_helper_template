type PendingRequest = {
  requestId: string;
  prompt: string;
  promptToken: string;
};

type PendingTask = {
  id: string;
  messageId: number;
  createdAt: number;
  collectingUntil: number;
  requests: PendingRequest[];
};

type BufferedResponse = {
  requestId: string;
  prompt: string;
  promptToken: string;
  imageData: string;
  createdAt: number;
};

type CreateImagePendingTaskManagerOptions = {
  now?: () => number;
  collectingWindowMs?: number;
};

type ImageRequestEventPayload = {
  id?: unknown;
  prompt?: unknown;
};

type ImageResponseEventPayload = {
  id?: unknown;
  prompt?: unknown;
  imageData?: unknown;
};

function collectPromptTokens(input: string): string[] {
  const out: string[] = [];
  const regex = /([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(String(input ?? '')))) {
    out.push(String(match[0] ?? '').trim());
  }
  return out;
}

function buildPromptTokenFromPrompt(rawPrompt: string): string {
  const prompt = String(rawPrompt ?? '').trim();
  if (!prompt) return '';
  const existing = collectPromptTokens(prompt)[0];
  if (existing) return existing;
  return `image###${prompt}###`;
}

export function createImagePendingTaskManager(options: CreateImagePendingTaskManagerOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const collectingWindowMs = Math.max(100, Math.trunc(Number(options.collectingWindowMs ?? 2_000)));
  const tasks: PendingTask[] = [];
  const bufferedResponses: BufferedResponse[] = [];

  function cleanup(referenceTime = now()) {
    const cutoff = referenceTime - 5 * 60_000;
    for (let index = tasks.length - 1; index >= 0; index -= 1) {
      if (tasks[index].createdAt < cutoff) tasks.splice(index, 1);
    }
    for (let index = bufferedResponses.length - 1; index >= 0; index -= 1) {
      if (bufferedResponses[index].createdAt < cutoff) bufferedResponses.splice(index, 1);
    }
  }

  function startTask(messageId: number) {
    const createdAt = now();
    cleanup(createdAt);
    tasks.push({
      id: `task:${messageId}:${createdAt}`,
      messageId,
      createdAt,
      collectingUntil: createdAt + collectingWindowMs,
      requests: [],
    });
  }

  function registerRequest(payload: ImageRequestEventPayload) {
    const requestId = String(payload?.id ?? '').trim();
    const prompt = String(payload?.prompt ?? '').trim();
    if (!requestId || !prompt) return null;

    const referenceTime = now();
    cleanup(referenceTime);
    const promptToken = buildPromptTokenFromPrompt(prompt);
    const bufferedIndex = bufferedResponses.findIndex(
      item => item.requestId === requestId || item.promptToken === promptToken || item.prompt === prompt,
    );
    const bufferedResponse = bufferedIndex >= 0 ? (bufferedResponses.splice(bufferedIndex, 1)[0] ?? null) : null;

    const task =
      tasks
        .slice()
        .reverse()
        .find(item => item.collectingUntil >= referenceTime) ??
      (bufferedResponse ? (tasks[tasks.length - 1] ?? null) : null);

    if (!task) {
      if (bufferedResponse != null) bufferedResponses.push(bufferedResponse);
      return null;
    }

    if (!task.requests.some(item => item.requestId === requestId)) {
      task.requests.push({
        requestId,
        prompt,
        promptToken,
      });
    }
    task.collectingUntil = Math.max(task.collectingUntil, referenceTime + collectingWindowMs);

    return {
      messageId: task.messageId,
      bufferedResponse:
        bufferedResponse == null
          ? null
          : {
              messageId: task.messageId,
              requestId: bufferedResponse.requestId,
              prompt: bufferedResponse.prompt,
              promptToken: bufferedResponse.promptToken,
              imageData: bufferedResponse.imageData,
            },
    };
  }

  function consumeResponse(payload: ImageResponseEventPayload) {
    const requestId = String(payload?.id ?? '').trim();
    const prompt = String(payload?.prompt ?? '').trim();
    const imageData = String(payload?.imageData ?? '').trim();
    if (!imageData) return null;

    cleanup(now());

    let taskMatch: PendingTask | null = null;
    let requestMatch: PendingRequest | null = null;

    if (requestId) {
      for (const task of tasks) {
        const found = task.requests.find(item => item.requestId === requestId);
        if (found) {
          taskMatch = task;
          requestMatch = found;
          break;
        }
      }
    }

    if (!taskMatch && prompt) {
      const promptToken = buildPromptTokenFromPrompt(prompt);
      for (const task of tasks) {
        const found = task.requests.find(item => item.promptToken === promptToken || item.prompt === prompt);
        if (found) {
          taskMatch = task;
          requestMatch = found;
          break;
        }
      }
    }

    if (!taskMatch || !requestMatch) {
      bufferedResponses.push({
        requestId,
        prompt,
        promptToken: buildPromptTokenFromPrompt(prompt),
        imageData,
        createdAt: now(),
      });
      return null;
    }

    return {
      messageId: taskMatch.messageId,
      requestId: requestMatch.requestId,
      prompt: requestMatch.prompt,
      promptToken: requestMatch.promptToken,
      imageData,
    };
  }

  return {
    startTask,
    registerRequest,
    consumeResponse,
    getDebugState() {
      return tasks.map(task => ({
        id: task.id,
        messageId: task.messageId,
        createdAt: task.createdAt,
        collectingUntil: task.collectingUntil,
        requests: task.requests.map(item => ({
          requestId: item.requestId,
          promptToken: item.promptToken,
          promptPreview: item.prompt.slice(0, 80),
        })),
      }));
    },
  };
}
