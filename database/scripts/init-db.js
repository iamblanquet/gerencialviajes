const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../db.sqlite');
const migrationsPath = path.join(__dirname, '../migrations/001_init_schema.sql');
const seedsPath = path.join(__dirname, '../seeds/001_seed_data.sql');

function initDatabase() {
    console.log(`[DB INIT] Inicializando base de datos SQLite en: ${dbPath}`);
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    console.log('[DB INIT] Ejecutando migración 001_init_schema.sql...');
    const schemaSql = fs.readFileSync(migrationsPath, 'utf8');
    db.exec(schemaSql);

    console.log('[DB INIT] Ejecutando seed 001_seed_data.sql...');
    const seedSql = fs.readFileSync(seedsPath, 'utf8');
    db.exec(seedSql);

    console.log('[DB INIT] Base de datos inicializada correctamente.');
    db.close();
}

if (require.main === module) {
    initDatabase();
}

module.exports = { initDatabase };
