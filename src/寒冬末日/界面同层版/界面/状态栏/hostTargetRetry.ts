type ResolveWithRetryOptions = {
  attempts?: number;
  delayMs?: number;
};

export async function resolveWithRetry<T>(
  resolver: () => T | null | undefined,
  options: ResolveWithRetryOptions = {},
): Promise<T | null> {
  const attempts = Math.max(1, Math.trunc(Number(options.attempts ?? 1)));
  const delayMs = Math.max(0, Math.trunc(Number(options.delayMs ?? 0)));

  for (let index = 0; index < attempts; index += 1) {
    const resolved = resolver();
    if (resolved != null) return resolved;
    if (index >= attempts - 1 || delayMs <= 0) continue;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return null;
}
