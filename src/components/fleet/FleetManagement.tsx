import React, { useState } from 'react';
import {
  Truck,
  Layers,
  CircleDot,
  Search,
  Plus,
  AlertTriangle,
  Trash2,
  X,
  Gauge,
  CheckCircle2,
  Cpu,
  Clock,
  Calendar,
  Activity,
  FileText,
  Wrench,
  ShieldAlert,
  Package,
  History,
  TrendingUp,
  Share2,
  ExternalLink
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import { evaluateTruckComponents } from '../../services/maintenanceEngine';
import {
  generateTruckLambungId,
  generateChassisAutoId,
  generateGensetAutoId,
  parseAndGenerateBanId
} from '../../services/autoIdGenerator';
import { buildBmiWhatsAppReport, triggerReportToast } from '../common/ReportToast';
import { getStoredAuthSession, isFeatureAllowedForUser } from '../../services/authSession';
import { FeatureAccessGuard } from '../auth/FeatureAccessGuard';
import {
  Card,
  Button,
  Badge,
  Modal,
  ConfirmDialog,
  TableContainer,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  EmptyState
} from '../ui';

interface FleetManagementProps {
  onNavigateToTapRoda?: (unitId: string) => void;
}

export const FleetManagement: React.FC<FleetManagementProps> = ({ onNavigateToTapRoda }) => {
  const { state, registerNewAssetBulk, afkirAsset } = useWorkshopStore();
  const currentUser = getStoredAuthSession();
  const hasFleetAccess = isFeatureAllowedForUser(currentUser, 'fleet');
  const [activeTab, setActiveTab] = useState<'TRUK' | 'CHASSIS' | 'GENSET' | 'BAN'>('TRUK');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'SERVICE' | 'AFKIR'>('ALL');
  const [ownershipFilter, setOwnershipFilter] = useState<'ALL' | 'BMI' | 'SEWA'>('ALL');

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedAssetForLogbook, setSelectedAssetForLogbook] = useState<{
    id: string;
    kategori: 'TRUK' | 'CHASSIS' | 'GENSET' | 'BAN';
    spec: string;
    data: any;
  } | null>(null);
  const [logbookTab, setLogbookTab] = useState<
    'AUDIT' | 'WO' | 'INCIDENTS' | 'PARTS' | 'TIRES' | 'COMPONENTS'
  >('AUDIT');
  const [confirmAfkirId, setConfirmAfkirId] = useState<string | null>(null);

  // Cart for bulk registration (with in-memory sequence counter via cartItems)
  const [registrationCart, setRegistrationCart] = useState<any[]>([]);
  const [regError, setRegError] = useState<string | null>(null);

  const [regForm, setRegForm] = useState({
    kategori: 'TRUK' as 'TRUK' | 'CHASSIS' | 'GENSET' | 'BAN',
    idUnit: '', // Only manually entered for TRUK Nopol
    jenis: 'Head Truck',
    merk: '',
    odo: 0,
    interval: 250,
    milik: 'BMI' as 'BMI' | 'SEWA',
    vendorName: '',
    stnk: '',
    pajak: '',
    kir: '',
    statusKir: 'Aktif',
    karoseri: '',
    vin: '',
    gvw: 0,
    tare: 0,
    dot: '1NL2925',
    siklus: 'R0' as 'R0' | 'R1' | 'R2' | 'RJ',
    harga: 0
  });

  // Live Auto-ID Preview Calculation (using in-memory cart + store state)
  const truckPreview = generateTruckLambungId(
    regForm.jenis,
    regForm.milik,
    regForm.vendorName,
    state.trucks,
    registrationCart
  );

  const chassisPreview = generateChassisAutoId(
    regForm.jenis,
    regForm.milik,
    regForm.vendorName,
    state.chassis,
    state.trucks,
    registrationCart
  );

  const gensetPreview = generateGensetAutoId(
    regForm.jenis,
    state.gensets,
    registrationCart
  );

  const banDotPreview = parseAndGenerateBanId(
    regForm.dot,
    regForm.siklus,
    state.tires,
    registrationCart
  );

  // Legality helper
  const getLegalityBadge = (dateStr?: string, label: string = 'KIR') => {
    if (!dateStr || dateStr === '-') return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const diff = Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    if (diff < 0) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">
          {label} MATI
        </span>
      );
    }
    if (diff <= 30) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
          {label} Exp {diff}h
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
        {label} Aktif
      </span>
    );
  };

  // Filtered lists
  const filteredTrucks = state.trucks.filter((t) => {
    const isAfkir = t.statusServis === 'AFKIR';
    const isService =
      t.statusServis === 'Scheduled' ||
      t.statusServis === 'In Progress' ||
      t.statusServis === 'Arrived';
    if (statusFilter === 'AFKIR' && !isAfkir) return false;
    if (statusFilter === 'SERVICE' && !isService) return false;
    if (statusFilter === 'READY' && (isAfkir || isService)) return false;
    if (ownershipFilter !== 'ALL' && t.kepemilikan !== ownershipFilter) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.idUnit.toLowerCase().includes(q) ||
      t.noLambung.toLowerCase().includes(q) ||
      t.jenisArmada.toLowerCase().includes(q) ||
      t.merkModel.toLowerCase().includes(q) ||
      (t.vendorName && t.vendorName.toLowerCase().includes(q))
    );
  });

  const filteredChassis = state.chassis.filter((c) => {
    const isAfkir = c.statusServis === 'AFKIR';
    const isService =
      c.statusServis === 'Scheduled' ||
      c.statusServis === 'In Progress' ||
      c.statusServis === 'Arrived';
    if (statusFilter === 'AFKIR' && !isAfkir) return false;
    if (statusFilter === 'SERVICE' && !isService) return false;
    if (statusFilter === 'READY' && (isAfkir || isService)) return false;
    if (ownershipFilter === 'BMI' && c.statusMilik !== 'BMI') return false;
    if (ownershipFilter === 'SEWA' && c.statusMilik === 'BMI') return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.idUnit.toLowerCase().includes(q) ||
      c.tipeChassis.toLowerCase().includes(q) ||
      (c.vin && c.vin.toLowerCase().includes(q))
    );
  });

  const filteredGensets = state.gensets.filter((g) => {
    const isAfkir = g.statusServis === 'AFKIR';
    const isService =
      g.statusServis === 'Scheduled' ||
      g.statusServis === 'In Progress' ||
      g.statusServis === 'Arrived';
    if (statusFilter === 'AFKIR' && !isAfkir) return false;
    if (statusFilter === 'SERVICE' && !isService) return false;
    if (statusFilter === 'READY' && (isAfkir || isService)) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.idUnit.toLowerCase().includes(q) ||
      g.tipeGenset.toLowerCase().includes(q) ||
      g.merkKapasitas.toLowerCase().includes(q)
    );
  });

  const filteredTires = state.tires.filter((b) => {
    const isAfkirOrHist =
      b.statusKelayakan === 'Afkir / Dibuang' || b.statusKelayakan === 'Histori (Terupdate)';
    const isInstalled = b.statusKelayakan === 'Aktif Terpasang';
    const isGudang = b.statusKelayakan === 'Spare / Gudang';
    if (statusFilter === 'AFKIR' && !isAfkirOrHist) return false;
    if (statusFilter === 'SERVICE' && !isInstalled) return false;
    if (statusFilter === 'READY' && !isGudang) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.idBanFisik.toLowerCase().includes(q) ||
      b.idSiklus.toLowerCase().includes(q) ||
      b.merk.toLowerCase().includes(q) ||
      b.ukuran.toLowerCase().includes(q) ||
      b.dot.toLowerCase().includes(q) ||
      b.unitTerpasang.toLowerCase().includes(q) ||
      b.catatanKondisi.toLowerCase().includes(q)
    );
  });

  // Bulk Cart Addition Handler with Auto-Generate ID rules
  const handleAddToCart = () => {
    setRegError(null);

    if (regForm.kategori === 'TRUK') {
      if (!regForm.idUnit.trim()) {
        setRegError('Nomor Polisi (Nopol) Armada wajib diisi (contoh: L 9988 UZ).');
        return;
      }
      if (regForm.milik === 'SEWA' && !regForm.vendorName.trim()) {
        setRegError('Nama Perusahaan Vendor wajib diisi.');
        return;
      }

      const item = {
        ...regForm,
        idUnit: regForm.idUnit.toUpperCase().trim(),
        noLambung: truckPreview.noLambung,
        ownerCode: truckPreview.ownerCode
      };
      setRegistrationCart([...registrationCart, item]);
      setRegForm((prev) => ({ ...prev, idUnit: '' }));
      return;
    }

    if (regForm.kategori === 'CHASSIS') {
      if (regForm.milik === 'SEWA' && !regForm.vendorName.trim()) {
        setRegError('Nama Perusahaan Vendor wajib diisi.');
        return;
      }
      const item = {
        ...regForm,
        idUnit: chassisPreview.idUnit,
        ownerCode: chassisPreview.ownerCode
      };
      setRegistrationCart([...registrationCart, item]);
      return;
    }

    if (regForm.kategori === 'GENSET') {
      const item = {
        ...regForm,
        idUnit: gensetPreview.idUnit
      };
      setRegistrationCart([...registrationCart, item]);
      return;
    }

    if (regForm.kategori === 'BAN') {
      if (!banDotPreview.valid || !banDotPreview.idBanFisik) {
        setRegError(banDotPreview.error || 'Kode DOT Ban tidak valid.');
        return;
      }
      const item = {
        ...regForm,
        idUnit: banDotPreview.idBanFisik,
        idSiklus: banDotPreview.idSiklus,
        dot: `${banDotPreview.plant}${banDotPreview.wwyy}`
      };
      setRegistrationCart([...registrationCart, item]);
      return;
    }
  };

  const handleSaveBulkRegistration = () => {
    if (registrationCart.length === 0) return;
    const snapshot = [...registrationCart];
    registerNewAssetBulk(snapshot);

    const waText = buildBmiWhatsAppReport(
      `Pendaftaran Aset Baru (${snapshot.length} Unit)`,
      state.userLocation,
      state.userPic,
      [
        `Total Aset Terdaftar: *${snapshot.length} Unit*`,
        ``,
        `*DAFTAR AUTO-ID TERDAFTAR:*`,
        ...snapshot.map((it, idx) => {
          if (it.kategori === 'TRUK') {
            return `${idx + 1}. [ARMADA] *${it.idUnit}* | Lambung: *${it.noLambung}* (${it.jenis} - ${
              it.milik === 'SEWA' ? `Sewa ${it.vendorName}` : 'BMI'
            })`;
          }
          if (it.kategori === 'BAN') {
            return `${idx + 1}. [BAN] Fisik: *${it.idUnit}* | Siklus: *${it.idSiklus}* (DOT ${it.dot} · ${
              it.jenis
            } · ${it.merk || '-'})`;
          }
          return `${idx + 1}. [${it.kategori}] Auto-ID: *${it.idUnit}* (${it.jenis})`;
        })
      ]
    );

    triggerReportToast({
      title: `Registrasi ${snapshot.length} Aset Baru`,
      text: waText
    });

    setRegistrationCart([]);
    setShowRegisterModal(false);
  };

  if (!hasFleetAccess) {
    return (
      <FeatureAccessGuard
        feature="fleet"
        featureTitle="Manajemen & Analisis Aset (Fleet Management)"
        currentUser={currentUser}
      >
        <div />
      </FeatureAccessGuard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#073E7F] mb-1">
              Manajemen Armada & Inventaris Unit
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Manajemen Armada & Registrasi Aset
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Kelola data operasional Armada (Truk & Mobil Support), Chassis Trailer, Genset Reefer, dan Inventaris Ban
              secara terpusat.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRegistrationCart([]);
                setRegError(null);
                setShowRegisterModal(true);
              }}
              className="px-4 py-2.5 bg-[#0A2547] hover:bg-[#073E7F] text-white font-bold text-xs rounded-lg flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#D19F0F]" />
              <span>Daftarkan Aset Baru</span>
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 mt-6 border-b border-slate-200 overflow-x-auto">
          {[
            { id: 'TRUK', label: 'Armada / Fleet (TRK)', count: state.trucks.length, icon: Truck },
            { id: 'CHASSIS', label: 'Chassis Trailer (CHA)', count: state.chassis.length, icon: Layers },
            { id: 'GENSET', label: 'Genset Reefer (GNZ)', count: state.gensets.length, icon: Gauge },
            { id: 'BAN', label: 'Inventaris Ban (BAN)', count: state.tires.length, icon: CircleDot }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSearchQuery('');
                }}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-[#0A2547] text-[#0A2547]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#D19F0F]' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Filters Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari ID, nopol, lambung, merk, DOT…"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:border-[#073E7F]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              {[
                {
                  id: 'ALL',
                  label: activeTab === 'BAN' ? `Semua (${state.tires.length})` : 'Semua'
                },
                {
                  id: 'READY',
                  label:
                    activeTab === 'BAN'
                      ? `Gudang (${state.tires.filter((b) => b.statusKelayakan === 'Spare / Gudang').length})`
                      : 'Siap Jalan'
                },
                {
                  id: 'SERVICE',
                  label:
                    activeTab === 'BAN'
                      ? `Terpasang (${state.tires.filter((b) => b.statusKelayakan === 'Aktif Terpasang').length})`
                      : 'Servis'
                },
                {
                  id: 'AFKIR',
                  label:
                    activeTab === 'BAN'
                      ? `Vendor / Histori (${state.tires.filter((b) => b.statusKelayakan === 'Afkir / Dibuang' || b.statusKelayakan === 'Histori (Terupdate)').length})`
                      : 'Afkir'
                }
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id as any)}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    statusFilter === st.id
                      ? 'bg-[#0A2547] text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {activeTab !== 'GENSET' && activeTab !== 'BAN' && (
              <select
                value={ownershipFilter}
                onChange={(e) => setOwnershipFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="ALL">Milik: Semua</option>
                <option value="BMI">Milik: BMI</option>
                <option value="SEWA">Milik: Sewa Vendor</option>
              </select>
            )}
          </div>
        </div>
      </Card>

      {/* Asset Table Container */}
      <TableContainer>
        {activeTab === 'TRUK' &&
          (filteredTrucks.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Tidak ada unit armada / fleet"
              description="Tidak ada unit armada (truk atau mobil support) yang cocok dengan filter atau kata kunci pencarian Anda."
            />
          ) : (
            <Table aria-label="Daftar armada dan unit support">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nopol & Lambung</TableHeaderCell>
                  <TableHeaderCell>Jenis & Spesifikasi</TableHeaderCell>
                  <TableHeaderCell>Odometer</TableHeaderCell>
                  <TableHeaderCell>STNK & Pajak</TableHeaderCell>
                  <TableHeaderCell>Status Servis</TableHeaderCell>
                  <TableHeaderCell className="text-right">Tindakan</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTrucks.map((truck) => {
                  const isAfkir = truck.statusServis === 'AFKIR';
                  return (
                    <TableRow key={truck.idUnit}>
                      <TableCell className="font-mono">
                        <span className="bmi-plate text-xs">{truck.idUnit}</span>
                        <div className="text-xs text-[#475569] flex items-center gap-1.5 mt-1">
                          <span className="font-bold text-[#073E7F]">{truck.noLambung}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {truck.kepemilikan === 'SEWA'
                              ? `SEWA (${truck.vendorName || 'Vendor'})`
                              : 'BMI'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-[#0F172A]">{truck.jenisArmada}</div>
                        <div className="text-xs text-[#475569]">{truck.merkModel}</div>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-[#0F172A] tabular-nums">
                        <div>{truck.kmSaatIni.toLocaleString('id-ID')} KM</div>
                        {truck.statusPm === 'OVERDUE' && (
                          <div className="text-xs font-bold text-[#DC2626] mt-0.5">
                            PM Lewat ({Math.abs(truck.sisaKmServis || 0).toLocaleString('id-ID')} KM)
                          </div>
                        )}
                        {truck.statusPm === 'DUE_SOON' && (
                          <div className="text-xs font-bold text-[#D97706] mt-0.5">
                            PM Sisa {(truck.sisaKmServis || 0).toLocaleString('id-ID')} KM
                          </div>
                        )}
                        {(!truck.statusPm || truck.statusPm === 'SAFE') && (
                          <div className="text-xs text-[#94A3B8] mt-0.5">
                            PM: {truck.kmServisBerikutnya?.toLocaleString('id-ID')} KM
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="space-y-1">
                        <div>{getLegalityBadge(truck.masaSTNK, 'STNK')}</div>
                        <div>{getLegalityBadge(truck.masaPajak, 'Pajak')}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            isAfkir
                              ? 'danger'
                              : truck.statusServis === 'Scheduled' || truck.statusServis === 'In Progress'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {truck.statusServis}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setSelectedAssetForLogbook({
                                id: truck.idUnit,
                                kategori: 'TRUK',
                                spec: `${truck.noLambung} · ${truck.jenisArmada} · ${truck.merkModel}`,
                                data: truck
                              })
                            }
                          >
                            Logbook
                          </Button>
                          {onNavigateToTapRoda && !isAfkir && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onNavigateToTapRoda(truck.idUnit)}
                            >
                              Tap roda
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ))}

          {activeTab === 'CHASSIS' &&
          (filteredChassis.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Tidak ada chassis"
              description="Tidak ada unit chassis yang cocok dengan filter atau kata kunci pencarian Anda."
            />
          ) : (
            <Table aria-label="Daftar chassis trailer">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>ID Unit Chassis</TableHeaderCell>
                  <TableHeaderCell>Tipe & Karoseri</TableHeaderCell>
                  <TableHeaderCell>Kapasitas Beban</TableHeaderCell>
                  <TableHeaderCell>Masa Berlaku KIR</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell className="text-right">Tindakan</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredChassis.map((chassis) => {
                  const isAfkir = chassis.statusServis === 'AFKIR';
                  return (
                    <TableRow key={chassis.idUnit}>
                      <TableCell className="font-mono">
                        <span className="bmi-plate text-xs">{chassis.idUnit}</span>
                        <div className="text-xs text-[#475569] mt-1">
                          {chassis.statusMilik} · Ban: {chassis.targetUkuranBan}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-[#0F172A]">{chassis.tipeChassis}</div>
                        <div className="text-xs text-[#475569]">
                          Karoseri: {chassis.karoseri || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[#0F172A] tabular-nums">
                        <div>
                          GVW: {chassis.gvw ? `${chassis.gvw.toLocaleString('id-ID')} kg` : '-'}
                        </div>
                        <div className="text-xs text-[#475569]">
                          Tare: {chassis.tare ? `${chassis.tare.toLocaleString('id-ID')} kg` : '-'}
                        </div>
                      </TableCell>
                      <TableCell>{getLegalityBadge(chassis.masaKIR, 'KIR')}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            isAfkir
                              ? 'danger'
                              : chassis.statusServis === 'Scheduled' || chassis.statusServis === 'In Progress'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {chassis.statusServis}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setSelectedAssetForLogbook({
                                id: chassis.idUnit,
                                kategori: 'CHASSIS',
                                spec: chassis.tipeChassis,
                                data: chassis
                              })
                            }
                          >
                            Logbook
                          </Button>
                          {onNavigateToTapRoda && !isAfkir && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onNavigateToTapRoda(chassis.idUnit)}
                            >
                              Tap roda
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ))}

        {activeTab === 'GENSET' &&
          (filteredGensets.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title="Tidak ada genset"
              description="Tidak ada unit genset yang cocok dengan filter atau kata kunci pencarian Anda."
            />
          ) : (
            <Table aria-label="Daftar genset reefer">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>ID Unit Genset</TableHeaderCell>
                  <TableHeaderCell>Tipe & Merk Kapasitas</TableHeaderCell>
                  <TableHeaderCell>Hour Meter (Jam)</TableHeaderCell>
                  <TableHeaderCell>Servis Berkala</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell className="text-right">Tindakan</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredGensets.map((genset) => {
                  const nextService =
                    (genset.servisTerakhir || 0) + (genset.intervalServis || 250);
                  const hoursLeft = nextService - genset.jamKerja;
                  return (
                    <TableRow key={genset.idUnit}>
                      <TableCell className="font-mono">
                        <span className="bmi-plate text-xs">{genset.idUnit}</span>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-[#0F172A]">{genset.tipeGenset}</div>
                        <div className="text-xs text-[#475569]">{genset.merkKapasitas}</div>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-[#0F172A] tabular-nums">
                        {genset.jamKerja} Jam
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium text-[#0F172A] font-mono">
                          Target: {nextService} Jam
                        </div>
                        <div className="text-xs text-[#475569]">
                          {hoursLeft > 0 ? `Sisa ${hoursLeft} jam lagi` : 'Jatuh tempo servis'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            genset.statusServis === 'Scheduled' || genset.statusServis === 'In Progress'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {genset.statusServis}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setSelectedAssetForLogbook({
                              id: genset.idUnit,
                              kategori: 'GENSET',
                              spec: `${genset.tipeGenset} · ${genset.merkKapasitas}`,
                              data: genset
                            })
                          }
                        >
                          Logbook
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ))}

        {activeTab === 'BAN' &&
          (filteredTires.length === 0 ? (
            <EmptyState
              icon={CircleDot}
              title="Tidak ada ban"
              description="Tidak ada ban yang cocok dengan filter atau kata kunci pencarian Anda."
            />
          ) : (
            <Table aria-label="Daftar ban armada">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>ID Ban & Kode Siklus</TableHeaderCell>
                  <TableHeaderCell>Ukuran & Merk</TableHeaderCell>
                  <TableHeaderCell>Siklus & DOT</TableHeaderCell>
                  <TableHeaderCell>Unit Terpasang / Posisi</TableHeaderCell>
                  <TableHeaderCell>Status Kelayakan</TableHeaderCell>
                  <TableHeaderCell className="text-right">Tindakan</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTires.map((tire) => (
                  <TableRow key={tire.idBanFisik}>
                    <TableCell className="font-mono">
                      <div className="font-bold text-[#0F172A] text-xs">{tire.idBanFisik}</div>
                      <div className="text-xs text-[#073E7F] font-semibold">
                        Siklus: {tire.idSiklus}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-[#0F172A]">{tire.ukuran}</div>
                      <div className="text-xs text-[#475569]">{tire.merk}</div>
                    </TableCell>
                    <TableCell className="font-mono">
                      <span className="font-bold text-[#0A2547] bg-amber-50 px-1.5 py-0.5 rounded-[6px] border border-amber-200">
                        {tire.siklus}
                      </span>
                      <span className="text-[#475569] text-xs ml-2">DOT {tire.dot}</span>
                    </TableCell>
                    <TableCell className="font-mono">
                      <div className="font-bold text-[#0F172A]">{tire.unitTerpasang}</div>
                      <div className="text-xs text-[#475569]">Posisi: {tire.posisiRoda}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          tire.statusKelayakan === 'Afkir / Dibuang'
                            ? 'danger'
                            : tire.statusKelayakan === 'Aktif Terpasang'
                            ? 'neutral'
                            : 'success'
                        }
                      >
                        {tire.statusKelayakan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setSelectedAssetForLogbook({
                            id: tire.idBanFisik,
                            kategori: 'BAN',
                            spec: `${tire.ukuran} · ${tire.merk} · DOT ${tire.dot}`,
                            data: tire
                          })
                        }
                      >
                        Logbook
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}
      </TableContainer>

      {/* MODAL: Pendaftaran Aset Baru (Auto-Generate ID + Bulk Cart) */}
      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        size="lg"
        title="Formulir Pendaftaran Aset Baru"
        subtitle="Lengkapi spesifikasi aset untuk mendaftarkan unit ke dalam sistem"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowRegisterModal(false)}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={registrationCart.length === 0}
              onClick={handleSaveBulkRegistration}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Simpan pendaftaran ({registrationCart.length} unit)
            </Button>
          </>
        }
      >
        <div className="space-y-4">
              {regError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-700 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#EF4444]" />
                  <span>{regError}</span>
                </div>
              )}

              {/* Live Unit Identity Summary Banner */}
              <div className="bg-[#0A2547] text-white p-4 rounded-[6px] border border-[#073E7F] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#D19F0F] font-bold">
                    NOMOR IDENTITAS UNIT ({regForm.kategori})
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    {regForm.kategori === 'TRUK' &&
                      `Kepemilikan: ${truckPreview.ownerCode} · Jenis: ${regForm.jenis}`}
                    {regForm.kategori === 'CHASSIS' &&
                      `Kepemilikan: ${chassisPreview.ownerCode} · Tipe: ${regForm.jenis}`}
                    {regForm.kategori === 'GENSET' &&
                      `Kategori Genset: ${regForm.jenis}`}
                    {regForm.kategori === 'BAN' &&
                      (banDotPreview.valid
                        ? `Kode Pabrik: ${banDotPreview.plant} · Minggu ${banDotPreview.week} Tahun ${banDotPreview.year}`
                        : banDotPreview.error)}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {regForm.kategori === 'TRUK' && (
                    <span className="bmi-plate text-sm">{truckPreview.noLambung}</span>
                  )}
                  {regForm.kategori === 'CHASSIS' && (
                    <span className="bmi-plate text-sm">{chassisPreview.idUnit}</span>
                  )}
                  {regForm.kategori === 'GENSET' && (
                    <span className="bmi-plate text-sm">{gensetPreview.idUnit}</span>
                  )}
                  {regForm.kategori === 'BAN' &&
                    (banDotPreview.valid ? (
                      <div className="text-right">
                        <span className="bmi-plate text-sm">{banDotPreview.idBanFisik}</span>
                        <div className="text-[10px] font-mono text-[#D19F0F] mt-0.5">
                          Siklus: {banDotPreview.idSiklus}
                        </div>
                      </div>
                    ) : (
                      <span className="px-2.5 py-1 bg-red-600 text-white font-mono font-bold text-xs rounded">
                        DOT TIDAK VALID
                      </span>
                    ))}
                </div>
              </div>

              {/* Input Form Section */}
              <div className="space-y-4 bg-[#F8FAFC] p-4 rounded-[6px] border border-[#E2E8F0] text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Kategori Aset</label>
                    <select
                      value={regForm.kategori}
                      onChange={(e) => {
                        const k = e.target.value as 'TRUK' | 'CHASSIS' | 'GENSET' | 'BAN';
                        setRegError(null);
                        setRegForm({
                          ...regForm,
                          kategori: k,
                          jenis:
                            k === 'TRUK'
                              ? 'Head Truck'
                              : k === 'CHASSIS'
                              ? 'Chassis 40ft (3 Axle)'
                              : k === 'GENSET'
                              ? 'Clip-On'
                              : '1000'
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                    >
                      <option value="TRUK">Armada / Fleet (Truk & Mobil Support)</option>
                      <option value="CHASSIS">Chassis Trailer</option>
                      <option value="GENSET">Genset Reefer</option>
                      <option value="BAN">Ban Gudang</option>
                    </select>
                  </div>

                  {regForm.kategori === 'TRUK' ? (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Nomor Polisi (Nopol Armada) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={regForm.idUnit}
                        onChange={(e) => setRegForm({ ...regForm, idUnit: e.target.value })}
                        placeholder="Contoh: L 9988 UZ"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold uppercase"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        ID Unit Terdaftar
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={
                          regForm.kategori === 'CHASSIS'
                            ? chassisPreview.idUnit
                            : regForm.kategori === 'GENSET'
                            ? gensetPreview.idUnit
                            : banDotPreview.idBanFisik || 'Masukkan DOT Valid'
                        }
                        className="w-full bg-slate-200/70 border border-slate-300 text-slate-700 rounded-lg px-3 py-2 font-mono font-bold cursor-not-allowed"
                      />
                    </div>
                  )}
                </div>

                {/* Ownership for TRUK & CHASSIS */}
                {(regForm.kategori === 'TRUK' || regForm.kategori === 'CHASSIS') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Status Kepemilikan
                      </label>
                      <select
                        value={regForm.milik}
                        onChange={(e) =>
                          setRegForm({ ...regForm, milik: e.target.value as 'BMI' | 'SEWA' })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                      >
                        <option value="BMI">Milik Sendiri (PT BMI)</option>
                        <option value="SEWA">Sewa Vendor Eksternal</option>
                      </select>
                    </div>

                    {regForm.milik === 'SEWA' && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Nama Perusahaan Vendor <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={regForm.vendorName}
                          onChange={(e) => setRegForm({ ...regForm, vendorName: e.target.value })}
                          placeholder="Cth: PT Aminah Logistik"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-medium"
                        />
                      </div>
                    )}
                  </div>
                )}

                {regForm.kategori === 'TRUK' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Jenis Armada
                        </label>
                        <select
                          value={regForm.jenis}
                          onChange={(e) => setRegForm({ ...regForm, jenis: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                        >
                          <option value="Head Truck">Head Truck</option>
                          <option value="Engkel">Engkel</option>
                          <option value="Tronton">Tronton</option>
                          <option value="Dump Truck">Dump Truck</option>
                          <option value="Support">Support (Mobil Biasa / Operasional)</option>
                          <option value="Passenger / MPV">Passenger / MPV (Innova/Zenix/Avanza)</option>
                          <option value="Pick Up">Pick Up / L300</option>
                          <option value="Box">Box</option>
                          <option value="Thermo">Thermo King</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Merk / Model</label>
                        <input
                          type="text"
                          value={regForm.merk}
                          onChange={(e) => setRegForm({ ...regForm, merk: e.target.value })}
                          placeholder="Hino 500 FM 260 JD"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Odometer Awal (KM)
                        </label>
                        <input
                          type="number"
                          value={regForm.odo}
                          onChange={(e) => setRegForm({ ...regForm, odo: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Masa Berlaku STNK
                        </label>
                        <input
                          type="date"
                          value={regForm.stnk}
                          onChange={(e) => setRegForm({ ...regForm, stnk: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Masa Berlaku Pajak
                        </label>
                        <input
                          type="date"
                          value={regForm.pajak}
                          onChange={(e) => setRegForm({ ...regForm, pajak: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>
                    </div>
                  </>
                )}

                {regForm.kategori === 'CHASSIS' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Tipe & Ukuran Chassis
                        </label>
                        <select
                          value={regForm.jenis}
                          onChange={(e) => setRegForm({ ...regForm, jenis: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                        >
                          <option value="Chassis 20ft (2 Axle)">Chassis 20ft — 2 Axle</option>
                          <option value="Chassis 40ft (3 Axle)">Chassis 40ft — 3 Axle</option>
                          <option value="Chassis 40ft High Cube (3 Axle)">
                            Chassis 40ft High Cube — 3 Axle
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Masa Berlaku KIR
                        </label>
                        <input
                          type="date"
                          value={regForm.kir}
                          onChange={(e) => setRegForm({ ...regForm, kir: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Karoseri / Pabrikan
                        </label>
                        <input
                          type="text"
                          value={regForm.karoseri}
                          onChange={(e) => setRegForm({ ...regForm, karoseri: e.target.value })}
                          placeholder="Opsional"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Beban Maksimum / GVW (kg)
                        </label>
                        <input
                          type="number"
                          value={regForm.gvw || ''}
                          onChange={(e) => setRegForm({ ...regForm, gvw: Number(e.target.value) })}
                          placeholder="Opsional"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Nomor Rangka (VIN)
                        </label>
                        <input
                          type="text"
                          value={regForm.vin}
                          onChange={(e) => setRegForm({ ...regForm, vin: e.target.value })}
                          placeholder="Opsional"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono"
                        />
                      </div>
                    </div>
                  </>
                )}

                {regForm.kategori === 'GENSET' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Tipe Genset
                      </label>
                      <select
                        value={regForm.jenis}
                        onChange={(e) => setRegForm({ ...regForm, jenis: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                      >
                        <option value="Clip-On">Clip-On Genset</option>
                        <option value="Underslung">Underslung Genset</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Merk & Kapasitas kVA
                      </label>
                      <input
                        type="text"
                        value={regForm.merk}
                        onChange={(e) => setRegForm({ ...regForm, merk: e.target.value })}
                        placeholder="Thermo King SG-3000 (15 kVA)"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Hour Meter Awal (Jam)
                      </label>
                      <input
                        type="number"
                        value={regForm.odo}
                        onChange={(e) => setRegForm({ ...regForm, odo: Number(e.target.value) })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono"
                      />
                    </div>
                  </div>
                )}

                {regForm.kategori === 'BAN' && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Kode Produksi (DOT) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={regForm.dot}
                        onChange={(e) => setRegForm({ ...regForm, dot: e.target.value })}
                        placeholder="1NL2925"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold uppercase"
                      />
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        Contoh: 1NL2925
                      </span>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Siklus Ban</label>
                      <select
                        value={regForm.siklus}
                        onChange={(e) =>
                          setRegForm({
                            ...regForm,
                            siklus: e.target.value as 'R0' | 'R1' | 'R2' | 'RJ'
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold"
                      >
                        <option value="R0">R0 (Ban Baru Orisinil)</option>
                        <option value="R1">R1 (Vulkanisir Ke-1)</option>
                        <option value="R2">R2 (Vulkanisir Ke-2)</option>
                        <option value="RJ">RJ (Jasa Vulkanisir)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Ukuran Ban</label>
                      <select
                        value={regForm.jenis}
                        onChange={(e) => setRegForm({ ...regForm, jenis: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                      >
                        <option value="1000">1000 (10.00 R20)</option>
                        <option value="11.00 R20">11.00 R20</option>
                        <option value="750">750 (7.50 R16)</option>
                        <option value="R14">R14</option>
                        <option value="R16">R16</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Merk Ban</label>
                      <input
                        type="text"
                        value={regForm.merk}
                        onChange={(e) => setRegForm({ ...regForm, merk: e.target.value })}
                        placeholder="Bridgestone / Gajah Tunggal"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleAddToCart}
                  >
                    + Tambah ke antrean
                  </Button>
                </div>
              </div>

              {/* Cart Preview List */}
              <div>
                <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                  <span>
                    Daftar Aset Siap Disimpan ({registrationCart.length} Unit)
                  </span>
                  {registrationCart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRegistrationCart([])}
                      className="text-xs text-red-600 hover:underline font-semibold cursor-pointer"
                    >
                      Kosongkan daftar
                    </button>
                  )}
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-[6px]">
                  {registrationCart.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Belum ada unit dalam daftar pendaftaran. Isi formulir di atas lalu klik
                      &quot;Tambah ke antrean&quot;.
                    </div>
                  ) : (
                    registrationCart.map((item, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="bmi-plate text-xs">{item.idUnit}</span>
                          {item.noLambung && (
                            <span className="font-mono font-bold text-[#073E7F] bg-blue-50 px-2 py-0.5 rounded-[6px] border border-blue-200">
                              Lambung: {item.noLambung}
                            </span>
                          )}
                          {item.idSiklus && (
                            <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-[6px] border border-amber-200">
                              Siklus: {item.idSiklus}
                            </span>
                          )}
                          <span className="text-slate-600 font-medium">
                            {item.kategori} · {item.jenis} · {item.merk || '-'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setRegistrationCart(registrationCart.filter((_, i) => i !== idx))
                          }
                          aria-label="Hapus antrean"
                          className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
      </Modal>

      {/* MODAL: Logbook Detail, Multi-Log Aggregation & Downtime Analysis */}
      {selectedAssetForLogbook && (() => {
        const cleanId = (s?: string | null) => (s || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
        const targetId = cleanId(selectedAssetForLogbook.id);
        const targetLambung = cleanId(selectedAssetForLogbook.data?.noLambung);
        const targetUnit = cleanId(selectedAssetForLogbook.data?.idUnit);
        const targetBanFisik = cleanId(selectedAssetForLogbook.data?.idBanFisik);
        const targetSiklus = cleanId(selectedAssetForLogbook.data?.idSiklus);

        const matchesSelectedAsset = (val?: string | null) => {
          if (!val) return false;
          const needle = cleanId(val);
          if (!needle) return false;
          if (needle === targetId) return true;
          if (targetLambung && needle === targetLambung) return true;
          if (targetUnit && needle === targetUnit) return true;
          if (targetBanFisik && needle === targetBanFisik) return true;
          if (targetSiklus && needle === targetSiklus) return true;
          return false;
        };

        // 1. Aggregated logs across all operational systems
        const logbookWOs = state.workOrders.filter((wo) => matchesSelectedAsset(wo.idUnit));

        const logbookIncidents = state.incidents.filter((inc) => matchesSelectedAsset(inc.idUnit));

        const logbookParts = state.partRequests.filter(
          (p) =>
            matchesSelectedAsset(p.nopol) ||
            matchesSelectedAsset(p.noLambung) ||
            logbookWOs.some((w) => w.woId === p.woId)
        );

        const logbookTires =
          selectedAssetForLogbook.kategori === 'BAN'
            ? state.tires.filter(
                (t) =>
                  t.idBanFisik === selectedAssetForLogbook.id ||
                  t.idSiklus === selectedAssetForLogbook.data?.idSiklus
              )
            : state.tires.filter((t) => matchesSelectedAsset(t.unitTerpasang));

        // 2. Incident downtime parser
        const parseIncDowntimeDays = (durasi?: string | number): number => {
          if (typeof durasi === 'number') return durasi;
          if (!durasi) return 0;
          const s = String(durasi).toLowerCase().trim();
          const num = parseFloat(s.replace(/[^0-9.]/g, ''));
          if (isNaN(num)) return 0;
          if (s.includes('jam') || s.includes('hour') || s.includes('hr')) return num / 24;
          return num;
        };

        // 3. Determine Registration Date
        const candidateDate =
          selectedAssetForLogbook.data?.tglMulai || selectedAssetForLogbook.data?.tglMasuk;
        let initialDate: Date | null = null;
        let isEstimatedReg = false;

        if (candidateDate) {
          const parsed = new Date(candidateDate);
          if (!isNaN(parsed.getTime())) initialDate = parsed;
        }

        if (!initialDate) {
          const timestamps: number[] = [];
          logbookWOs.forEach((wo) => {
            const d = new Date(wo.tglRencana || wo.tMulai || wo.tArrived || '');
            if (!isNaN(d.getTime())) timestamps.push(d.getTime());
          });
          logbookIncidents.forEach((inc) => {
            const d = new Date(inc.tgl || inc.waktuMulai || '');
            if (!isNaN(d.getTime())) timestamps.push(d.getTime());
          });
          logbookParts.forEach((p) => {
            const d = new Date(p.ts || '');
            if (!isNaN(d.getTime())) timestamps.push(d.getTime());
          });
          if (timestamps.length > 0) {
            initialDate = new Date(Math.min(...timestamps));
          } else {
            initialDate = new Date('2026-08-01');
            isEstimatedReg = true;
          }
        }

        const now = new Date();
        const diffMs = Math.max(0, now.getTime() - initialDate.getTime());
        const daysSinceRegistration = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        const regDateStr = initialDate.toISOString().split('T')[0];

        // 4. Inactive duration / Cumulative Downtime
        const woDowntimeDays = logbookWOs.reduce((sum, wo) => sum + (Number(wo.downtime) || 0), 0);
        const incDowntimeDays = logbookIncidents.reduce(
          (sum, inc) => sum + parseIncDowntimeDays(inc.durasiDowntime),
          0
        );

        const isCurrentlyServicing =
          selectedAssetForLogbook.data?.statusServis === 'In Progress' ||
          selectedAssetForLogbook.data?.statusServis === 'Scheduled' ||
          selectedAssetForLogbook.data?.statusServis === 'Arrived';

        const activeServiceDays =
          isCurrentlyServicing &&
          logbookWOs.some(
            (w) => w.status !== 'COMPLETED & RELEASED' && w.status !== 'CANCELLED'
          )
            ? 0.5
            : 0;

        // Logika Baru Downtime Gudang: Terdaftar dan masuk gudang, selama tidak digunakan dalam truk/mobil
        let warehouseDowntimeDays = 0;
        let isCurrentlyInWarehouse = false;

        if (selectedAssetForLogbook.kategori === 'BAN') {
          const tireData = selectedAssetForLogbook.data;
          const unitUpper = String(tireData?.unitTerpasang || '').toUpperCase();
          const posUpper = String(tireData?.posisiRoda || '').toUpperCase();
          const statusKel = tireData?.statusKelayakan;

          isCurrentlyInWarehouse =
            statusKel === 'Spare / Gudang' ||
            statusKel === 'Afkir / Dibuang' ||
            unitUpper.includes('GUDANG') ||
            unitUpper.includes('BENGKEL') ||
            unitUpper.includes('STORAGE') ||
            unitUpper.includes('VENDOR') ||
            posUpper === 'GUDANG' ||
            posUpper === 'BENGKEL' ||
            !unitUpper;

          if (isCurrentlyInWarehouse) {
            // Selama ban berada di gudang / tidak terpasang di armada truk/mobil: downtime penuh sejak terdaftar
            warehouseDowntimeDays = daysSinceRegistration;
          } else {
            // Jika ban saat ini aktif terpasang di truk/mobil, hitung masa mengendap di gudang sebelum dipasang
            const tglMasukStr = tireData?.tglMasuk;
            if (tglMasukStr) {
              const masukDate = new Date(tglMasukStr);
              let pasangDate: Date | null = null;
              const matchDate = String(tireData?.catatanKondisi || '').match(/\d{4}-\d{2}-\d{2}/);
              if (matchDate) {
                pasangDate = new Date(matchDate[0]);
              } else if (logbookWOs.length > 0) {
                const woDates = logbookWOs
                  .map((w) => new Date(w.tglRencana || w.tMulai || ''))
                  .filter((d) => !isNaN(d.getTime()));
                if (woDates.length > 0) {
                  pasangDate = new Date(Math.min(...woDates.map((d) => d.getTime())));
                }
              }

              if (pasangDate && !isNaN(pasangDate.getTime()) && !isNaN(masukDate.getTime())) {
                const diffGudangMs = Math.max(0, pasangDate.getTime() - masukDate.getTime());
                warehouseDowntimeDays = Math.floor(diffGudangMs / (1000 * 60 * 60 * 24));
              }
            }
          }
        } else if (
          selectedAssetForLogbook.kategori === 'CHASSIS' ||
          selectedAssetForLogbook.kategori === 'GENSET'
        ) {
          const st = String(selectedAssetForLogbook.data?.statusServis || '').toUpperCase();
          if (st === 'AFKIR' || st === 'GUDANG' || st === 'STANDBY') {
            warehouseDowntimeDays = daysSinceRegistration;
            isCurrentlyInWarehouse = true;
          }
        }

        const totalDowntimeDays = Number(
          Math.min(
            daysSinceRegistration,
            woDowntimeDays + incDowntimeDays + activeServiceDays + warehouseDowntimeDays
          ).toFixed(1)
        );
        const totalDowntimeHours = Math.round(totalDowntimeDays * 24);
        const totalUptimeDays = Math.max(
          0,
          Number((daysSinceRegistration - totalDowntimeDays).toFixed(1))
        );
        const availabilityRate = Math.min(
          100,
          Math.max(
            0,
            Number(((totalUptimeDays / daysSinceRegistration) * 100).toFixed(1))
          )
        );
        const totalDowntimeEvents = logbookWOs.length + logbookIncidents.length;
        const mttrDays =
          totalDowntimeEvents > 0 ? (totalDowntimeDays / totalDowntimeEvents).toFixed(1) : '0.0';
        const totalPartCost = logbookParts.reduce(
          (sum, p) => sum + (p.total || p.qty * p.hargaSatuan || 0),
          0
        );

        // 5. Unified Chronological Audit Trail
        interface AuditTrailItem {
          id: string;
          date: string;
          type: 'REG' | 'WO' | 'INC' | 'PART' | 'TIRE';
          title: string;
          subtitle: string;
          details: string;
          downtimeBadge?: string;
          badgeColor: string;
        }

        const auditTrail: AuditTrailItem[] = [
          {
            id: 'reg-item',
            date: regDateStr,
            type: 'REG',
            title: 'Unit Terdaftar di Sistem Operasional Bengkel',
            subtitle: `${selectedAssetForLogbook.kategori} · ${selectedAssetForLogbook.spec}`,
            details: `Awal mula pencatatan aset armada ke dalam sistem bengkel. Total masa terdaftar: ${daysSinceRegistration} hari kalender.`,
            downtimeBadge: isEstimatedReg ? 'Estimasi Sistem' : 'Tgl Terverifikasi',
            badgeColor: 'bg-blue-100 text-[#073E7F]'
          }
        ];

        logbookWOs.forEach((wo) => {
          const dt = Number(wo.downtime) || 0;
          auditTrail.push({
            id: `wo-${wo.woId}`,
            date: wo.tglRencana || wo.tMulai || regDateStr,
            type: 'WO',
            title: `Work Order: ${wo.jenisServis}`,
            subtitle: `${wo.woId} · Teknisi: ${wo.teknisi} · Bay: ${wo.bay}`,
            details: `Keluhan: ${wo.keluhan || '-'} | Prioritas: ${wo.prioritas} | Status: ${wo.status}`,
            downtimeBadge: `Downtime ${dt.toFixed(1)} Hari`,
            badgeColor: dt > 1 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'
          });
        });

        logbookIncidents.forEach((inc) => {
          const dt = parseIncDowntimeDays(inc.durasiDowntime);
          auditTrail.push({
            id: `inc-${inc.idLaka}`,
            date: inc.tgl || inc.waktuMulai || regDateStr,
            type: 'INC',
            title: `Laporan Insiden: ${inc.kategoriKendala || 'Kendala Operasional'}`,
            subtitle: `${inc.idLaka} · Lokasi: ${inc.lokasi} · Supir: ${inc.supir}`,
            details: `${inc.kronologi} | Mitigasi: ${inc.tindakanMitigasi || '-'} | Status: ${inc.status}`,
            downtimeBadge: `Masa Tidak Aktif ${dt > 0 ? `${(dt * 24).toFixed(0)} Jam` : 'Siaga'}`,
            badgeColor: 'bg-red-100 text-red-800'
          });
        });

        logbookParts.forEach((p) => {
          auditTrail.push({
            id: `part-${p.txId}`,
            date: (p.ts || '').split(' ')[0] || regDateStr,
            type: 'PART',
            title: `Penggantian Suku Cadang: ${p.namaPart}`,
            subtitle: `SKU: ${p.sku} · Qty: ${p.qty} · WO Ref: ${p.woId || '-'}`,
            details: `Mekanik: ${p.mekanik} | Total: Rp ${(p.total || p.qty * p.hargaSatuan).toLocaleString('id-ID')} | Status: ${p.status}`,
            downtimeBadge: `Rp ${(p.total || p.qty * p.hargaSatuan).toLocaleString('id-ID')}`,
            badgeColor: 'bg-emerald-100 text-emerald-800'
          });
        });

        if (warehouseDowntimeDays > 0) {
          auditTrail.push({
            id: 'warehouse-downtime-item',
            date: regDateStr,
            type: 'REG',
            title: isCurrentlyInWarehouse
              ? 'Masa Mengendap di Gudang (Downtime Berjalan)'
              : 'Masa Mengendap di Gudang Sebelum Terpasang',
            subtitle: `Status: ${selectedAssetForLogbook.data?.statusKelayakan || selectedAssetForLogbook.data?.statusServis || 'Gudang'} · Posisi: ${selectedAssetForLogbook.data?.unitTerpasang || 'Gudang/Bengkel'}`,
            details: `Aset berada di gudang selama ${warehouseDowntimeDays} hari tanpa terpasang pada armada truk/mobil. Sesuai aturan operasional bengkel, masa ini dihitung penuh sebagai masa tidak aktif (downtime).`,
            downtimeBadge: `Downtime Gudang ${warehouseDowntimeDays} Hari`,
            badgeColor: 'bg-amber-100 text-amber-900 border border-amber-300'
          });
        }

        auditTrail.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        const handleCopyLogbookReport = () => {
          const lines = [
            `📋 *RINGKASAN LOGBOOK & AUDIT ASET BMI*`,
            `*Unit*: ${selectedAssetForLogbook.id} (${selectedAssetForLogbook.kategori})`,
            `*Spesifikasi*: ${selectedAssetForLogbook.spec}`,
            `*Status Operasional*: ${selectedAssetForLogbook.data?.statusServis || selectedAssetForLogbook.data?.statusKelayakan || 'Aktif'}`,
            `------------------------------------------`,
            `⏱ *ANALISIS DOWNTIME & MASA TIDAK AKTIF*`,
            `• Terdaftar Sejak: ${regDateStr} (${daysSinceRegistration} Hari Terpantau)`,
            `• Masa Tidak Aktif (Downtime): ${totalDowntimeDays} Hari (${totalDowntimeHours} Jam)`,
            ...(warehouseDowntimeDays > 0 ? [`  - Downtime Gudang (Tidak di Truk): ${warehouseDowntimeDays} Hari`] : []),
            ...(woDowntimeDays > 0 ? [`  - Downtime Servis Work Order: ${woDowntimeDays.toFixed(1)} Hari`] : []),
            ...(incDowntimeDays > 0 ? [`  - Downtime Insiden Kendala: ${incDowntimeDays.toFixed(1)} Hari`] : []),
            `• Masa Aktif Operasional (Uptime): ${totalUptimeDays} Hari`,
            `• Rasio Ketersediaan Armada: ${availabilityRate}%`,
            `• Frekuensi Kejadian Servis/Insiden: ${totalDowntimeEvents} Kali`,
            `• Rata-rata Durasi Perbaikan (MTTR): ${mttrDays} Hari/Kejadian`,
            `• Total Biaya Suku Cadang: Rp ${totalPartCost.toLocaleString('id-ID')}`,
            `------------------------------------------`,
            `🔍 *REKAP DARI SELURUH LOG*`,
            `• Work Orders: ${logbookWOs.length} Tiket Servis`,
            `• Insiden & Kendala: ${logbookIncidents.length} Laporan`,
            `• Suku Cadang Terpasang: ${logbookParts.length} Transaksi`,
            `• Ban Terkait: ${logbookTires.length} Unit`,
            `------------------------------------------`,
            `_Dicetak otomatis oleh Sistem Manajemen Bengkel BMI_`
          ];
          const reportText = buildBmiWhatsAppReport(
            `Ringkasan Audit Logbook & Downtime ${selectedAssetForLogbook.id}`,
            'Pool Surabaya (SBY)',
            currentUser?.nama || 'Supervisor Bengkel',
            lines,
            `LOG-${selectedAssetForLogbook.kategori}-${selectedAssetForLogbook.id}`
          );
          navigator.clipboard.writeText(reportText);
          triggerReportToast({
            title: `Audit Logbook ${selectedAssetForLogbook.id}`,
            text: reportText
          });
        };

        return (
          <Modal
            isOpen={Boolean(selectedAssetForLogbook)}
            onClose={() => {
              setSelectedAssetForLogbook(null);
              setConfirmAfkirId(null);
            }}
            size="xl"
            title={`Logbook Unit: ${selectedAssetForLogbook.id}`}
            subtitle={`${selectedAssetForLogbook.kategori} · ${selectedAssetForLogbook.spec}`}
            footer={
              <div className="w-full flex items-center justify-between">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmAfkirId(selectedAssetForLogbook.id)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Nonaktifkan unit
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyLogbookReport}
                  >
                    <Share2 className="w-4 h-4 mr-1.5" />
                    Salin laporan
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setSelectedAssetForLogbook(null);
                      setConfirmAfkirId(null);
                    }}
                  >
                    Tutup logbook
                  </Button>
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Unit identity banner */}
              <div className="bg-[#0A2547] text-white p-3 rounded-[6px] border border-[#073E7F] flex items-center justify-between gap-3 text-xs">
                <div>
                  Terdaftar sejak <strong className="text-[#D19F0F]">{regDateStr}</strong> ({daysSinceRegistration} hari kalender)
                </div>
                <div className="font-semibold text-emerald-400">
                  Status: {selectedAssetForLogbook.data?.statusServis || selectedAssetForLogbook.data?.statusKelayakan || 'Aktif'}
                </div>
              </div>

              {/* KPI Metrics Dashboard Bar */}
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] p-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>Masa Terdaftar</span>
                    </div>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      {daysSinceRegistration}{' '}
                      <span className="text-[11px] font-normal text-slate-500">Hari</span>
                    </div>
                    <div className="text-[10px] text-slate-400">Sejak awal registrasi</div>
                  </div>

                  <div className="bg-white border border-amber-200/80 rounded-lg p-2.5 shadow-2xs bg-amber-50/20">
                    <div className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>Masa Tidak Aktif</span>
                    </div>
                    <div className="text-lg font-bold font-mono text-amber-700 mt-0.5">
                      {totalDowntimeDays}{' '}
                      <span className="text-[11px] font-normal text-amber-900">Hari</span>
                    </div>
                    <div className="text-[10px] text-amber-800 font-mono">
                      {totalDowntimeHours} Jam ({warehouseDowntimeDays > 0 ? `Gudang ${warehouseDowntimeDays}h · ` : ''}{totalDowntimeEvents} insiden/servis)
                    </div>
                  </div>

                  <div className="bg-white border border-emerald-200/80 rounded-lg p-2.5 shadow-2xs bg-emerald-50/20">
                    <div className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wide flex items-center gap-1">
                      <Activity className="w-3 h-3 text-emerald-600" />
                      <span>Masa Aktif (Uptime)</span>
                    </div>
                    <div className="text-lg font-bold font-mono text-emerald-700 mt-0.5">
                      {totalUptimeDays}{' '}
                      <span className="text-[11px] font-normal text-emerald-900">Hari</span>
                    </div>
                    <div className="text-[10px] text-emerald-800">Operasional produktif</div>
                  </div>

                  <div className="bg-white border border-blue-200/80 rounded-lg p-2.5 shadow-2xs bg-blue-50/20">
                    <div className="text-[10px] font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-blue-600" />
                      <span>Ketersediaan (Uptime)</span>
                    </div>
                    <div className="text-lg font-bold font-mono text-[#073E7F] mt-0.5">
                      {availabilityRate}%
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full ${
                          availabilityRate >= 95
                            ? 'bg-[#10B981]'
                            : availabilityRate >= 85
                            ? 'bg-[#D19F0F]'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${availabilityRate}%` }}
                      />
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs col-span-2 sm:col-span-1">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Package className="w-3 h-3 text-slate-400" />
                      <span>Total Biaya Part</span>
                    </div>
                    <div className="text-sm font-bold font-mono text-slate-900 mt-0.5 truncate">
                      Rp {totalPartCost.toLocaleString('id-ID')}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      MTTR: {mttrDays} hari/servis
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-Tabs Navigation */}
              <div className="border-b border-slate-200 px-5 sm:px-6 bg-white flex items-center gap-1 overflow-x-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setLogbookTab('AUDIT')}
                  className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    logbookTab === 'AUDIT'
                      ? 'border-[#0A2547] text-[#0A2547]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Audit Trail Seluruh Log</span>
                  <span className="ml-1 px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] rounded-full font-mono">
                    {auditTrail.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLogbookTab('WO')}
                  className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    logbookTab === 'WO'
                      ? 'border-[#0A2547] text-[#0A2547]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Riwayat Work Order</span>
                  <span className="ml-1 px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] rounded-full font-mono">
                    {logbookWOs.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLogbookTab('INCIDENTS')}
                  className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    logbookTab === 'INCIDENTS'
                      ? 'border-[#0A2547] text-[#0A2547]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Laporan Insiden & Kerusakan</span>
                  <span className="ml-1 px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] rounded-full font-mono">
                    {logbookIncidents.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLogbookTab('PARTS')}
                  className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    logbookTab === 'PARTS'
                      ? 'border-[#0A2547] text-[#0A2547]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Pemakaian Part & Oli</span>
                  <span className="ml-1 px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] rounded-full font-mono">
                    {logbookParts.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLogbookTab('COMPONENTS')}
                  className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    logbookTab === 'COMPONENTS'
                      ? 'border-[#0A2547] text-[#0A2547]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>Status Komponen & Ban</span>
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-slate-50/50">
                {/* TAB 1: AUDIT TRAIL FROM ALL LOGS */}
                {logbookTab === 'AUDIT' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50/60 border border-blue-200/60 rounded-lg p-3 text-xs text-blue-900 flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-[#073E7F] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-slate-900">
                          Audit Trail Terpadu Seluruh Aktivitas Armada
                        </div>
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          Menghimpun seluruh catatan riwayat dari Sheet TRK/CHA/GNZ/BAN, Work Order, Laporan Insiden, dan Pengeluaran Part sejak unit pertama kali terdaftar hingga saat ini.
                        </div>
                      </div>
                    </div>

                    <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                      {auditTrail.map((item) => (
                        <div key={item.id} className="relative bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs">
                          {/* Dot on timeline line */}
                          <div
                            className={`absolute -left-[19px] top-4 w-3 h-3 rounded-full border-2 border-white ${
                              item.type === 'REG'
                                ? 'bg-blue-600'
                                : item.type === 'WO'
                                ? 'bg-[#0A2547]'
                                : item.type === 'INC'
                                ? 'bg-red-500'
                                : 'bg-emerald-600'
                            }`}
                          />
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                  {item.date}
                                </span>
                                <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                              </div>
                              <div className="text-[11px] font-medium text-slate-600 mt-1">
                                {item.subtitle}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1">{item.details}</div>
                            </div>
                            {item.downtimeBadge && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono shrink-0 ${item.badgeColor}`}
                              >
                                {item.downtimeBadge}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 2: WORK ORDERS */}
                {logbookTab === 'WO' && (
                  <div>
                    {logbookWOs.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-xs text-slate-400">
                        Belum ada riwayat pengerjaan work order servis untuk unit ini.
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-[#F1F5F9] border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3">ID Tiket WO</th>
                              <th className="py-2.5 px-3">Tgl & Bay</th>
                              <th className="py-2.5 px-3">Jenis Servis & Keluhan</th>
                              <th className="py-2.5 px-3">Teknisi (PIC)</th>
                              <th className="py-2.5 px-3">Masa Downtime</th>
                              <th className="py-2.5 px-3 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {logbookWOs.map((wo) => {
                              const dt = Number(wo.downtime) || 0;
                              return (
                                <tr key={wo.woId} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-3 px-3 font-mono font-bold text-[#073E7F]">
                                    {wo.woId}
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="font-mono text-slate-800">{wo.tglRencana}</div>
                                    <div className="text-[10px] text-slate-400">{wo.bay}</div>
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="font-semibold text-slate-900">{wo.jenisServis}</div>
                                    <div className="text-[11px] text-slate-500 max-w-xs truncate">
                                      {wo.keluhan || '-'}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 font-medium text-slate-700">
                                    {wo.teknisi}
                                  </td>
                                  <td className="py-3 px-3 font-mono font-bold text-amber-700">
                                    {dt.toFixed(1)} Hari
                                    <div className="text-[10px] font-normal text-slate-400">
                                      {Math.round(dt * 24)} Jam
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-right">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                        wo.status === 'COMPLETED & RELEASED'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : wo.status === 'IN PROGRESS'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {wo.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: INCIDENTS & BREAKDOWN */}
                {logbookTab === 'INCIDENTS' && (
                  <div>
                    {logbookIncidents.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-xs text-slate-400">
                        Tidak ada laporan kendala insiden atau breakdown tercatat untuk unit ini.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {logbookIncidents.map((inc) => {
                          const dt = parseIncDowntimeDays(inc.durasiDowntime);
                          return (
                            <div
                              key={inc.idLaka}
                              className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs hover:border-slate-300 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                      {inc.idLaka}
                                    </span>
                                    <span className="text-xs font-bold text-slate-900">
                                      {inc.kategoriKendala || 'Insiden Jalan Raya'}
                                    </span>
                                    <span className="text-[11px] font-mono text-slate-500">
                                      {inc.tgl}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-700 mt-2 font-medium">
                                    Lokasi: <span className="text-slate-900 font-bold">{inc.lokasi}</span> · Supir: {inc.supir}
                                  </div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    {inc.kronologi}
                                  </div>
                                  {inc.tindakanMitigasi && (
                                    <div className="text-[11px] text-emerald-800 bg-emerald-50/60 border border-emerald-200/60 rounded p-2 mt-2">
                                      <strong>Tindakan Mitigasi Bengkel:</strong> {inc.tindakanMitigasi}
                                    </div>
                                  )}
                                </div>

                                <div className="text-right shrink-0">
                                  <div className="text-xs font-mono font-bold text-amber-700">
                                    Masa Tidak Aktif: {dt > 0 ? `${(dt * 24).toFixed(0)} Jam` : '-'}
                                  </div>
                                  <div className="text-xs font-mono text-slate-600 mt-0.5">
                                    Kerugian: Rp {(inc.kerugian || 0).toLocaleString('id-ID')}
                                  </div>
                                  <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-100 text-slate-700">
                                    {inc.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: PARTS CONSUMPTION */}
                {logbookTab === 'PARTS' && (
                  <div>
                    {logbookParts.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-xs text-slate-400">
                        Belum ada catatan pemakaian suku cadang atau penggantian oli untuk unit ini.
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-[#F1F5F9] border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3">Tanggal</th>
                              <th className="py-2.5 px-3">SKU & Suku Cadang</th>
                              <th className="py-2.5 px-3">Jumlah</th>
                              <th className="py-2.5 px-3">Harga Satuan</th>
                              <th className="py-2.5 px-3">Total Biaya</th>
                              <th className="py-2.5 px-3">Mekanik / WO</th>
                              <th className="py-2.5 px-3 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {logbookParts.map((p) => {
                              const total = p.total || p.qty * p.hargaSatuan;
                              return (
                                <tr key={p.txId} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-3 px-3 font-mono text-slate-600">
                                    {(p.ts || '').split(' ')[0]}
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="font-bold text-slate-900">{p.namaPart}</div>
                                    <div className="text-[10px] font-mono text-slate-400">{p.sku}</div>
                                  </td>
                                  <td className="py-3 px-3 font-mono font-medium">{p.qty}</td>
                                  <td className="py-3 px-3 font-mono text-slate-600">
                                    Rp {p.hargaSatuan.toLocaleString('id-ID')}
                                  </td>
                                  <td className="py-3 px-3 font-mono font-bold text-slate-900">
                                    Rp {total.toLocaleString('id-ID')}
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="font-medium text-slate-800">{p.mekanik}</div>
                                    <div className="text-[10px] font-mono text-[#073E7F]">{p.woId || '-'}</div>
                                  </td>
                                  <td className="py-3 px-3 text-right">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                        p.status === 'Approved'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {p.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 5: COMPONENTS & TIRES */}
                {logbookTab === 'COMPONENTS' && (
                  <div className="space-y-5">
                    {/* If TRUCK: Evaluation of Parameters */}
                    {selectedAssetForLogbook.kategori === 'TRUK' && (
                      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                        <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                          <Gauge className="w-4 h-4 text-[#073E7F]" />
                          <span>Status Masa Pakai Komponen Utama & Pelumas Mesin</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {evaluateTruckComponents(
                            selectedAssetForLogbook.data,
                            state.maintenanceParameters,
                            state.componentLogs
                          ).map((comp) => (
                            <div
                              key={comp.parameter.id}
                              className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2"
                            >
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {comp.parameter.kodePm && (
                                    <span className="font-mono text-xs font-bold text-[#073E7F]">
                                      {comp.parameter.kodePm}
                                    </span>
                                  )}
                                  <span className="font-bold text-xs text-slate-900">
                                    {comp.parameter.komponen}
                                  </span>
                                  {comp.parameter.urgensi && (
                                    <Badge
                                      variant={
                                        comp.parameter.urgensi === 'Kritis'
                                          ? 'danger'
                                          : comp.parameter.urgensi === 'Penting'
                                          ? 'warning'
                                          : 'neutral'
                                      }
                                    >
                                      {comp.parameter.urgensi}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                  Jatuh tempo: {comp.kmJatuhTempo.toLocaleString('id-ID')} KM · Interval{' '}
                                  {comp.parameter.intervalKm.toLocaleString('id-ID')} KM
                                  {comp.tglTerakhirGanti && ` · Ganti: ${comp.tglTerakhirGanti}`}
                                </div>
                                {comp.sumberData === 'ESTIMASI' && (
                                  <div className="text-[10px] text-slate-400">
                                    Dihitung dari servis rutin terakhir
                                  </div>
                                )}
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono shrink-0 ${
                                  comp.status === 'OVERDUE'
                                    ? 'bg-red-100 text-red-700'
                                    : comp.status === 'DUE_SOON'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {comp.status === 'OVERDUE'
                                  ? `Lewat ${Math.abs(comp.sisaKm).toLocaleString('id-ID')} KM`
                                  : comp.status === 'DUE_SOON'
                                  ? `Sisa ${comp.sisaKm.toLocaleString('id-ID')} KM`
                                  : 'Optimal'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tires mounted on this unit */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                      <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                        <CircleDot className="w-4 h-4 text-[#073E7F]" />
                        <span>
                          {selectedAssetForLogbook.kategori === 'BAN'
                            ? 'Informasi Siklus & Fisik Ban'
                            : `Daftar Ban Terpasang pada Unit (${logbookTires.length} Roda)`}
                        </span>
                      </h4>

                      {logbookTires.length === 0 ? (
                        <div className="text-xs text-slate-400 text-center py-4">
                          Belum ada data ban yang terpetakan aktif pada unit ini.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {logbookTires.map((tire) => (
                            <div
                              key={tire.idSiklus}
                              className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between"
                            >
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-xs text-[#073E7F]">
                                    {tire.idBanFisik}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 font-mono font-bold text-slate-700">
                                    {tire.siklus}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500">
                                    DOT {tire.dot}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-600 mt-1">
                                  {tire.merk} · {tire.ukuran} · Posisi: <strong className="text-slate-900">{tire.posisiRoda}</strong>
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                  tire.statusKelayakan === 'Aktif Terpasang'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {tire.statusKelayakan}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Confirmation Dialog for Afkir Asset */}
      <ConfirmDialog
        isOpen={Boolean(confirmAfkirId)}
        onClose={() => setConfirmAfkirId(null)}
        onConfirm={() => {
          if (selectedAssetForLogbook) {
            afkirAsset(selectedAssetForLogbook.id, selectedAssetForLogbook.kategori);
            setConfirmAfkirId(null);
            setSelectedAssetForLogbook(null);
          }
        }}
        title="Nonaktifkan unit armada"
        message={`Apakah Anda yakin ingin menonaktifkan unit ${selectedAssetForLogbook?.id}? Status unit akan diubah menjadi afkir.`}
        confirmLabel="Ya, nonaktifkan"
        cancelLabel="Batal"
        variant="danger"
      />
    </div>
  );
};
