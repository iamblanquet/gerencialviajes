const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdminAuth } = require('../middleware/adminAuth');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'gerenciamiento_viajes_jwt_secret_key_2026';
const ADMIN_JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '8h';
const ADMIN_COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'admin_session_token';
const ADMIN_COOKIE_SECURE = process.env.ADMIN_COOKIE_SECURE === 'true';
const MAX_ATTEMPTS = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 3);
const BLOCK_MINUTES = Number(process.env.ADMIN_LOGIN_BLOCK_MINUTES || 15);

// POST /api/admin/auth/login
router.post('/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Por favor ingrese usuario y contraseña' });
        }

        const user = db.prepare('SELECT * FROM usuarios_admin WHERE username = ? AND activo = 1').get(username.trim());
        if (!user) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        const ahora = new Date();
        if (user.bloqueado_hasta) {
            const tiempoBloqueo = new Date(user.bloqueado_hasta);
            if (tiempoBloqueo > ahora) {
                const minutosRestantes = Math.ceil((tiempoBloqueo - ahora) / (1000 * 60));
                return res.status(423).json({
                    success: false,
                    message: `La cuenta se encuentra bloqueada por exceso de intentos fallidos. Reintente en ${minutosRestantes} minuto(s).`
                });
            }
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            const nuevosIntentos = user.intentos_fallidos + 1;
            let bloqueadoHasta = null;

            if (nuevosIntentos >= MAX_ATTEMPTS) {
                const bloqueo = new Date(ahora.getTime() + BLOCK_MINUTES * 60 * 1000);
                bloqueadoHasta = bloqueo.toISOString();
            }

            db.prepare(`
                UPDATE usuarios_admin
                SET intentos_fallidos = ?, bloqueado_hasta = ?, actualizado_en = CURRENT_TIMESTAMP
                WHERE id_usuarios_admin = ?
            `).run(nuevosIntentos, bloqueadoHasta, user.id_usuarios_admin);

            if (nuevosIntentos >= MAX_ATTEMPTS) {
                return res.status(423).json({
                    success: false,
                    message: `Ha superado el límite de ${MAX_ATTEMPTS} intentos fallidos. Cuenta bloqueada por ${BLOCK_MINUTES} minutos.`
                });
            }

            return res.status(401).json({
                success: false,
                message: `Credenciales inválidas. Intentos fallidos: ${nuevosIntentos} de ${MAX_ATTEMPTS}.`
            });
        }

        // Login exitoso: Resetear intentos fallidos
        db.prepare(`
            UPDATE usuarios_admin
            SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso_en = CURRENT_TIMESTAMP, actualizado_en = CURRENT_TIMESTAMP
            WHERE id_usuarios_admin = ?
        `).run(user.id_usuarios_admin);

        const tokenPayload = {
            id: user.id_usuarios_admin,
            username: user.username,
            nombre: user.nombre,
            rol: user.rol
        };

        const token = jwt.sign(tokenPayload, ADMIN_JWT_SECRET, { expiresIn: ADMIN_JWT_EXPIRES_IN });

        // Establecer Cookie httpOnly
        res.cookie(ADMIN_COOKIE_NAME, token, {
            httpOnly: true,
            secure: ADMIN_COOKIE_SECURE,
            sameSite: 'lax',
            maxAge: 8 * 60 * 60 * 1000 // 8 horas
        });

        return res.json({
            success: true,
            message: 'Autenticación exitosa',
            data: {
                id: user.id_usuarios_admin,
                nombre: user.nombre,
                username: user.username,
                rol: user.rol,
                token: token // Devolver también token para soporte opcional Bearer
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error en inicio de sesión: ' + err.message });
    }
});

// GET /api/admin/auth/session
router.get('/auth/session', requireAdminAuth, (req, res) => {
    return res.json({
        success: true,
        data: req.adminUser
    });
});

// POST /api/admin/auth/logout
router.post('/auth/logout', (req, res) => {
    res.clearCookie(ADMIN_COOKIE_NAME);
    return res.json({
        success: true,
        message: 'Sesión cerrada correctamente'
    });
});

// GET /api/admin/conductores
router.get('/conductores', requireAdminAuth, (req, res) => {
    try {
        const drivers = db.prepare(`
            SELECT c.*, ut.telegram_username, ut.telegram_user_id, ut.estado_registro as telegram_estado,
                   (SELECT COUNT(*) FROM viajes v WHERE v.id_conductores = c.id_conductores) as total_viajes
            FROM conductores c
            LEFT JOIN usuarios_telegram ut ON c.id_conductores = ut.id_conductores
            ORDER BY c.nombre ASC
        `).all();

        // Recalcular vigencia
        const hoy = new Date().toISOString().split('T')[0];
        const driversFormatted = drivers.map(d => ({
            ...d,
            licencia_vigente: d.licencia_vencimiento && d.licencia_vencimiento >= hoy ? 1 : 0
        }));

        return res.json({ success: true, data: driversFormatted });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al obtener conductores: ' + err.message });
    }
});

// POST /api/admin/conductores
router.post('/conductores', requireAdminAuth, (req, res) => {
    try {
        const { id_conductores, nombre, licencia_numero, licencia_vencimiento, telefono, activo } = req.body;

        if (!nombre || !licencia_numero || !licencia_vencimiento) {
            return res.status(400).json({ success: false, message: 'Nombre, número de licencia y fecha de vencimiento son requeridos.' });
        }

        const hoy = new Date().toISOString().split('T')[0];
        const licencia_vigente = licencia_vencimiento >= hoy ? 1 : 0;
        const act = activo !== undefined ? (activo ? 1 : 0) : 1;

        if (id_conductores) {
            db.prepare(`
                UPDATE conductores
                SET nombre = ?, licencia_numero = ?, licencia_vigente = ?, licencia_vencimiento = ?, telefono = ?, activo = ?, actualizado_en = CURRENT_TIMESTAMP
                WHERE id_conductores = ?
            `).run(nombre.trim(), licencia_numero.trim(), licencia_vigente, licencia_vencimiento, telefono ? telefono.trim() : null, act, Number(id_conductores));

            return res.json({ success: true, message: 'Conductor actualizado exitosamente' });
        } else {
            const result = db.prepare(`
                INSERT INTO conductores (nombre, licencia_numero, licencia_vigente, licencia_vencimiento, telefono, activo)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(nombre.trim(), licencia_numero.trim(), licencia_vigente, licencia_vencimiento, telefono ? telefono.trim() : null, act);

            return res.status(201).json({ success: true, message: 'Conductor creado exitosamente', id: result.lastInsertRowid });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al guardar conductor: ' + err.message });
    }
});

// GET /api/admin/vehiculos
router.get('/vehiculos', requireAdminAuth, (req, res) => {
    try {
        const vehicles = db.prepare(`
            SELECT v.*, 
                   (SELECT COUNT(*) FROM viajes vj WHERE vj.id_vehiculos = v.id_vehiculos) as total_viajes,
                   (SELECT COUNT(*) FROM viajes vj WHERE vj.id_vehiculos = v.id_vehiculos AND vj.id_estado_viaje = 3) as en_curso
            FROM vehiculos v
            ORDER BY v.numero_economico ASC
        `).all();
        return res.json({ success: true, data: vehicles });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al obtener vehículos: ' + err.message });
    }
});

// POST /api/admin/vehiculos
router.post('/vehiculos', requireAdminAuth, (req, res) => {
    try {
        const { id_vehiculos, nombre, numero_economico, placas, kilometraje_actual, activo } = req.body;

        if (!nombre || !numero_economico) {
            return res.status(400).json({ success: false, message: 'Nombre y número económico son requeridos.' });
        }

        const km = Number(kilometraje_actual || 0);
        const act = activo !== undefined ? (activo ? 1 : 0) : 1;

        if (id_vehiculos) {
            db.prepare(`
                UPDATE vehiculos
                SET nombre = ?, numero_economico = ?, placas = ?, kilometraje_actual = ?, activo = ?, actualizado_en = CURRENT_TIMESTAMP
                WHERE id_vehiculos = ?
            `).run(nombre.trim(), numero_economico.trim(), placas ? placas.trim() : null, km, act, Number(id_vehiculos));

            return res.json({ success: true, message: 'Vehículo actualizado exitosamente' });
        } else {
            const result = db.prepare(`
                INSERT INTO vehiculos (nombre, numero_economico, placas, kilometraje_actual, activo)
                VALUES (?, ?, ?, ?, ?)
            `).run(nombre.trim(), numero_economico.trim(), placas ? placas.trim() : null, km, act);

            return res.status(201).json({ success: true, message: 'Vehículo creado exitosamente', id: result.lastInsertRowid });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al guardar vehículo: ' + err.message });
    }
});

// GET /api/admin/lugares
router.get('/lugares', requireAdminAuth, (req, res) => {
    try {
        const places = db.prepare('SELECT * FROM lugares ORDER BY nombre ASC').all();
        return res.json({ success: true, data: places });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al obtener lugares: ' + err.message });
    }
});

// POST /api/admin/lugares
router.post('/lugares', requireAdminAuth, (req, res) => {
    try {
        const { id_lugares, nombre, direccion, latitud, longitud, activo } = req.body;

        if (!nombre) {
            return res.status(400).json({ success: false, message: 'El nombre del lugar es requerido.' });
        }

        const lat = latitud !== undefined && latitud !== '' ? Number(latitud) : null;
        const lng = longitud !== undefined && longitud !== '' ? Number(longitud) : null;
        const act = activo !== undefined ? (activo ? 1 : 0) : 1;

        if (id_lugares) {
            db.prepare(`
                UPDATE lugares
                SET nombre = ?, direccion = ?, latitud = ?, longitud = ?, activo = ?, actualizado_en = CURRENT_TIMESTAMP
                WHERE id_lugares = ?
            `).run(nombre.trim(), direccion ? direccion.trim() : null, lat, lng, act, Number(id_lugares));

            return res.json({ success: true, message: 'Lugar actualizado exitosamente' });
        } else {
            const result = db.prepare(`
                INSERT INTO lugares (nombre, direccion, latitud, longitud, activo)
                VALUES (?, ?, ?, ?, ?)
            `).run(nombre.trim(), direccion ? direccion.trim() : null, lat, lng, act);

            return res.status(201).json({ success: true, message: 'Lugar creado exitosamente', id: result.lastInsertRowid });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al guardar lugar: ' + err.message });
    }
});

// GET /api/admin/viajes
router.get('/viajes', requireAdminAuth, (req, res) => {
    try {
        const { estado, fecha } = req.query;
        let query = `
            SELECT v.*, c.nombre as conductor_nombre, veh.nombre as vehiculo_nombre, veh.numero_economico,
                   l1.nombre as origen_nombre, l2.nombre as destino_nombre, ev.nombre as estado_nombre,
                   (SELECT count(*) FROM ubicaciones_viaje uv WHERE uv.id_viajes = v.id_viajes) as total_ubicaciones
            FROM viajes v
            JOIN conductores c ON v.id_conductores = c.id_conductores
            JOIN vehiculos veh ON v.id_vehiculos = veh.id_vehiculos
            JOIN lugares l1 ON v.id_origen = l1.id_lugares
            JOIN lugares l2 ON v.id_destino = l2.id_lugares
            JOIN estados_viaje ev ON v.id_estado_viaje = ev.id_estado_viaje
            WHERE 1=1
        `;
        const params = [];

        if (estado) {
            query += ` AND ev.nombre = ?`;
            params.push(estado);
        }

        if (fecha) {
            query += ` AND v.fecha = ?`;
            params.push(fecha);
        }

        query += ` ORDER BY v.id_viajes DESC`;

        const trips = db.prepare(query).all(...params);
        return res.json({ success: true, data: trips });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar viajes admin: ' + err.message });
    }
});

// GET /api/admin/viajes/:id/ubicaciones
router.get('/viajes/:id/ubicaciones', requireAdminAuth, (req, res) => {
    try {
        const tripId = Number(req.params.id);
        const locations = db.prepare(`
            SELECT * FROM ubicaciones_viaje 
            WHERE id_viajes = ? 
            ORDER BY id_ubicaciones_viaje ASC
        `).all(tripId);

        return res.json({ success: true, data: locations });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar puntos de ubicación GPS: ' + err.message });
    }
});

// GET /api/admin/ubicaciones/recientes (Dashboard de Monitoreo GPS)
router.get('/ubicaciones/recientes', requireAdminAuth, (req, res) => {
    try {
        const activeLocations = db.prepare(`
            SELECT uv.*, v.folio, c.nombre as conductor_nombre, veh.nombre as vehiculo_nombre, veh.numero_economico
            FROM ubicaciones_viaje uv
            JOIN viajes v ON uv.id_viajes = v.id_viajes
            JOIN conductores c ON v.id_conductores = c.id_conductores
            JOIN vehiculos veh ON v.id_vehiculos = veh.id_vehiculos
            WHERE v.id_estado_viaje = 3
            AND uv.id_ubicaciones_viaje IN (
                SELECT MAX(id_ubicaciones_viaje) FROM ubicaciones_viaje GROUP BY id_viajes
            )
            ORDER BY uv.fecha_gps DESC
        `).all();

        return res.json({ success: true, data: activeLocations });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar ubicaciones recientes: ' + err.message });
    }
});

module.exports = router;
