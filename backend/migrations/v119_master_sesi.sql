-- Phase 1.1: Tabel sessions (Master Sesi Acara)
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    default_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO sessions (name, description, default_order) VALUES
    ('Mappettuada', 'Acara lamaran/pinangan adat Makassar', 1),
    ('Mappacci', 'Acara malam pensucian diri menjelang akad', 2),
    ('Akad Nikah', 'Upacara ijab kabul pernikahan', 3),
    ('Resepsi', 'Pesta pernikahan / resepsi', 4),
    ('Prewedding', 'Sesi foto pra-nikah outdoor/indoor', 5),
    ('Siraman', 'Upacara siraman adat', 6),
    ('Lainnya', 'Sesi lain yang tidak termasuk di atas', 7);

-- Phase 1.2: Tabel freelancer_fees (Fee Freelancer Per Sesi)
CREATE TABLE IF NOT EXISTS freelancer_fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    freelancer_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    fee_amount REAL NOT NULL DEFAULT 0.0,
    UNIQUE(freelancer_id, session_id),
    FOREIGN KEY (freelancer_id) REFERENCES freelancers(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Phase 1.3: Tabel package_sessions (Junction: Paket ↔ Sesi)
CREATE TABLE IF NOT EXISTS package_sessions (
    package_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    PRIMARY KEY (package_id, session_id),
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Phase 1.4: Tabel booking_sessions (Timeline Acara Per Booking)
CREATE TABLE IF NOT EXISTS booking_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    event_date TEXT NOT NULL,
    event_time TEXT NOT NULL,
    location TEXT,
    gps_link TEXT,
    notes TEXT,
    crew_needed TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Phase 1.5: Tabel wa_reminders (Tracking Reminder WhatsApp)
CREATE TABLE IF NOT EXISTS wa_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    session_id INTEGER,
    freelancer_id INTEGER,
    reminder_type TEXT NOT NULL CHECK(reminder_type IN ('H-3_Client', 'H-1_Crew')),
    target_name TEXT,
    target_phone TEXT,
    message_text TEXT,
    is_sent INTEGER DEFAULT 0,
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (freelancer_id) REFERENCES freelancers(id) ON DELETE SET NULL
);
