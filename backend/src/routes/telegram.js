const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyTelegramInitData } = require('../utils/telegramAuth');

// POST /api/telegram/autenticar
router.post('/autenticar', (req, res) => {
    try {
        const { initData, testUser } = req.body;
        let tgUser = null;

        if (initData) {
            const verification = verifyTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
            if (!verification.valid) {
                return res.status(400).json({ success: false, message: verification.message });
            }
            tgUser = verification.user;
        } else if (testUser && testUser.id) {
            // Modo demo / simulación manual en navegador
            tgUser = {
                id: Number(testUser.id),
                username: testUser.username || 'usuario_demo',
                first_name: testUser.first_name || 'Conductor',
                last_name: testUser.last_name || 'Demo'
            };
        } else {
            return res.status(400).json({ success: false, message: 'Se requiere initData o datos de usuario para autenticar' });
        }

        const telegramUserId = Number(tgUser.id);
        const username = tgUser.username || null;
        const firstName = tgUser.first_name || '';
        const lastName = tgUser.last_name || '';

        let userRecord = db.prepare('SELECT * FROM usuarios_telegram WHERE telegram_user_id = ?').get(telegramUserId);

        if (!userRecord) {
            // Crear usuario telegram automático con estado PENDIENTE
            const insertStmt = db.prepare(`
                INSERT INTO usuarios_telegram (telegram_user_id, telegram_username, telegram_first_name, telegram_last_name, rol, estado_registro, activo, ultimo_acceso_en)
                VALUES (?, ?, ?, ?, 'CONDUCTOR', 'PENDIENTE', 1, CURRENT_TIMESTAMP)
            `);
            const result = insertStmt.run(telegramUserId, username, firstName, lastName);
            userRecord = db.prepare('SELECT * FROM usuarios_telegram WHERE id_usuario_telegram = ?').get(result.lastInsertRowid);
        } else {
            // Actualizar ultimo acceso
            db.prepare('UPDATE usuarios_telegram SET ultimo_acceso_en = CURRENT_TIMESTAMP, telegram_username = ?, telegram_first_name = ?, telegram_last_name = ? WHERE telegram_user_id = ?')
                .run(username, firstName, lastName, telegramUserId);
            userRecord = db.prepare('SELECT * FROM usuarios_telegram WHERE telegram_user_id = ?').get(telegramUserId);
        }

        let conductorRecord = null;
        if (userRecord.id_conductores) {
            conductorRecord = db.prepare('SELECT * FROM conductores WHERE id_conductores = ?').get(userRecord.id_conductores);
            if (conductorRecord) {
                // Recalcular vigencia de licencia en base a la fecha actual
                const hoy = new Date().toISOString().split('T')[0];
                const estaVigente = conductorRecord.licencia_vencimiento && conductorRecord.licencia_vencimiento >= hoy ? 1 : 0;
                if (conductorRecord.licencia_vigente !== estaVigente) {
                    db.prepare('UPDATE conductores SET licencia_vigente = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id_conductores = ?')
                        .run(estaVigente, conductorRecord.id_conductores);
                    conductorRecord.licencia_vigente = estaVigente;
                }
            }
        }

        return res.json({
            success: true,
            data: {
                usuario_telegram: userRecord,
                conductor: conductorRecord,
                estado_registro: userRecord.estado_registro
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error durante la autenticación de Telegram: ' + err.message });
    }
});

// POST /api/telegram/registro-conductor
router.post('/registro-conductor', (req, res) => {
    try {
        const { telegram_user_id, nombre, telefono, licencia_numero, licencia_vencimiento } = req.body;

        if (!telegram_user_id || !nombre || !licencia_numero || !licencia_vencimiento) {
            return res.status(400).json({
                success: false,
                message: 'Campos obligatorios requeridos: telegram_user_id, nombre, licencia_numero, licencia_vencimiento'
            });
        }

        const userRecord = db.prepare('SELECT * FROM usuarios_telegram WHERE telegram_user_id = ?').get(Number(telegram_user_id));
        if (!userRecord) {
            return res.status(404).json({ success: false, message: 'Usuario de Telegram no encontrado' });
        }

        const hoy = new Date().toISOString().split('T')[0];
        const licencia_vigente = licencia_vencimiento >= hoy ? 1 : 0;

        // Transacción SQLite para crear conductor y vincular a usuario Telegram
        const registerTransaction = db.transaction(() => {
            const driverInsert = db.prepare(`
                INSERT INTO conductores (nombre, licencia_numero, licencia_vigente, licencia_vencimiento, telefono, activo)
                VALUES (?, ?, ?, ?, ?, 1)
            `);
            const driverResult = driverInsert.run(nombre.trim(), licencia_numero.trim(), licencia_vigente, licencia_vencimiento, telefono ? telefono.trim() : null);
            const newDriverId = driverResult.lastInsertRowid;

            db.prepare(`
                UPDATE usuarios_telegram
                SET id_conductores = ?, estado_registro = 'COMPLETO', actualizado_en = CURRENT_TIMESTAMP
                WHERE telegram_user_id = ?
            `).run(newDriverId, Number(telegram_user_id));

            return newDriverId;
        });

        const createdDriverId = registerTransaction();
        const createdDriver = db.prepare('SELECT * FROM conductores WHERE id_conductores = ?').get(createdDriverId);
        const updatedUser = db.prepare('SELECT * FROM usuarios_telegram WHERE telegram_user_id = ?').get(Number(telegram_user_id));

        return res.json({
            success: true,
            message: 'Conductor registrado y vinculado exitosamente',
            data: {
                usuario_telegram: updatedUser,
                conductor: createdDriver
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al registrar conductor: ' + err.message });
    }
});

module.exports = router;
