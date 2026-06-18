require('dotenv').config();
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.SECOND_DB_HOST_SCALE_UP,
  user: process.env.SECOND_DB_USER_SCALE_UP,
  password: process.env.SECOND_DB_PASSWORD_SCALE_UP,
  database: process.env.SECOND_DB_NAME_SCALE_UP,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
(async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('Database NCD Scale Up connected successfully');
    connection.release();
  } catch (error) {
    logger.error('Database NCD Scale Up connection failed:', error);
  }
})();

module.exports = pool;
