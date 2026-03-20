type PointLike = {
  clientX: number;
  clientY: number;
};

type RectLike = {
  left: number;
  top: number;
};

type ElementLike = {
  closest?: (selector: string) => ElementLike | null;
};

type DocumentLike = {
  elementFromPoint?: (x: number, y: number) => ElementLike | null;
};

type HostDispatchPlanInput = {
  directTarget?: ElementLike | null;
  pointFallbackTarget?: ElementLike | null;
  hostPoint?: PointLike | null;
};

type RetryLike = {
  attempts?: number;
  delayMs?: number;
};

type HostDispatchPlanRetryInput = {
  resolveDirectTarget: () => ElementLike | null | undefined;
  resolvePointFallbackTarget?: (() => ElementLike | null | undefined) | null;
  hostPoint?: PointLike | null;
  directRetry?: RetryLike;
  pointRetry?: RetryLike;
};

type HostDispatchPlan =
  | {
      target: ElementLike;
      hostPoint: null;
      source: 'message_id';
    }
  | {
      target: ElementLike;
      hostPoint: PointLike | null;
      source: 'point_fallback';
    }
  | {
      target: null;
      hostPoint: null;
      source: 'none';
    };

async function resolveWithRetry<T>(
  resolver: () => T | null | undefined,
  options: RetryLike = {},
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

export function convertIframePointToHostPoint(point: PointLike, iframeRect: RectLike): PointLike {
  return {
    clientX: Number(point.clientX) + Number(iframeRect.left),
    clientY: Number(point.clientY) + Number(iframeRect.top),
  };
}

export function resolveHostTriggerTargetFromPoint(
  hostDocument: DocumentLike | null | undefined,
  point: PointLike,
): ElementLike | null {
  if (!hostDocument || typeof hostDocument.elementFromPoint !== 'function') return null;
  const hit = hostDocument.elementFromPoint(point.clientX, point.clientY);
  if (!hit) return null;
  if (typeof hit.closest !== 'function') return hit;

  return resolveClosestHostTriggerTarget(hit);
}

function resolveClosestHostMessageTarget(hit: ElementLike): ElementLike | null {
  if (typeof hit.closest !== 'function') return hit;
  return hit.closest('.mes_text, .mes_block, .message_text') ?? null;
}

function resolveClosestHostTriggerTarget(hit: ElementLike): ElementLike | null {
  return (
    resolveClosestHostMessageTarget(hit) ??
    hit.closest?.('.st-chatu8-image-button') ??
    hit.closest?.('.st-chatu8-image-span') ??
    hit
  );
}

export function resolveHostMessageTargetFromPoint(
  hostDocument: DocumentLike | null | undefined,
  point: PointLike,
): ElementLike | null {
  if (!hostDocument || typeof hostDocument.elementFromPoint !== 'function') return null;
  const hit = hostDocument.elementFromPoint(point.clientX, point.clientY);
  if (!hit) return null;
  return resolveClosestHostMessageTarget(hit) ?? hit;
}

export function resolveHostDispatchPlan(input: HostDispatchPlanInput): HostDispatchPlan {
  if (input.directTarget) {
    return {
      target: input.directTarget,
      hostPoint: null,
      source: 'message_id',
    };
  }

  if (input.pointFallbackTarget) {
    return {
      target: input.pointFallbackTarget,
      hostPoint: input.hostPoint ?? null,
      source: 'point_fallback',
    };
  }

  return {
    target: null,
    hostPoint: null,
    source: 'none',
  };
}

export async function resolveHostDispatchPlanWithRetry(
  input: HostDispatchPlanRetryInput,
): Promise<HostDispatchPlan> {
  const directTarget = await resolveWithRetry(input.resolveDirectTarget, input.directRetry);
  if (directTarget) {
    return resolveHostDispatchPlan({
      directTarget,
      hostPoint: input.hostPoint ?? null,
    });
  }

  const pointFallbackTarget = input.resolvePointFallbackTarget
    ? await resolveWithRetry(input.resolvePointFallbackTarget, input.pointRetry)
    : null;

  return resolveHostDispatchPlan({
    directTarget: null,
    pointFallbackTarget,
    hostPoint: input.hostPoint ?? null,
  });
}
