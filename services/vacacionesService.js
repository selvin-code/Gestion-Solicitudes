const sql = require('mssql');
const { getPool: getPoolVacaciones } = require('../config/dbVacaciones');

const obtenerDiasDisponibles = async (id) => {
  const vacacionesResult = await (await getPoolVacaciones())
    .request()
    .input('id', sql.VarChar, id)
    .query(`
      SELECT TOP 3 [anio],
             [vacaciones_t] AS vacaciones_totales,
             [vacaciones_g] AS vacaciones_gozadas,
             [vacaciones_t] AS dias_disponibles
      FROM [Vacaciones].[dbo].[VacacionesUSR2_prueba]
      WHERE [id] = @id AND [Estado] = 'Activo'
      ORDER BY [anio] DESC
    `);

  let diasDisponibles = { total: 0, anos: [] };
  if (vacacionesResult.recordset.length > 0) {
    diasDisponibles.anos = vacacionesResult.recordset.map((v) => ({
      anio: v.anio,
      dias_disponibles: v.dias_disponibles,
    }));
    diasDisponibles.total = diasDisponibles.anos.reduce((sum, v) => sum + v.dias_disponibles, 0);
    console.log(`Días disponibles para ${id}: ${JSON.stringify(diasDisponibles)}`);
  } else {
    console.log(`No se encontraron registros de vacaciones para ${id}`);
  }

  return diasDisponibles;
};

const actualizarVacaciones = async (dni, total_dias) => {
  const pool = await getPoolVacaciones();
  const vacacionesResult = await pool
    .request()
    .input('id', sql.VarChar, dni)
    .query(`
      SELECT [anio],
             [vacaciones_t] AS vacaciones_totales,
             [vacaciones_g] AS vacaciones_gozadas,
             [vacaciones_t] AS dias_disponibles
      FROM [Vacaciones].[dbo].[VacacionesUSR2_prueba]
      WHERE [id] = @id AND [Estado] = 'Activo' AND [anio] IN (2023, 2024, 2025)
      ORDER BY [anio] ASC
    `);

  console.log(
    `Antes de descontar: dni=${dni}, total_dias=${total_dias}, anos=${JSON.stringify(vacacionesResult.recordset)}`
  );

  let diasRestantes = total_dias;
  const anos = vacacionesResult.recordset;

  for (const ano of anos) {
    if (diasRestantes <= 0) break;

    const diasDisponibles = Math.max(0, ano.dias_disponibles);
    const diasADescontar = Math.min(diasDisponibles, diasRestantes);

    if (diasADescontar > 0) {
      const nuevoVacacionesT = ano.vacaciones_totales - diasADescontar;
      const nuevoVacacionesG = ano.vacaciones_gozadas + diasADescontar;
      await pool
        .request()
        .input('id', sql.VarChar, dni)
        .input('anio', sql.Int, ano.anio)
        .input('vacaciones_t', sql.Int, nuevoVacacionesT)
        .input('vacaciones_g', sql.Int, nuevoVacacionesG)
        .query(`
          UPDATE [Vacaciones].[dbo].[VacacionesUSR2_prueba]
          SET [vacaciones_t] = @vacaciones_t, [vacaciones_g] = @vacaciones_g
          WHERE [id] = @id AND [anio] = @anio AND [Estado] = 'Activo'
        `);
      console.log(
        `Descontado ${diasADescontar} días para ${dni}, año ${ano.anio}: vacaciones_t=${nuevoVacacionesT}, vacaciones_g=${nuevoVacacionesG}`
      );
      diasRestantes -= diasADescontar;
    }
  }

  if (diasRestantes > 0) {
    const anioMasReciente = 2025;
    const existeRegistro = anos.find((a) => a.anio === anioMasReciente);

    if (existeRegistro) {
      const nuevoVacacionesT = existeRegistro.vacaciones_totales - diasRestantes;
      const nuevoVacacionesG = existeRegistro.vacaciones_gozadas + diasRestantes;
      await pool
        .request()
        .input('id', sql.VarChar, dni)
        .input('anio', sql.Int, anioMasReciente)
        .input('vacaciones_t', sql.Int, nuevoVacacionesT)
        .input('vacaciones_g', sql.Int, nuevoVacacionesG)
        .query(`
          UPDATE [Vacaciones].[dbo].[VacacionesUSR2_prueba]
          SET [vacaciones_t] = @vacaciones_t, [vacaciones_g] = @vacaciones_g
          WHERE [id] = @id AND [anio] = @anio AND [Estado] = 'Activo'
        `);
      console.log(
        `Descontado ${diasRestantes} días para ${dni}, año ${anioMasReciente}: vacaciones_t=${nuevoVacacionesT}, vacaciones_g=${nuevoVacacionesG}`
      );
    } else {
      await pool
        .request()
        .input('id', sql.VarChar, dni)
        .input('anio', sql.Int, anioMasReciente)
        .input('vacaciones_t', sql.Int, -diasRestantes)
        .input('vacaciones_g', sql.Int, diasRestantes)
        .input('estado', sql.VarChar, 'Activo')
        .query(`
          INSERT INTO [Vacaciones].[dbo].[VacacionesUSR2_prueba]
          ([id], [anio], [vacaciones_t], [vacaciones_g], [Estado])
          VALUES (@id, @anio, @vacaciones_t, @vacaciones_g, @estado)
        `);
      console.log(
        `Creado registro para ${dni}, año ${anioMasReciente}: vacaciones_t=${-diasRestantes}, vacaciones_g=${diasRestantes}`
      );
    }
  }

  console.log(`Después de descontar: dni=${dni}, diasRestantes=${diasRestantes}`);
};

module.exports = { obtenerDiasDisponibles, actualizarVacaciones };