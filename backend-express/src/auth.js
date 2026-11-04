const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { seedDefaultPlan } = require('./plans');
const { readSettings } = require('./training-features');

const deriveKey = promisify(scrypt);
const COOKIE = 'liftup_session';
const LIFETIME = 7 * 24 * 60 * 60 * 1000;
const HASH_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummyHash = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
const tokenHash = (value) => createHash('sha256').update(value).digest('hex');

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64, HASH_OPTIONS);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  const [type, salt, hash] = encoded.split(':');
  if (type !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await deriveKey(password, salt, 64, HASH_OPTIONS);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function readToken(req) {
  const value = (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

function profile(user) {
  return { id: String(user.id), name: user.name, email: user.email,
    experienceLevel: user.experience_level, joinedAt: user.created_at, settings: readSettings(user) };
}

function configureAuth(app, database) {
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' };
  const attempts = new Map();

  // A cross-origin HTML form cannot supply this header; CORS is not enabled.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-liftup-request') !== '1') {
      return res.status(403).json({ error: 'Reload LiftUp and try again.' });
    }
    next();
  });

  app.use('/api/auth', (req, res, next) => {
    if (!['/login', '/register', '/change-password', '/account'].includes(req.path) || !['POST', 'DELETE'].includes(req.method)) return next();
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
    if (++entry.count > 20) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    }
    attempts.set(key, entry);
    next();
  });

  async function getUser(req) {
    const token = readToken(req);
    if (!token) return null;
    return database.prepare(`SELECT u.* FROM app_users u JOIN auth_sessions s ON s.user_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(token), new Date().toISOString());
  }

  async function issueSession(req, res, user) {
    const previous = readToken(req);
    if (previous) await database.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash(previous));
    const token = randomBytes(32).toString('hex');
    await database.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?) RETURNING token_hash')
      .run(tokenHash(token), user.id, new Date(Date.now() + LIFETIME).toISOString());
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: LIFETIME });
  }

  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, experienceLevel = 'beginner' } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 ||
        typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' || password.length < 12 || password.length > 128 ||
        !['beginner', 'intermediate', 'advanced'].includes(experienceLevel)) {
      return res.status(422).json({ error: 'Enter a name, valid email, experience level, and a password of 12–128 characters.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = await database.transaction(async () => {
        const result = await database.prepare(`INSERT INTO app_users
          (name, email, password_hash, experience_level, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id`)
          .run(name.trim(), normalizedEmail, passwordHash, experienceLevel, new Date().toISOString());
        const saved = await database.prepare('SELECT * FROM app_users WHERE id = ?').get(result.lastInsertRowid);
        await seedDefaultPlan(database, saved.id);
        return saved;
      });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
      throw error;
    }
    await issueSession(req, res, user);
    res.status(201).json({ user: profile(user) });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const user = await database.prepare('SELECT * FROM app_users WHERE email = ?').get(email.trim().toLowerCase());
    const valid = await verifyPassword(password, user?.password_hash || dummyHash);
    if (!user || !valid) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await issueSession(req, res, user);
    res.json({ user: profile(user) });
  });

  app.get('/api/auth/me', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
    res.json({ user: profile(user) });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = readToken(req);
    if (token) await database.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash(token));
    res.clearCookie(COOKIE, cookieOptions);
    res.status(204).end();
  });

  app.patch('/api/auth/profile', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to update your profile.' });
    const { name, experienceLevel } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || !['beginner', 'intermediate', 'advanced'].includes(experienceLevel))
      return res.status(422).json({ error: 'Enter a name of up to 80 characters and choose your experience level.' });
    await database.prepare('UPDATE app_users SET name = ?, experience_level = ? WHERE id = ?').run(name.trim(), experienceLevel, user.id);
    res.json({ user: profile(await database.prepare('SELECT * FROM app_users WHERE id = ?').get(user.id)) });
  });
  app.post('/api/auth/change-password', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to change your password.' });
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || currentPassword.length > 128 || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128)
      return res.status(422).json({ error: 'Enter your current password and a new password of 12–128 characters.' });
    if (!await verifyPassword(currentPassword, user.password_hash)) return res.status(403).json({ error: 'Your current password is incorrect.' });
    if (currentPassword === newPassword) return res.status(422).json({ error: 'Choose a different new password.' });
    const hash = await hashPassword(newPassword);
    await database.transaction(async () => {
      await database.prepare('UPDATE app_users SET password_hash = ? WHERE id = ?').run(hash, user.id);
      await database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(user.id);
      await issueSession(req, res, user);
    });
    res.json({ message: 'Password changed. Other sessions have been signed out.' });
  });
  app.delete('/api/auth/account', async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to delete your account.' });
    if (req.body?.confirm !== 'DELETE' || typeof req.body.password !== 'string' || req.body.password.length > 128)
      return res.status(422).json({ error: 'Type DELETE and enter your current password.' });
    if (!await verifyPassword(req.body.password, user.password_hash)) return res.status(403).json({ error: 'Your password is incorrect.' });
    await database.transaction(async () => {
      await database.prepare('DELETE FROM workout_sessions WHERE user_id = ?').run(user.id);
      await database.prepare('DELETE FROM workout_plans WHERE user_id = ?').run(user.id);
      await database.prepare('DELETE FROM plan_templates WHERE user_id = ?').run(user.id);
      await database.prepare('DELETE FROM custom_exercises WHERE user_id = ?').run(user.id);
      await database.prepare('DELETE FROM app_users WHERE id = ?').run(user.id);
    });
    res.clearCookie(COOKIE, cookieOptions);
    res.status(204).end();
  });

  return { getUser };
}

module.exports = { configureAuth, hashPassword, verifyPassword };
