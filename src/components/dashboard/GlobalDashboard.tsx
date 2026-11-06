import React, { useState } from 'react';
import {
  TrendingUp,
  Clock,
  Wrench,
  AlertTriangle,
  DollarSign,
  Truck,
  Layers,
  CircleDot,
  Calendar,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  Gauge,
  CheckCircle2,
  Package,
  X,
  Filter,
  LayoutGrid,
  Droplet,
  Disc,
  Fan,
  Activity,
  Loader2,
  Download
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import { TruckAsset, ComponentHealthStatus } from '../../types';
import { evaluateTruckComponents } from '../../services/maintenanceEngine';
import { isWarehouseTire, isReadyWarehouseTire } from '../../services/liveSheetSync';
import { ExportCsvModal } from '../common/ExportCsvModal';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Badge,
  Modal,
  TableContainer,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  toast
} from '../ui';

interface GlobalDashboardProps {
  onNavigateToTab: (tabId: string) => void;
}

export const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ onNavigateToTab }) => {
  const { state, createAutoWorkOrderFromPm, requestSparepart } = useWorkshopStore();
  const [timeframe, setTimeframe] = useState<'6M' | '12M'>('6M');

  // Popup Modal Detail Unit
  const [selectedTruckForPm, setSelectedTruckForPm] = useState<TruckAsset | null>(null);
  const [isPmModalLoading, setIsPmModalLoading] = useState<boolean>(false);
  const [loadingActionKey, setLoadingActionKey] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Filter Keausan Komponen di Modal
  const [componentStatusFilter, setComponentStatusFilter] = useState<
    'ALL' | 'ATTENTION' | 'OVERDUE' | 'DUE_SOON' | 'SAFE'
  >('ALL');
  const [componentCategoryFilter, setComponentCategoryFilter] = useState<string>('ALL');

  // Filter Tabel Armada
  const [fleetSearchQuery, setFleetSearchQuery] = useState<string>('');
  const [fleetRowFilter, setFleetRowFilter] = useState<'ALL' | 'ATTENTION' | 'SAFE'>('ALL');

  // Truk Aktif
  const activeTrucks = state.trucks.filter((t) => t.statusServis !== 'AFKIR');

  // Ringkasan Keausan Seluruh Armada
  let fleetTotalOverdueComponents = 0;
  let fleetTotalDueSoonComponents = 0;
  let fleetTotalSafeComponents = 0;

  activeTrucks.forEach((t) => {
    const comps = evaluateTruckComponents(t, state.maintenanceParameters);
    comps.forEach((c) => {
      if (c.status === 'OVERDUE') fleetTotalOverdueComponents++;
      else if (c.status === 'DUE_SOON') fleetTotalDueSoonComponents++;
      else fleetTotalSafeComponents++;
    });
  });

  const handleOpenPmModal = (truck: TruckAsset, sourceKey?: string) => {
    const key = sourceKey || `modal-${truck.idUnit}`;
    setLoadingActionKey(key);
    setSelectedTruckForPm(truck);
    setIsPmModalLoading(true);
    setTimeout(() => {
      setIsPmModalLoading(false);
      setLoadingActionKey(null);
    }, 150);
  };

  const handleRequestPartDirect = (truck: TruckAsset, comp: ComponentHealthStatus) => {
    const actionKey = `part-${truck.idUnit}-${comp.parameter.id}`;
    if (loadingActionKey === actionKey) return;
    setLoadingActionKey(actionKey);

    setTimeout(() => {
      try {
        const part = state.parts.find((p) => p.sku === comp.parameter.skuDefault);
        const harga = part ? part.harga : 250000;

        requestSparepart({
          woId: `REQ-PM-${truck.idUnit}`,
          nopol: truck.idUnit,
          sku: comp.parameter.skuDefault || 'PART-PM',
          namaPart: comp.parameter.namaPartDefault || comp.parameter.komponen,
          qty: 1,
          hargaSatuan: harga,
          mekanik: state.userPic
        });

        toast.success(`Pengajuan suku cadang unit ${truck.idUnit} tersimpan`);
      } catch (err: any) {
        toast.error(err.message || 'Gagal mengajukan suku cadang');
      } finally {
        setLoadingActionKey(null);
      }
    }, 150);
  };

  // Kalkulasi Metrik KPI Atas
  const totalTrucks = activeTrucks.length;
  const totalChassis = state.chassis.filter((c) => c.statusServis !== 'AFKIR').length;
  const totalGensets = state.gensets.filter((g) => g.statusServis !== 'AFKIR').length;
  const totalFleet = totalTrucks + totalChassis + totalGensets;

  const activeTires = state.tires.filter((t) => t.statusKelayakan === 'Aktif Terpasang').length;
  const warehouseTotalTires = state.tires.filter((t) => isWarehouseTire(t)).length;
  const storageReadyTires = state.tires.filter((t) => isReadyWarehouseTire(t)).length;

  const activeWorkOrders = state.workOrders.filter(
    (wo) => wo.status !== 'COMPLETED & RELEASED' && wo.status !== 'CANCELLED'
  );

  const totalMaintenanceCost = state.partRequests
    .filter((p) => p.status === 'Approved' || p.status === 'RESTOCK INBOUND')
    .reduce((sum, p) => sum + (p.total || 0), 0);

  const totalOdometer = state.trucks.reduce((sum, t) => sum + (t.kmSaatIni || 0), 0);
  const costPerKm = totalOdometer > 0 ? Math.round(totalMaintenanceCost / totalOdometer) : 0;

  // Logika Downtime Log Terpadu
  const totalDowntimeDays = state.workOrders.reduce(
    (sum, wo) => sum + (Number(wo.downtime) || 0),
    0
  );

  const pmOverdueTrucks = state.trucks.filter(
    (t) => t.statusPm === 'OVERDUE' && t.statusServis !== 'AFKIR'
  );
  const pmDueSoonTrucks = state.trucks.filter(
    (t) => t.statusPm === 'DUE_SOON' && t.statusServis !== 'AFKIR'
  );

  const statusCounts: Record<string, number> = {
    SCHEDULED: 0,
    ARRIVED: 0,
    'IN PROGRESS': 0,
    'WAITING PART': 0,
    'READY FOR QC': 0,
    'COMPLETED & RELEASED': 0
  };

  state.workOrders.forEach((wo) => {
    if (statusCounts[wo.status] !== undefined) {
      statusCounts[wo.status]++;
    }
  });

  const legalityAlerts: {
    type: 'STNK' | 'PAJAK' | 'KIR';
    unit: string;
    date: string;
    daysLeft: number;
    status: 'EXPIRED' | 'CRITICAL';
  }[] = [];

  state.trucks.forEach((truck) => {
    if (truck.statusServis === 'AFKIR') return;
    const now = new Date();
    if (truck.masaSTNK) {
      const exp = new Date(truck.masaSTNK);
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) {
        legalityAlerts.push({
          type: 'STNK',
          unit: truck.idUnit,
          date: truck.masaSTNK,
          daysLeft: diffDays,
          status: diffDays <= 0 ? 'EXPIRED' : 'CRITICAL'
        });
      }
    }
    if (truck.masaPajak) {
      const exp = new Date(truck.masaPajak);
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) {
        legalityAlerts.push({
          type: 'PAJAK',
          unit: truck.idUnit,
          date: truck.masaPajak,
          daysLeft: diffDays,
          status: diffDays <= 0 ? 'EXPIRED' : 'CRITICAL'
        });
      }
    }
  });

  const months = ['Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt'];
  const monthlyCostValues = [
    Math.round(totalMaintenanceCost * 0.12),
    Math.round(totalMaintenanceCost * 0.15),
    Math.round(totalMaintenanceCost * 0.18),
    Math.round(totalMaintenanceCost * 0.14),
    Math.round(totalMaintenanceCost * 0.22),
    Math.round(totalMaintenanceCost * 0.19)
  ];
  const maxMonthCost = Math.max(...monthlyCostValues, 1);

  const handleCreateAutoWo = (truck: TruckAsset, customKey?: string) => {
    const actionKey = customKey || `wo-${truck.idUnit}`;
    if (loadingActionKey === actionKey) return;
    setLoadingActionKey(actionKey);

    setTimeout(() => {
      try {
        const newWo = createAutoWorkOrderFromPm(truck.idUnit);
        toast.success(`Work order ${newWo.woId} dibuat`);
        setTimeout(() => {
          setLoadingActionKey(null);
          onNavigateToTab('workorders');
        }, 200);
      } catch (e: any) {
        setLoadingActionKey(null);
        toast.error(e.message || 'Gagal membuat work order');
      }
    }, 150);
  };

  const filteredFleetTrucks = activeTrucks.filter((t) => {
    if (fleetRowFilter === 'ATTENTION' && t.statusPm === 'SAFE') return false;
    if (fleetRowFilter === 'SAFE' && t.statusPm !== 'SAFE') return false;
    if (!fleetSearchQuery.trim()) return true;
    const q = fleetSearchQuery.toLowerCase();
    return (
      t.idUnit.toLowerCase().includes(q) ||
      t.noLambung.toLowerCase().includes(q) ||
      t.merkModel.toLowerCase().includes(q) ||
      t.jenisArmada.toLowerCase().includes(q)
    );
  });

  const modalTruckComponents: ComponentHealthStatus[] = selectedTruckForPm
    ? evaluateTruckComponents(selectedTruckForPm, state.maintenanceParameters)
    : [];

  const componentCategories = Array.from(
    new Set(modalTruckComponents.map((c) => c.parameter.kategori))
  ).sort();

  const filteredModalComponents = modalTruckComponents.filter((c) => {
    if (componentStatusFilter === 'ATTENTION' && c.status === 'SAFE') return false;
    if (componentStatusFilter === 'OVERDUE' && c.status !== 'OVERDUE') return false;
    if (componentStatusFilter === 'DUE_SOON' && c.status !== 'DUE_SOON') return false;
    if (componentStatusFilter === 'SAFE' && c.status !== 'SAFE') return false;
    if (componentCategoryFilter !== 'ALL' && c.parameter.kategori !== componentCategoryFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <Card className="bg-[#0A2547] text-white border-[#073E7F] p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#D19F0F] uppercase tracking-wider mb-1">
              Ringkasan Operasional Bengkel
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Pusat Kendali Bengkel Armada
            </h1>
            <p className="text-xs text-[#94A3B8] mt-1 max-w-2xl leading-normal">
              Pemantauan jadwal servis berkala, antrean pengerjaan bay, ketersediaan suku cadang, dan posisi ban.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigateToTab('workorders')}
              leftIcon={<Wrench className="w-3.5 h-3.5 text-[#D19F0F]" />}
            >
              Kelola work order ({activeWorkOrders.length})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigateToTab('tires')}
              leftIcon={<CircleDot className="w-3.5 h-3.5 text-[#073E7F]" />}
            >
              Posisi ban
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsExportModalOpen(true)}
              leftIcon={<Download className="w-3.5 h-3.5 text-[#059669]" />}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Armada */}
        <Card className="p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#475569] mb-1 flex items-center justify-between">
            <span>Armada aktif</span>
            <Truck className="w-3.5 h-3.5 text-[#94A3B8]" />
          </div>
          <div className="text-2xl font-bold text-[#0F172A] font-mono tabular-nums">
            {totalFleet}
          </div>
          <div className="text-xs text-[#475569] mt-1">
            {totalTrucks} Armada · {totalChassis} Sasis
          </div>
        </Card>

        {/* Work Order Aktif */}
        <Card className="p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#475569] mb-1 flex items-center justify-between">
            <span>Servis aktif</span>
            <Clock className="w-3.5 h-3.5 text-[#D97706]" />
          </div>
          <div className="text-2xl font-bold text-[#D97706] font-mono tabular-nums">
            {activeWorkOrders.length}
          </div>
          <div className="text-xs text-[#475569] mt-1">
            {statusCounts['IN PROGRESS']} di bay
          </div>
        </Card>

        {/* Biaya Pemeliharaan */}
        <Card className="p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#475569] mb-1 flex items-center justify-between">
            <span>Biaya servis</span>
            <DollarSign className="w-3.5 h-3.5 text-[#059669]" />
          </div>
          <div className="text-xl font-bold text-[#0F172A] font-mono tabular-nums truncate">
            Rp {(totalMaintenanceCost / 1000000).toFixed(1)}Jt
          </div>
          <div className="text-xs text-[#475569] mt-1">
            Suku cadang & oli
          </div>
        </Card>

        {/* Biaya per KM */}
        <Card className="p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#475569] mb-1 flex items-center justify-between">
            <span>Biaya per km</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#073E7F]" />
          </div>
          <div className="text-2xl font-bold text-[#0F172A] font-mono tabular-nums">
            Rp {costPerKm}
          </div>
          <div className="text-xs text-[#475569] mt-1">
            {(totalOdometer / 1000).toFixed(0)}rb KM tempuh
          </div>
        </Card>

        {/* Ban Gudang */}
        <Card className="p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#475569] mb-1 flex items-center justify-between">
            <span>Ban gudang</span>
            <CircleDot className="w-3.5 h-3.5 text-[#94A3B8]" />
          </div>
          <div className="text-2xl font-bold text-[#0F172A] font-mono tabular-nums">
            {warehouseTotalTires}
          </div>
          <div className="text-xs text-[#475569] mt-1">
            {storageReadyTires} siap pasang
          </div>
        </Card>

        {/* Downtime */}
        <Card className="p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#475569] mb-1 flex items-center justify-between">
            <span>Downtime</span>
            <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
          </div>
          <div className="text-2xl font-bold text-[#0F172A] font-mono tabular-nums">
            {totalDowntimeDays.toFixed(1)} <span className="text-xs font-normal text-[#475569]">Hari</span>
          </div>
          <div className="text-xs text-[#475569] mt-1">
            Akumulasi non-aktif
          </div>
        </Card>
      </div>

      {/* Peringatan Servis Berkala Widget */}
      {(pmOverdueTrucks.length > 0 || pmDueSoonTrucks.length > 0) && (
        <Card className="p-5 border-[#FECACA] bg-[#FEF2F2]/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0" />
              <div>
                <h2 className="text-base font-bold text-[#0F172A]">
                  Peringatan Servis Berkala
                </h2>
                <p className="text-xs text-[#475569]">
                  Unit armada yang mendekati atau telah melewati ambang batas kilometer servis berkala.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="danger">{pmOverdueTrucks.length} Lewat batas</Badge>
              <Badge variant="warning">{pmDueSoonTrucks.length} Mendekati</Badge>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {pmOverdueTrucks.slice(0, 4).map((truck) => (
              <div
                key={truck.idUnit}
                className="p-3 bg-white border border-[#E2E8F0] rounded-[6px] flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bmi-plate text-xs">{truck.idUnit}</span>
                    <span className="font-semibold text-[#0F172A]">{truck.noLambung}</span>
                  </div>
                  <div className="text-xs text-[#DC2626] font-semibold mt-1 font-mono">
                    Lewat {Math.abs(truck.sisaKmServis || 0).toLocaleString('id-ID')} KM
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenPmModal(truck, `alert-detail-${truck.idUnit}`)}
                  >
                    Detail
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleCreateAutoWo(truck, `alert-wo-${truck.idUnit}`)}
                  >
                    Buat WO
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Daftar Masa Pakai Armada: Tabel Lengkap + Klik Buka Kartu Detail Unit */}
      <Card className="p-5 space-y-4">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#073E7F] uppercase tracking-wider mb-1">
              <Activity className="w-4 h-4" />
              <span>Status Keausan Komponen</span>
            </div>
            <h2 className="text-base font-bold text-[#0F172A]">
              Pemantauan Komponen & Pelumas Armada
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Pilih baris unit armada untuk menampilkan rincian kartu keausan komponen secara interaktif.
            </p>
          </div>

          {/* Tri-Color Summary Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="danger">
              {fleetTotalOverdueComponents} Melewati batas
            </Badge>
            <Badge variant="warning">
              {fleetTotalDueSoonComponents} Mendekati batas
            </Badge>
            <Badge variant="success">
              {fleetTotalSafeComponents} Kondisi optimal
            </Badge>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#F8FAFC] p-3 rounded-[6px] border border-[#E2E8F0]">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <input
              type="text"
              value={fleetSearchQuery}
              onChange={(e) => setFleetSearchQuery(e.target.value)}
              placeholder="Cari nopol atau nomor lambung..."
              className="w-full h-9 px-3 rounded-[6px] text-xs text-[#0F172A] bg-white border border-[#E2E8F0] placeholder-[#94A3B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-[#E2E8F0] rounded-[6px] p-1">
            <button
              type="button"
              onClick={() => setFleetRowFilter('ALL')}
              className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                fleetRowFilter === 'ALL'
                  ? 'bg-[#0A2547] text-white'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Semua ({activeTrucks.length})
            </button>
            <button
              type="button"
              onClick={() => setFleetRowFilter('ATTENTION')}
              className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                fleetRowFilter === 'ATTENTION'
                  ? 'bg-[#D97706] text-white'
                  : 'text-[#D97706] hover:bg-[#FFFBEB]'
              }`}
            >
              Perlu tindakan ({pmOverdueTrucks.length + pmDueSoonTrucks.length})
            </button>
            <button
              type="button"
              onClick={() => setFleetRowFilter('SAFE')}
              className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                fleetRowFilter === 'SAFE'
                  ? 'bg-[#059669] text-white'
                  : 'text-[#059669] hover:bg-[#ECFDF5]'
              }`}
            >
              Optimal ({activeTrucks.length - (pmOverdueTrucks.length + pmDueSoonTrucks.length)})
            </button>
          </div>
        </div>

        {/* Tabel Lengkap Armada */}
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Unit armada</TableHeaderCell>
                <TableHeaderCell className="text-right">Odometer</TableHeaderCell>
                <TableHeaderCell>Status servis</TableHeaderCell>
                <TableHeaderCell className="text-right">Oli mesin</TableHeaderCell>
                <TableHeaderCell className="text-right">Filter oli</TableHeaderCell>
                <TableHeaderCell className="text-right">Filter solar</TableHeaderCell>
                <TableHeaderCell className="text-right">Filter udara</TableHeaderCell>
                <TableHeaderCell className="text-right">Kampas rem</TableHeaderCell>
                <TableHeaderCell className="text-right">Oli transmisi</TableHeaderCell>
                <TableHeaderCell className="text-right">Tindakan</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filteredFleetTrucks.length === 0 ? (
                <tr>
                  <TableCell colSpan={10} className="text-center py-8 text-[#475569]">
                    Tidak ada unit armada yang cocok dengan pencarian.
                  </TableCell>
                </tr>
              ) : (
                filteredFleetTrucks.map((truck) => {
                  const comps = evaluateTruckComponents(truck, state.maintenanceParameters);
                  const findComp = (keywords: string[]) =>
                    comps.find((c) => {
                      const id = c.parameter.id.toLowerCase();
                      const name = c.parameter.komponen.toLowerCase();
                      return keywords.some((kw) => id.includes(kw) || name.includes(kw));
                    });

                  const oliMesin = findComp(['pm-trk-01', 'pm-oli-mesin', 'oli mesin']);
                  const fltOli = findComp(['pm-filter-oli', 'filter oli', 'saringan oli', 'pm-trk-01']);
                  const fltSolar = findComp(['pm-trk-03', 'pm-filter-solar', 'saringan bahan bakar', 'filter solar', 'water separator']);
                  const fltUdara = findComp(['pm-trk-02', 'pm-filter-udara', 'saringan udara', 'air filter', 'air cleaner']);
                  const kampasRem = findComp(['pm-trk-13', 'pm-kampas-rem', 'kampas rem', 'brake shoe', 'disc brake']);
                  const oliTrans = findComp(['pm-trk-07', 'pm-oli-transmisi', 'oli transmisi', 'fluida transmisi']);

                  const renderKmBadge = (comp?: ComponentHealthStatus) => {
                    if (!comp) return <span className="text-[#94A3B8]">-</span>;
                    if (comp.status === 'OVERDUE') {
                      return (
                        <span className="font-mono text-xs font-bold text-[#DC2626]">
                          {comp.sisaKm.toLocaleString('id-ID')} KM
                        </span>
                      );
                    }
                    if (comp.status === 'DUE_SOON') {
                      return (
                        <span className="font-mono text-xs font-bold text-[#D97706]">
                          {comp.sisaKm.toLocaleString('id-ID')} KM
                        </span>
                      );
                    }
                    return (
                      <span className="font-mono text-xs font-semibold text-[#059669]">
                        {comp.sisaKm.toLocaleString('id-ID')} KM
                      </span>
                    );
                  };

                  return (
                    <TableRow
                      key={truck.idUnit}
                      tabIndex={0}
                      role="button"
                      aria-label={`Buka rincian komponen unit ${truck.idUnit} (${truck.noLambung})`}
                      onClick={() => handleOpenPmModal(truck, `row-${truck.idUnit}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpenPmModal(truck, `row-${truck.idUnit}`);
                        }
                      }}
                      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#073E7F]"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="bmi-plate text-xs">{truck.idUnit}</span>
                          <span className="text-xs font-semibold text-[#0F172A]">
                            {truck.noLambung}
                          </span>
                        </div>
                        <div className="text-xs text-[#475569] mt-0.5">
                          {truck.jenisArmada}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-right font-semibold text-[#0F172A]">
                        {truck.kmSaatIni.toLocaleString('id-ID')} KM
                      </TableCell>
                      <TableCell>
                        {truck.statusPm === 'OVERDUE' ? (
                          <Badge variant="danger">
                            Lewat {Math.abs(truck.sisaKmServis || 0).toLocaleString('id-ID')} KM
                          </Badge>
                        ) : truck.statusPm === 'DUE_SOON' ? (
                          <Badge variant="warning">
                            Sisa {truck.sisaKmServis?.toLocaleString('id-ID')} KM
                          </Badge>
                        ) : (
                          <Badge variant="success">
                            Sisa {(truck.sisaKmServis || 0).toLocaleString('id-ID')} KM
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{renderKmBadge(oliMesin)}</TableCell>
                      <TableCell className="text-right">{renderKmBadge(fltOli)}</TableCell>
                      <TableCell className="text-right">{renderKmBadge(fltSolar)}</TableCell>
                      <TableCell className="text-right">{renderKmBadge(fltUdara)}</TableCell>
                      <TableCell className="text-right">{renderKmBadge(kampasRem)}</TableCell>
                      <TableCell className="text-right">{renderKmBadge(oliTrans)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenPmModal(truck, `btn-detail-${truck.idUnit}`)}
                          >
                            Detail
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleCreateAutoWo(truck, `wo-row-${truck.idUnit}`)}
                          >
                            Buat WO
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Analytics Grid: Grafik Biaya & Distribusi Status Servis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">
                Tren Biaya Pemeliharaan
              </h2>
              <p className="text-xs text-[#475569]">
                Pengeluaran suku cadang dan pelumas selama 6 bulan terakhir.
              </p>
            </div>
            <div className="flex items-center gap-1 bg-[#F1F5F9] p-0.5 rounded-[6px]">
              <button
                type="button"
                onClick={() => setTimeframe('6M')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors ${
                  timeframe === '6M' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-[#475569]'
                }`}
              >
                6 Bulan
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('12M')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors ${
                  timeframe === '12M' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-[#475569]'
                }`}
              >
                1 Tahun
              </button>
            </div>
          </div>

          <div className="h-48 flex items-end justify-between gap-3 pt-4 px-2">
            {months.map((m, idx) => {
              const val = monthlyCostValues[idx];
              const heightPct = Math.max(12, Math.round((val / maxMonthCost) * 100));
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="text-[11px] font-mono font-semibold text-[#475569] opacity-0 group-hover:opacity-100 transition-opacity">
                    {(val / 1000000).toFixed(1)}Jt
                  </div>
                  <div className="w-full bg-[#F1F5F9] rounded-t-[6px] h-36 flex items-end p-1">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full bg-[#0A2547] group-hover:bg-[#073E7F] rounded-[4px] transition-all duration-150"
                    />
                  </div>
                  <span className="text-xs font-medium text-[#475569]">{m}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Distribusi Status Work Order */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0F172A] mb-1">
              Tahapan Servis Berjalan
            </h2>
            <p className="text-xs text-[#475569] mb-4">
              Komposisi alokasi unit servis di bengkel.
            </p>

            <div className="space-y-3">
              {[
                { label: 'Selesai & rilis', count: statusCounts['COMPLETED & RELEASED'], color: 'bg-[#059669]' },
                { label: 'Sedang dikerjakan', count: statusCounts['IN PROGRESS'], color: 'bg-[#073E7F]' },
                { label: 'Menunggu suku cadang', count: statusCounts['WAITING PART'], color: 'bg-[#D97706]' },
                { label: 'Pemeriksaan QC', count: statusCounts['READY FOR QC'], color: 'bg-[#0284C7]' },
                { label: 'Tiba di bengkel', count: statusCounts['ARRIVED'], color: 'bg-[#64748B]' },
                { label: 'Terjadwal', count: statusCounts['SCHEDULED'], color: 'bg-[#94A3B8]' }
              ].map((item) => (
                <div key={item.label} className="text-xs">
                  <div className="flex items-center justify-between text-[#475569] mb-1">
                    <span className="flex items-center gap-2 font-medium">
                      <span className={`w-2 h-2 rounded-full ${item.color}`} />
                      <span>{item.label}</span>
                    </span>
                    <span className="font-mono font-bold text-[#0F172A]">{item.count}</span>
                  </div>
                  <div className="w-full bg-[#F1F5F9] h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color}`}
                      style={{
                        width: `${
                          state.workOrders.length > 0
                            ? Math.round((item.count / state.workOrders.length) * 100)
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E2E8F0]">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => onNavigateToTab('workorders')}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Buka monitoring work order
            </Button>
          </div>
        </Card>
      </div>

      {/* POPUP MODAL: KARTU DETAIL UNIT (MENGGUNAKAN PRIMITIVE MODAL) */}
      {selectedTruckForPm && (
        <Modal
          isOpen={!!selectedTruckForPm}
          onClose={() => setSelectedTruckForPm(null)}
          title={`Kartu Detail Unit: ${selectedTruckForPm.idUnit}`}
          subtitle={`No. Lambung: ${selectedTruckForPm.noLambung} · Odometer: ${selectedTruckForPm.kmSaatIni.toLocaleString('id-ID')} KM`}
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-[#475569]">
                {filteredModalComponents.length} komponen dipantau
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedTruckForPm(null)}
                >
                  Tutup
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const t = selectedTruckForPm;
                    setSelectedTruckForPm(null);
                    handleCreateAutoWo(t, `modal-wo-${t.idUnit}`);
                  }}
                  leftIcon={<Wrench className="w-3.5 h-3.5" />}
                >
                  Buat work order
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Filter Bar di Dalam Modal */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC] p-2.5 rounded-[6px] border border-[#E2E8F0]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setComponentStatusFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors ${
                    componentStatusFilter === 'ALL'
                      ? 'bg-[#0A2547] text-white'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  Semua ({modalTruckComponents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setComponentStatusFilter('ATTENTION')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors ${
                    componentStatusFilter === 'ATTENTION'
                      ? 'bg-[#D97706] text-white'
                      : 'text-[#D97706] hover:bg-[#FFFBEB]'
                  }`}
                >
                  Perlu tindakan
                </button>
                <button
                  type="button"
                  onClick={() => setComponentStatusFilter('OVERDUE')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors ${
                    componentStatusFilter === 'OVERDUE'
                      ? 'bg-[#DC2626] text-white'
                      : 'text-[#DC2626] hover:bg-[#FEF2F2]'
                  }`}
                >
                  Lewat batas
                </button>
                <button
                  type="button"
                  onClick={() => setComponentStatusFilter('SAFE')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors ${
                    componentStatusFilter === 'SAFE'
                      ? 'bg-[#059669] text-white'
                      : 'text-[#059669] hover:bg-[#ECFDF5]'
                  }`}
                >
                  Optimal
                </button>
              </div>

              <select
                value={componentCategoryFilter}
                onChange={(e) => setComponentCategoryFilter(e.target.value)}
                className="h-8 px-2 text-xs bg-white border border-[#E2E8F0] rounded-[6px] text-[#0F172A] focus:outline-none"
              >
                <option value="ALL">Semua kategori</option>
                {componentCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Grid Kartu Rincian Komponen */}
            {isPmModalLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#475569]">
                <Loader2 className="w-5 h-5 animate-spin text-[#073E7F]" />
                <span className="text-xs">Memuat status komponen...</span>
              </div>
            ) : filteredModalComponents.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
                Tidak ada komponen dengan kriteria yang dipilih.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredModalComponents.map((comp) => {
                  const isOverdue = comp.status === 'OVERDUE';
                  const isDueSoon = comp.status === 'DUE_SOON';

                  const renderIcon = () => {
                    const cat = comp.parameter.kategori.toLowerCase();
                    if (cat.includes('oli') || cat.includes('pelumas')) {
                      return <Droplet className="w-3.5 h-3.5 text-[#073E7F]" />;
                    }
                    if (cat.includes('filter')) {
                      return <Filter className="w-3.5 h-3.5 text-[#059669]" />;
                    }
                    if (cat.includes('rem')) {
                      return <Disc className="w-3.5 h-3.5 text-[#DC2626]" />;
                    }
                    if (cat.includes('pendingin')) {
                      return <Fan className="w-3.5 h-3.5 text-[#0284C7]" />;
                    }
                    if (cat.includes('kaki') || cat.includes('sasis')) {
                      return <Wrench className="w-3.5 h-3.5 text-[#D97706]" />;
                    }
                    if (cat.includes('keselamatan') || cat.includes('k3')) {
                      return <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626]" />;
                    }
                    if (cat.includes('transmisi') || cat.includes('gardan') || cat.includes('mesin')) {
                      return <Gauge className="w-3.5 h-3.5 text-[#475569]" />;
                    }
                    return <Layers className="w-3.5 h-3.5 text-[#073E7F]" />;
                  };

                  return (
                    <div
                      key={comp.parameter.id}
                      className={`p-3.5 rounded-[6px] border flex flex-col justify-between ${
                        isOverdue
                          ? 'border-[#FECACA] bg-[#FEF2F2]/40'
                          : isDueSoon
                          ? 'border-[#FDE68A] bg-[#FFFBEB]/40'
                          : 'border-[#E2E8F0] bg-white'
                      }`}
                    >
                      <div>
                        {/* Title & Badge */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-[6px] bg-[#F1F5F9] text-[#073E7F] flex items-center justify-center shrink-0">
                              {renderIcon()}
                            </div>
                            <div>
                              <h3 className="font-semibold text-xs text-[#0F172A] leading-tight">
                                {comp.parameter.komponen}
                              </h3>
                              <span className="text-[11px] text-[#475569]">
                                {comp.parameter.kategori}
                              </span>
                            </div>
                          </div>

                          <Badge
                            variant={isOverdue ? 'danger' : isDueSoon ? 'warning' : 'success'}
                          >
                            {isOverdue ? 'Lewat' : isDueSoon ? 'Mendekati' : 'Optimal'}
                          </Badge>
                        </div>

                        {/* Sisa Masa Pakai Gauge */}
                        <div className="my-2.5">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[#475569]">Sisa pakai:</span>
                            <span
                              className={`font-mono font-bold ${
                                isOverdue
                                  ? 'text-[#DC2626]'
                                  : isDueSoon
                                  ? 'text-[#D97706]'
                                  : 'text-[#059669]'
                              }`}
                            >
                              {isOverdue
                                ? `Lewat ${Math.abs(comp.sisaKm).toLocaleString('id-ID')} KM`
                                : `${comp.sisaKm.toLocaleString('id-ID')} KM (${comp.persenSisa}%)`}
                            </span>
                          </div>
                          <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${Math.min(100, Math.max(0, comp.persenSisa))}%` }}
                              className={`h-full ${
                                isOverdue
                                  ? 'bg-[#DC2626]'
                                  : isDueSoon
                                  ? 'bg-[#D97706]'
                                  : 'bg-[#059669]'
                              }`}
                            />
                          </div>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-1.5 text-[11px] p-2 bg-[#F8FAFC] rounded-[6px] border border-[#E2E8F0] mb-3">
                          <div>
                            <span className="text-[#94A3B8] block text-[10px]">Interval:</span>
                            <span className="font-mono font-semibold text-[#0F172A]">
                              {comp.parameter.intervalKm.toLocaleString('id-ID')} KM
                            </span>
                          </div>
                          <div>
                            <span className="text-[#94A3B8] block text-[10px]">Terakhir ganti:</span>
                            <span className="font-mono font-semibold text-[#0F172A]">
                              {comp.kmTerakhirGanti.toLocaleString('id-ID')} KM
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleRequestPartDirect(selectedTruckForPm, comp)}
                        >
                          Ajukan part
                        </Button>
                        <Button
                          variant={isOverdue ? 'danger' : 'primary'}
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            const t = selectedTruckForPm;
                            setSelectedTruckForPm(null);
                            handleCreateAutoWo(t, `card-wo-${t.idUnit}`);
                          }}
                        >
                          Buat WO
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Advanced CSV Export Modal */}
      <ExportCsvModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
};
