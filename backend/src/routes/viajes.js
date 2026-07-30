const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendTelegramMessage } = require('../utils/telegramNotify');

// Generador de folio consecutivo diario VJ-YYYYMMDD-0001
function generarFolioDiario() {
    const ahora = new Date();
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const dd = String(ahora.getDate()).padStart(2, '0');
    const prefijoFecha = `${yyyy}${mm}${dd}`;
    const prefijoFolio = `VJ-${prefijoFecha}-`;

    const row = db.prepare(`
        SELECT COUNT(*) as total FROM viajes 
        WHERE folio LIKE ?
    `).get(`${prefijoFolio}%`);

    const consecutivo = String((row ? row.total : 0) + 1).padStart(4, '0');
    return `${prefijoFolio}${consecutivo}`;
}

// POST /api/viajes - Crear nuevo viaje (PENDIENTE)
router.post('/', (req, res) => {
    try {
        const {
            id_conductores,
            id_vehiculos,
            id_origen,
            id_destino,
            kilometraje_inicial,
            acompanantes,
            motivo
        } = req.body;

        if (!id_conductores || !id_vehiculos || !id_origen || !id_destino || kilometraje_inicial === undefined || !motivo) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos obligatorios deben estar presentes (id_conductores, id_vehiculos, id_origen, id_destino, kilometraje_inicial, motivo)'
            });
        }

        // 1. Validar Conductor y Licencia Vigente
        const driver = db.prepare('SELECT * FROM conductores WHERE id_conductores = ? AND activo = 1').get(Number(id_conductores));
        if (!driver) {
            return res.status(400).json({ success: false, message: 'El conductor seleccionado no existe o está inactivo.' });
        }

        const hoy = new Date().toISOString().split('T')[0];
        const licenciaVigente = driver.licencia_vencimiento && driver.licencia_vencimiento >= hoy ? 1 : 0;
        if (!licenciaVigente) {
            return res.status(400).json({ success: false, message: 'La licencia del conductor está vencida. No se puede crear el viaje.' });
        }

        // 2. Validar Vehículo
        const vehicle = db.prepare('SELECT * FROM vehiculos WHERE id_vehiculos = ? AND activo = 1').get(Number(id_vehiculos));
        if (!vehicle) {
            return res.status(400).json({ success: false, message: 'El vehículo seleccionado no existe o está inactivo.' });
        }

        const kmInicialNum = Number(kilometraje_inicial);
        if (kmInicialNum < vehicle.kilometraje_actual) {
            return res.status(400).json({
                success: false,
                message: `El kilometraje inicial (${kmInicialNum} km) no puede ser menor al registrado en la unidad (${vehicle.kilometraje_actual} km).`
            });
        }

        // 3. Validar Origen y Destino
        if (Number(id_origen) === Number(id_destino)) {
            return res.status(400).json({ success: false, message: 'El lugar de origen debe ser distinto al lugar de destino.' });
        }

        const origin = db.prepare('SELECT * FROM lugares WHERE id_lugares = ? AND activo = 1').get(Number(id_origen));
        const destination = db.prepare('SELECT * FROM lugares WHERE id_lugares = ? AND activo = 1').get(Number(id_destino));
        if (!origin || !destination) {
            return res.status(400).json({ success: false, message: 'El origen o destino seleccionado no es válido o está inactivo.' });
        }

        // 4. Formatear Acompañantes JSON
        let acompArr = [];
        if (Array.isArray(acompanantes)) {
            acompArr = acompanantes.map(a => String(a).trim()).filter(Boolean);
        } else if (typeof acompanantes === 'string' && acompanantes.trim() !== '') {
            acompArr = acompanantes.split(',').map(a => a.trim()).filter(Boolean);
        }
        const acompJson = JSON.stringify(acompArr);

        // 5. Generar Folio diario
        const folio = generarFolioDiario();

        // 6. Transacción para guardar viaje e historial
        const createTripTransaction = db.transaction(() => {
            const insertTrip = db.prepare(`
                INSERT INTO viajes (
                    folio, id_conductores, id_vehiculos, id_origen, id_destino, id_estado_viaje,
                    acompanantes, licencia_vigente, kilometraje_inicial, motivo, fecha, creado_en
                ) VALUES (?, ?, ?, ?, ?, 2, ?, ?, ?, ?, CURRENT_DATE, CURRENT_TIMESTAMP)
            `);

            const result = insertTrip.run(
                folio,
                Number(id_conductores),
                Number(id_vehiculos),
                Number(id_origen),
                Number(id_destino),
                acompJson,
                licenciaVigente,
                kmInicialNum,
                motivo.trim()
            );

            const tripId = result.lastInsertRowid;

            db.prepare(`
                INSERT INTO historial_estados_viaje (id_viajes, id_estado_anterior, id_estado_nuevo, observaciones)
                VALUES (?, NULL, 2, 'Viaje registrado en estado PENDIENTE')
            `).run(tripId);

            return tripId;
        });

        const createdTripId = createTripTransaction();
        const trip = db.prepare(`
            SELECT v.*, c.nombre as conductor_nombre, veh.nombre as vehiculo_nombre, veh.numero_economico,
                   l1.nombre as origen_nombre, l2.nombre as destino_nombre, ev.nombre as estado_nombre
            FROM viajes v
            JOIN conductores c ON v.id_conductores = c.id_conductores
            JOIN vehiculos veh ON v.id_vehiculos = veh.id_vehiculos
            JOIN lugares l1 ON v.id_origen = l1.id_lugares
            JOIN lugares l2 ON v.id_destino = l2.id_lugares
            JOIN estados_viaje ev ON v.id_estado_viaje = ev.id_estado_viaje
            WHERE v.id_viajes = ?
        `).get(createdTripId);

        // Enviar Notificación por Telegram si está configurado
        sendTelegramMessage(
            `🆕 *Nuevo Viaje Creado*\n\n` +
            `*Folio:* \`${trip.folio}\`\n` +
            `*Conductor:* ${trip.conductor_nombre}\n` +
            `*Vehículo:* ${trip.vehiculo_nombre} (${trip.numero_economico})\n` +
            `*Ruta:* ${trip.origen_nombre} ➔ ${trip.destino_nombre}\n` +
            `*Km Inicial:* ${trip.kilometraje_inicial} km\n` +
            `*Motivo:* ${trip.motivo}`
        );

        return res.status(201).json({
            success: true,
            message: `Viaje creado exitosamente con Folio: ${folio}`,
            data: trip
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al crear el viaje: ' + err.message });
    }
});

// POST /api/viajes/:idViaje/iniciar
router.post('/:idViaje/iniciar', (req, res) => {
    try {
        const idViaje = Number(req.params.idViaje);
        const trip = db.prepare('SELECT * FROM viajes WHERE id_viajes = ?').get(idViaje);

        if (!trip) {
            return res.status(404).json({ success: false, message: 'Viaje no encontrado' });
        }

        if (trip.id_estado_viaje !== 2 && trip.id_estado_viaje !== 1) {
            return res.status(400).json({ success: false, message: 'Solo se pueden iniciar viajes en estado PENDIENTE o BORRADOR.' });
        }

        const startTransaction = db.transaction(() => {
            db.prepare(`
                UPDATE viajes
                SET id_estado_viaje = 3, hora_salida = CURRENT_TIMESTAMP, actualizado_en = CURRENT_TIMESTAMP
                WHERE id_viajes = ?
            `).run(idViaje);

            db.prepare(`
                INSERT INTO historial_estados_viaje (id_viajes, id_estado_anterior, id_estado_nuevo, observaciones)
                VALUES (?, ?, 3, 'Viaje iniciado')
            `).run(idViaje, trip.id_estado_viaje);
        });

        startTransaction();

        const updatedTrip = db.prepare(`
            SELECT v.*, c.nombre as conductor_nombre, veh.nombre as vehiculo_nombre, veh.numero_economico,
                   l1.nombre as origen_nombre, l2.nombre as destino_nombre, ev.nombre as estado_nombre
            FROM viajes v
            JOIN conductores c ON v.id_conductores = c.id_conductores
            JOIN vehiculos veh ON v.id_vehiculos = veh.id_vehiculos
            JOIN lugares l1 ON v.id_origen = l1.id_lugares
            JOIN lugares l2 ON v.id_destino = l2.id_lugares
            JOIN estados_viaje ev ON v.id_estado_viaje = ev.id_estado_viaje
            WHERE v.id_viajes = ?
        `).get(idViaje);

        // Notificación Telegram
        sendTelegramMessage(
            `🚀 *Viaje Iniciado*\n\n` +
            `*Folio:* \`${updatedTrip.folio}\`\n` +
            `*Conductor:* ${updatedTrip.conductor_nombre}\n` +
            `*Vehículo:* ${updatedTrip.vehiculo_nombre} (${updatedTrip.numero_economico})\n` +
            `*Salida:* ${new Date(updatedTrip.hora_salida).toLocaleString('es-MX')}`
        );

        return res.json({
            success: true,
            message: 'Viaje iniciado exitosamente',
            data: updatedTrip
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al iniciar el viaje: ' + err.message });
    }
});

// POST /api/viajes/:idViaje/finalizar
router.post('/:idViaje/finalizar', (req, res) => {
    try {
        const idViaje = Number(req.params.idViaje);
        const { kilometraje_final } = req.body;

        if (kilometraje_final === undefined || kilometraje_final === null) {
            return res.status(400).json({ success: false, message: 'Se requiere el kilometraje final para concluir el viaje.' });
        }

        const trip = db.prepare('SELECT * FROM viajes WHERE id_viajes = ?').get(idViaje);
        if (!trip) {
            return res.status(404).json({ success: false, message: 'Viaje no encontrado' });
        }

        if (trip.id_estado_viaje !== 3) {
            return res.status(400).json({ success: false, message: 'Solo se pueden finalizar viajes que se encuentren EN_CURSO.' });
        }

        const kmFinalNum = Number(kilometraje_final);
        if (kmFinalNum < trip.kilometraje_inicial) {
            return res.status(400).json({
                success: false,
                message: `El kilometraje final (${kmFinalNum} km) no puede ser menor al kilometraje inicial (${trip.kilometraje_inicial} km).`
            });
        }

        const kmRecorridos = kmFinalNum - trip.kilometraje_inicial;

        const finishTransaction = db.transaction(() => {
            db.prepare(`
                UPDATE viajes
                SET id_estado_viaje = 5,
                    kilometraje_final = ?,
                    kilometros_recorridos = ?,
                    hora_llegada = CURRENT_TIMESTAMP,
                    actualizado_en = CURRENT_TIMESTAMP
                WHERE id_viajes = ?
            `).run(kmFinalNum, kmRecorridos, idViaje);

            db.prepare(`
                UPDATE vehiculos
                SET kilometraje_actual = MAX(kilometraje_actual, ?),
                    actualizado_en = CURRENT_TIMESTAMP
                WHERE id_vehiculos = ?
            `).run(kmFinalNum, trip.id_vehiculos);

            db.prepare(`
                INSERT INTO historial_estados_viaje (id_viajes, id_estado_anterior, id_estado_nuevo, observaciones)
                VALUES (?, 3, 5, ?)
            `).run(idViaje, `Viaje finalizado. Recorridos: ${kmRecorridos} km.`);
        });

        finishTransaction();

        const finishedTrip = db.prepare(`
            SELECT v.*, c.nombre as conductor_nombre, veh.nombre as vehiculo_nombre, veh.numero_economico,
                   l1.nombre as origen_nombre, l2.nombre as destino_nombre, ev.nombre as estado_nombre
            FROM viajes v
            JOIN conductores c ON v.id_conductores = c.id_conductores
            JOIN vehiculos veh ON v.id_vehiculos = veh.id_vehiculos
            JOIN lugares l1 ON v.id_origen = l1.id_lugares
            JOIN lugares l2 ON v.id_destino = l2.id_lugares
            JOIN estados_viaje ev ON v.id_estado_viaje = ev.id_estado_viaje
            WHERE v.id_viajes = ?
        `).get(idViaje);

        const lastLocation = db.prepare(`
            SELECT * FROM ubicaciones_viaje WHERE id_viajes = ? ORDER BY id_ubicaciones_viaje DESC LIMIT 1
        `).get(idViaje);

        finishedTrip.ultima_ubicacion = lastLocation || null;

        // Notificación Telegram
        sendTelegramMessage(
            `🏁 *Viaje Finalizado*\n\n` +
            `*Folio:* \`${finishedTrip.folio}\`\n` +
            `*Conductor:* ${finishedTrip.conductor_nombre}\n` +
            `*Km Recorridos:* ${finishedTrip.kilometros_recorridos} km\n` +
            `*Km Final:* ${finishedTrip.kilometraje_final} km\n` +
            `*Llegada:* ${new Date(finishedTrip.hora_llegada).toLocaleString('es-MX')}`
        );

        return res.json({
            success: true,
            message: 'Viaje finalizado correctamente',
            data: finishedTrip
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al finalizar el viaje: ' + err.message });
    }
});

// GET /api/viajes/activo
router.get('/activo', (req, res) => {
    try {
        const { id_conductores, telegram_user_id } = req.query;

        let driverId = id_conductores ? Number(id_conductores) : null;
        if (!driverId && telegram_user_id) {
            const userRecord = db.prepare('SELECT id_conductores FROM usuarios_telegram WHERE telegram_user_id = ?').get(Number(telegram_user_id));
            if (userRecord) {
                driverId = userRecord.id_conductores;
            }
        }

        if (!driverId) {
            return res.status(400).json({ success: false, message: 'Se requiere id_conductores o telegram_user_id' });
        }

        const activeTrip = db.prepare(`
            SELECT v.*, c.nombre as conductor_nombre, veh.nombre as vehiculo_nombre, veh.numero_economico, veh.placas,
                   l1.nombre as origen_nombre, l2.nombre as destino_nombre, ev.nombre as estado_nombre
            FROM viajes v
            JOIN conductores c ON v.id_conductores = c.id_conductores
            JOIN vehiculos veh ON v.id_vehiculos = veh.id_vehiculos
            JOIN lugares l1 ON v.id_origen = l1.id_lugares
            JOIN lugares l2 ON v.id_destino = l2.id_lugares
            JOIN estados_viaje ev ON v.id_estado_viaje = ev.id_estado_viaje
            WHERE v.id_conductores = ? AND v.id_estado_viaje IN (2, 3)
            ORDER BY v.id_viajes DESC LIMIT 1
        `).get(driverId);

        if (!activeTrip) {
            return res.json({ success: true, data: null });
        }

        const lastLocation = db.prepare(`
            SELECT * FROM ubicaciones_viaje WHERE id_viajes = ? ORDER BY id_ubicaciones_viaje DESC LIMIT 1
        `).get(activeTrip.id_viajes);

        activeTrip.ultima_ubicacion = lastLocation || null;

        return res.json({ success: true, data: activeTrip });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar viaje activo: ' + err.message });
    }
});

// GET /api/viajes/:idViaje
router.get('/:idViaje', (req, res) => {
    try {
        const idViaje = Number(req.params.idViaje);
        const trip = db.prepare(`
            SELECT v.*, c.nombre as conductor_nombre, c.licencia_numero, c.telefono as conductor_telefono,
                   veh.nombre as vehiculo_nombre, veh.numero_economico, veh.placas, veh.kilometraje_actual,
                   l1.nombre as origen_nombre, l1.direccion as origen_direccion,
                   l2.nombre as destino_nombre, l2.direccion as destino_direccion,
                   ev.nombre as estado_nombre
            FROM viajes v
            JOIN conductores c ON v.id_conductores = c.id_conductores
            JOIN vehiculos veh ON v.id_vehiculos = veh.id_vehiculos
            JOIN lugares l1 ON v.id_origen = l1.id_lugares
            JOIN lugares l2 ON v.id_destino = l2.id_lugares
            JOIN estados_viaje ev ON v.id_estado_viaje = ev.id_estado_viaje
            WHERE v.id_viajes = ?
        `).get(idViaje);

        if (!trip) {
            return res.status(404).json({ success: false, message: 'Viaje no encontrado' });
        }

        const lastLocation = db.prepare(`
            SELECT * FROM ubicaciones_viaje WHERE id_viajes = ? ORDER BY id_ubicaciones_viaje DESC LIMIT 1
        `).get(idViaje);

        trip.ultima_ubicacion = lastLocation || null;

        return res.json({ success: true, data: trip });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar detalle del viaje: ' + err.message });
    }
});

// POST /api/viajes/:idViaje/ubicaciones
router.post('/:idViaje/ubicaciones', (req, res) => {
    try {
        const idViaje = Number(req.params.idViaje);
        const { latitud, longitud, precision_metros, velocidad, direccion, fecha_gps } = req.body;

        if (latitud === undefined || longitud === undefined) {
            return res.status(400).json({ success: false, message: 'Latitud y Longitud son campos obligatorios.' });
        }

        const lat = Number(latitud);
        const lng = Number(longitud);

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ success: false, message: 'Coordenadas fuera de rango válido (-90..90, -180..180).' });
        }

        const trip = db.prepare('SELECT id_estado_viaje FROM viajes WHERE id_viajes = ?').get(idViaje);
        if (!trip) {
            return res.status(404).json({ success: false, message: 'Viaje no encontrado' });
        }

        const gpsDate = fecha_gps ? new Date(fecha_gps).toISOString() : new Date().toISOString();

        const insertGpsTransaction = db.transaction(() => {
            const insertStmt = db.prepare(`
                INSERT INTO ubicaciones_viaje (id_viajes, latitud, longitud, precision_metros, velocidad, direccion, fecha_gps, creado_en)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            insertStmt.run(
                idViaje,
                lat,
                lng,
                precision_metros !== undefined && precision_metros !== null ? Number(precision_metros) : null,
                velocidad !== undefined && velocidad !== null ? Number(velocidad) : null,
                direccion !== undefined && direccion !== null ? Number(direccion) : null,
                gpsDate
            );
        });

        insertGpsTransaction();

        return res.json({ success: true, message: 'Ubicación GPS registrada correctamente' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al registrar ubicación GPS: ' + err.message });
    }
});

module.exports = router;
