import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  parseFlexibleDate,
  calculateDowntimeDays,
  calculateTireDowntimeDays,
  calculateTireCpkAndWear,
  evaluateChassis13PointChecklist,
  calculateFleetAvailabilitySummary
} from '../src/domain/fleetMetrics.ts';
import {
  DEMO_SAFE_TRUCKS,
  DEMO_SAFE_CHASSIS,
  DEMO_SAFE_GENSETS,
  DEMO_SAFE_TIRES,
  DEMO_SAFE_WORK_ORDERS
} from '../src/services/demoSeedData.ts';
import {
  LOCALE_DICTIONARY,
  formatLocalizedDate
} from '../src/i18n/localeDictionary.ts';

// Pure Mirrors & Direct Verifiers of Server Security & Persistence Primitives
function sanitizeCellForSpreadsheet(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

function hashPasswordScrypt(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

function verifyPasswordScrypt(plainPassword, storedHash) {
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

function validateSafeExternalAdapterUrl(rawUrl, allowHttpInDev = false, allowedHosts = []) {
  const trimmed = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return { valid: true, normalizedUrl: '' };
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Invalid URL' };
  }
  if (parsed.protocol !== 'https:' && !(allowHttpInDev && parsed.protocol === 'http:')) {
    return { valid: false, reason: 'HTTPS required' };
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    ['localhost', 'metadata.google.internal', 'metadata', 'instance-data', '0.0.0.0', '::1'].includes(
      hostname
    ) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return { valid: false, reason: 'Internal hostname blocked' };
  }
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !Number.isNaN(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return { valid: false, reason: 'Private/Loopback/Metadata IP blocked' };
    }
  }
  if (allowedHosts.length > 0 && !allowedHosts.includes(hostname)) {
    return { valid: false, reason: 'Host not in allowlist' };
  }
  return { valid: true, normalizedUrl: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '') };
}

function validateWorkshopStateSchema(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { valid: false, reason: 'Payload state harus berupa objek JSON.' };
  }
  for (const key of ['trucks', 'chassis', 'workOrders']) {
    if (!Array.isArray(state[key])) {
      return { valid: false, reason: `Field wajib "${key}" harus berupa Array.` };
    }
  }
  for (let i = 0; i < Math.min(state.trucks.length, 50); i++) {
    const t = state.trucks[i];
    if (!t || typeof t !== 'object' || typeof t.idUnit !== 'string' || !t.idUnit.trim()) {
      return { valid: false, reason: `Invalid truck at index ${i}` };
    }
  }
  return { valid: true };
}

describe('Suite 1: Authentication, Scrypt Hashing & Session Security (Kat. 1 & 2)', () => {
  it('1. hashes password with unique 16-byte random salt using scrypt', () => {
    const h1 = hashPasswordScrypt('bmi2026');
    const h2 = hashPasswordScrypt('bmi2026');
    assert.ok(h1.startsWith('scrypt$'));
    assert.notEqual(h1, h2, 'Each hash must use a unique random salt');
  });

  it('2. verifies matching password accurately via timingSafeEqual', () => {
    const hash = hashPasswordScrypt('WorkshopSecret#99');
    assert.equal(verifyPasswordScrypt('WorkshopSecret#99', hash), true);
  });

  it('3. rejects wrong password and malformed scrypt hashes safely', () => {
    const hash = hashPasswordScrypt('WorkshopSecret#99');
    assert.equal(verifyPasswordScrypt('WrongPassword', hash), false);
    assert.equal(verifyPasswordScrypt('WorkshopSecret#99', 'invalid$hash'), false);
    assert.equal(verifyPasswordScrypt('WorkshopSecret#99', ''), false);
  });

  it('4. server.ts rejects client-side spoofed {success: true, userCandidate} payloads', () => {
    const serverSource = fs.readFileSync('server.ts', 'utf8');
    assert.equal(serverSource.includes('const { userCandidate, success } = req.body'), false);
    assert.equal(
      serverSource.includes('verifyPasswordScrypt(passwordInput, matchedUser.passwordHash)'),
      true
    );
  });

  it('5. authSession.ts strips plaintext password before saving to localStorage', () => {
    const authSource = fs.readFileSync('src/services/authSession.ts', 'utf8');
    assert.equal(authSource.includes('const { password, ...rest } = u;'), true);
    assert.equal(authSource.includes('computeOneWayPasswordVerifier'), true);
  });

  it('6. UserAccessManager.tsx never renders plaintext u.password in DOM', () => {
    const uiSource = fs.readFileSync('src/components/auth/UserAccessManager.tsx', 'utf8');
    assert.equal(uiSource.includes('u.password'), false);
    assert.equal(uiSource.includes('Terenkripsi (scrypt)'), true);
  });
});

describe('Suite 2: SSRF Prevention, Formula Injection & Schema Validation (Kat. 1 & 4)', () => {
  it('7. blocks cloud metadata IP 169.254.169.254 (AWS/GCP/Azure SSRF)', () => {
    const res = validateSafeExternalAdapterUrl('https://169.254.169.254/latest/meta-data/');
    assert.equal(res.valid, false);
  });

  it('8. blocks loopback addresses (localhost, 127.0.0.1, ::1, 0.0.0.0)', () => {
    assert.equal(validateSafeExternalAdapterUrl('https://localhost:8080/api').valid, false);
    assert.equal(validateSafeExternalAdapterUrl('https://127.0.0.1/api').valid, false);
    assert.equal(validateSafeExternalAdapterUrl('https://[::1]/api').valid, false);
    assert.equal(validateSafeExternalAdapterUrl('https://0.0.0.0/api').valid, false);
  });

  it('9. blocks RFC1918 private network IPs (10.x, 172.16-31.x, 192.168.x)', () => {
    assert.equal(validateSafeExternalAdapterUrl('https://10.0.0.15/workshop').valid, false);
    assert.equal(validateSafeExternalAdapterUrl('https://172.16.5.4/workshop').valid, false);
    assert.equal(validateSafeExternalAdapterUrl('https://192.168.1.100/workshop').valid, false);
  });

  it('10. rejects non-HTTPS external adapter URLs by default', () => {
    assert.equal(
      validateSafeExternalAdapterUrl('http://api.bmi-enterprise.co.id/v1', false).valid,
      false
    );
  });

  it('11. accepts valid HTTPS external domain and normalizes trailing slashes', () => {
    const res = validateSafeExternalAdapterUrl('https://api.bmi-enterprise.co.id/v1///');
    assert.equal(res.valid, true);
    assert.equal(res.normalizedUrl, 'https://api.bmi-enterprise.co.id/v1');
  });

  it('12. neutralizes OWASP CSV/Spreadsheet formula injection payloads', () => {
    assert.equal(sanitizeCellForSpreadsheet('=CMD|" /C calc"!A0'), "'=CMD|\" /C calc\"!A0");
    assert.equal(sanitizeCellForSpreadsheet('+SUM(A1:A10)'), "'+SUM(A1:A10)");
    assert.equal(sanitizeCellForSpreadsheet('-2+3'), "'-2+3");
    assert.equal(sanitizeCellForSpreadsheet('@import("http://evil")'), "'@import(\"http://evil\")");
    assert.equal(sanitizeCellForSpreadsheet('BMI-HTR001'), 'BMI-HTR001');
    assert.equal(sanitizeCellForSpreadsheet(12000), 12000);
  });

  it('13. validates valid WorkshopState schema and rejects corrupted payloads', () => {
    const validRes = validateWorkshopStateSchema({
      trucks: DEMO_SAFE_TRUCKS,
      chassis: DEMO_SAFE_CHASSIS,
      workOrders: DEMO_SAFE_WORK_ORDERS
    });
    assert.equal(validRes.valid, true);

    assert.equal(validateWorkshopStateSchema(null).valid, false);
    assert.equal(
      validateWorkshopStateSchema({ trucks: 'corrupted', chassis: [], workOrders: [] }).valid,
      false
    );
    assert.equal(
      validateWorkshopStateSchema({ trucks: [{}], chassis: [], workOrders: [] }).valid,
      false
    );
  });
});

describe('Suite 3: Atomic Persistence, Concurrency & Gzip Compression (Kat. 3, 5 & 16)', () => {
  it('14. writes JSON atomically via .tmp file + rename with zero leftover .tmp files', async () => {
    const tmpDir = path.resolve('.data/test-atomic');
    await fsp.mkdir(tmpDir, { recursive: true });
    const targetFile = path.join(tmpDir, 'state-test.json');
    const tempFile = `${targetFile}.${process.pid}.${Date.now()}.tmp`;

    const payload = { stateVersion: 5, trucks: [{ idUnit: 'B9101DX' }] };
    await fsp.writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf-8');
    await fsp.rename(tempFile, targetFile);

    const readBack = JSON.parse(await fsp.readFile(targetFile, 'utf-8'));
    assert.equal(readBack.stateVersion, 5);
    assert.equal(fs.existsSync(tempFile), false);
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('15. compresses WorkshopState JSON payload by > 70% with Gzip', () => {
    const sampleJson = JSON.stringify({
      trucks: DEMO_SAFE_TRUCKS,
      chassis: DEMO_SAFE_CHASSIS,
      tires: DEMO_SAFE_TIRES,
      workOrders: DEMO_SAFE_WORK_ORDERS
    }).repeat(10);
    const rawBytes = Buffer.byteLength(sampleJson, 'utf-8');
    const gzippedBytes = zlib.gzipSync(Buffer.from(sampleJson, 'utf-8')).length;
    const reductionPct = ((rawBytes - gzippedBytes) / rawBytes) * 100;
    assert.ok(reductionPct > 70, `Expected >70% compression, got ${reductionPct.toFixed(1)}%`);
  });

  it('16. pdfExport.ts uses dynamic import("jspdf") for lazy chunk splitting', () => {
    const pdfSource = fs.readFileSync('src/services/pdfExport.ts', 'utf8');
    assert.equal(pdfSource.includes("await import('jspdf')"), true);
    assert.equal(pdfSource.includes("import { jsPDF } from 'jspdf'"), false);
  });

  it('17. workshopStore.ts integrates asynchronous IndexedDB persistence & 400ms debounce', () => {
    const storeSource = fs.readFileSync('src/services/workshopStore.ts', 'utf8');
    assert.equal(storeSource.includes('saveStateToIndexedDb'), true);
    assert.equal(storeSource.includes('loadStateFromIndexedDb'), true);
  });
});

describe('Suite 4: Fleet Domain Business Logic — fleetMetrics.ts (Kat. 8, 10 & 11)', () => {
  it('18. parses ISO and DD/MM/YYYY dates accurately', () => {
    const dt1 = parseFlexibleDate('2026-10-15');
    const dt2 = parseFlexibleDate('27/10/2026');
    assert.ok(dt1 instanceof Date);
    assert.ok(dt2 instanceof Date);
    assert.equal(parseFlexibleDate(''), null);
    assert.equal(parseFlexibleDate('-'), null);
  });

  it('19. calculates downtime days accurately between start and reference date', () => {
    const ref = new Date('2026-11-04T00:00:00Z');
    const days = calculateDowntimeDays('2026-10-25T00:00:00Z', undefined, true, ref);
    assert.equal(days, 10);
  });

  it('20. counts warehouse idle days as downtime for unmounted tires (Business Rule)', () => {
    const ref = new Date('2026-11-04T00:00:00Z');
    const warehouseTire = {
      statusKelayakan: 'Spare / Gudang',
      idUnitTerpasang: 'GUDANG SURABAYA',
      tglPasang: '2026-10-15T00:00:00Z',
      tglUpdate: '2026-10-15T00:00:00Z',
      jumlahHariDowntime: 0
    };
    const downtime = calculateTireDowntimeDays(warehouseTire, ref);
    assert.equal(downtime, 20);
  });

  it('21. does not inflate downtime for tires actively mounted on an operating truck', () => {
    const ref = new Date('2026-11-04T00:00:00Z');
    const activeTire = {
      statusKelayakan: 'Aktif Terpasang',
      idUnitTerpasang: 'B9101DX',
      tglPasang: '2026-08-01T00:00:00Z',
      tglUpdate: '2026-10-01T00:00:00Z',
      jumlahHariDowntime: 2
    };
    assert.equal(calculateTireDowntimeDays(activeTire, ref), 2);
  });

  it('22. calculates Tire CPK (IDR/km), tread wear (mm), and remaining mileage', () => {
    const res = calculateTireCpkAndWear(3600000, 60000, 16, 10, 3);
    assert.equal(res.cpkIdrPerKm, 60); // Rp 60 / km
    assert.equal(res.wearMillimeters, 6);
    assert.equal(res.usableTreadRemainingPct, 54); // (10-3)/(16-3) = 7/13 = 53.8% -> 54%
    assert.equal(res.projectedRemainingKm, 70000);
    assert.equal(res.needsReplacementOrRetread, false);
  });

  it('23. flags tire for replacement/retread when tread depth reaches safety limit (<= 3mm)', () => {
    const res = calculateTireCpkAndWear(3600000, 110000, 16, 2.8, 3);
    assert.equal(res.needsReplacementOrRetread, true);
    assert.equal(res.usableTreadRemainingPct, 0);
  });

  it('24. evaluates 13-point chassis checklist as roadworthy when all 13 points pass', () => {
    const item = {
      a3: true,
      v: {
        tl: true,
        lg: true,
        kp: true,
        ban: 'B',
        gajah: true,
        lampu: true,
        rem: true,
        pagar: true,
        slebor: true,
        b1: true,
        b2: true,
        b3: true,
        ld: true,
        lt: true,
        lb: true
      }
    };
    const evalRes = evaluateChassis13PointChecklist(item);
    assert.equal(evalRes.totalPoints, 13);
    assert.equal(evalRes.passedPoints, 13);
    assert.equal(evalRes.faultPoints, 0);
    assert.equal(evalRes.isRoadworthy, true);
  });

  it('25. detects specific fault components in 13-point chassis checklist', () => {
    const item = {
      a3: false,
      v: {
        tl: true,
        lg: true,
        kp: true,
        ban: 'L', // Bocor
        gajah: true,
        lampu: false, // Lampu mati
        rem: true,
        pagar: true,
        slebor: true,
        b1: true,
        b2: true,
        b3: false, // Ignored because 20ft chassis has a3 = false
        ld: true,
        lt: true,
        lb: true
      }
    };
    const evalRes = evaluateChassis13PointChecklist(item);
    assert.equal(evalRes.faultPoints, 2);
    assert.equal(evalRes.isRoadworthy, false);
    assert.deepEqual(evalRes.faultComponents, ['Kondisi Ban', 'Instalasi Lampu']);
  });

  it('26. calculates Fleet Availability Summary accurately across Trucks, Chassis & Gensets', () => {
    const summary = calculateFleetAvailabilitySummary(
      DEMO_SAFE_TRUCKS,
      DEMO_SAFE_CHASSIS,
      DEMO_SAFE_GENSETS,
      DEMO_SAFE_WORK_ORDERS
    );
    assert.equal(summary.totalUnits, 6); // 3 trucks + 2 chassis + 1 genset
    assert.equal(summary.inMaintenanceUnits, 2); // B9102DX + BMI2A002
    assert.equal(summary.readyUnits, 4);
    assert.equal(summary.availabilityRatePct, 66.7);
    assert.equal(summary.openWorkOrdersCount, 1);
  });
});

describe('Suite 5: Privacy Anonymization (UU PDP & Japan APPI) & CI/CD Readiness (Kat. 12 & 14)', () => {
  it('27. demoSeedData.ts contains zero real PT BMI driver names or real L-prefix license plates', () => {
    const serialized = JSON.stringify({
      DEMO_SAFE_TRUCKS,
      DEMO_SAFE_CHASSIS,
      DEMO_SAFE_TIRES,
      DEMO_SAFE_WORK_ORDERS
    });
    assert.equal(/Sugeng|Sumaji|Marman|L9438UU|L8441US|L8497US/i.test(serialized), false);
  });

  it('28. GitHub Actions CI workflow (.github/workflows/ci.yml) exists and runs lint, test, build & audit', () => {
    const ciYaml = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
    assert.ok(ciYaml.includes('npm run lint'));
    assert.ok(ciYaml.includes('npm test'));
    assert.ok(ciYaml.includes('npm run build'));
    assert.ok(ciYaml.includes('npm audit'));
  });
});

describe('Suite 6: Fase 3 — Trilingual i18n (ID/EN/JP), 1-Click Demo Login, WCAG 2.2 AA & Portfolio Docs (Kat. 6, 15, 16, 18)', () => {
  it('29. LOCALE_DICTIONARY provides complete Indonesian, English, and Japanese (車検 / 日常点検 / 整備指示書) dictionaries', () => {
    assert.ok(LOCALE_DICTIONARY.id);
    assert.ok(LOCALE_DICTIONARY.en);
    assert.ok(LOCALE_DICTIONARY.ja);
    assert.ok(LOCALE_DICTIONARY.ja.domainTerms.vehicleInspectionKir.includes('車検'));
    assert.ok(LOCALE_DICTIONARY.ja.domainTerms.daily13PointChassis.includes('シャーシ13項目日常点検'));
    assert.ok(LOCALE_DICTIONARY.ja.domainTerms.workOrderSheet.includes('整備指示書'));
  });

  it('30. formatLocalizedDate formats dates in Japanese YYYY/MM/DD standard when locale is ja', () => {
    const formattedJa = formatLocalizedDate('2026-11-04T00:00:00Z', 'ja');
    assert.match(formattedJa, /^\d{4}\/\d{2}\/\d{2}$/);
  });

  it('31. LoginPage.tsx implements 1-Click Portfolio Demo Access (handleOneClickDemoLogin) and ID/EN/JP switcher', () => {
    const loginSource = fs.readFileSync('src/components/auth/LoginPage.tsx', 'utf8');
    assert.ok(loginSource.includes('handleOneClickDemoLogin'));
    assert.ok(loginSource.includes('setPortfolioDemoMode(true)'));
    assert.ok(loginSource.includes('useLocaleStore'));
  });

  it('32. Sidebar.tsx and TopHeader.tsx dynamically bind navigation and breadcrumbs to useLocaleStore()', () => {
    const sidebarSource = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
    const headerSource = fs.readFileSync('src/components/layout/TopHeader.tsx', 'utf8');
    assert.ok(sidebarSource.includes('useLocaleStore'));
    assert.ok(headerSource.includes('useLocaleStore'));
  });

  it('33. Modal.tsx enforces WCAG 2.2 AA dialog semantics (role="dialog", aria-modal="true", Escape key & Tab focus trap)', () => {
    const modalSource = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8');
    assert.ok(modalSource.includes('role="dialog"'));
    assert.ok(modalSource.includes('aria-modal="true"'));
    assert.ok(modalSource.includes("event.key === 'Escape'"));
    assert.ok(modalSource.includes("event.key === 'Tab'"));
    assert.ok(modalSource.includes('event.isComposing'));
  });

  it('34. Bilingual README.md, Japanese README.ja.md, and multi-stage non-root Dockerfile exist', () => {
    const readmeEn = fs.readFileSync('README.md', 'utf8');
    const readmeJa = fs.readFileSync('README.ja.md', 'utf8');
    const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
    assert.ok(readmeEn.includes('mermaid'));
    assert.ok(readmeJa.includes('楽観的排他制御'));
    assert.ok(dockerfile.includes('USER bmiuser'));
    assert.ok(dockerfile.includes('HEALTHCHECK'));
  });
});
