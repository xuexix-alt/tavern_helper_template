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

type PendingHint = {
  messageId: number;
  requestId: string;
  prompt: string;
  promptToken: string;
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

type ImageHintPayload = {
  messageId?: unknown;
  id?: unknown;
  requestId?: unknown;
  prompt?: unknown;
  promptToken?: unknown;
};

const DEFAULT_COLLECTING_WINDOW_MS = 10 * 60_000;
const MIN_CLEANUP_RETENTION_MS = 5 * 60_000;

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
  const collectingWindowMs = Math.max(
    100,
    Math.trunc(Number(options.collectingWindowMs ?? DEFAULT_COLLECTING_WINDOW_MS)),
  );
  const cleanupRetentionMs = Math.max(MIN_CLEANUP_RETENTION_MS, collectingWindowMs + 60_000);
  const tasks: PendingTask[] = [];
  const bufferedResponses: BufferedResponse[] = [];
  const hints: PendingHint[] = [];

  function cleanup(referenceTime = now()) {
    const cutoff = referenceTime - cleanupRetentionMs;
    for (let index = tasks.length - 1; index >= 0; index -= 1) {
      if (tasks[index].createdAt < cutoff) tasks.splice(index, 1);
    }
    for (let index = bufferedResponses.length - 1; index >= 0; index -= 1) {
      if (bufferedResponses[index].createdAt < cutoff) bufferedResponses.splice(index, 1);
    }
    for (let index = hints.length - 1; index >= 0; index -= 1) {
      if (hints[index].createdAt < cutoff) hints.splice(index, 1);
    }
  }

  function consumeBufferedResponseForHint(hint: PendingHint) {
    const bufferedIndex = bufferedResponses.findIndex(item => {
      return (
        item.requestId === hint.requestId ||
        (hint.promptToken && item.promptToken === hint.promptToken) ||
        (hint.prompt && item.prompt === hint.prompt)
      );
    });
    const bufferedResponse = bufferedIndex >= 0 ? (bufferedResponses.splice(bufferedIndex, 1)[0] ?? null) : null;
    if (!bufferedResponse) return null;
    return {
      messageId: hint.messageId,
      requestId: bufferedResponse.requestId || hint.requestId,
      prompt: bufferedResponse.prompt || hint.prompt,
      promptToken: bufferedResponse.promptToken || hint.promptToken,
      imageData: bufferedResponse.imageData,
    };
  }

  function registerHint(payload: ImageHintPayload) {
    const messageId = Math.trunc(Number(payload?.messageId));
    const requestId = String(payload?.id ?? payload?.requestId ?? '').trim();
    const prompt = String(payload?.prompt ?? '').trim();
    const promptToken = String(payload?.promptToken ?? '').trim() || buildPromptTokenFromPrompt(prompt);
    if (!Number.isFinite(messageId) || messageId < 0 || !requestId) return null;

    const createdAt = now();
    cleanup(createdAt);
    const existing =
      hints.find(item => item.requestId === requestId) ??
      (promptToken ? hints.find(item => item.promptToken === promptToken && item.messageId === messageId) : null);

    if (existing) {
      existing.messageId = messageId;
      existing.prompt = prompt || existing.prompt;
      existing.promptToken = promptToken || existing.promptToken;
      existing.createdAt = createdAt;
      return {
        messageId: existing.messageId,
        bufferedResponse: consumeBufferedResponseForHint(existing),
      };
    }

    const hint = {
      messageId,
      requestId,
      prompt,
      promptToken,
      createdAt,
    };
    hints.push(hint);
    return {
      messageId,
      bufferedResponse: consumeBufferedResponseForHint(hint),
    };
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

  function createTaskForMessage(messageId: number, referenceTime: number): PendingTask {
    const task = {
      id: `task:${messageId}:${referenceTime}`,
      messageId,
      createdAt: referenceTime,
      collectingUntil: referenceTime + collectingWindowMs,
      requests: [],
    };
    tasks.push(task);
    return task;
  }

  function findCollectingTaskByMessageId(messageId: number, referenceTime: number): PendingTask | null {
    return (
      tasks
        .slice()
        .reverse()
        .find(item => item.messageId === messageId && item.collectingUntil >= referenceTime) ?? null
    );
  }

  function registerRequest(payload: ImageRequestEventPayload) {
    const requestId = String(payload?.id ?? '').trim();
    const prompt = String(payload?.prompt ?? '').trim();
    if (!requestId || !prompt) return null;

    const referenceTime = now();
    cleanup(referenceTime);
    const promptToken = buildPromptTokenFromPrompt(prompt);
    const hint =
      hints.find(item => item.requestId === requestId) ??
      hints.find(item => item.promptToken === promptToken || item.prompt === prompt);
    const bufferedIndex = bufferedResponses.findIndex(
      item => item.requestId === requestId || item.promptToken === promptToken || item.prompt === prompt,
    );
    const bufferedResponse = bufferedIndex >= 0 ? (bufferedResponses.splice(bufferedIndex, 1)[0] ?? null) : null;

    const task = hint
      ? (findCollectingTaskByMessageId(hint.messageId, referenceTime) ??
        createTaskForMessage(hint.messageId, referenceTime))
      : (tasks
          .slice()
          .reverse()
          .find(item => item.collectingUntil >= referenceTime) ??
        (bufferedResponse ? (tasks[tasks.length - 1] ?? null) : null));

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
      const promptToken = buildPromptTokenFromPrompt(prompt);
      const hint =
        hints.find(item => item.requestId === requestId) ??
        hints.find(item => item.promptToken === promptToken || item.prompt === prompt);
      if (hint) {
        return {
          messageId: hint.messageId,
          requestId: requestId || hint.requestId,
          prompt: prompt || hint.prompt,
          promptToken: hint.promptToken || promptToken,
          imageData,
        };
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
    registerHint,
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
