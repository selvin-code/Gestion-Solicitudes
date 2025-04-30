// controllers/reportesController.js
const sql = require('mssql');
const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');
const { getPool: getPoolPermisos } = require('../config/dbconfig');

const reportesController = {
    generarReporteSolicitud: async (req, res) => {
        try {
            const id = req.params.id;
            const pool = await getPoolPermisos();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    SELECT id, nombre, area_solicitante, fecha_solicitud, fecha_inicio, fecha_fin, fecha_reincorporacion, 
                           total_dias, estado, observaciones, observaciones_rechazo, aprobado_por_rh 
                    FROM [Permisos].[dbo].[solicitud] WHERE id = @id
                `);

            if (!result.recordset[0]) {
                return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
            }

            const solicitud = result.recordset[0];
            
            // Configurar fuentes para pdfmake
            const fonts = {
                Roboto: {
                    normal: path.join(__dirname, '../public/fonts/Roboto-Regular.ttf'),
                    bold: path.join(__dirname, '../public/fonts/Roboto-Bold.ttf'),
                    italics: path.join(__dirname, '../public/fonts/Roboto-Italic.ttf'),
                    bolditalics: path.join(__dirname, '../public/fonts/Roboto-BoldItalic.ttf')
                }
            };

            const printer = new PdfPrinter(fonts);
            
            // Formatear fechas
            const formatDate = (date) => {
                if (!date) return 'No disponible';
                const d = new Date(date);
                return d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
            };

            // Definir contenido del PDF
            const docDefinition = {
                pageSize: 'A4',
                pageMargins: [40, 60, 40, 60],
                defaultStyle: { font: 'Roboto' },
                header: {
                    text: 'CONSUCOOP - Reporte de Solicitud de Vacaciones',
                    style: 'header',
                    margin: [40, 20, 40, 10]
                },
                footer: function(currentPage, pageCount) {
                    return {
                        text: `Página ${currentPage.toString()} de ${pageCount.toString()}`,
                        alignment: 'center',
                        margin: [40, 10, 40, 20]
                    };
                },
                content: [
                    { text: 'DETALLES DE LA SOLICITUD', style: 'sectionHeader' },
                    {
                        style: 'tableExample',
                        table: {
                            widths: ['30%', '70%'],
                            body: [
                                ['ID de Solicitud', solicitud.id],
                                ['Solicitante', solicitud.nombre],
                                ['Área', solicitud.area_solicitante],
                                ['Fecha de Solicitud', formatDate(solicitud.fecha_solicitud)],
                                ['Estado', solicitud.estado]
                            ]
                        }
                    },
                    { text: '\nPERIODO SOLICITADO', style: 'sectionHeader' },
                    {
                        style: 'tableExample',
                        table: {
                            widths: ['30%', '70%'],
                            body: [
                                ['Fecha de Inicio', formatDate(solicitud.fecha_inicio)],
                                ['Fecha de Fin', formatDate(solicitud.fecha_fin)],
                                ['Fecha de Reincorporación', formatDate(solicitud.fecha_reincorporacion)],
                                ['Total de Días', solicitud.total_dias + ' días']
                            ]
                        }
                    },
                    { text: '\nOBSERVACIONES', style: 'sectionHeader' },
                    {
                        text: solicitud.observaciones || 'Sin observaciones',
                        margin: [0, 5, 0, 15]
                    },
                    { text: '\nAPROBACIONES', style: 'sectionHeader' },
                    {
                        style: 'tableExample',
                        table: {
                            widths: ['50%', '50%'],
                            body: [
                                ['Aprobado por Jefe', solicitud.estado === 'Aprobado por Jefe' || solicitud.estado === 'Aprobado' ? 'SÍ' : 'NO'],
                                ['Aprobado por RRHH', solicitud.estado === 'Aprobado' ? 'SÍ' : 'NO']
                            ]
                        }
                    }
                ],
                styles: {
                    header: {
                        fontSize: 18,
                        bold: true,
                        color: '#0056b3',
                        alignment: 'center'
                    },
                    sectionHeader: {
                        fontSize: 14,
                        bold: true,
                        margin: [0, 15, 0, 5],
                        color: '#0056b3'
                    },
                    tableExample: {
                        margin: [0, 5, 0, 15]
                    }
                }
            };

            // Generar el PDF
            const pdfDoc = printer.createPdfKitDocument(docDefinition);
            
            // Configurar los headers de la respuesta
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=Solicitud_${solicitud.id}_${solicitud.nombre.replace(/\s+/g, '_')}.pdf`);
            
            // Enviar el PDF como respuesta
            pdfDoc.pipe(res);
            pdfDoc.end();

        } catch (error) {
            console.error('Error al generar el reporte PDF:', error);
            res.status(500).json({ success: false, error: 'Error al generar el reporte PDF' });
        }
    }
};

module.exports = reportesController;