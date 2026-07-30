-- Insertar Catálogo de Estados de Viaje
INSERT OR IGNORE INTO estados_viaje (id_estado_viaje, nombre, descripcion) VALUES
(1, 'BORRADOR', 'Viaje borrador en proceso de captura'),
(2, 'PENDIENTE', 'Viaje creado y pendiente por iniciar'),
(3, 'EN_CURSO', 'Viaje iniciado y en movimiento'),
(4, 'PAUSADO', 'Viaje pausado temporalmente'),
(5, 'FINALIZADO', 'Viaje concluido satisfactoriamente'),
(6, 'CANCELADO', 'Viaje cancelado antes o durante su ejecución');

-- Insertar Conductor Administrador
INSERT OR IGNORE INTO conductores (id_conductores, nombre, licencia_numero, licencia_vigente, licencia_vencimiento, telefono, activo) VALUES
(1, 'Conductor Administrador', 'LIC-ADM-2030', 1, '2030-12-31', '+52 981 123 4567', 1);

-- Insertar Vehículos de Flotilla
INSERT OR IGNORE INTO vehiculos (id_vehiculos, nombre, numero_economico, placas, kilometraje_actual, activo) VALUES
(1, 'Toyota Hilux 4x4', 'AQR-01', 'YZA-101-A', 150000, 1),
(2, 'Mitsubishi L300 Van', 'AQR-02', 'YZA-102-B', 98000, 1);

-- Insertar Lugares Autorizados
INSERT OR IGNORE INTO lugares (id_lugares, nombre, direccion, latitud, longitud, activo) VALUES
(1, 'Base Perú', 'Av. Perú S/N, Col. Centro, Campeche', 19.8456120, -90.5312300, 1),
(2, 'Casa Uayamón', 'Hacienda Uayamón, Carretera Uayamón Km 12', 19.6891200, -90.4123500, 1),
(3, 'Oficinas Centrales', 'Calle 12 #45, Zona Industrial', 19.8123400, -90.5234100, 1);

-- Insertar Usuario Telegram inicial vinculado al Conductor Administrador
INSERT OR IGNORE INTO usuarios_telegram (id_usuario_telegram, telegram_user_id, telegram_username, telegram_first_name, telegram_last_name, id_conductores, rol, estado_registro, activo) VALUES
(1, 999999999, 'admin_conductor', 'Admin', 'Conductor', 1, 'ADMINISTRADOR', 'COMPLETO', 1);
