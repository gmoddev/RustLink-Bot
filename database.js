// database.js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data.sqlite');
const db = new Database(dbPath);

// Create table if not exists
db.prepare(`
CREATE TABLE IF NOT EXISTS RoleEntitlements (
    RoleId TEXT PRIMARY KEY,
    Entitlement TEXT NOT NULL
)
`).run();

module.exports = db;