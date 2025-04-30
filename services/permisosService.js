const sql = require('mssql');
const { getPool: getPoolPermisos } = require('../config/dbconfig');

const obtenerSolicitudesPorUsuario = async (usuario_id) => {
  const solicitudesResult = await (await getPoolPermisos())
    .request()
    .input('usuario_id', sql.Int, usuario_id)
    .query(
      'SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, total_dias, estado, observaciones, observaciones_rechazo, aprobado_por_rh FROM [Permisos].[dbo].[solicitud] WHERE usuario_id = @usuario_id'
    );

  return solicitudesResult.recordset.map((s) => ({
    ...s,
    fecha_solicitud: s.fecha_solicitud ? new Date(s.fecha_solicitud) : null,
    fecha_inicio: s.fecha_inicio ? new Date(s.fecha_inicio) : null,
    fecha_fin: s.fecha_fin ? new Date(s.fecha_fin) : null,
    fecha_reincorporacion: s.fecha_reincorporacion ? new Date(s.fecha_reincorporacion) : null,
  }));
};

const crearSolicitud = async ({
  usuario_id,
  nombre,
  area_solicitante,
  fecha_inicio,
  fecha_fin,
  fecha_reincorporacion,
  total_dias,
  observaciones,
}) => {
  const result = await (await getPoolPermisos())
    .request()
    .input('usuario_id', sql.Int, usuario_id)
    .input('nombre', sql.VarChar, nombre)
    .input('area_solicitante', sql.VarChar, area_solicitante)
    .input('tipo_permiso', sql.VarChar, 'Vacaciones')
    .input('fecha_solicitud', sql.DateTime, new Date())
    .input('fecha_inicio', sql.Date, fecha_inicio)
    .input('fecha_fin', sql.Date, fecha_fin)
    .input('fecha_reincorporacion', sql.Date, fecha_reincorporacion)
    .input('total_dias', sql.Int, total_dias)
    .input('estado', sql.VarChar, 'Pendiente')
    .input('observaciones', sql.VarChar, observaciones || null)
    .query(`
      INSERT INTO [Permisos].[dbo].[solicitud] 
      (usuario_id, nombre, area_solicitante, tipo_permiso, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, total_dias, estado, observaciones)
      VALUES (@usuario_id, @nombre, @area_solicitante, @tipo_permiso, @fecha_solicitud, @fecha_inicio, @fecha_fin, @fecha_reincorporacion, @total_dias, @estado, @observaciones);
      SELECT SCOPE_IDENTITY() AS id;
    `);

  return result.recordset[0].id;
};

const obtenerSolicitudPorId = async (id) => {
  const solicitudResult = await (await getPoolPermisos())
    .request()
    .input('id', sql.Int, id)
    .query(
      'SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, total_dias, estado, observaciones FROM [Permisos].[dbo].[solicitud] WHERE id = @id'
    );

  if (!solicitudResult.recordset[0]) return null;

  return {
    ...solicitudResult.recordset[0],
    fecha_solicitud: new Date(solicitudResult.recordset[0].fecha_solicitud),
    fecha_inicio: new Date(solicitudResult.recordset[0].fecha_inicio),
    fecha_fin: new Date(solicitudResult.recordset[0].fecha_fin),
    fecha_reincorporacion: new Date(solicitudResult.recordset[0].fecha_reincorporacion),
  };
};

module.exports = {
  obtenerSolicitudesPorUsuario,
  crearSolicitud,
  obtenerSolicitudPorId,
};