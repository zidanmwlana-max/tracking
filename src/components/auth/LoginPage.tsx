import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Wrench,
  Lock,
  Mail,
  MapPin,
  ArrowRight,
  AlertCircle,
  Database,
  Activity,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  Globe,
  Sparkles
} from 'lucide-react';
import {
  AuthUser,
  verifyCredentialsRealTime,
  syncUserAccessFromSheetRealTime,
  getLastUserAccessSyncMeta,
  saveAuthSession,
  getAllowedFeaturesForSheetRole,
  RealTimeSyncResult
} from '../../services/authSession';
import { PoolLocation } from '../../types';
import { useLocaleStore, AppLocale } from '../../i18n/localeStore';
import { setPortfolioDemoMode } from '../../services/demoSeedData';

interface LoginPageProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { locale, t, setLocale } = useLocaleStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPool, setSelectedPool] = useState<PoolLocation>('BMI Surabaya');
  const [showPassword, setShowPassword] = useState(false);
  const [showDemoCard, setShowDemoCard] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingRealTime, setIsSyncingRealTime] = useState(false);
  const [syncMeta, setSyncMeta] = useState<RealTimeSyncResult | null>(() =>
    getLastUserAccessSyncMeta()
  );

  // Sinkronisasi Real-Time otomatis dari Sheet 'User Access' saat halaman Login dibuka
  useEffect(() => {
    handleRealTimeSheetSync();
  }, []);

  const handleRealTimeSheetSync = async () => {
    setIsSyncingRealTime(true);
    try {
      const meta = await syncUserAccessFromSheetRealTime();
      setSyncMeta(meta);
    } finally {
      setIsSyncingRealTime(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const result = await verifyCredentialsRealTime(identifier, password, selectedPool);
      setSyncMeta(result.syncResult);
      setIsSubmitting(false);

      if (!result.success || !result.user) {
        setErrorMsg(result.error || 'Otentikasi gagal. Periksa kembali kredensial Anda.');
        return;
      }

      onLoginSuccess(result.user);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err?.message || 'Gagal melakukan sinkronisasi login.');
    }
  };

  /**
   * Fase 3.1: 1-Click Recruiter / Portfolio Demo Login
   * Enables UU PDP & Japan APPI anonymized mode and logs in with the selected role in 1 click.
   */
  const handleOneClickDemoLogin = async (
    demoRole: 'SUPERVISOR' | 'ADMIN' | 'MEKANIK'
  ) => {
    setErrorMsg(null);
    setIsSubmitting(true);
    setPortfolioDemoMode(true);

    const presetMap = {
      SUPERVISOR: {
        id: 'Supervisor01',
        pass: '123456',
        nama: 'Supervisor Armada (Demo)',
        roleRaw: 'Supervisor',
        role: 'SUPERVISOR' as const,
        posisi: 'Fleet & Workshop Manager',
        departemen: 'Portal Service Advisor / Supervisor'
      },
      ADMIN: {
        id: 'Admin001',
        pass: 'bmi2026',
        nama: 'Administrator Bengkel (Demo)',
        roleRaw: 'Admin',
        role: 'SUPERVISOR' as const,
        posisi: 'Workshop System Admin',
        departemen: 'Portal Service Advisor / Supervisor'
      },
      MEKANIK: {
        id: 'Teknisi01',
        pass: '123456',
        nama: 'Teknisi Lapangan (Demo)',
        roleRaw: 'Teknisi',
        role: 'MEKANIK' as const,
        posisi: 'Field Maintenance Technician',
        departemen: 'Portal Lapangan (Mekanik)'
      }
    };

    const chosen = presetMap[demoRole];
    try {
      const res = await verifyCredentialsRealTime(chosen.id, chosen.pass, selectedPool);
      if (res.success && res.user) {
        setIsSubmitting(false);
        onLoginSuccess(res.user);
        return;
      }
    } catch {
      // Fallback to local demo session if server is offline or custom sheet overrides default credentials
    }

    const demoUser: AuthUser = {
      id: chosen.id,
      nama: chosen.nama,
      roleRaw: chosen.roleRaw,
      role: chosen.role,
      credentialStatus: 'HASHED_VERIFIER',
      status: 'Aktif',
      email: `${chosen.id.toLowerCase()}@demo-bmi.example.com`,
      posisi: chosen.posisi,
      lokasi: selectedPool,
      departemen: chosen.departemen,
      kodeAkses: chosen.id,
      allowedFeatures: getAllowedFeaturesForSheetRole(chosen.roleRaw),
      lastVerifiedAt: new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      syncSource: 'LOCAL_CACHE'
    };

    saveAuthSession(demoUser);
    setIsSubmitting(false);
    onLoginSuccess(demoUser);
  };

  const languageOptions: { code: AppLocale; label: string }[] = [
    { code: 'id', label: '🇮🇩 ID' },
    { code: 'en', label: '🇬🇧 EN' },
    { code: 'ja', label: '🇯🇵 日本語' }
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row lg:items-stretch text-slate-900 antialiased">
      {/* Left Column: Corporate Identity & Enterprise System Architecture */}
      <div className="lg:w-7/12 bmi-blueprint-grid bg-[#0A2547] text-white p-8 lg:p-14 flex flex-col justify-between border-b-[3px] lg:border-b-0 lg:border-r-[3px] border-[#D19F0F]">
        {/* Top Brand Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="bg-white rounded-lg px-2.5 py-1.5 shadow-xs border border-slate-200 flex items-center justify-center shrink-0">
              <img
                src="/assets/aistudio/logo-bmi_9490acc1.png"
                alt="PT Bumi Menara Internusa"
                className="h-8 w-auto object-contain"
              />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-white">
                {t.brandTitle} · Enterprise v3.0
              </div>
              <div className="text-xs text-slate-300 tracking-[0.01em]">
                {t.brandSubtitle} · PT Bumi Menara Internusa
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-[#D19F0F] font-mono font-semibold whitespace-nowrap shrink-0">
            <span>{t.domainTerms.vehicleInspectionKir}</span>
          </div>
        </div>

        {/* Center Enterprise Value Proposition & System Capabilities */}
        <div className="my-10 lg:my-0 max-w-2xl space-y-8">
          <div className="space-y-3.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#D19F0F] tracking-[0.02em]">
              <span>{t.login.heroBadge}</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300">PT Bumi Menara Internusa</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-bold tracking-tight text-white leading-[1.22] max-w-xl">
              {t.login.heroTitle}
            </h1>
            <p className="text-sm text-slate-200/90 leading-relaxed max-w-xl tracking-[0.01em]">
              {t.login.heroDesc}
            </p>
          </div>

          {/* Key Enterprise Architecture Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#D19F0F] shrink-0" />
                  <span>{t.portals.supervisor}</span>
                </span>
                <span className="font-mono text-[10px] text-[#D19F0F]">RBAC</span>
              </div>
              <p className="text-xs text-slate-300/90 leading-relaxed">
                {t.domainTerms.workOrderSheet} · {t.domainTerms.vehicleInspectionKir}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{t.portals.technician}</span>
                </span>
                <span className="font-mono text-[10px] text-emerald-400">13-Point</span>
              </div>
              <p className="text-xs text-slate-300/90 leading-relaxed">
                {t.domainTerms.daily13PointChassis}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Optimistic Concurrency & IndexedDB</span>
                </span>
                <span className="font-mono text-[10px] text-amber-300">ACID Safe</span>
              </div>
              <p className="text-xs text-slate-300/90 leading-relaxed">
                Zero silent data overwrite (`stateVersion` 409 conflict auto-merge & atomic storage).
              </p>
            </div>

            <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>{t.domainTerms.tireCpkManagement}</span>
                </span>
                <span className="font-mono text-[10px] text-blue-300">CPK / KM</span>
              </div>
              <p className="text-xs text-slate-300/90 leading-relaxed">
                Real-time tread depth (`mm`), inflation pressure (`PSI`), and warehouse tire idle tracking.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Operational Pools Footer */}
        <div className="pt-6 border-t border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-300">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-semibold text-white">Pool Network:</span>
            <span>Pool Surabaya</span>
            <span aria-hidden="true">·</span>
            <span>Pool Lamongan</span>
            <span aria-hidden="true">·</span>
            <span>Pool Dampit</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Divisi Pemeliharaan Armada · PT Bumi Menara Internusa
          </div>
        </div>
      </div>

      {/* Right Column: Authentication Form & 1-Click Demo Switcher */}
      <div className="lg:w-5/12 flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-[#F8FAFC]">
        <div className="w-full max-w-md space-y-4">
          {/* Top Bar: Language Switcher (ID / EN / JP) & Sync Status */}
          <div className="flex items-center justify-between gap-2">
            <div
              className="inline-flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-lg p-1"
              role="group"
              aria-label="Pilih Bahasa / Select Language / 言語選択"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-0.5" />
              {languageOptions.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setLocale(opt.code)}
                  aria-pressed={locale === opt.code}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    locale === opt.code
                      ? 'bg-[#0A2547] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRealTimeSheetSync}
              disabled={isSyncingRealTime}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E8F0] hover:bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              title="Muat ulang daftar akses pengguna"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingRealTime ? 'animate-spin' : ''}`} />
              <span>{syncMeta ? `${syncMeta.userCount} Akun` : 'Sync'}</span>
            </button>
          </div>

          {/* 1-Click Portfolio / Recruiter Demo Access Card (Hidden by default) */}
          {showDemoCard && (
            <div className="bg-[#0A2547] text-white border border-[#073E7F] rounded-lg p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#D19F0F]">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>{t.login.demoBoxTitle}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-[#073E7F] text-[10px] font-mono text-emerald-300 border border-emerald-500/30">
                  {t.login.demoPrivacyBadge}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {t.login.demoBoxSubtitle}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleOneClickDemoLogin('SUPERVISOR')}
                  className="px-2.5 py-2 rounded bg-[#D19F0F] hover:bg-amber-500 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer text-center truncate"
                >
                  {t.login.demoSupervisorBtn}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleOneClickDemoLogin('ADMIN')}
                  className="px-2.5 py-2 rounded bg-[#073E7F] hover:bg-blue-800 text-white font-semibold text-[11px] border border-blue-400/30 transition-colors cursor-pointer text-center truncate"
                >
                  {t.login.demoAdminBtn}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleOneClickDemoLogin('MEKANIK')}
                  className="px-2.5 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-[11px] border border-emerald-400/30 transition-colors cursor-pointer text-center truncate"
                >
                  {t.login.demoMechanicBtn}
                </button>
              </div>
            </div>
          )}

          {/* Login Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 sm:p-7">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                {t.login.cardTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {t.login.cardSubtitle}
              </p>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-[#EF4444]"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="font-medium leading-relaxed">{errorMsg}</div>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* ID / Email Input */}
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  {t.login.idLabel}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Admin001 / Supervisor01 / Teknisi01"
                    className="w-full pl-9 pr-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  {t.login.passLabel}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-9 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    aria-label="Tampilkan atau sembunyikan kata sandi"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Operational Pool Selector */}
              <div>
                <label
                  htmlFor="login-pool"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  {t.login.poolLabel}
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    id="login-pool"
                    value={selectedPool}
                    onChange={(e) => setSelectedPool(e.target.value as PoolLocation)}
                    className="w-full pl-9 pr-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                  >
                    <option value="BMI Surabaya">BMI Surabaya (Pool Utama & Gudang Pusat)</option>
                    <option value="BMI Lamongan">BMI Lamongan (Cabang Pantura)</option>
                    <option value="BMI Dampit">BMI Dampit (Cabang Malang Selatan)</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-xs rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>
                    {isSubmitting ? t.login.verifyingBtn : t.login.submitBtn}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Security Notice */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>HMAC-SHA256 + scrypt</span>
                </span>
                <span className="font-medium text-slate-600">OWASP ASVS L2</span>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
