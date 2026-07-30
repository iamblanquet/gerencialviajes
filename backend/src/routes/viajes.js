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

        const driver = db.prepare('SELECT * FROM conductores WHERE id_conductores = ? AND activo = 1').get(Number(id_conductores));
        if (!driver) {
            return res.status(400).json({ success: false, message: 'El conductor seleccionado no existe o está inactivo.' });
        }

        const hoy = new Date().toISOString().split('T')[0];
        const licenciaVigente = driver.licencia_vencimiento && driver.licencia_vencimiento >= hoy ? 1 : 0;
        if (!licenciaVigente) {
            return res.status(400).json({ success: false, message: 'La licencia del conductor está vencida. No se puede crear el viaje.' });
        }

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

        if (Number(id_origen) === Number(id_destino)) {
            return res.status(400).json({ success: false, message: 'El lugar de origen debe ser distinto al lugar de destino.' });
        }

        const origin = db.prepare('SELECT * FROM lugares WHERE id_lugares = ? AND activo = 1').get(Number(id_origen));
        const destination = db.prepare('SELECT * FROM lugares WHERE id_lugares = ? AND activo = 1').get(Number(id_destino));
        if (!origin || !destination) {
            return res.status(400).json({ success: false, message: 'El origen o destino seleccionado no es válido o está inactivo.' });
        }

        let acompArr = [];
        if (Array.isArray(acompanantes)) {
            acompArr = acompanantes.map(a => String(a).trim()).filter(Boolean);
        } else if (typeof acompanantes === 'string' && acompanantes.trim() !== '') {
            acompArr = acompanantes.split(',').map(a => a.trim()).filter(Boolean);
        }
        const acompJson = JSON.stringify(acompArr);

        const folio = generarFolioDiario();

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

        const activeStop = db.prepare(`
            SELECT * FROM paradas_viaje WHERE id_viajes = ? AND hora_fin IS NULL ORDER BY id_paradas_viaje DESC LIMIT 1
        `).get(activeTrip.id_viajes);

        activeTrip.ultima_ubicacion = lastLocation || null;
        activeTrip.parada_activa = activeStop || null;

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

        const stops = db.prepare(`
            SELECT * FROM paradas_viaje WHERE id_viajes = ? ORDER BY id_paradas_viaje DESC
        `).all(idViaje);

        trip.ultima_ubicacion = lastLocation || null;
        trip.paradas = stops || [];

        return res.json({ success: true, data: trip });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar detalle del viaje: ' + err.message });
    }
});

// POST /api/viajes/:idViaje/ubicaciones - Registrar ubicación GPS (Soporta individual y Lote/Offline Sync)
router.post('/:idViaje/ubicaciones', (req, res) => {
    try {
        const idViaje = Number(req.params.idViaje);
        const body = req.body;

        const points = Array.isArray(body) ? body : [body];

        if (!points.length) {
            return res.status(400).json({ success: false, message: 'No se enviaron datos de ubicación.' });
        }

        const insertStmt = db.prepare(`
            INSERT INTO ubicaciones_viaje (id_viajes, latitud, longitud, precision_metros, velocidad, direccion, fecha_gps, creado_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        const insertGpsBatchTransaction = db.transaction((locations) => {
            for (const item of locations) {
                const lat = Number(item.latitud);
                const lng = Number(item.longitud);

                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    const gpsDate = item.fecha_gps ? new Date(item.fecha_gps).toISOString() : new Date().toISOString();
                    insertStmt.run(
                        idViaje,
                        lat,
                        lng,
                        item.precision_metros !== undefined && item.precision_metros !== null ? Number(item.precision_metros) : null,
                        item.velocidad !== undefined && item.velocidad !== null ? Number(item.velocidad) : null,
                        item.direccion !== undefined && item.direccion !== null ? Number(item.direccion) : null,
                        gpsDate
                    );
                }
            }
        });

        insertGpsBatchTransaction(points);

        return res.json({
            success: true,
            message: `Registradas ${points.length} ubicación(es) GPS correctamente.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al registrar ubicaciones GPS: ' + err.message });
    }
});

// ----------------------------------------------------
// RUTAS DE GESTIÓN DE PARADAS (paradas_viaje)
// ----------------------------------------------------

// POST /api/viajes/:idViaje/paradas - Registrar Inicio de Parada
router.post('/:idViaje/paradas', (req, res) => {
    try {
        const idViaje = Number(req.params.idViaje);
        const { motivo_parada, latitud, longitud, observaciones } = req.body;

        if (!motivo_parada || !motivo_parada.trim()) {
            return res.status(400).json({ success: false, message: 'El motivo de la parada es obligatorio.' });
        }

        const trip = db.prepare(`
            SELECT v.*, c.nombre as conductor_nombre, veh.nombre as vehiculo_nombre, veh.numero_economico
            FROM viajes v
            JOIN conductores c ON v.id_conductores = c.id_conductores
            JOIN vehiculos veh ON v.id_vehiculos = veh.id_vehiculos
            WHERE v.id_viajes = ?
        `).get(idViaje);

        if (!trip) {
            return res.status(404).json({ success: false, message: 'Viaje no encontrado' });
        }

        const activeStop = db.prepare('SELECT id_paradas_viaje FROM paradas_viaje WHERE id_viajes = ? AND hora_fin IS NULL').get(idViaje);
        if (activeStop) {
            return res.status(400).json({ success: false, message: 'Ya existe una parada activa en este viaje. Debe finalizarla antes de iniciar otra.' });
        }

        const lat = latitud !== undefined && latitud !== null ? Number(latitud) : null;
        const lng = longitud !== undefined && longitud !== null ? Number(longitud) : null;

        const createStopTransaction = db.transaction(() => {
            const insertStmt = db.prepare(`
                INSERT INTO paradas_viaje (id_viajes, motivo_parada, latitud, longitud, hora_inicio, observaciones)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            `);
            const result = insertStmt.run(idViaje, motivo_parada.trim(), lat, lng, observaciones ? observaciones.trim() : null);

            // Opcional: Actualizar estado de viaje a PAUSADO
            db.prepare('UPDATE viajes SET id_estado_viaje = 4, actualizado_en = CURRENT_TIMESTAMP WHERE id_viajes = ?').run(idViaje);

            return result.lastInsertRowid;
        });

        const stopId = createStopTransaction();
        const createdStop = db.prepare('SELECT * FROM paradas_viaje WHERE id_paradas_viaje = ?').get(stopId);

        // Notificación Telegram
        sendTelegramMessage(
            `🛑 *Parada Registrada en Viaje*\n\n` +
            `*Folio:* \`${trip.folio}\`\n` +
            `*Conductor:* ${trip.conductor_nombre}\n` +
            `*Motivo de Parada:* ${motivo_parada.trim()}\n` +
            `*Hora de Inicio:* ${new Date(createdStop.hora_inicio).toLocaleString('es-MX')}`
        );

        return res.status(201).json({
            success: true,
            message: 'Parada registrada correctamente',
            data: createdStop
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al registrar parada: ' + err.message });
    }
});

// POST /api/viajes/:idViaje/paradas/:idParada/finalizar - Finalizar Parada / Reanudar Viaje
router.post('/:idViaje/paradas/:idParada/finalizar', (req, res) => {
    try {
        const idViaje = Number(req.params.idViaje);
        const idParada = Number(req.params.idParada);

        const stop = db.prepare('SELECT * FROM paradas_viaje WHERE id_paradas_viaje = ? AND id_viajes = ?').get(idParada, idViaje);
        if (!stop) {
            return res.status(404).json({ success: false, message: 'Parada no encontrada para este viaje' });
        }

        if (stop.hora_fin) {
            return res.status(400).json({ success: false, message: 'Esta parada ya ha sido finalizada anteriormente.' });
        }

        const trip = db.prepare(`
            SELECT v.*, c.nombre as conductor_nombre 
            FROM viajes v JOIN conductores c ON v.id_conductores = c.id_conductores 
            WHERE v.id_viajes = ?
        `).get(idViaje);

        const finishStopTransaction = db.transaction(() => {
            db.prepare(`
                UPDATE paradas_viaje
                SET hora_fin = CURRENT_TIMESTAMP,
                    duracion_minutos = CAST((julianday(CURRENT_TIMESTAMP) - julianday(hora_inicio)) * 24 * 60 AS INTEGER)
                WHERE id_paradas_viaje = ?
            `).run(idParada);

            // Reanudar Estado de Viaje a EN_CURSO
            db.prepare('UPDATE viajes SET id_estado_viaje = 3, actualizado_en = CURRENT_TIMESTAMP WHERE id_viajes = ?').run(idViaje);
        });

        finishStopTransaction();

        const updatedStop = db.prepare('SELECT * FROM paradas_viaje WHERE id_paradas_viaje = ?').get(idParada);

        sendTelegramMessage(
            `▶️ *Viaje Reanudado / Parada Concluida*\n\n` +
            `*Folio:* \`${trip ? trip.folio : ''}\`\n` +
            `*Conductor:* ${trip ? trip.conductor_nombre : ''}\n` +
            `*Motivo Parada:* ${updatedStop.motivo_parada}\n` +
            `*Duración:* ${updatedStop.duracion_minutos !== null ? updatedStop.duracion_minutos + ' minutos' : '1 min'}`
        );

        return res.json({
            success: true,
            message: 'Parada finalizada y viaje reanudado correctamente',
            data: updatedStop
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al finalizar parada: ' + err.message });
    }
});

// GET /api/viajes/:idViaje/paradas - Consultar Paradas del Viaje
router.get('/:idViaje/paradas', (req, res) => {
    try {
        const idViaje = Number(req.params.idViaje);
        const stops = db.prepare('SELECT * FROM paradas_viaje WHERE id_viajes = ? ORDER BY id_paradas_viaje DESC').all(idViaje);
        return res.json({ success: true, data: stops });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al obtener paradas: ' + err.message });
    }
});

module.exports = router;
