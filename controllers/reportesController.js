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
                    SELECT 
                        id, 
                        nombre, 
                        area_solicitante, 
                        fecha_solicitud, 
                        fecha_inicio, 
                        fecha_fin, 
                        fecha_reincorporacion, 
                        total_dias, 
                        estado, 
                        observaciones, 
                        observaciones_rechazo, 
                        aprobado_por_rh 
                    FROM [Permisos].[dbo].[solicitud] 
                    WHERE id = @id
                `);

            if (!result.recordset[0]) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Solicitud no encontrada' 
                });
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
                if (!date) return '';
                const d = new Date(date);
                return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
            };

            // Definir contenido del PDF con mejor espaciado
            const docDefinition = {
                pageSize: 'A4',
                pageMargins: [40, 60, 40, 60],
                defaultStyle: { 
                    font: 'Roboto', 
                    fontSize: 10,
                    lineHeight: 1.5 
                },
                
                header: {
                    margin: [40, 20, 40, 30],  // Más margen inferior
                    columns: [
                        { 
                            text: 'CONSUCOOP', 
                            style: 'headerLogo', 
                            width: '33%' 
                        },
                        { 
                            text: 'SOLICITUD DE USO DE VACACIONES', 
                            style: 'headerTitle', 
                            width: '34%', 
                            alignment: 'center',
                            margin: [0, 0, 0, 10] 
                        },
                        { 
                            text: 'RRHH-FO-002\nVersión 1.0', 
                            style: 'headerCode', 
                            width: '33%', 
                            alignment: 'right' 
                        }
                    ]
                },
                
                content: [
                    // Fecha con más espacio
                    {
                        columns: [
                            { 
                                text: 'FECHA:', 
                                style: 'label', 
                                width: '10%',
                                margin: [0, 0, 0, 5] 
                            },
                            { 
                                text: formatDate(solicitud.fecha_solicitud), 
                                style: 'value', 
                                width: '90%',
                                margin: [0, 0, 0, 5] 
                            }
                        ],
                        margin: [0, 0, 0, 15]  // Más margen inferior
                    },
                    { 
                        canvas: [{ 
                            type: 'line', 
                            x1: 0, 
                            y1: 0, 
                            x2: 450, 
                            y2: 0, 
                            lineWidth: 0.5 
                        }], 
                        margin: [0, 0, 0, 20]  // Más espacio después de la línea
                    },

                    // Nombre y Apellido con mejor espaciado
                    {
                        columns: [
                            { 
                                text: 'NOMBRE Y APELLIDO:', 
                                style: 'label', 
                                width: '20%',
                                margin: [0, 0, 0, 5] 
                            },
                            { 
                                text: solicitud.nombre || '', 
                                style: 'value', 
                                width: '30%',
                                margin: [0, 0, 0, 5] 
                            },
                            { 
                                text: 'DEPARTAMENTO:', 
                                style: 'label', 
                                width: '20%',
                                margin: [20, 0, 0, 5]  // Más margen izquierdo
                            },
                            { 
                                text: solicitud.area_solicitante || '', 
                                style: 'value', 
                                width: '30%',
                                margin: [0, 0, 0, 5] 
                            }
                        ],
                        margin: [0, 0, 0, 15]  // Más margen inferior
                    },
                    {
                        columns: [
                            { 
                                canvas: [{ 
                                    type: 'line', 
                                    x1: 0, 
                                    y1: 0, 
                                    x2: 200, 
                                    y2: 0, 
                                    lineWidth: 0.5 
                                }], 
                                width: '30%' 
                            },
                            { 
                                canvas: [{ 
                                    type: 'line', 
                                    x1: 0, 
                                    y1: 0, 
                                    x2: 200, 
                                    y2: 0, 
                                    lineWidth: 0.5 
                                }], 
                                width: '30%',
                                margin: [20, 0, 0, 0]  // Más margen izquierdo
                            }
                        ],
                        margin: [0, 0, 0, 20]  // Más margen inferior
                    },

                    // Fecha de Reincorporación con mejor espaciado
                    {
                        columns: [
                            { 
                                text: 'FECHA DE REINCORPORACIÓN A SUS LABORES:', 
                                style: 'label', 
                                width: '40%',
                                margin: [0, 0, 0, 5] 
                            },
                            { 
                                text: formatDate(solicitud.fecha_reincorporacion), 
                                style: 'value', 
                                width: '60%',
                                margin: [0, 0, 0, 5] 
                            }
                        ],
                        margin: [0, 0, 0, 15]  // Más margen inferior
                    },
                    { 
                        canvas: [{ 
                            type: 'line', 
                            x1: 0, 
                            y1: 0, 
                            x2: 300, 
                            y2: 0, 
                            lineWidth: 0.5 
                        }], 
                        width: '60%',
                        margin: [40, 0, 0, 20]  // Más margen inferior
                    },

                    // Corresponsientes al Año con mejor espaciado
                    {
                        columns: [
                            { 
                                text: 'CORRESPONDIENTES AL AÑO:', 
                                style: 'label', 
                                width: '40%',
                                margin: [0, 0, 0, 5] 
                            },
                            { 
                                text: '2025', 
                                style: 'value', 
                                width: '60%',
                                margin: [0, 0, 0, 5] 
                            }
                        ],
                        margin: [0, 0, 0, 15]  // Más margen inferior
                    },
                    { 
                        canvas: [{ 
                            type: 'line', 
                            x1: 0, 
                            y1: 0, 
                            x2: 300, 
                            y2: 0, 
                            lineWidth: 0.5 
                        }], 
                        width: '60%',
                        margin: [40, 0, 0, 20]  // Más margen inferior
                    },

                    // Observaciones con mejor espaciado
                    {
                        columns: [
                            { 
                                text: 'OBSERVACIONES:', 
                                style: 'label', 
                                width: '20%',
                                margin: [0, 0, 0, 5] 
                            },
                            { 
                                text: solicitud.observaciones || '', 
                                style: 'value', 
                                width: '80%',
                                margin: [0, 0, 0, 5] 
                            }
                        ],
                        margin: [0, 0, 0, 15]  // Más margen inferior
                    },
                    { 
                        canvas: [{ 
                            type: 'line', 
                            x1: 0, 
                            y1: 0, 
                            x2: 450, 
                            y2: 0, 
                            lineWidth: 0.5 
                        }], 
                        width: '80%',
                        margin: [20, 0, 0, 10] 
                    },
                    { 
                        canvas: [{ 
                            type: 'line', 
                            x1: 0, 
                            y1: 0, 
                            x2: 450, 
                            y2: 0, 
                            lineWidth: 0.5 
                        }], 
                        width: '80%',
                        margin: [20, 10, 0, 10] 
                    },
                    { 
                        canvas: [{ 
                            type: 'line', 
                            x1: 0, 
                            y1: 0, 
                            x2: 450, 
                            y2: 0, 
                            lineWidth: 0.5 
                        }], 
                        width: '80%',
                        margin: [20, 10, 0, 10] 
                    },
                    { 
                        canvas: [{ 
                            type: 'line', 
                            x1: 0, 
                            y1: 0, 
                            x2: 450, 
                            y2: 0, 
                            lineWidth: 0.5 
                        }], 
                        width: '80%',
                        margin: [20, 10, 0, 20]  // Más margen inferior
                    },

                    // Firmas con mejor espaciado
                    {
                        columns: [
                            {
                                stack: [
                                    { 
                                        canvas: [{ 
                                            type: 'line', 
                                            x1: 0, 
                                            y1: 0, 
                                            x2: 200, 
                                            y2: 0, 
                                            lineWidth: 0.5 
                                        }], 
                                        margin: [0, 0, 0, 10]  // Más margen inferior
                                    },
                                    { 
                                        text: 'Firma del Empleado', 
                                        style: 'label', 
                                        alignment: 'center',
                                        margin: [0, 0, 0, 10] 
                                    }
                                ],
                                width: '50%'
                            },
                            {
                                stack: [
                                    { 
                                        canvas: [{ 
                                            type: 'line', 
                                            x1: 0, 
                                            y1: 0, 
                                            x2: 100, 
                                            y2: 0, 
                                            lineWidth: 0.5 
                                        }], 
                                        margin: [0, 0, 0, 10]  // Más margen inferior
                                    },
                                    { 
                                        text: 'V.B. Jefe Inmediato', 
                                        style: 'label', 
                                        alignment: 'center',
                                        margin: [0, 0, 0, 10] 
                                    }
                                ],
                                width: '25%'
                            },
                            {
                                stack: [
                                    { 
                                        canvas: [{ 
                                            type: 'line', 
                                            x1: 0, 
                                            y1: 0, 
                                            x2: 100, 
                                            y2: 0, 
                                            lineWidth: 0.5 
                                        }], 
                                        margin: [0, 0, 0, 10]  // Más margen inferior
                                    },
                                    { 
                                        text: 'V.B. Gerente Recursos Humanos', 
                                        style: 'label', 
                                        alignment: 'center',
                                        margin: [0, 0, 0, 10] 
                                    }
                                ],
                                width: '25%'
                            }
                        ],
                        margin: [0, 20, 0, 30]  // Más margen superior e inferior
                    },

                    // Nota con mejor espaciado
                    {
                        text: 'NOTA: La presente solicitud debe tramitarse diez días antes de la fecha de inicio de sus vacaciones y mínimo cuatro días antes.',
                        style: 'note',
                        margin: [0, 10, 0, 20]  // Más margen inferior
                    }
                ],
                
                styles: {
                    headerLogo: {
                        fontSize: 14,
                        bold: true,
                        color: '#000000',
                        lineHeight: 1.5
                    },
                    headerTitle: {
                        fontSize: 12,
                        bold: true,
                        color: '#000000',
                        lineHeight: 1.5
                    },
                    headerCode: {
                        fontSize: 10,
                        color: '#000000',
                        lineHeight: 1.5
                    },
                    label: {
                        fontSize: 10,
                        bold: true,
                        color: '#000000',
                        lineHeight: 1.5
                    },
                    value: {
                        fontSize: 10,
                        color: '#000000',
                        lineHeight: 1.5
                    },
                    note: {
                        fontSize: 10,
                        italics: true,
                        color: '#000000',
                        lineHeight: 1.5
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
            res.status(500).json({ 
                success: false, 
                error: 'Error al generar el reporte PDF' 
            });
        }
    }
};

module.exports = reportesController;