-- ============================================================
-- V1.3 Clean System Migration
-- Purpose: Remove 12 unused/obsolete tables and simplify the system
-- Date: 2026-06-25
-- ============================================================
-- SUMMARY:
--   Dropped: 12 tables + 15 indexes
--   Renamed: pricing_tiers → sessions (simplified)
--   Modified: packages (added session_ids), bookings (removed fg_vg columns)
--   Removed: 3 unused columns (payment_method, dp_date, photo_url)
--   Moved: receipt files to public/bookings/receipts/
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────
-- PHASE 1: Data Preservation & Migration
-- ─────────────────────────────────────────────

-- 1a. Create temporary backup tables for data we want to keep

-- Backup pricing_tiers → will become sessions
CREATE TABLE IF NOT EXISTS _bak_pricing_tiers AS
SELECT * FROM pricing_tiers;

-- Backup packages (before schema change)
CREATE TABLE IF NOT EXISTS _bak_packages AS
SELECT * FROM packages;

-- Backup bookings (before schema change)
CREATE TABLE IF NOT EXISTS _bak_bookings AS
SELECT * FROM bookings;

-- Backup photographer_assignments (data will be stored as JSON in packages)
CREATE TABLE IF NOT EXISTS _bak_photographer_assignments AS
SELECT * FROM photographer_assignments;

-- Backup event_sessions (data will be migrated to packages.session_ids)
CREATE TABLE IF NOT EXISTS _bak_event_sessions AS
SELECT * FROM event_sessions;

-- Backup session_packages (data will be migrated to packages.session_ids)
CREATE TABLE IF NOT EXISTS _bak_session_packages AS
SELECT * FROM session_packages;

-- 1b. Move receipt files from public/receipts/ to public/bookings/receipts/
-- (This is handled by the application/server after migration)

-- ─────────────────────────────────────────────
-- PHASE 2: Drop Obsolete Indexes
-- ─────────────────────────────────────────────

-- Drop all indexes that reference tables/columns being removed
DROP INDEX IF EXISTS idx_event_sessions_event_id;
DROP INDEX IF EXISTS idx_session_packages_tier_id;
DROP INDEX IF EXISTS idx_session_packages_session_id;
DROP INDEX IF EXISTS idx_event_sessions_package_id;
DROP INDEX IF EXISTS idx_session_packages_pricing_tier_id;
DROP INDEX IF EXISTS idx_event_sessions_session_id;
DROP INDEX IF EXISTS idx_daily_schedules_override_id;
DROP INDEX IF EXISTS idx_capacity_overrides_date;
DROP INDEX IF EXISTS idx_event_sessions_pricing_tier_id;
DROP INDEX IF EXISTS idx_event_sessions_date;
DROP INDEX IF EXISTS idx_capacity_overrides_active;
DROP INDEX IF EXISTS idx_event_sessions_active;
DROP INDEX IF EXISTS idx_event_sessions_is_active;
DROP INDEX IF EXISTS idx_pricing_tiers_history_tier_id;
DROP INDEX IF EXISTS idx_pricing_tiers_history_created_at;
DROP INDEX IF EXISTS idx_pricing_tiers_history_date_effective;

-- ─────────────────────────────────────────────
-- PHASE 3: Drop Obsolete Tables
-- ─────────────────────────────────────────────
-- Order matters due to potential foreign key dependencies

-- 3a. Drop junction/child tables first
DROP TABLE IF EXISTS session_packages CASCADE;
DROP TABLE IF EXISTS event_sessions CASCADE;
DROP TABLE IF EXISTS photographer_assignments CASCADE;
DROP TABLE IF EXISTS fg_vg_selections CASCADE;

-- 3b. Drop day template system tables
DROP TABLE IF EXISTS daily_schedules CASCADE;
DROP TABLE IF EXISTS capacity_overrides CASCADE;
DROP TABLE IF EXISTS date_overrides CASCADE;
DROP TABLE IF EXISTS day_templates CASCADE;

-- 3c. Drop session template system tables
DROP TABLE IF EXISTS session_templates CASCADE;

-- 3d. Drop old pricing tier system (will be recreated as sessions)
DROP TABLE IF EXISTS pricing_tiers_audit CASCADE;
DROP TABLE IF EXISTS pricing_tiers_history CASCADE;
DROP TABLE IF EXISTS pricing_tiers CASCADE;

-- ─────────────────────────────────────────────
-- PHASE 4: Create New Simplified Tables
-- ─────────────────────────────────────────────

-- 4a. Create sessions table (simplified from pricing_tiers)
-- Session = unique time slot (e.g., "Pagi", "Sore", "Malam")
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL UNIQUE,
    start_time TEXT,
    end_time TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4b. Migrate data from pricing_tiers → sessions
-- Extract unique session names, keeping time ranges from the old system
INSERT INTO sessions (session_name, start_time, end_time)
SELECT DISTINCT
    session_name,
    MIN(start_time) as start_time,
    MAX(end_time) as end_time
FROM _bak_pricing_tiers
WHERE is_active = 1
GROUP BY session_name
ON CONFLICT(session_name) DO NOTHING;

-- 4c. Recreate packages table with new schema
DROP TABLE IF EXISTS packages;
CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    description TEXT,
    is_negotiable INTEGER DEFAULT 0,
    required_fg INTEGER DEFAULT 1,
    required_vg INTEGER DEFAULT 1,
    operational_cost REAL DEFAULT 0,
    session_ids TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4d. Migrate data from old packages to new packages
-- Build session_ids JSON from event_sessions and session_packages
INSERT INTO packages (id, package_name, price, description, is_negotiable, required_fg, required_vg, operational_cost, session_ids, is_active, created_at)
SELECT
    p.id,
    p.package_name,
    p.price,
    p.description,
    COALESCE(p.is_negotiable, 0) as is_negotiable,
    COALESCE(p.required_fg, 1) as required_fg,
    COALESCE(p.required_vg, 1) as required_vg,
    COALESCE(p.operational_cost, 0) as operational_cost,
    COALESCE(
        (SELECT GROUP_CONCAT(DISTINCT sp.session_id)
         FROM _bak_session_packages sp
         WHERE sp.package_id = p.id),
        '[]'
    ) as session_ids,
    COALESCE(p.is_active, 1) as is_active,
    p.created_at
FROM _bak_packages p;

-- Fix session_ids format: convert comma-separated to JSON array
UPDATE packages
SET session_ids = '[' || session_ids || ']'
WHERE session_ids != '[]' AND session_ids NOT LIKE '[%';

-- 4e. Recreate bookings table with simplified schema
DROP TABLE IF EXISTS bookings;
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    event_date TEXT NOT NULL,
    location TEXT,
    package_id INTEGER,
    total_deal_price REAL DEFAULT 0,
    dp_amount REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending_verification',
    notes TEXT,
    additional_services_json TEXT,
    special_requests TEXT,
    receipt_filename TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL
);

-- 4f. Migrate data from old bookings to new bookings
INSERT INTO bookings (
    id, client_name, client_phone, event_date, location,
    package_id, total_deal_price, dp_amount, discount_amount,
    status, notes, additional_services_json, special_requests,
    receipt_filename, created_at, updated_at
)
SELECT
    b.id,
    b.client_name,
    b.client_phone,
    b.event_date,
    b.location,
    b.package_id,
    COALESCE(b.total_deal_price, 0) as total_deal_price,
    COALESCE(b.dp_amount, 0) as dp_amount,
    COALESCE(b.discount_amount, 0) as discount_amount,
    b.status,
    -- Build notes from fg_vg_selections if available
    COALESCE(
        (SELECT GROUP_CONCAT(fg.fg_count || ' FG, ' || fg.vg_count || ' VG')
         FROM _bak_fg_vg_selections fg
         WHERE fg.booking_id = b.id),
        b.notes
    ) as notes,
    b.additional_services_json,
    b.special_requests,
    b.receipt_filename,
    b.created_at,
    b.updated_at
FROM _bak_bookings b;

-- ─────────────────────────────────────────────
-- PHASE 5: Create New Indexes
-- ─────────────────────────────────────────────

-- Bookings indexes
CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings(event_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);

-- Additional services indexes
CREATE INDEX IF NOT EXISTS idx_additional_services_active ON additional_services(is_active);

-- ─────────────────────────────────────────────
-- PHASE 6: Verify Migration
-- ─────────────────────────────────────────────

-- Verify sessions were created
-- SELECT 'Sessions created: ' || COUNT(*) FROM sessions;

-- Verify packages migrated
-- SELECT 'Packages migrated: ' || COUNT(*) FROM packages;

-- Verify bookings migrated
-- SELECT 'Bookings migrated: ' || COUNT(*) FROM bookings;

-- Verify no data loss in bookings
-- SELECT
--     (SELECT COUNT(*) FROM _bak_bookings) as old_count,
--     (SELECT COUNT(*) FROM bookings) as new_count;

-- ─────────────────────────────────────────────
-- PHASE 7: Cleanup Backup Tables
-- ─────────────────────────────────────────────
-- Uncomment after verifying migration success:
--
-- DROP TABLE IF EXISTS _bak_pricing_tiers;
-- DROP TABLE IF EXISTS _bak_packages;
-- DROP TABLE IF EXISTS _bak_bookings;
-- DROP TABLE IF EXISTS _bak_photographer_assignments;
-- DROP TABLE IF EXISTS _bak_event_sessions;
-- DROP TABLE IF EXISTS _bak_session_packages;

COMMIT;

-- ============================================================
-- POST-MIGRATION NOTES:
--
-- 1. Receipt files should be moved from:
--    public/receipts/ → public/bookings/receipts/
--    Use: mv public/receipts/* public/bookings/receipts/ 2>/dev/null; rmdir public/receipts 2>/dev/null
--
-- 2. Server.js needs updating:
--    - Remove all references to dropped tables
--    - Update booking queries to use new schema
--    - Update package queries to use session_ids
--    - Remove day_template, date_override, photographer_assignment routes
--
-- 3. admin.js needs updating:
--    - Remove session template UI
--    - Remove date override UI
--    - Remove photographer assignment UI
--    - Simplify package form (no more per-session pricing)
--
-- 4. Tables remaining after migration:
--    - users (unchanged)
--    - sessions (NEW - replaces pricing_tiers)
--    - packages (MODIFIED - added session_ids)
--    - bookings (MODIFIED - removed fg/vg columns)
--    - reviews (unchanged)
--    - additional_services (unchanged)
-- ============================================================