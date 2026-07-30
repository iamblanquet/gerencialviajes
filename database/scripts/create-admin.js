const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../db.sqlite');

function createAdminUser() {
    const args = process.argv.slice(2);
    const username = args[0] || 'admin';
    const rawPassword = args[1] || 'Admin123!';
    const nombre = args[2] || 'Administrador General';
    const correo = args[3] || 'admin@flotilla.com';
    const rol = args[4] || 'ADMINISTRADOR';

    console.log(`[CREATE ADMIN] Creando/actualizando usuario administrador: '${username}'...`);

    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(rawPassword, salt);

    const stmt = db.prepare(`
        INSERT INTO usuarios_admin (nombre, username, correo, password_hash, rol, activo, intentos_fallidos)
        VALUES (?, ?, ?, ?, ?, 1, 0)
        ON CONFLICT(username) DO UPDATE SET
            nombre = excluded.nombre,
            correo = excluded.correo,
            password_hash = excluded.password_hash,
            rol = excluded.rol,
            activo = 1,
            intentos_fallidos = 0,
            bloqueado_hasta = NULL,
            actualizado_en = CURRENT_TIMESTAMP
    `);

    stmt.run(nombre, username, correo, hash, rol);

    console.log('----------------------------------------------------');
    console.log('✅ Usuario Administrador listo con éxito:');
    console.log(`   - Usuario:  ${username}`);
    console.log(`   - Password: ${rawPassword}`);
    console.log(`   - Rol:      ${rol}`);
    console.log(`   - Nombre:   ${nombre}`);
    console.log('----------------------------------------------------');

    db.close();
}

if (require.main === module) {
    createAdminUser();
}

module.exports = { createAdminUser };
