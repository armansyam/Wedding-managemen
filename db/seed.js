const db = require('../db');

// Default vendor settings
const defaultSettings = [
  ['vendor_name', 'Sorehari Photography'],
  ['vendor_tagline', 'Masuk Kotor, Keluar Kinclong ✨'],
  ['vendor_email', 'hello@sorehari.com'],
  ['vendor_phone', '0823333333420'],
  ['vendor_address', 'Makassar, Sulawesi Selatan'],
  ['vendor_website', 'sorehari.com'],
  ['currency', 'IDR'],
  ['tax_rate', '0'],
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of defaultSettings) insertSetting.run(k, v);

// Packages
db.prepare('INSERT OR IGNORE INTO packages (id, name, description, price) VALUES (?, ?, ?, ?)').run(1, 'Silver', 'Foto dokumentasi, 50 edited foto, 1 photographer', 3000000);
db.prepare('INSERT OR IGNORE INTO packages (id, name, description, price) VALUES (?, ?, ?, ?)').run(2, 'Gold', 'Foto + video, 80 edited, 1 photographer, 1 videographer, drone', 5000000);
db.prepare('INSERT OR IGNORE INTO packages (id, name, description, price) VALUES (?, ?, ?, ?)').run(3, 'Platinum', 'Full coverage foto + video + drone, 100 edited, highlight reel, 2 photographer, 1 videographer, same day edit', 8000000);

// Sessions (Master Sesi)
const insertSession = db.prepare('INSERT OR IGNORE INTO sessions (id, name, description, default_order) VALUES (?, ?, ?, ?)');
insertSession.run(1, 'Mappettuada', 'Acara lamaran/pinangan adat Makassar', 1);
insertSession.run(2, 'Mappacci', 'Acara malam pensucian diri menjelang akad', 2);
insertSession.run(3, 'Akad Nikah', 'Upacara ijab kabul pernikahan', 3);
insertSession.run(4, 'Resepsi', 'Pesta pernikahan / resepsi', 4);
insertSession.run(5, 'Prewedding', 'Sesi foto pra-nikah outdoor/indual', 5);
insertSession.run(6, 'Siraman', 'Upacara siraman adat', 6);
insertSession.run(7, 'Lainnya', 'Sesi lain', 7);

// Freelancers
const insertFreelancer = db.prepare('INSERT OR IGNORE INTO freelancers (id, name, skill, phone, rate_default) VALUES (?, ?, ?, ?, ?)');
insertFreelancer.run(1, 'Budi', 'Second Shooter', '081234560001', 800000);
insertFreelancer.run(2, 'Raka', 'Videographer', '081234560002', 1000000);
insertFreelancer.run(3, 'Sari', 'MUA', '081234560003', 500000);

// Freelancer Fees per Sesi
const insertFee = db.prepare('INSERT OR IGNORE INTO freelancer_fees (freelancer_id, session_id, fee_amount) VALUES (?, ?, ?)');
// Budi (Second Shooter)
insertFee.run(1, 1, 200000);  // Mappettuada
insertFee.run(1, 2, 250000);  // Mappacci
insertFee.run(1, 3, 400000);  // Akad Nikah
insertFee.run(1, 4, 800000);  // Resepsi
insertFee.run(1, 5, 300000);  // Prewedding
// Raka (Videographer)
insertFee.run(2, 1, 250000);  // Mappettuada
insertFee.run(2, 2, 300000);  // Mappacci
insertFee.run(2, 3, 500000);  // Akad Nikah
insertFee.run(2, 4, 1000000); // Resepsi
insertFee.run(2, 5, 400000);  // Prewedding
// Sari (MUA)
insertFee.run(3, 1, 200000);  // Mappettuada
insertFee.run(3, 2, 150000);  // Mappacci
insertFee.run(3, 3, 500000);  // Akad Nikah
insertFee.run(3, 4, 500000);  // Resepsi

// Package Sessions
const insertPkgSession = db.prepare('INSERT OR IGNORE INTO package_sessions (package_id, session_id) VALUES (?, ?)');
// Silver: Akad + Resepsi
insertPkgSession.run(1, 3);
insertPkgSession.run(1, 4);
// Gold: Mappacci + Akad + Resepsi
insertPkgSession.run(2, 2);
insertPkgSession.run(2, 3);
insertPkgSession.run(2, 4);
// Platinum: Mappettuada + Mappacci + Akad + Resepsi
insertPkgSession.run(3, 1);
insertPkgSession.run(3, 2);
insertPkgSession.run(3, 3);
insertPkgSession.run(3, 4);

// Products (modal fisik & digital)
const insertProduct = db.prepare('INSERT OR IGNORE INTO products (id, name, category, unit_cost, unit, description) VALUES (?, ?, ?, ?, ?, ?)');
insertProduct.run(1, 'Cetak Foto 4R', 'fisik', 3000, 'lembar', 'Cetak foto ukuran 4R');
insertProduct.run(2, 'Album 20cm x 30cm', 'fisik', 150000, 'pcs', 'Album hardcover 20 halaman');
insertProduct.run(3, 'Cetak Undangan 100 lembar', 'fisik', 500000, 'set', 'Undangan digital print 100 lembar');
insertProduct.run(4, 'Drone Rental', 'digital', 500000, 'hari', 'Sewa drone untuk syuting');
insertProduct.run(5, 'Same Day Edit Video', 'digital', 300000, 'sesi', 'Edit video highlight hari H');

// Package Products
const insertPkgProduct = db.prepare('INSERT OR IGNORE INTO package_products (package_id, product_id, quantity) VALUES (?, ?, ?)');
// Silver: cetak 50 foto
insertPkgProduct.run(1, 1, 50);
// Gold: cetak 80 foto + drone
insertPkgProduct.run(2, 1, 80);
insertPkgProduct.run(2, 4, 1);
// Platinum: cetak 100 + album + drone + SDE
insertPkgProduct.run(3, 1, 100);
insertPkgProduct.run(3, 2, 1);
insertPkgProduct.run(3, 4, 1);
insertPkgProduct.run(3, 5, 1);

// Leads
const insertLead = db.prepare('INSERT OR IGNORE INTO leads (id, name, phone, partner_name, wedding_date, venue, package_interest, message, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
insertLead.run(1, 'Andi', '081234567890', 'Rina', '2026-08-15', 'Hotel Clarion', 'Gold', 'Mau tanya paket gold untuk resepsi', 'new');
insertLead.run(2, 'Fajar', '081234567891', 'Maya', '2026-09-20', 'Masjid Raya', 'Silver', 'Akad nikah saja', 'contacted');
insertLead.run(3, 'Dimas', '081234567892', 'Sari', '2026-07-10', 'Balai Kartini', 'Platinum', 'Full coverage resepsi', 'interested');
insertLead.run(4, 'Rizky', '081234567893', 'Putri', '2026-10-05', 'Gedung Phinisi', 'Gold', 'Mau cek paket gold', 'new');

// Clients
db.prepare('INSERT OR IGNORE INTO clients (id, lead_id, name, partner_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)').run(1, 3, 'Dimas & Sari', 'Sari', 'dimas@email.com', '081234567892');

// Bookings (with token for public link)
db.prepare('INSERT OR IGNORE INTO bookings (id, client_id, event_name, event_date, venue, package_id, package_price, status, booking_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(1, 1, 'Resepsi Dimas & Sari', '2026-07-10', 'Balai Kartini', 3, 8000000, 'confirmed', 'dmsari2026');

// Booking Sessions (timeline)
const insertBookingSession = db.prepare('INSERT OR IGNORE INTO booking_sessions (id, booking_id, session_id, event_date, event_time, location) VALUES (?, ?, ?, ?, ?, ?)');
insertBookingSession.run(1, 1, 3, '2026-07-10', '08:00', 'Masjid Raya Makassar');
insertBookingSession.run(2, 1, 4, '2026-07-10', '11:00', 'Balai Kartini');

// Booking Expenses
db.prepare('INSERT OR IGNORE INTO booking_expenses (id, booking_id, category, description, amount, freelancer_id) VALUES (?, ?, ?, ?, ?, ?)').run(1, 1, 'freelance', 'Akad - Budi (Second Shooter)', 400000, 1);
db.prepare('INSERT OR IGNORE INTO booking_expenses (id, booking_id, category, description, amount, freelancer_id) VALUES (?, ?, ?, ?, ?, ?)').run(2, 1, 'freelance', 'Resepsi - Budi (Second Shooter)', 800000, 1);
db.prepare('INSERT OR IGNORE INTO booking_expenses (id, booking_id, category, description, amount, freelancer_id) VALUES (?, ?, ?, ?, ?, ?)').run(3, 1, 'freelance', 'Resepsi - Raka (Videographer)', 1000000, 2);

// Payments
db.prepare('INSERT OR IGNORE INTO payments (id, booking_id, type, amount, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 1, 'dp', 4000000, '2026-06-01', 'transfer', 'DP 50%');

console.log('✅ Seed data inserted');
