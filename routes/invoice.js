const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');

// GET /api/bookings/:id/invoice — generate PDF invoice
router.get('/:id/invoice', (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, c.name AS client_name, c.partner_name, c.phone, c.email,
           c.event_date, c.venue, p.name AS package_name, p.price AS package_price
    FROM bookings b
    JOIN clients c ON b.client_id = c.id
    LEFT JOIN packages p ON b.package_id = p.id
    WHERE b.id = ?
  `).get(req.params.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // Get settings (vendor profile)
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

  // Invoice number
  const invoiceNo = `INV-${new Date().getFullYear()}-${String(booking.id).padStart(4, '0')}`;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoiceNo}.pdf"`);
  doc.pipe(res);

  const accent = '#C8553D';
  const muted = '#666666';
  const dark = '#1a1a1a';

  // Header
  doc.fontSize(22).font('Helvetica-Bold').fillColor(dark)
     .text(settings?.vendor_name || 'Sorehari Photography', 50, 50);
  doc.fontSize(9).font('Helvetica').fillColor(muted)
     .text(settings?.vendor_email || '', 50, 76);
  if (settings?.vendor_phone) {
    doc.text(settings.vendor_phone, 50, 88);
  }

  // Invoice badge
  doc.rect(420, 50, 130, 60).fill(accent);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff').text('INVOICE', 430, 58);
  doc.fontSize(13).font('Helvetica-Bold').text(invoiceNo, 430, 74);
  doc.fontSize(9).font('Helvetica').text(new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), 430, 94);

  // Divider
  doc.moveTo(50, 130).lineTo(545, 130).strokeColor(accent).lineWidth(1.5).stroke();

  // Bill To
  doc.fontSize(9).font('Helvetica').fillColor(muted).text('BILL TO', 50, 145);
  const clientName = [booking.client_name, booking.partner_name].filter(Boolean).join(' & ');
  doc.fontSize(14).font('Helvetica-Bold').fillColor(dark).text(clientName, 50, 160);
  if (booking.phone) doc.fontSize(9).font('Helvetica').fillColor(muted).text(booking.phone, 50, 180);
  if (booking.email) doc.text(booking.email, 50, 192);

  // Event details (right side)
  doc.fontSize(9).font('Helvetica').fillColor(muted).text('EVENT DETAILS', 350, 145);
  doc.fontSize(10).font('Helvetica').fillColor(dark);
  if (booking.event_date) {
    const evDate = new Date(booking.event_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`Tanggal Acara: ${evDate}`, 350, 162);
  }
  if (booking.venue) doc.text(`Lokasi: ${booking.venue}`, 350, 176);

  // Table header
  const tableTop = 230;
  doc.rect(50, tableTop, 495, 28).fill('#f5f5f5');
  doc.fontSize(9).font('Helvetica-Bold').fillColor(dark);
  doc.text('DESKRIPSI', 60, tableTop + 9);
  doc.text('JUMLAH', 420, tableTop + 9);

  // Table rows
  let y = tableTop + 38;
  const price = booking.package_price || booking.package_price || 0;

  // Package row
  doc.fontSize(10).font('Helvetica-Bold').fillColor(dark).text(booking.package_name || 'Paket', 60, y);
  doc.text(formatIDR(price), 420, y);
  y += 20;

  // DP row
  doc.fontSize(9).font('Helvetica').fillColor(muted).text(`DP (${Math.round((booking.dp_amount / price) * 100) || 30}%)`, 60, y);
  doc.fillColor(accent).text(`-${formatIDR(booking.dp_amount || 0)}`, 420, y);
  y += 20;

  // Divider line
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
  y += 10;

  // DP Paid
  doc.fontSize(10).font('Helvetica').fillColor(dark).text('DP Dibayar', 60, y);
  doc.fillColor(accent).font('Helvetica-Bold').text(formatIDR(booking.dp_amount || 0), 420, y);
  y += 22;

  // Remaining
  const remaining = price - (booking.dp_amount || 0);
  doc.fontSize(11).font('Helvetica-Bold').fillColor(dark).text('Sisa Pembayaran', 60, y);
  doc.text(formatIDR(remaining), 420, y);
  y += 30;

  // Payment info box
  doc.roundedRect(50, y, 495, 80, 6).fillAndStroke('#FFF8F0', accent);
  y += 15;
  doc.fontSize(11).font('Helvetica-Bold').fillColor(accent).text('Transfer ke:', 65, y);
  y += 18;
  doc.fontSize(10).font('Helvetica').fillColor(dark);
  doc.text(settings?.bank_info || 'Bank BCA - 3420-1111-99 - a.n. Sorehari Photography', 65, y);
  y += 16;
  doc.fontSize(9).font('Helvetica').fillColor(muted).text('Kirim bukti transfer ke admin setelah pembayaran.', 65, y);

  // Footer
  doc.fontSize(8).font('Helvetica').fillColor(muted)
     .text('Terima kasih atas kepercayaan Anda.', 50, 720, { align: 'center' })
     .text(settings?.vendor_name || 'Sorehari Photography', 50, 732, { align: 'center' });

  doc.end();
});

function formatIDR(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

module.exports = router;
