export const GENERATE_IMAGE_REQUEST = 'generate-image-request';
export const GENERATE_IMAGE_RESPONSE = 'generate-image-response';

export const EventType = {
  GENERATE_IMAGE_REQUEST,
  GENERATE_IMAGE_RESPONSE,
} as const;

export type PluginImageRequest = {
  id?: string;
  prompt: string;
  change?: string;
  width?: number | null;
  height?: number | null;
  timeoutMs?: number;
};

export type PluginImageResponse = {
  id: string;
  success: boolean;
  imageData?: string;
  error?: string;
  prompt?: string;
  change?: string;
};

function createPluginImageRequestId() {
  return `same-layer-pre-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function requestPluginImage(input: PluginImageRequest): Promise<PluginImageResponse> {
  const prompt = String(input.prompt ?? '').trim();
  if (!prompt) {
    return Promise.reject(new Error('prompt is required'));
  }
  if (
    typeof eventOn !== 'function' ||
    typeof eventEmit !== 'function' ||
    typeof eventRemoveListener !== 'function'
  ) {
    return Promise.reject(new Error('Tavern Helper event functions are unavailable'));
  }

  const requestId = input.id || createPluginImageRequestId();
  const requestData = {
    id: requestId,
    prompt,
    change: input.change ?? '',
    width: typeof input.width === 'number' ? input.width : null,
    height: typeof input.height === 'number' ? input.height : null,
  };
  const timeoutMs = Math.max(1000, input.timeoutMs ?? 120000);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = 0;

    const cleanup = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      eventRemoveListener(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler as any);
    };

    const imageResponseHandler = (responseData: PluginImageResponse) => {
      if (!responseData || responseData.id !== requestId) return;
      if (settled) return;
      settled = true;
      cleanup();
      resolve(responseData);
    };

    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`plugin image request timed out: ${requestId}`));
    }, timeoutMs);

    eventOn(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler as any);
    void eventEmit(EventType.GENERATE_IMAGE_REQUEST, requestData as any).catch(error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
