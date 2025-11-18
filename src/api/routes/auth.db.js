import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Load JWT secret & expiration
const JWT_SECRET = process.env.JWT_SECRET || 'changeme123';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Create JWT token


function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setTokenCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: false,         // 👉 set true when deploying with HTTPS
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

// ------------------------ SIGNUP ------------------------
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password required' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed });

    const token = generateToken(user);
    setTokenCookie(res, token);

    res.json({
      message: 'User created',
      user: { id: user.id, email: user.email }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// ------------------------ LOGIN ------------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password required' });

    const user = await User.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    setTokenCookie(res, token);

    res.json({
      message: 'Login success',
      user: { id: user.id, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ------------------------ AUTH VERIFY: /auth/me ------------------------
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'email']
    });

    if (!user) return res.status(401).json({ error: 'Invalid token' });

    // FIX → return only the user object, not {user:{}}
    res.json(user);

  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});
router.post('/logout', (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});



export default router;
