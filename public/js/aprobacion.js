const { jsPDF } = window.jspdf;
let currentSolicitud = null;
const solicitudes = window.solicitudes || [];

document.addEventListener('DOMContentLoaded', initializeTooltips);

function initializeTooltips() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(el => new bootstrap.Tooltip(el));
}

function setupDetailsButtons() {
  document.querySelectorAll('.detalles-btn').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      const solicitud = solicitudes.find(s => s.id == id);

      if (solicitud) {
        currentSolicitud = solicitud;

        document.getElementById('detalleNombre').textContent = solicitud.nombre || 'No disponible';
        document.getElementById('detalleArea').textContent = solicitud.area_solicitante || 'No disponible';
        document.getElementById('detalleFechaSolicitud').textContent = solicitud.fecha_solicitud ? new Date(solicitud.fecha_solicitud).toLocaleDateString('es-ES') : 'No disponible';

        const periodo = `${solicitud.fecha_inicio ? new Date(solicitud.fecha_inicio).toLocaleDateString('es-ES') : 'No disponible'} - ${solicitud.fecha_fin ? new Date(solicitud.fecha_fin).toLocaleDateString('es-ES') : 'No disponible'}`;
        document.getElementById('detallePeriodo').textContent = periodo;

        document.getElementById('detalleFechaReincorporacion').textContent = solicitud.fecha_reincorporacion ? new Date(solicitud.fecha_reincorporacion).toLocaleDateString('es-ES') : 'No disponible';
        document.getElementById('detalleDias').textContent = solicitud.total_dias || '0';

        let estadoBadge = '';
        if (solicitud.estado === 'Aprobado por Jefe') {
          estadoBadge = `<span class="badge badge-success">Aprobado por Jefe</span>`;
        } else if (solicitud.estado === 'Rechazado') {
          estadoBadge = `<span class="badge badge-danger">Rechazado</span>`;
        } else if (solicitud.estado === 'Pendiente') {
          estadoBadge = `<span class="badge badge-warning">Pendiente</span>`;
        } else {
          estadoBadge = `<span class="badge badge-info">${solicitud.estado || 'Desconocido'}</span>`;
        }
        document.getElementById('detalleEstado').innerHTML = estadoBadge;

        document.getElementById('detalleObservaciones').textContent = solicitud.observaciones || 'Sin observaciones';

        if (solicitud.estado === 'Rechazado' && solicitud.comentarios_rechazo) {
          document.getElementById('comentariosRechazo').style.display = 'block';
          document.getElementById('detalleComentariosRechazo').textContent = solicitud.comentarios_rechazo;
        } else {
          document.getElementById('comentariosRechazo').style.display = 'none';
        }

        const aprobarSolicitudBtn = document.getElementById('aprobarSolicitudBtn');
        const rechazarSolicitudBtn = document.getElementById('rechazarSolicitudBtn');
        const generatePDFBtn = document.getElementById('generatePDFBtn');
        if (solicitud.estado === 'Aprobado por Jefe') {
          generatePDFBtn.style.display = 'block';
          aprobarSolicitudBtn.style.display = 'none';
          rechazarSolicitudBtn.style.display = 'none';
        } else if (solicitud.estado === 'Pendiente') {
          generatePDFBtn.style.display = 'none';
          aprobarSolicitudBtn.style.display = 'block';
          rechazarSolicitudBtn.style.display = 'block';
          aprobarSolicitudBtn.dataset.id = id;
          rechazarSolicitudBtn.dataset.id = id;
        } else {
          generatePDFBtn.style.display = 'none';
          aprobarSolicitudBtn.style.display = 'none';
          rechazarSolicitudBtn.style.display = 'none';
        }
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se encontraron los detalles de esta solicitud.'
        });
      }
    });
  });
}

async function aprobarSolicitud(id) {
  Swal.fire({
    title: '¿Aprobar esta solicitud?',
    text: "Esta acción enviará la solicitud a RRHH para aprobación final.",
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Sí, aprobar',
    cancelButtonText: 'Cancelar'
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        const response = await fetch(`/aprobar-solicitud/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (response.ok) {
          Swal.fire({
            icon: 'success',
            title: 'Solicitud aprobada',
            text: 'La solicitud ha sido aprobada y enviada a RRHH.',
            timer: 3000,
            showConfirmButton: false
          }).then(() => location.reload());
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Error al aprobar',
            text: result.error || 'No se pudo aprobar la solicitud.'
          });
        }
      } catch (error) {
        console.error('Error al aprobar solicitud:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error de conexión',
          text: 'No se pudo conectar con el servidor.'
        });
      }
    }
  });
}

async function rechazarSolicitud(id, motivo) {
  try {
    const response = await fetch(`/rechazar-solicitud/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comentarios_rechazo: motivo })
    });

    const result = await response.json();

    if (response.ok) {
      Swal.fire({
        icon: 'success',
        title: 'Solicitud rechazada',
        text: 'La solicitud ha sido rechazada.',
        timer: 3000,
        showConfirmButton: false
      }).then(() => location.reload());
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error al rechazar',
        text: result.error || 'No se pudo rechazar la solicitud.'
      });
    }
  } catch (error) {
    console.error('Error al rechazar solicitud:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error de conexión',
      text: 'No se pudo conectar con el servidor.'
    });
  }
}

function setupActionButtons() {
  document.querySelectorAll('.aprobar-btn').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      aprobarSolicitud(id);
    });
  });

  document.querySelectorAll('.rechazar-btn').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      const modal = new bootstrap.Modal(document.getElementById('rechazoModal'));
      modal.show();

      const form = document.getElementById('rechazoForm');
      form.onsubmit = (e) => {
        e.preventDefault();
        const motivo = document.getElementById('motivoRechazo').value.trim();
        const errorDiv = document.getElementById('rechazoError');

        if (!motivo) {
          errorDiv.textContent = 'Por favor, ingrese un motivo para el rechazo.';
          errorDiv.classList.remove('d-none');
          return;
        }

        errorDiv.classList.add('d-none');
        modal.hide();
        rechazarSolicitud(id, motivo);
      };
    });
  });

  document.getElementById('aprobarSolicitudBtn').addEventListener('click', function() {
    const id = this.dataset.id;
    aprobarSolicitud(id);
  });

  document.getElementById('rechazarSolicitudBtn').addEventListener('click', function() {
    const id = this.dataset.id;
    const modal = new bootstrap.Modal(document.getElementById('rechazoModal'));
    modal.show();

    const form = document.getElementById('rechazoForm');
    form.onsubmit = (e) => {
      e.preventDefault();
      const motivo = document.getElementById('motivoRechazo').value.trim();
      const errorDiv = document.getElementById('rechazoError');

      if (!motivo) {
        errorDiv.textContent = 'Por favor, ingrese un motivo para el rechazo.';
        errorDiv.classList.remove('d-none');
        return;
      }

      errorDiv.classList.add('d-none');
      modal.hide();
      rechazarSolicitud(id, motivo);
    };
  });
}

function setupPDFGeneration() {
  document.querySelectorAll('.pdf-btn').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      const solicitud = solicitudes.find(s => s.id == id);
      generatePDF(solicitud);
    });
  });

  document.getElementById('generatePDFBtn').addEventListener('click', () => {
    if (!currentSolicitud) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se encontraron los detalles de esta solicitud para generar el PDF.'
      });
      return;
    }
    generatePDF(currentSolicitud);
  });
}

function generatePDF(solicitud) {
  const doc = new jsPDF();

  doc.setFontSize(12);
  doc.text('CONSUCOOP', 20, 20);
  doc.setFontSize(10);
  doc.text('SOLICITUD DE USO DE VACACIONES', 105, 20, { align: 'center' });
  doc.text('RRHH-FO-002', 180, 20);
  doc.text('Versión 1.0', 180, 25);

  doc.setLineWidth(0.5);
  doc.line(20, 30, 190, 30);
  doc.line(20, 40, 190, 40);

  doc.setFontSize(10);
  doc.text('FECHA:', 20, 38);
  doc.text(solicitud.fecha_solicitud ? new Date(solicitud.fecha_solicitud).toLocaleDateString('es-ES') : 'No disponible', 40, 38);

  doc.text('NOMBRE Y APELLIDO:', 20, 48);
  doc.text(solicitud.nombre || 'No disponible', 50, 48);

  doc.text('DEPARTAMENTO:', 120, 48);
  doc.text(solicitud.area_solicitante || 'No disponible', 150, 48);

  doc.line(20, 50, 190, 50);

  doc.text('FECHA DE VACACIONES:', 20, 58);
  doc.text('DESDE:', 50, 58);
  doc.text(solicitud.fecha_inicio ? new Date(solicitud.fecha_inicio).toLocaleDateString('es-ES') : 'No disponible', 70, 58);
  doc.text('HASTA:', 100, 58);
  doc.text(solicitud.fecha_fin ? new Date(solicitud.fecha_fin).toLocaleDateString('es-ES') : 'No disponible', 120, 58);

  doc.text('TOTAL DE DÍAS SOLICITADOS:', 20, 68);
  doc.text(solicitud.total_dias ? solicitud.total_dias.toString() : '0', 60, 68);

  doc.text('TOTAL DÍAS CONCEDIDOS:', 100, 68);
  doc.text(solicitud.total_dias ? solicitud.total_dias.toString() : '0', 140, 68);

  doc.line(20, 70, 190, 70);

  doc.text('FECHA DE REINCORPORACIÓN A SUS LABORES:', 20, 78);
  doc.text(solicitud.fecha_reincorporacion ? new Date(solicitud.fecha_reincorporacion).toLocaleDateString('es-ES') : 'No disponible', 90, 78);

  doc.text('CORRESPONDIENTES AL AÑO:', 120, 78);
  doc.text(solicitud.fecha_inicio ? new Date(solicitud.fecha_inicio).getFullYear().toString() : 'No disponible', 160, 78);

  doc.line(20, 80, 190, 80);

  doc.text('OBSERVACIONES:', 20, 88);
  doc.setFontSize(9);
  doc.text(solicitud.observaciones || 'Sin observaciones', 50, 88, { maxWidth: 140 });

  doc.setLineWidth(0.2);
  for (let i = 0; i < 3; i++) {
    doc.line(20, 90 + i * 5, 190, 90 + i * 5);
  }

  doc.setFontSize(10);
  doc.line(20, 110, 90, 110);
  doc.line(120, 110, 190, 110);
  doc.text('Firma del Empleado', 20, 115);
  doc.text('V.B. Jefe Inmediato', 120, 115);
  doc.line(20, 120, 90, 120);
  doc.line(120, 120, 190, 120);
  doc.text('V.B. Gerente Recursos Humanos', 120, 125);

  doc.setFontSize(8);
  doc.text('NOTA:', 20, 135);
  doc.text('La presente solicitud debe tramitarse diez días antes de la fecha de inicio de sus vacaciones y mínimo cuatro días antes.', 30, 135, { maxWidth: 160 });

  doc.save(`Solicitud_Vacaciones_${solicitud.id}.pdf`);
}

function setupFilters() {
  document.querySelectorAll('#filtroEstado .dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const filter = item.dataset.filter;
      const rows = document.querySelectorAll('#historico-table tbody tr');
      const exportLink = document.getElementById('export-historico');

      rows.forEach(row => {
        const estado = row.dataset.estado;
        row.style.display = filter === 'all' || filter === estado ? '' : 'none';
      });

      exportLink.href = `/export-aprobacion?type=historico${filter !== 'all' ? '&estado=' + filter : ''}`;
    });
  });
}

function setupSearch() {
  let searchTimeout;
  document.getElementById('searchHistorico').addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const searchTerm = this.value.toLowerCase();
      const rows = document.querySelectorAll('#historico-table tbody tr');
      rows.forEach(row => {
        const searchText = row.dataset.search;
        row.style.display = searchText.includes(searchTerm) ? '' : 'none';
      });
    }, 300);
  });
}

function setupTabExport() {
  document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
    tab.addEventListener('shown.bs.tab', event => {
      const target = event.target.getAttribute('data-bs-target');
      document.querySelectorAll('.tab-export-btn').forEach(btn => {
        btn.classList.remove('active');
      });

      if (target === '#pendientes') {
        document.getElementById('pendientes-export').classList.add('active');
      } else if (target === '#historico') {
        document.getElementById('historico-export').classList.add('active');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupDetailsButtons();
  setupActionButtons();
  setupPDFGeneration();
  setupFilters();
  setupSearch();
  setupTabExport();
});