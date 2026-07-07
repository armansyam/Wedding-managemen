const db = require('../db');

// Migration: add pelunasan_token if missing
try { db.prepare("ALTER TABLE bookings ADD COLUMN pelunasan_token TEXT").run(); console.log('+ pelunasan_token'); } catch { console.log('~ pelunasan_token exists'); }
try { db.prepare("ALTER TABLE freelancers ADD COLUMN avg_fee INTEGER DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE freelancers ADD COLUMN bank_account TEXT").run(); } catch {}

// Migration: add is_paid + paid_at per job
try { db.prepare("ALTER TABLE booking_session_crew ADD COLUMN is_paid INTEGER DEFAULT 0").run(); console.log('+ is_paid'); } catch { console.log('~ is_paid exists'); }
try { db.prepare("ALTER TABLE booking_session_crew ADD COLUMN paid_at TEXT").run(); console.log('+ paid_at'); } catch { console.log('~ paid_at exists'); }
try { db.prepare("ALTER TABLE freelance_payments ADD COLUMN payment_token TEXT").run(); console.log('+ payment_token (freelance_payments)'); } catch { console.log('~ payment_token exists'); }
try { db.prepare("ALTER TABLE packages ADD COLUMN estimated_crew INTEGER DEFAULT 2").run(); console.log('+ estimated_crew'); } catch { console.log('~ estimated_crew exists'); }

console.log('Migration done');
