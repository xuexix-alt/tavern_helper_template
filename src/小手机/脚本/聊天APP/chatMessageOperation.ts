export function createLatestMessageOperationGuard() {
  let generation = 0;
  let activeGeneration: number | null = null;

  return {
    start(): number {
      generation += 1;
      activeGeneration = generation;
      return generation;
    },
    invalidate(): void {
      generation += 1;
      activeGeneration = null;
    },
    isCurrent(token: number): boolean {
      return activeGeneration === token;
    },
    finish(token: number): boolean {
      if (activeGeneration !== token) return false;
      activeGeneration = null;
      return true;
    },
  };
}
