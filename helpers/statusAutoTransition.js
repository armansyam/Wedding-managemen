const db = require('../db');

/**
 * Automates the transition of booking statuses based on current date, event date, and payments.
 * 
 * Rules:
 * 1. 'confirmed' automatically moves to 'in_progress' (Persiapan).
 * 2. 'in_progress' automatically moves to 'event_day' (Hari H) on the event day.
 * 3. 'in_progress' or 'event_day' automatically moves to 'editing' (Pengeditan) once the event day is passed AND full payment (pelunasan verified) is made.
 * 
 * @param {number} bookingId 
 */
function autoTransitionBooking(bookingId) {
  const booking = db.prepare('SELECT id, status, event_date, package_price FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) return;

  const currentStatus = booking.status;
  const eventDateStr = booking.event_date;
  if (!eventDateStr) return;

  // Today in local YYYY-MM-DD
  const todayStr = new Date().toLocaleDateString('sv-SE'); 

  // Check if there is a verified pelunasan payment
  const isLunas = db.prepare(`
    SELECT COUNT(*) AS count 
    FROM payments 
    WHERE booking_id = ? AND type = 'pelunasan' AND status = 'verified'
  `).get(bookingId).count > 0;

  let newStatus = currentStatus;

  // confirmed -> in_progress
  if (currentStatus === 'confirmed') {
    newStatus = 'in_progress';
  }

  // in_progress -> event_day on event date
  if (newStatus === 'in_progress' && todayStr === eventDateStr) {
    newStatus = 'event_day';
  }

  // post-event_day automatic transition to editing (requires pelunasan)
  if ((newStatus === 'in_progress' || newStatus === 'event_day') && todayStr > eventDateStr) {
    if (isLunas) {
      newStatus = 'editing';
    } else {
      newStatus = 'event_day'; // wait on event_day until pelunasan is verified
    }
  }

  // completed -> archived if event_date is older than 30 days
  if (newStatus === 'completed' && eventDateStr) {
    const eventTime = new Date(eventDateStr + 'T00:00:00').getTime();
    const todayTime = new Date(todayStr + 'T00:00:00').getTime();
    const diffDays = (todayTime - eventTime) / (1000 * 60 * 60 * 24);
    if (diffDays >= 30) {
      newStatus = 'archived';
    }
  }

  if (newStatus !== currentStatus) {
    db.prepare("UPDATE bookings SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(newStatus, bookingId);
  }
}

module.exports = { autoTransitionBooking };
