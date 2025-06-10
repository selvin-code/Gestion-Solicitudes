const sql = require('mssql');
const { getPool: getPoolVacaciones } = require('../config/dbVacaciones');

const obtenerDiasDisponibles = async (dni) => {
  try {
    console.log(`Iniciando obtenerDiasDisponibles para DNI: ${dni}`);
    const currentYear = new Date().getFullYear();
    const validYears = [currentYear - 2, currentYear - 1, currentYear];

    const pool = await getPoolVacaciones();
    const request = pool.request()
      .input('id', sql.VarChar, dni)
      .input('year1', sql.Int, validYears[0])
      .input('year2', sql.Int, validYears[1])
      .input('year3', sql.Int, validYears[2]);
    request.queryTimeout = 30000;

    const vacacionesResult = await request.query(`
      SELECT [anio],
             [vacaciones_t] AS vacaciones_totales,
             COALESCE([vacaciones_g], 0) AS vacaciones_gozadas,
             ([vacaciones_t] - COALESCE([vacaciones_g], 0)) AS dias_disponibles
      FROM [Vacaciones].[dbo].[VacacionesUSR2_prueba] WITH (NOLOCK)
      WHERE [id] = @id AND [Estado] = 'Activo' AND [anio] IN (@year1, @year2, @year3)
    `);

    const diasDisponibles = {
      total: 0,
      anos: validYears.map((ano) => ({
        ano,
        dias: 0,
        isExpired: ano < currentYear - 1,
      })),
    };

    vacacionesResult.recordset.forEach((v) => {
      const index = diasDisponibles.anos.findIndex((a) => a.ano === v.anio);
      if (index !== -1) {
        diasDisponibles.anos[index].dias = v.dias_disponibles;
      }
    });

    diasDisponibles.total = diasDisponibles.anos.reduce(
      (sum, v) => sum + (v.isExpired ? Math.max(0, v.dias) : v.dias),
      0
    );

    console.log(`Días disponibles para ${dni}: ${JSON.stringify(diasDisponibles)}`);
    return diasDisponibles;
  } catch (error) {
    console.error(`Error en obtenerDiasDisponibles para DNI: ${dni}`, error);
    throw new Error(`No se pudieron obtener los días disponibles: ${error.message}`);
  }
};

const actualizarVacaciones = async (dni, total_dias) => {
  console.warn('Deprecation: actualizarVacaciones is deprecated. Use actualizarVacacionesPorSeleccion instead.');
  const currentYear = new Date().getFullYear();
  await actualizarVacacionesPorSeleccion(dni, [{ ano: currentYear, dias: total_dias }]);
};

const actualizarVacacionesPorSeleccion = async (dni, selecciones) => {
  const pool = await getPoolVacaciones();
  const transaction = new sql.Transaction(pool);
  const currentYear = new Date().getFullYear();

  try {
    await transaction.begin();

    // Validar selecciones
    const totalDiasSolicitados = selecciones.reduce((sum, sel) => sum + sel.dias, 0);
    if (totalDiasSolicitados <= 0) {
      throw new Error('No se especificaron días a descontar');
    }

    // Obtener saldos actuales
    const diasDisponibles = await obtenerDiasDisponibles(dni);
    console.log('Saldos disponibles:', JSON.stringify(diasDisponibles));

    // Validar reglas por año
    for (const seleccion of selecciones) {
      const { ano, dias } = seleccion;
      const saldoAno = diasDisponibles.anos.find((a) => a.ano === ano);
      if (!saldoAno) {
        throw new Error(`No se encontró registro de vacaciones para el año ${ano}`);
      }
      if (ano < currentYear - 1 && dias > saldoAno.dias) {
        throw new Error(`No se puede exceder el saldo disponible (${saldoAno.dias}) en el año vencido ${ano}`);
      }
      if (ano === currentYear && ano !== 2025 && dias > saldoAno.dias) {
        throw new Error(`No se puede exceder el saldo disponible (${saldoAno.dias}) en el año ${ano}`);
      }
    }

    // Actualizar saldos por año seleccionado
    for (const seleccion of selecciones) {
      const { ano, dias } = seleccion;

      // Obtener el valor actual de vacaciones_g
      const request = transaction.request();
      const result = await request
        .input('dni', sql.VarChar, dni)
        .input('anio', sql.Int, ano)
        .query(`
          SELECT COALESCE([vacaciones_g], 0) AS vacaciones_g
          FROM [Vacaciones].[dbo].[VacacionesUSR2_prueba]
          WHERE [id] = @dni AND [anio] = @anio AND [Estado] = 'Activo'
        `);

      if (!result.recordset[0]) {
        throw new Error(`No se encontró registro activo para el año ${ano}`);
      }

      const currentVacacionesG = result.recordset[0].vacaciones_g;
      const nuevoVacacionesG = currentVacacionesG + dias;

      // Actualizar vacaciones_g
      const updateRequest = transaction.request();
      await updateRequest
        .input('dni', sql.VarChar, dni)
        .input('anio', sql.Int, ano)
        .input('vacaciones_g', sql.Int, nuevoVacacionesG)
        .query(`
          UPDATE [Vacaciones].[dbo].[VacacionesUSR2_prueba]
          SET [vacaciones_g] = @vacaciones_g
          WHERE [id] = @dni AND [anio] = @anio AND [Estado] = 'Activo'
        `);

      console.log(
        `Actualizado para ${dni}, año ${ano}: vacaciones_g=${nuevoVacacionesG} (anterior=${currentVacacionesG}, días solicitados=${dias})`
      );
    }

    await transaction.commit();
    console.log(`Vacaciones actualizadas para ${dni}, selecciones=${JSON.stringify(selecciones)}`);
  } catch (error) {
    await transaction.rollback();
    console.error('Error en actualizarVacacionesPorSeleccion:', error);
    throw new Error(`No se pudieron actualizar las vacaciones: ${error.message}`);
  }
};

const obtenerVacacionesPorUsuario = async (usuario_id) => {
  try {
    console.log(`Iniciando obtenerVacacionesPorUsuario para usuario_id: ${usuario_id}`);
    const pool = await getPoolVacaciones();
    const request = pool.request()
      .input('usuario_id', sql.Int, usuario_id);

    console.log('Parámetros en obtenerVacacionesPorUsuario:', request.parameters);

    const result = await request.query(`
      SELECT 
        id,
        usuario_id,
        nombre,
        area_solicitante,
        tipo_permiso,
        fecha_solicitud,
        fecha_inicio,
        fecha_fin,
        fecha_reincorporacion,
        total_dias,
        estado,
        observaciones,
        observaciones_rechazo
      FROM [Permisos].[dbo].[solicitud]
      WHERE usuario_id = @usuario_id AND tipo_permiso = 'Vacaciones'
    `);

    const solicitudes = result.recordset.map(s => ({
      ...s,
      fecha_solicitud: s.fecha_solicitud ? new Date(s.fecha_solicitud) : null,
      fecha_inicio: s.fecha_inicio ? new Date(s.fecha_inicio) : null,
      fecha_fin: s.fecha_fin ? new Date(s.fecha_fin) : null,
      fecha_reincorporacion: s.fecha_reincorporacion ? new Date(s.fecha_reincorporacion) : null,
      tipo_solicitud: 'Vacaciones',
    }));

    console.log(`Vacaciones obtenidas para usuario ${usuario_id}: ${JSON.stringify(solicitudes)}`);
    return solicitudes;
  } catch (error) {
    console.error('Error en obtenerVacacionesPorUsuario:', error);
    throw new Error(`No se pudieron obtener las solicitudes de vacaciones: ${error.message}`);
  }
};

module.exports = {
  obtenerDiasDisponibles,
  actualizarVacaciones,
  actualizarVacacionesPorSeleccion,
  obtenerVacacionesPorUsuario,
};