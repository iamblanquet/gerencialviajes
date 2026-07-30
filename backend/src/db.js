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

        // Asegurar que exista la tabla paradas_viaje en bases de datos ya creadas
        db.exec(`
            CREATE TABLE IF NOT EXISTS paradas_viaje (
                id_paradas_viaje INTEGER PRIMARY KEY AUTOINCREMENT,
                id_viajes INTEGER NOT NULL REFERENCES viajes(id_viajes) ON DELETE CASCADE,
                motivo_parada VARCHAR(150) NOT NULL,
                latitud REAL CHECK (latitud IS NULL OR (latitud >= -90.0 AND latitud <= 90.0)),
                longitud REAL CHECK (longitud IS NULL OR (longitud >= -180.0 AND longitud <= 180.0)),
                hora_inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                hora_fin DATETIME NULL,
                duracion_minutos INTEGER NULL CHECK (duracion_minutos IS NULL OR duracion_minutos >= 0),
                observaciones TEXT,
                creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_paradas_viaje_viaje ON paradas_viaje(id_viajes);
        `);

        // Asegurar usuario admin
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
