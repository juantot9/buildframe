/** Package-private structural primitives for owner-specific Workspace codecs. */
export const textEncoder: TextEncoder = new TextEncoder();

export const textDecoder: TextDecoder = new TextDecoder('utf-8', { fatal: true });

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => allowed.has(key));
}

export function memberOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return typeof value === 'string' && values.some(candidate => candidate === value);
}

export function safeVersion(value: unknown, allowZero = true): value is number {
  return Number.isSafeInteger(value) && (value as number) >= (allowZero ? 0 : 1);
}

export function isoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

/** Rejects lone UTF-16 surrogates, which have no exact UTF-8 encoding. */
export function unicodeScalarText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (following < 0xdc00 || following > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** Freezes a value graph. Byte views are left unfrozen: freezing one with elements throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  const pending: object[] = [value];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    if (ArrayBuffer.isView(current)) continue;
    for (const nested of Object.values(current)) {
      if (typeof nested === 'object' && nested !== null) pending.push(nested);
    }
    Object.freeze(current);
  }
  return value;
}
