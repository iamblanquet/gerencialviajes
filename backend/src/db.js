const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../database/db.sqlite');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Auto-inicializar si la base de datos está vacía o no tiene el usuario admin
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

        // Asegurar que siempre exista al menos el usuario administrador predeterminado
        const adminCheck = db.prepare("SELECT count(*) as total FROM usuarios_admin WHERE username = 'admin'").get();
        if (!adminCheck || adminCheck.total === 0) {
            console.log('[DB] Creando usuario administrador predeterminado (admin / Admin123!)...');
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync('Admin123!', salt);
            db.prepare(`
                INSERT INTO usuarios_admin (nombre, username, correo, password_hash, rol, activo, intentos_fallidos)
                VALUES ('Administrador General', 'admin', 'admin@flotilla.com', ?, 'ADMINISTRADOR', 1, 0)
            `).run(hash);
            console.log('[DB] Usuario admin creado exitosamente.');
        }
    } catch (err) {
        console.error('[DB ERROR] Error durante la auto-inicialización:', err);
    }
}

autoInit();

module.exports = db;
