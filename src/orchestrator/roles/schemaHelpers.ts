/**
 * Shared Zod helpers for role schemas.
 *
 * Models routinely emit the literal string `"null"` (or `""`) for fields that
 * should be JSON `null`, especially when the schema is a `union([..., null])`.
 * That single phrasing slip causes the corrective retry inside
 * `callWithRetry` to reproduce the same error and the caller ends up with
 * `result === null`. These helpers coerce the common forms before the union
 * check runs so a small model mistake doesn't cost the whole turn.
 *
 * Use these in any `RoleSpec.schema` that has nullable fields.
 */

import { z } from 'zod';

function coerceNullishLiteral(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'none' || trimmed.toLowerCase() === 'n/a') {
    return null;
  }
  return value;
}

/** Nullable string with min/max length, tolerant of `"null"`/`""`/`"none"`. */
export function nullableString(opts: { min?: number; max?: number } = {}) {
  const { min, max } = opts;
  let stringSchema = z.string();
  if (min !== undefined) stringSchema = stringSchema.min(min);
  if (max !== undefined) stringSchema = stringSchema.max(max);
  return z.preprocess(coerceNullishLiteral, z.union([stringSchema, z.null()]));
}

/** Nullable enum, tolerant of `"null"`/`""`/`"none"`. */
export function nullableEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    coerceNullishLiteral,
    z.union([z.enum(values as unknown as [string, ...string[]]), z.null()]),
  );
}

/** Wrap an existing schema as nullable with the same coercion. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nullableOf<T extends z.ZodType<any>>(inner: T) {
  return z.preprocess(coerceNullishLiteral, z.union([inner, z.null()]));
}
