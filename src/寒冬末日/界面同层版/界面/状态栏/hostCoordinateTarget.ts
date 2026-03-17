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

  return (
    hit.closest('.mes_text, .mes_block, .message_text') ??
    hit.closest('.st-chatu8-image-button') ??
    hit.closest('.st-chatu8-image-span') ??
    hit
  );
}
