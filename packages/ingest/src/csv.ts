// ─── packages/ingest/src/csv.ts ──────────────────────────────────────────
// Shared CSV parsing and date normalisation helpers.

/**
 * Parses a single CSV line into fields, handling quoted strings and escaped quotes.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Normalises a date string to ISO 8601 (YYYY-MM-DD).
 * Returns the normalised date and an optional warning if conversion/formatting occurred.
 */
export function normaliseDate(raw: string): { date: string; warning?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { date: '' };
  }

  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { date: trimmed };
  }

  // Slash format DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    // Three capture groups, none optional, so a match has all three.
    const part1 = slashMatch[1]!;
    const part2 = slashMatch[2]!;
    const yyyy = slashMatch[3]!;

    // Only the second number being over 12 forces MM/DD; every other case reads as
    // DD/MM, which is what a Brazilian export means. When neither number settles it,
    // say so — 07/01/2026 is two different days and the seller is the one who knows
    // which. C-ingest.md: "reject ambiguously if unsure rather than guessing".
    const monthFirst = parseInt(part2, 10) > 12;
    const dd = (monthFirst ? part2 : part1).padStart(2, '0');
    const mm = (monthFirst ? part1 : part2).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;

    const ambiguous = parseInt(part1, 10) <= 12 && parseInt(part2, 10) <= 12;
    return ambiguous
      ? { date: iso, warning: `Date "${trimmed}" is ambiguous — read as DD/MM/YYYY (${iso}). Export in YYYY-MM-DD to be sure.` }
      : { date: iso };
  }

  // Textual date e.g. "July 3 2026" or "Jul 3, 2026"
  const parsedTime = Date.parse(trimmed);
  if (!Number.isNaN(parsedTime)) {
    const d = new Date(parsedTime);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;

    return {
      date: iso,
      warning: `Date "${trimmed}" was not ISO 8601 (YYYY-MM-DD), converted to ${iso}`,
    };
  }

  return {
    date: trimmed,
    warning: `Unrecognised date format "${trimmed}"`,
  };
}
