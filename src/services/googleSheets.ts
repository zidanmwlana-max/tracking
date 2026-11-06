import { getAccessToken } from './firebaseAuth';

export interface SheetFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

export interface SheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: {
    sheetId: number;
    title: string;
    rowCount?: number;
    columnCount?: number;
  }[];
}

/**
 * Searches Google Drive for spreadsheets matching a name or query.
 */
export async function searchSpreadsheets(query: string = 'BMI_WorkshopManagement'): Promise<SheetFile[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');

  const q = `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains '${query}'`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)&pageSize=10`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal mencari spreadsheet di Google Drive.');
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Gets metadata and sheet names for a spreadsheet.
 */
export async function getSpreadsheetDetails(spreadsheetId: string): Promise<SheetMetadata> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');

  const cleanId = extractSpreadsheetId(spreadsheetId);
  const url = `https://www.googleapis.com/sheets/v4/spreadsheets/${cleanId}?fields=spreadsheetId,properties.title,sheets.properties`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal membuka spreadsheet Google Sheets.');
  }

  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Spreadsheet',
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title || 'Sheet',
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount
    }))
  };
}

/**
 * Reads row values from a specific sheet range.
 */
export async function getSheetValues(spreadsheetId: string, range: string): Promise<any[][]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');

  const cleanId = extractSpreadsheetId(spreadsheetId);
  const url = `https://www.googleapis.com/sheets/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membaca data dari sheet ${range}`);
  }

  const data = await res.json();
  return data.values || [];
}

/**
 * Sanitizes a single cell value to prevent Spreadsheet Formula Injection (OWASP CSV/Formula Injection).
 * Prefixes strings starting with =, +, -, @, tab, or carriage return with a single quote.
 */
export function sanitizeCellForSheets(val: string | number | boolean): string | number | boolean {
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  const str = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Appends a single row of values to a specific sheet range.
 */
export async function appendSheetRow(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean)[]
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');

  const cleanId = extractSpreadsheetId(spreadsheetId);
  const sanitizedValues = values.map(sanitizeCellForSheets);
  const url = `https://www.googleapis.com/sheets/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(
    range
  )}:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [sanitizedValues]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal menambahkan baris ke sheet ${range}`);
  }
}

/**
 * Updates a specific range of values in a Google Sheet (used for safe column-level standardization without touching formulas).
 */
export async function updateSheetRangeValues(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean)[][]
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');

  const cleanId = extractSpreadsheetId(spreadsheetId);
  const sanitizedMatrix = values.map((row) => row.map(sanitizeCellForSheets));
  const url = `https://www.googleapis.com/sheets/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(
    range
  )}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: sanitizedMatrix
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal memperbarui range ${range}`);
  }
}

/**
 * Standardizes Column C (No Lambung in TRK (LOG) and Kode Genset in GNZ (LOG)) directly in Google Sheets
 * using the latest BMI Enterprise naming convention without altering any formulas in other columns.
 */
export async function standardizeSheetNamingConvention(
  spreadsheetId: string,
  nopolToLambungMap: Record<string, string>,
  oldToNewGensetMap: Record<string, string>
): Promise<{ updatedTrkRows: number; updatedGnzRows: number }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  let updatedTrkRows = 0;
  let updatedGnzRows = 0;

  // 1. Update TRK (LOG) Col C (No Lambung) based on Col D (Nopol)
  try {
    const trkRows = await getSheetValues(cleanId, 'TRK (LOG)!C2:D250');
    if (trkRows.length > 0) {
      const colCValues: string[][] = trkRows.map((r) => {
        const currentLambung = String(r[0] || '').trim();
        const rawNopol = String(r[1] || '')
          .replace(/\s+/g, '')
          .trim()
          .toUpperCase();
        const mappedLambung = nopolToLambungMap[rawNopol];
        if (mappedLambung && mappedLambung !== currentLambung) {
          updatedTrkRows += 1;
          return [mappedLambung];
        }
        return [currentLambung];
      });

      if (updatedTrkRows > 0) {
        await updateSheetRangeValues(
          cleanId,
          `TRK (LOG)!C2:C${trkRows.length + 1}`,
          colCValues
        );
      }
    }
  } catch {
    // Ignore if sheet doesn't exist or read-only
  }

  // 2. Update GNZ (LOG) Col C (Kode Genset)
  try {
    const gnzRows = await getSheetValues(cleanId, 'GNZ (LOG)!C2:D250');
    if (gnzRows.length > 0) {
      const colCValues: string[][] = gnzRows.map((r) => {
        const currentCode = String(r[0] || '').trim().toUpperCase();
        const mappedCode = oldToNewGensetMap[currentCode];
        if (mappedCode && mappedCode !== currentCode) {
          updatedGnzRows += 1;
          return [mappedCode];
        }
        return [String(r[0] || '').trim()];
      });

      if (updatedGnzRows > 0) {
        await updateSheetRangeValues(
          cleanId,
          `GNZ (LOG)!C2:C${gnzRows.length + 1}`,
          colCValues
        );
      }
    }
  } catch {
    // Ignore if sheet doesn't exist or read-only
  }

  return { updatedTrkRows, updatedGnzRows };
}

/**
 * Extracts spreadsheet ID from full URL or bare ID.
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return trimmed;
}

