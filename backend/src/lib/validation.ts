// Request-shape validation primitives shared by the resource routers
// (configs, test_cases, records). Pure checks on already-parsed JSON — no DB
// access. Throwing a ValidationError lets each route translate it to a 400.

export class ValidationError extends Error {}

export interface NumberBounds {
  min: number;
  max: number;
  integer?: boolean;
}

// The sampling parameters' accepted ranges, in one place. These mirror the SQL
// CHECK constraints in db/schema.ts, which stay as an independent DB-boundary
// guard — this object only governs request validation.
export const PARAM_BOUNDS = {
  temperature: { min: 0, max: 2 },
  top_p: { min: 0, max: 1 },
  top_k: { min: 1, max: 200, integer: true },
  max_tokens: { min: 64, max: 32768, integer: true },
} satisfies Record<string, NumberBounds>;

export function numberInRange(value: unknown, field: string, bounds: NumberBounds): number {
  const { min, max, integer = false } = bounds;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${field} must be a number between ${min} and ${max}`);
  }
  if (integer && !Number.isInteger(value)) throw new ValidationError(`${field} must be an integer`);
  return value;
}

export function stringRecord(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(item => typeof item === 'string');
}

export function uniqueNameError(error: unknown, table: string): boolean {
  return error instanceof Error
    && error.message.includes(`UNIQUE constraint failed: ${table}.prompt_id, ${table}.name`);
}
