export function isOpeningWorkbenchScopeActive(input: {
  initialContainerMessageId: number | null | undefined;
  currentContainerMessageId: number | null | undefined;
}): boolean {
  const activeContainerId = resolveActiveContainerMessageId(input);
  if (activeContainerId != null) return activeContainerId === 0;

  return false;
}

export function resolveActiveContainerMessageId(input: {
  initialContainerMessageId: number | null | undefined;
  currentContainerMessageId: number | null | undefined;
}): number | null {
  const current = Number(input.currentContainerMessageId);
  if (Number.isFinite(current)) return Math.trunc(current);

  const initial = Number(input.initialContainerMessageId);
  if (Number.isFinite(initial)) return Math.trunc(initial);

  return null;
}
