const express = require('express');
const router = express.Router();
const controller = require('../controllers/solicitudController');
const { verificarCookie, protegerRuta } = require('../middleware/auth');
const { cargarDatosPuestoYUsuarios } = require('../middleware/dataLoader');

// Ruta principal
router.get('/', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.getIndex(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para crear solicitud (POST)
router.post('/solicitud', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.createSolicitud(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para exportar datos (índice)
router.get('/export-index', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.exportIndex(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para aprobación (GET)
router.get('/aprobacion', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.getAprobacion(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para aprobación (POST)
router.post('/aprobacion', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.updateSolicitud(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para exportar datos de aprobación
router.get('/export-aprobacion', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.exportAprobacion(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para aprobación RH (GET)
router.get('/aprobacion-RH', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.getAprobacionRH(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para aprobación RH (POST)
router.post('/aprobacion-RH', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.updateSolicitudRH(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para exportar datos de aprobación RH
router.get('/export-aprobacion-RH', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.exportAprobacionRH(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para reporte RH (GET)
router.get('/reporte-RH', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.getReporteRH(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para gestión de permisos
router.get('/permisos', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    res.render('permisos', { 
        puesto,
        usuarios,
        NombrePersona: puesto?.NombrePersona || req.usuario?.nombre || 'Usuario',
        unidad: puesto?.unidad || req.usuario?.unidad || 'Sin unidad asignada',
        usuario: req.usuario?.nombre || 'Usuario'
    });
});

// Ruta para gestión de vehículos
router.get('/vehiculos', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    res.render('vehiculos', { 
        puesto,
        usuarios,
        NombrePersona: puesto?.NombrePersona || req.usuario?.nombre || 'Usuario',
        unidad: puesto?.unidad || req.usuario?.unidad || 'Sin unidad asignada',
        usuario: req.usuario?.nombre || 'Usuario'
    });
});

module.exports = router;