import React, { useState } from 'react';
import {
  Search,
  Check,
  CheckCircle2,
  Sparkles,
  Layers
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import {
  isWarehouseTire,
  isReadyWarehouseTire,
  normalizeTireSize
} from '../../services/liveSheetSync';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import { toast } from '../ui/Toast';

export const WarehouseStock: React.FC = () => {
  const { state, updateBanToReadyBatch } = useWorkshopStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [sizeFilter, setSizeFilter] = useState<string>('ALL');
  const [cycleFilter, setCycleFilter] = useState<string>('ALL');
  const [sortMode, setSortMode] = useState<'dotOld' | 'dotNew' | 'id'>('dotOld');

  // Selected for Set Ready Cart
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showReviewSheet, setShowReviewSheet] = useState(false);

  // All Warehouse Tires (Gudang SBY + Bengkel SBY with status 'Spare / Gudang')
  const allWarehouseTires = state.tires.filter((b) => isWarehouseTire(b));

  // Unready Tires (Gudang/Bengkel and not ready pasang)
  const unreadyTires = allWarehouseTires.filter((b) => !isReadyWarehouseTire(b));

  // Ready Tires count for stats
  const readyTires = allWarehouseTires.filter((b) => isReadyWarehouseTire(b));

  // DOT parser (supports full SN like 1NL2JA1LT2424 -> extracts last 4 digits WWYY)
  const parseDot = (dotRaw: string) => {
    const s = String(dotRaw || '').trim();
    const m = s.match(/(\d{2})(\d{2})$/);
    if (!m) return { text: s || '-', key: 999999, ageYears: 0, isOld: false };
    const wk = parseInt(m[1], 10);
    const yr = 2000 + parseInt(m[2], 10);
    const date = new Date(yr, 0, 1 + (wk - 1) * 7);
    const ageYears = (new Date().getTime() - date.getTime()) / (1000 * 3600 * 24 * 365.25);
    return {
      text: s,
      key: yr * 100 + wk,
      ageYears: Math.max(0, ageYears),
      isOld: ageYears >= 5
    };
  };

  // Filtered & Sorted
  const filteredRows = unreadyTires
    .filter((b) => {
      const cleanSize = normalizeTireSize(b.ukuran);
      if (sizeFilter !== 'ALL' && cleanSize !== sizeFilter) return false;
      if (cycleFilter !== 'ALL' && b.siklus !== cycleFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        b.idBanFisik.toLowerCase().includes(q) ||
        b.merk.toLowerCase().includes(q) ||
        b.dot.toLowerCase().includes(q) ||
        cleanSize.toLowerCase().includes(q) ||
        b.unitTerpasang.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const dotA = parseDot(a.dot).key;
      const dotB = parseDot(b.dot).key;
      if (sortMode === 'dotOld') return dotA - dotB;
      if (sortMode === 'dotNew') return dotB - dotA;
      return a.idBanFisik.localeCompare(b.idBanFisik);
    });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedIds);
    filteredRows.forEach((r) => next.add(r.idBanFisik));
    setSelectedIds(next);
  };

  const handleCommitSetReady = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    updateBanToReadyBatch(Array.from(selectedIds));
    setSelectedIds(new Set());
    setShowReviewSheet(false);
    toast.success(`Berhasil set ready ${count} ban`);
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats Card */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1">
              Inventaris Gudang Ban
            </div>
            <h1 className="text-xl font-bold text-[#0F172A]">
              Proses Set Ready Ban
            </h1>
            <p className="text-xs text-[#475569] mt-1">
              Ban yang selesai diservis atau dilepas perlu dipasang velg sebelum siap pakai.
            </p>
          </div>

          {selectedIds.size > 0 && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setShowReviewSheet(true)}
              className="self-start sm:self-auto"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              <span>Tinjau Set Ready ({selectedIds.size})</span>
            </Button>
          )}
        </div>

        {/* 4 Metric Summary Boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-[#0A2547] text-white border border-[#073E7F] rounded-[10px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#D19F0F] mb-1">
              Total Ban Gudang
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {allWarehouseTires.length}{' '}
              <span className="text-xs font-normal text-slate-300">Unit</span>
            </div>
            <div className="text-xs text-slate-300 mt-1">
              Posisi gudang dan bengkel
            </div>
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1">
              Menunggu Pasang Velg
            </div>
            <div className="text-2xl font-bold font-mono text-[#D97706] tabular-nums">
              {unreadyTires.length} <span className="text-xs font-normal text-[#475569]">Ban</span>
            </div>
            <div className="text-xs text-[#475569] mt-1">
              Belum siap pakai di armada
            </div>
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1">
              Siap Pasang
            </div>
            <div className="text-2xl font-bold font-mono text-[#059669] tabular-nums">
              {readyTires.length} <span className="text-xs font-normal text-[#475569]">Ban</span>
            </div>
            <div className="text-xs text-[#475569] mt-1">
              Siap untuk rotasi unit
            </div>
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1">
              Terpilih di Keranjang
            </div>
            <div className="text-2xl font-bold font-mono text-[#0A2547] tabular-nums">
              {selectedIds.size} <span className="text-xs font-normal text-[#475569]">Ban</span>
            </div>
            <div className="text-xs text-[#475569] mt-1">
              Siap diubah statusnya
            </div>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-3 pt-6 border-t border-[#E2E8F0]">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari ID ban, merk, DOT…"
              className="w-full h-9 pl-9 pr-3 bg-white border border-[#E2E8F0] rounded-[6px] text-xs font-medium text-[#0F172A] placeholder-[#94A3B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="h-9 bg-white border border-[#E2E8F0] text-[#0F172A] text-xs font-semibold rounded-[6px] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
            >
              <option value="ALL">Ukuran: Semua</option>
              <option value="1000">1000</option>
              <option value="750">750</option>
              <option value="R14">R14</option>
              <option value="R16">R16</option>
            </select>

            <select
              value={cycleFilter}
              onChange={(e) => setCycleFilter(e.target.value)}
              className="h-9 bg-white border border-[#E2E8F0] text-[#0F172A] text-xs font-semibold rounded-[6px] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
            >
              <option value="ALL">Siklus: Semua</option>
              <option value="R0">R0 (Baru)</option>
              <option value="R1">R1 (Vulkanisir 1)</option>
              <option value="R2">R2 (Vulkanisir 2)</option>
              <option value="RJ">RJ (Jasa Vulkanisir)</option>
            </select>

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as any)}
              className="h-9 bg-white border border-[#E2E8F0] text-[#0F172A] text-xs font-semibold rounded-[6px] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073E7F]"
            >
              <option value="dotOld">Urutkan: DOT Terlama (FIFO)</option>
              <option value="dotNew">Urutkan: DOT Terbaru</option>
              <option value="id">Urutkan: ID Ban A–Z</option>
            </select>

            {filteredRows.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={selectAllFiltered}
              >
                Pilih Semua ({filteredRows.length})
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Cards Grid */}
      {filteredRows.length === 0 ? (
        <Card className="p-12">
          <EmptyState
            icon={Layers}
            title="Tidak Ada Ban Menunggu"
            description="Semua ban di gudang sudah dalam kondisi siap pasang atau filter tidak cocok."
            actionLabel="Reset Pencarian"
            onAction={() => {
              setSearchQuery('');
              setSizeFilter('ALL');
              setCycleFilter('ALL');
            }}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRows.map((tire, idx) => {
            const isSelected = selectedIds.has(tire.idBanFisik);
            const dotInfo = parseDot(tire.dot);
            const isFifoOldest = idx === 0 && sortMode === 'dotOld' && !searchQuery;

            return (
              <div
                key={tire.idBanFisik}
                onClick={() => toggleSelect(tire.idBanFisik)}
                className={`bg-white border rounded-[10px] p-4 cursor-pointer transition-colors duration-150 ease-out shadow-[0_1px_3px_rgba(15,23,42,0.08)] ${
                  isSelected
                    ? 'border-[#059669] bg-[#ECFDF5]/40 ring-1 ring-[#059669]'
                    : 'border-[#E2E8F0] hover:border-[#94A3B8]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-[4px] border flex items-center justify-center transition-colors duration-150 ease-out ${
                        isSelected
                          ? 'bg-[#059669] border-[#059669] text-white'
                          : 'border-[#E2E8F0] bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="font-mono font-bold text-sm text-[#0F172A] tabular-nums">
                        {tire.idBanFisik}
                      </div>
                      <div className="text-xs text-[#475569]">{tire.merk}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <Badge variant="neutral">{tire.ukuran}</Badge>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-[#475569]">Siklus:</span>{' '}
                    <span className="font-bold text-[#0F172A]">{tire.siklus}</span>
                  </div>
                  <div>
                    <span className="text-[#475569]">DOT:</span>{' '}
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded-[4px] ${
                        dotInfo.isOld ? 'bg-[#FEE2E2] text-[#DC2626]' : 'bg-[#F1F5F9] text-[#0F172A]'
                      }`}
                    >
                      {tire.dot}
                    </span>
                    <span className="text-xs text-[#475569] ml-1">
                      ({dotInfo.ageYears.toFixed(1)} thn)
                    </span>
                  </div>
                </div>

                {isFifoOldest && (
                  <div className="mt-3 text-xs font-semibold text-[#059669] bg-[#ECFDF5] py-1 px-2 rounded-[6px] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#059669]" />
                    <span>Prioritas FIFO: DOT Tertua</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Review & Set Ready Confirmation */}
      <Modal
        isOpen={showReviewSheet}
        onClose={() => setShowReviewSheet(false)}
        title="Konfirmasi Set Ready Velg"
        subtitle={`Total ${selectedIds.size} ban terpilih`}
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setShowReviewSheet(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleCommitSetReady}
            >
              Proses Set Ready ({selectedIds.size})
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-[#475569]">
            Pastikan velg sudah terpasang dengan torsi standar pada ban terpilih berikut:
          </p>

          {/* Selected items list */}
          <div className="max-h-60 overflow-y-auto divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-[6px]">
            {Array.from(selectedIds).map((id) => {
              const b = state.tires.find((x) => x.idBanFisik === id);
              if (!b) return null;
              return (
                <div key={id} className="p-3 text-xs flex items-center justify-between">
                  <div>
                    <div className="font-mono font-bold text-[#0F172A] tabular-nums">{b.idBanFisik}</div>
                    <div className="text-xs text-[#475569]">
                      {b.ukuran} · {b.merk} · DOT {b.dot} · Siklus {b.siklus}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSelect(id)}
                    className="text-[#DC2626] hover:underline text-xs font-semibold cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-[#FFFBEB] border border-[#D97706]/30 rounded-[6px] text-xs text-[#D97706]">
            Status ban akan otomatis berubah menjadi <b>Ready Pasang</b> dan tersedia pada blueprint rotasi roda armada.
          </div>
        </div>
      </Modal>
    </div>
  );
};
