// ─── packages/meta/src/errors.ts ─────────────────────────────────────────

/** A field we needed and could not read, with enough context to go find it. */
export type MissingField = {
  rowIndex: number;
  date?: string;
  entityId?: string;
  fields: string[];
};

export type MetaInsightsErrorCode =
  /** The envelope is not an insights response at all. */
  | 'META_INSIGHTS_MALFORMED'
  /** The shape is right and a value we need is absent. Absence is not zero. */
  | 'META_INSIGHTS_INCOMPLETE';

/**
 * Refusing beats guessing.
 *
 * The engine's whole claim is that every number on screen came from a
 * deterministic function over numbers a seller can audit. A payload with a hole
 * in it has two honest answers — read the rest and say what is missing, or stop
 * — and zero is neither of them. `packages/ingest` makes the other call for CSV
 * (default to 0, warn, carry on) because a spreadsheet is a human artefact with
 * human gaps; an API response is machine output, and a gap in it means the call
 * was wrong.
 */
export class MetaInsightsError extends Error {
  readonly code: MetaInsightsErrorCode;
  readonly missing: MissingField[];

  constructor(code: MetaInsightsErrorCode, message: string, missing: MissingField[] = []) {
    super(message);
    this.name = 'MetaInsightsError';
    this.code = code;
    this.missing = missing;
  }
}

/** One error for the whole payload, listing every hole — not one per hole. */
export function incomplete(missing: MissingField[]): MetaInsightsError {
  const rows = missing.length;
  const shown = missing
    .slice(0, 3)
    .map((m) => `${m.fields.join(', ')} on ${m.date ?? `row ${m.rowIndex}`}${m.entityId ? ` (${m.entityId})` : ''}`)
    .join('; ');
  const more = rows > 3 ? `, and ${rows - 3} more rows` : '';

  return new MetaInsightsError(
    'META_INSIGHTS_INCOMPLETE',
    `Meta insights payload is missing required fields on ${rows} row${rows === 1 ? '' : 's'}: ${shown}${more}. ` +
      'Absence is not zero — re-request those fields, or upload the CSV export instead.',
    missing,
  );
}
