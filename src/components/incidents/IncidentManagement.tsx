import React, { useState } from 'react';
import {
  ShieldAlert,
  Search,
  Plus,
  AlertTriangle,
  FileCheck2,
  Trash2,
  Edit3,
  ExternalLink,
  Filter
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import { IncidentReport } from '../../types';
import { toast } from '../ui/Toast';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import {
  TableContainer,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell
} from '../ui/Table';

export const IncidentManagement: React.FC = () => {
  const { state, submitIncidentReport, updateIncidentStatus, deleteIncidentReport } =
    useWorkshopStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState<IncidentReport | null>(null);

  // New Report Form
  const [newForm, setNewForm] = useState({
    idUnit: '',
    supir: '',
    tgl: new Date().toISOString().slice(0, 10),
    lokasi: '',
    kronologi: '',
    kerugian: 0,
    status: 'Belum Diklaim' as IncidentReport['status']
  });

  // Update Status Form
  const [updateForm, setUpdateForm] = useState({
    status: 'Proses Klaim' as IncidentReport['status'],
    finalLoss: 0,
    dokumenUrl: ''
  });

  const totalLosses = state.incidents.reduce((sum, inc) => sum + (inc.kerugian || 0), 0);
  const claimedCount = state.incidents.filter((inc) => inc.status === 'Klaim Cair').length;

  const filteredIncidents = state.incidents.filter((inc) => {
    if (statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inc.idLaka.toLowerCase().includes(q) ||
      inc.idUnit.toLowerCase().includes(q) ||
      inc.supir.toLowerCase().includes(q) ||
      inc.lokasi.toLowerCase().includes(q)
    );
  });

  const handleSaveNewIncident = () => {
    if (!newForm.idUnit.trim() || !newForm.supir.trim() || !newForm.lokasi.trim()) {
      toast.error('Unit, supir, dan lokasi kejadian wajib diisi');
      return;
    }

    submitIncidentReport({
      ...newForm,
      idUnit: newForm.idUnit.toUpperCase().trim(),
      pic: state.userPic
    });

    toast.success('Laporan insiden berhasil disimpan');
    setShowAddModal(false);
    setNewForm({
      idUnit: '',
      supir: '',
      tgl: new Date().toISOString().slice(0, 10),
      lokasi: '',
      kronologi: '',
      kerugian: 0,
      status: 'Belum Diklaim'
    });
  };

  const handleSaveUpdateStatus = () => {
    if (!showUpdateModal) return;
    updateIncidentStatus(
      showUpdateModal.idLaka,
      updateForm.status,
      updateForm.finalLoss > 0 ? updateForm.finalLoss : undefined,
      updateForm.dokumenUrl || undefined
    );
    toast.success('Status klaim berhasil diperbarui');
    setShowUpdateModal(null);
  };

  const handleDeleteIncident = (idLaka: string) => {
    deleteIncidentReport(idLaka);
    toast.success('Laporan insiden berhasil dihapus');
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#073E7F] mb-1">
                Investigasi Insiden & Asuransi
              </div>
              <h1 className="text-xl font-bold text-[#0F172A]">
                Manajemen Insiden, Kecelakaan & Klaim
              </h1>
              <p className="text-xs text-[#475569] mt-1">
                Pencatatan laporan insiden armada di jalan, estimasi kerugian fisik, progres
                pengajuan klaim ke pihak asuransi, dan realisasi ganti rugi.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setNewForm({
                    idUnit: state.trucks[0]?.idUnit || '',
                    supir: '',
                    tgl: new Date().toISOString().slice(0, 10),
                    lokasi: '',
                    kronologi: '',
                    kerugian: 0,
                    status: 'Belum Diklaim'
                  });
                  setShowAddModal(true);
                }}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Buat Laporan Baru
              </Button>
            </div>
          </div>

          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4">
              <div className="text-xs font-semibold uppercase text-[#64748B] mb-1">
                Total Insiden Tercatat
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[#0F172A]">
                {state.incidents.length} <span className="text-sm font-normal text-[#64748B]">Kasus</span>
              </div>
              <div className="text-xs text-[#64748B] mt-0.5">
                Historis investigasi armada BMI
              </div>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4">
              <div className="text-xs font-semibold uppercase text-[#64748B] mb-1">
                Total Estimasi Kerugian
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#DC2626]">
                Rp {(totalLosses / 1000000).toFixed(1)} <span className="text-sm font-normal text-[#64748B]">Juta</span>
              </div>
              <div className="text-xs text-[#64748B] mt-0.5">
                Taksiran biaya perbaikan armada
              </div>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4">
              <div className="text-xs font-semibold uppercase text-[#64748B] mb-1">
                Klaim Asuransi Cair
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[#059669]">
                {claimedCount} <span className="text-sm font-normal text-[#64748B]">Kasus</span>
              </div>
              <div className="text-xs text-[#64748B] mt-0.5">
                Kompensasi asuransi diterima
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-[#E2E8F0]">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari ID laka, nopol, supir..."
                className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs font-medium focus:bg-white focus:outline-none focus:border-[#073E7F] focus:ring-1 focus:ring-[#073E7F]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-[#64748B]" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155] text-xs font-semibold rounded-[6px] px-3 py-2 focus:outline-none focus:border-[#073E7F]"
              >
                <option value="ALL">Status Klaim: Semua</option>
                <option value="Belum Diklaim">Belum Diklaim</option>
                <option value="Proses Klaim">Proses Klaim</option>
                <option value="Klaim Cair">Klaim Cair</option>
                <option value="Ditolak / Non-Asuransi">Ditolak / Non-Asuransi</option>
                <option value="Selesai Perbaikan">Selesai Perbaikan</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Incidents Table */}
      <Card>
        <CardContent className="p-0">
          <TableContainer className="rounded-none border-0 shadow-none max-h-[580px]">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>ID Laporan & Waktu</TableHeaderCell>
                  <TableHeaderCell>Unit Armada & Supir</TableHeaderCell>
                  <TableHeaderCell>Kategori & Lokasi</TableHeaderCell>
                  <TableHeaderCell>Kronologi & Penanganan</TableHeaderCell>
                  <TableHeaderCell>Estimasi Kerugian</TableHeaderCell>
                  <TableHeaderCell>Status Klaim</TableHeaderCell>
                  <TableHeaderCell className="text-right">Aksi</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredIncidents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-[#64748B]">
                      Tidak ada laporan insiden atau kendala yang cocok dengan filter pencarian.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredIncidents.map((inc) => (
                    <TableRow key={inc.idLaka}>
                      <TableCell>
                        <div className="font-mono text-xs font-bold text-[#0F172A]">{inc.idLaka}</div>
                        <div className="text-xs text-[#64748B] tabular-nums font-mono">
                          {inc.tgl} {inc.waktuMulai ? `· ${inc.waktuMulai.slice(11, 16)}` : ''}
                        </div>
                        {inc.jenisLog && (
                          <div className="mt-1">
                            <Badge variant={inc.jenisLog === 'LAKA' ? 'danger' : 'neutral'}>
                              {inc.jenisLog === 'LAKA' ? 'LAKA / KLAIM' : 'KENDALA (INC)'}
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono">
                        <span className="bmi-plate text-xs">{inc.idUnit}</span>
                        {inc.kategoriUnit && (
                          <div className="text-xs text-[#64748B] mt-1 font-sans">
                            Kategori: {inc.kategoriUnit}
                          </div>
                        )}
                        <div className="text-xs font-sans text-[#334155] mt-0.5">
                          Supir: <span className="font-semibold">{inc.supir || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-[#1E293B]">
                          {inc.kategoriKendala || 'Insiden Operasional'}
                        </div>
                        <div className="text-xs text-[#64748B]">{inc.lokasi || '-'}</div>
                        {inc.tingkatKeparahan && (
                          <div className="text-xs font-semibold text-[#D97706] mt-0.5">
                            Skala: {inc.tingkatKeparahan}
                            {inc.durasiDowntime ? ` · Downtime ${inc.durasiDowntime} jam` : ''}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs whitespace-normal">
                        <div className="font-medium text-[#334155] text-xs line-clamp-2">
                          {inc.kronologi}
                        </div>
                        {inc.tindakanMitigasi && (
                          <div className="text-xs text-[#059669] font-medium mt-1">
                            Penanganan: {inc.tindakanMitigasi}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums font-bold text-xs text-[#DC2626]">
                        {inc.kerugian > 0 ? `Rp ${inc.kerugian.toLocaleString('id-ID')}` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            inc.status === 'Klaim Cair' || inc.status === 'Selesai Perbaikan'
                              ? 'success'
                              : inc.status === 'Ditolak / Non-Asuransi'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {inc.status}
                        </Badge>
                        {inc.dokumen && (
                          <a
                            href={inc.dokumen}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#073E7F] hover:underline mt-1"
                          >
                            <span>Lihat Bukti</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowUpdateModal(inc);
                            setUpdateForm({
                              status: inc.status,
                              finalLoss: inc.kerugian,
                              dokumenUrl: inc.dokumen || ''
                            });
                          }}
                          className="text-[#073E7F] hover:text-[#0A2547] text-xs"
                        >
                          Update
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Hapus laporan ${inc.idLaka}`}
                          onClick={() => handleDeleteIncident(inc.idLaka)}
                          className="text-[#94A3B8] hover:text-[#DC2626] text-xs"
                        >
                          Hapus
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* MODAL: Tambah Laporan Laka */}
      {showAddModal && (
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          size="md"
          title="Form Investigasi Kecelakaan Armada"
          subtitle="Pencatatan laporan insiden baru untuk penanganan dan klaim asuransi"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddModal(false)}
              >
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleSaveNewIncident}
              >
                Simpan Laporan Insiden
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">ID Unit / Nopol</label>
                <select
                  value={newForm.idUnit}
                  onChange={(e) => setNewForm({ ...newForm, idUnit: e.target.value })}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono font-bold text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                >
                  {state.trucks.map((t) => (
                    <option key={t.idUnit} value={t.idUnit}>
                      {t.idUnit} (Truk)
                    </option>
                  ))}
                  {state.chassis.map((c) => (
                    <option key={c.idUnit} value={c.idUnit}>
                      {c.idUnit} (Chassis)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Nama Supir / Pengemudi</label>
                <input
                  type="text"
                  value={newForm.supir}
                  onChange={(e) => setNewForm({ ...newForm, supir: e.target.value })}
                  placeholder="Nama supir..."
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Tanggal Kejadian</label>
                <input
                  type="date"
                  value={newForm.tgl}
                  onChange={(e) => setNewForm({ ...newForm, tgl: e.target.value })}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Lokasi Kejadian</label>
                <input
                  type="text"
                  value={newForm.lokasi}
                  onChange={(e) => setNewForm({ ...newForm, lokasi: e.target.value })}
                  placeholder="Contoh: Tol Gempol KM 794"
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Kronologi Kejadian</label>
              <textarea
                value={newForm.kronologi}
                onChange={(e) => setNewForm({ ...newForm, kronologi: e.target.value })}
                rows={3}
                placeholder="Ceritakan urutan peristiwa kejadian..."
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] p-2.5 text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Estimasi Kerugian (Rp)</label>
                <input
                  type="number"
                  value={newForm.kerugian}
                  onChange={(e) => setNewForm({ ...newForm, kerugian: Number(e.target.value) })}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Status Asuransi</label>
                <select
                  value={newForm.status}
                  onChange={(e) => setNewForm({ ...newForm, status: e.target.value as any })}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-semibold text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
                >
                  <option value="Belum Diklaim">Belum Diklaim</option>
                  <option value="Proses Klaim">Proses Klaim</option>
                  <option value="Klaim Cair">Klaim Cair</option>
                  <option value="Ditolak / Non-Asuransi">Ditolak / Non-Asuransi</option>
                </select>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Update Status Insiden */}
      {showUpdateModal && (
        <Modal
          isOpen={!!showUpdateModal}
          onClose={() => setShowUpdateModal(null)}
          size="md"
          title={`Pembaruan Status: ${showUpdateModal.idLaka}`}
          subtitle="Perbarui status klaim dan realisasi penggantian asuransi"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowUpdateModal(null)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveUpdateStatus}
              >
                Simpan Perubahan
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Status Penanganan</label>
              <select
                value={updateForm.status}
                onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value as any })}
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-semibold text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
              >
                <option value="Belum Diklaim">Belum Diklaim</option>
                <option value="Proses Klaim">Proses Klaim</option>
                <option value="Klaim Cair">Klaim Cair</option>
                <option value="Ditolak / Non-Asuransi">Ditolak / Non-Asuransi</option>
                <option value="Selesai Perbaikan">Selesai Perbaikan</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Realisasi Nilai Klaim (Rp)</label>
              <input
                type="number"
                value={updateForm.finalLoss}
                onChange={(e) =>
                  setUpdateForm({ ...updateForm, finalLoss: Number(e.target.value) })
                }
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 font-mono text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">URL Dokumen / Bukti Klaim</label>
              <input
                type="url"
                value={updateForm.dokumenUrl}
                onChange={(e) => setUpdateForm({ ...updateForm, dokumenUrl: e.target.value })}
                placeholder="https://drive.google.com/..."
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] px-3 py-2 text-xs focus:bg-white focus:outline-none focus:border-[#073E7F]"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
