import React, { useState } from 'react';
import {
  Search,
  Truck,
  Layers,
  Check,
  X,
  Info,
  Sparkles
} from 'lucide-react';
import { generateRecommendations } from '../../domain/recommendationEngine';
import type { RecommendationOption } from '../../types';
import { useWorkshopStore } from '../../services/workshopStore';
import { TireAsset, TruckLayout, ChassisLayout } from '../../types';
import {
  normalizeUnitId,
  isReadyWarehouseTire,
  normalizeTireSize
} from '../../services/liveSheetSync';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { toast } from '../ui/Toast';

interface TireManagementProps {
  initialUnitId?: string;
}

export const TireManagement: React.FC<TireManagementProps> = ({ initialUnitId }) => {
  const { state, commitBatchTireMutation } = useWorkshopStore();

  const [unitType, setUnitType] = useState<'TRUK' | 'CHASSIS'>('TRUK');
  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    initialUnitId || (state.trucks[0]?.idUnit || '')
  );
  const [odometerInput, setOdometerInput] = useState<number>(0);
  const [showCommitConfirm, setShowCommitConfirm] = useState(false);

  // Draft Mutations: { [position]: { posisi, idBanLama, aksiBanLama, idBanBaru } }
  const [draftChanges, setDraftChanges] = useState<
    Record<
      string,
      {
        posisi: string;
        idBanLama: string;
        aksiBanLama: 'GUDANG' | 'SERVIS' | 'AFKIR';
        idBanBaru: string;
      }
    >
  >({});

  // Active Tap Modal State
  const [activeModalPos, setActiveModalPos] = useState<string | null>(null);
  const [modalAksiLama, setModalAksiLama] = useState<'GUDANG' | 'SERVIS' | 'AFKIR'>('GUDANG');
  const [modalSelectedNewTireId, setModalSelectedNewTireId] = useState<string>('');
  const [searchStorageTire, setSearchStorageTire] = useState('');
  const [showRecommendation, setShowRecommendation] = useState(false);

  const normSelectedUnit = normalizeUnitId(selectedUnitId);

  // Selected Unit Metadata
  const currentTruck = state.trucks.find(
    (t) => normalizeUnitId(t.idUnit) === normSelectedUnit
  );
  const currentChassis = state.chassis.find(
    (c) => normalizeUnitId(c.idUnit) === normSelectedUnit
  );

  // Determine Blueprint Wheel Layout
  let detectedLayout: TruckLayout | ChassisLayout = 'DOUBLE';
  let targetBanSize = '1000';

  if (unitType === 'TRUK') {
    if (currentTruck) {
      targetBanSize = normalizeTireSize(currentTruck.targetUkuranBan || '1000');
      const jenis = currentTruck.jenisArmada.toLowerCase();
      if (['support', 'box', 'pick up', 'penumpang', 'thermo'].some((k) => jenis.includes(k))) {
        detectedLayout = 'SUPPORT_4';
      } else if (jenis.includes('engkel') || jenis.includes('dump')) {
        detectedLayout = 'ENGKEL';
      } else {
        detectedLayout = 'DOUBLE';
      }
    }
  } else {
    if (currentChassis) {
      targetBanSize = '1000';
      detectedLayout =
        currentChassis.idUnit.includes('2A') ||
        currentChassis.tipeChassis.toLowerCase().includes('2 axle')
          ? 'CHASSIS_8'
          : 'CHASSIS_12';
    }
  }

  // Get currently installed tires map: { [posisiRoda]: TireAsset }
  const installedTiresMap: Record<string, TireAsset> = {};
  state.tires.forEach((b) => {
    if (
      normalizeUnitId(b.unitTerpasang) === normSelectedUnit &&
      b.statusKelayakan === 'Aktif Terpasang'
    ) {
      installedTiresMap[b.posisiRoda.toUpperCase()] = b;
    }
  });

  // Calculate Wheel Nodes by Layout
  const getAxleGroups = () => {
    if (detectedLayout === 'ENGKEL') {
      return [
        { label: 'Gandar 1 (Depan)', pairs: [{ left: ['A'], right: ['D'] }] },
        { label: 'Gandar 2 (Penggerak)', pairs: [{ left: ['B', 'C'], right: ['E', 'F'] }] }
      ];
    } else if (detectedLayout === 'DOUBLE') {
      return [
        { label: 'Gandar 1 (Kemudi)', pairs: [{ left: ['A'], right: ['F'] }] },
        { label: 'Gandar 2 (Tengah)', pairs: [{ left: ['B', 'C'], right: ['G', 'H'] }] },
        { label: 'Gandar 3 (Belakang)', pairs: [{ left: ['D', 'E'], right: ['I', 'J'] }] }
      ];
    } else if (detectedLayout === 'SUPPORT_4') {
      return [
        { label: 'Gandar 1 (Depan)', pairs: [{ left: ['A'], right: ['B'] }] },
        { label: 'Gandar 2 (Belakang)', pairs: [{ left: ['C'], right: ['D'] }] }
      ];
    } else if (detectedLayout === 'CHASSIS_8') {
      return [
        { label: 'Gandar 1 (Trailer)', pairs: [{ left: ['CA', 'CB'], right: ['CE', 'CF'] }] },
        { label: 'Gandar 2 (Trailer)', pairs: [{ left: ['CC', 'CD'], right: ['CG', 'CH'] }] }
      ];
    } else {
      return [
        { label: 'Gandar 1 (Depan)', pairs: [{ left: ['CA', 'CB'], right: ['CG', 'CH'] }] },
        { label: 'Gandar 2 (Tengah)', pairs: [{ left: ['CC', 'CD'], right: ['CI', 'CJ'] }] },
        { label: 'Gandar 3 (Belakang)', pairs: [{ left: ['CE', 'CF'], right: ['CK', 'CL'] }] }
      ];
    }
  };

  // Warehouse Ready Tires filtered by strictly matching size
  const storageReadyTires = state.tires
    .filter((b) => {
      if (!isReadyWarehouseTire(b)) return false;
      const cleanSize = normalizeTireSize(b.ukuran);
      return cleanSize === targetBanSize || targetBanSize.includes(cleanSize);
    })
    // FIFO Sorting: Oldest DOT first
    .sort((a, b) => {
      const parseDot = (d: string) => {
        const m = String(d || '').match(/(\d{2})(\d{2})$/);
        if (!m) return 999999;
        return parseInt(m[2], 10) * 100 + parseInt(m[1], 10);
      };
      return parseDot(a.dot) - parseDot(b.dot);
    });

  const filteredStorageTires = storageReadyTires.filter((b) => {
    if (!searchStorageTire) return true;
    const q = searchStorageTire.toLowerCase();
    return b.idBanFisik.toLowerCase().includes(q) || b.merk.toLowerCase().includes(q) || b.dot.includes(q);
  });

  // Tap Modal Opener
  const handleOpenTapModal = (pos: string) => {
    setActiveModalPos(pos);
    const existing = draftChanges[pos];
    if (existing) {
      setModalAksiLama(existing.aksiBanLama);
      setModalSelectedNewTireId(existing.idBanBaru);
    } else {
      setModalAksiLama('GUDANG');
      setModalSelectedNewTireId('');
    }
    setSearchStorageTire('');
  };

  // Add Position to Draft
  const handleSaveToDraft = () => {
    if (!activeModalPos) return;
    const currentBan = installedTiresMap[activeModalPos];

    setDraftChanges({
      ...draftChanges,
      [activeModalPos]: {
        posisi: activeModalPos,
        idBanLama: currentBan ? currentBan.idBanFisik : '',
        aksiBanLama: modalAksiLama,
        idBanBaru: modalSelectedNewTireId
      }
    });

    setActiveModalPos(null);
  };

  // Remove Position from Draft
  const handleRemoveDraftItem = (pos: string) => {
    const next = { ...draftChanges };
    delete next[pos];
    setDraftChanges(next);
  };

  // Rekomendasi bundle untuk unit aktif (deterministik, berbasis KM/usia — tanpa tread)
  const recommendation = generateRecommendations({
    unitId: selectedUnitId,
    ukuranTarget: targetBanSize,
    kebutuhan: 2,
    stok: state.tires.filter((t) => t.statusKelayakan === 'Spare / Gudang'),
    terpasang: Object.values(installedTiresMap),
    hargaJasaPerBan: 50000
  });

  const handleApplyBundle = (opt: RecommendationOption) => {
    if (!activeModalPos || !opt.valid || opt.items.length === 0) return;
    const pick = opt.items[0].idBanFisik;
    const currentBan = installedTiresMap[activeModalPos];
    setModalSelectedNewTireId(pick);
    setDraftChanges({
      ...draftChanges,
      [activeModalPos]: {
        posisi: activeModalPos,
        idBanLama: currentBan ? currentBan.idBanFisik : '',
        aksiBanLama: modalAksiLama,
        idBanBaru: pick
      }
    });
    setShowRecommendation(false);
    setActiveModalPos(null);
    toast.success(`Bundle ${opt.label}: ${pick} masuk draf posisi ${activeModalPos}.`);
  };

  // Commit All Changes
  const handleCommitBatch = () => {
    const count = Object.keys(draftChanges).length;
    if (count === 0) {
      toast.warning('Belum ada perubahan posisi');
      return;
    }
    setShowCommitConfirm(true);
  };

  const executeCommitBatch = () => {
    const count = Object.keys(draftChanges).length;
    commitBatchTireMutation(
      selectedUnitId,
      odometerInput > 0 ? odometerInput : (currentTruck?.kmSaatIni || 0),
      Object.values(draftChanges).map((ch) => ({
        ...ch,
        pic: state.userPic
      }))
    );
    setDraftChanges({});
    setShowCommitConfirm(false);
    toast.success(`Tersimpan ${count} mutasi roda`);
  };

  return (
    <div className="space-y-6">
      {/* Selector & Asset Info Header */}
      <Card className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1">
              Tap Roda & Rotasi
            </div>
            <h1 className="text-xl font-bold text-[#0F172A]">
              Manajemen Posisi Ban
            </h1>
            <p className="text-xs text-[#475569] mt-1">
              Pilih posisi roda pada diagram untuk mengganti atau memutasi ban armada.
            </p>
          </div>

          {/* Unit Category Selector */}
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <Button
              type="button"
              variant={unitType === 'TRUK' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setUnitType('TRUK');
                if (state.trucks[0]) setSelectedUnitId(state.trucks[0].idUnit);
                setDraftChanges({});
              }}
            >
              <Truck className="w-4 h-4 mr-1.5" />
              <span>Armada Truk</span>
            </Button>
            <Button
              type="button"
              variant={unitType === 'CHASSIS' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setUnitType('CHASSIS');
                if (state.chassis[0]) setSelectedUnitId(state.chassis[0].idUnit);
                setDraftChanges({});
              }}
            >
              <Layers className="w-4 h-4 mr-1.5" />
              <span>Chassis Trailer</span>
            </Button>
          </div>
        </div>

        {/* Selected Unit Details & Odometer Input */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-[#0F172A] tracking-wider mb-1">
              Pilih {unitType === 'TRUK' ? 'Nopol Truk' : 'Kode Chassis'}
            </label>
            <select
              value={selectedUnitId}
              onChange={(e) => {
                setSelectedUnitId(e.target.value);
                setDraftChanges({});
                const t = state.trucks.find((x) => x.idUnit === e.target.value);
                if (t) setOdometerInput(t.kmSaatIni);
              }}
              className="w-full h-9 bg-white border border-[#E2E8F0] rounded-[6px] px-3 text-xs font-mono font-semibold text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
            >
              {unitType === 'TRUK'
                ? state.trucks
                    .filter((t) => t.statusServis !== 'AFKIR')
                    .map((t) => (
                      <option key={t.idUnit} value={t.idUnit}>
                        {t.idUnit} ({t.noLambung} - {t.jenisArmada})
                      </option>
                    ))
                : state.chassis
                    .filter((c) => c.statusServis !== 'AFKIR')
                    .map((c) => (
                      <option key={c.idUnit} value={c.idUnit}>
                        {c.idUnit} ({c.tipeChassis})
                      </option>
                    ))}
            </select>
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] p-3 flex flex-col justify-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mb-0.5">
              Standar Ukuran Ban
            </div>
            <div className="text-sm font-mono font-bold text-[#0F172A] tabular-nums">
              {targetBanSize}
            </div>
            <div className="text-xs text-[#475569] mt-0.5">
              Hanya ban {targetBanSize} yang cocok
            </div>
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] p-3 flex flex-col justify-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mb-0.5">
              Konfigurasi Roda
            </div>
            <div className="text-sm font-mono font-bold text-[#0F172A]">{detectedLayout}</div>
            <div className="text-xs text-[#475569] mt-0.5">
              {Object.keys(installedTiresMap).length} roda aktif terpasang
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-[#0F172A] tracking-wider mb-1">
              Odometer Terkini (KM)
            </label>
            <input
              type="number"
              value={odometerInput || currentTruck?.kmSaatIni || 0}
              onChange={(e) => setOdometerInput(Number(e.target.value))}
              placeholder="0"
              className="w-full h-9 bg-white border border-[#E2E8F0] rounded-[6px] px-3 text-xs font-mono font-semibold text-[#0F172A] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
            />
          </div>
        </div>
      </Card>

      {/* Blueprint Visualizer Stage */}
      <div className="bmi-blueprint-grid bg-[#0A2547] text-white rounded-[10px] p-6 relative overflow-hidden border border-[#073E7F] shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8 border-b border-[#073E7F] pb-4">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-xs bg-[#0F172A] border border-[#D19F0F] text-[#D19F0F] px-2.5 py-1 rounded-[6px] tabular-nums">
              {selectedUnitId}
            </span>
            <span className="text-xs text-slate-300 font-medium">
              {unitType === 'TRUK' ? currentTruck?.jenisArmada : currentChassis?.tipeChassis}
            </span>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#059669]" />
              <span>Normal Terpasang</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#D19F0F]" />
              <span>Draf Diubah</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] border border-dashed border-[#DC2626] bg-[#DC2626]/20" />
              <span>Kosong</span>
            </div>
          </div>
        </div>

        {/* Blueprint Chassis Spine & Axles */}
        <div className="max-w-md mx-auto relative py-6">
          {/* Cabin Silhouette */}
          <div className="w-36 h-10 mx-auto mb-8 bg-[#0F172A] border border-[#D19F0F]/60 rounded-[6px] flex items-center justify-center font-mono font-bold text-xs tracking-wider text-[#D19F0F]">
            {unitType === 'TRUK' ? 'KABIN TRUK' : 'HEAD TRAILER'}
          </div>

          {/* Center Chassis Spine Tube */}
          <div className="absolute left-1/2 -translate-x-1/2 top-16 bottom-8 w-3 bg-[#0F172A] border-x border-[#073E7F] z-0" />

          {/* Axle Groups */}
          <div className="space-y-12 relative z-10">
            {getAxleGroups().map((group, gIdx) => (
              <div key={gIdx} className="space-y-2">
                <div className="text-xs font-mono font-semibold text-slate-300 text-center">
                  {group.label}
                </div>

                {group.pairs.map((pair, pIdx) => (
                  <div key={pIdx} className="flex items-center justify-between px-2">
                    {/* Left Wheels */}
                    <div className="flex gap-2">
                      {pair.left.map((pos) => {
                        const ban = installedTiresMap[pos];
                        const isDraft = draftChanges[pos] !== undefined;
                        let displayId = ban ? ban.idBanFisik : 'KOSONG';
                        if (isDraft && draftChanges[pos].idBanBaru) {
                          displayId = draftChanges[pos].idBanBaru;
                        }

                        return (
                          <button
                            key={pos}
                            type="button"
                            aria-label={`Posisi ${pos} - ${displayId}`}
                            onClick={() => handleOpenTapModal(pos)}
                            className={`w-14 h-24 rounded-[6px] flex flex-col justify-between items-center p-1.5 transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D19F0F] ${
                              isDraft
                                ? 'bg-[#D19F0F]/20 border-2 border-[#D19F0F]'
                                : ban
                                ? 'bg-[#0F172A] border-2 border-[#059669] hover:border-emerald-400'
                                : 'bg-[#DC2626]/20 border-2 border-dashed border-[#DC2626] hover:bg-[#DC2626]/30'
                            }`}
                          >
                            <span className="font-mono font-bold text-xs px-1 py-0.5 rounded-[4px] bg-[#0A2547] text-[#D19F0F] w-full text-center">
                              {pos}
                            </span>
                            <span className="font-mono text-xs font-bold text-center leading-tight truncate w-full text-slate-100 tabular-nums">
                              {displayId}
                            </span>
                            <span className="text-xs font-medium text-slate-300 truncate w-full text-center">
                              {isDraft ? 'Draf' : ban ? ban.ukuran : '+ Pasang'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Axle Rod Line */}
                    <div className="flex-1 h-1.5 bg-[#0F172A] border-y border-[#073E7F] mx-2" />

                    {/* Right Wheels */}
                    <div className="flex gap-2">
                      {pair.right.map((pos) => {
                        const ban = installedTiresMap[pos];
                        const isDraft = draftChanges[pos] !== undefined;
                        let displayId = ban ? ban.idBanFisik : 'KOSONG';
                        if (isDraft && draftChanges[pos].idBanBaru) {
                          displayId = draftChanges[pos].idBanBaru;
                        }

                        return (
                          <button
                            key={pos}
                            type="button"
                            aria-label={`Posisi ${pos} - ${displayId}`}
                            onClick={() => handleOpenTapModal(pos)}
                            className={`w-14 h-24 rounded-[6px] flex flex-col justify-between items-center p-1.5 transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D19F0F] ${
                              isDraft
                                ? 'bg-[#D19F0F]/20 border-2 border-[#D19F0F]'
                                : ban
                                ? 'bg-[#0F172A] border-2 border-[#059669] hover:border-emerald-400'
                                : 'bg-[#DC2626]/20 border-2 border-dashed border-[#DC2626] hover:bg-[#DC2626]/30'
                            }`}
                          >
                            <span className="font-mono font-bold text-xs px-1 py-0.5 rounded-[4px] bg-[#0A2547] text-[#D19F0F] w-full text-center">
                              {pos}
                            </span>
                            <span className="font-mono text-xs font-bold text-center leading-tight truncate w-full text-slate-100 tabular-nums">
                              {displayId}
                            </span>
                            <span className="text-xs font-medium text-slate-300 truncate w-full text-center">
                              {isDraft ? 'Draf' : ban ? ban.ukuran : '+ Pasang'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Draft Mutations Staging Panel */}
        {Object.keys(draftChanges).length > 0 && (
          <div className="mt-8 pt-6 border-t border-[#073E7F] bg-[#0F172A] p-4 rounded-[6px]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-[#D19F0F]">
                  Draf Perubahan Roda ({Object.keys(draftChanges).length} Posisi)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDraftChanges({})}
                className="text-xs text-slate-300 hover:text-white cursor-pointer transition-colors duration-150 ease-out"
              >
                Reset Semua Draf
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-4">
              {Object.values(draftChanges).map((ch) => (
                <div
                  key={ch.posisi}
                  className="bg-[#0A2547] border border-[#073E7F] p-2.5 rounded-[6px] text-xs flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-[#D19F0F] mr-2">Pos {ch.posisi}</span>
                    <span className="text-slate-200 font-mono">
                      Lepas ({ch.idBanLama || 'Kosong'}) &rarr; Pasang ({ch.idBanBaru || 'Kosong'})
                    </span>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Tindakan: {ch.aksiBanLama}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Hapus draf posisi ${ch.posisi}`}
                    onClick={() => handleRemoveDraftItem(ch.posisi)}
                    className="text-slate-400 hover:text-[#DC2626] p-1 cursor-pointer transition-colors duration-150 ease-out"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="text-right">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleCommitBatch}
              >
                Simpan Semua Perubahan ({Object.keys(draftChanges).length} Posisi)
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Tap Roda (Ganti / Pasang Ban Per Posisi) */}
      <Modal
        isOpen={!!activeModalPos}
        onClose={() => setActiveModalPos(null)}
        title={`Posisi Roda ${activeModalPos || ''}`}
        subtitle={`Unit Armada ${selectedUnitId}`}
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setShowRecommendation(true)}
              leftIcon={<Sparkles className="w-4 h-4 text-[#073E7F]" />}
            >
              Rekomendasi
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setActiveModalPos(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSaveToDraft}
            >
              Simpan ke Draf
            </Button>
          </>
        }
      >
        {activeModalPos && (
          <div className="space-y-4">
            {/* Current Installed Tire Info */}
            {installedTiresMap[activeModalPos] ? (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] p-3.5 text-xs">
                <div className="font-bold text-[#0F172A] mb-1">Ban Terpasang Saat Ini:</div>
                <div className="font-mono text-sm font-bold text-[#0F172A] tabular-nums">
                  {installedTiresMap[activeModalPos].idBanFisik}
                </div>
                <div className="text-[#475569] text-xs mt-0.5 font-mono">
                  Ukuran: {installedTiresMap[activeModalPos].ukuran} · Merk:{' '}
                  {installedTiresMap[activeModalPos].merk} · DOT:{' '}
                  {installedTiresMap[activeModalPos].dot}
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#E2E8F0]">
                  <label className="block text-xs font-semibold uppercase text-[#0F172A] tracking-wider mb-1">
                    Tindakan untuk Ban Lama yang Dilepas:
                  </label>
                  <select
                    value={modalAksiLama}
                    onChange={(e) => setModalAksiLama(e.target.value as any)}
                    className="w-full h-9 bg-white border border-[#E2E8F0] rounded-[6px] px-2.5 text-xs font-semibold text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
                  >
                    <option value="GUDANG">Simpan ke Gudang (Proses Velg)</option>
                    <option value="SERVIS">Kirim ke Vendor Vulkanisir</option>
                    <option value="AFKIR">Afkir / Dibuang (Scrap)</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="bg-[#FFFBEB] border border-[#D97706]/30 text-[#D97706] rounded-[6px] p-3 text-xs flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-[#D97706]" />
                <span>Posisi ini sedang kosong. Pilih ban pengganti dari stok gudang di bawah.</span>
              </div>
            )}

            {/* Select New Tire from Storage (Strict size matching & FIFO) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase text-[#0F172A] tracking-wider">
                  Pilih Ban Pengganti
                </label>
                <span className="text-xs text-[#475569] font-mono font-semibold">
                  Ukuran: {targetBanSize}
                </span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchStorageTire}
                  onChange={(e) => setSearchStorageTire(e.target.value)}
                  placeholder="Cari ID fisik, merk, DOT…"
                  className="w-full h-9 pl-9 pr-3 bg-white border border-[#E2E8F0] rounded-[6px] text-xs font-medium text-[#0F172A] placeholder-[#94A3B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
                />
              </div>

              {/* Warehouse Table with FIFO Highlighting */}
              <div className="max-h-56 overflow-y-auto border border-[#E2E8F0] rounded-[6px] divide-y divide-[#E2E8F0] text-xs">
                {filteredStorageTires.length === 0 ? (
                  <div className="p-6 text-center text-[#475569] text-xs">
                    Tidak ada ban ukuran {targetBanSize} yang berstatus Ready Pasang di gudang.
                  </div>
                ) : (
                  filteredStorageTires.map((tire, idx) => {
                    const isSelected = modalSelectedNewTireId === tire.idBanFisik;
                    const isFifoRecommended = idx === 0 && !searchStorageTire;

                    return (
                      <div
                        key={tire.idBanFisik}
                        onClick={() => setModalSelectedNewTireId(tire.idBanFisik)}
                        className={`p-3 flex items-center justify-between cursor-pointer transition-colors duration-150 ease-out ${
                          isSelected
                            ? 'bg-[#FEF3C7] border-l-4 border-l-[#D19F0F]'
                            : isFifoRecommended
                            ? 'bg-[#ECFDF5] hover:bg-[#D1FAE5]'
                            : 'hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#0F172A] tabular-nums">
                              {tire.idBanFisik}
                            </span>
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded-[4px] bg-[#F1F5F9] text-[#475569]">
                              {tire.ukuran}
                            </span>
                            {isFifoRecommended && (
                              <Badge variant="success">FIFO DOT Terlama</Badge>
                            )}
                          </div>
                          <div className="text-xs text-[#475569] mt-0.5 font-mono">
                            {tire.merk} · DOT {tire.dot} · Siklus {tire.siklus}
                          </div>
                        </div>

                        <div className="font-mono font-bold text-xs">
                          {isSelected && <Check className="w-4 h-4 text-[#D97706]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Currently Selected Replacement */}
              {modalSelectedNewTireId ? (
                <div className="p-2.5 rounded-[6px] bg-[#F8FAFC] border border-[#E2E8F0] text-xs flex items-center justify-between font-mono">
                  <span>
                    Terpilih: <b>{modalSelectedNewTireId}</b>
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalSelectedNewTireId('')}
                    className="text-[#DC2626] hover:underline text-xs font-semibold cursor-pointer"
                  >
                    Batal Pilih
                  </button>
                </div>
              ) : (
                <div className="text-xs text-[#94A3B8] italic">
                  * Jika tidak memilih ban pengganti, posisi akan dibiarkan kosong.
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Rekomendasi Bundle Ban (inline flow, tanpa halaman baru) */}
      <Modal
        isOpen={showRecommendation && !!activeModalPos}
        onClose={() => setShowRecommendation(false)}
        title="Rekomendasi Ban"
        subtitle={`Posisi ${activeModalPos} · ${selectedUnitId} · ukuran ${targetBanSize}`}
        size="lg"
      >
        <div className="space-y-2">
          {recommendation.options.map((opt) => (
            <div
              key={opt.type}
              className={`rounded-[6px] border p-3 ${
                opt.valid
                  ? 'border-[#E2E8F0] bg-white'
                  : 'border-[#E2E8F0] bg-[#F8FAFC] opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#0F172A]">{opt.label}</span>
                    <Badge
                      variant={
                        opt.riskLevel === 'LOW'
                          ? 'success'
                          : opt.riskLevel === 'MEDIUM'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      Risk {opt.riskLevel}
                    </Badge>
                    <span className="text-[11px] font-mono text-[#475569] tabular-nums">
                      Rp {opt.estimasiBiaya.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#475569] mt-1 leading-relaxed">
                    {opt.reasons[0]}
                    {!opt.valid && opt.invalidReason ? ` · ${opt.invalidReason}` : ''}
                  </div>
                  {opt.valid && opt.items[0] && (
                    <div className="text-[11px] font-mono text-[#94A3B8] mt-1">
                      {opt.items.map((i) => i.idBanFisik).join(' · ')}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant={opt.valid ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={!opt.valid}
                  onClick={() => handleApplyBundle(opt)}
                >
                  {opt.valid ? 'Terapkan' : 'Tidak Valid'}
                </Button>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-[#94A3B8] italic">
            Bundle 2 ban: item pertama dipakai untuk posisi ini, item berikutnya untuk posisi sepasang.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showCommitConfirm}
        onClose={() => setShowCommitConfirm(false)}
        onConfirm={executeCommitBatch}
        title="Simpan Mutasi Ban"
        message={`Simpan ${Object.keys(draftChanges).length} mutasi roda untuk unit ${selectedUnitId}? Perubahan dicatat langsung ke log sistem.`}
        confirmLabel="Simpan Mutasi"
        variant="primary"
      />
    </div>
  );
};
