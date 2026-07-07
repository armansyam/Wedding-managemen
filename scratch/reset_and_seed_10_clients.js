const db = require('../db');
const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(12).toString('hex');
}

// 1. Clear existing transactional tables
console.log('Clearing database tables...');
db.prepare('PRAGMA foreign_keys = OFF').run();
db.prepare('DELETE FROM booking_session_crew').run();
db.prepare('DELETE FROM booking_sessions').run();
db.prepare('DELETE FROM freelance_payments').run();
db.prepare('DELETE FROM payments').run();
db.prepare('DELETE FROM bookings').run();
db.prepare('DELETE FROM clients').run();
db.prepare('DELETE FROM leads').run();
db.prepare('DELETE FROM dividends').run();
db.prepare('DELETE FROM booking_expenses').run();
console.log('Database tables cleared successfully.');

// Get freelancers and packages list for mappings
const freelancers = db.prepare('SELECT id, name, avg_fee FROM freelancers').all();
const packages = db.prepare('SELECT id, name, price, estimated_crew FROM packages').all();
const sessions = db.prepare('SELECT id, name FROM sessions').all();

// Define realistic clients data
const clientsData = [
  {
    name: 'Andi Wijaya', partner_name: 'Siti Aminah', email: 'andi@gmail.com', phone: '081234567890',
    wedding_date: '2026-01-15', venue: 'Gedung Kesenian Gowa', package_id: 1, source: 'Instagram',
    booking_status: 'completed', dp_amount: 1500000, pelunasan_amount: 3000000,
    dp_date: '2025-11-10', pelunasan_date: '2026-01-10', crew_paid: true
  },
  {
    name: 'Bagus Pratama', partner_name: 'Dinda Lestari', email: 'bagus@gmail.com', phone: '082134567891',
    wedding_date: '2026-02-20', venue: 'Phinisi Ballroom Clarion', package_id: 2, source: 'TikTok',
    booking_status: 'completed', dp_amount: 2500000, pelunasan_amount: 6000000,
    dp_date: '2025-12-05', pelunasan_date: '2026-02-15', crew_paid: true
  },
  {
    name: 'Candra Kirana', partner_name: 'Rian Hidayat', email: 'candra@gmail.com', phone: '083134567892',
    wedding_date: '2026-03-10', venue: 'UpperHills Convention Hall', package_id: 3, source: 'WhatsApp',
    booking_status: 'completed', dp_amount: 3000000, pelunasan_amount: 7000000,
    dp_date: '2026-01-08', pelunasan_date: '2026-03-05', crew_paid: true
  },
  {
    name: 'Dimas Aditya', partner_name: 'Eka Putri', email: 'dimas@gmail.com', phone: '084134567893',
    wedding_date: '2026-04-18', venue: 'Four Points Sheraton', package_id: 4, source: 'Website',
    booking_status: 'delivery', dp_amount: 5000000, pelunasan_amount: 10000000,
    dp_date: '2026-02-02', pelunasan_date: '2026-04-10', crew_paid: true
  },
  {
    name: 'Fajar Nugraha', partner_name: 'Gita Saraswati', email: 'fajar@gmail.com', phone: '085134567894',
    wedding_date: '2026-05-25', venue: 'Swiss-Belhotel Makassar', package_id: 2, source: 'Instagram',
    booking_status: 'editing', dp_amount: 2500000, pelunasan_amount: 6000000,
    dp_date: '2026-03-12', pelunasan_date: '2026-05-20', crew_paid: false
  },
  {
    name: 'Heri Kurniawan', partner_name: 'Indah Permata', email: 'heri@gmail.com', phone: '086134567895',
    wedding_date: '2026-07-07', venue: 'Aura Wedding Hall', package_id: 1, source: 'Rekomendasi Teman',
    booking_status: 'event_day', dp_amount: 1500000, pelunasan_amount: null, // Pelunasan unpaid (piutang)
    dp_date: '2026-05-01', pelunasan_date: null, crew_paid: false
  },
  {
    name: 'Joko Susilo', partner_name: 'Kartika Sari', email: 'joko@gmail.com', phone: '087134567896',
    wedding_date: '2026-08-15', venue: 'Gedung Lestari', package_id: 2, source: 'WhatsApp',
    booking_status: 'in_progress', dp_amount: 2500000, pelunasan_amount: null, // DP paid, Pelunasan unpaid
    dp_date: '2026-06-10', pelunasan_date: null, crew_paid: false
  },
  {
    name: 'Lucky Wijaya', partner_name: 'Mega Utami', email: 'lucky@gmail.com', phone: '088134567897',
    wedding_date: '2026-09-05', venue: 'Haji Bate Hall', package_id: 3, source: 'Instagram',
    booking_status: 'confirmed', dp_amount: 3000000, pelunasan_amount: null, // DP paid, Pelunasan unpaid
    dp_date: '2026-06-25', pelunasan_date: null, crew_paid: false
  }
];

// Seed Converted Leads & Bookings
console.log('Seeding 8 bookings...');
clientsData.forEach((cd, index) => {
  const pkg = packages.find(p => p.id === cd.package_id);
  const price = pkg ? pkg.price : 4500000;

  // 1. Insert Lead
  const leadRes = db.prepare(`
    INSERT INTO leads (name, email, phone, partner_name, wedding_date, venue, package_interest, source, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'booked')
  `).run(cd.name, cd.email, cd.phone, cd.partner_name, cd.wedding_date, cd.venue, pkg.name, cd.source);
  const leadId = leadRes.lastInsertRowid;

  // 2. Insert Client
  const clientRes = db.prepare(`
    INSERT INTO clients (lead_id, name, partner_name, email, phone, address)
    VALUES (?, ?, ?, ?, ?, 'Makassar')
  `).run(leadId, cd.name, cd.partner_name, cd.email, cd.phone);
  const clientId = clientRes.lastInsertRowid;

  // 3. Insert Booking
  const bookingToken = generateToken();
  const pelunasanToken = generateToken();
  const bookingRes = db.prepare(`
    INSERT INTO bookings (client_id, booking_token, event_name, event_date, venue, package_id, status, package_price, pelunasan_token, lead_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(clientId, bookingToken, `Wedding ${cd.name} & ${cd.partner_name}`, cd.wedding_date, cd.venue, cd.package_id, cd.booking_status, price, pelunasanToken, leadId);
  const bookingId = bookingRes.lastInsertRowid;

  // 4. Insert DP Payment
  db.prepare(`
    INSERT INTO payments (booking_id, type, amount, payment_date, payment_method, status)
    VALUES (?, 'dp', ?, ?, 'Transfer Bank', 'verified')
  `).run(bookingId, cd.dp_amount, cd.dp_date);

  // 5. Insert Pelunasan Payment (if paid)
  if (cd.pelunasan_amount) {
    db.prepare(`
      INSERT INTO payments (booking_id, type, amount, payment_date, payment_method, status)
      VALUES (?, 'pelunasan', ?, ?, 'Transfer Bank', 'verified')
    `).run(bookingId, cd.pelunasan_amount, cd.pelunasan_date);
  }

  // 6. Create booking sessions & assign crew
  // Get sessions bound to this package
  const pkgSessions = db.prepare('SELECT session_id FROM package_sessions WHERE package_id = ?').all(cd.package_id);
  const actualSessions = pkgSessions.length > 0 ? pkgSessions : [{ session_id: 1 }]; // fallback to session 1 if none

  actualSessions.forEach(ps => {
    const sessionRes = db.prepare(`
      INSERT INTO booking_sessions (booking_id, session_id, event_date, event_time, location, is_done)
      VALUES (?, ?, ?, '08:00 - Selesai', ?, ?)
    `).run(bookingId, ps.session_id, cd.wedding_date, cd.venue, cd.booking_status === 'completed' ? 1 : 0);
    const bookingSessionId = sessionRes.lastInsertRowid;

    // Assign 2 crew members randomly from master list
    const numCrew = pkg.estimated_crew || 2;
    // shuffle freelancers
    const shuffledCrew = [...freelancers].sort(() => 0.5 - Math.random());
    const assignedCrew = shuffledCrew.slice(0, numCrew);

    assignedCrew.forEach(crew => {
      // Get session-specific fee if registered, else use default or 250k
      const sessionFeeRow = db.prepare('SELECT fee_amount FROM freelancer_fees WHERE freelancer_id = ? AND session_id = ?').get(crew.id, ps.session_id);
      const fee = sessionFeeRow ? sessionFeeRow.fee_amount : (crew.avg_fee || 250000);

      const payToken = cd.crew_paid ? generateToken() : null;
      const paidDate = cd.crew_paid ? cd.wedding_date : null;

      db.prepare(`
        INSERT INTO booking_session_crew (booking_session_id, freelancer_id, fee_amount, is_paid, paid_at, payment_token)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(bookingSessionId, crew.id, fee, cd.crew_paid ? 1 : 0, paidDate, payToken);

      // If crew paid, insert record into freelance_payments to support the receipt view
      if (cd.crew_paid) {
        db.prepare(`
          INSERT INTO freelance_payments (freelancer_id, amount, payment_date, method, notes, payment_token)
          VALUES (?, ?, ?, 'Transfer Bank', ?, ?)
        `).run(crew.id, fee, cd.wedding_date, `Fee for Session ${ps.session_id} on Booking #${bookingId}`, payToken);
      }
    });
  });
});

// Seed 2 Prospect Leads (Not bookings yet)
console.log('Seeding 2 prospect leads...');
db.prepare(`
  INSERT INTO leads (name, email, phone, partner_name, wedding_date, venue, package_interest, source, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run('Rahmat Hidayat', 'rahmat@gmail.com', '089123456788', 'Lia Lestari', '2026-10-10', 'Aula Masjid Agung', 'Gold', 'Instagram', 'contacted');

db.prepare(`
  INSERT INTO leads (name, email, phone, partner_name, wedding_date, venue, package_interest, source, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run('Sofia Loren', 'sofia@gmail.com', '089987654321', 'Rian Pratama', '2026-11-12', 'Hotel Horison', 'Platinum', 'TikTok', 'interested');

// Seed some Dividends penarikan
console.log('Seeding dividends...');
db.prepare(`
  INSERT INTO dividends (amount, date, description, method)
  VALUES (1000000, '2026-02-15', 'Tarik dividen bulanan Feb', 'Transfer Bank')
`).run();

db.prepare(`
  INSERT INTO dividends (amount, date, description, method)
  VALUES (2000000, '2026-04-12', 'Tarik dividen owner April', 'Transfer Bank')
`).run();

db.prepare('PRAGMA foreign_keys = ON').run();
console.log('Reseed successfully completed! 10 clients/leads created.');
