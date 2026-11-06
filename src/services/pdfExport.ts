import { WorkOrder, ChassisInspectionItem } from '../types';

export async function exportChassisChecklistPdf(
  docNo: string,
  location: string,
  pic: string,
  items: ChassisInspectionItem[],
  durationMinutes: number = 5
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;
  const M = 10;
  const NAVY = [10, 37, 71];
  const GOLD = [209, 159, 15];

  // Top Navy & Gold Bar
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, W, 3, 'F');
  doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.rect(0, 3, W, 1.2, 'F');

  // Header Box (3-column ISO corporate header)
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(0.45);
  doc.rect(M, 8, W - 2 * M, 18);
  doc.line(M + 62, 8, M + 62, 26);
  doc.line(W - M - 65, 8, W - M - 65, 26);

  // Left Header: BMI Brand
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('BMI FLEET', M + 5, 16);
  doc.setFontSize(7.5);
  doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.text('PT BUMI MENARA INTERNUSA', M + 5, 21.5);

  // Center Header: Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('CEK LIST STANDAR PENGECEKAN CHASSIS', W / 2, 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DIVISI WORKSHOP & PEMELIHARAAN ARMADA LOGISTIK', W / 2, 21.5, { align: 'center' });

  // Right Header: Form & Doc No
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(`No. Dok: ${docNo}`, W - M - 4, 14, { align: 'right' });
  doc.text('Form: F-S-031-003-000', W - M - 4, 19, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Revisi: 00 | Hal: 1', W - M - 4, 23.5, { align: 'right' });

  // 6 Metadata Summary Boxes
  const nowStr = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const faultCount = items.filter(
    (item) =>
      item.v.ban !== 'B' ||
      item.v.gajah === 0 ||
      item.v.lampu === 0 ||
      item.v.rem === 0 ||
      item.v.pagar === 0 ||
      item.v.slebor === 0 ||
      item.v.b1 === 0 ||
      item.v.b2 === 0 ||
      (item.a3 && item.v.b3 === 0) ||
      item.v.ld === 0 ||
      item.v.lt === 0 ||
      item.v.lb === 0
  ).length;
  const okCount = items.length - faultCount;

  const metaBoxes = [
    { label: 'TANGGAL & JAM', val: `${nowStr} WIB` },
    { label: 'LOKASI POOL', val: location },
    { label: 'TEKNISI PEMERIKSA', val: pic },
    { label: 'DURASI INSPEKSI', val: `${Math.max(1, durationMinutes)} Menit` },
    { label: 'TOTAL DIPERIKSA', val: `${items.length} Unit Chassis` },
    { label: 'RINGKASAN STATUS', val: `${okCount} Siap Jalan / ${faultCount} Temuan` }
  ];

  const boxW = (W - 2 * M) / 6;
  const boxY = 29;
  doc.setLineWidth(0.25);
  doc.setDrawColor(203, 213, 225);

  metaBoxes.forEach((b, i) => {
    const bx = M + i * boxW;
    doc.setFillColor(248, 250, 252);
    doc.rect(bx, boxY, boxW, 11, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, bx + 2.5, boxY + 4);
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(String(b.val).slice(0, 24), bx + 2.5, boxY + 8.8);
  });

  // 13-Point Matrix Table Header
  let y = 43;
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(M, y, W - 2 * M, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);

  doc.text('No', M + 2, y + 5.3);
  doc.text('Kode Chassis', M + 9, y + 5.3);
  doc.text('Tipe', M + 36, y + 5.3);
  doc.text('Ban', M + 68, y + 5.3);
  doc.text('Gajah', M + 84, y + 5.3);
  doc.text('Lampu', M + 98, y + 5.3);
  doc.text('Rem', M + 112, y + 5.3);
  doc.text('Pagar', M + 125, y + 5.3);
  doc.text('Slebor', M + 139, y + 5.3);
  doc.text('Baut Ex 1/2/3', M + 154, y + 5.3);
  doc.text('Lock D/T/B', M + 180, y + 5.3);
  doc.text('Status & Catatan Kerusakan', M + 204, y + 5.3);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  items.forEach((item, idx) => {
    if (y > 158) {
      doc.addPage();
      y = 20;
    }

    const hasFault =
      item.v.ban !== 'B' ||
      item.v.gajah === 0 ||
      item.v.lampu === 0 ||
      item.v.rem === 0 ||
      item.v.pagar === 0 ||
      item.v.slebor === 0 ||
      item.v.b1 === 0 ||
      item.v.b2 === 0 ||
      (item.a3 && item.v.b3 === 0) ||
      item.v.ld === 0 ||
      item.v.lt === 0 ||
      item.v.lb === 0;

    if (hasFault) {
      doc.setFillColor(254, 243, 199);
      doc.rect(M, y, W - 2 * M, 6.8, 'F');
      doc.setTextColor(146, 64, 14);
    } else {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(M, y, W - 2 * M, 6.8, 'F');
      }
      doc.setTextColor(30, 41, 59);
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(M, y + 6.8, W - M, y + 6.8);

    doc.text(String(idx + 1), M + 2, y + 4.7);
    doc.setFont('helvetica', 'bold');
    doc.text(item.idUnit, M + 9, y + 4.7);
    doc.setFont('helvetica', 'normal');
    doc.text(item.tipe.slice(0, 18), M + 36, y + 4.7);
    doc.text(
      item.v.ban === 'B' ? 'OK' : item.v.ban === 'L' ? 'BOCOR' : 'RUSAK',
      M + 68,
      y + 4.7
    );
    doc.text(item.v.gajah ? 'OK' : 'RUSAK', M + 84, y + 4.7);
    doc.text(item.v.lampu ? 'OK' : 'RUSAK', M + 98, y + 4.7);
    doc.text(item.v.rem ? 'OK' : 'RUSAK', M + 112, y + 4.7);
    doc.text(item.v.pagar ? 'OK' : 'RUSAK', M + 125, y + 4.7);
    doc.text(item.v.slebor ? 'OK' : 'RUSAK', M + 139, y + 4.7);
    doc.text(
      `${item.v.b1 ? 'OK' : 'X'}/${item.v.b2 ? 'OK' : 'X'}/${
        item.a3 ? (item.v.b3 ? 'OK' : 'X') : '-'
      }`,
      M + 154,
      y + 4.7
    );
    doc.text(
      `${item.v.ld ? 'OK' : 'X'}/${item.v.lt ? 'OK' : 'X'}/${item.v.lb ? 'OK' : 'X'}`,
      M + 180,
      y + 4.7
    );

    const statusNotes = hasFault
      ? `TEMUAN: ${[item.banNote ? `Ban(${item.banNote})` : '', item.note || '']
          .filter(Boolean)
          .join(' - ') || 'Cek Komponen X'}`
      : 'SIAP OPERASI (13 Titik Normal)';
    doc.text(statusNotes.slice(0, 48), M + 204, y + 4.7);

    y += 6.8;
  });

  // Signature & Verification Block at Bottom
  const sigY = Math.max(y + 6, 165);
  if (sigY + 30 > H - 6) {
    doc.addPage();
  }
  const finalSigY = sigY + 30 > H - 6 ? 25 : sigY;

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);

  // Legend Box
  doc.setFillColor(248, 250, 252);
  doc.rect(M, finalSigY, 135, 26, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('KETERANGAN STANDAR INSPEKSI (F-S-031-003-000):', M + 3, finalSigY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('1. OK = Kondisi komponen berfungsi normal & lengkap.', M + 3, finalSigY + 11);
  doc.text('2. X / RUSAK / BOCOR = Ditemukan kerusakan fisik; otomatis masuk antrean Work Order.', M + 3, finalSigY + 16);
  doc.text('3. Exel 3 berlaku khusus untuk unit Chassis 40ft (3 Axle).', M + 3, finalSigY + 21);

  // Technician Signature Box
  doc.rect(W - M - 130, finalSigY, 62, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('Diperiksa Oleh (Teknisi):', W - M - 99, finalSigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(16, 185, 129);
  doc.text('[ VERIFIED DIGITAL ]', W - M - 99, finalSigY + 14, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(pic, W - M - 99, finalSigY + 23, { align: 'center' });

  // Supervisor Signature Box
  doc.rect(W - M - 64, finalSigY, 64, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('Disetujui Oleh (SPV Workshop):', W - M - 32, finalSigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('( ________________________ )', W - M - 32, finalSigY + 23, { align: 'center' });

  // Optional Photo Evidence Page if any item has photo attached
  const itemsWithPhotos = items.filter((i) => i.foto);
  if (itemsWithPhotos.length > 0) {
    doc.addPage();
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 0, W, 3, 'F');
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(0, 3, W, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(`LAMPIRAN BUKTI FOTO TEMUAN CEKLIS CHASSIS (${docNo})`, M, 14);

    let px = M;
    let py = 20;
    itemsWithPhotos.forEach((item) => {
      if (item.foto) {
        try {
          doc.setDrawColor(203, 213, 225);
          doc.rect(px, py, 85, 65);
          doc.addImage(item.foto, 'JPEG', px + 2, py + 2, 81, 52);
          doc.setFontSize(8);
          doc.setTextColor(15, 23, 42);
          doc.text(`${item.idUnit} - ${item.note || item.banNote || 'Bukti Fisik'}`, px + 3, py + 60);
          px += 92;
          if (px + 85 > W - M) {
            px = M;
            py += 72;
          }
        } catch {
          // ignore malformed data url
        }
      }
    });
  }

  doc.save(`Ceklis_Chassis_${docNo}.pdf`);
}

export async function exportWorkOrderSummaryPdf(wo: WorkOrder) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 15;

  // Header
  doc.setFillColor(10, 37, 71);
  doc.rect(0, 0, W, 22, 'F');
  doc.setFillColor(209, 159, 15);
  doc.rect(0, 22, W, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('PT BUMI MENARA INTERNUSA', M, 14);
  doc.setFontSize(9);
  doc.text('LEMBAR PERINTAH KERJA (WORK ORDER)', W - M, 14, { align: 'right' });

  let y = 38;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(13);
  doc.text(`Work Order: ${wo.woId}`, M, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Status: ${wo.status}`, W - M, y, { align: 'right' });

  y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);
  y += 8;

  // Two column details
  doc.setFontSize(9.5);
  doc.text(`Kategori: ${wo.kategori}`, M, y);
  doc.text(`Alokasi Bay: ${wo.bay}`, M + 90, y);
  y += 6;
  doc.text(`ID Unit / Nopol: ${wo.idUnit}`, M, y);
  doc.text(`Prioritas: ${wo.prioritas}`, M + 90, y);
  y += 6;
  doc.text(`Jenis Servis: ${wo.jenisServis}`, M, y);
  doc.text(`Teknisi PIC: ${wo.teknisi}`, M + 90, y);
  y += 6;
  doc.text(`Odometer / HM: ${wo.odo || '-'}`, M, y);
  doc.text(`Estimasi Selesai: ${wo.tEst || '-'}`, M + 90, y);
  y += 8;

  doc.line(M, y, W - M, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Keluhan & Catatan Pengerjaan:', M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(wo.keluhan || '-', W - 2 * M), M, y);

  y += 24;
  doc.line(M, y, W - M, y);
  y += 10;

  // Signature boxes
  doc.rect(M, y, 50, 24);
  doc.text('Dibuat Oleh:', M + 4, y + 5);
  doc.text(wo.pic, M + 4, y + 21);

  doc.rect(M + 65, y, 50, 24);
  doc.text('Mekanik Lapangan:', M + 69, y + 5);
  doc.text(wo.teknisi, M + 69, y + 21);

  doc.rect(M + 130, y, 50, 24);
  doc.text('Supervisor QC Rilis:', M + 134, y + 5);
  doc.text(wo.status === 'COMPLETED & RELEASED' ? 'VERIFIED (Lolos QC)' : 'Menunggu QC', M + 134, y + 21);

  doc.save(`WorkOrder_${wo.woId}.pdf`);
}
