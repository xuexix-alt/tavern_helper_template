export type AssistantPatchPhase = 'stream' | 'done';
export type AssistantPatchRefreshMode = 'none' | 'affected';

export function resolveAssistantMessageRefreshMode(_phase: AssistantPatchPhase): AssistantPatchRefreshMode {
  return 'none';
}
