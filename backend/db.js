import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'sorehari.db');
const db = new sqlite3.Database(
  dbPath,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
);
db.run('PRAGMA foreign_keys = ON');

export function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const logErr = (desc) => (err) => {
        if (err) {
          console.error(`[DB INIT ERROR] ${desc}:`, err);
        } else {
          console.log(`[DB INIT SUCCESS] ${desc}`);
        }
      };

      // Create clients table
      db.run(`
        CREATE TABLE IF NOT EXISTS clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          description TEXT,
          location TEXT,
          event_date TEXT,
          thumbnail_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          booking_id INTEGER
        )
      `, logErr('clients table'));

      // Add new columns to existing table safely
      db.run("ALTER TABLE clients ADD COLUMN location TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('[DB INIT ERROR] ALTER location:', err);
        }
      });
      db.run("ALTER TABLE clients ADD COLUMN event_date TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('[DB INIT ERROR] ALTER event_date:', err);
        }
      });
      db.run("ALTER TABLE clients ADD COLUMN booking_id INTEGER", (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('[DB INIT ERROR] ALTER booking_id:', err);
        }
      });

      // Create photos table
      db.run(`
        CREATE TABLE IF NOT EXISTS photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER NOT NULL,
          filename TEXT NOT NULL,
          url TEXT NOT NULL,
          order_index INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
      `, logErr('photos table'));

      // Create global_settings table
      db.run(`
        CREATE TABLE IF NOT EXISTS global_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          max_slots_per_day INTEGER NOT NULL DEFAULT 2
        )
      `, logErr('global_settings table'));

      // Seed global settings
      db.run(`INSERT OR IGNORE INTO global_settings (id, max_slots_per_day) VALUES (1, 2)`, logErr('seed global_settings'));

      // Create packages table
      db.run(`
        CREATE TABLE IF NOT EXISTS packages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          package_name TEXT UNIQUE NOT NULL,
          description TEXT,
          price REAL NOT NULL,
          required_fg INTEGER NOT NULL,
          required_vg INTEGER NOT NULL
        )
      `, logErr('packages table'));
      
      db.run("ALTER TABLE packages ADD COLUMN description TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER packages description:', err);
      });
      db.run("ALTER TABLE packages ADD COLUMN is_negotiable INTEGER DEFAULT 0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER packages is_negotiable:', err);
      });
      db.run("ALTER TABLE packages ADD COLUMN operational_cost REAL DEFAULT 0.0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER packages operational_cost:', err);
      });
      db.run("ALTER TABLE packages ADD COLUMN is_active INTEGER DEFAULT 1", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER packages is_active:', err);
      });

      // Seed packages if empty
      db.get("SELECT COUNT(*) as count FROM packages", (err, row) => {
        if (err) {
          console.error('[DB INIT ERROR] count packages:', err);
        } else if (row && row.count === 0) {
          db.run(`INSERT INTO packages (package_name, price, required_fg, required_vg) VALUES 
            ('Platinum Package', 10000000.0, 2, 2),
            ('Gold Package', 6000000.0, 1, 1),
            ('Silver Package', 4000000.0, 1, 0)
          `, logErr('seed packages'));
        }
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS freelancers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('FG', 'VG')),
          status TEXT NOT NULL DEFAULT 'Aktif' CHECK(status IN ('Aktif', 'Tidak Aktif')),
          whatsapp_number TEXT NOT NULL,
          fee_per_project REAL DEFAULT 0.0,
          bank_account TEXT
        )
      `, logErr('freelancers table'));

      // Migrate existing freelancers table (add fee_per_project if missing)
      db.run("ALTER TABLE freelancers ADD COLUMN fee_per_project REAL DEFAULT 0.0", (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('[DB INIT ERROR] ALTER freelancers fee_per_project:', err);
        }
      });
      
      // Migrate existing freelancers table (add bank_account if missing)
      db.run("ALTER TABLE freelancers ADD COLUMN bank_account TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('[DB INIT ERROR] ALTER freelancers bank_account:', err);
        }
      });

      // Seed freelancers if empty
      db.get("SELECT COUNT(*) as count FROM freelancers", (err, row) => {
        if (err) {
          console.error('[DB INIT ERROR] count freelancers:', err);
        } else if (row && row.count === 0) {
          db.run(`INSERT INTO freelancers (name, role, status, whatsapp_number) VALUES 
            ('Zulham FG', 'FG', 'Aktif', '6285399098599'),
            ('Ammang FG', 'FG', 'Aktif', '6282333333420'),
            ('Budi VG', 'VG', 'Aktif', '6281234567891'),
            ('Soni VG', 'VG', 'Aktif', '6281234567892'),
            ('Cita FG', 'FG', 'Aktif', '6281234567893'),
            ('Dian VG', 'VG', 'Aktif', '6281234567894'),
            ('Eko FG', 'FG', 'Tidak Aktif', '6281234567895'),
            ('Fani VG', 'VG', 'Aktif', '6281234567896')
          `, logErr('seed freelancers'));
        }
      });

      // Create bookings table
db.run(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    location TEXT,
    event_date TEXT NOT NULL,
    package_id INTEGER NOT NULL,
    total_deal_price REAL NOT NULL,
    dp_paid_amount REAL NOT NULL DEFAULT 0.0,
    final_paid_amount REAL NOT NULL DEFAULT 0.0,
    post_prod_expense REAL NOT NULL DEFAULT 0.0,
    expense_album REAL NOT NULL DEFAULT 0.0,
    expense_frame REAL NOT NULL DEFAULT 0.0,
    expense_logistics REAL NOT NULL DEFAULT 0.0,
    expense_staff_fee REAL NOT NULL DEFAULT 0.0,
    payment_status TEXT NOT NULL DEFAULT 'Menunggu DP' CHECK(payment_status IN ('Menunggu DP', 'DP Masuk', 'Menunggu Pelunasan', 'Lunas', 'DP Hangus')),
    project_status TEXT NOT NULL DEFAULT 'Pending' CHECK(project_status IN ('Pending', 'On Progress', 'Post-Prod: Editing', 'Post-Prod: Review', 'Post-Prod: Cetak Album', 'Ditutup', 'Pemberhentian Sepihak', 'Selesai')),
    payment_receipt_path TEXT,
    rating INTEGER,
    testimonial_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES packages(id)
  )
`, logErr('bookings table'));

      // Add expense detail and phone columns safely to existing DB
      db.run("ALTER TABLE bookings ADD COLUMN client_phone TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER client_phone:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN location TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER location:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN discount_amount REAL DEFAULT 0.0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER discount_amount:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN discount_confirmed INTEGER DEFAULT 0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER discount_confirmed:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN dp_claimed_amount REAL DEFAULT 0.0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER dp_claimed_amount:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN expense_album REAL DEFAULT 0.0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER expense_album:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN expense_frame REAL DEFAULT 0.0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER expense_frame:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN expense_logistics REAL DEFAULT 0.0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER expense_logistics:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN expense_staff_fee REAL DEFAULT 0.0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER expense_staff_fee:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN special_requests TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER special_requests:', err);
      });
      db.run("ALTER TABLE booking_freelancer ADD COLUMN assigned_sessions TEXT DEFAULT '[]'", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER booking_freelancer assigned_sessions:', err);
      });

      // Create booking_freelancer table
      db.run(`
        CREATE TABLE IF NOT EXISTS booking_freelancer (
          booking_id INTEGER NOT NULL,
          freelancer_id INTEGER NOT NULL,
          assigned_sessions TEXT DEFAULT '[]',
          PRIMARY KEY (booking_id, freelancer_id),
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
          FOREIGN KEY (freelancer_id) REFERENCES freelancers(id) ON DELETE CASCADE
        )
      `, logErr('booking_freelancer table'));

      // Create financial_settings table
      db.run(`
        CREATE TABLE IF NOT EXISTS financial_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          minimum_capital REAL NOT NULL DEFAULT 0.0,
          business_name TEXT DEFAULT 'Sorehari Photography',
          bank_account TEXT DEFAULT 'BCA - 3420-1111-99 a.n. Sorehari Photography',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, logErr('financial_settings table'));

      // Seed financial settings
      db.run(`INSERT OR IGNORE INTO financial_settings (id, minimum_capital) VALUES (1, 0.0)`, logErr('seed financial_settings'));

      // Create financial_periods table
      db.run(`
        CREATE TABLE IF NOT EXISTS financial_periods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period_type TEXT NOT NULL CHECK(period_type IN ('monthly', 'yearly')),
          period_value TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          total_revenue REAL DEFAULT 0.0,
          total_expenses REAL DEFAULT 0.0,
          net_profit REAL DEFAULT 0.0,
          is_closed INTEGER DEFAULT 0,
          closed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(period_type, period_value)
        )
      `, logErr('financial_periods table'));

      // Create financial_closings table
      db.run(`
        CREATE TABLE IF NOT EXISTS financial_closings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period_id INTEGER NOT NULL,
          closing_type TEXT NOT NULL CHECK(closing_type IN ('monthly', 'yearly')),
          total_revenue REAL DEFAULT 0.0,
          total_expenses REAL DEFAULT 0.0,
          net_profit REAL DEFAULT 0.0,
          capital_balance REAL DEFAULT 0.0,
          minimum_capital REAL DEFAULT 0.0,
          available_for_withdrawal REAL DEFAULT 0.0,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (period_id) REFERENCES financial_periods(id)
        )
      `, logErr('financial_closings table'));

      // Create fund_withdrawals table
      db.run(`
        CREATE TABLE IF NOT EXISTS fund_withdrawals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          booking_id INTEGER,
          withdrawal_type TEXT NOT NULL CHECK(withdrawal_type IN ('dividend', 'operational', 'capital_return', 'other')),
          amount REAL NOT NULL,
          description TEXT,
          recipient TEXT,
          withdrawal_date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (booking_id) REFERENCES bookings(id)
        )
      `, logErr('fund_withdrawals table'));

      // Create financial_reports table for cached reports
      db.run(`
        CREATE TABLE IF NOT EXISTS financial_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_type TEXT NOT NULL CHECK(report_type IN ('monthly', 'yearly', 'custom')),
          period_start TEXT NOT NULL,
          period_end TEXT NOT NULL,
          report_data TEXT NOT NULL,
          generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(report_type, period_start, period_end)
        )
      `, logErr('financial_reports table'));

      // Create ledger table (double-entry accounting for all cash flows)
      db.run(`
        CREATE TABLE IF NOT EXISTS ledger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_date TEXT NOT NULL DEFAULT (datetime('now')),
          account TEXT NOT NULL,
          debit REAL NOT NULL DEFAULT 0.0,
          credit REAL NOT NULL DEFAULT 0.0,
          description TEXT,
          ref_type TEXT DEFAULT 'manual',
          ref_id INTEGER,
          created_by TEXT DEFAULT 'system',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, logErr('ledger table'));

      // Create audit_log table (tracks all admin changes)
      db.run(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          row_id INTEGER,
          action TEXT NOT NULL CHECK(action IN ('INSERT', 'UPDATE', 'DELETE')),
          before_json TEXT,
          after_json TEXT,
          changed_by TEXT DEFAULT 'admin',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, logErr('audit_log table'));

      // Create service_categories table
      db.run(`
        CREATE TABLE IF NOT EXISTS service_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT
        )
      `, logErr('service_categories table'));

      // Create services table
      db.run(`
        CREATE TABLE IF NOT EXISTS services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT NOT NULL CHECK(category IN ('Output Fisik', 'Output Digital', 'Jasa')),
          base_price REAL NOT NULL,
          description TEXT,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, logErr('services table'));

      // Create packages_v11 table
      db.run(`
        CREATE TABLE IF NOT EXISTS packages_v11 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          is_custom INTEGER DEFAULT 0,
          is_negotiable INTEGER DEFAULT 0,
          total_price REAL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, logErr('packages_v11 table'));

      // Create package_items table
      db.run(`
        CREATE TABLE IF NOT EXISTS package_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          package_id INTEGER NOT NULL,
          service_id INTEGER NOT NULL,
          quantity INTEGER DEFAULT 1,
          override_price REAL,
          FOREIGN KEY (package_id) REFERENCES packages_v11(id) ON DELETE CASCADE,
          FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
        )
      `, logErr('package_items table'));

      // Create booking_services table
      db.run(`
        CREATE TABLE IF NOT EXISTS booking_services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          booking_id INTEGER NOT NULL,
          service_id INTEGER NOT NULL,
          quantity INTEGER DEFAULT 1,
          final_price REAL NOT NULL,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
          FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
        )
      `, logErr('booking_services table'));

      // Create additional_services table
      db.run(`
        CREATE TABLE IF NOT EXISTS additional_services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          price REAL NOT NULL,
          category TEXT CHECK(category IN ('WCC', 'Pre-Wedding', 'Drone', 'Album', 'Lainnya')),
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, logErr('additional_services table'));

      // Create booking_additional_services table
      db.run(`
        CREATE TABLE IF NOT EXISTS booking_additional_services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          booking_id INTEGER NOT NULL,
          additional_service_id INTEGER NOT NULL,
          quantity INTEGER DEFAULT 1,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
          FOREIGN KEY (additional_service_id) REFERENCES additional_services(id)
        )
      `, logErr('booking_additional_services table'));

      // Alter columns safely on bookings table
      db.run("ALTER TABLE bookings ADD COLUMN modal_cost REAL DEFAULT 0.0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER bookings modal_cost:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN dp_receipt_path TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER bookings dp_receipt_path:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN final_receipt_path TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER bookings final_receipt_path:', err);
      });
      db.run("ALTER TABLE bookings ADD COLUMN package_id_v11 INTEGER", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER bookings package_id_v11:', err);
      });

      // Migrate existing categories in services table if any old schema is present
      db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'services'", (err, row) => {
        if (err) {
          console.error('[DB INIT ERROR] sqlite_master check:', err);
          return;
        }
        if (row && (!row.sql.includes("'Jasa'") || row.sql.includes('Produk Foto'))) {
          console.log('[DB MIGRATE] Migrating services table category constraint...');
          db.serialize(() => {
            db.run("PRAGMA foreign_keys = OFF");
            db.run("BEGIN TRANSACTION");
            
            // Create new services table with new check constraint
            db.run(`
              CREATE TABLE IF NOT EXISTS services_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL CHECK(category IN ('Output Fisik', 'Output Digital', 'Jasa')),
                base_price REAL NOT NULL,
                description TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `);
            
            // Copy data, mapping old categories to new ones
            db.run(`
              INSERT INTO services_new (id, name, category, base_price, description, is_active, created_at)
              SELECT id, name,
                     CASE WHEN category IN ('Digital', 'Output Digital') THEN 'Output Digital'
                          WHEN category IN ('Output Fisik', 'Produk Foto') THEN 'Output Fisik'
                          WHEN category = 'Jasa' THEN 'Jasa'
                          ELSE 'Output Fisik' END,
                     base_price, description, is_active, created_at
              FROM services
            `);
            
            // Drop old table
            db.run("DROP TABLE services");
            
            // Rename new table to original
            db.run("ALTER TABLE services_new RENAME TO services");
            
            db.run("COMMIT", (err) => {
              if (err) {
                console.error('[DB MIGRATE ERROR] Commit failed:', err);
              } else {
                console.log('[DB MIGRATE SUCCESS] services table successfully migrated to new category constraints!');
              }
              db.run("PRAGMA foreign_keys = ON");
            });
          });
        }
      });

      // Seed service_categories and services if empty
      db.get("SELECT COUNT(*) as count FROM service_categories", (err, row) => {
        if (err) {
          console.error('[DB INIT ERROR] count service_categories:', err);
        } else if (row && row.count === 0) {
          db.run(`INSERT INTO service_categories (name, description) VALUES
            ('Output Fisik', 'Output berbentuk fisik/cetak'),
            ('Output Digital', 'Output berbentuk digital/file')
          `, logErr('seed service_categories'));
        }
      });

      db.get("SELECT COUNT(*) as count FROM services", (err, row) => {
        if (err) {
          console.error('[DB INIT ERROR] count services:', err);
        } else if (row && row.count === 0) {
          db.run(`INSERT INTO services (name, category, base_price, description) VALUES
            ('Album Premium 20x20', 'Output Fisik', 350000, 'Album hardcover 20x20 isi 20 lembar'),
            ('Album Basic 20x20', 'Output Fisik', 250000, 'Album softcover 20x20 isi 15 lembar'),
            ('Bingkai Besar', 'Output Fisik', 150000, 'Bingkai ukuran 50x70cm'),
            ('Bingkai Kecil', 'Output Fisik', 75000, 'Bingkai ukuran 20x25cm'),
            ('Flashdisk 16GB', 'Output Digital', 50000, 'Flashdisk custom branding'),
            ('Editing Photo', 'Output Digital', 100000, 'Editing advance per foto'),
            ('Video Highlight', 'Output Digital', 500000, 'Video highlight 3-5 menit')
          `, logErr('seed services'));
        }
      });

      // --- PHASE 1: PRD v1.1.9 Tables ---
      db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            default_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, logErr('sessions table'));

      db.run(`
        INSERT OR IGNORE INTO sessions (name, description, default_order) VALUES
            ('Mappettuada', 'Acara lamaran/pinangan adat Makassar', 1),
            ('Mappacci', 'Acara malam pensucian diri menjelang akad', 2),
            ('Akad Nikah', 'Upacara ijab kabul pernikahan', 3),
            ('Resepsi', 'Pesta pernikahan / resepsi', 4),
            ('Prewedding', 'Sesi foto pra-nikah outdoor/indoor', 5),
            ('Siraman', 'Upacara siraman adat', 6),
            ('Lainnya', 'Sesi lain yang tidak termasuk di atas', 7)
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS freelancer_fees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            freelancer_id INTEGER NOT NULL,
            session_id INTEGER NOT NULL,
            fee_amount REAL NOT NULL DEFAULT 0.0,
            UNIQUE(freelancer_id, session_id),
            FOREIGN KEY (freelancer_id) REFERENCES freelancers(id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `, logErr('freelancer_fees table'));

      db.run(`
        CREATE TABLE IF NOT EXISTS package_sessions (
            package_id INTEGER NOT NULL,
            session_id INTEGER NOT NULL,
            PRIMARY KEY (package_id, session_id),
            FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `, logErr('package_sessions table'));

      db.run(`
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
        )
      `, logErr('booking_sessions table'));

      db.run(`
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
        )
      `, logErr('wa_reminders table'));

      // ── Studio Profile ───────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS studio_profile (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          studio_name TEXT NOT NULL DEFAULT 'Sorehari Studio',
          tagline TEXT DEFAULT 'Abadikan Momen Terbaik Anda',
          whatsapp_number TEXT DEFAULT '6281234567890',
          email TEXT DEFAULT '',
          address TEXT DEFAULT '',
          instagram TEXT DEFAULT '',
          website TEXT DEFAULT '',
          logo_url TEXT DEFAULT '',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, logErr('studio_profile table'));

      db.run(`INSERT OR IGNORE INTO studio_profile (id) VALUES (1)`, logErr('seed studio_profile'));
      // ── WA Message Templates (columns on global_settings) ───────────
      db.run(`ALTER TABLE global_settings ADD COLUMN wa_template_booking TEXT DEFAULT ''`, (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER wa_template_booking:', err);
      });
      db.run(`ALTER TABLE global_settings ADD COLUMN wa_template_h3_client TEXT DEFAULT ''`, (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER wa_template_h3_client:', err);
      });
      db.run(`ALTER TABLE global_settings ADD COLUMN wa_template_h1_crew TEXT DEFAULT ''`, (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER wa_template_h1_crew:', err);
      });
      db.run(`ALTER TABLE global_settings ADD COLUMN wa_template_crew_assignment TEXT DEFAULT ''`, (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('[DB INIT ERROR] ALTER wa_template_crew_assignment:', err);
      });

      // Seed default WA templates
      db.run(`
        UPDATE global_settings SET
          wa_template_booking = CASE WHEN (wa_template_booking IS NULL OR wa_template_booking = '') THEN
            'Halo {{nama_klien}}! 👋%0a%0aSelamat, booking Anda telah DIKONFIRMASI oleh *Sorehari Studio*!%0a%0a📅 Tanggal Acara: *{{tanggal_acara}}*%0a📦 Paket: *{{nama_paket}}*%0a📍 Lokasi: *{{lokasi}}*%0a%0aSampai jumpa di hari H! 🎉'
          ELSE wa_template_booking END,
          wa_template_h3_client = CASE WHEN (wa_template_h3_client IS NULL OR wa_template_h3_client = '') THEN
            'Halo {{nama_klien}}! 😊%0a%0aIni adalah pengingat dari *Sorehari Studio*. Acara Anda tinggal *3 hari lagi*! 🗓%0a%0a📅 Tanggal: *{{tanggal_acara}}*%0a📍 Lokasi: *{{lokasi}}*%0a%0aJika ada perubahan atau pertanyaan, segera hubungi kami. Sampai jumpa! 🙏'
          ELSE wa_template_h3_client END,
          wa_template_h1_crew = CASE WHEN (wa_template_h1_crew IS NULL OR wa_template_h1_crew = '') THEN
            'Halo {{nama_kru}}! 📸%0a%0aPengingat dari *Sorehari Studio*: Anda bertugas *besok*!%0a%0a👤 Klien: *{{nama_klien}}*%0a📅 Tanggal: *{{tanggal_acara}}*%0a🕐 Sesi: *{{nama_sesi}}*%0a📍 Lokasi: *{{lokasi}}*%0a%0aMohon hadir tepat waktu. Semangat! 💪'
          ELSE wa_template_h1_crew END,
          wa_template_crew_assignment = CASE WHEN (wa_template_crew_assignment IS NULL OR wa_template_crew_assignment = '') THEN
            'Halo {{nama_kru}}! 📸%0a%0aAnda telah ditugaskan oleh *Sorehari Studio* untuk mendokumentasikan acara berikut:%0a%0a👤 Klien: *{{nama_klien}}*%0a📅 Tanggal: *{{tanggal_acara}}*%0a🕐 Sesi: *{{nama_sesi}}*%0a📍 Lokasi: *{{lokasi}}*%0a🏷 Peran: *{{peran_kru}}*%0a%0aPastikan jadwal Anda terkunci dan mohon persiapkan peralatan Anda dengan baik. Terima kasih! 🙏'
          ELSE wa_template_crew_assignment END
        WHERE id = 1
      `, logErr('seed wa_templates'));
      // ── Blocked Dates ────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS blocked_dates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          blocked_date TEXT NOT NULL UNIQUE,
          reason TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, logErr('blocked_dates table'));

      // Resolve after all tables are created
      setTimeout(() => {
        resolve();
      }, 1000);


    });
  });
}

export function getDatabase() {
  return db;
}

export function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}
