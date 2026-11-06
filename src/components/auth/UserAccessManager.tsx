import React, { useState } from 'react';
import {
  ShieldCheck,
  Wrench,
  UserPlus,
  CheckCircle2,
  Lock,
  Unlock,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  AlertTriangle,
  Sliders,
  Filter
} from 'lucide-react';
import {
  AuthUser,
  FeaturePermissionKey,
  RoleMappingConfig,
  getUserAccessList,
  saveUserAccessList,
  resetUserAccessList,
  getRoleMappings,
  saveRoleMappings,
  resetRoleMappings,
  mapSheetRoleToPortalRole,
  syncUserAccessFromSheetRealTime,
  computeOneWayPasswordVerifier,
  getAuthHeaders
} from '../../services/authSession';
import { PoolLocation } from '../../types';
import { appendSheetRow } from '../../services/googleSheets';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  TableContainer,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell
} from '../ui/Table';

interface UserAccessManagerProps {
  isSheetsConnected: boolean;
  onOpenSheetsModal: () => void;
  onRoleMappingsUpdated?: () => void;
}

const FEATURE_COLUMNS: { key: FeaturePermissionKey; label: string; short: string }[] = [
  { key: 'dashboard', label: 'Dashboard & Parameter', short: 'Dashboard' },
  { key: 'fleet', label: 'Fleet Management (Aset)', short: 'Fleet Mgmt' },
  { key: 'inventory', label: 'Inventory (Sparepart)', short: 'Inventory' },
  { key: 'incidents', label: 'Manajemen Insiden (Laka)', short: 'Insiden Laka' },
  { key: 'workorders.manage', label: 'Kade Meter & Rilis QC WO', short: 'Kelola WO' },
  { key: 'workorders', label: 'Eksekusi Servis WO', short: 'Eksekusi WO' },
  { key: 'tires', label: 'Manajemen Roda (Tap Roda)', short: 'Tap Roda' },
  { key: 'warehouse-tires', label: 'Stok Ban (Set Ready)', short: 'Set Ready' },
  { key: 'chassis-checklist', label: 'Ceklis 13 Titik Sasis', short: 'Cek Sasis' }
];

export const UserAccessManager: React.FC<UserAccessManagerProps> = ({
  isSheetsConnected,
  onRoleMappingsUpdated
}) => {
  const [users, setUsers] = useState<AuthUser[]>(() => getUserAccessList());
  const [roleMappings, setRoleMappings] = useState<RoleMappingConfig[]>(() => getRoleMappings());
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'SUPERVISOR' | 'MEKANIK'>('ALL');
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Form Tambah Akun Baru
  const [newId, setNewId] = useState('');
  const [newNama, setNewNama] = useState('');
  const [newRoleRaw, setNewRoleRaw] = useState('Teknisi');
  const [newPassword, setNewPassword] = useState('');
  const [newStatus, setNewStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [newPool, setNewPool] = useState<PoolLocation>('BMI Surabaya');

  const refreshUsersWithMappings = (currentUsers: AuthUser[]) => {
    saveUserAccessList(currentUsers);
    const refreshed = getUserAccessList();
    setUsers(refreshed);
    if (onRoleMappingsUpdated) onRoleMappingsUpdated();
  };

  const handleToggleFeatureInRole = (
    sheetRoleName: string,
    featureKey: FeaturePermissionKey
  ) => {
    const updatedMappings = roleMappings.map((rm) => {
      if (rm.sheetRoleName === sheetRoleName) {
        const exists = rm.allowedFeatures.includes(featureKey);
        const nextFeatures = exists
          ? rm.allowedFeatures.filter((f) => f !== featureKey)
          : [...rm.allowedFeatures, featureKey];
        return { ...rm, allowedFeatures: nextFeatures };
      }
      return rm;
    });

    setRoleMappings(updatedMappings);
    saveRoleMappings(updatedMappings);
    refreshUsersWithMappings(users);

    setBannerMsg({
      type: 'success',
      text: `Hak akses fitur "${featureKey}" untuk Role "${sheetRoleName}" berhasil diperbarui.`
    });
  };

  const handleToggleStatus = async (userId: string) => {
    const currentTarget = users.find((u) => u.id === userId);
    const nextStatus: 'Aktif' | 'Nonaktif' =
      currentTarget?.status === 'Aktif' ? 'Nonaktif' : 'Aktif';

    const updated = users.map((u) => {
      if (u.id === userId) {
        return { ...u, status: nextStatus };
      }
      return u;
    });
    refreshUsersWithMappings(updated);

    try {
      await fetch('/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ id: userId, status: nextStatus })
      });
    } catch {
      // Fallback to local storage state
    }

    const target = updated.find((u) => u.id === userId);
    setBannerMsg({
      type: 'success',
      text: `Status akses akun ${target?.nama} (${target?.id}) diubah menjadi "${target?.status}".`
    });
  };

  const handleChangeRole = async (userId: string, nextRoleRaw: string) => {
    const mappedPortal = mapSheetRoleToPortalRole(nextRoleRaw);
    const updated = users.map((u) => {
      if (u.id === userId) {
        return {
          ...u,
          roleRaw: nextRoleRaw,
          role: mappedPortal,
          departemen:
            mappedPortal === 'MEKANIK'
              ? 'Portal Lapangan (Mekanik)'
              : 'Portal Service Advisor / Supervisor'
        };
      }
      return u;
    });
    refreshUsersWithMappings(updated);

    try {
      await fetch('/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ id: userId, roleRaw: nextRoleRaw })
      });
    } catch {
      // Fallback to local storage state
    }

    setBannerMsg({
      type: 'success',
      text: `Role akun ${userId} diperbarui ke "${nextRoleRaw}" (Portal ${mappedPortal}). Hak akses disesuaikan.`
    });
  };

  const handleConfirmResetPassword = async (userId: string) => {
    const cleanPass = resetPasswordInput.trim();
    if (cleanPass.length < 6) {
      setBannerMsg({
        type: 'error',
        text: 'Kata sandi baru minimal harus terdiri dari 6 karakter.'
      });
      return;
    }

    const updated = users.map((u) => {
      if (u.id === userId) {
        return {
          ...u,
          passwordVerifier: computeOneWayPasswordVerifier(u.id, cleanPass),
          credentialStatus: 'ENCRYPTED_SCRYPT' as const
        };
      }
      return u;
    });
    refreshUsersWithMappings(updated);

    try {
      await fetch('/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ id: userId, newPassword: cleanPass })
      });
    } catch {
      // Fallback to local verifier
    }

    setResettingUserId(null);
    setResetPasswordInput('');
    setBannerMsg({
      type: 'success',
      text: `Kata sandi untuk akun "${userId}" berhasil di-reset dan dienkripsi dengan scrypt.`
    });
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newId.trim();
    const cleanName = newNama.trim();
    const cleanPass = newPassword.trim();

    if (!cleanId || !cleanName || !cleanPass) {
      setBannerMsg({
        type: 'error',
        text: 'ID pengguna, nama lengkap, dan kata sandi wajib diisi.'
      });
      return;
    }

    if (users.some((u) => u.id.toLowerCase() === cleanId.toLowerCase())) {
      setBannerMsg({
        type: 'error',
        text: `ID Pengguna "${cleanId}" sudah terdaftar dalam tabel User Access.`
      });
      return;
    }

    if (cleanPass.length < 6) {
      setBannerMsg({
        type: 'error',
        text: 'Kata sandi wajib minimal 6 karakter untuk keamanan akun.'
      });
      return;
    }

    const portalRole = mapSheetRoleToPortalRole(newRoleRaw);
    const emailVal = cleanId.includes('@')
      ? cleanId.toLowerCase()
      : `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '')}@bmi.co.id`;

    const createdUser: AuthUser = {
      id: cleanId,
      nama: cleanName,
      roleRaw: newRoleRaw,
      role: portalRole,
      passwordVerifier: computeOneWayPasswordVerifier(cleanId, cleanPass),
      credentialStatus: 'ENCRYPTED_SCRYPT',
      status: newStatus,
      email: emailVal,
      posisi:
        portalRole === 'MEKANIK'
          ? `${newRoleRaw} · Eksekusi Bengkel`
          : `${newRoleRaw} · Manajemen & Kontrol`,
      lokasi: newPool,
      departemen:
        portalRole === 'MEKANIK'
          ? 'Portal Lapangan (Mekanik)'
          : 'Portal Service Advisor / Supervisor',
      kodeAkses: cleanId
    };

    const updated = [...users, createdUser];
    refreshUsersWithMappings(updated);

    try {
      await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          id: cleanId,
          nama: cleanName,
          roleRaw: newRoleRaw,
          password: cleanPass,
          status: newStatus,
          lokasi: newPool
        })
      });
    } catch {
      // Fallback to local storage verifier
    }

    if (isSheetsConnected) {
      try {
        await appendSheetRow('1LVPzTUXrT2HLNbQDNRPh5kzW0dFyBKyLnMuVhscRjT4', 'User Access!A:E', [
          cleanId,
          cleanName,
          newRoleRaw,
          '[HASHED_ON_SERVER]',
          newStatus
        ]);
      } catch (err) {
        console.warn('Gagal append ke Sheet User Access:', err);
      }
    }

    setNewId('');
    setNewNama('');
    setNewPassword('');
    setBannerMsg({
      type: 'success',
      text: `Akun "${cleanName}" (${cleanId}) berhasil didaftarkan dengan role "${newRoleRaw}".`
    });
  };

  const handlePullFromGoogleSheet = async () => {
    setIsSyncingSheet(true);
    setBannerMsg(null);
    try {
      const res = await syncUserAccessFromSheetRealTime();
      setUsers(getUserAccessList());
      if (onRoleMappingsUpdated) onRoleMappingsUpdated();
      setBannerMsg({
        type: 'success',
        text: res.message
      });
    } catch (e: any) {
      setBannerMsg({
        type: 'error',
        text: e.message || 'Gagal menyinkronkan tab User Access dari Google Sheets.'
      });
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      u.id.toLowerCase().includes(q) ||
      u.nama.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.roleRaw.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <Card>
        <CardContent className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#073E7F]">
                OTORISASI & HAK AKSES PENGGUNA
              </span>
              <span className="text-xs text-[#64748B] font-medium">
                · Pengaturan Peran & Modul Operasional
              </span>
            </div>
            <h1 className="text-xl font-bold text-[#0F172A] mt-1">
              Manajemen Hak Akses & Otorisasi Modul
            </h1>
            <p className="text-xs text-[#475569] mt-0.5">
              Kelola daftar akun personel bengkel serta hak akses modul manajemen dan operasional
              lapangan secara terpusat.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="primary"
              size="sm"
              onClick={handlePullFromGoogleSheet}
              isLoading={isSyncingSheet}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-spin' : ''}`} />}
            >
              Sinkronkan Data
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const defaultMappings = resetRoleMappings();
                const defaultUsers = resetUserAccessList();
                setRoleMappings(defaultMappings);
                setUsers(defaultUsers);
                if (onRoleMappingsUpdated) onRoleMappingsUpdated();
                setBannerMsg({
                  type: 'success',
                  text: 'Tabel User Access & Role Mapping dikembalikan ke pengaturan standar.'
                });
              }}
            >
              Reset Default
            </Button>
          </div>
        </CardContent>
      </Card>

      {bannerMsg && (
        <div
          className={`p-3.5 rounded-[6px] border text-xs font-medium flex items-center justify-between gap-3 ${
            bannerMsg.type === 'success'
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
            )}
            <span>{bannerMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="text-xs font-semibold underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Matriks Pemetaan Role -> Fitur Spesifik */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-[#0A2547] text-[#D19F0F] flex items-center justify-center shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">
                Matriks Hak Akses Berdasarkan Jabatan
              </h2>
              <p className="text-xs text-[#64748B]">
                Atur izin akses modul manajemen armada, inventaris suku cadang, dan eksekusi servis
                untuk setiap jabatan.
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <TableContainer className="rounded-none border-0 shadow-none">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Jabatan / Peran</TableHeaderCell>
                  <TableHeaderCell>Portal</TableHeaderCell>
                  {FEATURE_COLUMNS.map((fc) => (
                    <TableHeaderCell key={fc.key} className="text-center" title={fc.label}>
                      {fc.short}
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {roleMappings.map((rm) => (
                  <TableRow key={rm.sheetRoleName}>
                    <TableCell>
                      <div className="font-bold text-[#0F172A] font-mono text-xs">{rm.sheetRoleName}</div>
                      <div className="text-xs text-[#64748B]">{rm.description}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={rm.portalRole === 'MEKANIK' ? 'success' : 'neutral'}>
                        {rm.portalRole}
                      </Badge>
                    </TableCell>
                    {FEATURE_COLUMNS.map((fc) => {
                      const checked = rm.allowedFeatures.includes(fc.key);
                      return (
                        <TableCell key={fc.key} className="text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleFeatureInRole(rm.sheetRoleName, fc.key)}
                            className="w-4 h-4 rounded-[4px] border-[#CBD5E1] text-[#073E7F] focus:ring-[#073E7F] cursor-pointer"
                            title={`${fc.label} untuk Role ${rm.sheetRoleName}`}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Tabel Akun User Access */}
      <Card>
        <CardHeader>
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">
              Daftar Akun Personel & Otorisasi Akses
            </h3>
            <p className="text-xs text-[#64748B]">
              Daftar akun pengguna aktif beserta status hak akses modul yang diizinkan.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari ID, Nama, Jabatan..."
                className="pl-8 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] focus:bg-white focus:outline-none focus:border-[#073E7F]"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#64748B]" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] font-medium text-[#334155] focus:outline-none focus:border-[#073E7F]"
              >
                <option value="ALL">Semua Portal</option>
                <option value="SUPERVISOR">Portal Supervisor</option>
                <option value="MEKANIK">Portal Mekanik</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <TableContainer className="rounded-none border-0 shadow-none max-h-[500px]">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>ID Pengguna / Email</TableHeaderCell>
                  <TableHeaderCell>Nama Lengkap & Lokasi</TableHeaderCell>
                  <TableHeaderCell>Jabatan / Peran</TableHeaderCell>
                  <TableHeaderCell>Hak Akses Modul</TableHeaderCell>
                  <TableHeaderCell>Keamanan Sandi</TableHeaderCell>
                  <TableHeaderCell>Status Akun</TableHeaderCell>
                  <TableHeaderCell className="text-right">Tindakan</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((u) => {
                  const isResetting = resettingUserId === u.id;
                  const isAktif = u.status === 'Aktif';
                  const hasFleet = u.allowedFeatures?.includes('fleet');
                  const hasInventory = u.allowedFeatures?.includes('inventory');

                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs font-bold text-[#0F172A]">
                        <div>{u.id}</div>
                        <div className="text-xs font-normal text-[#64748B]">{u.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-[#0F172A]">{u.nama}</div>
                        <div className="text-xs text-[#64748B]">{u.lokasi}</div>
                      </TableCell>
                      <TableCell>
                        <select
                          value={u.roleRaw}
                          onChange={(e) => handleChangeRole(u.id, e.target.value)}
                          className="px-2 py-1 rounded-[6px] border border-[#CBD5E1] bg-white text-xs font-semibold text-[#334155] focus:outline-none focus:border-[#073E7F]"
                        >
                          <option value="Supervisor">Supervisor</option>
                          <option value="Service Advisor">Service Advisor</option>
                          <option value="Admin">Admin</option>
                          <option value="Teknisi">Teknisi</option>
                          <option value="Mekanik">Mekanik</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {u.role === 'MEKANIK' ? (
                            <Badge variant="success" className="inline-flex items-center gap-1">
                              <Wrench className="w-3 h-3" />
                              <span>4 Modul Mekanik</span>
                            </Badge>
                          ) : (
                            <Badge variant="neutral" className="inline-flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-[#073E7F]" />
                              <span>Portal Supervisor</span>
                            </Badge>
                          )}

                          <Badge variant={hasFleet ? 'success' : 'danger'}>
                            Fleet: {hasFleet ? 'ON' : 'LOCKED'}
                          </Badge>

                          <Badge variant={hasInventory ? 'success' : 'danger'}>
                            Inventory: {hasInventory ? 'ON' : 'LOCKED'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {isResetting ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="password"
                              value={resetPasswordInput}
                              onChange={(e) => setResetPasswordInput(e.target.value)}
                              placeholder="Min. 6 karakter"
                              className="w-28 px-2 py-1 text-xs border border-[#CBD5E1] rounded-[6px] bg-white focus:outline-none focus:border-[#073E7F]"
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleConfirmResetPassword(u.id)}
                            >
                              Simpan
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setResettingUserId(null);
                                setResetPasswordInput('');
                              }}
                            >
                              Batal
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="neutral" className="font-mono text-[10px]">
                              Terenkripsi (scrypt)
                            </Badge>
                            <button
                              type="button"
                              onClick={() => {
                                setResettingUserId(u.id);
                                setResetPasswordInput('');
                              }}
                              className="text-[11px] font-semibold text-[#073E7F] hover:underline cursor-pointer"
                            >
                              Reset Sandi
                            </button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isAktif ? 'success' : 'danger'}>
                          {isAktif ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={isAktif ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggleStatus(u.id)}
                          leftIcon={isAktif ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        >
                          {isAktif ? 'Blokir' : 'Aktifkan'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Form Tambah Akun Pengguna Baru */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#073E7F]" />
            <h3 className="text-sm font-bold text-[#0F172A]">
              Daftarkan Akun Personel Baru
            </h3>
          </div>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleAddUser}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
          >
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                ID Pengguna / Email
              </label>
              <input
                type="text"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="cth: Teknisi04"
                className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] focus:bg-white focus:outline-none focus:border-[#073E7F]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={newNama}
                onChange={(e) => setNewNama(e.target.value)}
                placeholder="cth: Wahyu Saputra"
                className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] focus:bg-white focus:outline-none focus:border-[#073E7F]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Jabatan / Peran
              </label>
              <select
                value={newRoleRaw}
                onChange={(e) => setNewRoleRaw(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-[#334155] font-medium focus:bg-white focus:outline-none focus:border-[#073E7F]"
              >
                <option value="Teknisi">Teknisi (Portal Mekanik)</option>
                <option value="Mekanik">Mekanik (Portal Mekanik)</option>
                <option value="Supervisor">Supervisor (Portal Supervisor)</option>
                <option value="Service Advisor">Service Advisor (Portal Supervisor)</option>
                <option value="Admin">Admin (Portal Supervisor)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Kata Sandi (Min. 6 Karakter)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 karakter"
                minLength={6}
                className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] focus:bg-white focus:outline-none focus:border-[#073E7F]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Status & Lokasi Pool
              </label>
              <div className="flex gap-1.5">
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                  className="w-1/2 px-2 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-[#334155] font-medium"
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Nonaktif">Nonaktif</option>
                </select>
                <select
                  value={newPool}
                  onChange={(e) => setNewPool(e.target.value as PoolLocation)}
                  className="w-1/2 px-2 py-2 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-[#334155] font-medium"
                >
                  <option value="BMI Surabaya">SBY</option>
                  <option value="BMI Lamongan">LMG</option>
                  <option value="BMI Dampit">DMP</option>
                </select>
              </div>
            </div>

            <div className="flex items-end">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                leftIcon={<UserPlus className="w-4 h-4 text-[#D19F0F]" />}
              >
                Tambah Akun
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
