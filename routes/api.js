const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const auth = require('../middleware/authMiddleware');
const uuid = require('uuid');
const logger = require('../utils/logger');

router.get('/', (req, res) => {
    res.json({ message: 'API is running from /api route' }); // You can change the message
    logger.info('API /api route is running');
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  logger.info(`Login attempt for email: ${email}`);

  try {
    const [rows] = await db.query('SELECT * FROM account WHERE email = ?', [email]);
    if (rows.length === 0) {
      logger.warn(`Login failed for email: ${email} - Invalid credentials`);
      return res.status(400).json({ ok: false, statusCode: 400, message: 'Invalid credentials' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn(`Login failed for email: ${email} - Invalid credentials`);
      return res.status(400).json({ ok: false, statusCode: 400, message: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    };

    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30m' }, (err, token) => {
      if (err) {
        logger.error(err.message);
        return res.status(500).json({ ok: false, statusCode: 500, message: 'Server error' });
      }
      logger.info(`Login successful for email: ${email}`);
      return res.status(200).json({ ok: true, statusCode: 200, token });
    });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ ok: false, statusCode: 500, message: 'Server error' });
  }
});

// GET /cm-users with pagination, sorting, and search
router.get('/cm-users', auth, async (req, res) => {
  logger.info('GET /cm-users', { query: req.query });
  try {
    const {
      page = '1',
      limit = '10',
      sort = 'd_update',
      order = 'desc',
      search = ''
    } = req.query;
    
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const allowedSort = new Set(['name', 'hospcode', 'cid', 'contact', 'address', 'status', 'd_update']);
    const sortBy = allowedSort.has(String(sort)) ? String(sort) : 'd_update';
    const sortOrder = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let where = 'WHERE user_type = ?';
    const params = ['doctor'];

    const trimmedSearch = String(search || '').trim();
    if (trimmedSearch) {
      const like = `%${trimmedSearch}%`;
      where += ' AND (name LIKE ? OR cid LIKE ? OR hospcode LIKE ? OR contact LIKE ? OR address LIKE ?)';
      params.push(like, like, like, like, like);
    }

    const countSql = `SELECT COUNT(*) AS total FROM user ${where}`;
    const [countRows] = await db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    const dataSql = `SELECT * FROM user ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    // logger.info(dataSql, [...params, limitNum, offset]);
    const dataParams = [...params, limitNum, offset];
    const [rows] = await db.query(dataSql, dataParams);

    return res.status(200).json({
      ok: true,
      statusCode: 200,
      data: rows,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    logger.error(err.message);
    return res.status(500).json({ ok: false, statusCode: 500, message: 'Server error' });
  }
});

// POST /users
// router.post('/users', async (req, res) => {
//   const { name, email, password } = req.body;
//   try {
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(password, salt);
//     const [result] = await db.query('INSERT INTO account (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
//     res.json({ id: result.insertId, name, email });
//   } catch (err) {
//     logger.error(err.message);
//     res.status(500).send('Server error');
//   }
// });

router.post('/cm-users', auth, async (req, res) => {
  logger.info('POST /cm-users', { body: req.body });
  const { name, hospcode, cid, contact, address } = req.body;

  if (name == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'name is null' });
  if (hospcode == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'hospcode is null' });
  if (cid == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'cid is null' });
  if (contact == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'contact is null' });
  if (address == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'address is null' });

  const hospcodeStr = typeof hospcode === 'string' ? hospcode.trim() : String(hospcode).trim();
  const cidStr = typeof cid === 'string' ? cid.trim() : String(cid).trim();

  if (!/^[0-9]+$/.test(hospcodeStr)) {
    return res.status(400).json({ ok: false, statusCode: 400, message: 'hospcode must contain digits 0-9 only' });
  }
  if (!/^[0-9]+$/.test(cidStr)) {
    return res.status(400).json({ ok: false, statusCode: 400, message: 'cid must contain digits 0-9 only' });
  }
  if (cidStr.length !== 13) {
    return res.status(400).json({ ok: false, statusCode: 400, message: 'cid must be exactly 13 digits (0-9)' });
  }

  try {
    const id = uuid.v4();
    const user_status = 'activate';
    const user_type = 'doctor';
    const [result] = await db.query(
      'INSERT INTO user (id, name, hospcode, cid, contact, address, status, user_type, d_update) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [id, name, hospcodeStr, cidStr, contact, address, user_status, user_type]
    );
    return res.status(201).json({
      ok: true,
      statusCode: 201,
      id: id,
      name,
      hospcode: hospcodeStr,
      contact,
      address,
      user_type,
      d_update: new Date(),
      user_status
    });
  } catch (err) {
    logger.error(err.message);
    return res.status(500).json({ ok: false, statusCode: 500, message: 'Server error' });
  }
});

// PUT /cm-users/:id
router.put('/cm-users/:id', auth, async (req, res) => {
  logger.info(`PUT /cm-users/${req.params.id}`, { body: req.body });
  try {
    const body = req.body || {};
    const name = body.NAME ?? body.name;
    const hospcodeVal = body.HOSPCODE ?? body.hospcode;
    const cidVal = body.CID ?? body.cid;
    const contact = body.CONTACT ?? body.contact;
    const address = body.ADDRESS ?? body.address;
    const statusRaw = body.STATUS ?? body.status;

    if (name == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'name is null' });
    if (hospcodeVal == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'hospcode is null' });
    if (cidVal == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'cid is null' });
    if (contact == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'contact is null' });
    if (address == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'address is null' });
    if (statusRaw == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'status is null' });

    const hospcodeStr = typeof hospcodeVal === 'string' ? hospcodeVal.trim() : String(hospcodeVal).trim();
    const cidStr = typeof cidVal === 'string' ? cidVal.trim() : String(cidVal).trim();
    const status = String(statusRaw).trim().toLowerCase();

    if (!/^[0-9]+$/.test(hospcodeStr)) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'hospcode must contain digits 0-9 only' });
    }
    if (!/^[0-9]+$/.test(cidStr)) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'cid must contain digits 0-9 only' });
    }
    if (cidStr.length !== 13) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'cid must be exactly 13 digits (0-9)' });
    }
    if (!['activate', 'deactivate'].includes(status)) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'status must be activate or deactivate' });
    }

    const [result] = await db.query(
      'UPDATE user SET name = ?, hospcode = ?, cid = ?, contact = ?, address = ?, status = ?, d_update = NOW() WHERE id = ?',
      [name, hospcodeStr, cidStr, contact, address, status, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, statusCode: 404, message: 'User not found' });
    }

    return res.status(200).json({ ok: true, statusCode: 200, message: 'User updated' });
  } catch (err) {
    logger.error(err.message);
    return res.status(500).json({ ok: false, statusCode: 500, message: 'Server error' });
  }
});

// GET /hospitals with pagination, sorting, and search
router.get('/hospitals', auth, async (req, res) => {
  logger.info('GET /hospitals', { query: req.query });
  try {
    const {
      page = '1',
      limit = '10',
      sort = 'NAME',
      order = 'asc',
      search = ''
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const allowedSort = new Set(['HOSPCODE', 'NAME', 'HEADQUARTER']);
    const sortBy = allowedSort.has(String(sort).toUpperCase()) ? String(sort).toUpperCase() : 'NAME';
    const sortOrder = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    let where = 'WHERE 1=1';
    const params = [];

    const trimmedSearch = String(search || '').trim();
    if (trimmedSearch) {
      const like = `%${trimmedSearch}%`;
      where += ' AND (HOSPCODE LIKE ? OR NAME LIKE ? OR HEADQUARTER LIKE ?)';
      params.push(like, like, like);
    }

    const countSql = `SELECT COUNT(*) AS total FROM hospital ${where}`;
    const [countRows] = await db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    const dataSql = `SELECT HOSPCODE, NAME, HEADQUARTER FROM hospital ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    const dataParams = [...params, limitNum, offset];
    const [rows] = await db.query(dataSql, dataParams);

    return res.status(200).json({
      ok: true,
      statusCode: 200,
      data: rows,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    logger.error(err.message);
    return res.status(500).json({ ok: false, statusCode: 500, message: 'Server error' });
  }
});

// POST /hospitals
router.post('/hospitals', auth, async (req, res) => {
  logger.info('POST /hospitals', { body: req.body });
  try {
    const body = req.body || {};
    const hospcodeVal = body.HOSPCODE ?? body.hospcode;
    const nameVal = body.NAME ?? body.name;
    const headquarterVal = body.HEADQUARTER ?? body.headquarter;

    if (hospcodeVal == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'HOSPCODE is null' });
    if (nameVal == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'NAME is null' });
    if (headquarterVal == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'HEADQUARTER is null' });

    const hospcode = typeof hospcodeVal === 'string' ? hospcodeVal.trim() : String(hospcodeVal).trim();
    if (!/^[0-9]+$/.test(hospcode)) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'HOSPCODE must contain digits 0-9 only' });
    }

    const name = String(nameVal).trim();
    if (!name) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'NAME must not be empty' });
    }

    const headquarter = typeof headquarterVal === 'string' ? headquarterVal.trim() : String(headquarterVal).trim();
    if (!/^[0-9]+$/.test(headquarter)) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'HEADQUARTER must contain digits 0-9 only' });
    }

    await db.query(
      'INSERT INTO hospital (HOSPCODE, NAME, HEADQUARTER) VALUES (?, ?, ?)',
      [hospcode, name, headquarter]
    );

    return res.status(201).json({
      ok: true,
      statusCode: 201,
      HOSPCODE: hospcode,
      NAME: name,
      HEADQUARTER: headquarter
    });
  } catch (err) {
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      return res.status(409).json({ ok: false, statusCode: 409, message: 'HOSPCODE already exists' });
    }
    logger.error(err.message);
    return res.status(500).json({ ok: false, statusCode: 500, message: 'Server error' });
  }
});

// PUT /hospitals/:hospcode
router.put('/hospitals/:hospcode', auth, async (req, res) => {
  logger.info(`PUT /hospitals/${req.params.hospcode}`, { body: req.body });
  try {
    const hospcodeParam = String(req.params.hospcode || '').trim();
    if (!/^[0-9]+$/.test(hospcodeParam)) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'Invalid HOSPCODE in path' });
    }

    const body = req.body || {};
    const nameVal = body.NAME ?? body.name;
    const headquarterVal = body.HEADQUARTER ?? body.headquarter;

    if (nameVal == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'NAME is null' });
    if (headquarterVal == null) return res.status(400).json({ ok: false, statusCode: 400, message: 'HEADQUARTER is null' });

    const name = String(nameVal).trim();
    if (!name) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'NAME must not be empty' });
    }

    const headquarter = typeof headquarterVal === 'string' ? headquarterVal.trim() : String(headquarterVal).trim();
    if (!/^[0-9]+$/.test(headquarter)) {
      return res.status(400).json({ ok: false, statusCode: 400, message: 'HEADQUARTER must contain digits 0-9 only' });
    }

    const [result] = await db.query(
      'UPDATE hospital SET NAME = ?, HEADQUARTER = ? WHERE HOSPCODE = ?',
      [name, headquarter, hospcodeParam]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, statusCode: 404, message: 'Hospital not found' });
    }

    return res.status(200).json({ ok: true, statusCode: 200, message: 'Hospital updated' });
  } catch (err) {
    logger.error(err.message);
    return res.status(500).json({ ok: false, statusCode: 500, message: 'Server error' });
  }
});

// // DELETE /cm-users/:id
// router.delete('/cm-users/:id', auth, async (req, res) => {
//   try {
//     await db.query('UPDATE user SET status = "deactivate" WHERE id = ?', [req.params.id]);
//     return res.status(200).json({ ok: true, statusCode: 200, message: 'User deleted' });
//   } catch (err) {
//     logger.error(err.message);
//     return res.status(500).json({ ok: false, statusCode: 500, message: 'Server error' });
//   }
// });

module.exports = router;
