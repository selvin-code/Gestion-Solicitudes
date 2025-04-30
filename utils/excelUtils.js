const ExcelJS = require('exceljs');

const exportarSolicitudesExcel = async (solicitudes, worksheetName, filename, res) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(worksheetName);

  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Solicitante', key: 'nombre', width: 20 },
    { header: 'Área', key: 'area_solicitante', width: 20 },
    { header: 'Fecha Solicitud', key: 'fecha_solicitud', width: 20 },
    { header: 'Fecha Inicio', key: 'fecha_inicio', width: 20 },
    { header: 'Fecha Fin', key: 'fecha_fin', width: 20 },
    { header: 'Fecha Reincorporación', key: 'fecha_reincorporacion', width: 20 },
    { header: 'Días', key: 'total_dias', width: 10 },
    { header: 'Estado', key: 'estado', width: 20 },
    { header: 'Observaciones', key: 'observaciones', width: 30 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF008CFF' },
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  solicitudes.forEach((s) => {
    worksheet.addRow({
      id: s.id,
      nombre: s.nombre,
      area_solicitante: s.area_solicitante,
      fecha_solicitud: s.fecha_solicitud?.toISOString().split('T')[0] || '',
      fecha_inicio: s.fecha_inicio?.toISOString().split('T')[0] || '',
      fecha_fin: s.fecha_fin?.toISOString().split('T')[0] || '',
      fecha_reincorporacion: s.fecha_reincorporacion?.toISOString().split('T')[0] || '',
      total_dias: s.total_dias,
      estado: s.estado,
      observaciones: s.observaciones || '',
    });
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  await workbook.xlsx.write(res);
  res.end();
};

module.exports = { exportarSolicitudesExcel };