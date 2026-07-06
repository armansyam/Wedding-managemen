// helpers/sse.js — Simple in-memory SSE broadcast bus
// All admin SSE clients are stored here so routes can push events to them.

const clients = new Set();

/**
 * Register a new SSE response as a client.
 * Sends initial connection handshake and removes client on disconnect.
 * @param {import('express').Response} res
 */
function addClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

/**
 * Broadcast an event to all connected SSE admin clients.
 * @param {string} event - Event name (e.g. 'new_lead', 'lead_updated')
 * @param {object} data  - JSON-serializable payload
 */
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (_) {
      clients.delete(res);
    }
  }
}

module.exports = { addClient, broadcast };
