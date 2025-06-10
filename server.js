const express = require('express');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const multer = require('multer');
const { getPool: getPoolPlanilla } = require('./config/dbPlanilla');
const { getPool: getPoolPermisos } = require('./config/dbconfig');
const { getPool: getPoolVacaciones } = require('./config/dbVacaciones');
const { getPool: getPoolPerfil } = require('./config/dbperfil');
const app = express();

// Configuración de multer para firmas
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB máximo
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PNG o JPG'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Evitar error 404 para favicon.ico
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Middleware para JWT
app.use((req, res, next) => {
  const token = req.cookies.jwt || req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No se proporcionó token' });
  }
  try {
    const decoded = jwt.verify(token, 'your_jwt_secret');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
});

// Ruta para subir firma
app.post('/upload-signature', upload.single('signature'), async (req, res) => {
  try {
    const file = req.file;
    const dni = req.user.id;

    if (!file) {
      return res.status(400).json({ error: 'No se seleccionó ninguna imagen' });
    }

    const poolPermisos = app.locals.poolPermisos;
    const query = `
      MERGE INTO [Permisos].[dbo].[Firmas] AS target
      USING (SELECT @id_empleado AS id_empleado) AS source
      ON target.id_empleado = source.id_empleado
      WHEN MATCHED THEN
        UPDATE SET
          nombre_archivo = @nombre_archivo,
          datos_archivo = @datos_archivo,
          tipo_archivo = @tipo_archivo,
          fecha_subida = @fecha_subida,
          subido_por = @subido_por
      WHEN NOT MATCHED THEN
        INSERT (id_empleado, nombre_archivo, datos_archivo, tipo_archivo, fecha_subida, subido_por)
        VALUES (@id_empleado, @nombre_archivo, @datos_archivo, @tipo_archivo, @fecha_subida, @subido_por);
    `;

    await poolPermisos.request()
      .input('id_empleado', sql.VarChar(50), dni)
      .input('nombre_archivo', sql.VarChar(255), file.originalname)
      .input('datos_archivo', sql.VarBinary(sql.MAX), file.buffer)
      .input('tipo_archivo', sql.VarChar(100), file.mimetype)
      .input('fecha_subida', sql.DateTime, new Date())
      .input('subido_por', sql.VarChar(50), dni)
      .query(query);

    res.json({ success: true, message: 'Firma guardada correctamente' });
  } catch (error) {
    console.error('Error al subir firma:', error);
    res.status(500).json({ error: 'Error al guardar la firma' });
  }
});

// Ruta para obtener firma
app.get('/signature', async (req, res) => {
  try {
    const dni = req.user.id;
    const poolPermisos = app.locals.poolPermisos;
    const result = await poolPermisos.request()
      .input('id_empleado', sql.VarChar(50), dni)
      .query('SELECT datos_archivo, tipo_archivo FROM [Permisos].[dbo].[Firmas] WHERE id_empleado = @id_empleado');

    if (!result.recordset.length) {
      return res.status(404).send('Firma no encontrada');
    }

    const { datos_archivo, tipo_archivo } = result.recordset[0];
    res.set('Content-Type', tipo_archivo);
    res.send(datos_archivo);
  } catch (error) {
    console.error('Error al obtener firma:', error);
    res.status(500).json({ error: 'Error al obtener la firma' });
  }
});

// Ruta para generar PDF
app.post('/generate-pdf', async (req, res) => {
  try {
    const solicitud = req.body;
    const dni = req.user.id;

    // Validar solicitud
    if (!solicitud.id || !solicitud.nombre) {
      return res.status(400).json({ error: 'Datos de solicitud incompletos' });
    }

    // Obtener firma
    const poolPermisos = app.locals.poolPermisos;
    const firmaResult = await poolPermisos.request()
      .input('id_empleado', sql.VarChar(50), dni)
      .query('SELECT datos_archivo, tipo_archivo FROM [Permisos].[dbo].[Firmas] WHERE id_empleado = @id_empleado');

    if (!firmaResult.recordset.length) {
      return res.status(404).json({ error: 'Firma no encontrada para este usuario' });
    }

    const { datos_archivo, tipo_archivo } = firmaResult.recordset[0];

    // Cargar PDF base
    const pdfPath = path.join(__dirname, 'templates/solicitud-vacaciones.pdf');
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Obtener primera página
    const page = pdfDoc.getPages()[0];
    const { width } = page.getSize();

    // Incrustar firma
    let firmaImage;
    if (tipo_archivo === 'image/png') {
      firmaImage = await pdfDoc.embedPng(datos_archivo);
    } else if (tipo_archivo === 'image/jpeg') {
      firmaImage = await pdfDoc.embedJpg(datos_archivo);
    } else {
      throw new Error('Formato de firma no soportado');
    }

    page.drawImage(firmaImage, {
      x: width - 200,
      y: 50,
      width: 150,
      height: 50
    });

    // Rellenar formulario
    const form = pdfDoc.getForm();
    const fields = {
      fecha_solicitud: solicitud.fecha_solicitud ? new Date(solicitud.fecha_solicitud).toLocaleDateString('es-ES') : '',
      nombre: solicitud.nombre || '',
      area_solicitante: solicitud.area_solicitante || '',
      tipo_permiso: solicitud.tipo_permiso || 'Vacaciones',
      fecha_inicio: solicitud.fecha_inicio ? new Date(solicitud.fecha_inicio).toLocaleDateString('es-ES') : '',
      fecha_fin: solicitud.fecha_fin ? new Date(solicitud.fecha_fin).toLocaleDateString('es-ES') : '',
      fecha_reincorporacion: solicitud.fecha_reincorporacion ? new Date(solicitud.fecha_reincorporacion).toLocaleDateString('es-ES') : '',
      total_dias: solicitud.horas_solicitadas ? `${solicitud.horas_solicitadas} horas` : `${solicitud.total_dias || 0} días`,
      anio: solicitud.anio || '',
      observaciones: solicitud.observaciones || '',
      motivo: solicitud.motivo || ''
    };

    Object.entries(fields).forEach(([name, value]) => {
      try {
        const field = form.getTextField(name);
        field.setText(value);
      } catch (e) {
        console.warn(`Campo ${name} no encontrado en el PDF`);
      }
    });

    // Guardar y enviar PDF
    const pdfBytes = await pdfDoc.save();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Solicitud_${solicitud.tipo_permiso}_${solicitud.id}.pdf`
    });
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error al generar PDF:', error);
    res.status(500).json({ error: `No se pudo generar el PDF: ${error.message}` });
  }
});

// Iniciar servidor
async function startServer(app, port = 3000) {
  try {
    const poolPlanilla = await getPoolPlanilla();
    const poolPermisos = await getPoolPermisos();
    const poolVacaciones = await getPoolVacaciones();
    const poolPerfil = await getPoolPerfil();
    app.locals.poolPlanilla = poolPlanilla;
    app.locals.poolPermisos = poolPermisos;
    app.locals.poolVacaciones = poolVacaciones;
    app.locals.poolPerfil = poolPerfil;
    app.listen(port, () => {
      console.log(`Servidor iniciado en http://solicitudes.consucoop.local:${port}`);
    });
  } catch (err) {
    console.error('Error al iniciar el servidor:', err);
    setTimeout(() => startServer(app, port), 5000);
  }
}

module.exports = { startServer };