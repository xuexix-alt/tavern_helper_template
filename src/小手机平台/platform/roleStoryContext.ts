/** 姓名关键词检索原文，不触发世界书激活，也不推断代词指向。 */
const OMITTED = '\n[…省略…]\n';
interface TextRange {
  start: number;
  end: number;
}

function mergeRanges(ranges: readonly TextRange[]): TextRange[] {
  const merged: TextRange[] = [];
  for (const range of [...ranges].sort((left, right) => left.start - right.start)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function renderRanges(content: string, ranges: readonly TextRange[]): string {
  if (!ranges.length) return '';
  return (
    (ranges[0].start > 0 ? OMITTED : '') +
    ranges.map(range => content.slice(range.start, range.end)).join(OMITTED) +
    (ranges[ranges.length - 1].end < content.length ? OMITTED : '')
  );
}

export function extractRoleStoryContext(content: string, roleNames: readonly string[], maxCharacters = 1600): string {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters <= 0) throw new Error('正文片段预算必须是正整数');
  const names = [...new Set(roleNames.map(name => name.trim()).filter(Boolean))];
  const byName = names.map(name => {
    const matches: TextRange[] = [];
    let offset = content.indexOf(name);
    while (offset !== -1) {
      // 固定窗口保留附近对话与代词；单段再长也不会整段塞入提示词。
      let start = Math.max(0, offset - 180);
      let end = Math.min(content.length, offset + name.length + 300);
      // 不把 UTF-16 代理对（如 emoji）从中间截断。
      if (start > 0 && /[\uDC00-\uDFFF]/u.test(content[start])) start--;
      if (end < content.length && /[\uD800-\uDBFF]/u.test(content[end - 1])) end++;
      matches.push({ start, end });
      offset = content.indexOf(name, offset + name.length);
    }
    return matches.reverse();
  });
  // 优先尝试每位成员的最近一次命中，再按新到旧补充，避免同一姓名频繁出现挤占群聊成员。
  const firstMatches = byName.flatMap(matches => matches.slice(0, 1));
  const remaining = byName.flatMap(matches => matches.slice(1)).sort((left, right) => right.start - left.start);
  let selected: TextRange[] = [];
  for (const candidate of [...firstMatches, ...remaining]) {
    const merged = mergeRanges([...selected, candidate]);
    if (renderRanges(content, merged).length <= maxCharacters) selected = merged;
  }
  return renderRanges(content, selected).trim();
}
