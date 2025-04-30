const sql = require('mssql');
const { getPool: getPoolPlanilla } = require('../config/dbPlanilla');
const { getPool: getPoolPermisos } = require('../config/dbconfig');
const { getPool: getPoolVacaciones } = require('../config/dbVacaciones');
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
        error: 'Error al cargar las solicitudes',
      });
    }
  },

  getDiasDisponibles: async (req, res) => {
    try {
      if (!req.usuario?.id) {
        throw new Error('No se proporcionó un identificador de usuario');
      }

      const diasDisponibles = await obtenerDiasDisponibles(req.usuario.id);

      res.json({ success: true, diasDisponibles });
    } catch (error) {
      console.error('Error en getDiasDisponibles:', error);
      res.status(500).json({ success: false, error: 'Error al obtener días disponibles' });
    }
  },

  createSolicitud: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const { fecha_inicio, fecha_fin, observaciones, nombrePersona, fecha_reincorporacion } = req.body;
      const area_solicitante = req.usuario?.unidad || 'Sin Área';

      if (!fecha_inicio || !fecha_fin || !nombrePersona || !fecha_reincorporacion) {
        return res.status(400).json({ success: false, error: 'Faltan datos requeridos' });
      }

      const inicio = new Date(fecha_inicio + 'T00:00:00Z');
      const fin = new Date(fecha_fin + 'T00:00:00Z');
      const reincorporacion = new Date(fecha_reincorporacion + 'T00:00:00Z');

      if (isNaN(inicio) || isNaN(fin) || isNaN(reincorporacion) || inicio > fin) {
        return res.status(400).json({ success: false, error: 'Fechas inválidas' });
      }

      const totalDias = calcularDiasLaborables(inicio, fin);

      if (totalDias <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Las fechas seleccionadas no incluyen días laborables',
        });
      }

      const expectedReincorporacionStr = calcularFechaReincorporacion(fin);

      if (fecha_reincorporacion !== expectedReincorporacionStr) {
        console.warn(
          `Fecha de reincorporación inválida: recibida=${fecha_reincorporacion}, esperada=${expectedReincorporacionStr}`
        );
        return res.status(400).json({ success: false, error: 'Fecha de reincorporación inválida' });
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
        fecha_inicio,
        fecha_fin,
        fecha_reincorporacion,
        total_dias: totalDias,
        observaciones,
      });

      const solicitud = await obtenerSolicitudPorId(solicitudId);

      console.log(`Intentando enviar correo al jefe: selvin.flores@unah.hn`);
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
      res.status(500).json({ success: false, error: 'Error al crear la solicitud' });
    }
  },

  exportIndex: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const { type, estado } = req.query;

      const puestoResult = await (await getPoolPlanilla())
        .request()
        .input('dni', sql.VarChar, req.usuario?.id)
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

      const solicitudesResult = await (await getPoolPermisos())
        .request()
        .input('usuario_id', sql.Int, usuario_id)
        .query(query);

      await exportarSolicitudesExcel(solicitudesResult.recordset, worksheetName, filename, res);
    } catch (error) {
      console.error('Error al exportar:', error);
      res.status(500).send('Error al generar el reporte');
    }
  },

  getAprobacion: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      if (!req.usuario?.id) {
        throw new Error('No se proporcionó un identificador de usuario');
      }

      const pool = await getPoolPermisos();

      const solicitudesResult = await pool
        .request()
        .query(`
          SELECT sv.id, sv.nombre, sv.area_solicitante, sv.fecha_solicitud, sv.fecha_inicio, sv.fecha_fin, sv.fecha_reincorporacion, 
                 sv.total_dias, sv.estado, sv.observaciones, sv.observaciones_rechazo, sv.aprobado_por_rh 
          FROM [Permisos].[dbo].[solicitud] sv
          WHERE sv.estado = 'Pendiente'
        `);

      const historicoResult = await pool
        .request()
        .query(`
          SELECT sv.id, sv.nombre, sv.area_solicitante, sv.fecha_solicitud, sv.fecha_inicio, sv.fecha_fin, sv.fecha_reincorporacion, 
                 sv.total_dias, sv.estado, sv.observaciones, sv.observaciones_rechazo, sv.aprobado_por_rh 
          FROM [Permisos].[dbo].[solicitud] sv
          WHERE sv.estado != 'Pendiente'
        `);

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
      const result = await (await getPoolPermisos())
        .request()
        .input('id', sql.Int, id)
        .query(`
          SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, 
                 total_dias, estado, observaciones, observaciones_rechazo, aprobado_por_rh 
          FROM [Permisos].[dbo].[solicitud] WHERE id = @id
        `);
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

      const pool = await getPoolPermisos();
      const solicitudResult = await pool
        .request()
        .input('id', sql.Int, id)
        .query(
          'SELECT usuario_id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, total_dias, estado, observaciones FROM [Permisos].[dbo].[solicitud] WHERE id = @id'
        );

      if (!solicitudResult.recordset[0]) {
        return res.status(400).json({ success: false, error: 'Solicitud no encontrada' });
      }

      const solicitud = {
        ...solicitudResult.recordset[0],
        fecha_solicitud: new Date(solicitudResult.recordset[0].fecha_solicitud),
        fecha_inicio: new Date(solicitudResult.recordset[0].fecha_inicio),
        fecha_fin: new Date(solicitudResult.recordset[0].fecha_fin),
        fecha_reincorporacion: new Date(solicitudResult.recordset[0].fecha_reincorporacion),
      };

      const request = pool.request().input('id', sql.Int, id);

      if (accion === 'aprobar') {
        request
          .input('estado', sql.VarChar, 'Aprobado por Jefe')
          .input('aprobado_por', sql.Int, 1)
          .input('fecha_aprobacion', sql.DateTime, new Date());

        await request.query(
          `UPDATE [Permisos].[dbo].[solicitud]
           SET estado = @estado, aprobado_por = @aprobado_por, fecha_aprobacion = @fecha_aprobacion
           WHERE id = @id AND estado = 'Pendiente'`
        );

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
        request
          .input('estado', sql.VarChar, 'Rechazado')
          .input('observaciones_rechazo', sql.VarChar, observaciones_rechazo || null)
          .input('fecha_aprobacion', sql.DateTime, new Date());

        await request.query(
          `UPDATE [Permisos].[dbo].[solicitud]
           SET estado = @estado, observaciones_rechazo = @observaciones_rechazo, fecha_aprobacion = @fecha_aprobacion
           WHERE id = @id AND estado = 'Pendiente'`
        );

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
        res.status(400).json({ success: false, error: 'Acción no válida' });
      }
    } catch (error) {
      console.error('Error al actualizar solicitud:', error);
      res.status(500).json({ success: false, error: `Error al procesar: ${error.message}` });
    }
  },

  getAprobacionRH: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const pool = await getPoolPermisos();

      const solicitudesResult = await pool
        .request()
        .query(
          `SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, 
                  total_dias, estado, observaciones, observaciones_rechazo, aprobado_por_rh 
           FROM [Permisos].[dbo].[solicitud] WHERE estado = 'Aprobado por Jefe'`
        );

      const historicoResult = await pool
        .request()
        .query(
          `SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, 
                  total_dias, estado, observaciones, observaciones_rechazo, aprobado_por_rh 
           FROM [Permisos].[dbo].[solicitud] WHERE estado IN ('Aprobado', 'Rechazado')`
        );

      const areasResult = await pool
        .request()
        .query(
          `SELECT DISTINCT area_solicitante 
           FROM [Permisos].[dbo].[solicitud] 
           WHERE area_solicitante IS NOT NULL`
        );

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

      const poolPermisos = await getPoolPermisos();
      const poolVacaciones = await getPoolVacaciones();

      const transaction = new sql.Transaction(poolPermisos);
      await transaction.begin();

      try {
        const solicitudResult = await transaction
          .request()
          .input('id', sql.Int, id)
          .query(
            'SELECT usuario_id, total_dias, estado, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, observaciones FROM [Permisos].[dbo].[solicitud] WHERE id = @id'
          );

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

        const puestoResult = await (await getPoolPlanilla())
          .request()
          .input('id', sql.Int, usuario_id)
          .query('SELECT DNI FROM [Planilla].[dbo].[Puesto] WHERE ID = @id');

        if (!puestoResult.recordset[0]) {
          await transaction.rollback();
          throw new Error('Usuario no encontrado en la base de datos de planilla');
        }
        const dni = puestoResult.recordset[0].DNI;

        const request = transaction.request().input('id', sql.Int, id);

        if (accion === 'aprobar') {
          request
            .input('estado', sql.VarChar, 'Aprobado')
            .input('aprobado_por_rh', sql.Int, 2)
            .input('fecha_aprobacion', sql.DateTime, new Date());

          await request.query(
            `UPDATE [Permisos].[dbo].[solicitud]
             SET estado = @estado, aprobado_por_rh = @aprobado_por_rh, fecha_aprobacion = @fecha_aprobacion
             WHERE id = @id AND estado = 'Aprobado por Jefe'`
          );

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
          request
            .input('estado', sql.VarChar, 'Rechazado')
            .input('observaciones_rechazo', sql.VarChar, observaciones_rechazo || null)
            .input('fecha_aprobacion', sql.DateTime, new Date());

          await request.query(
            `UPDATE [Permisos].[dbo].[solicitud]
             SET estado = @estado, observaciones_rechazo = @observaciones_rechazo, fecha_aprobacion = @fecha_aprobacion
             WHERE id = @id AND estado = 'Aprobado por Jefe'`
          );

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

      let query = `
        SELECT sv.id, sv.nombre, sv.area_solicitante, sv.fecha_solicitud, sv.fecha_inicio, sv.fecha_fin, 
               sv.fecha_reincorporacion, sv.total_dias, sv.estado, sv.observaciones, sv.observaciones_rechazo, sv.aprobado_por_rh 
        FROM [Permisos].[dbo].[solicitud] sv
        WHERE 1=1
      `;
      let filename = 'Solicitudes_Aprobacion.xlsx';
      let worksheetName = 'Aprobaciones';

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

      const solicitudesResult = await (await getPoolPermisos())
        .request()
        .query(query);

      await exportarSolicitudesExcel(solicitudesResult.recordset, worksheetName, filename, res);
    } catch (error) {
      console.error('Error al exportar aprobaciones:', error);
      res.status(500).send('Error al generar el reporte');
    }
  },

  exportAprobacionRH: async (req, res, { puesto, usuarios, usuario }) => {
    try {
      const { type, estado } = req.query;

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

      const solicitudesResult = await (await getPoolPermisos()).request().query(query);

      await exportarSolicitudesExcel(solicitudesResult.recordset, worksheetName, filename, res);
    } catch (error) {
      console.error('Error al exportar aprobaciones RH:', error);
      res.status(500).send('Error al generar el reporte');
    }
  },

  getReporteRH: async (req, res) => {
    try {
      const { fechaInicio, fechaFin, areas, estados } = req.query;

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

      const result = await request.query(query);

      // Procesar datos para gráficas
      const reportAreas = [...new Set(result.recordset.map(r => r.area_solicitante))].filter(a => a);
      const estadosDisponibles = ['Aprobado por Jefe', 'Aprobado', 'Rechazado'];
      const meses = Array.from({ length: 12 }, (_, i) => i + 1); // Meses 1-12

      // Datos para gráfico de barras (solicitudes por estado y área)
      const barData = reportAreas.map(area => ({
        area,
        pendiente: result.recordset.find(r => r.area_solicitante === area && r.estado === 'Aprobado por Jefe')?.cantidad || 0,
        aprobado: result.recordset.find(r => r.area_solicitante === area && r.estado === 'Aprobado')?.cantidad || 0,
        rechazado: result.recordset.find(r => r.area_solicitante === area && r.estado === 'Rechazado')?.cantidad || 0,
      }));

      // Datos para gráfico de líneas (solicitudes por mes)
      const lineData = meses.map(mes => ({
        mes: new Date(0, mes - 1).toLocaleString('es', { month: 'short' }),
        cantidad: result.recordset.filter(r => r.mes === mes).reduce((sum, r) => sum + r.cantidad, 0),
      }));

      // Datos para gráfico de dona (días solicitados por área)
      const donutData = reportAreas.map(area => ({
        area,
        total_dias: result.recordset.filter(r => r.area_solicitante === area).reduce((sum, r) => sum + (r.total_dias || 0), 0),
      }));

      // Estadísticas adicionales
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
};

module.exports = controller;