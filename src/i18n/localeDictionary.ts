export type AppLocale = 'id' | 'en' | 'ja';

export const LOCALE_STORAGE_KEY = 'bmi_workshop_locale_v1';

export interface LocaleStrings {
  brandTitle: string;
  brandSubtitle: string;
  navSections: {
    mainManagement: string;
    fleetInspection: string;
    technicianOps: string;
  };
  tabs: {
    dashboard: string;
    fleet: string;
    workorders: string;
    tires: string;
    'warehouse-tires': string;
    'chassis-checklist': string;
    inventory: string;
    incidents: string;
    'user-access': string;
    architecture: string;
  };
  portals: {
    supervisor: string;
    workshopOps: string;
    technician: string;
    systemDocs: string;
  };
  login: {
    heroBadge: string;
    heroTitle: string;
    heroDesc: string;
    cardTitle: string;
    cardSubtitle: string;
    idLabel: string;
    passLabel: string;
    poolLabel: string;
    submitBtn: string;
    verifyingBtn: string;
    demoBoxTitle: string;
    demoBoxSubtitle: string;
    demoSupervisorBtn: string;
    demoAdminBtn: string;
    demoMechanicBtn: string;
    demoPrivacyBadge: string;
  };
  domainTerms: {
    vehicleInspectionKir: string;
    daily13PointChassis: string;
    workOrderSheet: string;
    tireCpkManagement: string;
    logoutBtn: string;
    reportBtn: string;
  };
}

export const LOCALE_DICTIONARY: Record<AppLocale, LocaleStrings> = {
  id: {
    brandTitle: 'Bengkel BMI',
    brandSubtitle: 'Bumi Menara Internusa',
    navSections: {
      mainManagement: 'Manajemen utama',
      fleetInspection: 'Inspeksi armada',
      technicianOps: 'Operasional teknisi'
    },
    tabs: {
      dashboard: 'Dasbor eksekutif',
      fleet: 'Manajemen armada',
      workorders: 'Work order',
      tires: 'Posisi ban',
      'warehouse-tires': 'Stok ban gudang',
      'chassis-checklist': 'Inspeksi sasis',
      inventory: 'Suku cadang',
      incidents: 'Laporan insiden',
      'user-access': 'Hak akses',
      architecture: 'Sistem & server'
    },
    portals: {
      supervisor: 'Portal supervisor',
      workshopOps: 'Operasional bengkel',
      technician: 'Portal teknisi',
      systemDocs: 'Dokumentasi sistem'
    },
    login: {
      heroBadge: 'Manajemen Armada Logistik Terpadu',
      heroTitle: 'Kendali Penuh Operasional Bengkel, Suku Cadang, dan Siklus Ban Armada',
      heroDesc:
        'Platform manajemen perawatan armada terintegrasi untuk memantau jadwal servis berkala, kesiapan inventaris ban, pengelolaan suku cadang gudang, serta penugasan teknisi bengkel.',
      cardTitle: 'Masuk ke Portal Operasional',
      cardSubtitle:
        'Masukkan ID Pengguna atau gunakan tombol akses cepat demo di bawah untuk mengeksplorasi sistem.',
      idLabel: 'ID Pengguna / Email',
      passLabel: 'Kata Sandi',
      poolLabel: 'Lokasi Pool Penugasan',
      submitBtn: 'Masuk ke Sistem',
      verifyingBtn: 'Memverifikasi Kredensial...',
      demoBoxTitle: 'Akses Cepat Demo Portofolio (1-Click Login)',
      demoBoxSubtitle: 'Masuk instan tanpa ketik sandi (Data dianonimkan sesuai UU PDP & APPI):',
      demoSupervisorBtn: 'Fleet Manager (Supervisor)',
      demoAdminBtn: 'Admin Workshop',
      demoMechanicBtn: 'Teknisi Lapangan',
      demoPrivacyBadge: 'Zero-PII Safe Demo'
    },
    domainTerms: {
      vehicleInspectionKir: 'Uji KIR Berkala',
      daily13PointChassis: 'Inspeksi Harian 13 Titik Sasis',
      workOrderSheet: 'Lembar Perintah Kerja (WO)',
      tireCpkManagement: 'Analitik Umur & CPK Ban',
      logoutBtn: 'Keluar sesi',
      reportBtn: 'Laporan'
    }
  },
  en: {
    brandTitle: 'BMI Workshop DX',
    brandSubtitle: 'Fleet & Maintenance Ops',
    navSections: {
      mainManagement: 'Core management',
      fleetInspection: 'Fleet inspection',
      technicianOps: 'Technician portal'
    },
    tabs: {
      dashboard: 'Executive dashboard',
      fleet: 'Fleet management',
      workorders: 'Work orders (WO)',
      tires: 'Tire intelligence',
      'warehouse-tires': 'Warehouse tires',
      'chassis-checklist': 'Chassis inspection',
      inventory: 'Spareparts inventory',
      incidents: 'Incident reports',
      'user-access': 'Access control',
      architecture: 'System & DB sync'
    },
    portals: {
      supervisor: 'Supervisor portal',
      workshopOps: 'Workshop operations',
      technician: 'Technician portal',
      systemDocs: 'System architecture'
    },
    login: {
      heroBadge: 'Enterprise Logistics & Fleet Maintenance DX',
      heroTitle: 'End-to-End Workshop Operations, 13-Point Chassis Inspection & Tire Lifecycle Control',
      heroDesc:
        'Integrated preventive maintenance platform engineered to minimize fleet downtime, track tire Cost-Per-Kilometer (CPK), and streamline multi-pool workshop workflows.',
      cardTitle: 'Sign In to Operations Portal',
      cardSubtitle:
        'Enter your corporate ID or use the 1-Click Portfolio Demo buttons below for instant evaluation.',
      idLabel: 'User ID / Corporate Email',
      passLabel: 'Password',
      poolLabel: 'Assigned Operational Pool',
      submitBtn: 'Sign In to Portal',
      verifyingBtn: 'Verifying Credentials...',
      demoBoxTitle: 'Recruiter 1-Click Demo Access',
      demoBoxSubtitle: 'Instant role switching with APPI/GDPR-anonymized fleet data:',
      demoSupervisorBtn: 'Fleet Manager (Full Access)',
      demoAdminBtn: 'Workshop Admin',
      demoMechanicBtn: 'Field Technician',
      demoPrivacyBadge: 'APPI/UU-PDP Anonymized'
    },
    domainTerms: {
      vehicleInspectionKir: 'Statutory Vehicle Inspection (Shaken / KIR)',
      daily13PointChassis: 'Daily 13-Point Chassis Inspection',
      workOrderSheet: 'Maintenance Work Order (WO)',
      tireCpkManagement: 'Tire Wear & CPK Analytics',
      logoutBtn: 'Sign out',
      reportBtn: 'Reports'
    }
  },
  ja: {
    brandTitle: 'BMI 整備・車両DX',
    brandSubtitle: '物流フリート管理システム',
    navSections: {
      mainManagement: '主要管理メニュー',
      fleetInspection: '車両・日常点検',
      technicianOps: '現場整備士メニュー'
    },
    tabs: {
      dashboard: '統合ダッシュボード',
      fleet: '車両・資産管理 (車検)',
      workorders: '整備指示書 (WO)',
      tires: 'タイヤ摩耗・CPK管理',
      'warehouse-tires': '倉庫タイヤ在庫',
      'chassis-checklist': 'シャーシ日常点検',
      inventory: '部品・パーツ在庫',
      incidents: '事故・トラブル報告',
      'user-access': '権限・ユーザー管理',
      architecture: 'システム構成・同期'
    },
    portals: {
      supervisor: '管理者ポータル',
      workshopOps: '整備工場オペレーション',
      technician: '整備士ポータル',
      systemDocs: 'システム設計書'
    },
    login: {
      heroBadge: '物流DX・車両稼働率最適化プラットフォーム',
      heroTitle: '整備工場の業務効率化・シャーシ13項目日常点検・タイヤ寿命管理を一元化',
      heroDesc:
        '車両ダウンタイムの最小化、車検・定期点検スケジュール管理、タイヤCPK（1kmあたりコスト）分析、および拠点間のリアルタイム同期を実現するエンタープライズWebアプリ。',
      cardTitle: '業務ポータルへログイン',
      cardSubtitle:
        'ユーザーIDを入力するか、下の「採用担当者向けワンクリックデモ」から即座に体験できます。',
      idLabel: 'ユーザーID / メールアドレス',
      passLabel: 'パスワード',
      poolLabel: '担当営業所・整備プール',
      submitBtn: 'システムにログイン',
      verifyingBtn: '認証情報を確認中...',
      demoBoxTitle: '採用担当者向けワンクリック・デモログイン',
      demoBoxSubtitle: 'パスワード入力不要で各ロールの画面を即座に確認できます（個人情報匿名化済）：',
      demoSupervisorBtn: '運行・整備管理者 (全機能)',
      demoAdminBtn: 'システム管理者 (Admin)',
      demoMechanicBtn: '現場整備士 (4モジュール)',
      demoPrivacyBadge: 'APPI 匿名化データ対応'
    },
    domainTerms: {
      vehicleInspectionKir: '車検・法定定期点検 (Shaken / KIR)',
      daily13PointChassis: 'シャーシ13項目日常点検 (Nichijō Tenken)',
      workOrderSheet: '整備指示書 (Work Order / Seibi Shijisho)',
      tireCpkManagement: 'タイヤ摩耗・CPK（km単価）管理',
      logoutBtn: 'ログアウト',
      reportBtn: 'レポート履歴'
    }
  }
};

export function formatLocalizedDate(dateInput: Date | string, locale: AppLocale = 'id'): string {
  const dt = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(dt.getTime())) return String(dateInput || '-');

  if (locale === 'ja') {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }
  if (locale === 'en') {
    return dt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
  }
  return dt.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}
