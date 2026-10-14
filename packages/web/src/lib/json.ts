export type JsonParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false };

export function parseJsonObject(text: string): JsonParseResult {
  if (!text.trim()) {
    return { ok: true, value: {} };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, value: parsed as Record<string, unknown> };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export function stringifyJson(value: Record<string, unknown>): string {
  return Object.keys(value).length === 0 ? '' : JSON.stringify(value);
}
