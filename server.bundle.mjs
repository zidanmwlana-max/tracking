// server.ts
import express from "express";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import net from "net";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Papa from "papaparse";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PORT = Number(process.env.PORT || 3e3);
var IS_PRODUCTION = process.env.NODE_ENV === "production";
function resolveSessionSecret() {
  const rawSecret = (process.env.BMI_SESSION_SECRET || "").trim();
  const isPlaceholder = !rawSecret || rawSecret === "change-this-in-company-production-server" || rawSecret === "bmi-enterprise-workshop-secret-key-2026" || rawSecret === "replace-with-at-least-32-chars-random-secret-key-for-production";
  if (IS_PRODUCTION && (isPlaceholder || rawSecret.length < 32)) {
    throw new Error(
      "[FATAL SECURITY] BMI_SESSION_SECRET wajib disetel di environment produksi (minimal 32 karakter acak)."
    );
  }
  if (isPlaceholder) {
    return crypto.randomBytes(32).toString("hex");
  }
  return rawSecret;
}
var SESSION_SECRET = resolveSessionSecret();
var TOKEN_TTL_MS = 12 * 60 * 60 * 1e3;
var EXTERNAL_FETCH_TIMEOUT_MS = 8e3;
var MAX_ERROR_LOG_BYTES = 5 * 1024 * 1024;
var DATA_DIR = path.resolve(__dirname, ".data");
var DB_FILE = path.join(DATA_DIR, "workshop-db.json");
var USER_DB_FILE = path.join(DATA_DIR, "user-access-db.json");
var ADAPTER_CONFIG_FILE = path.join(DATA_DIR, "adapter-config.json");
var BACKUP_DIR = path.join(DATA_DIR, "backups");
var PHOTO_DIR = path.join(DATA_DIR, "photos");
var ERROR_LOG_FILE = path.join(DATA_DIR, "error-telemetry.log");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(PHOTO_DIR)) {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
}
async function atomicWriteJsonFile(targetPath, data) {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const serialized = JSON.stringify(data, null, 2);
  await fsp.writeFile(tempPath, serialized, "utf-8");
  await fsp.rename(tempPath, targetPath);
}
function sanitizeCellForSpreadsheet(value) {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const str = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}
function validateWorkshopStateSchema(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { valid: false, reason: "Payload state harus berupa objek JSON." };
  }
  const s = state;
  const requiredArrays = ["trucks", "chassis", "workOrders"];
  for (const key of requiredArrays) {
    if (!Array.isArray(s[key])) {
      return {
        valid: false,
        reason: `Field wajib "${key}" harus berupa Array yang valid.`
      };
    }
  }
  const optionalArrays = ["gensets", "tires", "parts", "partRequests", "incidents", "notifications"];
  for (const key of optionalArrays) {
    if (s[key] !== void 0 && !Array.isArray(s[key])) {
      return {
        valid: false,
        reason: `Field "${key}" harus berupa Array jika disertakan.`
      };
    }
  }
  const trucks = s.trucks;
  if (trucks.length > 5e3) {
    return { valid: false, reason: "Jumlah entri trucks melebihi batas maksimum (5000)." };
  }
  for (let i = 0; i < Math.min(trucks.length, 50); i++) {
    const t = trucks[i];
    if (!t || typeof t !== "object" || typeof t.idUnit !== "string" || !t.idUnit.trim()) {
      return {
        valid: false,
        reason: `Entri trucks[${i}] tidak valid: properti string "idUnit" wajib ada.`
      };
    }
  }
  const workOrders = s.workOrders;
  if (workOrders.length > 2e4) {
    return { valid: false, reason: "Jumlah entri workOrders melebihi batas maksimum (20000)." };
  }
  return { valid: true };
}
function isPrivateOrReservedIp(ip) {
  const cleanIp = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (cleanIp === "::1" || cleanIp === "::" || cleanIp === "0.0.0.0") return true;
  if (cleanIp.startsWith("fe80:") || cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) {
    return true;
  }
  const mappedIpv4Match = cleanIp.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const ipv4 = mappedIpv4Match ? mappedIpv4Match[1] : cleanIp;
  const parts = ipv4.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => !Number.isNaN(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}
function validateSafeExternalAdapterUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return { valid: true, normalizedUrl: "" };
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: "Format URL adapter eksternal tidak valid." };
  }
  const allowHttpInDev = !IS_PRODUCTION && process.env.ALLOW_HTTP_ADAPTER === "true";
  if (parsed.protocol !== "https:" && !(allowHttpInDev && parsed.protocol === "http:")) {
    return {
      valid: false,
      reason: "URL adapter eksternal wajib menggunakan protokol HTTPS yang aman."
    };
  }
  const hostname = parsed.hostname.toLowerCase();
  const blockedHostnames = [
    "localhost",
    "metadata.google.internal",
    "metadata",
    "instance-data",
    "0.0.0.0"
  ];
  if (blockedHostnames.includes(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    return {
      valid: false,
      reason: "Hostname internal atau localhost tidak diizinkan untuk mencegah SSRF."
    };
  }
  if (net.isIP(hostname.replace(/^\[|\]$/g, "")) && isPrivateOrReservedIp(hostname)) {
    return {
      valid: false,
      reason: "Alamat IP privat, loopback, atau link-local metadata tidak diizinkan (SSRF Protection)."
    };
  }
  const allowedHostsEnv = (process.env.BMI_ALLOWED_ADAPTER_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allowedHostsEnv.length > 0 && !allowedHostsEnv.includes(hostname)) {
    return {
      valid: false,
      reason: `Hostname "${hostname}" tidak termasuk dalam daftar BMI_ALLOWED_ADAPTER_HOSTS.`
    };
  }
  return { valid: true, normalizedUrl: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "") };
}
var loginRateLimitMap = /* @__PURE__ */ new Map();
var errorLogRateLimitMap = /* @__PURE__ */ new Map();
var RATE_LIMIT_WINDOW_MS = 15 * 60 * 1e3;
var MAX_LOGIN_ATTEMPTS = 5;
var MAX_RATE_LIMIT_MAP_SIZE = 5e3;
function pruneRateLimitMap(map) {
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
function getSafeClientIp(req) {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return String(req.ip || req.socket.remoteAddress || "local");
}
function checkLoginRateLimit(key) {
  const now = Date.now();
  const record = loginRateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    return { allowed: true };
  }
  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((record.resetAt - now) / 1e3)
    };
  }
  return { allowed: true };
}
function recordFailedLoginAttempt(key) {
  pruneRateLimitMap(loginRateLimitMap);
  const now = Date.now();
  const record = loginRateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    loginRateLimitMap.set(key, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    record.attempts += 1;
  }
}
function clearLoginRateLimit(key) {
  loginRateLimitMap.delete(key);
}
function hashPasswordScrypt(plainPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}
function verifyPasswordScrypt(plainPassword, storedHash) {
  try {
    if (!storedHash || !storedHash.startsWith("scrypt$")) return false;
    const [, salt, keyHex] = storedHash.split("$");
    if (!salt || !keyHex) return false;
    const keyBuf = Buffer.from(keyHex, "hex");
    const derivedBuf = crypto.scryptSync(plainPassword, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}
function mapRoleToPortal(roleRaw) {
  const clean = String(roleRaw || "").trim().toLowerCase();
  if (clean.includes("teknisi") || clean.includes("mekanik")) return "MEKANIK";
  return "SUPERVISOR";
}
function getDefaultAllowedFeatures(roleRaw) {
  const clean = String(roleRaw || "").trim().toLowerCase();
  if (clean.includes("teknisi") || clean.includes("mekanik")) {
    return ["tires", "warehouse-tires", "chassis-checklist", "workorders"];
  }
  if (clean.includes("advisor")) {
    return [
      "dashboard",
      "workorders",
      "workorders.manage",
      "incidents",
      "inventory",
      "fleet",
      "tires",
      "warehouse-tires",
      "chassis-checklist"
    ];
  }
  return [
    "dashboard",
    "workorders",
    "workorders.manage",
    "incidents",
    "inventory",
    "fleet",
    "user-access",
    "tires",
    "warehouse-tires",
    "chassis-checklist",
    "architecture"
  ];
}
function createInitialServerUsers() {
  const defaultPass = process.env.BMI_DEFAULT_INITIAL_PASSWORD || "bmi2026";
  const legacyPass = "123456";
  return [
    {
      id: "Admin001",
      nama: "Administrator Bengkel BMI",
      roleRaw: "Admin",
      role: "SUPERVISOR",
      passwordHash: hashPasswordScrypt(defaultPass),
      status: "Aktif",
      email: "admin001@bmi.co.id",
      posisi: "Admin \xB7 Manajemen & Kontrol",
      lokasi: "BMI Surabaya",
      departemen: "Portal Service Advisor / Supervisor",
      kodeAkses: "Admin001",
      allowedFeatures: getDefaultAllowedFeatures("Admin")
    },
    {
      id: "Supervisor01",
      nama: "Supervisor Armada BMI",
      roleRaw: "Supervisor",
      role: "SUPERVISOR",
      passwordHash: hashPasswordScrypt(legacyPass),
      status: "Aktif",
      email: "supervisor01@bmi.co.id",
      posisi: "Supervisor \xB7 Manajemen & Kontrol",
      lokasi: "BMI Lamongan",
      departemen: "Portal Service Advisor / Supervisor",
      kodeAkses: "Supervisor01",
      allowedFeatures: getDefaultAllowedFeatures("Supervisor")
    },
    {
      id: "Teknisi01",
      nama: "Teknisi Bengkel BMI",
      roleRaw: "Teknisi",
      role: "MEKANIK",
      passwordHash: hashPasswordScrypt(legacyPass),
      status: "Aktif",
      email: "teknisi01@bmi.co.id",
      posisi: "Teknisi \xB7 Eksekusi Bengkel",
      lokasi: "BMI Surabaya",
      departemen: "Portal Lapangan (Mekanik)",
      kodeAkses: "Teknisi01",
      allowedFeatures: getDefaultAllowedFeatures("Teknisi")
    }
  ];
}
function loadServerUsers() {
  try {
    if (fs.existsSync(USER_DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(USER_DB_FILE, "utf-8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
  }
  const initial = createInitialServerUsers();
  try {
    fs.writeFileSync(USER_DB_FILE, JSON.stringify(initial, null, 2), "utf-8");
  } catch {
  }
  return initial;
}
function stripSensitiveUserFields(u) {
  const { passwordHash: _removed, ...safeUser } = u;
  return {
    ...safeUser,
    credentialStatus: "ENCRYPTED_SCRYPT"
  };
}
var revokedTokenJtis = /* @__PURE__ */ new Set();
function signSessionToken(payload) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_MS;
  const jti = crypto.randomBytes(12).toString("hex");
  const data = JSON.stringify({ ...payload, jti, issuedAt, expiresAt });
  const base64Data = Buffer.from(data).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(base64Data).digest("base64url");
  return `${base64Data}.${signature}`;
}
function verifySignedToken(token) {
  try {
    const [base64Data, signature] = String(token || "").split(".");
    if (!base64Data || !signature) return { valid: false };
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(base64Data).digest("base64url");
    const sigBuf = Buffer.from(signature, "utf-8");
    const expectedBuf = Buffer.from(expectedSig, "utf-8");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false };
    }
    const payload = JSON.parse(
      Buffer.from(base64Data, "base64url").toString("utf-8")
    );
    if (!payload.expiresAt || Date.now() > payload.expiresAt) return { valid: false };
    if (payload.jti && revokedTokenJtis.has(payload.jti)) return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}
function extractTokenFromRequest(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const customHeader = String(req.headers["x-session-token"] || "").trim();
  if (customHeader) return customHeader;
  return null;
}
function requireAuth(req, res, next) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({
      error: "Akses ditolak. Token sesi autentikasi wajib disertakan (401 Unauthorized)."
    });
    return;
  }
  const verified = verifySignedToken(token);
  if (!verified.valid || !verified.payload) {
    res.status(401).json({
      error: "Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali."
    });
    return;
  }
  req.authUser = verified.payload;
  next();
}
function requireSupervisor(req, res, next) {
  requireAuth(req, res, () => {
    const authUser = req.authUser;
    if (!authUser || authUser.role !== "SUPERVISOR") {
      res.status(403).json({
        error: "Akses ditolak. Operasi ini memerlukan otorisasi Supervisor / Admin (403 Forbidden)."
      });
      return;
    }
    next();
  });
}
function requireAdminOrSupervisor(req, res, next) {
  requireAuth(req, res, () => {
    const authUser = req.authUser;
    if (!authUser || authUser.role !== "SUPERVISOR" && authUser.role !== "ADMIN") {
      res.status(403).json({
        error: "Akses ditolak. Operasi ini memerlukan otorisasi Admin atau Supervisor (403 Forbidden)."
      });
      return;
    }
    next();
  });
}
async function startServer() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "5mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
    if (IS_PRODUCTION) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.googleapis.com https://docs.google.com https://*.firebaseio.com https://*.firebaseapp.com; frame-ancestors 'none';"
    );
    next();
  });
  app.use((req, res, next) => {
    const acceptEncoding = String(req.headers["accept-encoding"] || "");
    if (!acceptEncoding.includes("gzip") || !req.path.startsWith("/api/")) {
      next();
      return;
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      try {
        const jsonString = JSON.stringify(body);
        if (jsonString && jsonString.length > 1024) {
          const compressed = zlib.gzipSync(Buffer.from(jsonString, "utf-8"));
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Content-Encoding", "gzip");
          res.setHeader("Vary", "Accept-Encoding");
          res.setHeader("Content-Length", String(compressed.length));
          return res.send(compressed);
        }
      } catch {
      }
      return originalJson(body);
    };
    next();
  });
  function loadAdapterConfig() {
    try {
      if (fs.existsSync(ADAPTER_CONFIG_FILE)) {
        const raw = JSON.parse(fs.readFileSync(ADAPTER_CONFIG_FILE, "utf-8"));
        const candidateUrl = String(
          raw.externalApiUrl || process.env.BMI_EXTERNAL_API_URL || ""
        ).trim();
        const urlCheck = validateSafeExternalAdapterUrl(candidateUrl);
        return {
          enabled: Boolean(raw.enabled) && urlCheck.valid && Boolean(urlCheck.normalizedUrl),
          externalApiUrl: urlCheck.valid ? urlCheck.normalizedUrl || "" : "",
          externalApiKey: String(
            raw.externalApiKey || process.env.BMI_EXTERNAL_API_KEY || ""
          ).trim(),
          stateEndpoint: String(raw.stateEndpoint || "/workshop/state").trim(),
          syncEndpoint: String(raw.syncEndpoint || "/workshop/sync").trim()
        };
      }
    } catch {
    }
    const envUrl = String(process.env.BMI_EXTERNAL_API_URL || "").trim();
    const envCheck = validateSafeExternalAdapterUrl(envUrl);
    return {
      enabled: Boolean(envUrl) && envCheck.valid,
      externalApiUrl: envCheck.valid ? envCheck.normalizedUrl || "" : "",
      externalApiKey: String(process.env.BMI_EXTERNAL_API_KEY || "").trim(),
      stateEndpoint: "/workshop/state",
      syncEndpoint: "/workshop/sync"
    };
  }
  app.get("/api/health", (_req, res) => {
    const adapterCfg = loadAdapterConfig();
    const storageMode = adapterCfg.enabled && adapterCfg.externalApiUrl ? "EXTERNAL_PAID_API" : process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "GOOGLE_SERVICE_ACCOUNT" : "LOCAL_COMPANY_SERVER";
    res.json({
      status: "ok",
      service: "BMI Enterprise Workshop API Server",
      storageMode,
      hasLocalDatabase: fs.existsSync(DB_FILE),
      adapterConfig: {
        enabled: adapterCfg.enabled,
        hasExternalUrl: Boolean(adapterCfg.externalApiUrl),
        hasApiKey: Boolean(adapterCfg.externalApiKey),
        stateEndpoint: adapterCfg.stateEndpoint,
        syncEndpoint: adapterCfg.syncEndpoint
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/config/adapter", requireSupervisor, (_req, res) => {
    const cfg = loadAdapterConfig();
    res.json({
      enabled: cfg.enabled,
      externalApiUrl: cfg.externalApiUrl,
      externalApiKey: cfg.externalApiKey ? `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${cfg.externalApiKey.slice(-4)}` : "",
      hasApiKey: Boolean(cfg.externalApiKey),
      stateEndpoint: cfg.stateEndpoint,
      syncEndpoint: cfg.syncEndpoint
    });
  });
  app.post("/api/config/adapter", requireSupervisor, async (req, res) => {
    try {
      const current = loadAdapterConfig();
      const rawUrl = String(req.body?.externalApiUrl ?? current.externalApiUrl).trim();
      const urlCheck = validateSafeExternalAdapterUrl(rawUrl);
      if (!urlCheck.valid) {
        res.status(400).json({
          success: false,
          error: urlCheck.reason || "URL adapter eksternal ditolak oleh kebijakan keamanan SSRF."
        });
        return;
      }
      const incomingKey = String(req.body?.externalApiKey ?? "").trim();
      const resolvedKey = !incomingKey || incomingKey.startsWith("\u2022\u2022\u2022\u2022") ? current.externalApiKey : incomingKey;
      const safeStateEndpoint = String(req.body?.stateEndpoint || "/workshop/state").trim();
      const safeSyncEndpoint = String(req.body?.syncEndpoint || "/workshop/sync").trim();
      if (!safeStateEndpoint.startsWith("/") || !safeSyncEndpoint.startsWith("/")) {
        res.status(400).json({
          success: false,
          error: 'Path endpoint state/sync harus diawali dengan karakter "/".'
        });
        return;
      }
      const nextCfg = {
        enabled: Boolean(req.body?.enabled) && Boolean(urlCheck.normalizedUrl),
        externalApiUrl: urlCheck.normalizedUrl || "",
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan konfigurasi koneksi.";
      res.status(500).json({ success: false, error: msg });
    }
  });
  async function syncUsersFromGoogleSheetServerSide(spreadsheetId) {
    const existingUsers = loadServerUsers();
    const sheetId = spreadsheetId || process.env.BMI_SPREADSHEET_ID || "1LVPzTUXrT2HLNbQDNRPh5kzW0dFyBKyLnMuVhscRjT4";
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
        sheetId
      )}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("User Access")}`;
      const res = await fetch(gvizUrl, {
        signal: AbortSignal.timeout(4e3)
      });
      if (!res.ok) {
        return { synced: false, count: existingUsers.length, users: existingUsers };
      }
      const text = await res.text();
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) {
        return { synced: false, count: existingUsers.length, users: existingUsers };
      }
      const jsonPayload = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      const tableRows = jsonPayload?.table?.rows || [];
      const nextUsers = [];
      tableRows.forEach((r, index) => {
        const cells = (r.c || []).map(
          (cell) => cell && cell.v !== null && cell.v !== void 0 ? String(cell.v).trim() : ""
        );
        const colAId = cells[0] || "";
        const colBName = cells[1] || "";
        const colCRole = cells[2] || "Teknisi";
        const colDPass = cells[3] || "";
        const colEStatus = cells[4] || "Aktif";
        const colFCustom = cells[5] || "";
        if (!colAId || colAId.toLowerCase() === "id" || colAId.toLowerCase().includes("id / email") || colAId.toLowerCase().includes("username") || colBName.toLowerCase() === "nama") {
          return;
        }
        const role = mapRoleToPortal(colCRole);
        const isAktif = colEStatus.toLowerCase() === "aktif";
        const email = colAId.includes("@") ? colAId.toLowerCase() : `${colAId.toLowerCase().replace(/[^a-z0-9]/g, "")}@bmi.co.id`;
        let allowedFeatures = getDefaultAllowedFeatures(colCRole);
        if (colFCustom) {
          const customList = colFCustom.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
          if (customList.length > 0) allowedFeatures = customList;
        }
        const prevUser = existingUsers.find(
          (u) => u.id.toLowerCase() === colAId.toLowerCase()
        );
        const rawPassToHash = colDPass || "123456";
        const passwordHash = prevUser && verifyPasswordScrypt(rawPassToHash, prevUser.passwordHash) ? prevUser.passwordHash : hashPasswordScrypt(rawPassToHash);
        nextUsers.push({
          id: colAId,
          nama: colBName || colAId,
          roleRaw: colCRole,
          role,
          passwordHash,
          status: isAktif ? "Aktif" : "Nonaktif",
          email,
          posisi: role === "MEKANIK" ? `${colCRole} \xB7 Eksekusi Bengkel` : `${colCRole} \xB7 Manajemen & Kontrol`,
          lokasi: index % 3 === 1 ? "BMI Lamongan" : index % 3 === 2 ? "BMI Dampit" : "BMI Surabaya",
          departemen: role === "MEKANIK" ? "Portal Lapangan (Mekanik)" : "Portal Service Advisor / Supervisor",
          kodeAkses: colAId,
          allowedFeatures
        });
      });
      if (nextUsers.length > 0) {
        await atomicWriteJsonFile(USER_DB_FILE, nextUsers);
        return { synced: true, count: nextUsers.length, users: nextUsers };
      }
    } catch {
    }
    return { synced: false, count: existingUsers.length, users: existingUsers };
  }
  app.get("/api/users", async (_req, res) => {
    const syncRes = await syncUsersFromGoogleSheetServerSide();
    res.json({
      success: true,
      source: syncRes.synced ? "LIVE_SERVER_GVIZ" : "LOCAL_SERVER_USER_DB",
      userCount: syncRes.users.length,
      users: syncRes.users.map(stripSensitiveUserFields)
    });
  });
  app.post("/api/users/create", requireSupervisor, async (req, res) => {
    const { id, nama, roleRaw, password, status, lokasi } = req.body || {};
    const cleanId = String(id || "").trim();
    const cleanNama = String(nama || "").trim();
    const cleanPass = String(password || "").trim();
    const cleanRoleRaw = String(roleRaw || "Teknisi").trim();
    if (!cleanId || !cleanNama || cleanPass.length < 6) {
      res.status(400).json({
        success: false,
        error: "ID, Nama Lengkap, dan Kata Sandi (minimal 6 karakter) wajib diisi."
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
    const email = cleanId.includes("@") ? cleanId.toLowerCase() : `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, "")}@bmi.co.id`;
    const newUser = {
      id: cleanId,
      nama: cleanNama,
      roleRaw: cleanRoleRaw,
      role,
      passwordHash: hashPasswordScrypt(cleanPass),
      status: status === "Nonaktif" ? "Nonaktif" : "Aktif",
      email,
      posisi: role === "MEKANIK" ? `${cleanRoleRaw} \xB7 Eksekusi Bengkel` : `${cleanRoleRaw} \xB7 Manajemen & Kontrol`,
      lokasi: String(lokasi || "BMI Surabaya"),
      departemen: role === "MEKANIK" ? "Portal Lapangan (Mekanik)" : "Portal Service Advisor / Supervisor",
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
  app.post("/api/users/update", requireSupervisor, async (req, res) => {
    const { id, roleRaw, status, newPassword } = req.body || {};
    const cleanId = String(id || "").trim().toLowerCase();
    if (!cleanId) {
      res.status(400).json({ success: false, error: "ID pengguna wajib diisi." });
      return;
    }
    const users = loadServerUsers();
    const idx = users.findIndex((u) => u.id.toLowerCase() === cleanId);
    if (idx === -1) {
      res.status(404).json({ success: false, error: "Akun pengguna tidak ditemukan." });
      return;
    }
    const target = { ...users[idx] };
    if (typeof roleRaw === "string" && roleRaw.trim()) {
      target.roleRaw = roleRaw.trim();
      target.role = mapRoleToPortal(target.roleRaw);
      target.allowedFeatures = getDefaultAllowedFeatures(target.roleRaw);
      target.departemen = target.role === "MEKANIK" ? "Portal Lapangan (Mekanik)" : "Portal Service Advisor / Supervisor";
    }
    if (status === "Aktif" || status === "Nonaktif") {
      target.status = status;
    }
    if (typeof newPassword === "string" && newPassword.trim()) {
      if (newPassword.trim().length < 6) {
        res.status(400).json({
          success: false,
          error: "Kata sandi baru minimal harus 6 karakter."
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
  app.post("/api/auth/login", async (req, res) => {
    const clientIp = getSafeClientIp(req);
    const identifier = String(req.body?.identifier || "").trim().toLowerCase();
    const passwordInput = String(req.body?.password || "").trim();
    const selectedPool = req.body?.selectedPool ? String(req.body.selectedPool) : void 0;
    const rateKey = `${clientIp}:${identifier || "anonymous"}`;
    const rateCheck = checkLoginRateLimit(rateKey);
    if (!rateCheck.allowed) {
      res.status(429).json({
        success: false,
        error: `Terlalu banyak percobaan login gagal. Silakan coba lagi dalam ${rateCheck.retryAfterSec} detik.`
      });
      return;
    }
    if (!identifier || !passwordInput) {
      recordFailedLoginAttempt(rateKey);
      res.status(401).json({
        success: false,
        error: "ID/Email dan Kata Sandi wajib diverifikasi oleh server."
      });
      return;
    }
    const syncRes = await syncUsersFromGoogleSheetServerSide();
    const users = syncRes.users;
    const matchedUser = users.find(
      (u) => u.id.toLowerCase() === identifier || u.email.toLowerCase() === identifier || u.kodeAkses.toLowerCase() === identifier || u.nama.toLowerCase() === identifier
    );
    if (!matchedUser || !verifyPasswordScrypt(passwordInput, matchedUser.passwordHash)) {
      recordFailedLoginAttempt(rateKey);
      res.status(401).json({
        success: false,
        error: "ID/Email atau Kata Sandi tidak valid."
      });
      return;
    }
    if (String(matchedUser.status || "").toLowerCase() !== "aktif") {
      recordFailedLoginAttempt(rateKey);
      res.status(403).json({
        success: false,
        error: "Akun ini telah dinonaktifkan. Hubungi Supervisor atau Admin."
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
      lastVerifiedAt: (/* @__PURE__ */ new Date()).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }),
      syncSource: syncRes.synced ? "LIVE_GVIZ" : "LOCAL_CACHE"
    };
    res.json({
      success: true,
      user: safeUser,
      sessionToken: token
    });
  });
  app.post("/api/auth/verify", (req, res) => {
    const token = extractTokenFromRequest(req) || String(req.body?.sessionToken || "").trim();
    if (!token) {
      res.status(401).json({ valid: false });
      return;
    }
    const result = verifySignedToken(token);
    res.json(result);
  });
  app.post("/api/auth/logout", (req, res) => {
    const token = extractTokenFromRequest(req) || String(req.body?.sessionToken || "").trim();
    if (token) {
      const verified = verifySignedToken(token);
      if (verified.valid && verified.payload?.jti) {
        if (revokedTokenJtis.size > 1e4) {
          revokedTokenJtis.clear();
        }
        revokedTokenJtis.add(verified.payload.jti);
      }
    }
    res.json({ success: true });
  });
  app.get("/api/workshop/state", requireAuth, async (_req, res) => {
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
                  Authorization: `Bearer ${adapterCfg.externalApiKey || ""}`
                },
                signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS)
              }
            );
            if (extRes.ok) {
              const extData = await extRes.json();
              const resolvedState = extData.state || extData;
              res.json({
                source: "EXTERNAL_API",
                stateVersion: Number(resolvedState?.stateVersion || 1),
                state: resolvedState
              });
              return;
            }
          } catch {
          }
        }
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = await fsp.readFile(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        const stateVersion = Number(parsed?.stateVersion || 1);
        res.json({
          source: "LOCAL_SERVER_DB",
          stateVersion,
          state: { ...parsed, stateVersion }
        });
        return;
      }
      res.json({ source: "EMPTY", stateVersion: 0, state: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/workshop/sync", requireAuth, async (req, res) => {
    try {
      const { state, baseVersion, forceOverwrite } = req.body || {};
      const schemaCheck = validateWorkshopStateSchema(state);
      if (!schemaCheck.valid) {
        res.status(400).json({
          error: schemaCheck.reason || "Payload state tidak valid."
        });
        return;
      }
      let currentServerVersion = 0;
      let currentServerState = null;
      if (fs.existsSync(DB_FILE)) {
        try {
          const existingRaw = await fsp.readFile(DB_FILE, "utf-8");
          currentServerState = JSON.parse(existingRaw);
          currentServerVersion = Number(currentServerState?.stateVersion || 1);
        } catch {
          currentServerVersion = 0;
        }
      }
      if (!forceOverwrite && typeof baseVersion === "number" && currentServerVersion > 0 && baseVersion < currentServerVersion) {
        const conflictFile = path.join(
          BACKUP_DIR,
          `workshop-conflict-${Date.now()}.json`
        );
        await atomicWriteJsonFile(conflictFile, {
          conflictDetectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          clientBaseVersion: baseVersion,
          serverVersion: currentServerVersion,
          rejectedClientState: state
        });
        res.status(409).json({
          error: `Terdeteksi pembaruan data dari pengguna lain (Versi Server: v${currentServerVersion}, Versi Klien: v${baseVersion}). Data telah disinkronkan ulang agar tidak menimpa perubahan rekan Anda.`,
          code: "STATE_VERSION_CONFLICT",
          serverVersion: currentServerVersion,
          state: currentServerState
        });
        return;
      }
      const nextVersion = currentServerVersion + 1;
      const savedAt = (/* @__PURE__ */ new Date()).toISOString();
      const versionedState = {
        ...state,
        stateVersion: nextVersion,
        serverSavedAt: savedAt
      };
      await atomicWriteJsonFile(DB_FILE, versionedState);
      const dateTag = savedAt.slice(0, 10);
      const backupFile = path.join(BACKUP_DIR, `workshop-backup-${dateTag}.json`);
      if (!fs.existsSync(backupFile)) {
        await atomicWriteJsonFile(backupFile, versionedState);
      }
      const adapterCfg = loadAdapterConfig();
      let forwardedToExternal = false;
      if (adapterCfg.enabled && adapterCfg.externalApiUrl) {
        const urlCheck = validateSafeExternalAdapterUrl(adapterCfg.externalApiUrl);
        if (urlCheck.valid && urlCheck.normalizedUrl) {
          try {
            const extRes = await fetch(
              `${urlCheck.normalizedUrl}${adapterCfg.syncEndpoint}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${adapterCfg.externalApiKey || ""}`
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
        updatedAt: savedAt.slice(0, 19).replace("T", " "),
        backupCreated: path.basename(backupFile),
        forwardedToExternal
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/sheets/sanitize-row", requireAuth, (req, res) => {
    const rawValues = Array.isArray(req.body?.values) ? req.body.values : [];
    const sanitized = rawValues.map(sanitizeCellForSpreadsheet);
    res.json({ sanitized });
  });
  app.post("/api/logs/client-error", async (req, res) => {
    try {
      const rawBodySize = Buffer.byteLength(JSON.stringify(req.body || {}), "utf-8");
      if (rawBodySize > 16 * 1024) {
        res.status(413).json({
          logged: false,
          error: "Ukuran payload log melebihi batas maksimum 16KB (413 Payload Too Large)."
        });
        return;
      }
      const clientIp = getSafeClientIp(req);
      const now = Date.now();
      pruneRateLimitMap(errorLogRateLimitMap);
      const rec = errorLogRateLimitMap.get(clientIp);
      if (rec && now < rec.resetAt && rec.attempts >= 20) {
        res.status(429).json({ logged: false, error: "Rate limit exceeded" });
        return;
      }
      if (!rec || now >= rec.resetAt) {
        errorLogRateLimitMap.set(clientIp, { attempts: 1, resetAt: now + 60 * 1e3 });
      } else {
        rec.attempts += 1;
      }
      const entry = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        module: String(req.body?.module || "unknown").slice(0, 120),
        message: String(req.body?.message || "Unknown client error").slice(0, 1e3),
        stack: String(req.body?.stack || "").slice(0, 4e3),
        userAgent: String(req.headers["user-agent"] || "").slice(0, 300)
      };
      if (fs.existsSync(ERROR_LOG_FILE)) {
        const stat = await fsp.stat(ERROR_LOG_FILE);
        if (stat.size > MAX_ERROR_LOG_BYTES) {
          await fsp.rename(ERROR_LOG_FILE, `${ERROR_LOG_FILE}.1`);
        }
      }
      await fsp.appendFile(ERROR_LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
      res.json({ logged: true });
    } catch {
      res.status(200).json({ logged: false });
    }
  });
  const handleCsvExport = async (req, res) => {
    try {
      const rawCats = req.method === "POST" ? req.body?.categories : req.query?.categories;
      const categories = Array.isArray(rawCats) ? rawCats.map((c) => String(c).trim().toLowerCase()) : typeof rawCats === "string" ? rawCats.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean) : [];
      if (categories.length === 0) {
        res.status(400).json({
          error: "Pilih minimal satu kategori data untuk diexport."
        });
        return;
      }
      const startDate = String((req.method === "POST" ? req.body?.startDate : req.query?.startDate) || "");
      const endDate = String((req.method === "POST" ? req.body?.endDate : req.query?.endDate) || "");
      const statusFilter = String((req.method === "POST" ? req.body?.status : req.query?.status) || "ALL");
      let stateData = {};
      if (req.method === "POST" && req.body?.clientState && typeof req.body.clientState === "object") {
        stateData = req.body.clientState;
      } else if (fs.existsSync(DB_FILE)) {
        const raw = await fsp.readFile(DB_FILE, "utf-8");
        stateData = JSON.parse(raw);
      }
      const trucks = Array.isArray(stateData?.trucks) ? stateData.trucks : [];
      const chassis = Array.isArray(stateData?.chassis) ? stateData.chassis : [];
      const tires = Array.isArray(stateData?.tires) ? stateData.tires : [];
      const workOrders = Array.isArray(stateData?.workOrders) ? stateData.workOrders : [];
      const formatDateTime = (raw) => {
        if (!raw) return "-";
        const d = new Date(raw);
        if (isNaN(d.getTime())) return String(raw);
        const pad2 = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
      };
      const safe = (val) => {
        if (val === null || val === void 0 || val === "") return "-";
        return sanitizeCellForSpreadsheet(val);
      };
      const categoryLabel = categories.length >= 4 ? "Full_Workshop" : categories.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join("_dan_");
      const now = /* @__PURE__ */ new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const timeStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const filename = `${categoryLabel}_Export_${timeStamp}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Transfer-Encoding", "chunked");
      res.write("\uFEFF");
      if (categories.includes("armada")) {
        const filteredTrucks = trucks.filter((t) => {
          if (statusFilter === "ACTIVE" && t.statusServis !== "READY") return false;
          if (statusFilter === "MAINTENANCE" && t.statusServis !== "MAINTENANCE") return false;
          if (statusFilter === "WARNING" && t.statusPm === "SAFE") return false;
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
        res.write("=== DATA ARMADA / FLEET (TRUK & SUPPORT) ===\r\n");
        res.write(Papa.unparse(rows) + "\r\n\r\n");
      }
      if (categories.includes("chassis")) {
        const filteredChassis = chassis.filter((c) => {
          if (statusFilter === "ACTIVE" && c.statusServis !== "READY") return false;
          if (statusFilter === "MAINTENANCE" && c.statusServis !== "MAINTENANCE") return false;
          if (statusFilter === "WARNING" && c.statusFisik === "BAIK") return false;
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
        res.write("=== DATA CHASSIS (13 TITIK INSPEKSI) ===\r\n");
        res.write(Papa.unparse(rows) + "\r\n\r\n");
      }
      if (categories.includes("ban")) {
        const filteredTires = tires.filter((t) => {
          if (statusFilter === "ACTIVE" && t.statusKelayakan !== "Aktif Terpasang") return false;
          if (statusFilter === "MAINTENANCE" && t.statusKelayakan !== "Proses Vulkanisir") return false;
          if (statusFilter === "WARNING" && (t.treadDepthMm || 10) > 3) return false;
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
        res.write("=== DATA MASTER BAN & POSISI RODA ===\r\n");
        res.write(Papa.unparse(rows) + "\r\n\r\n");
      }
      if (categories.includes("logs")) {
        const filteredWo = workOrders.filter((wo) => {
          if (statusFilter === "ACTIVE" && wo.status === "COMPLETED & RELEASED") return false;
          if (statusFilter === "MAINTENANCE" && wo.status !== "IN PROGRESS") return false;
          if (statusFilter === "COMPLETED" && wo.status !== "COMPLETED & RELEASED") return false;
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
          Status_Kelulusan_QC: safe(wo.qcApproved ? "LULUS QC" : "BELUM QC"),
          Downtime_Hari: safe(wo.downtime),
          Biaya_Suku_Cadang_IDR: safe(wo.biayaPart),
          Tanggal_Masuk_Bengkel: formatDateTime(wo.tanggalMasuk),
          Tanggal_Selesai_Rilis: formatDateTime(wo.tanggalKeluar)
        }));
        res.write("=== RIWAYAT LOGS & WORK ORDER BENGKEL ===\r\n");
        res.write(Papa.unparse(rows) + "\r\n\r\n");
      }
      res.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menghasilkan file CSV";
      if (!res.headersSent) {
        res.status(500).json({ error: msg });
      } else {
        res.end();
      }
    }
  };
  app.get("/api/export/csv", requireAdminOrSupervisor, handleCsvExport);
  app.post("/api/export/csv", requireAdminOrSupervisor, handleCsvExport);
  app.post("/api/photos", requireAuth, async (req, res) => {
    try {
      const { woId, stage, dataBase64, mimeType } = req.body || {};
      if (!woId || stage !== "BEFORE" && stage !== "AFTER" || !dataBase64) {
        res.status(400).json({ error: "woId, stage (BEFORE/AFTER), dan dataBase64 wajib diisi." });
        return;
      }
      const mime = String(mimeType || "image/jpeg").toLowerCase();
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      const raw = String(dataBase64).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
      const buf = Buffer.from(raw, "base64");
      if (buf.length === 0 || buf.length > 15e5) {
        res.status(413).json({ error: "Ukuran foto melebihi 1.5 MB setelah kompresi." });
        return;
      }
      const safeWo = String(woId).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
      const fileName = `${safeWo}-${stage.toLowerCase()}-${Date.now()}.${ext}`;
      await fsp.writeFile(path.join(PHOTO_DIR, fileName), buf);
      res.json({ success: true, url: `/photos/${fileName}`, sizeBytes: buf.length });
    } catch {
      res.status(500).json({ error: "Gagal menyimpan foto Work Order." });
    }
  });
  app.use("/photos", express.static(PHOTO_DIR, { index: false, maxAge: "7d" }));
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BMI Enterprise Server] Listening on http://0.0.0.0:${PORT}`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[BMI Enterprise Server] Port ${PORT} sudah dipakai proses lain. Hentikan proses itu atau jalankan dengan PORT lain, mis. PORT=4310 npm start`
      );
    } else {
      console.error("[BMI Enterprise Server] Gagal membuka port:", err);
    }
    process.exit(1);
  });
  const handleShutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGTERM", handleShutdown);
  process.on("SIGINT", handleShutdown);
}
var isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  startServer();
}
export {
  atomicWriteJsonFile,
  hashPasswordScrypt,
  sanitizeCellForSpreadsheet,
  signSessionToken,
  validateSafeExternalAdapterUrl,
  validateWorkshopStateSchema,
  verifyPasswordScrypt,
  verifySignedToken
};
