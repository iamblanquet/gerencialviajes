const express = require('express');
const router = express.Router();
const https = require('https');
const db = require('../db');
const { verifyTelegramInitData } = require('../utils/telegramAuth');
const { sendTelegramMessage } = require('../utils/telegramNotify');

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
            const insertStmt = db.prepare(`
                INSERT INTO usuarios_telegram (telegram_user_id, telegram_username, telegram_first_name, telegram_last_name, rol, estado_registro, activo, ultimo_acceso_en)
                VALUES (?, ?, ?, ?, 'CONDUCTOR', 'PENDIENTE', 1, CURRENT_TIMESTAMP)
            `);
            const result = insertStmt.run(telegramUserId, username, firstName, lastName);
            userRecord = db.prepare('SELECT * FROM usuarios_telegram WHERE id_usuario_telegram = ?').get(result.lastInsertRowid);
        } else {
            db.prepare('UPDATE usuarios_telegram SET ultimo_acceso_en = CURRENT_TIMESTAMP, telegram_username = ?, telegram_first_name = ?, telegram_last_name = ? WHERE telegram_user_id = ?')
                .run(username, firstName, lastName, telegramUserId);
            userRecord = db.prepare('SELECT * FROM usuarios_telegram WHERE telegram_user_id = ?').get(telegramUserId);
        }

        let conductorRecord = null;
        if (userRecord.id_conductores) {
            conductorRecord = db.prepare('SELECT * FROM conductores WHERE id_conductores = ?').get(userRecord.id_conductores);
            if (conductorRecord) {
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

// POST /api/telegram/webhook - Endpoint de Webhook para Telegram Bot
router.post('/webhook', (req, res) => {
    try {
        const update = req.body;
        console.log('[TELEGRAM WEBHOOK UPDATE]', JSON.stringify(update));

        if (update.message) {
            const chatId = update.message.chat.id;
            const text = update.message.text || '';
            const webAppUrl = process.env.TELEGRAM_WEB_APP_URL || 'http://localhost/';

            if (text.startsWith('/start')) {
                const messageText = "👋 ¡Hola! Bienvenido al sistema de **Gerenciamiento de Viajes**.\n\nHaz clic en el botón de abajo para abrir la aplicación de conductor y gestionar tus viajes.";
                
                // Enviar mensaje con Inline Keyboard para abrir la Telegram Mini App
                const botToken = process.env.TELEGRAM_BOT_TOKEN;
                if (botToken && botToken !== 'MODO_DEMO_TOKEN') {
                    const payload = JSON.stringify({
                        chat_id: chatId,
                        text: messageText,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "🚖 Abrir Gerenciamiento de Viajes",
                                        web_app: { url: webAppUrl }
                                    }
                                ]
                            ]
                        }
                    });

                    const options = {
                        hostname: 'api.telegram.org',
                        port: 443,
                        path: `/bot${botToken}/sendMessage`,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(payload)
                        }
                    };

                    const reqTg = https.request(options);
                    reqTg.write(payload);
                    reqTg.end();
                }
            }
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error('[WEBHOOK ERROR]', err);
        return res.json({ ok: true }); // Siempre responder 200 a Telegram
    }
});

// POST /api/telegram/set-webhook - Endpoint para vincular el Webhook en Telegram
router.post('/set-webhook', (req, res) => {
    try {
        const { webhook_url } = req.body;
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!botToken || botToken === 'MODO_DEMO_TOKEN') {
            return res.status(400).json({ success: false, message: 'TELEGRAM_BOT_TOKEN no configurado en el servidor' });
        }

        if (!webhook_url) {
            return res.status(400).json({ success: false, message: 'Se requiere la propiedad webhook_url (URL HTTPS)' });
        }

        const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhook_url)}`;

        https.get(telegramApiUrl, (tgRes) => {
            let data = '';
            tgRes.on('data', chunk => data += chunk);
            tgRes.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    return res.json({ success: true, telegram_response: parsed });
                } catch (e) {
                    return res.status(500).json({ success: false, raw: data });
                }
            });
        }).on('error', (e) => {
            return res.status(500).json({ success: false, message: e.message });
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
