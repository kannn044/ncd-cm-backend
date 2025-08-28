const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const auth = require('../middleware/authMiddleware');

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const payload = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    };
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// GET /users
router.get('/cm-users', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM cm_users');
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// POST /users
router.post('/users', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const [result] = await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
    res.json({ id: result.insertId, name, email });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

router.post('/cm-users', async (req, res) => {
  const { name, hospcode, cid, contact, address } = req.body;

  if (name == null) return res.status(400).json({ message: 'name is null' });
  if (hospcode == null) return res.status(400).json({ message: 'hospcode is null' });
  if (cid == null) return res.status(400).json({ message: 'cid is null' });
  if (contact == null) return res.status(400).json({ message: 'contact is null' });
  if (address == null) return res.status(400).json({ message: 'address is null' });

  const hospcodeStr = typeof hospcode === 'string' ? hospcode.trim() : String(hospcode).trim();
  const cidStr = typeof cid === 'string' ? cid.trim() : String(cid).trim();

  if (!/^[0-9]+$/.test(hospcodeStr)) {
    return res.status(400).json({ message: 'hospcode must contain digits 0-9 only' });
  }
  if (!/^[0-9]+$/.test(cidStr)) {
    return res.status(400).json({ message: 'cid must contain digits 0-9 only' });
  }
  if (cidStr.length !== 13) {
    return res.status(400).json({ message: 'cid must be exactly 13 digits (0-9)' });
  }

  try {
    const user_status = 'activate';
    const user_type = 'doctor';
    const [result] = await db.query(
      'INSERT INTO cm_users (name, hospcode, cid, contact, address, status, user_type, d_update) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [name, hospcodeStr, cidStr, contact, address, user_status, user_type]
    );
    res.json({ id: result.insertId, name, hospcode: hospcodeStr, contact, address });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// PUT /users/:id
router.put('/cm-users/:id', auth, async (req, res) => {
  const { name, hospcode, cid, contact, address } = req.body;
  try {
    await db.query('UPDATE cm_users SET name = ?, hospcode = ?, cid = ?, contact = ?, address = ? WHERE id = ?', [name, hospcode, cid, contact, address, req.params.id]);
    res.json({ message: 'User updated' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});


// DELETE /users/:id
router.delete('/cm-users/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM cm_users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
