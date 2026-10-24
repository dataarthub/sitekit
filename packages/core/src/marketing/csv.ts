import { parseMarketingSpendImport } from './schemas.js';
import type { MarketingSpendImport } from './schemas.js';

/**
 * Parses a bounded UTF-8 spending CSV with strict headings and integer minor amounts.
 * @param text - CSV with id, occurredAt, source, medium, campaign, amountMinor and currency headings.
 * @returns A validated spending import of at most 100 rows; empty acquisition cells are omitted.
 * @remarks Accepts quoted commas, doubled quotes, embedded newlines and CRLF. Rejects extra
 * headings, duplicate headings, unterminated quotes, fractional amounts and input over 128 KiB.
 * This parser grants no authorization and performs no storage writes.
 * @example
 * import { parseMarketingSpendCsv } from '@alneas/sitekit/marketing';
 * parseMarketingSpendCsv('id,occurredAt,source,medium,campaign,amountMinor,currency\na,2026-10-01T00:00:00Z,meta,paid_social,autumn,10000,JPY');
 */
export function parseMarketingSpendCsv(text: string): MarketingSpendImport {
  if (new TextEncoder().encode(text).byteLength > 128 * 1024) throw new Error('Spending CSV exceeds 128 KiB');
  const records: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  const finishRow = () => { finishCell(); records.push(row); row = []; if (records.length > 101) throw new Error('Spending CSV exceeds 100 data rows'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === ',' ) finishCell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (char === '"' && cell === '' && !closed) quoted = true;
    else { if (closed || char === '"') throw new Error('Malformed spending CSV'); cell += char; }
  }
  if (quoted) throw new Error('Unterminated spending CSV quote');
  if (cell || row.length || closed) finishRow();
  const headings = records.shift();
  const expected = ['id', 'occurredAt', 'source', 'medium', 'campaign', 'amountMinor', 'currency'];
  if (!headings || headings.length !== expected.length || new Set(headings).size !== expected.length || expected.some(key => !headings.includes(key))) throw new Error('Invalid spending CSV headings');
  const rows = records.map(values => {
    if (values.length !== headings.length) throw new Error('Invalid spending CSV row length');
    const raw = Object.fromEntries(headings.map((key, index) => [key, values[index]!]));
    if (!/^(?:0|[1-9]\d*)$/.test(raw.amountMinor!)) throw new Error('Spending CSV requires integer minor units');
    for (const key of ['source', 'medium', 'campaign']) if (!raw[key]) delete raw[key];
    return { ...raw, amountMinor: Number(raw.amountMinor) };
  });
  return parseMarketingSpendImport({ rows });
}
