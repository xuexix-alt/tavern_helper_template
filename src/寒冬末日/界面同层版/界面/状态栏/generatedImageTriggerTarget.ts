export type GeneratedImageTriggerAction = 'open' | 'regenerate';

export type GeneratedImageTriggerTargetCandidates<T> = {
  hostButton: T | null;
  hostImage: T | null;
  hostMessageRoot: T | null;
  iframeButton: T | null;
  iframeImage: T | null;
};

export function selectGeneratedImageTriggerTarget<T>(
  input: GeneratedImageTriggerTargetCandidates<T>,
  action: GeneratedImageTriggerAction,
): T | null {
  if (action === 'regenerate') {
    return input.hostButton ?? input.hostImage ?? input.hostMessageRoot ?? input.iframeButton ?? input.iframeImage;
  }

  return input.hostImage ?? input.hostButton ?? input.hostMessageRoot ?? input.iframeButton ?? input.iframeImage;
}
