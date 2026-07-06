-- Sorehari Wedding Management Database Schema
-- SQLite

-- 1. Settings Table
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 2. Packages Table
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 3. Leads Table
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  partner_name TEXT,
  wedding_date TEXT,
  venue TEXT,
  package_interest TEXT,
  message TEXT,
  source TEXT DEFAULT 'inquiry_form',
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 4. Clients Table
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  name TEXT NOT NULL,
  partner_name TEXT,
  email TEXT,
  phone TEXT NOT NULL,
  address TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

-- 5. Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  booking_token TEXT UNIQUE,
  event_name TEXT,
  event_date TEXT NOT NULL,
  event_end_date TEXT,
  venue TEXT,
  package_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending_verification',
  package_price INTEGER DEFAULT 0,
  additional_income INTEGER DEFAULT 0,
  additional_income_note TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  pelunasan_token TEXT,
  lead_id INTEGER,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (package_id) REFERENCES packages(id)
);

-- 6. Freelancers Table
CREATE TABLE IF NOT EXISTS freelancers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  skill TEXT,
  phone TEXT,
  rate_default INTEGER DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  avg_fee INTEGER DEFAULT 0,
  bank_account TEXT
);

-- 7. Booking Expenses Table
CREATE TABLE IF NOT EXISTS booking_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'freelance',
  description TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  freelancer_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (freelancer_id) REFERENCES freelancers(id)
);

-- 8. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'dp',
  amount INTEGER NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method TEXT,
  reference TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- 9. Sessions (Master Sesi) Table
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  default_order INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 10. Freelancer Fees Table
CREATE TABLE IF NOT EXISTS freelancer_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  freelancer_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  fee_amount INTEGER NOT NULL DEFAULT 0,
  UNIQUE(freelancer_id, session_id),
  FOREIGN KEY (freelancer_id) REFERENCES freelancers(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 11. Package Sessions Table
CREATE TABLE IF NOT EXISTS package_sessions (
  package_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  PRIMARY KEY (package_id, session_id),
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 12. Booking Sessions (Timeline) Table
CREATE TABLE IF NOT EXISTS booking_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  event_date TEXT,
  event_time TEXT,
  location TEXT,
  gps_link TEXT,
  notes TEXT,
  is_done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 13. Products Table
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('fisik', 'digital')),
  unit_cost INTEGER NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 14. Package Products Table
CREATE TABLE IF NOT EXISTS package_products (
  package_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (package_id, product_id),
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 15. Booking Session Crew Table
CREATE TABLE IF NOT EXISTS booking_session_crew (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_session_id INTEGER NOT NULL,
  freelancer_id INTEGER NOT NULL,
  fee_amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  is_paid INTEGER DEFAULT 0,
  paid_at TEXT,
  UNIQUE(booking_session_id, freelancer_id),
  FOREIGN KEY (booking_session_id) REFERENCES booking_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (freelancer_id) REFERENCES freelancers(id) ON DELETE CASCADE
);

-- 16. Freelancer Payments Table
CREATE TABLE IF NOT EXISTS freelance_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  freelancer_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  payment_date TEXT DEFAULT (datetime('now','localtime')),
  method TEXT DEFAULT 'transfer',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (freelancer_id) REFERENCES freelancers(id) ON DELETE CASCADE
);

-- 17. Finance Views
CREATE VIEW IF NOT EXISTS v_booking_finance AS
SELECT
  b.id AS booking_id,
  b.client_id,
  COALESCE(c.name, b.event_name) AS client_name,
  c.partner_name,
  b.event_date,
  b.event_name,
  b.venue,
  b.status,
  p.name AS package_name,
  COALESCE(b.package_price, 0) AS package_price,
  COALESCE(b.additional_income, 0) AS additional_income,
  COALESCE(b.package_price, 0) + COALESCE(b.additional_income, 0) AS total_income,
  COALESCE(exp.total_expense, 0) AS total_expense,
  (COALESCE(b.package_price, 0) + COALESCE(b.additional_income, 0)) - COALESCE(exp.total_expense, 0) AS profit,
  COALESCE(pay.total_paid, 0) AS total_paid,
  (COALESCE(b.package_price, 0) + COALESCE(b.additional_income, 0)) - COALESCE(pay.total_paid, 0) AS remaining_payment
FROM bookings b
LEFT JOIN clients c ON b.client_id = c.id
LEFT JOIN packages p ON b.package_id = p.id
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total_expense FROM booking_expenses GROUP BY booking_id
) exp ON b.id = exp.booking_id
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS total_paid FROM payments GROUP BY booking_id
) pay ON b.id = pay.booking_id;

CREATE VIEW IF NOT EXISTS v_monthly_summary AS
SELECT
  strftime('%Y-%m', event_date) AS month,
  COUNT(*) AS total_bookings,
  SUM(total_income) AS total_income,
  SUM(total_expense) AS total_expense,
  SUM(profit) AS total_profit,
  SUM(total_paid) AS total_collected,
  SUM(remaining_payment) AS total_pending
FROM v_booking_finance
GROUP BY strftime('%Y-%m', event_date);
