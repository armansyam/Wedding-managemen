const crypto = require('crypto');

// Unified authentication middleware (consolidated logic)
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.redirect('/login');
};

const passwordUtils = {
  validatePassword: (password) => {
    if (!password || password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters long' };
    }
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasUpper || !hasLower || !hasNumber) {
      return { valid: false, error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' };
    }
    return { valid: true };
  },

  hashPassword: async (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const iterations = parseInt(process.env.PBKDF2_ITERATIONS || '210000', 10);
    const keylen = 64;
    const digest = 'sha512';
    const derived = await new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, keylen, digest, (err, buf) => {
        if (err) return reject(err);
        resolve(buf.toString('hex'));
      });
    });
    return `pbkdf2$${iterations}$${salt}$${derived}`;
  },

  comparePassword: async (password, storedHash) => {
    if (typeof storedHash !== 'string') return false;
    if (storedHash.startsWith('pbkdf2$')) {
      const [, iterationsStr, salt, derived] = storedHash.split('$');
      const iterations = parseInt(iterationsStr, 10);
      const keylen = 64;
      const digest = 'sha512';
      const check = await new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, keylen, digest, (err, buf) => {
          if (err) return reject(err);
          resolve(buf.toString('hex'));
        });
      });
      return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(derived, 'hex'));
    }
    return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(storedHash));
  }
};

module.exports = { requireAuth, passwordUtils };
