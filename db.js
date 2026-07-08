const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'db', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbFilename = process.env.DB_FILENAME || 'wedding.db';
const dbPath = path.join(dbDir, dbFilename);
const db = new Database(dbPath);

// Performance: WAL mode + foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Auto-initialize schema and default settings if table settings doesn't exist
const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
if (!tableExists) {
  console.log('Database tables not found. Initializing schema from schema.sql...');
  const schemaPath = path.join(__dirname, 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
    console.log('Schema initialized successfully.');

    // Seed default generic settings
    const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    stmt.run('vendor_name', 'Wedding-Management');
    stmt.run('vendor_tagline', 'Your Story, Beautifully Captured ✨');
    stmt.run('vendor_email', 'hello@wedding-management.com');
    stmt.run('vendor_phone', '081234567890');
    stmt.run('vendor_address', 'Your Address, City');
    stmt.run('vendor_website', 'wedding-management.com');
    stmt.run('currency', 'IDR');
    stmt.run('tax_rate', '0');
    stmt.run('followup_h_days', '10');

    // Seed default generic WA templates
    const defaultTemplates = {
      wa_welcome: "Halo Kak {{name}}! 👋\n\nTerima kasih sudah menghubungi *{{vendor_name}}* ✨\n\nSenang sekali bisa membantu merencanakan momen spesial Kak {{name}}{{#partner}} dan {{partner_name}}{{/partner}} 🙏\n\nSaya Admin. Boleh kita diskusi lebih lanjut tentang kebutuhan foto/video untuk acara Kakak? Apa yang Kakak butuhkan dan budget yang dianggarkan?\n\nMohon infonya ya, Kak! 😊📸",
      wa_booking_proposal: "Halo Kak {{name}}! 👋\n\nTerima kasih sudah menghubungi *{{vendor_name}}* ✨\n\nUntuk memilih paket dan mengirimkan bukti DP, silakan klik link di bawah ya, Kak:\n{{booking_link}}\n\nSetelah memilih paket, harga dan detail booking akan otomatis terupdate. Kami tunggu kabarnya! 😊📸",
      wa_dp_verified: "Halo Kak {{client_name}}! 👋\n\nDP untuk booking {{client_name}} & {{partner_name}} telah **DIVERIFIKASI** ✅\n\n📅 Tanggal Acara: {{event_date}}\n📍 Venue: {{venue}}\n🎨 Paket: {{package_name}}\n\nBooking status sekarang: **Confirmed**\n\nTim kami akan segera merencanakan detail sesi foto/videonya. Tunggu kabar selanjutnya ya, Kak! 🙏📸",
      wa_dp_confirmed: "Halo Kak {{client_name}}! 👋\n\nDP untuk booking {{client_name}} & {{partner_name}} telah **DIKONFIRMASI** ✅\n\n📅 Tanggal Acara: {{event_date}}\n📍 Venue: {{venue}}\n🎨 Paket: {{package_name}}\n\nBooking status sekarang: **Confirmed**\n\nTim kami akan segera merencanakan detail sesi foto/videonya. Tunggu kabar selanjutnya ya, Kak! 🙏📸",
      wa_invoice: "Halo {{client_name}} 👋\n\nTerima kasih telah memilih *{{vendor_name}}* 📸\n\n📋 *Invoice DP:*\nPaket: {{package_name}}\nDP: {{dp_amount}}\n\nSilakan buka link invoice lengkap:\n{{invoice_url}}\n\nTerima kasih 🙏",
      wa_pelunasan: "Halo Kak {{client_name}} ✨\n\nSemoga Kakak & pasangan selalu sehat dan dilancarkan segala persiapannya menjelang hari bahagia ya Kak. 😊\n\nMengingat tanggal pernikahan Kakak semakin dekat pada *{{event_date}}*, kami dari tim *{{vendor_name}}* ingin menginfokan terkait kelengkapan administrasi sisa pembayaran (pelunasan).\n\nRincian sisa pelunasan Kakak:\n💵 Sisa Pembayaran: *{{remaining}}*\n\nKakak dapat melakukan pelunasan dan mengunggah bukti transfer secara aman melalui tautan resmi di bawah ini:\n🔗 {{pelunasan_url}}\n\nJika ada hal yang ingin dikoordinasikan atau ditanyakan terkait detail acara, silakan kabari kami ya Kak. Kami tidak sabar mengabadikan momen spesial Kakak nanti!\n\nTerima kasih banyak atas kepercayaan Kakak bersama *{{vendor_name}}*. 🙏 Warm regards, Tim {{vendor_name}}. 📸",
      wa_pelunasan_confirmed: "Halo {{client_name}} 👋\n\nPembayaran untuk acara *{{event_date}}* telah *LUNAS* ✅\n\n📋 Paket: {{package_name}}\n💰 Total: {{package_price}}\n\nInvoice lengkap:\n{{invoice_url}}\n\nTerima kasih atas kepercayaannya! Kami akan mempersiapkan acara terbaik untuk Anda 🙏📸",
      wa_tagih_h_x: "Halo Kak {{client_name}}! 👋\n\nKami dari *{{vendor_name}}* ingin mengingatkan bahwa pembayaran untuk acara {{event_date}} di {{venue}} masih ada sisa pelunasan sebesar *{{remaining}}*.\n\nMohon bisa diselesaikan maksimal 7 hari sebelum acara ya, Kak. Terima kasih! 🙏",
      wa_freelance_validation: "Halo {{freelancer_name}} 👋\n\nSistem {{vendor_name}} telah mencatat total pembayaran honor/fee Anda untuk project *{{client_name}}* sebesar *{{total_fee}}*.\n\nMohon periksa & konfirmasi kembali nomor rekening Anda:\n🏦 *{{bank_name}}*\n💳 *{{bank_account}}*\n👤 *a.n. {{bank_holder}}*\n\nJika sudah benar, balas pesan ini agar admin segera mencairkan dana. Terima kasih! 🙏",
      wa_freelance_paid: "Halo {{freelancer_name}} ✨\n\nHalo, pembayaran honor/fee Anda untuk project *{{client_name}}* sebesar *{{total_fee}}* telah ditransfer ke rekening Anda.\n\nBukti transfer dapat diunduh di tautan berikut:\n{{receipt_url}}\n\nTerima kasih atas kerja kerasnya di lapangan! Semoga sukses selalu 🙏"
    };

    for (const [key, value] of Object.entries(defaultTemplates)) {
      stmt.run(key, value);
    }
    console.log('Default settings and templates seeded successfully.');
  } else {
    console.error('Error: schema.sql not found at ' + schemaPath);
  }
}

module.exports = db;
