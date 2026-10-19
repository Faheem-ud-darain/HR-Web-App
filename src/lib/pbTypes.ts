/**
 * A raw PocketBase record or JSON payload. PocketBase collections are schemaless from the
 * app's side, so rows are read loosely and converted to typed models by the `toX` mappers
 * (e.g. `toTicket`, `mapProfileRecord`). This is the one sanctioned `any` for that boundary —
 * use `PbRow` instead of sprinkling `any` over raw rows and request bodies.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PbRow = Record<string, any>;

/** An arbitrary JSON value stored in a PocketBase JSON/KV field (shape depends on the key; callers narrow it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PbJson = any;
