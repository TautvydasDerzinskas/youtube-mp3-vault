// Minimal RFC4180-ish CSV encode/decode — no external dependency needed for
// the small, simple tabular data the admin export/import routes deal with
// (track id/title/artist strings, one sheet, no nested structures).

function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map(row => row.map(escapeCsvField).join(',')).join('\r\n');
}

// Character-by-character rather than a line/comma split — a quoted field can
// legitimately contain a comma or an embedded newline (a track title with a
// comma is common), which a naive split would tear apart.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAnyField = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      sawAnyField = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      sawAnyField = true;
    } else if (char === '\r') {
      // swallowed; \n (bare or following \r) ends the row below
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      sawAnyField = false;
    } else {
      field += char;
      sawAnyField = true;
    }
  }
  // Trailing field/row when the file doesn't end with a newline.
  if (sawAnyField || field) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
