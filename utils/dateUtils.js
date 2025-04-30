const calcularDiasLaborables = (inicio, fin) => {
    let totalDias = 0;
    let currentDate = new Date(inicio);
    while (currentDate <= fin) {
      const diaSemana = currentDate.getUTCDay();
      if (diaSemana !== 0 && diaSemana !== 6) totalDias++;
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
    return totalDias;
  };
  
  const calcularFechaReincorporacion = (fin) => {
    let expectedReincorporacion = new Date(fin);
    expectedReincorporacion.setUTCDate(fin.getUTCDate() + 1);
    while (
      expectedReincorporacion.getUTCDay() === 0 ||
      expectedReincorporacion.getUTCDay() === 6
    ) {
      expectedReincorporacion.setUTCDate(expectedReincorporacion.getUTCDate() + 1);
    }
    return expectedReincorporacion.toISOString().split('T')[0];
  };
  
  module.exports = { calcularDiasLaborables, calcularFechaReincorporacion };