require('dotenv').config();
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.SECOND_DB_HOST,
  user: process.env.SECOND_DB_USER,
  password: process.env.SECOND_DB_PASSWORD,
  database: process.env.SECOND_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
(async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('Database NCD connected successfully');
    connection.release();
  } catch (error) {
    logger.error('Database NCD connection failed:', error);
  }
})();

module.exports = pool;
