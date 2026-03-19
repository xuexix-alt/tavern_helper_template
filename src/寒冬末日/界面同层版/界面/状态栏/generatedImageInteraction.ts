export type GeneratedImageTriggerNodes<T = HTMLElement> = {
  hostImage: T | null;
  hostButton: T | null;
  iframeImage: T | null;
  iframeButton: T | null;
};

export async function resolveGeneratedImageActivationTarget<T>(
  action: 'view' | 'regenerate',
  input: {
    attempts?: number;
    delayMs?: number;
    resolveNodes: () => GeneratedImageTriggerNodes<T>;
  },
): Promise<T | null> {
  const attempts = Math.max(1, Math.trunc(Number(input.attempts ?? 1)));
  const delayMs = Math.max(0, Math.trunc(Number(input.delayMs ?? 0)));

  for (let index = 0; index < attempts; index += 1) {
    const target = pickGeneratedImageActivationTarget(action, input.resolveNodes());
    if (target != null) return target;
    if (index >= attempts - 1 || delayMs <= 0) continue;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return null;
}

export function shouldInjectTranscriptImages(
  mode: 'plugin-native' | 'plugin-native-data' | 'compatibility' | 'none',
): boolean {
  return mode === 'compatibility';
}

export function pickGeneratedImageActivationTarget<T>(
  action: 'view' | 'regenerate',
  input: GeneratedImageTriggerNodes<T>,
): T | null {
  if (action === 'view') {
    return input.hostImage ?? input.iframeImage ?? input.hostButton ?? input.iframeButton ?? null;
  }

  return input.hostButton ?? input.iframeButton ?? input.hostImage ?? input.iframeImage ?? null;
}
