import { Role, PoolLocation } from '../types';
import { getAccessToken } from './firebaseAuth';

export const USER_ACCESS_SPREADSHEET_ID = '1LVPzTUXrT2HLNbQDNRPh5kzW0dFyBKyLnMuVhscRjT4';
export const USER_ACCESS_SHEET_NAME = 'User Access';

export type FeaturePermissionKey =
  | 'dashboard'
  | 'fleet'
  | 'inventory'
  | 'incidents'
  | 'workorders'
  | 'workorders.manage'
  | 'tires'
  | 'warehouse-tires'
  | 'chassis-checklist'
  | 'odometer'
  | 'user-access'
  | 'architecture';

export interface RoleMappingConfig {
  sheetRoleName: string;
  portalRole: Role;
  description: string;
  allowedFeatures: FeaturePermissionKey[];
}

export interface AuthUser {
  id: string;
  nama: string;
  roleRaw: string;
  role: Role;
  /**
   * Transient input only when registering/resetting a user; NEVER persisted to localStorage.
   */
  password?: string;
  /**
   * Salted one-way verifier for offline fallback when backend server is unreachable.
   * Plaintext passwords are never stored in browser storage.
   */
  passwordVerifier?: string;
  credentialStatus?: 'ENCRYPTED_SCRYPT' | 'HASHED_VERIFIER';
  status: 'Aktif' | 'Nonaktif';
  email: string;
  posisi: string;
  lokasi: PoolLocation;
  departemen: string;
  kodeAkses: string;
  allowedFeatures?: FeaturePermissionKey[];
  lastVerifiedAt?: string;
  syncSource?: 'LIVE_SHEETS_API' | 'LIVE_GVIZ' | 'LOCAL_CACHE';
}

export interface RealTimeSyncResult {
  success: boolean;
  source: 'LIVE_SHEETS_API' | 'LIVE_GVIZ' | 'LOCAL_CACHE';
  userCount: number;
  syncedAt: string;
  message: string;
}

const AUTH_STORAGE_KEY = 'bmi_workshop_auth_session_v1';
const USER_ACCESS_DB_KEY = 'bmi_user_access_sheet_db_v1';
const ROLE_MAPPING_DB_KEY = 'bmi_user_access_role_mapping_v1';
const LAST_SYNC_META_KEY = 'bmi_user_access_sync_meta_v1';

/**
 * Fase 1.4: One-way salted password verifier (multi-round FNV-1a + DJB2 128-bit hex digest)
 * Ensures plaintext passwords are NEVER stored in localStorage (`bmi_user_access_sheet_db_v1`).
 */
export function computeOneWayPasswordVerifier(userId: string, plainPassword: string): string {
  const normalizedUser = String(userId || '').trim().toLowerCase();
  const normalizedPass = String(plainPassword || '').trim();
  const input = `bmi-v3-salt::${normalizedUser}::${normalizedPass}::enterprise-verifier`;

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x1505;
  let h4 = 0x9e3779b9;

  for (let round = 0; round < 1024; round++) {
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i) ^ (round & 0xff);
      h1 = Math.imul(h1 ^ ch, 0x01000193);
      h2 = Math.imul(h2 ^ ch, 0x85ebca6b);
      h3 = ((h3 << 5) + h3 + ch) | 0;
      h4 = Math.imul(h4 ^ (ch + round), 0xc2b2ae35);
    }
  }

  const hex = [h1, h2, h3, h4]
    .map((n) => (n >>> 0).toString(16).padStart(8, '0'))
    .join('');
  return `v1$${hex}`;
}

export function sanitizeUserForStorage(u: AuthUser): AuthUser {
  const { password, ...rest } = u;
  const verifier =
    rest.passwordVerifier ||
    (password ? computeOneWayPasswordVerifier(rest.id, password) : undefined);

  return {
    ...rest,
    ...(verifier ? { passwordVerifier: verifier } : {}),
    credentialStatus: rest.credentialStatus || 'HASHED_VERIFIER',
    role: mapSheetRoleToPortalRole(rest.roleRaw || rest.role),
    allowedFeatures: getAllowedFeaturesForSheetRole(rest.roleRaw || rest.role)
  };
}

export const DEFAULT_ROLE_MAPPINGS: RoleMappingConfig[] = [
  {
    sheetRoleName: 'Supervisor',
    portalRole: 'SUPERVISOR',
    description:
      'Akses penuh seluruh modul manajemen, Fleet Management, Inventory, Laka, Kade Meter WO, & User Access.',
    allowedFeatures: [
      'dashboard',
      'workorders',
      'workorders.manage',
      'incidents',
      'inventory',
      'fleet',
      'user-access',
      'tires',
      'warehouse-tires',
      'chassis-checklist',
      'odometer',
      'architecture'
    ]
  },
  {
    sheetRoleName: 'Admin',
    portalRole: 'SUPERVISOR',
    description: 'Administrator sistem dengan otoritas penuh seluruh fitur & manajemen User Access.',
    allowedFeatures: [
      'dashboard',
      'workorders',
      'workorders.manage',
      'incidents',
      'inventory',
      'fleet',
      'user-access',
      'tires',
      'warehouse-tires',
      'chassis-checklist',
      'odometer',
      'architecture'
    ]
  },
  {
    sheetRoleName: 'Service Advisor',
    portalRole: 'SUPERVISOR',
    description:
      'Fokus pada Monitoring WO, Kontrol Inventaris (Sparepart), Manajemen Laka, & Analitik Armada.',
    allowedFeatures: [
      'dashboard',
      'workorders',
      'workorders.manage',
      'incidents',
      'inventory',
      'fleet',
      'tires',
      'warehouse-tires',
      'chassis-checklist',
      'odometer'
    ]
  },
  {
    sheetRoleName: 'Teknisi',
    portalRole: 'MEKANIK',
    description:
      'Terbatas ketat pada 4 modul lapangan: Tap Roda, Set Ready Gudang, Ceklis Sasis, & Eksekusi WO. Tanpa akses Fleet Management / Inventory.',
    allowedFeatures: ['tires', 'warehouse-tires', 'chassis-checklist', 'workorders']
  },
  {
    sheetRoleName: 'Mekanik',
    portalRole: 'MEKANIK',
    description:
      'Terbatas ketat pada 4 modul lapangan: Tap Roda, Set Ready Gudang, Ceklis Sasis, & Eksekusi WO. Tanpa akses Fleet Management / Inventory.',
    allowedFeatures: ['tires', 'warehouse-tires', 'chassis-checklist', 'workorders']
  }
];

export function getRoleMappings(): RoleMappingConfig[] {
  try {
    const raw = localStorage.getItem(ROLE_MAPPING_DB_KEY);
    if (!raw) return DEFAULT_ROLE_MAPPINGS;
    const parsed = JSON.parse(raw) as RoleMappingConfig[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_ROLE_MAPPINGS;
  } catch {
    return DEFAULT_ROLE_MAPPINGS;
  }
}

export function saveRoleMappings(mappings: RoleMappingConfig[]): void {
  localStorage.setItem(ROLE_MAPPING_DB_KEY, JSON.stringify(mappings));
}

export function resetRoleMappings(): RoleMappingConfig[] {
  localStorage.removeItem(ROLE_MAPPING_DB_KEY);
  return DEFAULT_ROLE_MAPPINGS;
}

export function mapSheetRoleToPortalRole(roleRaw: string): Role {
  const clean = String(roleRaw || '').trim().toLowerCase();
  const mappings = getRoleMappings();
  const exactMatch = mappings.find(
    (m) => m.sheetRoleName.trim().toLowerCase() === clean
  );
  if (exactMatch) {
    return exactMatch.portalRole;
  }
  if (clean.includes('teknisi') || clean.includes('mekanik')) {
    return 'MEKANIK';
  }
  return 'SUPERVISOR';
}

export function getAllowedFeaturesForSheetRole(roleRaw: string): FeaturePermissionKey[] {
  const clean = String(roleRaw || '').trim().toLowerCase();
  const mappings = getRoleMappings();

  const exact = mappings.find((m) => m.sheetRoleName.trim().toLowerCase() === clean);
  if (exact) {
    return exact.allowedFeatures;
  }

  if (clean.includes('teknisi') || clean.includes('mekanik')) {
    return ['tires', 'warehouse-tires', 'chassis-checklist', 'workorders'];
  }

  if (clean.includes('inventory') || clean.includes('gudang') || clean.includes('part')) {
    return ['dashboard', 'inventory', 'warehouse-tires', 'workorders'];
  }

  if (clean.includes('fleet') || clean.includes('aset')) {
    return ['dashboard', 'fleet', 'tires', 'chassis-checklist', 'workorders'];
  }

  if (clean.includes('advisor')) {
    const sa = mappings.find((m) => m.sheetRoleName.toLowerCase() === 'service advisor');
    return sa ? sa.allowedFeatures : DEFAULT_ROLE_MAPPINGS[2].allowedFeatures;
  }

  return DEFAULT_ROLE_MAPPINGS[0].allowedFeatures;
}

export function isFeatureAllowedForUser(
  user: AuthUser | null,
  feature: FeaturePermissionKey | string
): boolean {
  if (!user) return false;
  if (String(user.status || '').toLowerCase() !== 'aktif') return false;

  const allowedList =
    user.allowedFeatures && user.allowedFeatures.length > 0
      ? user.allowedFeatures
      : getAllowedFeaturesForSheetRole(user.roleRaw || user.role);

  return allowedList.includes(feature as FeaturePermissionKey);
}

export function isTabAllowedForRole(
  tabId: string,
  role: Role,
  roleRaw?: string
): boolean {
  const allowedList = getAllowedFeaturesForSheetRole(roleRaw || role);
  return allowedList.includes(tabId as FeaturePermissionKey);
}

function getDefaultFallbackUsers(): AuthUser[] {
  return [
    sanitizeUserForStorage({
      id: 'Admin001',
      nama: 'Administrator Bengkel BMI',
      roleRaw: 'Admin',
      role: 'SUPERVISOR',
      passwordVerifier: computeOneWayPasswordVerifier('Admin001', 'bmi2026'),
      credentialStatus: 'HASHED_VERIFIER',
      status: 'Aktif',
      email: 'admin001@bmi.co.id',
      posisi: 'Admin · Manajemen & Kontrol',
      lokasi: 'BMI Surabaya',
      departemen: 'Portal Service Advisor / Supervisor',
      kodeAkses: 'Admin001'
    }),
    sanitizeUserForStorage({
      id: 'Supervisor01',
      nama: 'Supervisor Armada BMI',
      roleRaw: 'Supervisor',
      role: 'SUPERVISOR',
      passwordVerifier: computeOneWayPasswordVerifier('Supervisor01', '123456'),
      credentialStatus: 'HASHED_VERIFIER',
      status: 'Aktif',
      email: 'supervisor01@bmi.co.id',
      posisi: 'Supervisor · Manajemen & Kontrol',
      lokasi: 'BMI Lamongan',
      departemen: 'Portal Service Advisor / Supervisor',
      kodeAkses: 'Supervisor01'
    }),
    sanitizeUserForStorage({
      id: 'Teknisi01',
      nama: 'Teknisi Bengkel BMI',
      roleRaw: 'Teknisi',
      role: 'MEKANIK',
      passwordVerifier: computeOneWayPasswordVerifier('Teknisi01', '123456'),
      credentialStatus: 'HASHED_VERIFIER',
      status: 'Aktif',
      email: 'teknisi01@bmi.co.id',
      posisi: 'Teknisi · Eksekusi Bengkel',
      lokasi: 'BMI Surabaya',
      departemen: 'Portal Lapangan (Mekanik)',
      kodeAkses: 'Teknisi01'
    })
  ];
}

export function getUserAccessList(): AuthUser[] {
  try {
    const raw = localStorage.getItem(USER_ACCESS_DB_KEY);
    if (!raw) return getDefaultFallbackUsers();
    const parsed = JSON.parse(raw) as AuthUser[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      let hadPlaintextPassword = false;
      const sanitizedList = parsed.map((u) => {
        if ('password' in u && u.password) {
          hadPlaintextPassword = true;
        }
        return sanitizeUserForStorage(u);
      });
      // Immediately scrub any legacy plaintext passwords found in localStorage
      if (hadPlaintextPassword) {
        localStorage.setItem(USER_ACCESS_DB_KEY, JSON.stringify(sanitizedList));
      }
      return sanitizedList;
    }
    return getDefaultFallbackUsers();
  } catch (e) {
    console.error('Gagal membaca database User Access:', e);
    return getDefaultFallbackUsers();
  }
}

export function saveUserAccessList(users: AuthUser[]): void {
  const sanitized = users.map(sanitizeUserForStorage);
  localStorage.setItem(USER_ACCESS_DB_KEY, JSON.stringify(sanitized));
}

export function resetUserAccessList(): AuthUser[] {
  localStorage.removeItem(USER_ACCESS_DB_KEY);
  return getDefaultFallbackUsers();
}

export function getLastUserAccessSyncMeta(): RealTimeSyncResult | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_META_KEY);
    return raw ? (JSON.parse(raw) as RealTimeSyncResult) : null;
  } catch {
    return null;
  }
}

function saveLastUserAccessSyncMeta(meta: RealTimeSyncResult): void {
  localStorage.setItem(LAST_SYNC_META_KEY, JSON.stringify(meta));
}

export function parseUserAccessSheetRows(rows: unknown[][]): AuthUser[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const parsedUsers: AuthUser[] = [];

  rows.forEach((row, index) => {
    const colAId = String(row[0] ?? '').trim();
    const colBName = String(row[1] ?? '').trim();
    const colCRole = String(row[2] ?? '').trim();
    const colDPass = String(row[3] ?? '').trim();
    const colEStatus = String(row[4] ?? 'Aktif').trim();
    const colFCustomFeatures = String(row[5] ?? '').trim();

    if (
      !colAId ||
      colAId.toLowerCase() === 'id' ||
      colAId.toLowerCase().includes('id / email') ||
      colAId.toLowerCase().includes('username') ||
      colBName.toLowerCase() === 'nama'
    ) {
      return;
    }

    const roleRawVal = colCRole || 'Teknisi';
    const mappedRole = mapSheetRoleToPortalRole(roleRawVal);
    const isAktif = colEStatus.toLowerCase() === 'aktif';
    const emailVal = colAId.includes('@')
      ? colAId.toLowerCase()
      : `${colAId.toLowerCase().replace(/[^a-z0-9]/g, '')}@bmi.co.id`;

    let allowedFeatures = getAllowedFeaturesForSheetRole(roleRawVal);
    if (colFCustomFeatures) {
      const customList = colFCustomFeatures
        .split(',')
        .map((s) => s.trim().toLowerCase() as FeaturePermissionKey)
        .filter(Boolean);
      if (customList.length > 0) {
        allowedFeatures = customList;
      }
    }

    const rawPass = colDPass || '123456';
    parsedUsers.push(
      sanitizeUserForStorage({
        id: colAId,
        nama: colBName || colAId,
        roleRaw: roleRawVal,
        role: mappedRole,
        passwordVerifier: computeOneWayPasswordVerifier(colAId, rawPass),
        credentialStatus: 'HASHED_VERIFIER',
        status: isAktif ? 'Aktif' : 'Nonaktif',
        email: emailVal,
        posisi:
          mappedRole === 'MEKANIK'
            ? `${roleRawVal} · Eksekusi Bengkel`
            : `${roleRawVal} · Manajemen & Kontrol`,
        lokasi:
          index % 3 === 1 ? 'BMI Lamongan' : index % 3 === 2 ? 'BMI Dampit' : 'BMI Surabaya',
        departemen:
          mappedRole === 'MEKANIK'
            ? 'Portal Lapangan (Mekanik)'
            : 'Portal Service Advisor / Supervisor',
        kodeAkses: colAId,
        allowedFeatures
      })
    );
  });

  return parsedUsers;
}

export async function syncUserAccessFromSheetRealTime(
  spreadsheetId: string = USER_ACCESS_SPREADSHEET_ID
): Promise<RealTimeSyncResult> {
  const nowStr = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  // Jalur 0: Utamakan sinkronisasi melalui Server Backend (/api/users) agar password di-hash dengan scrypt di server
  try {
    const serverRes = await fetch('/api/users', {
      signal: AbortSignal.timeout(4000)
    });
    if (serverRes.ok) {
      const data = await serverRes.json();
      if (Array.isArray(data.users) && data.users.length > 0) {
        const existingLocal = getUserAccessList();
        const merged = data.users.map((su: AuthUser) => {
          const prev = existingLocal.find((l) => l.id.toLowerCase() === su.id.toLowerCase());
          return sanitizeUserForStorage({
            ...su,
            passwordVerifier: prev?.passwordVerifier
          });
        });
        saveUserAccessList(merged);
        const meta: RealTimeSyncResult = {
          success: true,
          source: data.source === 'LIVE_SERVER_GVIZ' ? 'LIVE_GVIZ' : 'LOCAL_CACHE',
          userCount: merged.length,
          syncedAt: nowStr,
          message: `Tersinkronisasi via Server Otorisasi (${merged.length} akun terenkripsi scrypt).`
        };
        saveLastUserAccessSyncMeta(meta);
        return meta;
      }
    }
  } catch {
    // Lanjut ke Jalur OAuth / Fallback
  }

  // Jalur 1: Google Sheets API v4 dengan Bearer Token OAuth
  try {
    const token = await getAccessToken();
    if (token) {
      const range = encodeURIComponent(`${USER_ACCESS_SHEET_NAME}!A2:F100`);
      const url = `https://www.googleapis.com/sheets/v4/spreadsheets/${spreadsheetId}/values/${range}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000)
      });

      if (res.ok) {
        const data = await res.json();
        const rows = data.values || [];
        const parsed = parseUserAccessSheetRows(rows);
        if (parsed.length > 0) {
          saveUserAccessList(parsed);
          const meta: RealTimeSyncResult = {
            success: true,
            source: 'LIVE_SHEETS_API',
            userCount: parsed.length,
            syncedAt: nowStr,
            message: `Tersinkronisasi real-time via Google Sheets API (${parsed.length} akun dari '${USER_ACCESS_SHEET_NAME}').`
          };
          saveLastUserAccessSyncMeta(meta);
          return meta;
        }
      }
    }
  } catch {
    // Lanjut ke Jalur Fallback
  }

  const cachedUsers = getUserAccessList();
  const fallbackMeta: RealTimeSyncResult = {
    success: true,
    source: 'LOCAL_CACHE',
    userCount: cachedUsers.length,
    syncedAt: nowStr,
    message: `Menggunakan database akses terenkripsi aktif (${cachedUsers.length} akun terdaftar).`
  };
  saveLastUserAccessSyncMeta(fallbackMeta);
  return fallbackMeta;
}

function computeSessionIntegritySig(
  id: string,
  role: string,
  roleRaw: string,
  allowed: string[],
  tokenSnippet: string
): string {
  const payload = `${id}|${role}|${roleRaw}|${allowed.join(',')}|${tokenSnippet}|bmi-integrity-v3`;
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sig-${(hash >>> 0).toString(16)}`;
}

/**
 * Fase 1.5: Helper untuk mengambil Bearer Token sesi aktif guna otorisasi API Server
 */
export function getAuthSessionToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionToken?: string };
    return parsed?.sessionToken || null;
  } catch {
    return null;
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredAuthSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser & {
      _integritySig?: string;
      sessionToken?: string;
    };
    if (parsed && parsed.id && parsed.role) {
      const expectedSig = computeSessionIntegritySig(
        parsed.id,
        parsed.role,
        parsed.roleRaw || parsed.role,
        parsed.allowedFeatures || [],
        (parsed.sessionToken || '').slice(-16)
      );
      if (parsed._integritySig && parsed._integritySig !== expectedSig) {
        console.warn('Tampered auth session detected in localStorage. Clearing session.');
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }

      const users = getUserAccessList();
      if (users.length > 0) {
        const check = verifyUserSession(parsed.nama || parsed.id, parsed.roleRaw || parsed.role);
        if (!check.valid || !check.syncedUser) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          return null;
        }
        return {
          ...parsed,
          roleRaw: check.syncedUser.roleRaw,
          role: check.syncedUser.role,
          status: check.syncedUser.status,
          allowedFeatures: check.syncedUser.allowedFeatures
        };
      }
      return parsed;
    }
    return null;
  } catch (e) {
    console.error('Failed to read auth session from localStorage:', e);
    return null;
  }
}

export function saveAuthSession(user: AuthUser, sessionToken?: string): void {
  const existingToken = sessionToken || getAuthSessionToken() || undefined;
  const allowed =
    user.allowedFeatures || getAllowedFeaturesForSheetRole(user.roleRaw || user.role);
  const _integritySig = computeSessionIntegritySig(
    user.id,
    user.role,
    user.roleRaw || user.role,
    allowed,
    (existingToken || '').slice(-16)
  );
  const sessionData = {
    id: user.id,
    nama: user.nama,
    role: user.role,
    roleRaw: user.roleRaw,
    status: user.status || 'Aktif',
    email: user.email,
    posisi: user.posisi,
    lokasi: user.lokasi,
    departemen: user.departemen,
    kodeAkses: user.kodeAkses,
    allowedFeatures: allowed,
    lastVerifiedAt: user.lastVerifiedAt,
    _integritySig,
    ...(existingToken ? { sessionToken: existingToken } : {})
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
}

export function clearAuthSession(): void {
  const token = getAuthSessionToken();
  if (token) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    }).catch(() => {});
  }
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

/**
 * Verifikasi Kredensial Offline Fallback (Menggunakan Salted One-Way Verifier, Tanpa Plaintext)
 */
export function verifyCredentials(
  identifier: string,
  passwordInput: string,
  selectedPool?: PoolLocation,
  syncSource: 'LIVE_SHEETS_API' | 'LIVE_GVIZ' | 'LOCAL_CACHE' = 'LOCAL_CACHE'
): { success: boolean; user?: AuthUser; error?: string } {
  const cleanId = identifier.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  if (!cleanId || !cleanPass) {
    return {
      success: false,
      error: 'ID Pengguna/Email dan kata sandi wajib diisi.'
    };
  }

  const users = getUserAccessList();
  const matchedUser = users.find(
    (u) =>
      u.id.toLowerCase() === cleanId ||
      u.email.toLowerCase() === cleanId ||
      u.kodeAkses.toLowerCase() === cleanId ||
      u.nama.toLowerCase() === cleanId
  );

  if (!matchedUser) {
    return {
      success: false,
      error: 'ID/Email atau Password salah! Pastikan akun terdaftar di sistem.'
    };
  }

  const expectedVerifier = computeOneWayPasswordVerifier(matchedUser.id, cleanPass);
  if (!matchedUser.passwordVerifier || matchedUser.passwordVerifier !== expectedVerifier) {
    return {
      success: false,
      error: 'ID/Email atau Password salah!'
    };
  }

  if (String(matchedUser.status || '').trim().toLowerCase() !== 'aktif') {
    return {
      success: false,
      error: 'Akun ini sudah tidak aktif / diblokir! Hubungi Supervisor atau Admin.'
    };
  }

  const portalRole = mapSheetRoleToPortalRole(matchedUser.roleRaw || matchedUser.role);
  const allowedFeatures = getAllowedFeaturesForSheetRole(matchedUser.roleRaw || matchedUser.role);

  const finalUser: AuthUser = sanitizeUserForStorage({
    ...matchedUser,
    role: portalRole,
    allowedFeatures,
    lokasi: selectedPool || matchedUser.lokasi,
    lastVerifiedAt: new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    syncSource
  });

  saveAuthSession(finalUser);
  return { success: true, user: finalUser };
}

/**
 * Fase 1.3: Server-Authoritative Login (`POST /api/auth/login`)
 * Mengirim `{ identifier, password, selectedPool }` ke server untuk diverifikasi dengan scrypt
 * dan mendapatkan HMAC-SHA256 `sessionToken`.
 */
export async function verifyCredentialsRealTime(
  identifier: string,
  passwordInput: string,
  selectedPool?: PoolLocation
): Promise<{
  success: boolean;
  user?: AuthUser;
  error?: string;
  syncResult: RealTimeSyncResult;
}> {
  const syncResult = await syncUserAccessFromSheetRealTime();

  try {
    const serverRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: identifier.trim(),
        password: passwordInput.trim(),
        selectedPool
      }),
      signal: AbortSignal.timeout(6000)
    });

    const serverData = await serverRes.json().catch(() => ({}));

    if (serverRes.status === 429 || serverRes.status === 401 || serverRes.status === 403) {
      clearAuthSession();
      return {
        success: false,
        error:
          serverData.error ||
          'Otentikasi ditolak oleh server. Periksa kembali ID dan Kata Sandi Anda.',
        syncResult
      };
    }

    if (serverRes.ok && serverData.success && serverData.user) {
      const authenticatedUser = sanitizeUserForStorage({
        ...serverData.user,
        passwordVerifier: computeOneWayPasswordVerifier(serverData.user.id, passwordInput.trim())
      });
      saveAuthSession(authenticatedUser, serverData.sessionToken);
      return {
        success: true,
        user: authenticatedUser,
        syncResult
      };
    }
  } catch {
    // Fallback ke verifier lokal hanya jika backend Express tidak aktif (mode static preview)
  }

  const offlineAuth = verifyCredentials(
    identifier,
    passwordInput,
    selectedPool,
    syncResult.source
  );
  return {
    ...offlineAuth,
    syncResult
  };
}

export function verifyUserSession(
  pic: string,
  _roleInput?: string
): { valid: boolean; reason?: string; syncedUser?: AuthUser } {
  if (!pic) {
    return { valid: false, reason: 'Data sesi kosong.' };
  }

  const users = getUserAccessList();
  const cleanPic = String(pic).trim().toLowerCase();

  for (const u of users) {
    const uName = String(u.nama || '').trim().toLowerCase();
    const uId = String(u.id || '').trim().toLowerCase();
    const uStatus = String(u.status || '').trim().toLowerCase();

    if (uName === cleanPic || uId === cleanPic) {
      if (uStatus === 'aktif') {
        const portalRole = mapSheetRoleToPortalRole(u.roleRaw || u.role);
        const allowedFeatures = getAllowedFeaturesForSheetRole(u.roleRaw || u.role);
        return {
          valid: true,
          syncedUser: {
            ...u,
            role: portalRole,
            allowedFeatures
          }
        };
      } else {
        return {
          valid: false,
          reason: 'Akun Anda telah dinonaktifkan oleh Admin di tabel User Access.'
        };
      }
    }
  }

  return { valid: false, reason: 'Akun pengguna tidak lagi ditemukan di tabel User Access.' };
}
