const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../database/db.sqlite');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Auto-inicializar si la base de datos está vacía
function autoInit() {
    try {
        const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conductores'").get();
        if (!tableCheck) {
            console.log('[DB] Inicializando esquema y semillas iniciales...');
            const migrationFile = path.join(__dirname, '../../database/migrations/001_init_schema.sql');
            const seedFile = path.join(__dirname, '../../database/seeds/001_seed_data.sql');

            if (fs.existsSync(migrationFile)) {
                db.exec(fs.readFileSync(migrationFile, 'utf8'));
            }
            if (fs.existsSync(seedFile)) {
                db.exec(fs.readFileSync(seedFile, 'utf8'));
            }
            console.log('[DB] Base de datos auto-inicializada.');
        }
    } catch (err) {
        console.error('[DB ERROR] Error durante la auto-inicialización:', err);
    }
}

autoInit();

module.exports = db;
