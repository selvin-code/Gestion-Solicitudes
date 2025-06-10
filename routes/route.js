
const express = require('express');
const router = express.Router();
const controller = require('../controllers/solicitudController');
const { verificarCookie, protegerRuta } = require('../middleware/auth');
const { cargarDatosPuestoYUsuarios } = require('../middleware/dataLoader');
const multer = require('multer');
const sql = require('mssql');
const { getPool } = require('../config/dbconfig');

// Configuración de Multer para manejar archivos en memoria
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 2 * 1024 * 1024 // Límite de 2MB por archivo (alineado con server.js)
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true); // Aceptar archivo
        } else {
            cb(new Error('Tipo de archivo no permitido. Solo se aceptan .pdf, .jpg y .png'), false);
        }
    }
});

// Configuración de Multer específica para firmas (solo imágenes, 2MB)
const uploadSignature = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 2 * 1024 * 1024 // Límite de 2MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true); // Aceptar archivo
        } else {
            cb(new Error('Solo se permiten archivos .jpg y .png para firmas'), false);
        }
    }
});

// Ruta para verificar si el usuario tiene firma
router.get('/check-signature', verificarCookie, protegerRuta, controller.checkSignature);

// Ruta principal
router.get('/', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.getIndex(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para obtener días disponibles
router.get('/dias-disponibles', verificarCookie, protegerRuta, controller.getDiasDisponibles);

// Ruta para crear solicitud (POST) con soporte para adjuntos
router.post('/solicitud', 
    verificarCookie, 
    protegerRuta, 
    upload.array('adjuntos', 10), // Permite hasta 10 archivos en el campo 'adjuntos'
    cargarDatosPuestoYUsuarios, 
    (req, res) => {
        const { puesto, usuarios } = res.locals;
        controller.createSolicitud(req, res, { 
            puesto, 
            usuarios, 
            usuario: req.usuario?.nombre || 'Usuario' 
        });
    }
);

// Ruta para subir la firma
router.post('/upload-signature', 
    verificarCookie, 
    protegerRuta, 
    uploadSignature.single('signature'), // Campo 'signature' para la imagen
    cargarDatosPuestoYUsuarios, 
    (req, res) => {
        const { puesto, usuarios } = res.locals;
        controller.uploadSignature(req, res, { 
            puesto, 
            usuarios, 
            usuario: req.usuario?.nombre || 'Usuario' 
        });
    }
);

// Ruta para obtener la firma
router.get('/signature', verificarCookie, protegerRuta, controller.getSignature);

// Ruta para generar PDF
router.post('/generate-pdf', 
    verificarCookie, 
    protegerRuta, 
    cargarDatosPuestoYUsuarios, 
    (req, res) => {
        const { puesto, usuarios } = res.locals;
        controller.generatePDF(req, res, { 
            puesto, 
            usuarios, 
            usuario: req.usuario?.nombre || 'Usuario' 
        });
    }
);

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
router.get('/aprobacion', verificarCookie, protegerRuta, controller.checkJefeStatus, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.getAprobacion(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para obtener solicitud por ID
router.get('/solicitud/:id', verificarCookie, protegerRuta, controller.getSolicitud);

// Ruta para aprobación (POST)
router.post('/aprobacion', verificarCookie, protegerRuta, controller.checkJefeStatus, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.updateSolicitud(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para exportar datos de aprobación
router.get('/export-aprobacion', verificarCookie, protegerRuta, controller.checkJefeStatus, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.exportAprobacion(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para aprobación RH (GET)
router.get('/aprobacion-RH', verificarCookie, protegerRuta, controller.checkRRHHJefeStatus, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.getAprobacionRH(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para aprobación RH (POST)
router.post('/aprobacion-RH', verificarCookie, protegerRuta, controller.checkRRHHJefeStatus, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.updateSolicitudRH(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para exportar datos de aprobación RH
router.get('/export-aprobacion-RH', verificarCookie, protegerRuta, controller.checkRRHHJefeStatus, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.exportAprobacionRH(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para reportes RH (GET)
router.get('/reportes-RH', verificarCookie, protegerRuta, controller.checkRRHHJefeStatus, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.getReportesRH(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para reporte RH (GET)
router.get('/reporte-RH', verificarCookie, protegerRuta, controller.checkRRHHJefeStatus, cargarDatosPuestoYUsuarios, (req, res) => {
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

// Ruta para mantenimiento de jefes (GET)
router.get('/mantenimiento-jefes', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.getMantenimientoJefes(req, res, { 
        puesto, 
        usuarios, 
        usuario: req.usuario?.nombre || 'Usuario' 
    });
});

// Ruta para obtener lista de jefes
router.get('/jefes', verificarCookie, protegerRuta, controller.getJefes);

// Ruta para agregar un nuevo jefe
router.post('/add-jefe', verificarCookie, protegerRuta, controller.addJefe);

// Ruta para actualizar un jefe
router.put('/update-jefe', verificarCookie, protegerRuta, controller.updateJefe);

// Ruta para cambiar el estado de un jefe (activo/inactivo)
router.post('/toggle-jefe-status', verificarCookie, protegerRuta, controller.toggleJefeStatus);

// Ruta para buscar empleados
router.get('/empleados/buscar', verificarCookie, protegerRuta, controller.buscarEmpleados);

// Ruta para obtener áreas disponibles
router.get('/areas', verificarCookie, protegerRuta, controller.getAreas);

// Ruta para agregar una nueva área
router.post('/add-area', verificarCookie, protegerRuta, controller.addArea);

// Ruta para obtener un jefe por ID
router.get('/jefe/:id', verificarCookie, protegerRuta, controller.getJefeById);

// Ruta para obtener el nombre del empleado por ID
router.get('/get-nombre-empleado/:id_empleado', verificarCookie, protegerRuta, controller.getNombreEmpleado);

// Ruta para exportar jefes
router.get('/export-jefes', verificarCookie, protegerRuta, cargarDatosPuestoYUsuarios, (req, res) => {
    const { puesto, usuarios } = res.locals;
    controller.exportJefes(req, res, { 
        puesto, 
        usuarios, 
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

// Ruta para descargar/visualizar adjuntos
router.get('/adjunto/:id', verificarCookie, protegerRuta, async (req, res) => {
    try {
        const pool = await getPool();
        const request = pool.request();
        const result = await request
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT nombre_archivo, datos_archivo, tipo_archivo
                FROM [Permisos].[dbo].[adjuntos_solicitud]
                WHERE id = @id
            `);
        request.cancel();

        if (!result.recordset[0]) {
            return res.status(404).json({ success: false, error: 'Adjunto no encontrado' });
        }

        const { nombre_archivo, datos_archivo, tipo_archivo } = result.recordset[0];
        res.setHeader('Content-Type', tipo_archivo);
        res.setHeader('Content-Disposition', `attachment; filename="${nombre_archivo}"`);
        res.send(datos_archivo);
    } catch (error) {
        console.error('Error al obtener adjunto:', error);
        res.status(500).json({ error: `Error al obtener el adjunto: ${error.message}` });
    }
});

module.exports = router;
