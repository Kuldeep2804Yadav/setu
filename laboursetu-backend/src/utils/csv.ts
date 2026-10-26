/**
 * Generates CSV string while sanitizing fields against spreadsheet formula injection (CSV Injection / CWE-1236)
 */
export function sanitizeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // If the cell begins with formula trigger characters (=, +, -, @, tab, CR), prepend a single quote
  const formulaTriggers = ['=', '+', '-', '@', '\t', '\r'];
  if (formulaTriggers.some((trigger) => str.startsWith(trigger))) {
    str = `'${str}`;
  }

  // If the value contains commas, quotes, or newlines, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function generateCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(sanitizeCsvField).join(',');
  const rowLines = rows.map((row) => row.map(sanitizeCsvField).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}
