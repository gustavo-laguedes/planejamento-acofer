import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

router.post('/login', async (req, res) => {
  const { password } = req.body || {};
  const plainPassword = process.env.ADMIN_PASSWORD || 'planacofer26';
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  const isValid = passwordHash
    ? await bcrypt.compare(password || '', passwordHash)
    : password === plainPassword;

  if (!isValid) {
    return res.status(401).json({ error: 'Senha invalida.' });
  }

  const ttlHours = Number(process.env.SESSION_TTL_HOURS || 12);
  const token = jwt.sign(
    { role: 'admin', name: 'Administrador' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: `${ttlHours}h` }
  );

  res.json({ token, user: { name: 'Administrador', role: 'admin' } });
});

router.get('/me', (req, res) => {
  res.json({ ok: true });
});

export default router;
