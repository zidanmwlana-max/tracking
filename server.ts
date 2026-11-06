import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import net from 'net';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Papa from 'papaparse';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Fase 1.1: Hardened Session Secret (Fail-fast in production if missing/weak; ephemeral random secret in dev)
function resolveSessionSecret(): string {
  const rawSecret = (process.env.BMI_SESSION_SECRET || '').trim();
  const isPlaceholder =
    !rawSecret ||
    rawSecret === 'change-this-in-company-production-server' ||
    rawSecret === 'bmi-enterprise-workshop-secret-key-2026' ||
    rawSecret === 'replace-with-at-least-32-chars-random-secret-key-for-production';

  if (IS_PRODUCTION && (isPlaceholder || rawSecret.length < 32)) {
    throw new Error(
      '[FATAL SECURITY] BMI_SESSION_SECRET wajib disetel di environment produksi (minimal 32 karakter acak).'
    );
  }

  if (isPlaceholder) {
    return crypto.randomBytes(32).toString('hex');
  }
  return rawSecret;
}

const SESSION_SECRET = resolveSessionSecret();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours shift session validity
const EXTERNAL_FETCH_TIMEOUT_MS = 8000;
const MAX_ERROR_LOG_BYTES = 5 * 1024 * 1024; // 5MB rotation cap

const DATA_DIR = path.resolve(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'workshop-db.json');
const USER_DB_FILE = path.join(DATA_DIR, 'user-access-db.json');
const ADAPTER_CONFIG_FILE = path.join(DATA_DIR, 'adapter-config.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const ERROR_LOG_FILE = path.join(DATA_DIR, 'error-telemetry.log');

// Ensure local server storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(PHOTO_DIR)) {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
}

/**
 * Fase 1.6: Asynchronous Atomic File Persistence (.tmp write -> atomic rename)
 * Prevents truncated/corrupted JSON files if the server process crashes mid-write.
 */
export async function atomicWriteJsonFile(targetPath: string, data: unknown): Promise<void> {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const serialized = JSON.stringify(data, null, 2);
  await fsp.writeFile(tempPath, serialized, 'utf-8');
  await fsp.rename(tempPath, targetPath);
}

/**
 * Formula Injection Sanitizer (OWASP CSV/Formula Injection protection)
 */
export function sanitizeCellForSpreadsheet(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Fase 2.1: Server-Side WorkshopState Schema Validator
 * Prevents corrupted, malformed, or type-confused payloads from overwriting .data/workshop-db.json.
 */
export function validateWorkshopStateSchema(state: unknown): {
  valid: boolean;
  reason?: string;
} {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { valid: false, reason: 'Payload state harus berupa objek JSON.' };
  }
  const s = state as Record<string, unknown>;
  const requiredArrays = ['trucks', 'chassis', 'workOrders'];
  for (const key of requiredArrays) {
    if (!Array.isArray(s[key])) {
      return {
        valid: false,
        reason: `Field wajib "${key}" harus berupa Array yang valid.`
      };
    }
  }

  const optionalArrays = ['gensets', 'tires', 'parts', 'partRequests', 'incidents', 'notifications'];
  for (const key of optionalArrays) {
    if (s[key] !== undefined && !Array.isArray(s[key])) {
      return {
        valid: false,
        reason: `Field "${key}" harus berupa Array jika disertakan.`
      };
    }
  }

  const trucks = s.trucks as Array<Record<string, unknown>>;
  if (trucks.length > 5000) {
    return { valid: false, reason: 'Jumlah entri trucks melebihi batas maksimum (5000).' };
  }
  for (let i = 0; i < Math.min(trucks.length, 50); i++) {
    const t = trucks[i];
    if (!t || typeof t !== 'object' || typeof t.idUnit !== 'string' || !t.idUnit.trim()) {
      return {
        valid: false,
        reason: `Entri trucks[${i}] tidak valid: properti string "idUnit" wajib ada.`
      };
    }
  }

  const workOrders = s.workOrders as Array<Record<string, unknown>>;
  if (workOrders.length > 20000) {
    return { valid: false, reason: 'Jumlah entri workOrders melebihi batas maksimum (20000).' };
  }

  return { valid: true };
}

/**
 * Fase 1.2: SSRF Protection — External Adapter URL Validator
 * Blocks private/loopback/link-local/cloud-metadata IPs and enforces HTTPS in production.
 */
function isPrivateOrReservedIp(ip: string): boolean {
  const cleanIp = ip.replace(/^\[|\]$/g, '').toLowerCase();
  if (cleanIp === '::1' || cleanIp === '::' || cleanIp === '0.0.0.0') return true;
  if (cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
    return true;
  }
  const mappedIpv4Match = cleanIp.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const ipv4 = mappedIpv4Match ? mappedIpv4Match[1] : cleanIp;

  const parts = ipv4.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !Number.isNaN(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (AWS/GCP/Azure Cloud Metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  }
  return false;
}

export function validateSafeExternalAdapterUrl(rawUrl: string): {
  valid: boolean;
  reason?: string;
  normalizedUrl?: string;
} {
  const trimmed = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return { valid: true, normalizedUrl: '' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Format URL adapter eksternal tidak valid.' };
  }

  const allowHttpInDev = !IS_PRODUCTION && process.env.ALLOW_HTTP_ADAPTER === 'true';
  if (parsed.protocol !== 'https:' && !(allowHttpInDev && parsed.protocol === 'http:')) {
    return {
      valid: false,
      reason: 'URL adapter eksternal wajib menggunakan protokol HTTPS yang aman.'
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const blockedHostnames = [
    'localhost',
    'metadata.google.internal',
    'metadata',
    'instance-data',
    '0.0.0.0'
  ];
  if (
    blockedHostnames.includes(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return {
      valid: false,
      reason: 'Hostname internal atau localhost tidak diizinkan untuk mencegah SSRF.'
    };
  }

  if (net.isIP(hostname.replace(/^\[|\]$/g, '')) && isPrivateOrReservedIp(hostname)) {
    return {
      valid: false,
      reason: 'Alamat IP privat, loopback, atau link-local metadata tidak diizinkan (SSRF Protection).'
    };
  }

  const allowedHostsEnv = (process.env.BMI_ALLOWED_ADAPTER_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHostsEnv.length > 0 && !allowedHostsEnv.includes(hostname)) {
    return {
      valid: false,
      reason: `Hostname "${hostname}" tidak termasuk dalam daftar BMI_ALLOWED_ADAPTER_HOSTS.`
    };
  }

  return { valid: true, normalizedUrl: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '') };
}

/**
 * Bounded In-Memory Rate Limiter (Anti-Spoofing & Memory Exhaustion Safe)
 */
interface RateLimitRecord {
  attempts: number;
  resetAt: number;
}
const loginRateLimitMap = new Map<string, RateLimitRecord>();
const errorLogRateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_RATE_LIMIT_MAP_SIZE = 5000;

function pruneRateLimitMap(map: Map<string, RateLimitRecord>): void {
  if (map.size < MAX_RATE_LIMIT_MAP_SIZE) return;
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if (now > v.resetAt) map.delete(k);
  }
  if (map.size >= MAX_RATE_LIMIT_MAP_SIZE) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
}

function getSafeClientIp(req: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return String(req.ip || req.socket.remoteAddress || 'local');
}

function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const record = loginRateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    return { allowed: true };
  }
  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((record.resetAt - now) / 1000)
    };
  }
  return { allowed: true };
}

function recordFailedLoginAttempt(key: string): void {
  pruneRateLimitMap(loginRateLimitMap);
  const now = Date.now();
  const record = loginRateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    loginRateLimitMap.set(key, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    record.attempts += 1;
  }
}

function clearLoginRateLimit(key: string): void {
  loginRateLimitMap.delete(key);
}

/**
 * Fase 1.3: Server-Side Password Hashing with Node crypto.scryptSync & Timing-Safe Compare
 */
export function hashPasswordScrypt(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

export function verifyPasswordScrypt(plainPassword: string, storedHash: string): boolean {
  try {
    if (!storedHash || !storedHash.startsWith('scrypt$')) return false;
    const [, salt, keyHex] = storedHash.split('$');
    if (!salt || !keyHex) return false;
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(plainPassword, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export interface ServerUserRecord {
  id: string;
  nama: string;
  roleRaw: string;
  role: 'SUPERVISOR' | 'MEKANIK' | 'ADMIN';
  passwordHash: string;
  status: 'Aktif' | 'Nonaktif';
  email: string;
  posisi: string;
  lokasi: string;
  departemen: string;
  kodeAkses: string;
  allowedFeatures?: string[];
}

function mapRoleToPortal(roleRaw: string): 'SUPERVISOR' | 'MEKANIK' {
  const clean = String(roleRaw || '').trim().toLowerCase();
  if (clean.includes('teknisi') || clean.includes('mekanik')) return 'MEKANIK';
  return 'SUPERVISOR';
}

function getDefaultAllowedFeatures(roleRaw: string): string[] {
  const clean = String(roleRaw || '').trim().toLowerCase();
  if (clean.includes('teknisi') || clean.includes('mekanik')) {
    return ['tires', 'warehouse-tires', 'chassis-checklist', 'workorders'];
  }
  if (clean.includes('advisor')) {
    return [
      'dashboard',
      'workorders',
      'workorders.manage',
      'incidents',
      'inventory',
      'fleet',
      'tires',
      'warehouse-tires',
      'chassis-checklist'
    ];
  }
  return [
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
    'architecture'
  ];
}

function createInitialServerUsers(): ServerUserRecord[] {
  const defaultPass = process.env.BMI_DEFAULT_INITIAL_PASSWORD || 'bmi2026';
  const legacyPass = '123456';
  return [
    {
      id: 'Admin001',
      nama: 'Administrator Bengkel BMI',
      roleRaw: 'Admin',
      role: 'SUPERVISOR',
      passwordHash: hashPasswordScrypt(defaultPass),
      status: 'Aktif',
      email: 'admin001@bmi.co.id',
      posisi: 'Admin · Manajemen & Kontrol',
      lokasi: 'BMI Surabaya',
      departemen: 'Portal Service Advisor / Supervisor',
      kodeAkses: 'Admin001',
      allowedFeatures: getDefaultAllowedFeatures('Admin')
    },
    {
      id: 'Supervisor01',
      nama: 'Supervisor Armada BMI',
      roleRaw: 'Supervisor',
      role: 'SUPERVISOR',
      passwordHash: hashPasswordScrypt(legacyPass),
      status: 'Aktif',
      email: 'supervisor01@bmi.co.id',
      posisi: 'Supervisor · Manajemen & Kontrol',
      lokasi: 'BMI Lamongan',
      departemen: 'Portal Service Advisor / Supervisor',
      kodeAkses: 'Supervisor01',
      allowedFeatures: getDefaultAllowedFeatures('Supervisor')
    },
    {
      id: 'Teknisi01',
      nama: 'Teknisi Bengkel BMI',
      roleRaw: 'Teknisi',
      role: 'MEKANIK',
      passwordHash: hashPasswordScrypt(legacyPass),
      status: 'Aktif',
      email: 'teknisi01@bmi.co.id',
      posisi: 'Teknisi · Eksekusi Bengkel',
      lokasi: 'BMI Surabaya',
      departemen: 'Portal Lapangan (Mekanik)',
      kodeAkses: 'Teknisi01',
      allowedFeatures: getDefaultAllowedFeatures('Teknisi')
    }
  ];
}

function loadServerUsers(): ServerUserRecord[] {
  try {
    if (fs.existsSync(USER_DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(USER_DB_FILE, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Fallback to initial seed
  }
  const initial = createInitialServerUsers();
  try {
    fs.writeFileSync(USER_DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  } catch {
    // Ignore write failure on read-only fs
  }
  return initial;
}

function stripSensitiveUserFields(u: ServerUserRecord) {
  const { passwordHash: _removed, ...safeUser } = u;
  return {
    ...safeUser,
    credentialStatus: 'ENCRYPTED_SCRYPT'
  };
}

/**
 * HMAC-SHA256 Session Token Signer, Timing-Safe Verifier & Revocation List
 */
export interface TokenPayload {
  jti: string;
  id: string;
  nama: string;
  role: 'SUPERVISOR' | 'MEKANIK' | 'ADMIN';
  roleRaw: string;
  issuedAt: number;
  expiresAt: number;
}

const revokedTokenJtis = new Set<string>();

export function signSessionToken(payload: {
  id: string;
  nama: string;
  role: 'SUPERVISOR' | 'MEKANIK' | 'ADMIN';
  roleRaw: string;
}): string {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_MS;
  const jti = crypto.randomBytes(12).toString('hex');
  const data = JSON.stringify({ ...payload, jti, issuedAt, expiresAt });
  const base64Data = Buffer.from(data).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(base64Data)
    .digest('base64url');
  return `${base64Data}.${signature}`;
}

export function verifySignedToken(token: string): {
  valid: boolean;
  payload?: TokenPayload;
} {
  try {
    const [base64Data, signature] = String(token || '').split('.');
    if (!base64Data || !signature) return { valid: false };
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(base64Data)
      .digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf-8');
    const expectedBuf = Buffer.from(expectedSig, 'utf-8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false };
    }

    const payload = JSON.parse(
      Buffer.from(base64Data, 'base64url').toString('utf-8')
    ) as TokenPayload;
    if (!payload.expiresAt || Date.now() > payload.expiresAt) return { valid: false };
    if (payload.jti && revokedTokenJtis.has(payload.jti)) return { valid: false };

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

function extractTokenFromRequest(req: Request): string | null {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const customHeader = String(req.headers['x-session-token'] || '').trim();
  if (customHeader) return customHeader;
  return null;
}

/**
 * Fase 1.5: Express Authentication & Role-Based Authorization Middlewares
 */
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({
      error: 'Akses ditolak. Token sesi autentikasi wajib disertakan (401 Unauthorized).'
    });
    return;
  }
  const verified = verifySignedToken(token);
  if (!verified.valid || !verified.payload) {
    res.status(401).json({
      error: 'Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.'
    });
    return;
  }
  (req as Request & { authUser?: TokenPayload }).authUser = verified.payload;
  next();
}

function requireSupervisor(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const authUser = (req as Request & { authUser?: TokenPayload }).authUser;
    if (!authUser || authUser.role !== 'SUPERVISOR') {
      res.status(403).json({
        error: 'Akses ditolak. Operasi ini memerlukan otorisasi Supervisor / Admin (403 Forbidden).'
      });
      return;
    }
    next();
  });
}

function requireAdminOrSupervisor(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const authUser = (req as Request & { authUser?: TokenPayload }).authUser;
    if (!authUser || (authUser.role !== 'SUPERVISOR' && authUser.role !== 'ADMIN')) {
      res.status(403).json({
        error: 'Akses ditolak. Operasi ini memerlukan otorisasi Admin atau Supervisor (403 Forbidden).'
      });
      return;
    }
    next();
  });
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));

  // Fase 1.1 & Kat 1.3: Comprehensive Security Headers Middleware (CSP, X-Frame-Options, HSTS)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    if (IS_PRODUCTION) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.googleapis.com https://docs.google.com https://*.firebaseio.com https://*.firebaseapp.com; frame-ancestors 'none';"
    );
    next();
  });

  // Fase 2.2: Built-in HTTP Gzip Compression Middleware for JSON API Responses (> 1KB)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    if (!acceptEncoding.includes('gzip') || !req.path.startsWith('/api/')) {
      next();
      return;
    }
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      try {
        const jsonString = JSON.stringify(body);
        if (jsonString && jsonString.length > 1024) {
          const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Vary', 'Accept-Encoding');
          res.setHeader('Content-Length', String(compressed.length));
          return res.send(compressed);
        }
      } catch {
        // Fallback to uncompressed json
      }
      return originalJson(body);
    };
    next();
  });

  interface AdapterConfig {
    enabled: boolean;
    externalApiUrl: string;
    externalApiKey: string;
    stateEndpoint: string;
    syncEndpoint: string;
  }

  function loadAdapterConfig(): AdapterConfig {
    try {
      if (fs.existsSync(ADAPTER_CONFIG_FILE)) {
        const raw = JSON.parse(fs.readFileSync(ADAPTER_CONFIG_FILE, 'utf-8'));
        const candidateUrl = String(
          raw.externalApiUrl || process.env.BMI_EXTERNAL_API_URL || ''
        ).trim();
        const urlCheck = validateSafeExternalAdapterUrl(candidateUrl);
        return {
          enabled: Boolean(raw.enabled) && urlCheck.valid && Boolean(urlCheck.normalizedUrl),
          externalApiUrl: urlCheck.valid ? urlCheck.normalizedUrl || '' : '',
          externalApiKey: String(
            raw.externalApiKey || process.env.BMI_EXTERNAL_API_KEY || ''
          ).trim(),
          stateEndpoint: String(raw.stateEndpoint || '/workshop/state').trim(),
          syncEndpoint: String(raw.syncEndpoint || '/workshop/sync').trim()
        };
      }
    } catch {
      // Fallback to defaults
    }
    const envUrl = String(process.env.BMI_EXTERNAL_API_URL || '').trim();
    const envCheck = validateSafeExternalAdapterUrl(envUrl);
    return {
      enabled: Boolean(envUrl) && envCheck.valid,
      externalApiUrl: envCheck.valid ? envCheck.normalizedUrl || '' : '',
      externalApiKey: String(process.env.BMI_EXTERNAL_API_KEY || '').trim(),
      stateEndpoint: '/workshop/state',
      syncEndpoint: '/workshop/sync'
    };
  }

  // 1. Public Health Endpoint (Does not leak secrets or internal URLs)
  app.get('/api/health', (_req: Request, res: Response) => {
    const adapterCfg = loadAdapterConfig();
    const storageMode =
      adapterCfg.enabled && adapterCfg.externalApiUrl
        ? 'EXTERNAL_PAID_API'
        : process.env.GOOGLE_SERVICE_ACCOUNT_JSON
          ? 'GOOGLE_SERVICE_ACCOUNT'
          : 'LOCAL_COMPANY_SERVER';

    res.json({
      status: 'ok',
      service: 'BMI Enterprise Workshop API Server',
      storageMode,
      hasLocalDatabase: fs.existsSync(DB_FILE),
      adapterConfig: {
        enabled: adapterCfg.enabled,
        hasExternalUrl: Boolean(adapterCfg.externalApiUrl),
        hasApiKey: Boolean(adapterCfg.externalApiKey),
        stateEndpoint: adapterCfg.stateEndpoint,
        syncEndpoint: adapterCfg.syncEndpoint
      },
      timestamp: new Date().toISOString()
    });
  });

  // 1b. Fase 1.2: Protected Adapter Configuration Endpoint (Supervisor Only + SSRF Validation)
  app.get('/api/config/adapter', requireSupervisor, (_req: Request, res: Response) => {
    const cfg = loadAdapterConfig();
    res.json({
      enabled: cfg.enabled,
      externalApiUrl: cfg.externalApiUrl,
      externalApiKey: cfg.externalApiKey ? `••••••••${cfg.externalApiKey.slice(-4)}` : '',
      hasApiKey: Boolean(cfg.externalApiKey),
      stateEndpoint: cfg.stateEndpoint,
      syncEndpoint: cfg.syncEndpoint
    });
  });

  app.post('/api/config/adapter', requireSupervisor, async (req: Request, res: Response) => {
    try {
      const current = loadAdapterConfig();
      const rawUrl = String(req.body?.externalApiUrl ?? current.externalApiUrl).trim();
      const urlCheck = validateSafeExternalAdapterUrl(rawUrl);

      if (!urlCheck.valid) {
        res.status(400).json({
          success: false,
          error: urlCheck.reason || 'URL adapter eksternal ditolak oleh kebijakan keamanan SSRF.'
        });
        return;
      }

      const incomingKey = String(req.body?.externalApiKey ?? '').trim();
      const resolvedKey =
        !incomingKey || incomingKey.startsWith('••••') ? current.externalApiKey : incomingKey;

      const safeStateEndpoint = String(req.body?.stateEndpoint || '/workshop/state').trim();
      const safeSyncEndpoint = String(req.body?.syncEndpoint || '/workshop/sync').trim();
      if (!safeStateEndpoint.startsWith('/') || !safeSyncEndpoint.startsWith('/')) {
        res.status(400).json({
          success: false,
          error: 'Path endpoint state/sync harus diawali dengan karakter "/".'
        });
        return;
      }

      const nextCfg: AdapterConfig = {
        enabled: Boolean(req.body?.enabled) && Boolean(urlCheck.normalizedUrl),
        externalApiUrl: urlCheck.normalizedUrl || '',
        externalApiKey: resolvedKey,
        stateEndpoint: safeStateEndpoint,
        syncEndpoint: safeSyncEndpoint
      };

      await atomicWriteJsonFile(ADAPTER_CONFIG_FILE, nextCfg);
      res.json({
        success: true,
        config: {
          enabled: nextCfg.enabled,
          externalApiUrl: nextCfg.externalApiUrl,
          hasApiKey: Boolean(nextCfg.externalApiKey),
          stateEndpoint: nextCfg.stateEndpoint,
          syncEndpoint: nextCfg.syncEndpoint
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi koneksi.';
      res.status(500).json({ success: false, error: msg });
    }
  });

  // 2. Fase 1.3 & 1.4: Server-Side User Access Sync & Sanitized User List (Zero Plaintext Passwords)
  async function syncUsersFromGoogleSheetServerSide(spreadsheetId?: string): Promise<{
    synced: boolean;
    count: number;
    users: ServerUserRecord[];
  }> {
    const existingUsers = loadServerUsers();
    const sheetId =
      spreadsheetId ||
      process.env.BMI_SPREADSHEET_ID ||
      '1LVPzTUXrT2HLNbQDNRPh5kzW0dFyBKyLnMuVhscRjT4';
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
        sheetId
      )}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent('User Access')}`;
      const res = await fetch(gvizUrl, {
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) {
        return { synced: false, count: existingUsers.length, users: existingUsers };
      }
      const text = await res.text();
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        return { synced: false, count: existingUsers.length, users: existingUsers };
      }
      const jsonPayload = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      const tableRows = jsonPayload?.table?.rows || [];
      const nextUsers: ServerUserRecord[] = [];

      tableRows.forEach((r: { c?: Array<{ v?: unknown } | null> }, index: number) => {
        const cells = (r.c || []).map((cell) =>
          cell && cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : ''
        );
        const colAId = cells[0] || '';
        const colBName = cells[1] || '';
        const colCRole = cells[2] || 'Teknisi';
        const colDPass = cells[3] || '';
        const colEStatus = cells[4] || 'Aktif';
        const colFCustom = cells[5] || '';

        if (
          !colAId ||
          colAId.toLowerCase() === 'id' ||
          colAId.toLowerCase().includes('id / email') ||
          colAId.toLowerCase().includes('username') ||
          colBName.toLowerCase() === 'nama'
        ) {
          return;
        }

        const role = mapRoleToPortal(colCRole);
        const isAktif = colEStatus.toLowerCase() === 'aktif';
        const email = colAId.includes('@')
          ? colAId.toLowerCase()
          : `${colAId.toLowerCase().replace(/[^a-z0-9]/g, '')}@bmi.co.id`;

        let allowedFeatures = getDefaultAllowedFeatures(colCRole);
        if (colFCustom) {
          const customList = colFCustom
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          if (customList.length > 0) allowedFeatures = customList;
        }

        // Preserve existing scrypt hash if user already exists and sheet password wasn't changed
        const prevUser = existingUsers.find(
          (u) => u.id.toLowerCase() === colAId.toLowerCase()
        );
        const rawPassToHash = colDPass || '123456';
        const passwordHash =
          prevUser && verifyPasswordScrypt(rawPassToHash, prevUser.passwordHash)
            ? prevUser.passwordHash
            : hashPasswordScrypt(rawPassToHash);

        nextUsers.push({
          id: colAId,
          nama: colBName || colAId,
          roleRaw: colCRole,
          role,
          passwordHash,
          status: isAktif ? 'Aktif' : 'Nonaktif',
          email,
          posisi:
            role === 'MEKANIK'
              ? `${colCRole} · Eksekusi Bengkel`
              : `${colCRole} · Manajemen & Kontrol`,
          lokasi:
            index % 3 === 1 ? 'BMI Lamongan' : index % 3 === 2 ? 'BMI Dampit' : 'BMI Surabaya',
          departemen:
            role === 'MEKANIK'
              ? 'Portal Lapangan (Mekanik)'
              : 'Portal Service Advisor / Supervisor',
          kodeAkses: colAId,
          allowedFeatures
        });
      });

      if (nextUsers.length > 0) {
        await atomicWriteJsonFile(USER_DB_FILE, nextUsers);
        return { synced: true, count: nextUsers.length, users: nextUsers };
      }
    } catch {
      // Fallback to local server user DB
    }
    return { synced: false, count: existingUsers.length, users: existingUsers };
  }

  app.get('/api/users', async (_req: Request, res: Response) => {
    const syncRes = await syncUsersFromGoogleSheetServerSide();
    res.json({
      success: true,
      source: syncRes.synced ? 'LIVE_SERVER_GVIZ' : 'LOCAL_SERVER_USER_DB',
      userCount: syncRes.users.length,
      users: syncRes.users.map(stripSensitiveUserFields)
    });
  });

  app.post('/api/users/create', requireSupervisor, async (req: Request, res: Response) => {
    const { id, nama, roleRaw, password, status, lokasi } = req.body || {};
    const cleanId = String(id || '').trim();
    const cleanNama = String(nama || '').trim();
    const cleanPass = String(password || '').trim();
    const cleanRoleRaw = String(roleRaw || 'Teknisi').trim();

    if (!cleanId || !cleanNama || cleanPass.length < 6) {
      res.status(400).json({
        success: false,
        error: 'ID, Nama Lengkap, dan Kata Sandi (minimal 6 karakter) wajib diisi.'
      });
      return;
    }

    const users = loadServerUsers();
    if (users.some((u) => u.id.toLowerCase() === cleanId.toLowerCase())) {
      res.status(409).json({
        success: false,
        error: `ID Pengguna "${cleanId}" sudah terdaftar.`
      });
      return;
    }

    const role = mapRoleToPortal(cleanRoleRaw);
    const email = cleanId.includes('@')
      ? cleanId.toLowerCase()
      : `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '')}@bmi.co.id`;

    const newUser: ServerUserRecord = {
      id: cleanId,
      nama: cleanNama,
      roleRaw: cleanRoleRaw,
      role,
      passwordHash: hashPasswordScrypt(cleanPass),
      status: status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
      email,
      posisi:
        role === 'MEKANIK'
          ? `${cleanRoleRaw} · Eksekusi Bengkel`
          : `${cleanRoleRaw} · Manajemen & Kontrol`,
      lokasi: String(lokasi || 'BMI Surabaya'),
      departemen:
        role === 'MEKANIK'
          ? 'Portal Lapangan (Mekanik)'
          : 'Portal Service Advisor / Supervisor',
      kodeAkses: cleanId,
      allowedFeatures: getDefaultAllowedFeatures(cleanRoleRaw)
    };

    const updated = [...users, newUser];
    await atomicWriteJsonFile(USER_DB_FILE, updated);
    res.json({
      success: true,
      user: stripSensitiveUserFields(newUser),
      users: updated.map(stripSensitiveUserFields)
    });
  });

  app.post('/api/users/update', requireSupervisor, async (req: Request, res: Response) => {
    const { id, roleRaw, status, newPassword } = req.body || {};
    const cleanId = String(id || '').trim().toLowerCase();
    if (!cleanId) {
      res.status(400).json({ success: false, error: 'ID pengguna wajib diisi.' });
      return;
    }

    const users = loadServerUsers();
    const idx = users.findIndex((u) => u.id.toLowerCase() === cleanId);
    if (idx === -1) {
      res.status(404).json({ success: false, error: 'Akun pengguna tidak ditemukan.' });
      return;
    }

    const target = { ...users[idx] };
    if (typeof roleRaw === 'string' && roleRaw.trim()) {
      target.roleRaw = roleRaw.trim();
      target.role = mapRoleToPortal(target.roleRaw);
      target.allowedFeatures = getDefaultAllowedFeatures(target.roleRaw);
      target.departemen =
        target.role === 'MEKANIK'
          ? 'Portal Lapangan (Mekanik)'
          : 'Portal Service Advisor / Supervisor';
    }
    if (status === 'Aktif' || status === 'Nonaktif') {
      target.status = status;
    }
    if (typeof newPassword === 'string' && newPassword.trim()) {
      if (newPassword.trim().length < 6) {
        res.status(400).json({
          success: false,
          error: 'Kata sandi baru minimal harus 6 karakter.'
        });
        return;
      }
      target.passwordHash = hashPasswordScrypt(newPassword.trim());
    }

    users[idx] = target;
    await atomicWriteJsonFile(USER_DB_FILE, users);
    res.json({
      success: true,
      user: stripSensitiveUserFields(target),
      users: users.map(stripSensitiveUserFields)
    });
  });

  // 3. Fase 1.3: Strict Server-Side Authentication (Rejects Client-Side Spoofed Payloads)
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const clientIp = getSafeClientIp(req);
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const passwordInput = String(req.body?.password || '').trim();
    const selectedPool = req.body?.selectedPool ? String(req.body.selectedPool) : undefined;
    const rateKey = `${clientIp}:${identifier || 'anonymous'}`;

    const rateCheck = checkLoginRateLimit(rateKey);
    if (!rateCheck.allowed) {
      res.status(429).json({
        success: false,
        error: `Terlalu banyak percobaan login gagal. Silakan coba lagi dalam ${rateCheck.retryAfterSec} detik.`
      });
      return;
    }

    // Critical Security Fix: Never trust `success: true` or `userCandidate` without verifying `password` on the server
    if (!identifier || !passwordInput) {
      recordFailedLoginAttempt(rateKey);
      res.status(401).json({
        success: false,
        error: 'ID/Email dan Kata Sandi wajib diverifikasi oleh server.'
      });
      return;
    }

    const syncRes = await syncUsersFromGoogleSheetServerSide();
    const users = syncRes.users;

    const matchedUser = users.find(
      (u) =>
        u.id.toLowerCase() === identifier ||
        u.email.toLowerCase() === identifier ||
        u.kodeAkses.toLowerCase() === identifier ||
        u.nama.toLowerCase() === identifier
    );

    if (!matchedUser || !verifyPasswordScrypt(passwordInput, matchedUser.passwordHash)) {
      recordFailedLoginAttempt(rateKey);
      res.status(401).json({
        success: false,
        error: 'ID/Email atau Kata Sandi tidak valid.'
      });
      return;
    }

    if (String(matchedUser.status || '').toLowerCase() !== 'aktif') {
      recordFailedLoginAttempt(rateKey);
      res.status(403).json({
        success: false,
        error: 'Akun ini telah dinonaktifkan. Hubungi Supervisor atau Admin.'
      });
      return;
    }

    clearLoginRateLimit(rateKey);
    const token = signSessionToken({
      id: matchedUser.id,
      nama: matchedUser.nama,
      role: matchedUser.role,
      roleRaw: matchedUser.roleRaw
    });

    const safeUser = {
      ...stripSensitiveUserFields(matchedUser),
      lokasi: selectedPool || matchedUser.lokasi,
      lastVerifiedAt: new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      syncSource: syncRes.synced ? 'LIVE_GVIZ' : 'LOCAL_CACHE'
    };

    res.json({
      success: true,
      user: safeUser,
      sessionToken: token
    });
  });

  // 3b. Verify Session Token & Logout Revocation Endpoints
  app.post('/api/auth/verify', (req: Request, res: Response) => {
    const token =
      extractTokenFromRequest(req) || String(req.body?.sessionToken || '').trim();
    if (!token) {
      res.status(401).json({ valid: false });
      return;
    }
    const result = verifySignedToken(token);
    res.json(result);
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token =
      extractTokenFromRequest(req) || String(req.body?.sessionToken || '').trim();
    if (token) {
      const verified = verifySignedToken(token);
      if (verified.valid && verified.payload?.jti) {
        if (revokedTokenJtis.size > 10000) {
          revokedTokenJtis.clear();
        }
        revokedTokenJtis.add(verified.payload.jti);
      }
    }
    res.json({ success: true });
  });

  // 4. Fase 1.5 & 1.6: Authenticated State Persistence with Atomic Write & Optimistic Concurrency Control
  app.get('/api/workshop/state', requireAuth, async (_req: Request, res: Response) => {
    try {
      const adapterCfg = loadAdapterConfig();
      if (adapterCfg.enabled && adapterCfg.externalApiUrl) {
        const urlCheck = validateSafeExternalAdapterUrl(adapterCfg.externalApiUrl);
        if (urlCheck.valid && urlCheck.normalizedUrl) {
          try {
            const extRes = await fetch(
              `${urlCheck.normalizedUrl}${adapterCfg.stateEndpoint}`,
              {
                headers: {
                  Authorization: `Bearer ${adapterCfg.externalApiKey || ''}`
                },
                signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS)
              }
            );
            if (extRes.ok) {
              const extData = await extRes.json();
              const resolvedState = extData.state || extData;
              res.json({
                source: 'EXTERNAL_API',
                stateVersion: Number(resolvedState?.stateVersion || 1),
                state: resolvedState
              });
              return;
            }
          } catch {
            // Automatic fallback to local DB if external server is unreachable
          }
        }
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = await fsp.readFile(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const stateVersion = Number(parsed?.stateVersion || 1);
        res.json({
          source: 'LOCAL_SERVER_DB',
          stateVersion,
          state: { ...parsed, stateVersion }
        });
        return;
      }

      res.json({ source: 'EMPTY', stateVersion: 0, state: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/workshop/sync', requireAuth, async (req: Request, res: Response) => {
    try {
      const { state, baseVersion, forceOverwrite } = req.body || {};
      const schemaCheck = validateWorkshopStateSchema(state);
      if (!schemaCheck.valid) {
        res.status(400).json({
          error: schemaCheck.reason || 'Payload state tidak valid.'
        });
        return;
      }

      let currentServerVersion = 0;
      let currentServerState: Record<string, unknown> | null = null;
      if (fs.existsSync(DB_FILE)) {
        try {
          const existingRaw = await fsp.readFile(DB_FILE, 'utf-8');
          currentServerState = JSON.parse(existingRaw);
          currentServerVersion = Number(currentServerState?.stateVersion || 1);
        } catch {
          currentServerVersion = 0;
        }
      }

      // Fase 1.6: Optimistic Concurrency Control — Reject stale overwrites & save conflict snapshot
      if (
        !forceOverwrite &&
        typeof baseVersion === 'number' &&
        currentServerVersion > 0 &&
        baseVersion < currentServerVersion
      ) {
        const conflictFile = path.join(
          BACKUP_DIR,
          `workshop-conflict-${Date.now()}.json`
        );
        await atomicWriteJsonFile(conflictFile, {
          conflictDetectedAt: new Date().toISOString(),
          clientBaseVersion: baseVersion,
          serverVersion: currentServerVersion,
          rejectedClientState: state
        });

        res.status(409).json({
          error: `Terdeteksi pembaruan data dari pengguna lain (Versi Server: v${currentServerVersion}, Versi Klien: v${baseVersion}). Data telah disinkronkan ulang agar tidak menimpa perubahan rekan Anda.`,
          code: 'STATE_VERSION_CONFLICT',
          serverVersion: currentServerVersion,
          state: currentServerState
        });
        return;
      }

      const nextVersion = currentServerVersion + 1;
      const savedAt = new Date().toISOString();
      const versionedState = {
        ...state,
        stateVersion: nextVersion,
        serverSavedAt: savedAt
      };

      // Atomic write to local server JSON DB
      await atomicWriteJsonFile(DB_FILE, versionedState);

      // Create daily rolling backup snapshot atomically (1 snapshot per day)
      const dateTag = savedAt.slice(0, 10);
      const backupFile = path.join(BACKUP_DIR, `workshop-backup-${dateTag}.json`);
      if (!fs.existsSync(backupFile)) {
        await atomicWriteJsonFile(backupFile, versionedState);
      }

      // Forward to external server only if SSRF validation passes
      const adapterCfg = loadAdapterConfig();
      let forwardedToExternal = false;
      if (adapterCfg.enabled && adapterCfg.externalApiUrl) {
        const urlCheck = validateSafeExternalAdapterUrl(adapterCfg.externalApiUrl);
        if (urlCheck.valid && urlCheck.normalizedUrl) {
          try {
            const extRes = await fetch(
              `${urlCheck.normalizedUrl}${adapterCfg.syncEndpoint}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${adapterCfg.externalApiKey || ''}`
                },
                body: JSON.stringify({ state: versionedState, stateVersion: nextVersion }),
                signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS)
              }
            );
            forwardedToExternal = extRes.ok;
          } catch {
            forwardedToExternal = false;
          }
        }
      }

      res.json({
        success: true,
        stateVersion: nextVersion,
        savedAt,
        updatedAt: savedAt.slice(0, 19).replace('T', ' '),
        backupCreated: path.basename(backupFile),
        forwardedToExternal
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: msg });
    }
  });

  // 5. Protected Formula-Injection-Safe Row Sanitizer Endpoint
  app.post('/api/sheets/sanitize-row', requireAuth, (req: Request, res: Response) => {
    const rawValues: unknown[] = Array.isArray(req.body?.values) ? req.body.values : [];
    const sanitized = rawValues.map(sanitizeCellForSpreadsheet);
    res.json({ sanitized });
  });

  // 6. Bounded & Rate-Limited Client Error Telemetry Logger (Max 16KB body)
  app.post('/api/logs/client-error', async (req: Request, res: Response) => {
    try {
      const rawBodySize = Buffer.byteLength(JSON.stringify(req.body || {}), 'utf-8');
      if (rawBodySize > 16 * 1024) {
        res.status(413).json({
          logged: false,
          error: 'Ukuran payload log melebihi batas maksimum 16KB (413 Payload Too Large).'
        });
        return;
      }

      const clientIp = getSafeClientIp(req);
      const now = Date.now();
      pruneRateLimitMap(errorLogRateLimitMap);
      const rec = errorLogRateLimitMap.get(clientIp);
      if (rec && now < rec.resetAt && rec.attempts >= 20) {
        res.status(429).json({ logged: false, error: 'Rate limit exceeded' });
        return;
      }
      if (!rec || now >= rec.resetAt) {
        errorLogRateLimitMap.set(clientIp, { attempts: 1, resetAt: now + 60 * 1000 });
      } else {
        rec.attempts += 1;
      }

      const entry = {
        timestamp: new Date().toISOString(),
        module: String(req.body?.module || 'unknown').slice(0, 120),
        message: String(req.body?.message || 'Unknown client error').slice(0, 1000),
        stack: String(req.body?.stack || '').slice(0, 4000),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300)
      };

      // Rotate error log if it exceeds 5MB
      if (fs.existsSync(ERROR_LOG_FILE)) {
        const stat = await fsp.stat(ERROR_LOG_FILE);
        if (stat.size > MAX_ERROR_LOG_BYTES) {
          await fsp.rename(ERROR_LOG_FILE, `${ERROR_LOG_FILE}.1`);
        }
      }

      await fsp.appendFile(ERROR_LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
      res.json({ logged: true });
    } catch {
      res.status(200).json({ logged: false });
    }
  });

  // 7. Advanced Streaming CSV Export Endpoint with RBAC, UTF-8 BOM, & OWASP Formula Sanitization
  const handleCsvExport = async (req: Request, res: Response): Promise<void> => {
    try {
      const rawCats = req.method === 'POST' ? req.body?.categories : req.query?.categories;
      const categories: string[] = Array.isArray(rawCats)
        ? rawCats.map((c: unknown) => String(c).trim().toLowerCase())
        : typeof rawCats === 'string'
        ? rawCats.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
        : [];

      // Edge case: No category chosen
      if (categories.length === 0) {
        res.status(400).json({
          error: 'Pilih minimal satu kategori data untuk diexport.'
        });
        return;
      }

      const startDate = String((req.method === 'POST' ? req.body?.startDate : req.query?.startDate) || '');
      const endDate = String((req.method === 'POST' ? req.body?.endDate : req.query?.endDate) || '');
      const statusFilter = String((req.method === 'POST' ? req.body?.status : req.query?.status) || 'ALL');

      // Load State from DB_FILE or fallback
      let stateData: any = {};
      if (req.method === 'POST' && req.body?.clientState && typeof req.body.clientState === 'object') {
        stateData = req.body.clientState;
      } else if (fs.existsSync(DB_FILE)) {
        const raw = await fsp.readFile(DB_FILE, 'utf-8');
        stateData = JSON.parse(raw);
      }

      const trucks: any[] = Array.isArray(stateData?.trucks) ? stateData.trucks : [];
      const chassis: any[] = Array.isArray(stateData?.chassis) ? stateData.chassis : [];
      const tires: any[] = Array.isArray(stateData?.tires) ? stateData.tires : [];
      const workOrders: any[] = Array.isArray(stateData?.workOrders) ? stateData.workOrders : [];

      const formatDateTime = (raw?: string | null): string => {
        if (!raw) return '-';
        const d = new Date(raw);
        if (isNaN(d.getTime())) return String(raw);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };

      const safe = (val: unknown): string | number => {
        if (val === null || val === undefined || val === '') return '-';
        return sanitizeCellForSpreadsheet(val) as string | number;
      };

      // Dynamic informative filename: [NamaKategori]_Export_[YYYYMMDD_HHMM].csv
      const categoryLabel =
        categories.length >= 4
          ? 'Full_Workshop'
          : categories.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join('_dan_');

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const filename = `${categoryLabel}_Export_${timeStamp}.csv`;

      // Set Streaming Response Headers
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Transfer-Encoding', 'chunked');

      // Crucial: Prepend UTF-8 Byte Order Mark (BOM) \uFEFF to guarantee Excel renders without mojibake
      res.write('\uFEFF');

      // 1. Stream ARMADA
      if (categories.includes('armada')) {
        const filteredTrucks = trucks.filter((t) => {
          if (statusFilter === 'ACTIVE' && t.statusServis !== 'READY') return false;
          if (statusFilter === 'MAINTENANCE' && t.statusServis !== 'MAINTENANCE') return false;
          if (statusFilter === 'WARNING' && t.statusPm === 'SAFE') return false;
          return true;
        });

        const rows = filteredTrucks.map((t) => ({
          ID_Armada: safe(t.idUnit),
          Nomor_Plat: safe(t.nopol),
          Nomor_Lambung: safe(t.noLambung),
          Tipe_Armada: safe(t.tipe),
          Merk_Chassis: safe(t.merk),
          Tahun_Pembuatan: safe(t.tahun),
          Odometer_KM: safe(t.kmSaatIni),
          Hour_Meter: safe(t.hmSaatIni),
          Status_Servis: safe(t.statusServis),
          Status_PM: safe(t.statusPm),
          Masa_STNK: safe(t.masaSTNK),
          Masa_Pajak: safe(t.masaPajak),
          Pool_Operasional: safe(t.lokasiPool),
          Tanggal_Update: formatDateTime(t.updatedAt || t.tanggalMasuk)
        }));

        res.write('=== DATA ARMADA / FLEET (TRUK & SUPPORT) ===\r\n');
        res.write(Papa.unparse(rows) + '\r\n\r\n');
      }

      // 2. Stream CHASSIS
      if (categories.includes('chassis')) {
        const filteredChassis = chassis.filter((c) => {
          if (statusFilter === 'ACTIVE' && c.statusServis !== 'READY') return false;
          if (statusFilter === 'MAINTENANCE' && c.statusServis !== 'MAINTENANCE') return false;
          if (statusFilter === 'WARNING' && c.statusFisik === 'BAIK') return false;
          return true;
        });

        const rows = filteredChassis.map((c) => ({
          ID_Chassis: safe(c.idChassis),
          Nomor_Lambung: safe(c.nomorChassis),
          Tipe_Ukuran: safe(c.tipe),
          Karoseri: safe(c.karoseri),
          Tahun_Pembuatan: safe(c.tahun),
          GVW_Kg: safe(c.gvw),
          Nomor_Rangka_VIN: safe(c.vin),
          Status_Fisik: safe(c.statusFisik),
          Status_Servis: safe(c.statusServis),
          Pool_Operasional: safe(c.lokasiPool),
          Tanggal_Update: formatDateTime(c.updatedAt)
        }));

        res.write('=== DATA CHASSIS (13 TITIK INSPEKSI) ===\r\n');
        res.write(Papa.unparse(rows) + '\r\n\r\n');
      }

      // 3. Stream BAN (TIRES)
      if (categories.includes('ban')) {
        const filteredTires = tires.filter((t) => {
          if (statusFilter === 'ACTIVE' && t.statusKelayakan !== 'Aktif Terpasang') return false;
          if (statusFilter === 'MAINTENANCE' && t.statusKelayakan !== 'Proses Vulkanisir') return false;
          if (statusFilter === 'WARNING' && (t.treadDepthMm || 10) > 3) return false;
          return true;
        });

        const rows = filteredTires.map((t) => ({
          ID_Seri_Ban: safe(t.idSeri),
          Merk_Ban: safe(t.merk),
          Ukuran_Ban: safe(t.ukuranBan),
          Tipe_Konstruksi: safe(t.tipe),
          Kode_DOT_WWYY: safe(t.dot),
          Posisi_Roda: safe(t.posisiTerpasang),
          Unit_Terpasang: safe(t.unitTerpasang),
          Status_Kelayakan: safe(t.statusKelayakan),
          Tread_Depth_mm: safe(t.treadDepthMm),
          Total_KM_Berjalan: safe(t.totalKm),
          Estimasi_CPK_IDR: safe(t.costPerKm),
          Lokasi_Gudang_Pool: safe(t.gudang),
          Tanggal_Update: formatDateTime(t.updatedAt)
        }));

        res.write('=== DATA MASTER BAN & POSISI RODA ===\r\n');
        res.write(Papa.unparse(rows) + '\r\n\r\n');
      }

      // 4. Stream LOGS & WORK ORDERS
      if (categories.includes('logs')) {
        const filteredWo = workOrders.filter((wo) => {
          if (statusFilter === 'ACTIVE' && wo.status === 'COMPLETED & RELEASED') return false;
          if (statusFilter === 'MAINTENANCE' && wo.status !== 'IN PROGRESS') return false;
          if (statusFilter === 'COMPLETED' && wo.status !== 'COMPLETED & RELEASED') return false;
          if (startDate && wo.tanggalMasuk && wo.tanggalMasuk < startDate) return false;
          if (endDate && wo.tanggalMasuk && wo.tanggalMasuk > endDate) return false;
          return true;
        });

        const rows = filteredWo.map((wo) => ({
          Nomor_Work_Order: safe(wo.woId),
          ID_Unit_Aset: safe(wo.idUnit),
          Jenis_Aset: safe(wo.tipeAset),
          Kategori_Pekerjaan: safe(wo.kategori),
          Deskripsi_Keluhan: safe(wo.deskripsi),
          Status_Pengerjaan: safe(wo.status),
          Tingkat_Prioritas: safe(wo.prioritas),
          Mekanik_Bertugas: safe(wo.assignedMechanic),
          Status_Kelulusan_QC: safe(wo.qcApproved ? 'LULUS QC' : 'BELUM QC'),
          Downtime_Hari: safe(wo.downtime),
          Biaya_Suku_Cadang_IDR: safe(wo.biayaPart),
          Tanggal_Masuk_Bengkel: formatDateTime(wo.tanggalMasuk),
          Tanggal_Selesai_Rilis: formatDateTime(wo.tanggalKeluar)
        }));

        res.write('=== RIWAYAT LOGS & WORK ORDER BENGKEL ===\r\n');
        res.write(Papa.unparse(rows) + '\r\n\r\n');
      }

      res.end();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghasilkan file CSV';
      if (!res.headersSent) {
        res.status(500).json({ error: msg });
      } else {
        res.end();
      }
    }
  };

  app.get('/api/export/csv', requireAdminOrSupervisor, handleCsvExport);
  app.post('/api/export/csv', requireAdminOrSupervisor, handleCsvExport);

  // v5.0 — Foto Work Order (ringan): file disimpan di .data/photos, state hanya menyimpan URL.
  app.post('/api/photos', requireAuth, async (req: Request, res: Response) => {
    try {
      const { woId, stage, dataBase64, mimeType } = (req.body || {}) as {
        woId?: string;
        stage?: string;
        dataBase64?: string;
        mimeType?: string;
      };
      if (!woId || (stage !== 'BEFORE' && stage !== 'AFTER') || !dataBase64) {
        res.status(400).json({ error: 'woId, stage (BEFORE/AFTER), dan dataBase64 wajib diisi.' });
        return;
      }
      const mime = String(mimeType || 'image/jpeg').toLowerCase();
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const raw = String(dataBase64).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      if (buf.length === 0 || buf.length > 1_500_000) {
        res.status(413).json({ error: 'Ukuran foto melebihi 1.5 MB setelah kompresi.' });
        return;
      }
      const safeWo = String(woId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
      const fileName = `${safeWo}-${stage.toLowerCase()}-${Date.now()}.${ext}`;
      await fsp.writeFile(path.join(PHOTO_DIR, fileName), buf);
      res.json({ success: true, url: `/photos/${fileName}`, sizeBytes: buf.length });
    } catch {
      res.status(500).json({ error: 'Gagal menyimpan foto Work Order.' });
    }
  });

  app.use('/photos', express.static(PHOTO_DIR, { index: false, maxAge: '7d' }));

  // Mount Vite in development or static dist in production
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BMI Enterprise Server] Listening on http://0.0.0.0:${PORT}`);
  });

  // Diagnostik port bentrok: pesan jelas alih-alih stack trace EADDRINUSE yang membingungkan.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[BMI Enterprise Server] Port ${PORT} sudah dipakai proses lain. Hentikan proses itu atau jalankan dengan PORT lain, mis. PORT=4310 npm start`
      );
    } else {
      console.error('[BMI Enterprise Server] Gagal membuka port:', err);
    }
    process.exit(1);
  });

  // Graceful shutdown handler
  const handleShutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

// Only auto-start server if executed directly (allows importing functions in unit tests)
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  startServer();
}
