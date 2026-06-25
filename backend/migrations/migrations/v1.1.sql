-- Sorehari v1.1 - SQL Migration Script

-- 1. service_categories
CREATE TABLE IF NOT EXISTS service_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

-- 2. services
CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('Sesi', 'Produk Foto', 'Barang Cetak', 'Digital', 'Jasa', 'Lainnya')),
    base_price REAL NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. packages_v11
CREATE TABLE IF NOT EXISTS packages_v11 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_custom INTEGER DEFAULT 0,
    is_negotiable INTEGER DEFAULT 0,
    total_price REAL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. package_items
CREATE TABLE IF NOT EXISTS package_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    override_price REAL,
    FOREIGN KEY (package_id) REFERENCES packages_v11(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- 5. booking_services
CREATE TABLE IF NOT EXISTS booking_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    final_price REAL NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- 6. ledger
CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_date TEXT NOT NULL,
    account TEXT NOT NULL CHECK(account IN (
        'cash', 'dp_receivable', 'revenue',
        'expense_album', 'expense_frame', 'expense_logistics', 'expense_staff',
        'withdrawal', 'equity'
    )),
    debit REAL DEFAULT 0.0,
    credit REAL DEFAULT 0.0,
    description TEXT,
    ref_type TEXT,
    ref_id INTEGER,
    created_by TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. audit_log
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id INTEGER NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('INSERT', 'UPDATE', 'DELETE')),
    before_json TEXT,
    after_json TEXT,
    changed_by TEXT DEFAULT 'admin',
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. capital_settings
CREATE TABLE IF NOT EXISTS capital_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    minimum_capital REAL NOT NULL DEFAULT 0.0,
    current_balance REAL NOT NULL DEFAULT 0.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. additional_services (Layanan Tambahan - Billable)
CREATE TABLE IF NOT EXISTS additional_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    price REAL NOT NULL,
    category TEXT CHECK(category IN ('WCC', 'Pre-Wedding', 'Drone', 'Album', 'Lainnya')),
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. booking_additional_services (Junction Table)
CREATE TABLE IF NOT EXISTS booking_additional_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    additional_service_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (additional_service_id) REFERENCES additional_services(id)
);

-- Alter Tables (Ignoring duplicate column errors)
ALTER TABLE bookings ADD COLUMN modal_cost REAL DEFAULT 0.0;
ALTER TABLE bookings ADD COLUMN dp_receipt_path TEXT;
ALTER TABLE bookings ADD COLUMN final_receipt_path TEXT;
ALTER TABLE bookings ADD COLUMN package_id_v11 INTEGER;
ALTER TABLE bookings ADD COLUMN special_requests TEXT;

ALTER TABLE freelancers ADD COLUMN fee_per_project REAL DEFAULT 0.0;

-- Seed Data (Optional but recommended in PRD)
INSERT OR IGNORE INTO service_categories (name, description) VALUES
('Produk Foto', 'Album, Cetak, Bingkai'),
('Barang Cetak', 'Mug, Kalender, Banner'),
('Digital', 'Flashdisk, Video Editing'),
('Lainnya', 'Aksesoris lain');

-- Insert some services only if they don't exist
INSERT OR IGNORE INTO services (name, category, base_price, description) VALUES
('Album Premium 20x20', 'Produk Foto', 350000, 'Album hardcover 20x20 isi 20 lembar'),
('Album Basic 20x20', 'Produk Foto', 250000, 'Album softcover 20x20 isi 15 lembar'),
('Bingkai Besar', 'Produk Foto', 150000, 'Bingkai ukuran 50x70cm'),
('Bingkai Kecil', 'Produk Foto', 75000, 'Bingkai ukuran 20x25cm'),
('Flashdisk 16GB', 'Digital', 50000, 'Flashdisk custom branding'),
('Editing Photo', 'Digital', 100000, 'Editing advance per foto'),
('Video Highlight', 'Digital', 500000, 'Video highlight 3-5 menit'),
('Mug Custom', 'Barang Cetak', 35000, 'Mug foto custom'),
('Kalender Dinding', 'Barang Cetak', 45000, 'Kalender 2026 hardcover');
