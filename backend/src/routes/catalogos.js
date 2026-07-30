const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/catalogos/conductores
router.get('/conductores', (req, res) => {
    try {
        const drivers = db.prepare(`
            SELECT id_conductores, nombre, licencia_numero, licencia_vigente, licencia_vencimiento, telefono, activo 
            FROM conductores 
            WHERE activo = 1 
            ORDER BY nombre ASC
        `).all();
        return res.json({ success: true, data: drivers });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar catálogo de conductores: ' + err.message });
    }
});

// GET /api/catalogos/vehiculos
router.get('/vehiculos', (req, res) => {
    try {
        const vehicles = db.prepare(`
            SELECT id_vehiculos, nombre, numero_economico, placas, kilometraje_actual, activo 
            FROM vehiculos 
            WHERE activo = 1 
            ORDER BY numero_economico ASC
        `).all();
        return res.json({ success: true, data: vehicles });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar catálogo de vehículos: ' + err.message });
    }
});

// GET /api/catalogos/lugares
router.get('/lugares', (req, res) => {
    try {
        const locations = db.prepare(`
            SELECT id_lugares, nombre, direccion, latitud, longitud, activo 
            FROM lugares 
            WHERE activo = 1 
            ORDER BY nombre ASC
        `).all();
        return res.json({ success: true, data: locations });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar catálogo de lugares: ' + err.message });
    }
});

// GET /api/catalogos/estados-viaje
router.get('/estados-viaje', (req, res) => {
    try {
        const states = db.prepare(`
            SELECT id_estado_viaje, nombre, descripcion, activo 
            FROM estados_viaje 
            WHERE activo = 1 
            ORDER BY id_estado_viaje ASC
        `).all();
        return res.json({ success: true, data: states });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error al consultar catálogo de estados de viaje: ' + err.message });
    }
});

module.exports = router;
