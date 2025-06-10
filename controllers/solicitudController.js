const sql = require('mssql');
const { getPool: getPoolPlanilla } = require('../config/dbPlanilla');
const { getPool: getPoolPermisos } = require('../config/dbconfig');
const { getPool: getPoolVacaciones } = require('../config/dbVacaciones');
const { getPool: getPoolportal } = require('../config/dbportalcn');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const {
  sendNewRequestEmail,
  sendSupervisorApprovedEmail,
  sendRequestRejectedEmail,
  sendRequestFullyApprovedEmail,
} = require('../config/mailer');
const { calcularDiasLaborables, calcularFechaReincorporacion } = require('../utils/dateUtils');
const { exportarSolicitudesExcel } = require('../utils/excelUtils');
const {
  obtenerSolicitudesPorUsuario,
  crearSolicitud, 
  obtenerSolicitudPorId,
} = require('../services/permisosService');
const { obtenerDiasDisponibles, actualizarVacaciones } = require('../services/vacacionesService');
const getNombreEmpleado = async (req, res) => {
  try {
    const { id_empleado } = req.params;

    if (!id_empleado) {
      return res.status(400).json({ success: false, error: 'ID de empleado es requerido' });
    }

    const pool = await getPoolPlanilla();
    const request = pool.request();
    const result = await request
      .input('dni', sql.VarChar, id_empleado)
      .query(`
        SELECT NombrePersona, ApellidoPersona
        FROM [Planilla].[dbo].[Puesto]
        WHERE DNI = @dni
      `);
    request.cancel(); // Liberar la solicitud

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Empleado no encontrado' });
    }

    const nombreCompleto = `${result.recordset[0].NombrePersona} ${result.recordset[0].ApellidoPersona}`;
    res.json({ success: true, data: { nombre: nombreCompleto } });
  } catch (error) {
    console.error('Error en getNombreEmpleado:', error);
    res.status(500).json({ success: false, error: `Error al obtener el nombre del empleado: ${error.message}` });
  }
};
const controller = {
  getIndex: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      if (!req.usuario?.id) {
        throw new Error('No se proporcionó un identificador de usuario');
      }

      const puestoResult = await (await getPoolPlanilla())
        .request()
        .input('dni', sql.VarChar, req.usuario.id)
        .query(
          'SELECT ID, NombrePersona, ApellidoPersona FROM [Planilla].[dbo].[Puesto] WHERE DNI = @dni'
        );

      if (!puestoResult.recordset[0]) {
        throw new Error('Usuario no encontrado en la base de datos de planilla');
      }
      const usuario_id = puestoResult.recordset[0].ID;
      const nombreCompleto = `${puestoResult.recordset[0].NombrePersona} ${puestoResult.recordset[0].ApellidoPersona}`;

      const solicitudes = await obtenerSolicitudesPorUsuario(usuario_id);

      const diasDisponibles = await obtenerDiasDisponibles(req.usuario.id);

      console.log(`Resultado crudo de vacaciones para ${req.usuario.id}: ${JSON.stringify(diasDisponibles)}`);

      res.render('index', {
        puesto: {
          NombrePersona: nombreCompleto,
          unidad: req.usuario?.unidad || 'Área no disponible',
        },
        solicitudes,
        diasDisponibles,
        usuario: req.usuario?.usuario || 'ECRUZ',
        error: null,
      });
    } catch (error) {
      console.error('Error en getIndex:', error);
      res.render('index', {
        puesto: { NombrePersona: 'Nombre no disponible', unidad: 'Área no disponible' },
        solicitudes: [],
        diasDisponibles: { total: 0, anos: [] },
        usuario: req.usuario?.usuario || 'ECRUZ',
        error: `Error al cargar las solicitudes: ${error.message}`,
      });
    }
  },
generatePDF: async (req, res, { puesto, usuarios, usuario }) => {
  try {
    const solicitud = req.body;
    const id_empleado = req.usuario?.id;

    // Validar datos de entrada
    if (!solicitud.id || !solicitud.nombre || !id_empleado || !solicitud.area_solicitante) {
      console.error('Datos incompletos:', { id_solicitud: solicitud.id, id_empleado, nombre: solicitud.nombre, area_solicitante: solicitud.area_solicitante });
      return res.status(400).json({ success: false, error: 'Datos de solicitud o usuario incompletos' });
    }

    console.log(`Generando PDF para solicitud ID: ${solicitud.id}, empleado: ${id_empleado}, área: ${solicitud.area_solicitante}`);

    const poolPermisos = await getPoolPermisos();

    // 1. Obtener firma del empleado
    const firmaEmpleadoResult = await poolPermisos.request()
      .input('id_empleado', sql.VarChar(50), id_empleado)
      .query(`
        SELECT datos_archivo, tipo_archivo
        FROM [Permisos].[dbo].[Firmas]
        WHERE TRIM(id_empleado) = TRIM(@id_empleado)
      `);

    if (!firmaEmpleadoResult.recordset.length) {
      console.error('No se encontró firma para el empleado:', id_empleado);
      return res.status(404).json({ success: false, error: 'Firma no encontrada para este usuario' });
    }

    const { datos_archivo: datosFirmaEmpleado, tipo_archivo: tipoFirmaEmpleado } = firmaEmpleadoResult.recordset[0];
    console.log('Firma del empleado encontrada - tipo_archivo:', tipoFirmaEmpleado);

    // 2. Obtener IDs del jefe inmediato (titular o suplente) y gerente de RRHH
    let id_jefe_inmediato = null;
    let id_gerente_rrhh = null;
    let datosFirmaJefe = null;
    let tipoFirmaJefe = null;
    let datosFirmaRRHH = null;
    let tipoFirmaRRHH = null;

    const jefesResult = await poolPermisos.request()
      .input('area_solicitante', sql.VarChar, solicitud.area_solicitante)
      .query(`
        SELECT 
          (SELECT TOP 1 id_empleado 
           FROM [Permisos].[dbo].[MantenimientoJefes] 
           WHERE unidad = @area_solicitante AND tipo_jefe = 'Titular' AND activo = 1
           ORDER BY creado_fecha DESC) AS id_jefe_titular,
          (SELECT TOP 1 id_empleado 
           FROM [Permisos].[dbo].[MantenimientoJefes] 
           WHERE unidad = @area_solicitante AND tipo_jefe = 'Suplente' AND activo = 1
           ORDER BY creado_fecha DESC) AS id_jefe_suplente,
          (SELECT TOP 1 id_empleado 
           FROM [Permisos].[dbo].[MantenimientoJefes] 
           WHERE unidad = 'RRHH' AND tipo_jefe = 'Titular' AND activo = 1
           ORDER BY creado_fecha DESC) AS id_gerente_rrhh
      `);

    const { id_jefe_titular, id_jefe_suplente, id_gerente_rrhh: id_gerente } = jefesResult.recordset[0];
    id_jefe_inmediato = id_jefe_titular || id_jefe_suplente; // Prioriza titular, luego suplente
    id_gerente_rrhh = id_gerente;

    console.log('ID del jefe inmediato (titular):', id_jefe_titular);
    console.log('ID del jefe inmediato (suplente):', id_jefe_suplente);
    console.log('ID del jefe inmediato seleccionado:', id_jefe_inmediato);
    console.log('ID del gerente de RRHH:', id_gerente_rrhh);

    // 3. Manejar firma del jefe inmediato
    if (id_jefe_inmediato) {
      if (id_jefe_inmediato === id_empleado) {
        // El solicitante es su propio jefe (titular o suplente)
        console.log('El solicitante es el jefe (titular o suplente); reutilizando firma del empleado');
        datosFirmaJefe = datosFirmaEmpleado;
        tipoFirmaJefe = tipoFirmaEmpleado;
      } else {
        const firmaJefeResult = await poolPermisos.request()
          .input('id_empleado', sql.VarChar(50), id_jefe_inmediato)
          .query(`
            SELECT datos_archivo, tipo_archivo
            FROM [Permisos].[dbo].[Firmas]
            WHERE TRIM(id_empleado) = TRIM(@id_empleado)
          `);

        if (firmaJefeResult.recordset.length) {
          datosFirmaJefe = firmaJefeResult.recordset[0].datos_archivo;
          tipoFirmaJefe = firmaJefeResult.recordset[0].tipo_archivo;
          console.log('Firma del jefe inmediato encontrada - tipo_archivo:', tipoFirmaJefe);
        } else {
          console.warn('No se encontró firma para el jefe inmediato con ID:', id_jefe_inmediato);
        }
      }
    } else {
      console.warn('No se encontró jefe inmediato (titular ni suplente) para el área:', solicitud.area_solicitante);
    }

    // 4. Obtener firma del gerente de RRHH
    if (id_gerente_rrhh) {
      const firmaRRHHResult = await poolPermisos.request()
        .input('id_empleado', sql.VarChar(50), id_gerente_rrhh)
        .query(`
          SELECT datos_archivo, tipo_archivo
          FROM [Permisos].[dbo].[Firmas]
          WHERE TRIM(id_empleado) = TRIM(@id_empleado)
        `);

      if (firmaRRHHResult.recordset.length) {
        datosFirmaRRHH = firmaRRHHResult.recordset[0].datos_archivo;
        tipoFirmaRRHH = firmaRRHHResult.recordset[0].tipo_archivo;
        console.log('Firma del gerente de RRHH encontrada - tipo_archivo:', tipoFirmaRRHH);
      } else {
        console.warn('No se encontró firma para el gerente de RRHH con ID:', id_gerente_rrhh);
      }
    } else {
      console.warn('No se encontró gerente de RRHH titular');
    }

    // 5. Cargar PDF base
    const pdfPath = path.join(__dirname, '../public/templates/solicitud-vacaciones.pdf');
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // 6. Obtener primera página
    const page = pdfDoc.getPages()[0];
    const { width } = page.getSize();

    // 7. Incrustar firma del empleado
    let firmaImageEmpleado;
    if (tipoFirmaEmpleado === 'image/png' || tipoFirmaEmpleado === 'png') {
      firmaImageEmpleado = await pdfDoc.embedPng(datosFirmaEmpleado);
    } else if (tipoFirmaEmpleado === 'image/jpeg' || tipoFirmaEmpleado === 'image/jpg') {
      firmaImageEmpleado = await pdfDoc.embedJpg(datosFirmaEmpleado);
    } else {
      console.error('Formato de firma del empleado no soportado:', tipoFirmaEmpleado);
      throw new Error('Formato de firma del empleado no soportado');
    }
    page.drawImage(firmaImageEmpleado, {
      x: width - 550, // Coordenadas para "Firma del Empleado"
      y: 350,
      width: 150,
      height: 50,
    });

    // 8. Incrustar firma del jefe inmediato (si existe)
    if (datosFirmaJefe && tipoFirmaJefe) {
      let firmaImageJefe;
      if (tipoFirmaJefe === 'image/png' || tipoFirmaJefe === 'png') {
        firmaImageJefe = await pdfDoc.embedPng(datosFirmaJefe);
      } else if (tipoFirmaJefe === 'image/jpeg' || tipoFirmaJefe === 'image/jpg') {
        firmaImageJefe = await pdfDoc.embedJpg(datosFirmaJefe);
      } else {
        console.warn('Formato de firma del jefe inmediato no soportado:', tipoFirmaJefe);
      }
      if (firmaImageJefe) {
        page.drawImage(firmaImageJefe, {
          x: width - 200, // Coordenadas para "V.B. Jefe Inmediato"
          y: 350,
          width: 150,
          height: 50,
        });
      }
    }

    // 9. Incrustar firma del gerente de RRHH (si existe)
    if (datosFirmaRRHH && tipoFirmaRRHH) {
      let firmaImageRRHH;
      if (tipoFirmaRRHH === 'image/png' || tipoFirmaRRHH === 'png') {
        firmaImageRRHH = await pdfDoc.embedPng(datosFirmaRRHH);
      } else if (tipoFirmaRRHH === 'image/jpeg' || tipoFirmaRRHH === 'image/jpg') {
        firmaImageRRHH = await pdfDoc.embedJpg(datosFirmaRRHH);
      } else {
        console.warn('Formato de firma del gerente de RRHH no soportado:', tipoFirmaRRHH);
      }
      if (firmaImageRRHH) {
        page.drawImage(firmaImageRRHH, {
          x: width - 380, // Coordenadas para "V.B. Gerente Recursos Humanos"
          y: 310,
          width: 150,
          height: 50,
        });
      }
    }

    // 10. Rellenar formulario
    const form = pdfDoc.getForm();
    const fields = {
      fecha_solicitud: solicitud.fecha_solicitud
        ? new Date(solicitud.fecha_solicitud).toLocaleDateString('es-ES')
        : '',
      nombre: solicitud.nombre || '',
      area_solicitante: solicitud.area_solicitante || '',
      // tipo_permiso: solicitud.tipo_permiso || 'Vacaciones', // Comentado porque no está en la plantilla
      fecha_inicio: solicitud.fecha_inicio
        ? new Date(solicitud.fecha_inicio).toLocaleDateString('es-ES')
        : '',
      fecha_fin: solicitud.fecha_fin
        ? new Date(solicitud.fecha_fin).toLocaleDateString('es-ES')
        : '',
      fecha_reincorporacion: solicitud.fecha_reincorporacion
        ? new Date(solicitud.fecha_reincorporacion).toLocaleDateString('es-ES')
        : '',
      total_dias: solicitud.horas_solicitadas
        ? `${solicitud.horas_solicitadas} horas`
        : `${solicitud.total_dias || 0} días`,
      anio: solicitud.yearSelections
        ? JSON.parse(solicitud.yearSelections || '[]')
            .map((s) => s.ano)
            .join(', ')
        : '',
      observaciones: solicitud.observaciones || '',
      // motivo: solicitud.motivo || '', // Comentado porque no está en la plantilla
    };

    Object.entries(fields).forEach(([name, value]) => {
      try {
        const field = form.getTextField(name);
        field.setText(value);
      } catch (e) {
        console.warn(`Campo ${name} no encontrado en el PDF`);
      }
    });

    // 11. Guardar y enviar PDF
    const pdfBytes = await pdfDoc.save();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Solicitud_${solicitud.tipo_permiso}_${solicitud.id}.pdf`,
    });
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error al generar PDF:', error);
    res.status(500).json({ success: false, error: `No se pudo generar el PDF: ${error.message}` });
  }
},
createSolicitud: async (req, res, { puesto, usuarios, usuario }) => {
  try {
    const { fecha_inicio, fecha_fin, observaciones, nombrePersona, fecha_reincorporacion, tipo_permiso } = req.body;
    const area_solicitante = req.usuario?.unidad || 'Sin Área';

    if (!fecha_inicio || !fecha_fin || !nombrePersona || !tipo_permiso) {
      return res.status(400).json({ success: false, error: 'Faltan datos requeridos' });
    }

    if (tipo_permiso === 'Vacaciones' && !fecha_reincorporacion) {
      return res.status(400).json({ success: false, error: 'Fecha de reincorporación requerida para vacaciones' });
    }

    let totalDias = 0;
    let inicio, fin, reincorporacion;

    if (tipo_permiso !== 'Permiso por hora') {
      inicio = new Date(fecha_inicio + 'T00:00:00Z');
      fin = new Date(fecha_fin + 'T00:00:00Z');
      if (tipo_permiso === 'Vacaciones') {
        reincorporacion = new Date(fecha_reincorporacion + 'T00:00:00Z');
      }

      if (isNaN(inicio) || isNaN(fin) || inicio > fin) {
        return res.status(400).json({ success: false, error: 'Fechas inválidas' });
      }

      totalDias = calcularDiasLaborables(inicio, fin);

      if (totalDias <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Las fechas seleccionadas no incluyen días laborables',
        });
      }

      if (tipo_permiso === 'Vacaciones') {
        const diasDisponibles = await obtenerDiasDisponibles(req.usuario.id);
        if (diasDisponibles.total < totalDias) {
          return res.status(400).json({
            success: false,
            error: `Días disponibles insuficientes: ${diasDisponibles.total} < ${totalDias}`,
          });
        }

        const expectedReincorporacionStr = calcularFechaReincorporacion(fin);
        if (fecha_reincorporacion !== expectedReincorporacionStr) {
          return res.status(400).json({ success: false, error: 'Fecha de reincorporación inválida' });
        }
      }
    } else {
      // Lógica para Permiso por hora
      const { fecha_permiso, hora_inicio, hora_fin, horas_solicitadas } = req.body;
      if (!fecha_permiso || !hora_inicio || !hora_fin || !horas_solicitadas) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos para permiso por hora' });
      }
      // Validar horas_solicitadas, etc.
    }

    const puestoResult = await (await getPoolPlanilla())
      .request()
      .input('dni', sql.VarChar, req.usuario?.id)
      .query('SELECT ID FROM [Planilla].[dbo].[Puesto] WHERE DNI = @dni');

    if (!puestoResult.recordset[0]) {
      throw new Error('Usuario no encontrado en la base de datos de planilla');
    }
    const usuario_id = puestoResult.recordset[0].ID;

    const solicitudId = await crearSolicitud({
      usuario_id,
      nombre: nombrePersona,
      area_solicitante,
      tipo_permiso,
      fecha_inicio,
      fecha_fin,
      fecha_reincorporacion: tipo_permiso === 'Vacaciones' ? fecha_reincorporacion : null,
      total_dias: totalDias,
      observaciones,
    });

    const solicitud = await obtenerSolicitudPorId(solicitudId);

    const emailResult = await sendNewRequestEmail('selvin.flores@unah.hn', solicitud);
    if (!emailResult.success) {
      console.warn(`Fallo al enviar correo al jefe: ${emailResult.message}`);
    }

    res.json({
      success: true,
      message: emailResult.success
        ? 'Solicitud creada exitosamente'
        : 'Solicitud creada, pero no se pudo enviar el correo al jefe',
    });
  } catch (error) {
    console.error('Error al crear solicitud:', error);
    res.status(500).json({ success: false, error: `Error al crear la solicitud: ${error.message}` });
  }
},

  exportIndex: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const { type, estado } = req.query;

      const puestoResult = await (await getPoolPlanilla())
        .request()
        .input('dni', sql.VarChar, req.usuario.id)
        .query('SELECT ID FROM [Planilla].[dbo].[Puesto] WHERE DNI = @dni');

      if (!puestoResult.recordset[0]) {
        throw new Error('Usuario no encontrado en la base de datos de planilla');
      }
      const usuario_id = puestoResult.recordset[0].ID;

      let query = `SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, total_dias, estado, observaciones 
                   FROM [Permisos].[dbo].[solicitud] WHERE usuario_id = @usuario_id`;
      let filename = 'Solicitudes_Usuario.xlsx';
      let worksheetName = 'Solicitudes';

      if (type === 'pendientes') {
        query += " AND estado = 'Pendiente'";
        filename = 'Solicitudes_Pendientes.xlsx';
        worksheetName = 'Solicitudes Pendientes';
      } else if (type === 'historico') {
        query += " AND estado != 'Pendiente'";
        if (estado === 'Aprobado') {
          query += " AND estado IN ('Aprobado', 'Aprobado por Jefe')";
          filename = 'Solicitudes_Aprobadas.xlsx';
          worksheetName = 'Histórico Aprobadas';
        } else if (estado === 'Rechazado') {
          query += " AND estado = 'Rechazado'";
          filename = 'Solicitudes_Rechazadas.xlsx';
          worksheetName = 'Histórico Rechazadas';
        } else {
          filename = 'Solicitudes_Historico.xlsx';
          worksheetName = 'Histórico';
        }
      }

      const request = (await getPoolPermisos()).request();
      const solicitudesResult = await request
        .input('usuario_id', sql.Int, usuario_id)
        .query(query);
      request.cancel(); // Liberar el request

      await exportarSolicitudesExcel(solicitudesResult.recordset, worksheetName, filename, res);
    } catch (error) {
      console.error('Error al exportar:', error);
      res.status(500).send(`Error al generar el reporte: ${error.message}`);
    }
  },

  getAprobacion: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      if (!req.usuario?.id) {
        throw new Error('No se proporcionó un identificador de usuario');
      }

      if (!req.jefeData?.isJefe) {
        return res.status(403).render('error', {
          message: 'No tiene permisos para acceder a esta página. Solo los jefes activos pueden ver las solicitudes de aprobación.',
          usuario: req.usuario?.usuario || 'ECRUZ',
        });
      }

      const pool = await getPoolPermisos();
      const unidad = req.jefeData.unidad;

      const request1 = pool.request();
      const solicitudesResult = await request1
        .input('area_solicitante', sql.VarChar, unidad)
        .query(`
          SELECT sv.id, sv.nombre, sv.area_solicitante, sv.fecha_solicitud, sv.fecha_inicio, sv.fecha_fin, sv.fecha_reincorporacion, 
                 sv.total_dias, sv.estado, sv.observaciones, sv.observaciones_rechazo, sv.aprobado_por_rh 
          FROM [Permisos].[dbo].[solicitud] sv
          WHERE sv.estado = 'Pendiente' AND sv.area_solicitante = @area_solicitante
        `);
      request1.cancel(); // Liberar el request

      const request2 = pool.request();
      const historicoResult = await request2
        .input('area_solicitante', sql.VarChar, unidad)
        .query(`
          SELECT sv.id, sv.nombre, sv.area_solicitante, sv.fecha_solicitud, sv.fecha_inicio, sv.fecha_fin, sv.fecha_reincorporacion, 
                 sv.total_dias, sv.estado, sv.observaciones, sv.observaciones_rechazo, sv.aprobado_por_rh 
          FROM [Permisos].[dbo].[solicitud] sv
          WHERE sv.estado != 'Pendiente' AND sv.area_solicitante = @area_solicitante
        `);
      request2.cancel(); // Liberar el request

      const formatSolicitudes = (solicitudes) =>
        solicitudes.map((s) => ({
          ...s,
          fecha_solicitud: s.fecha_solicitud ? new Date(s.fecha_solicitud) : null,
          fecha_inicio: s.fecha_inicio ? new Date(s.fecha_inicio) : null,
          fecha_fin: s.fecha_fin ? new Date(s.fecha_fin) : null,
          fecha_reincorporacion: s.fecha_reincorporacion ? new Date(s.fecha_reincorporacion) : null,
        }));

      res.render('aprobacion', {
        solicitudes: formatSolicitudes(solicitudesResult.recordset),
        historico: formatSolicitudes(historicoResult.recordset),
        usuario: req.usuario?.usuario || 'ECRUZ',
        error: null,
      });
    } catch (error) {
      console.error('Error en getAprobacion:', error);
      res.render('aprobacion', {
        solicitudes: [],
        historico: [],
        usuario: req.usuario?.usuario || 'ECRUZ',
        error: `Error al cargar las solicitudes: ${error.message}`,
      });
    }
  },

  getSolicitud: async (req, res) => {
    try {
      const id = req.params.id;
      const request = (await getPoolPermisos()).request();
      const result = await request
        .input('id', sql.Int, id)
        .query(`
          SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, 
                 total_dias, estado, observaciones, observaciones_rechazo, aprobado_por_rh 
          FROM [Permisos].[dbo].[solicitud] WHERE id = @id
        `);
      request.cancel(); // Liberar el request

      if (!result.recordset[0]) {
        return res.status(404).json({ error: 'Solicitud no encontrada' });
      }
      const solicitud = {
        ...result.recordset[0],
        fecha_solicitud: result.recordset[0].fecha_solicitud ? new Date(result.recordset[0].fecha_solicitud) : null,
        fecha_inicio: result.recordset[0].fecha_inicio ? new Date(result.recordset[0].fecha_inicio) : null,
        fecha_fin: result.recordset[0].fecha_fin ? new Date(result.recordset[0].fecha_fin) : null,
        fecha_reincorporacion: result.recordset[0].fecha_reincorporacion
          ? new Date(result.recordset[0].fecha_reincorporacion)
          : null,
      };
      res.json(solicitud);
    } catch (error) {
      console.error('Error en getSolicitud:', error);
      res.status(500).json({ error: `Error al obtener la solicitud: ${error.message}` });
    }
  },

  updateSolicitud: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const { id, accion, observaciones_rechazo } = req.body;

      if (!id || !accion) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos' });
      }

      if (!req.jefeData?.isJefe) {
        return res.status(403).json({ success: false, error: 'Solo los jefes activos pueden aprobar o rechazar solicitudes' });
      }

      const pool = await getPoolPermisos();
      const request1 = pool.request();
      const solicitudResult = await request1
        .input('id', sql.Int, id)
        .input('area_solicitante', sql.VarChar, req.jefeData.unidad)
        .query(`
          SELECT usuario_id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, total_dias, estado, observaciones 
          FROM [Permisos].[dbo].[solicitud] 
          WHERE id = @id AND area_solicitante = @area_solicitante
        `);
      request1.cancel(); // Liberar el request

      if (!solicitudResult.recordset[0]) {
        return res.status(400).json({ success: false, error: 'Solicitud no encontrada o no pertenece a su área' });
      }

      const solicitud = {
        ...solicitudResult.recordset[0],
        fecha_solicitud: new Date(solicitudResult.recordset[0].fecha_solicitud),
        fecha_inicio: new Date(solicitudResult.recordset[0].fecha_inicio),
        fecha_fin: new Date(solicitudResult.recordset[0].fecha_fin),
        fecha_reincorporacion: new Date(solicitudResult.recordset[0].fecha_reincorporacion),
      };

      const request2 = pool.request()
        .input('id', sql.Int, id)
        .input('area_solicitante', sql.VarChar, req.jefeData.unidad);

      if (accion === 'aprobar') {
        request2
          .input('estado', sql.VarChar, 'Aprobado por Jefe')
          .input('aprobado_por', sql.Int, 1)
          .input('fecha_aprobacion', sql.DateTime, new Date());

        await request2.query(`
          UPDATE [Permisos].[dbo].[solicitud]
          SET estado = @estado, aprobado_por = @aprobado_por, fecha_aprobacion = @fecha_aprobacion
          WHERE id = @id AND estado = 'Pendiente' AND area_solicitante = @area_solicitante
        `);
        request2.cancel(); // Liberar el request

        console.log(`Intentando enviar correo a RRHH: selvin.flores@unah.hn`);
        const emailResult = await sendSupervisorApprovedEmail('selvin.flores@unah.hn', solicitud);
        if (!emailResult.success) {
          console.warn(`Fallo al enviar correo a RRHH: ${emailResult.message}`);
        }

        res.json({
          success: true,
          message: emailResult.success
            ? 'Solicitud aprobada'
            : 'Solicitud aprobada, pero no se pudo enviar el correo a RRHH',
        });
      } else if (accion === 'rechazar') {
        request2
          .input('estado', sql.VarChar, 'Rechazado')
          .input('observaciones_rechazo', sql.VarChar, observaciones_rechazo || null)
          .input('fecha_aprobacion', sql.DateTime, new Date());

        await request2.query(`
          UPDATE [Permisos].[dbo].[solicitud]
          SET estado = @estado, observaciones_rechazo = @observaciones_rechazo, fecha_aprobacion = @fecha_aprobacion
          WHERE id = @id AND estado = 'Pendiente' AND area_solicitante = @area_solicitante
        `);
        request2.cancel(); // Liberar el request

        console.log(`Intentando enviar correo de rechazo al usuario: selvin.flores@unah.hn`);
        const emailResult = await sendRequestRejectedEmail(
          'selvin.flores@unah.hn',
          solicitud,
          'jefe',
          observaciones_rechazo
        );
        if (!emailResult.success) {
          console.warn(`Fallo al enviar correo de rechazo al usuario: ${emailResult.message}`);
        }

        res.json({
          success: true,
          message: emailResult.success
            ? 'Solicitud rechazada'
            : 'Solicitud rechazada, pero no se pudo enviar el correo al usuario',
        });
      } else {
        request2.cancel(); // Liberar el request
        res.status(400).json({ success: false, error: 'Acción no válida' });
      }
    } catch (error) {
      console.error('Error al actualizar solicitud:', error);
      res.status(500).json({ success: false, error: `Error al procesar: ${error.message}` });
    }
  },

  checkRRHHJefeStatus: async (req, res, next) => {
    try {
      if (!req.usuario?.id) {
        return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
      }

      const pool = await getPoolPermisos();
      const request = pool.request();
      const result = await request
        .input('id_empleado', sql.VarChar, req.usuario.id)
        .input('unidad', sql.VarChar, 'RRHH')
        .query(`
          SELECT id, unidad
          FROM [Permisos].[dbo].[MantenimientoJefes]
          WHERE id_empleado = @id_empleado AND unidad = @unidad AND activo = 1
        `);
      request.cancel(); // Liberar el request

      req.jefeRRHHData = {
        isJefeRRHH: result.recordset.length > 0,
        unidad: result.recordset.length > 0 ? result.recordset[0].unidad : null,
      };

      if (!req.jefeRRHHData.isJefeRRHH) {
        return res.status(403).render('error', {
          message: 'No tiene permisos para acceder a esta página. Solo los jefes activos del área RRHH pueden ver las solicitudes de aprobación.',
          usuario: req.usuario?.usuario || 'ECRUZ',
        });
      }

      next();
    } catch (error) {
      console.error('Error en checkRRHHJefeStatus:', error);
      res.status(500).json({ success: false, error: `Error al verificar el estado del jefe de RRHH: ${error.message}` });
    }
  },

  getAprobacionRH: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const pool = await getPoolPermisos();

      const request1 = pool.request();
      const solicitudesResult = await request1
        .query(`
          SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, 
                 total_dias, estado, observaciones, observaciones_rechazo, aprobado_por_rh 
          FROM [Permisos].[dbo].[solicitud] WHERE estado = 'Aprobado por Jefe'
        `);
      request1.cancel(); // Liberar el request

      const request2 = pool.request();
      const historicoResult = await request2
        .query(`
          SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, 
                 total_dias, estado, observaciones, observaciones_rechazo, aprobado_por_rh 
          FROM [Permisos].[dbo].[solicitud] WHERE estado IN ('Aprobado', 'Rechazado')
        `);
      request2.cancel(); // Liberar el request

      const request3 = pool.request();
      const areasResult = await request3
        .query(`
          SELECT DISTINCT area_solicitante 
          FROM [Permisos].[dbo].[solicitud] 
          WHERE area_solicitante IS NOT NULL
        `);
      request3.cancel(); // Liberar el request

      const formatSolicitudes = (solicitudes) =>
        solicitudes.map((s) => ({
          ...s,
          fecha_solicitud: s.fecha_solicitud ? new Date(s.fecha_solicitud) : null,
          fecha_inicio: s.fecha_inicio ? new Date(s.fecha_inicio) : null,
          fecha_fin: s.fecha_fin ? new Date(s.fecha_fin) : null,
          fecha_reincorporacion: s.fecha_reincorporacion ? new Date(s.fecha_reincorporacion) : null,
        }));

      const availableAreas = areasResult.recordset.map((a) => a.area_solicitante);

      res.render('aprobacion-RH', {
        solicitudes: formatSolicitudes(solicitudesResult.recordset),
        historico: formatSolicitudes(historicoResult.recordset),
        availableAreas,
        usuario: req.usuario?.usuario || 'ECRUZ',
        error: null,
      });
    } catch (error) {
      console.error('Error en getAprobacionRH:', error);
      res.render('aprobacion-RH', {
        solicitudes: [],
        historico: [],
        availableAreas: [],
        usuario: req.usuario?.usuario || 'ECRUZ',
        error: `Error al cargar las solicitudes: ${error.message}`,
      });
    }
  },

  updateSolicitudRH: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const { id, accion, observaciones_rechazo } = req.body;

      if (!id || !accion) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos' });
      }

      if (!req.jefeRRHHData?.isJefeRRHH) {
        return res.status(403).json({ success: false, error: 'Solo los jefes activos de RRHH pueden aprobar o rechazar solicitudes' });
      }

      const poolPermisos = await getPoolPermisos();
      const transaction = new sql.Transaction(poolPermisos);
      await transaction.begin();

      try {
        const request1 = transaction.request();
        const solicitudResult = await request1
          .input('id', sql.Int, id)
          .query(`
            SELECT usuario_id, total_dias, estado, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, observaciones 
            FROM [Permisos].[dbo].[solicitud] WHERE id = @id
          `);
        request1.cancel(); // Liberar el request

        if (!solicitudResult.recordset[0]) {
          await transaction.rollback();
          return res.status(400).json({ success: false, error: 'Solicitud no encontrada' });
        }

        const { usuario_id, total_dias, estado, ...solicitudData } = solicitudResult.recordset[0];

        const solicitud = {
          ...solicitudData,
          fecha_solicitud: new Date(solicitudData.fecha_solicitud),
          fecha_inicio: new Date(solicitudData.fecha_inicio),
          fecha_fin: new Date(solicitudData.fecha_fin),
          fecha_reincorporacion: new Date(solicitudData.fecha_reincorporacion),
        };

        if (estado !== 'Aprobado por Jefe') {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            error: 'La solicitud no está en estado Aprobado por Jefe',
          });
        }

        const request2 = (await getPoolPlanilla()).request();
        const puestoResult = await request2
          .input('id', sql.Int, usuario_id)
          .query('SELECT DNI FROM [Planilla].[dbo].[Puesto] WHERE ID = @id');
        request2.cancel(); // Liberar el request

        if (!puestoResult.recordset[0]) {
          await transaction.rollback();
          throw new Error('Usuario no encontrado en la base de datos de planilla');
        }
        const dni = puestoResult.recordset[0].DNI;

        const request3 = transaction.request().input('id', sql.Int, id);

        if (accion === 'aprobar') {
          request3
            .input('estado', sql.VarChar, 'Aprobado')
            .input('aprobado_por_rh', sql.Int, 2)
            .input('fecha_aprobacion', sql.DateTime, new Date());

          await request3.query(`
            UPDATE [Permisos].[dbo].[solicitud]
            SET estado = @estado, aprobado_por_rh = @aprobado_por_rh, fecha_aprobacion = @fecha_aprobacion
            WHERE id = @id AND estado = 'Aprobado por Jefe'
          `);
          request3.cancel(); // Liberar el request

          console.log('Actualizando días de vacaciones para DNI:', dni, 'Días:', total_dias);
          await actualizarVacaciones(dni, total_dias);

          await transaction.commit();

          console.log(`Intentando enviar correo de aprobación al usuario: selvin.flores@unah.hn`);
          const emailResult = await sendRequestFullyApprovedEmail('selvin.flores@unah.hn', solicitud);
          if (!emailResult.success) {
            console.warn(`Fallo al enviar correo de aprobación al usuario: ${emailResult.message}`);
          }

          res.json({
            success: true,
            message: emailResult.success
              ? 'Solicitud aprobada por RRHH'
              : 'Solicitud aprobada por RRHH, pero no se pudo enviar el correo al usuario',
          });
        } else if (accion === 'rechazar') {
          request3
            .input('estado', sql.VarChar, 'Rechazado')
            .input('observaciones_rechazo', sql.VarChar, observaciones_rechazo || null)
            .input('fecha_aprobacion', sql.DateTime, new Date());

          await request3.query(`
            UPDATE [Permisos].[dbo].[solicitud]
            SET estado = @estado, observaciones_rechazo = @observaciones_rechazo, fecha_aprobacion = @fecha_aprobacion
            WHERE id = @id AND estado = 'Aprobado por Jefe'
          `);
          request3.cancel(); // Liberar el request

          await transaction.commit();

          console.log(`Intentando enviar correo de rechazo al usuario: selvin.flores@unah.hn`);
          const emailResult = await sendRequestRejectedEmail(
            'selvin.flores@unah.hn',
            solicitud,
            'RRHH',
            observaciones_rechazo
          );
          if (!emailResult.success) {
            console.warn(`Fallo al enviar correo de rechazo al usuario: ${emailResult.message}`);
          }

          res.json({
            success: true,
            message: emailResult.success
              ? 'Solicitud rechazada por RRHH'
              : 'Solicitud rechazada por RRHH, pero no se pudo enviar el correo al usuario',
          });
        } else {
          await transaction.rollback();
          request3.cancel(); // Liberar el request
          return res.status(400).json({ success: false, error: 'Acción no válida' });
        }
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      console.error('Error al actualizar solicitud RH:', error);
      res.status(500).json({ success: false, error: `Error al procesar: ${error.message}` });
    }
  },

  exportAprobacion: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const { type, estado } = req.query;

      if (!req.jefeData?.isJefe) {
        return res.status(403).send('No tiene permisos para exportar solicitudes. Solo los jefes activos pueden realizar esta acción.');
      }

      let query = `
        SELECT sv.id, sv.nombre, sv.area_solicitante, sv.fecha_solicitud, sv.fecha_inicio, sv.fecha_fin, 
               sv.fecha_reincorporacion, sv.total_dias, sv.estado, sv.observaciones, sv.observaciones_rechazo, sv.aprobado_por_rh 
        FROM [Permisos].[dbo].[solicitud] sv
        WHERE sv.area_solicitante = @area_solicitante
      `;
      let filename = 'Solicitudes_Aprobacion.xlsx';
      let worksheetName = 'Aprobaciones';

      const request = (await getPoolPermisos()).request().input('area_solicitante', sql.VarChar, req.jefeData.unidad);

      if (type === 'pendientes') {
        query += " AND sv.estado = 'Pendiente'";
        filename = 'Solicitudes_Pendientes_Aprobacion.xlsx';
        worksheetName = 'Aprobaciones Pendientes';
      } else if (type === 'historico') {
        query += " AND sv.estado != 'Pendiente'";
        if (estado === 'Aprobado') {
          query += " AND sv.estado IN ('Aprobado', 'Aprobado por Jefe')";
          filename = 'Solicitudes_Aprobadas_Aprobacion.xlsx';
          worksheetName = 'Histórico Aprobadas';
        } else if (estado === 'Rechazado') {
          query += " AND sv.estado = 'Rechazado'";
          filename = 'Solicitudes_Rechazadas_Aprobacion.xlsx';
          worksheetName = 'Histórico Rechazadas';
        } else {
          filename = 'Solicitudes_Historico_Aprobacion.xlsx';
          worksheetName = 'Histórico';
        }
      }

      const solicitudesResult = await request.query(query);
      request.cancel(); // Liberar el request

      await exportarSolicitudesExcel(solicitudesResult.recordset, worksheetName, filename, res);
    } catch (error) {
      console.error('Error al exportar aprobaciones:', error);
      res.status(500).send(`Error al generar el reporte: ${error.message}`);
    }
  },

  exportAprobacionRH: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const { type, estado } = req.query;

      if (!req.jefeRRHHData?.isJefeRRHH) {
        return res.status(403).send('No tiene permisos para exportar solicitudes. Solo los jefes activos de RRHH pueden realizar esta acción.');
      }

      let query = `
        SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, 
               fecha_reincorporacion, total_dias, estado, observaciones, observaciones_rechazo, aprobado_por_rh 
        FROM [Permisos].[dbo].[solicitud]
      `;
      let filename = 'Solicitudes_Aprobacion_RH.xlsx';
      let worksheetName = 'Aprobaciones RH';

      if (type === 'pendientes') {
        query += " WHERE estado = 'Aprobado por Jefe'";
        filename = 'Solicitudes_Pendientes_Aprobacion_RH.xlsx';
        worksheetName = 'Aprobaciones Pendientes RH';
      } else if (type === 'historico') {
        query += " WHERE estado IN ('Aprobado', 'Rechazado')";
        if (estado === 'Aprobado') {
          query += " AND estado = 'Aprobado'";
          filename = 'Solicitudes_Aprobadas_Aprobacion_RH.xlsx';
          worksheetName = 'Histórico Aprobadas RH';
        } else if (estado === 'Rechazado') {
          query += " AND estado = 'Rechazado'";
          filename = 'Solicitudes_Rechazadas_Aprobacion_RH.xlsx';
          worksheetName = 'Histórico Rechazadas RH';
        } else {
          filename = 'Solicitudes_Historico_Aprobacion_RH.xlsx';
          worksheetName = 'Histórico RH';
        }
      } else {
        query += " WHERE estado IN ('Aprobado por Jefe', 'Aprobado', 'Rechazado')";
      }

      const request = (await getPoolPermisos()).request();
      const solicitudesResult = await request.query(query);
      request.cancel(); // Liberar el request

      await exportarSolicitudesExcel(solicitudesResult.recordset, worksheetName, filename, res);
    } catch (error) {
      console.error('Error al exportar aprobaciones RH:', error);
      res.status(500).send(`Error al generar el reporte: ${error.message}`);
    }
  },

  getReporteRH: async (req, res) => {
    try {
      const { fechaInicio, fechaFin, areas, estados } = req.query;

      if (!req.jefeRRHHData?.isJefeRRHH) {
        return res.status(403).json({ success: false, error: 'Solo los jefes activos de RRHH pueden generar reportes' });
      }

      const pool = await getPoolPermisos();
      let query = `
        SELECT 
          area_solicitante,
          estado,
          COUNT(*) as cantidad,
          SUM(total_dias) as total_dias,
          MONTH(fecha_solicitud) as mes,
          YEAR(fecha_solicitud) as ano
        FROM [Permisos].[dbo].[solicitud]
        WHERE 1=1
      `;
      
      const request = pool.request();

      if (fechaInicio) {
        query += ' AND fecha_solicitud >= @fechaInicio';
        request.input('fechaInicio', sql.Date, new Date(fechaInicio));
      }
      if (fechaFin) {
        query += ' AND fecha_solicitud <= @fechaFin';
        request.input('fechaFin', sql.Date, new Date(fechaFin));
      }
      if (areas) {
        const areasArray = areas.split(',').map(a => a.trim());
        query += ` AND area_solicitante IN (${areasArray.map((_, i) => `@area${i}`).join(',')})`;
        areasArray.forEach((area, i) => {
          request.input(`area${i}`, sql.VarChar, area);
        });
      }
      if (estados) {
        const estadosArray = estados.split(',').map(e => e.trim());
        query += ` AND estado IN (${estadosArray.map((_, i) => `@estado${i}`).join(',')})`;
        estadosArray.forEach((estado, i) => {
          request.input(`estado${i}`, sql.VarChar, estado);
        });
      }

      query += `
        GROUP BY area_solicitante, estado, MONTH(fecha_solicitud), YEAR(fecha_solicitud)
      `;

      console.log('Consulta SQL:', query);
      console.log('Parámetros asignados:', request.parameters);

      const result = await request.query(query);
      request.cancel(); // Liberar el request

      const reportAreas = [...new Set(result.recordset.map(r => r.area_solicitante))].filter(a => a);
      const estadosDisponibles = ['Aprobado por Jefe', 'Aprobado', 'Rechazado'];
      const meses = Array.from({ length: 12 }, (_, i) => i + 1);

      const barData = reportAreas.map(area => ({
        area,
        pendiente: result.recordset.find(r => r.area_solicitante === area && r.estado === 'Aprobado por Jefe')?.cantidad || 0,
        aprobado: result.recordset.find(r => r.area_solicitante === area && r.estado === 'Aprobado')?.cantidad || 0,
        rechazado: result.recordset.find(r => r.area_solicitante === area && r.estado === 'Rechazado')?.cantidad || 0,
      }));

      const lineData = meses.map(mes => ({
        mes: new Date(0, mes - 1).toLocaleString('es', { month: 'short' }),
        cantidad: result.recordset.filter(r => r.mes === mes).reduce((sum, r) => sum + r.cantidad, 0),
      }));

      const donutData = reportAreas.map(area => ({
        area,
        total_dias: result.recordset.filter(r => r.area_solicitante === area).reduce((sum, r) => sum + (r.total_dias || 0), 0),
      }));

      const totalSolicitudes = result.recordset.reduce((sum, r) => sum + r.cantidad, 0);
      const totalDias = result.recordset.reduce((sum, r) => sum + (r.total_dias || 0), 0);
      const promedioDias = totalSolicitudes ? (totalDias / totalSolicitudes).toFixed(1) : 0;
      const tasaAprobacion = totalSolicitudes
        ? ((result.recordset.filter(r => r.estado === 'Aprobado').reduce((sum, r) => sum + r.cantidad, 0) / totalSolicitudes) * 100).toFixed(1)
        : 0;

      res.json({
        success: true,
        barData,
        lineData,
        donutData,
        stats: {
          totalSolicitudes,
          totalDias,
          promedioDias,
          tasaAprobacion,
        },
        areas: reportAreas,
        estados: estadosDisponibles,
      });
    } catch (error) {
      console.error('Error en getReporteRH:', error);
      res.status(500).json({ success: false, error: `Error al generar el reporte: ${error.message}` });
    }
  },
  getReportesRH: async (req, res) => {
    try {
      if (!req.jefeRRHHData?.isJefeRRHH) {
        return res.status(403).render('error', {
          message: 'No tiene permisos para acceder a esta página. Solo los jefes activos del área RRHH pueden ver los reportes.',
          usuario: req.usuario?.usuario || 'ECRUZ',
        });
      }

      const pool = await getPoolPermisos();
      const request = pool.request();
      const areasResult = await request
        .query(`
          SELECT nombre_area
          FROM [Permisos].[dbo].[Area_Jefe]
          WHERE activo = 1
        `);
      request.cancel();

      const availableAreas = areasResult.recordset.map((a) => a.nombre_area);

      res.render('reportes-RH', {
        availableAreas,
        puesto: res.locals.puesto || { NombrePersona: 'Nombre no disponible', Puesto: 'Puesto no disponible', unidad: 'Área no disponible' },
        usuarios: res.locals.usuarios || [],
        usuario: req.usuario?.usuario || 'ECRUZ',
        error: null,
      });
    } catch (error) {
      console.error('Error en getReportesRH:', error);
      res.render('reportes-RH', {
        availableAreas: [],
        puesto: res.locals.puesto || { NombrePersona: 'Nombre no disponible', Puesto: 'Puesto no disponible', unidad: 'Área no disponible' },
        usuarios: res.locals.usuarios || [],
        usuario: req.usuario?.usuario || 'ECRUZ',
        error: `Error al cargar la página de reportes: ${error.message}`,
      });
    }
  },

//funcion para firmas
 uploadSignature: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const id_empleado = req.usuario?.id;
      if (!id_empleado) {
        return res.status(400).json({ success: false, error: 'ID de empleado es requerido' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se proporcionó un archivo de firma' });
      }

      const { originalname, buffer, mimetype } = req.file;
      // Validar tipo de archivo
      const allowedTypes = ['image/png', 'image/jpeg'];
      if (!allowedTypes.includes(mimetype)) {
        return res.status(400).json({ success: false, error: 'Tipo de archivo no permitido. Solo se aceptan PNG o JPG' });
      }

      // Validar tamaño del archivo (2MB máx)
      const maxSize = 2 * 1024 * 1024; // 2MB
      if (buffer.length > maxSize) {
        return res.status(400).json({ success: false, error: 'El archivo excede el tamaño máximo de 2MB' });
      }

      const pool = await getPoolPermisos();
      const transaction = new sql.Transaction(pool);

      try {
        await transaction.begin();

        const request = transaction.request();
        request
          .input('id_empleado', sql.VarChar(50), id_empleado)
          .input('nombre_archivo', sql.VarChar(255), originalname)
          .input('datos_archivo', sql.VarBinary, buffer)
          .input('tipo_archivo', sql.VarChar(100), mimetype)
          .input('subido_por', sql.VarChar(50), usuario);

        // Verificar si ya existe una firma
        const existingSignature = await request.query(`
          SELECT id FROM [Permisos].[dbo].[Firmas]
          WHERE id_empleado = @id_empleado
        `);

        if (existingSignature.recordset.length > 0) {
          // Actualizar firma existente
          await request.query(`
            UPDATE [Permisos].[dbo].[Firmas]
            SET nombre_archivo = @nombre_archivo,
                datos_archivo = @datos_archivo,
                tipo_archivo = @tipo_archivo,
                subido_por = @subido_por,
                fecha_subida = GETDATE()
            WHERE id_empleado = @id_empleado
          `);
        } else {
          // Insertar nueva firma
          await request.query(`
            INSERT INTO [Permisos].[dbo].[Firmas]
            (id_empleado, nombre_archivo, datos_archivo, tipo_archivo, subido_por, fecha_subida)
            VALUES (@id_empleado, @nombre_archivo, @datos_archivo, @tipo_archivo, @subido_por, GETDATE())
          `);
        }

        await transaction.commit();
        res.json({ success: true, message: 'Firma guardada correctamente' });
      } catch (error) {
        await transaction.rollback();
        if (error.number === 2627 || error.number === 2601) {
          return res.status(400).json({ success: false, error: 'Ya existe una firma para este empleado' });
        }
        throw error;
      }
    } catch (error) {
      console.error('Error en uploadSignature:', error);
      res.status(500).json({ success: false, error: `Error al guardar la firma: ${error.message}` });
    }
  },

 
  getSignature: async (req, res) => {
    try {
      const id_empleado = req.usuario?.id;
      if (!id_empleado) {
        return res.status(400).json({ success: false, error: 'ID de empleado es requerido' });
      }

      const pool = await getPoolPermisos();
      const request = pool.request();
      const result = await request
        .input('id_empleado', sql.VarChar(50), id_empleado)
        .query(`
          SELECT nombre_archivo, datos_archivo, tipo_archivo
          FROM [Permisos].[dbo].[Firmas]
          WHERE id_empleado = @id_empleado
        `);

      if (!result.recordset[0]) {
        return res.status(404).json({ success: false, error: 'Firma no encontrada' });
      }

      const { nombre_archivo, datos_archivo, tipo_archivo } = result.recordset[0];
      res.setHeader('Content-Type', tipo_archivo);
      res.setHeader('Content-Disposition', `inline; filename="${nombre_archivo}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(datos_archivo);
    } catch (error) {
      console.error('Error en getSignature:', error);
      res.status(500).json({ success: false, error: `Error al obtener la firma: ${error.message}` });
    }
  },
  getDiasDisponibles: async (req, res) => {
  try {
    if (!req.usuario?.id) {
      throw new Error('No se proporcionó un identificador de usuario');
    }

    const diasDisponibles = await obtenerDiasDisponibles(req.usuario.id);
    
    // Asegurar estructura consistente
    const response = {
      success: true,
      diasDisponibles: {
        total: diasDisponibles?.total || 0,
        anos: diasDisponibles?.anos || []
      }
    };

    console.log(`Respuesta de /dias-disponibles para ${req.usuario.id}:`, JSON.stringify(response));
    res.json(response);
  } catch (error) {
    console.error('Error en getDiasDisponibles:', error);
    res.status(500).json({ 
      success: false, 
      error: `Error al obtener días disponibles: ${error.message}`,
      diasDisponibles: { total: 0, anos: [] } // Respuesta de respaldo
    });
  }
},

  getMantenimientoJefes: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      if (!req.usuario?.id) {
        throw new Error('No se proporcionó un identificador de usuario');
      }

      const pool = await getPoolPermisos();
      
      const request1 = pool.request();
      const jefesResult = await request1
        .query(`
          SELECT id, id_empleado, nombre_jefe, unidad, tipo_jefe, activo
          FROM [Permisos].[dbo].[MantenimientoJefes]
        `);
      request1.cancel(); // Liberar el request

      const request2 = pool.request();
      const areasResult = await request2
        .query(`
          SELECT id, nombre_area
          FROM [Permisos].[dbo].[Area_Jefe]
          WHERE activo = 1
        `);
      request2.cancel(); // Liberar el request

      res.render('mantenimiento-jefes', {
        usuario: req.usuario?.usuario || 'ECRUZ',
        jefes: jefesResult.recordset,
        areas: areasResult.recordset,
        error: null
      });
    } catch (error) {
      console.error('Error en getMantenimientoJefes:', error);
      res.render('mantenimiento-jefes', {
        usuario: req.usuario?.usuario || 'ECRUZ',
        jefes: [],
        areas: [],
        error: `Error al cargar los datos: ${error.message}`
      });
    }
  },

  getJefes: async (req, res) => {
    try {
      const pool = await getPoolPermisos();
      const request = pool.request();
      const result = await request
        .query(`
          SELECT id, id_empleado, nombre_jefe, unidad, tipo_jefe, activo
          FROM [Permisos].[dbo].[MantenimientoJefes]
        `);
      request.cancel(); // Liberar el request

      res.json({ success: true, data: result.recordset });
    } catch (error) {
      console.error('Error en getJefes:', error);
      res.status(500).json({ success: false, error: `Error al obtener los jefes: ${error.message}` });
    }
  },

  addJefe: async (req, res) => {
    try {
      const { id_empleado, nombre_jefe, unidad, tipo_jefe } = req.body;

      if (!id_empleado || !nombre_jefe || !unidad || !tipo_jefe) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos' });
      }

      const pool = await getPoolPermisos();

      const request1 = pool.request();
      const areaResult = await request1
        .input('nombre_area', sql.VarChar, unidad)
        .query(`
          SELECT id
          FROM [Permisos].[dbo].[Area_Jefe]
          WHERE nombre_area = @nombre_area AND activo = 1
        `);
      request1.cancel(); // Liberar el request

      if (areaResult.recordset.length === 0) {
        return res.status(400).json({ success: false, error: 'La unidad especificada no existe o no está activa' });
      }

      const request2 = pool.request();
      const existingJefe = await request2
        .input('id_empleado', sql.VarChar, id_empleado)
        .input('unidad', sql.VarChar, unidad)
        .query(`
          SELECT id
          FROM [Permisos].[dbo].[MantenimientoJefes]
          WHERE id_empleado = @id_empleado AND unidad = @unidad AND activo = 1
        `);
      request2.cancel(); // Liberar el request

      if (existingJefe.recordset.length > 0) {
        return res.status(400).json({ success: false, error: 'Ya existe un jefe activo con este ID y unidad' });
      }

      if (!['Titular', 'Suplente'].includes(tipo_jefe)) {
        return res.status(400).json({ success: false, error: 'Tipo de jefe inválido' });
      }

      const request3 = pool.request();
      await request3
        .input('id_empleado', sql.VarChar, id_empleado)
        .input('nombre_jefe', sql.VarChar, nombre_jefe)
        .input('unidad', sql.VarChar, unidad)
        .input('tipo_jefe', sql.VarChar, tipo_jefe)
        .input('creado_por', sql.VarChar, req.usuario?.usuario || 'ECRUZ')
        .query(`
          INSERT INTO [Permisos].[dbo].[MantenimientoJefes] 
          (id_empleado, nombre_jefe, unidad, tipo_jefe, creado_por, creado_fecha)
          VALUES (@id_empleado, @nombre_jefe, @unidad, @tipo_jefe, @creado_por, GETDATE())
        `);
      request3.cancel(); // Liberar el request

      res.json({ success: true, message: 'Jefe agregado correctamente' });
    } catch (error) {
      console.error('Error en addJefe:', error);
      res.status(500).json({ success: false, error: `Error al agregar el jefe: ${error.message}` });
    }
  },

  updateJefe: async (req, res) => {
    try {
      const { id, id_empleado, nombre_jefe, unidad, tipo_jefe } = req.body;

      if (!id || !id_empleado || !nombre_jefe || !unidad || !tipo_jefe) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos' });
      }

      const pool = await getPoolPermisos();

      const request1 = pool.request();
      const areaResult = await request1
        .input('nombre_area', sql.VarChar, unidad)
        .query(`
          SELECT id
          FROM [Permisos].[dbo].[Area_Jefe]
          WHERE nombre_area = @nombre_area AND activo = 1
        `);
      request1.cancel(); // Liberar el request

      if (areaResult.recordset.length === 0) {
        return res.status(400).json({ success: false, error: 'La unidad especificada no existe o no está activa' });
      }

      const request2 = pool.request();
      const existingJefe = await request2
        .input('id', sql.Int, id)
        .input('id_empleado', sql.VarChar, id_empleado)
        .input('unidad', sql.VarChar, unidad)
        .query(`
          SELECT id
          FROM [Permisos].[dbo].[MantenimientoJefes]
          WHERE id_empleado = @id_empleado AND unidad = @unidad AND activo = 1 AND id != @id
        `);
      request2.cancel(); // Liberar el request

      if (existingJefe.recordset.length > 0) {
        return res.status(400).json({ success: false, error: 'Ya existe otro jefe activo con este ID y unidad' });
      }

      if (!['Titular', 'Suplente'].includes(tipo_jefe)) {
        return res.status(400).json({ success: false, error: 'Tipo de jefe inválido' });
      }

      const request3 = pool.request();
      const result = await request3
        .input('id', sql.Int, id)
        .input('id_empleado', sql.VarChar, id_empleado)
        .input('nombre_jefe', sql.VarChar, nombre_jefe)
        .input('unidad', sql.VarChar, unidad)
        .input('tipo_jefe', sql.VarChar, tipo_jefe)
        .query(`
          UPDATE [Permisos].[dbo].[MantenimientoJefes]
          SET id_empleado = @id_empleado, nombre_jefe = @nombre_jefe, unidad = @unidad, tipo_jefe = @tipo_jefe
          WHERE id = @id
        `);
      request3.cancel(); // Liberar el request

      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ success: false, error: 'Jefe no encontrado' });
      }

      res.json({ success: true, message: 'Jefe actualizado correctamente' });
    } catch (error) {
      console.error('Error en updateJefe:', error);
      res.status(500).json({ success: false, error: `Error al actualizar el jefe: ${error.message}` });
    }
  },

  toggleJefeStatus: async (req, res) => {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Falta el ID del jefe' });
      }

      const pool = await getPoolPermisos();
      const request1 = pool.request();
      const jefeResult = await request1
        .input('id', sql.Int, id)
        .query(`
          SELECT activo
          FROM [Permisos].[dbo].[MantenimientoJefes]
          WHERE id = @id
        `);
      request1.cancel(); // Liberar el request

      if (jefeResult.recordset.length === 0) {
        return res.status(404).json({ success: false, error: 'Jefe no encontrado' });
      }

      const nuevoEstado = !jefeResult.recordset[0].activo;

      const request2 = pool.request();
      await request2
        .input('id', sql.Int, id)
        .input('activo', sql.Bit, nuevoEstado)
        .query(`
          UPDATE [Permisos].[dbo].[MantenimientoJefes]
          SET activo = @activo
          WHERE id = @id
        `);
      request2.cancel(); // Liberar el request

      res.json({ 
        success: true, 
        message: `Jefe ${nuevoEstado ? 'activado' : 'desactivado'} correctamente` 
      });
    } catch (error) {
      console.error('Error en toggleJefeStatus:', error);
      res.status(500).json({ success: false, error: `Error al cambiar el estado del jefe: ${error.message}` });
    }
  },

  getAreas: async (req, res) => {
    try {
      const pool = await getPoolPermisos();
      const request = pool.request();
      const result = await request
        .query(`
          SELECT nombre_area
          FROM [Permisos].[dbo].[Area_Jefe]
          WHERE activo = 1
        `);
      request.cancel(); // Liberar el request

      res.json({ success: true, data: result.recordset.map(r => r.nombre_area) });
    } catch (error) {
      console.error('Error en getAreas:', error);
      res.status(500).json({ success: false, error: `Error al obtener las áreas: ${error.message}` });
    }
  },

  addArea: async (req, res) => {
    try {
      const { nombre_area } = req.body;

      if (!nombre_area) {
        return res.status(400).json({ success: false, error: 'El nombre de la unidad es obligatorio' });
      }

      const pool = await getPoolPermisos();

      const request1 = pool.request();
      const existingArea = await request1
        .input('nombre_area', sql.VarChar, nombre_area)
        .query(`
          SELECT id
          FROM [Permisos].[dbo].[Area_Jefe]
          WHERE nombre_area = @nombre_area
        `);
      request1.cancel(); // Liberar el request

      if (existingArea.recordset.length > 0) {
        return res.status(400).json({ success: false, error: 'Ya existe una unidad con este nombre' });
      }

      const request2 = pool.request();
      await request2
        .input('nombre_area', sql.VarChar, nombre_area)
        .input('creado_por', sql.VarChar, req.usuario?.usuario || 'ECRUZ')
        .query(`
          INSERT INTO [Permisos].[dbo].[Area_Jefe] 
          (nombre_area, activo, creado_por, creado_fecha)
          VALUES (@nombre_area, 1, @creado_por, GETDATE())
        `);
      request2.cancel(); // Liberar el request

      res.json({ success: true, message: 'Unidad agregada correctamente' });
    } catch (error) {
      console.error('Error en addArea:', error);
      res.status(500).json({ success: false, error: `Error al agregar la unidad: ${error.message}` });
    }
  },

  getJefeById: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Falta el ID del jefe' });
      }

      const pool = await getPoolPermisos();
      const request = pool.request();
      const result = await request
        .input('id', sql.Int, id)
        .query(`
          SELECT id, id_empleado, nombre_jefe, unidad, tipo_jefe, activo
          FROM [Permisos].[dbo].[MantenimientoJefes]
          WHERE id = @id
        `);
      request.cancel(); // Liberar el request

      if (result.recordset.length === 0) {
        return res.status(404).json({ success: false, error: 'Jefe no encontrado' });
      }

      res.json({ success: true, data: result.recordset[0] });
    } catch (error) {
      console.error('Error en getJefeById:', error);
      res.status(500).json({ success: false, error: `Error al obtener el jefe: ${error.message}` });
    }
  },
checkSignature: async (req, res) => {
  try {
    const id_empleado = req.usuario?.id;
    if (!id_empleado) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado o ID de empleado no disponible',
      });
    }

    console.log('Verificando firma para id_empleado:', id_empleado);
    const pool = await getPoolPermisos();
    const request = pool.request();
    const result = await request
      .input('id_empleado', sql.VarChar(50), id_empleado)
      .query(`
        SELECT id
        FROM [Permisos].[dbo].[Firmas]
        WHERE id_empleado = @id_empleado
      `);
    request.cancel(); // Liberar la solicitud

    const firmaExiste = result.recordset.length > 0;
    console.log('Firma existe:', firmaExiste);

    return res.status(200).json({
      success: true,
      hasSignature: firmaExiste,
    });
  } catch (error) {
    console.error('Error al verificar firma:', error);
    return res.status(500).json({
      success: false,
      error: `Error al verificar la firma: ${error.message}`,
    });
  }
},
  checkJefeStatus: async (req, res, next) => {
    try {
      if (!req.usuario?.id) {
        return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
      }

      const pool = await getPoolPermisos();
      const request = pool.request();
      const result = await request
        .input('id_empleado', sql.VarChar, req.usuario.id)
        .query(`
          SELECT id, unidad
          FROM [Permisos].[dbo].[MantenimientoJefes]
          WHERE id_empleado = @id_empleado AND activo = 1
        `);
      request.cancel(); // Liberar el request

      req.jefeData = {
        isJefe: result.recordset.length > 0,
        unidad: result.recordset.length > 0 ? result.recordset[0].unidad : null,
      };

      if (!req.jefeData.isJefe) {
        return res.status(403).render('error', {
          message: 'No tiene permisos para acceder a esta página. Solo los jefes activos pueden ver las solicitudes de aprobación.',
          usuario: req.usuario?.usuario || 'ECRUZ',
        });
      }

      next();
    } catch (error) {
      console.error('Error en checkJefeStatus:', error);
      res.status(500).json({ success: false, error: `Error al verificar el estado del jefe: ${error.message}` });
    }
  },
buscarEmpleados: async (req, res) => {
    try {
        const { term } = req.query;
        console.log('Término de búsqueda:', term); // Depuración

        // Validar que term exista y tenga al menos 2 caracteres
        if (!term || term.length < 2) {
            console.log('Término inválido o demasiado corto');
            return res.json([]);
        }

        const pool = await getPoolPermisos();
        const request = pool.request();
        const result = await request
            .input('term', sql.NVarChar, `%${term}%`)
            .query(`
                SELECT DISTINCT TOP 10 nombre
                FROM [Permisos].[dbo].[solicitud]
                WHERE nombre LIKE @term AND nombre IS NOT NULL
                ORDER BY nombre
            `);
        request.cancel(); // Liberar el request

        console.log('Resultados de la consulta:', result.recordset); // Depuración
        res.json(result.recordset);
    } catch (error) {
        console.error('Error en buscarEmpleados:', error);
        res.status(500).json({ success: false, error: `Error al buscar solicitantes: ${error.message}` });
    }
},
  exportJefes: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const { estado, unidad, tipo } = req.query;

      let query = `
        SELECT id_empleado, nombre_jefe, unidad, tipo_jefe, activo
        FROM [Permisos].[dbo].[MantenimientoJefes]
        WHERE 1=1
      `;
      let filename = 'Jefes.csv';
      const request = (await getPoolPermisos()).request();

      if (estado === 'activo') {
        query += ' AND activo = 1';
        filename = 'Jefes_Activos.csv';
      } else if (estado === 'inactivo') {
        query += ' AND activo = 0';
        filename = 'Jefes_Inactivos.csv';
      }

      if (unidad && unidad !== 'all') {
        query += ' AND unidad = @unidad';
        request.input('unidad', sql.VarChar, unidad);

        const request2 = (await getPoolPermisos()).request();
        const areaResult = await request2
          .input('nombre_area', sql.VarChar, unidad)
          .query(`
            SELECT id
            FROM [Permisos].[dbo].[Area_Jefe]
            WHERE nombre_area = @nombre_area
          `);
        request2.cancel(); // Liberar el request

        if (areaResult.recordset.length === 0) {
          return res.status(400).json({ success: false, error: 'La unidad especificada no existe' });
        }
      }

      if (tipo && tipo !== 'all') {
        query += ' AND tipo_jefe = @tipo';
        request.input('tipo', sql.VarChar, tipo);
      }

      const result = await request.query(query);
      request.cancel(); // Liberar el request

      if (result.recordset.length === 0) {
        return res.status(404).json({ success: false, error: 'No se encontraron jefes para exportar' });
      }

      const csvStringifier = require('csv-stringify').stringify;
      const records = result.recordset.map(record => ({
        ...record,
        activo: record.activo ? 'Activo' : 'Inactivo',
      }));

      const csvContent = await new Promise((resolve, reject) => {
        csvStringifier(records, {
          header: true,
          columns: [
            { key: 'id_empleado', header: 'ID Empleado' },
            { key: 'nombre_jefe', header: 'Nombre' },
            { key: 'unidad', header: 'Unidad' },
            { key: 'tipo_jefe', header: 'Tipo de Jefe' },
            { key: 'activo', header: 'Estado' },
          ],
        }, (err, output) => {
          if (err) reject(err);
          else resolve(output);
        });
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.write('\uFEFF'); // BOM para soporte de UTF-8 en Excel
      res.send(csvContent);
    } catch (error) {
      console.error('Error en exportJefes:', error);
      res.status(500).send(`Error al generar el archivo CSV: ${error.message}`);
    }
  },
};

module.exports = {
  ...controller,
  getNombreEmpleado, // Añadir la nueva función
};