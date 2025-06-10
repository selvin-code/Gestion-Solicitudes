const sql = require('mssql');
const { getPool } = require('../config/dbconfig');

async function obtenerSolicitudesPorUsuario(usuario_id) {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('usuario_id', sql.Int, usuario_id)
      .query(`
        SELECT id, nombre, area_solicitante, tipo_permiso, fecha_solicitud, fecha_inicio, fecha_fin, 
               fecha_reincorporacion, total_dias, estado, observaciones, observaciones_rechazo,
               hora_inicio, hora_fin, motivo
        FROM [Permisos].[dbo].[solicitud]
        WHERE usuario_id = @usuario_id
      `);
    return result.recordset.map(s => ({
      ...s,
      fecha_solicitud: s.fecha_solicitud ? new Date(s.fecha_solicitud) : null,
      fecha_inicio: s.fecha_inicio ? new Date(s.fecha_inicio) : null,
      fecha_fin: s.fecha_fin ? new Date(s.fecha_fin) : null,
      fecha_reincorporacion: s.fecha_reincorporacion ? new Date(s.fecha_reincorporacion) : null,
    }));
  } catch (error) {
    console.error('Error en obtenerSolicitudesPorUsuario:', error);
    throw error;
  }
}

async function crearSolicitud(data) {
  try {
    const pool = await getPool();
    const request = pool.request();
    const result = await request
      .input('usuario_id', sql.Int, data.usuario_id)
      .input('nombre', sql.VarChar, data.nombre)
      .input('area_solicitante', sql.VarChar, data.area_solicitante)
      .input('tipo_permiso', sql.VarChar, data.tipo_permiso)
      .input('fecha_inicio', sql.Date, data.fecha_inicio)
      .input('fecha_fin', sql.Date, data.fecha_fin)
      .input('fecha_reincorporacion', sql.Date, data.fecha_reincorporacion)
      .input('total_dias', sql.Int, data.total_dias || 0)
      .input('observaciones', sql.VarChar, data.observaciones || null)
      .input('hora_inicio', sql.VarChar, data.hora_inicio || null)
      .input('hora_fin', sql.VarChar, data.hora_fin || null)
      .input('horas_solicitadas', sql.Float, data.horas_solicitadas || null)
      .input('motivo', sql.VarChar, data.motivo || null)
      .query(`
        INSERT INTO [Permisos].[dbo].[solicitud]
        (usuario_id, nombre, area_solicitante, tipo_permiso, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, total_dias, observaciones, hora_inicio, hora_fin, horas_solicitadas, motivo)
        OUTPUT INSERTED.id
        VALUES (@usuario_id, @nombre, @area_solicitante, @tipo_permiso, GETDATE(), @fecha_inicio, @fecha_fin, @fecha_reincorporacion, @total_dias, @observaciones, @hora_inicio, @hora_fin, @horas_solicitadas, @motivo)
      `);
    request.cancel();
    return result.recordset[0].id;
  } catch (error) {
    console.error('Error en crearSolicitud:', error);
    throw error;
  }
}

async function obtenerSolicitudPorId(id) {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT id, usuario_id, nombre, area_solicitante, tipo_permiso, fecha_solicitud, fecha_inicio, 
               fecha_fin, fecha_reincorporacion, total_dias, estado, observaciones, observaciones_rechazo,
               hora_inicio, hora_fin, motivo
        FROM [Permisos].[dbo].[solicitud]
        WHERE id = @id
      `);
    if (!result.recordset[0]) throw new Error('Solicitud no encontrada');
    return {
      ...result.recordset[0],
      fecha_solicitud: result.recordset[0].fecha_solicitud ? new Date(result.recordset[0].fecha_solicitud) : null,
      fecha_inicio: result.recordset[0].fecha_inicio ? new Date(result.recordset[0].fecha_inicio) : null,
      fecha_fin: result.recordset[0].fecha_fin ? new Date(result.recordset[0].fecha_fin) : null,
      fecha_reincorporacion: result.recordset[0].fecha_reincorporacion ? new Date(result.recordset[0].fecha_reincorporacion) : null,
    };
  } catch (error) {
    console.error('Error en obtenerSolicitudPorId:', error);
    throw error;
  }
}

// Nueva función para guardar adjuntos en la base de datos
async function guardarAdjuntosSolicitud(id_solicitud, archivos) {
  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const archivo of archivos) {
        const request = transaction.request();
        await request
          .input('id_solicitud', sql.Int, id_solicitud)
          .input('nombre_archivo', sql.VarChar, archivo.originalname)
          .input('datos_archivo', sql.VarBinary(sql.MAX), archivo.buffer)
          .input('tipo_archivo', sql.VarChar, archivo.mimetype)
          .input('tamano_archivo', sql.Int, archivo.size)
          .query(`
            INSERT INTO [Permisos].[dbo].[adjuntos_solicitud]
            (id_solicitud, nombre_archivo, datos_archivo, tipo_archivo, tamano_archivo, fecha_subida)
            VALUES (@id_solicitud, @nombre_archivo, @datos_archivo, @tipo_archivo, @tamano_archivo, GETDATE())
          `);
        request.cancel();
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error en guardarAdjuntosSolicitud:', error);
    throw error;
  }
}

module.exports = {
  obtenerSolicitudesPorUsuario,
  crearSolicitud,
  obtenerSolicitudPorId,
  guardarAdjuntosSolicitud,
};