/**
 * Lecture des fichiers CSV d'un flux GTFS (RFC 4180) : guillemets, virgules et
 * retours à la ligne dans les champs, guillemets doublés, BOM UTF-8, fins de
 * ligne Windows. Pas de dépendance : le format est simple et bien défini.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Lignes vides ignorées (souvent en fin de fichier).
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Fichier CSV → objets « colonne → valeur » (valeurs nettoyées des espaces). */
export function readTable(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const columns = header.map((column) => column.trim());
  return rows.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, (row[index] ?? '').trim()])),
  );
}
