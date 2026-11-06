import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  ExternalLink,
  Layers,
  Truck,
  CircleDot,
  Wrench,
  Package,
  ShieldCheck,
  Check
} from 'lucide-react';
import { useWorkshopStore } from '../../services/workshopStore';
import {
  searchSpreadsheets,
  getSpreadsheetDetails,
  getSheetValues,
  standardizeSheetNamingConvention,
  SheetFile,
  SheetMetadata,
  extractSpreadsheetId
} from '../../services/googleSheets';
import {
  standardizeTruckLambungList,
  standardizeGensetIdList
} from '../../services/autoIdGenerator';
import { TruckAsset, ChassisAsset, GensetAsset, TireAsset, WorkOrder, MasterPart, MaintenanceParameter } from '../../types';
import { parseSheetParameters } from '../../services/maintenanceEngine';
import { parseUserAccessSheetRows, saveUserAccessList, isFeatureAllowedForUser, getStoredAuthSession } from '../../services/authSession';
import {
  buildOdometerBatch,
  commitOdometerBatch,
  parseOdometerCsv,
  validateOdometerRows
} from '../../domain/odometerImport';
import type { OdometerImportBatch } from '../../types';
import {
  fetchAllLiveSheetsPublic,
  parseTrkLogRows,
  parseChaLogRows,
  parseGnzLogRows,
  parseBanLogRows,
  parseSchQueueRows,
  parsePartLogRows,
  parseMasterPartRows,
  parseLakaLogRows
} from '../../services/liveSheetSync';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { toast } from '../ui/Toast';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
  userEmail: string | null;
  onSignIn: () => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  isLoggedIn,
  userEmail,
  onSignIn
}) => {
  const { state, syncFromGoogleSheetsData, resetToInitialDefaults, applyOdometerUpdates } =
    useWorkshopStore();

  const canImportOdometer = isFeatureAllowedForUser(getStoredAuthSession(), 'odometer');
  const [odoBatch, setOdoBatch] = useState<OdometerImportBatch | null>(null);
  const [odoBusy, setOdoBusy] = useState(false);

  const handleOdometerFile = async (file: File) => {
    try {
      const raw = parseOdometerCsv(await file.text());
      if (raw.length === 0) {
        toast.error('File tidak memuat baris odometer yang bisa dibaca.');
        return;
      }
      const rows = validateOdometerRows(raw, {
        trucks: state.trucks.map((t) => ({
          idUnit: t.idUnit,
          noLambung: t.noLambung,
          kmSaatIni: t.kmSaatIni
        }))
      });
      setOdoBatch(buildOdometerBatch(file.name, rows, state.userPic || 'Supervisor'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membaca CSV odometer.');
    }
  };

  const handleOdometerCommit = () => {
    if (!odoBatch) return;
    const invalid = odoBatch.rows.filter((r) => !r.valid).length;
    if (invalid > 0) {
      toast.error(`${invalid} baris tidak valid. Perbaiki file sebelum commit.`);
      return;
    }
    setOdoBusy(true);
    try {
      const { updates, logs } = commitOdometerBatch(odoBatch, state.userPic || 'Supervisor');
      const applied = applyOdometerUpdates(updates);
      const history = JSON.parse(localStorage.getItem('bmi_odometer_logs_v1') || '[]');
      localStorage.setItem('bmi_odometer_logs_v1', JSON.stringify([...logs, ...history].slice(0, 500)));
      setOdoBatch({ ...odoBatch, status: 'COMMITTED', committedAt: new Date().toISOString() });
      toast.success(`${applied} unit diperbarui dari staging odometer.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Commit odometer ditolak.');
    } finally {
      setOdoBusy(false);
    }
  };

  const [spreadsheetInput, setSpreadsheetInput] = useState('1LVPzTUXrT2HLNbQDNRPh5kzW0dFyBKyLnMuVhscRjT4');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [driveFiles, setDriveFiles] = useState<SheetFile[]>([]);
  const [isSearchingDrive, setIsSearchingDrive] = useState(false);
  const [searchDriveError, setSearchDriveError] = useState('');

  const [loadedMetadata, setLoadedMetadata] = useState<SheetMetadata | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractSuccessMsg, setExtractSuccessMsg] = useState('');

  // Selected sheets to extract
  const [selectedSheets, setSelectedSheets] = useState<Record<string, boolean>>({
    'User Access': true,
    'PARAMETER': true,
    'TRK (LOG)': true,
    'CHA (LOG)': true,
    'GNZ (LOG)': true,
    'Ban (LOG)': true,
    'SCH (Maintenance Queue)': true,
    'PART (LOG)': true,
    'MASTER PART': true,
    'LAKA (LOG)': true
  });

  // Search Drive files when logged in
  useEffect(() => {
    if (isLoggedIn && isOpen) {
      handleSearchDriveFiles();
    }
  }, [isLoggedIn, isOpen]);

  const handleSearchDriveFiles = async () => {
    setIsSearchingDrive(true);
    setSearchDriveError('');
    try {
      const files = await searchSpreadsheets('BMI_WorkshopManagement');
      setDriveFiles(files);
      if (files.length > 0 && !spreadsheetInput.includes('http')) {
        setSpreadsheetInput(files[0].id);
      }
    } catch (e: any) {
      setSearchDriveError(e.message || 'Gagal mencari file di Google Drive.');
    } finally {
      setIsSearchingDrive(false);
    }
  };

  // Direct Live Sync via GViz CSV (No OAuth Required)
  const handleDirectLiveSync = async () => {
    const cleanId = extractSpreadsheetId(spreadsheetInput);
    if (!cleanId) return;
    setIsExtracting(true);
    setDetailsError('');
    setExtractSuccessMsg('');
    try {
      const dataset = await fetchAllLiveSheetsPublic(cleanId, selectedSheets);
      if (dataset.totalExtractedRows === 0) {
        throw new Error('Tidak ada baris yang dapat diekstrak dari Spreadsheet ID tersebut.');
      }
      syncFromGoogleSheetsData(dataset);
      const gudangCount = dataset.tires
        ? dataset.tires.filter((t) => t.statusKelayakan === 'Spare / Gudang').length
        : 0;
      const activeCount = dataset.tires
        ? dataset.tires.filter((t) => t.statusKelayakan === 'Aktif Terpasang').length
        : 0;
      setExtractSuccessMsg(
        `Sinkronisasi Live Berhasil! Terselaraskan ${dataset.trucks?.length || 0} Truk, ${
          dataset.chassis?.length || 0
        } Chassis, ${dataset.gensets?.length || 0} Genset, dan ${
          dataset.tires?.length || 0
        } Ban Unik (${gudangCount} di Gudang/Bengkel & ${activeCount} Terpasang Aktif).`
      );
    } catch (e: any) {
      setDetailsError(e.message || 'Gagal melakukan sinkronisasi langsung dari Google Sheets.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleStandardizeSheetNames = async () => {
    const cleanId = extractSpreadsheetId(spreadsheetInput);
    if (!cleanId) return;
    setIsExtracting(true);
    setDetailsError('');
    setExtractSuccessMsg('');
    try {
      const { nopolToLambungMap } = standardizeTruckLambungList(state.trucks);
      const { oldToNewIdMap } = standardizeGensetIdList([
        { idUnit: 'GS-01', tipeGenset: 'Clip-On', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' },
        { idUnit: 'GS-02', tipeGenset: 'Clip-On', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' },
        { idUnit: 'GS-03', tipeGenset: 'Underslung', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' },
        { idUnit: 'GS-04', tipeGenset: 'Clip-On', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' },
        { idUnit: 'GS-05', tipeGenset: 'Underslung', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' },
        { idUnit: 'GS-06', tipeGenset: 'Clip-On', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' },
        { idUnit: 'GS-07', tipeGenset: 'Underslung', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' },
        { idUnit: 'GS-08', tipeGenset: 'Clip-On', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' },
        { idUnit: 'GS-09', tipeGenset: 'Clip-On', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' },
        { idUnit: 'GS-10', tipeGenset: 'Underslung', merkKapasitas: '', jamKerja: 0, servisTerakhir: 0, intervalServis: 250, statusServis: 'Selesai' }
      ]);
      const res = await standardizeSheetNamingConvention(cleanId, nopolToLambungMap, oldToNewIdMap);
      setExtractSuccessMsg(
        `Penamaan Google Sheets berhasil diperbarui! (${res.updatedTrkRows} baris No Lambung di TRK (LOG) & ${res.updatedGnzRows} baris Kode Genset di GNZ (LOG) disesuaikan ke standar terbaru).`
      );
      toast.success('Penamaan ID Lambung & Genset di Google Sheets berhasil diperbarui');
    } catch (e: any) {
      setDetailsError(
        e.message || 'Gagal memperbarui penamaan di Google Sheets. Pastikan akun Google memiliki akses Edit.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleLoadSpreadsheet = async () => {
    if (!spreadsheetInput.trim()) return;
    setIsLoadingDetails(true);
    setDetailsError('');
    setExtractSuccessMsg('');
    try {
      const cleanId = extractSpreadsheetId(spreadsheetInput);
      const meta = await getSpreadsheetDetails(cleanId);
      setLoadedMetadata(meta);

      // Auto check matching log sheets & User Access
      const defaultChecks: Record<string, boolean> = {};
      meta.sheets.forEach((s) => {
        const titleUpper = s.title.toUpperCase();
        if (
          titleUpper.includes('LOG') ||
          titleUpper.includes('QUEUE') ||
          titleUpper.includes('PART') ||
          titleUpper.includes('PARAM') ||
          titleUpper.includes('USER') ||
          titleUpper.includes('ACCESS')
        ) {
          defaultChecks[s.title] = true;
        }
      });
      setSelectedSheets(defaultChecks);
    } catch (e: any) {
      setDetailsError(e.message || 'Gagal membuka spreadsheet.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Perform full extraction of LOG sheets, PARAMETER, & User Access (with deduplication)
  const handleExtractAndSync = async () => {
    if (!loadedMetadata) return;
    setIsExtracting(true);
    setExtractSuccessMsg('');
    try {
      const spreadsheetId = loadedMetadata.spreadsheetId;
      const extractedData: {
        trucks?: TruckAsset[];
        chassis?: ChassisAsset[];
        gensets?: GensetAsset[];
        tires?: TireAsset[];
        workOrders?: WorkOrder[];
        parts?: MasterPart[];
        partRequests?: any[];
        incidents?: any[];
        parameters?: MaintenanceParameter[];
      } = {};

      let totalExtractedCount = 0;

      // 0A. Extract User Access sheet
      const userAccessSheet = loadedMetadata.sheets.find(
        (s) =>
          s.title.toUpperCase().includes('USER ACCESS') ||
          s.title.toUpperCase().includes('USER')
      );
      if (userAccessSheet && selectedSheets[userAccessSheet.title]) {
        const userRows = await getSheetValues(spreadsheetId, `${userAccessSheet.title}!A2:E100`);
        const parsedUsers = parseUserAccessSheetRows(userRows);
        if (parsedUsers.length > 0) {
          saveUserAccessList(parsedUsers);
          totalExtractedCount += parsedUsers.length;
        }
      }

      // 0B. Extract PARAMETER sheet
      const paramSheet = loadedMetadata.sheets.find((s) =>
        s.title.toUpperCase().includes('PARAM')
      );
      if (paramSheet && selectedSheets[paramSheet.title]) {
        const paramRows = await getSheetValues(spreadsheetId, `${paramSheet.title}!A1:L120`);
        const params = parseSheetParameters(paramRows);
        if (params.length > 0) {
          extractedData.parameters = params;
          totalExtractedCount += params.length;
        }
      }

      // 1. Extract TRK (LOG) deduplicated by latest row
      const trkSheet = loadedMetadata.sheets.find(
        (s) => s.title.includes('TRK (LOG)') || s.title.toUpperCase().includes('TRK (LOG)')
      );
      if (trkSheet && selectedSheets[trkSheet.title]) {
        const rows = await getSheetValues(spreadsheetId, `${trkSheet.title}!A2:AG200`);
        const trucks = parseTrkLogRows(rows);
        if (trucks.length > 0) {
          extractedData.trucks = trucks;
          totalExtractedCount += trucks.length;
        }
      }

      // 2. Extract CHA (LOG) deduplicated by latest row
      const chaSheet = loadedMetadata.sheets.find(
        (s) => s.title.includes('CHA (LOG)') || s.title.toUpperCase().includes('CHA (LOG)')
      );
      if (chaSheet && selectedSheets[chaSheet.title]) {
        const rows = await getSheetValues(spreadsheetId, `${chaSheet.title}!A2:AM200`);
        const chassisList = parseChaLogRows(rows);
        if (chassisList.length > 0) {
          extractedData.chassis = chassisList;
          totalExtractedCount += chassisList.length;
        }
      }

      // 3. Extract GNZ (LOG) deduplicated by latest row
      const gnzSheet = loadedMetadata.sheets.find(
        (s) => s.title.includes('GNZ (LOG)') || s.title.toUpperCase().includes('GNZ (LOG)')
      );
      if (gnzSheet && selectedSheets[gnzSheet.title]) {
        const rows = await getSheetValues(spreadsheetId, `${gnzSheet.title}!A2:AF200`);
        const gensets = parseGnzLogRows(rows);
        if (gensets.length > 0) {
          extractedData.gensets = gensets;
          totalExtractedCount += gensets.length;
        }
      }

      // 4. Extract Ban (LOG) deduplicated by latest row
      const banSheet = loadedMetadata.sheets.find(
        (s) => s.title.toUpperCase() === 'BAN (LOG)' || s.title.includes('Ban (LOG)')
      );
      if (banSheet && selectedSheets[banSheet.title]) {
        const rows = await getSheetValues(spreadsheetId, `${banSheet.title}!A2:AK300`);
        const tires = parseBanLogRows(rows);
        if (tires.length > 0) {
          extractedData.tires = tires;
          totalExtractedCount += tires.length;
        }
      }

      // 5. Extract SCH (Maintenance Queue)
      const schSheet = loadedMetadata.sheets.find((s) =>
        s.title.toUpperCase().includes('SCH')
      );
      if (schSheet && selectedSheets[schSheet.title]) {
        const rows = await getSheetValues(spreadsheetId, `${schSheet.title}!A1:X150`);
        const wos = parseSchQueueRows(rows);
        if (wos.length > 0) {
          extractedData.workOrders = wos;
          totalExtractedCount += wos.length;
        }
      }

      // 6. Extract PART (LOG) & LAKA (LOG)
      const partLogSheet = loadedMetadata.sheets.find((s) =>
        s.title.toUpperCase().includes('PART (LOG)')
      );
      if (partLogSheet && selectedSheets[partLogSheet.title]) {
        const rows = await getSheetValues(spreadsheetId, `${partLogSheet.title}!A2:N200`);
        const reqs = parsePartLogRows(rows);
        if (reqs.length > 0) {
          extractedData.partRequests = reqs;
          totalExtractedCount += reqs.length;
        }
      }

      const lakaSheet = loadedMetadata.sheets.find((s) =>
        s.title.toUpperCase().includes('LAKA (LOG)')
      );
      if (lakaSheet && selectedSheets[lakaSheet.title]) {
        const rows = await getSheetValues(spreadsheetId, `${lakaSheet.title}!A2:J200`);
        const lakas = parseLakaLogRows(rows);
        if (lakas.length > 0) {
          extractedData.incidents = lakas;
          totalExtractedCount += lakas.length;
        }
      }

      // Sync into store
      syncFromGoogleSheetsData(extractedData);
      setExtractSuccessMsg(
        `Berhasil mengekstrak & menyelaraskan ${totalExtractedCount} entitas terbaru dari sheet LOG ke dalam aplikasi.`
      );
    } catch (e: any) {
      setDetailsError(e.message || 'Gagal mengekstrak data dari Google Sheets.');
    } finally {
      setIsExtracting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showResetConfirm) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, showResetConfirm, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0A2547]/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Integrasi & Ekstraktor Google Sheets"
    >
      <div className="bg-white rounded-[10px] border border-[#E2E8F0] shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[8px] bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Integrasi & Ekstraktor Google Sheets
              </h3>
              <p className="text-xs text-[#475569]">
                Sinkronkan spreadsheet <b>BMI_WorkshopManagement_Test_06/10/26</b> atau Server Lokal Perusahaan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal integrasi"
            className="p-1.5 text-[#475569] hover:text-slate-900 hover:bg-slate-100 rounded-[6px] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Status Banner */}
        <div className="mb-6 p-4 rounded-xl border bg-slate-50 border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isLoggedIn ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <div>
              <span className="font-bold text-slate-800">
                {isLoggedIn ? 'Akun Google Terhubung' : 'Belum Masuk Google Workspace'}
              </span>
              <div className="text-[11px] text-slate-500">
                {isLoggedIn ? userEmail : 'Masuk untuk mengakses Google Drive & Sheets API'}
              </div>
            </div>
          </div>

          {!isLoggedIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
            >
              Masuk dengan Akun Google
            </button>
          )}
        </div>

        {/* Spreadsheet Selector / Input */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-800">
                ID Spreadsheet atau Nama File di Google Drive:
              </label>
              <button
                type="button"
                onClick={() => setSpreadsheetInput('1LVPzTUXrT2HLNbQDNRPh5kzW0dFyBKyLnMuVhscRjT4')}
                className="text-[11px] font-mono text-emerald-700 hover:underline font-semibold"
              >
                Gunakan Sheet ID Parameter (1LVPzTUX...RjT4)
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={spreadsheetInput}
                onChange={(e) => setSpreadsheetInput(e.target.value)}
                placeholder="Masukkan ID Spreadsheet atau link URL..."
                className="flex-1 min-w-[200px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-medium focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                disabled={isExtracting || !spreadsheetInput.trim()}
                onClick={handleDirectLiveSync}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
                <span>{isExtracting ? 'Menyelaraskan...' : 'Sinkronkan Live Sekarang'}</span>
              </button>
              <button
                type="button"
                disabled={isLoadingDetails || !isLoggedIn}
                onClick={handleLoadSpreadsheet}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                {isLoadingDetails ? 'Membuka...' : 'Pilih Sheet (OAuth)'}
              </button>
              {isLoggedIn && (
                <button
                  type="button"
                  disabled={isExtracting || !spreadsheetInput.trim()}
                  onClick={handleStandardizeSheetNames}
                  className="px-3.5 py-2 bg-[#073E7F] hover:bg-[#0A2547] disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Perbarui Penamaan ID di Sheet
                </button>
              )}
            </div>
          </div>

          {/* Drive Search Results if Available */}
          {driveFiles.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                File Ditemukan di Google Drive Anda:
              </span>
              <div className="space-y-1">
                {driveFiles.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => {
                      setSpreadsheetInput(file.id);
                      handleLoadSpreadsheet();
                    }}
                    className="p-2.5 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 cursor-pointer text-xs flex items-center justify-between"
                  >
                    <span className="font-semibold text-slate-800">{file.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">{file.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detailsError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{detailsError}</span>
            </div>
          )}

          {/* Sheet Preview & Extract Checklist */}
          {loadedMetadata && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{loadedMetadata.title}</h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    ID: {loadedMetadata.spreadsheetId}
                  </span>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  {loadedMetadata.sheets.length} Sheets Ditemukan
                </span>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-2">
                  Pilih Sheet LOG untuk diekstrak:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {loadedMetadata.sheets.map((sheet) => {
                    const isChecked = !!selectedSheets[sheet.title];
                    return (
                      <label
                        key={sheet.title}
                        className={`p-2.5 rounded-lg border text-xs font-mono font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-white border-emerald-500 text-slate-900'
                            : 'bg-slate-100/50 border-slate-200 text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setSelectedSheets({
                              ...selectedSheets,
                              [sheet.title]: e.target.checked
                            })
                          }
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="truncate">{sheet.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 text-right">
                <button
                  type="button"
                  disabled={isExtracting}
                  onClick={handleExtractAndSync}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-colors shadow-sm flex items-center gap-2 ml-auto"
                >
                  <RefreshCw className={`w-4 h-4 ${isExtracting ? 'animate-spin' : ''}`} />
                  <span>
                    {isExtracting ? 'Mengekstrak Data...' : 'Ekstrak Sheet LOG ke Aplikasi'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {extractSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{extractSuccessMsg}</span>
            </div>
          )}

          {/* v5: Import Odometer (CSV) — staging -> validasi -> preview -> commit */}
          {canImportOdometer && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Import Data Odometer (CSV)
                </h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Staging → validasi (KM mundur / KM 0 / unit &amp; nopol) → preview → commit. KM master tidak diubah langsung.
                </p>
              </div>
              <input
                type="file"
                accept=".csv,.txt,text/csv"
                disabled={odoBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleOdometerFile(f);
                }}
                className="block w-full text-xs text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-bold file:text-xs hover:file:bg-slate-200"
              />
              {odoBatch && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 text-[11px] text-slate-600 flex justify-between">
                    <span>
                      {odoBatch.fileName} · {odoBatch.rows.length} baris
                    </span>
                    <span>
                      <span className="text-red-600 font-bold">
                        {odoBatch.rows.filter((r) => !r.valid).length} error
                      </span>
                      {' · '}
                      <span className="text-amber-600 font-bold">
                        {odoBatch.rows.filter((r) => r.warnings.length > 0).length} warning
                      </span>
                    </span>
                  </div>
                  <div className="max-h-40 overflow-auto">
                    <table className="w-full text-[11px]">
                      <tbody>
                        {odoBatch.rows.slice(0, 20).map((r) => (
                          <tr key={`${r.rowNo}-${r.idUnit}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 font-mono">{r.idUnit}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {r.kmBaru.toLocaleString('id-ID')}
                            </td>
                            <td
                              className={`px-3 py-1.5 ${
                                r.valid ? 'text-emerald-600' : 'text-red-600'
                              }`}
                            >
                              {r.valid ? 'VALID' : r.errors[0]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-3 py-2 border-t border-slate-200 flex justify-end">
                    <button
                      type="button"
                      disabled={odoBusy || odoBatch.status !== 'STAGED'}
                      onClick={handleOdometerCommit}
                      className="px-3 py-1.5 rounded-lg bg-[#073E7F] text-white text-xs font-bold disabled:opacity-50"
                    >
                      {odoBatch.status === 'COMMITTED'
                        ? 'Sudah di-Commit'
                        : odoBusy
                        ? 'Memproses…'
                        : 'Commit ke Master'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reset Fallback */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Perlu memulihkan data bawaan historis BMI?</span>
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="text-slate-800 font-bold hover:underline"
            >
              Reset ke Data Default Historis
            </button>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={() => {
          resetToInitialDefaults();
          setShowResetConfirm(false);
          toast.success('Data historis berhasil dipulihkan');
        }}
        title="Pulihkan Data Default"
        message="Apakah Anda yakin ingin memulihkan seluruh data operasional ke data historis bawaan BMI?"
        confirmLabel="Ya, Pulihkan"
        variant="danger"
      />
    </div>
  );
};
