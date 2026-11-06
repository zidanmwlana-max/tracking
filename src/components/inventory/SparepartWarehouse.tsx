import React, { useState } from 'react';
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  ArrowDownToLine,
  Filter
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import { MasterPart } from '../../types';
import { getStoredAuthSession, isFeatureAllowedForUser } from '../../services/authSession';
import { FeatureAccessGuard } from '../auth/FeatureAccessGuard';
import { toast } from '../ui/Toast';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import {
  TableContainer,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell
} from '../ui/Table';
import { formatSpecLabel, summarizePartPrices } from '../../domain/sparepartPricing';
import { getPartPriceOffers, savePartPriceOffer } from '../../services/partPriceStore';

export const SparepartWarehouse: React.FC = () => {
  const {
    state,
    processPartApproval,
    registerNewMasterPart,
    processInboundPart
  } = useWorkshopStore();
  const currentUser = getStoredAuthSession();
  const hasInventoryAccess = isFeatureAllowedForUser(currentUser, 'inventory');

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Sub-section internal (bukan tab navigasi utama)
  const [activeSection, setActiveSection] = useState<'KATALOG' | 'HARGA'>('KATALOG');
  const [priceVersion, setPriceVersion] = useState(0);
  const [offerForm, setOfferForm] = useState({
    sku: '',
    vendor: '',
    merk: '',
    hargaSatuan: 0,
    tanggal: new Date().toISOString().slice(0, 10)
  });

  const offers = getPartPriceOffers();
  void priceVersion;

  const handleSaveOffer = () => {
    if (!offerForm.sku || !offerForm.vendor || !offerForm.merk || offerForm.hargaSatuan <= 0) {
      toast.error('Kode material, vendor, merk, dan harga wajib diisi.');
      return;
    }
    savePartPriceOffer(offerForm);
    setOfferForm({ ...offerForm, hargaSatuan: 0 });
    setPriceVersion((v) => v + 1);
    toast.success('Penawaran harga tersimpan');
  };

  // Modals
  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const [showInboundModal, setShowInboundModal] = useState(false);

  // Add Part Form
  const [newPartForm, setNewPartForm] = useState<MasterPart>({
    sku: '',
    kategori: 'Oli & Pelumas',
    nama: '',
    harga: 0,
    stok: 0,
    min: 5
  });

  // Inbound Form
  const [inboundForm, setInboundForm] = useState({
    sku: state.parts[0]?.sku || '',
    qty: 1,
    totalInvoice: 0
  });

  const categories = [
    'Oli & Pelumas',
    'Filter',
    'Sistem Rem',
    'Chassis',
    'Kelistrikan',
    'Kaki-Kaki',
    'Mesin',
    'Lainnya'
  ];

  // Pending Requests (Awaiting approval)
  const pendingRequests = state.partRequests.filter(
    (p) => p.status === 'Menunggu Approval Supervisor'
  );

  // Filtered Parts
  const filteredParts = state.parts.filter((p) => {
    if (categoryFilter !== 'ALL' && p.kategori !== categoryFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.sku.toLowerCase().includes(q) || p.nama.toLowerCase().includes(q);
  });

  const criticalStockCount = state.parts.filter((p) => p.stok <= p.min).length;

  const handleSaveNewPart = () => {
    if (!newPartForm.sku.trim() || !newPartForm.nama.trim()) {
      toast.error('SKU dan nama suku cadang wajib diisi');
      return;
    }
    try {
      registerNewMasterPart({
        ...newPartForm,
        sku: newPartForm.sku.toUpperCase().trim()
      });
      setShowAddPartModal(false);
      setNewPartForm({
        sku: '',
        kategori: 'Oli & Pelumas',
        nama: '',
        harga: 0,
        stok: 0,
        min: 5
      });
      toast.success('Suku cadang berhasil disimpan');
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan suku cadang');
    }
  };

  const handleSaveInbound = () => {
    if (!inboundForm.sku || inboundForm.qty <= 0) {
      toast.error('Pilih SKU dan kuantitas yang valid');
      return;
    }
    try {
      processInboundPart(inboundForm.sku, inboundForm.qty, inboundForm.totalInvoice);
      setShowInboundModal(false);
      setInboundForm({
        sku: state.parts[0]?.sku || '',
        qty: 1,
        totalInvoice: 0
      });
      toast.success('Barang masuk berhasil disimpan');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses barang masuk');
    }
  };

  if (!hasInventoryAccess) {
    return (
      <FeatureAccessGuard
        feature="inventory"
        featureTitle="Kontrol Inventaris & Persetujuan Suku Cadang (Inventory)"
        currentUser={currentUser}
      >
        <div />
      </FeatureAccessGuard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#073E7F] mb-1">
                Gudang & Logistik Suku Cadang
              </div>
              <h1 className="text-xl font-bold text-[#0F172A]">
                Kontrol Inventaris & Persetujuan Part
              </h1>
              <p className="text-xs text-[#475569] mt-1">
                Katalog SKU master sparepart, approval permintaan mekanik untuk Work Order aktif, dan
                pencatatan barang masuk (inbound restock).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (state.parts[0]) setInboundForm({ sku: state.parts[0].sku, qty: 1, totalInvoice: 0 });
                  setShowInboundModal(true);
                }}
                leftIcon={<ArrowDownToLine className="w-4 h-4 text-[#073E7F]" />}
              >
                Inbound Barang Masuk
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAddPartModal(true)}
                leftIcon={<Plus className="w-4 h-4 text-[#D19F0F]" />}
              >
                Tambah Master Part
              </Button>
            </div>
          </div>

          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4">
              <div className="text-xs font-semibold uppercase text-[#64748B] mb-1">
                Total Master SKU
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[#0F172A]">
                {state.parts.length} <span className="text-sm font-normal text-[#64748B]">Item</span>
              </div>
              <div className="text-xs text-[#64748B] mt-0.5">
                Tercatat di katalog resmi BMI
              </div>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4">
              <div className="text-xs font-semibold uppercase text-[#64748B] mb-1">
                Stok Kritis / Di Bawah Batas
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[#D97706]">
                {criticalStockCount} <span className="text-sm font-normal text-[#64748B]">Item</span>
              </div>
              <div className="text-xs text-[#64748B] mt-0.5">
                Perlu segera pemesanan ulang
              </div>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4">
              <div className="text-xs font-semibold uppercase text-[#64748B] mb-1">
                Permintaan Menunggu Approval
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[#073E7F]">
                {pendingRequests.length} <span className="text-sm font-normal text-[#64748B]">Pengajuan</span>
              </div>
              <div className="text-xs text-[#64748B] mt-0.5">
                Dari mekanik untuk WO aktif
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sub-section internal: Katalog & Stok | Penawaran Harga (Vendor) */}
      <div className="flex items-center gap-1.5 p-1 bg-[#F1F5F9] rounded-lg w-fit">
        {[
          { id: 'KATALOG' as const, label: 'Katalog & Stok' },
          { id: 'HARGA' as const, label: 'Penawaran Harga (Vendor)' }
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSection(s.id)}
            aria-pressed={activeSection === s.id}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
              activeSection === s.id
                ? 'bg-white text-[#073E7F] shadow-sm'
                : 'text-[#475569] hover:text-[#073E7F]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={activeSection === 'KATALOG' ? 'space-y-6' : 'hidden'}>

      {/* SECTION: PENDING PART APPROVALS TABLE */}
      {pendingRequests.length > 0 && (
        <Card className="border-[#FDE68A] bg-[#FFFBEB]/30">
          <CardHeader className="bg-[#FFFBEB]/60 border-b border-[#FDE68A]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D97706]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#92400E]">
                Menunggu Persetujuan Supervisor ({pendingRequests.length})
              </h2>
            </div>
            <span className="text-xs text-[#B45309]">
              Stok otomatis terpotong dari gudang saat disetujui
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <TableContainer className="rounded-none border-0 shadow-none">
              <Table>
                <TableHead className="bg-[#FEF3C7]">
                  <TableRow>
                    <TableHeaderCell>Waktu & Mekanik</TableHeaderCell>
                    <TableHeaderCell>WO & Unit</TableHeaderCell>
                    <TableHeaderCell>Nama Suku Cadang</TableHeaderCell>
                    <TableHeaderCell>Qty</TableHeaderCell>
                    <TableHeaderCell>Total Biaya</TableHeaderCell>
                    <TableHeaderCell className="text-right">Keputusan</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingRequests.map((req) => (
                    <TableRow key={req.txId}>
                      <TableCell>
                        <div className="font-semibold text-[#0F172A]">{req.mekanik}</div>
                        <div className="text-xs text-[#64748B] font-mono tabular-nums">{req.ts}</div>
                      </TableCell>
                      <TableCell className="font-mono">
                        <div className="font-bold text-[#0F172A]">{req.nopol}</div>
                        <div className="text-xs text-[#64748B]">{req.woId}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-[#1E293B]">{req.namaPart}</div>
                        <div className="text-xs font-mono text-[#64748B]">{req.sku}</div>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums font-bold text-[#1E293B]">
                        {req.qty} pcs
                      </TableCell>
                      <TableCell className="font-mono tabular-nums font-bold text-[#0F172A]">
                        Rp {req.total.toLocaleString('id-ID')}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => processPartApproval(req.txId, 'Approved')}
                          className="text-[#059669] border-[#A7F3D0] hover:bg-[#ECFDF5]"
                        >
                          Setujui
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => processPartApproval(req.txId, 'Rejected')}
                        >
                          Tolak
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* MASTER PARTS CATALOGUE TABLE */}
      <Card>
        <CardHeader>
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari SKU atau nama sparepart..."
              className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs font-medium focus:bg-white focus:outline-none focus:border-[#073E7F] focus:ring-1 focus:ring-[#073E7F]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#64748B]" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155] text-xs font-semibold rounded-[6px] px-3 py-2 focus:outline-none focus:border-[#073E7F]"
            >
              <option value="ALL">Kategori: Semua</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <TableContainer className="rounded-none border-0 shadow-none max-h-[520px]">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Kode SKU</TableHeaderCell>
                  <TableHeaderCell>Nama Sparepart & Kategori</TableHeaderCell>
                  <TableHeaderCell>Harga Satuan</TableHeaderCell>
                  <TableHeaderCell>Stok Aktual</TableHeaderCell>
                  <TableHeaderCell>Batas Kritis</TableHeaderCell>
                  <TableHeaderCell className="text-right">Status Stok</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredParts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-[#64748B]">
                      Tidak ada suku cadang yang cocok dengan filter pencarian.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParts.map((part) => {
                    const isCritical = part.stok <= part.min;
                    return (
                      <TableRow key={part.sku}>
                        <TableCell className="font-mono text-xs font-bold text-[#0F172A]">
                          {part.sku}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-[#1E293B]">{part.nama}</div>
                          <div className="text-xs text-[#64748B]">{part.kategori}</div>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-xs font-medium text-[#334155]">
                          Rp {part.harga.toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-sm font-bold">
                          <span className={isCritical ? 'text-[#DC2626]' : 'text-[#0F172A]'}>
                            {part.stok}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-xs text-[#64748B]">
                          {part.min} pcs
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={isCritical ? 'danger' : 'success'}>
                            {isCritical ? 'Stok Kritis' : 'Aman'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* RIWAYAT TRANSAKSI & PENGGUNAAN SUKU CADANG (PART LOG) */}
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">
              Riwayat Transaksi & Penggunaan Suku Cadang ({state.partRequests.length})
            </h2>
            <p className="text-xs text-[#64748B]">
              Catatan pengeluaran dan pemakaian suku cadang untuk unit armada.
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <TableContainer className="rounded-none border-0 shadow-none max-h-[520px]">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>ID Log & Tanggal</TableHeaderCell>
                  <TableHeaderCell>Unit Armada</TableHeaderCell>
                  <TableHeaderCell>Suku Cadang & Kategori</TableHeaderCell>
                  <TableHeaderCell>Jml & Satuan</TableHeaderCell>
                  <TableHeaderCell>Harga & Total</TableHeaderCell>
                  <TableHeaderCell>Vendor & Teknisi</TableHeaderCell>
                  <TableHeaderCell className="text-right">Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {state.partRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-[#64748B]">
                      Belum ada riwayat transaksi penggunaan suku cadang.
                    </TableCell>
                  </TableRow>
                ) : (
                  state.partRequests.map((req) => (
                    <TableRow key={req.txId}>
                      <TableCell className="font-mono">
                        <div className="font-bold text-[#0F172A]">{req.txId}</div>
                        <div className="text-xs text-[#64748B] tabular-nums">{req.ts}</div>
                      </TableCell>
                      <TableCell className="font-mono">
                        <span className="bmi-plate text-xs">{req.nopol}</span>
                        {req.noLambung && (
                          <div className="text-xs text-[#64748B] mt-1">
                            {req.noLambung} {req.woId && req.woId !== '-' ? `· ${req.woId}` : ''}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-[#0F172A]">{req.namaPart}</div>
                        <div className="text-xs text-[#64748B]">
                          {req.kategoriPart || '-'} · SKU: {req.sku}
                        </div>
                        {req.keterangan && (
                          <div className="text-xs text-[#64748B] italic mt-0.5">
                            Ket: {req.keterangan}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums font-bold text-[#1E293B]">
                        {req.qty} Pcs
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        <div className="font-bold text-[#0F172A]">
                          Rp {req.total.toLocaleString('id-ID')}
                        </div>
                        <div className="text-xs text-[#64748B]">
                          @ Rp {(req.hargaSatuan || 0).toLocaleString('id-ID')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-[#1E293B]">Mekanik: {req.mekanik || '-'}</div>
                        {req.petugasGudang && (
                          <div className="text-xs text-[#64748B]">
                            Gudang: {req.petugasGudang}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            req.status === 'Approved'
                              ? 'success'
                              : req.status === 'Rejected'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {req.status === 'Approved' ? 'Selesai Terpasang' : req.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      </div>

      {activeSection === 'HARGA' && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">Penawaran Harga (Vendor)</h2>
              <p className="text-xs text-[#475569] mt-1">
                Harga tidak disimpan di master SKU. Setiap pembelian dicatat per toko/vendor + merk,
                lalu diringkas: harga terakhir, rata-rata tertimbang, dan rentang.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <input
                list="sku-options"
                placeholder="Kode material"
                value={offerForm.sku}
                onChange={(e) => setOfferForm({ ...offerForm, sku: e.target.value.toUpperCase() })}
                className="h-9 px-2.5 text-xs border border-[#E2E8F0] rounded-[6px] font-mono"
              />
              <datalist id="sku-options">
                {state.parts.map((p) => (
                  <option key={p.sku} value={p.sku}>{p.nama}</option>
                ))}
              </datalist>
              <input
                placeholder="Toko / Vendor"
                value={offerForm.vendor}
                onChange={(e) => setOfferForm({ ...offerForm, vendor: e.target.value })}
                className="h-9 px-2.5 text-xs border border-[#E2E8F0] rounded-[6px]"
              />
              <input
                placeholder="Merk"
                value={offerForm.merk}
                onChange={(e) => setOfferForm({ ...offerForm, merk: e.target.value })}
                className="h-9 px-2.5 text-xs border border-[#E2E8F0] rounded-[6px]"
              />
              <input
                type="number"
                min={0}
                placeholder="Harga satuan"
                value={offerForm.hargaSatuan || ''}
                onChange={(e) =>
                  setOfferForm({ ...offerForm, hargaSatuan: Number(e.target.value) || 0 })
                }
                className="h-9 px-2.5 text-xs border border-[#E2E8F0] rounded-[6px] tabular-nums"
              />
              <input
                type="date"
                value={offerForm.tanggal}
                onChange={(e) => setOfferForm({ ...offerForm, tanggal: e.target.value })}
                className="h-9 px-2.5 text-xs border border-[#E2E8F0] rounded-[6px]"
              />
            </div>
            <Button variant="primary" size="sm" onClick={handleSaveOffer} leftIcon={<Plus className="w-4 h-4" />}>
              Simpan Penawaran
            </Button>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Kode Material</TableHeaderCell>
                    <TableHeaderCell>Spesifikasi</TableHeaderCell>
                    <TableHeaderCell className="text-right">Penawaran</TableHeaderCell>
                    <TableHeaderCell className="text-right">Terakhir</TableHeaderCell>
                    <TableHeaderCell className="text-right">Rata-rata</TableHeaderCell>
                    <TableHeaderCell className="text-right">Termurah</TableHeaderCell>
                    <TableHeaderCell>Vendor Termurah</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {state.parts.map((p) => {
                    const s = summarizePartPrices(p.sku, offers.filter((o) => o.sku === p.sku));
                    return (
                      <TableRow key={p.sku}>
                        <TableCell className="font-mono font-bold">{p.sku}</TableCell>
                        <TableCell className="text-xs text-[#475569]">{formatSpecLabel(p.spek)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.jumlahPenawaran}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.lastPrice ? `Rp ${s.lastPrice.harga.toLocaleString('id-ID')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.weightedAverage ? `Rp ${s.weightedAverage.toLocaleString('id-ID')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.hargaTerendah ? `Rp ${s.hargaTerendah.toLocaleString('id-ID')}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.bestOffer ? `${s.bestOffer.vendor} (${s.bestOffer.merk})` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {offers.length > 0 && (
              <div className="max-h-56 overflow-auto border border-[#E2E8F0] rounded-[6px]">
                <table className="w-full text-[11px]">
                  <thead className="bg-[#F8FAFC] text-[#475569] sticky top-0">
                    <tr>
                      <th className="p-2 text-left">SKU</th>
                      <th className="p-2 text-left">Vendor</th>
                      <th className="p-2 text-left">Merk</th>
                      <th className="p-2 text-right">Harga</th>
                      <th className="p-2 text-left">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((o) => (
                      <tr key={o.id} className="border-t border-[#E2E8F0]">
                        <td className="p-2 font-mono">{o.sku}</td>
                        <td className="p-2">{o.vendor}</td>
                        <td className="p-2">{o.merk}</td>
                        <td className="p-2 text-right tabular-nums">
                          Rp {o.hargaSatuan.toLocaleString('id-ID')}
                        </td>
                        <td className="p-2">{o.tanggal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODAL: Tambah Master Part Baru */}
      {showAddPartModal && (
        <Modal
          isOpen={showAddPartModal}
          onClose={() => setShowAddPartModal(false)}
          size="md"
          title="Tambah Master Sparepart"
          subtitle="Pendaftaran SKU master katalog suku cadang resmi BMI"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddPartModal(false)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveNewPart}
              >
                Simpan Master Part
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Kode SKU</label>
                <input
                  type="text"
                  value={newPartForm.sku}
                  onChange={(e) => setNewPartForm({ ...newPartForm, sku: e.target.value })}
                  placeholder="FLT-OLI-003"
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono font-bold uppercase text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Kategori</label>
                <select
                  value={newPartForm.kategori}
                  onChange={(e) => setNewPartForm({ ...newPartForm, kategori: e.target.value })}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-semibold text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Nama Suku Cadang</label>
              <input
                type="text"
                value={newPartForm.nama}
                onChange={(e) => setNewPartForm({ ...newPartForm, nama: e.target.value })}
                placeholder="Contoh: Kampas Rem Hino 500"
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Harga Satuan (Rp)</label>
                <input
                  type="number"
                  value={newPartForm.harga}
                  onChange={(e) =>
                    setNewPartForm({ ...newPartForm, harga: Number(e.target.value) })
                  }
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Stok Awal</label>
                <input
                  type="number"
                  value={newPartForm.stok}
                  onChange={(e) =>
                    setNewPartForm({ ...newPartForm, stok: Number(e.target.value) })
                  }
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Batas Kritis</label>
                <input
                  type="number"
                  value={newPartForm.min}
                  onChange={(e) =>
                    setNewPartForm({ ...newPartForm, min: Number(e.target.value) })
                  }
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Inbound Barang Masuk */}
      {showInboundModal && (
        <Modal
          isOpen={showInboundModal}
          onClose={() => setShowInboundModal(false)}
          size="md"
          title="Penerimaan Barang Masuk"
          subtitle="Pencatatan restock barang masuk (inbound) ke inventaris gudang"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowInboundModal(false)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveInbound}
              >
                Konfirmasi Masuk Gudang
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Pilih SKU Part</label>
              <select
                value={inboundForm.sku}
                onChange={(e) => setInboundForm({ ...inboundForm, sku: e.target.value })}
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono font-bold text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
              >
                {state.parts.map((p) => (
                  <option key={p.sku} value={p.sku}>
                    {p.sku} - {p.nama} (Stok Saat Ini: {p.stok})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Kuantitas Masuk</label>
                <input
                  type="number"
                  min={1}
                  value={inboundForm.qty}
                  onChange={(e) =>
                    setInboundForm({ ...inboundForm, qty: Number(e.target.value) })
                  }
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Total Invoice (Rp)</label>
                <input
                  type="number"
                  value={inboundForm.totalInvoice}
                  onChange={(e) =>
                    setInboundForm({ ...inboundForm, totalInvoice: Number(e.target.value) })
                  }
                  placeholder="Total nota pembelian..."
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
