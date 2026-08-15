/**
 * utils/reportePdf.js — generación y descarga automática del informe diario.
 *
 * Cumple lo que pide el enunciado:
 *   · Logo de la Facultad / Proyecto
 *   · Datos del técnico autenticado
 *   · Resumen de los lotes actuales
 *   · Historial de temperaturas máximas/mínimas del día
 *   · Registro de alarmas (ej. "Puerta abierta a las 14:00")
 *
 * El logo se dibuja con primitivas vectoriales para que el PDF no dependa de
 * ningún archivo externo y pese poco.
 */

// Imports nombrados: son los que funcionan igual en el bundle del navegador y
// en Node. `applyPlugin` engancha autoTable a jsPDF de forma explícita, en vez
// de depender del efecto secundario del import, que varía según el empaquetador.
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

applyPlugin(jsPDF);

const AMBAR = [217, 119, 6];
const AZUL = [13, 20, 36];
const GRIS = [110, 120, 140];
const VERDE = [16, 185, 129];
const ROJO = [225, 60, 90];

const NOMBRES_ALARMA = {
  sobrecalentamiento: 'Sobrecalentamiento',
  temperatura_baja: 'Temperatura baja',
  humedad_fuera_rango: 'Humedad fuera de rango',
  puerta_abierta: 'Puerta abierta',
  fallo_sensor: 'Fallo del sensor DHT22',
};

/** Dibuja el logo del proyecto: un huevo estilizado dentro de un escudo. */
function dibujarLogo(doc, x, y, tam = 16) {
  const r = tam / 2;

  doc.setFillColor(...AMBAR);
  doc.circle(x + r, y + r, r, 'F');

  // Huevo interior
  doc.setFillColor(255, 252, 240);
  doc.ellipse(x + r, y + r + 0.6, r * 0.42, r * 0.55, 'F');

  // Onda de señal (el "IoT")
  doc.setDrawColor(255, 252, 240);
  doc.setLineWidth(0.55);
  doc.line(x + r - r * 0.72, y + r * 0.5, x + r - r * 0.5, y + r * 0.3);
  doc.line(x + r + r * 0.5, y + r * 0.3, x + r + r * 0.72, y + r * 0.5);
}

/** Encabezado institucional. */
function encabezado(doc, reporte) {
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFillColor(...AZUL);
  doc.rect(0, 0, ancho, 34, 'F');

  dibujarLogo(doc, 14, 9, 16);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SmartEgg — Incubadora Inteligente IoT', 36, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(190, 200, 220);
  doc.text(reporte.institucion, 36, 20.5);
  doc.text(`${reporte.facultad} · ${reporte.curso}`, 36, 24.5);
  doc.text(`${reporte.grupo} · Práctica 1`, 36, 28.5);

  // Fecha del informe, alineada a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(251, 191, 36);
  doc.text('INFORME DIARIO', ancho - 14, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(190, 200, 220);
  doc.text(reporte.fecha, ancho - 14, 20.5, { align: 'right' });
  doc.text(`Generado: ${reporte.generado_en}`, ancho - 14, 24.5, { align: 'right' });
}

/** Pie con numeración de páginas. */
function pie(doc) {
  const total = doc.internal.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(225, 228, 235);
    doc.setLineWidth(0.3);
    doc.line(14, alto - 13, ancho - 14, alto - 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text('SmartEgg · Sistema de incubación automatizada · USAC', 14, alto - 8.5);
    doc.text(`Página ${i} de ${total}`, ancho - 14, alto - 8.5, { align: 'right' });
  }
}

/** Título de sección con barra de color. */
function seccion(doc, texto, y) {
  doc.setFillColor(...AMBAR);
  doc.rect(14, y - 3.6, 2.2, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...AZUL);
  doc.text(texto, 19, y);
  return y + 4;
}

const n1 = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(1));

/**
 * Construye el PDF y lo descarga automáticamente.
 * @param {object} reporte  Respuesta de GET /api/reportes/diario
 * @returns {string} nombre del archivo generado
 */
export function generarReportePDF(reporte) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();

  encabezado(doc, reporte);

  let y = 44;

  // ---------------------------------------------------------------- Técnico
  y = seccion(doc, 'Datos del técnico responsable', y);

  const t = reporte.tecnico;
  doc.autoTable({
    startY: y,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: GRIS, cellWidth: 36 },
      2: { fontStyle: 'bold', textColor: GRIS, cellWidth: 36 },
    },
    body: [
      ['Nombre', t?.nombre ?? 'No autenticado', 'Usuario', t?.usuario ?? '—'],
      ['Carné', t?.carne ?? '—', 'Rol', t?.rol ?? '—'],
      ['Fecha del informe', reporte.fecha, 'Emitido', reporte.generado_en],
    ],
  });

  y = doc.lastAutoTable.finalY + 8;

  // ------------------------------------------------------- Resumen ambiental
  y = seccion(doc, 'Resumen ambiental del día', y);

  const a = reporte.ambiental ?? {};
  const rango = a.rango_objetivo ?? {};

  doc.autoTable({
    startY: y,
    head: [['Variable', 'Máxima', 'Mínima', 'Promedio', 'Rango objetivo', 'Muestras']],
    body: [
      [
        'Temperatura (°C)',
        n1(a.temp_max), n1(a.temp_min), n1(a.temp_prom),
        `${rango.temp_min ?? 37} – ${rango.temp_max ?? 38}`,
        a.muestras ?? 0,
      ],
      [
        'Humedad relativa (%)',
        n1(a.hum_max), n1(a.hum_min), n1(a.hum_prom),
        `${rango.hum_min ?? 50} – ${rango.hum_max ?? 65}`,
        a.muestras ?? 0,
      ],
    ],
    theme: 'striped',
    headStyles: { fillColor: AZUL, fontSize: 8, halign: 'center' },
    styles: { fontSize: 8.5, halign: 'center', cellPadding: 2 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
  });

  y = doc.lastAutoTable.finalY + 4;

  if (a.pico_maximo || a.pico_minimo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    if (a.pico_maximo) {
      doc.text(
        `Pico máximo: ${n1(a.pico_maximo.temperatura)} °C a las ${a.pico_maximo.ts.slice(11, 16)}`,
        14, y
      );
    }
    if (a.pico_minimo) {
      doc.text(
        `Pico mínimo: ${n1(a.pico_minimo.temperatura)} °C a las ${a.pico_minimo.ts.slice(11, 16)}`,
        ancho / 2, y
      );
    }
    y += 7;
  }

  // ------------------------------------------------- Historial hora por hora
  if (reporte.por_hora?.length) {
    y = seccion(doc, 'Historial de temperaturas máximas y mínimas por hora', y);

    doc.autoTable({
      startY: y,
      head: [['Hora', 'T. máx (°C)', 'T. mín (°C)', 'T. prom (°C)', 'H. máx (%)', 'H. mín (%)', 'Muestras']],
      body: reporte.por_hora.map((h) => [
        h.hora, n1(h.temp_max), n1(h.temp_min), n1(h.temp_prom),
        n1(h.hum_max), n1(h.hum_min), h.muestras,
      ]),
      theme: 'grid',
      headStyles: { fillColor: AZUL, fontSize: 7.5, halign: 'center' },
      styles: { fontSize: 7.5, halign: 'center', cellPadding: 1.4 },
      // Resalta en rojo las horas que se salieron del rango objetivo
      didParseCell: (datos) => {
        if (datos.section !== 'body' || datos.column.index !== 1) return;
        const valor = Number(datos.cell.raw);
        if (Number.isFinite(valor) && valor > (rango.temp_max ?? 38)) {
          datos.cell.styles.textColor = ROJO;
          datos.cell.styles.fontStyle = 'bold';
        }
      },
    });

    y = doc.lastAutoTable.finalY + 8;
  }

  // ------------------------------------------------------------------ Lotes
  y = seccion(doc, 'Resumen de los lotes actuales', y);

  if (reporte.lotes?.length) {
    doc.autoTable({
      startY: y,
      head: [['Código', 'Especie / raza', 'Ingreso', 'Día', 'Restan', 'Huevos', 'Incub.', 'Eclos.', 'Desc.']],
      body: reporte.lotes.map((l) => [
        l.codigo,
        `${l.especie}${l.raza ? ` / ${l.raza}` : ''}`,
        l.fecha_ingreso,
        `${l.dias_transcurridos}/${l.dias_incubacion}`,
        `${l.dias_restantes} d`,
        l.total_huevos, l.incubando, l.eclosionados, l.descartados,
      ]),
      theme: 'striped',
      headStyles: { fillColor: AZUL, fontSize: 7.5, halign: 'center' },
      styles: { fontSize: 8, halign: 'center', cellPadding: 1.8 },
      columnStyles: { 0: { fontStyle: 'bold', halign: 'left' }, 1: { halign: 'left' } },
    });
    y = doc.lastAutoTable.finalY + 8;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIS);
    doc.text('No hay lotes activos registrados.', 14, y + 2);
    y += 10;
  }

  // ------------------------------------------------------------- Ocupación
  const oc = reporte.ocupacion;
  if (oc) {
    y = seccion(doc, `Ocupación de la bandeja (${oc.ocupados}/${oc.total_espacios} espacios)`, y);

    doc.autoTable({
      startY: y,
      head: [['Posición', 'Pin', 'Estado', 'Rótulo del huevo', 'Lote', 'Peso (g)']],
      body: oc.detalle.map((p) => [
        `Posición ${p.posicion}`,
        `A${p.posicion - 1}`,
        p.ocupado ? 'Ocupada' : 'Libre',
        p.huevo?.codigo ?? '—',
        p.huevo?.lote_codigo ?? '—',
        p.huevo?.peso_gramos ?? '—',
      ]),
      theme: 'grid',
      headStyles: { fillColor: AZUL, fontSize: 7.5, halign: 'center' },
      styles: { fontSize: 8, halign: 'center', cellPadding: 1.8 },
      didParseCell: (datos) => {
        if (datos.section === 'body' && datos.column.index === 2) {
          datos.cell.styles.textColor = datos.cell.raw === 'Libre' ? VERDE : AMBAR;
          datos.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // --------------------------------------------------------------- Alarmas
  y = seccion(doc, `Registro de alarmas del día (${reporte.total_alarmas ?? 0})`, y);

  if (reporte.alarmas?.length) {
    doc.autoTable({
      startY: y,
      head: [['Hora', 'Tipo de alarma', 'Severidad', 'Temp. (°C)', 'Hum. (%)', 'Estado', 'Resuelta']],
      body: reporte.alarmas.map((al) => [
        al.ts.slice(11, 16),
        NOMBRES_ALARMA[al.tipo] ?? al.tipo,
        al.severidad,
        n1(al.temperatura),
        n1(al.humedad),
        al.resuelta ? 'Resuelta' : 'Activa',
        al.ts_resuelta ? al.ts_resuelta.slice(11, 16) : '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: AZUL, fontSize: 7.5, halign: 'center' },
      styles: { fontSize: 8, halign: 'center', cellPadding: 1.8 },
      columnStyles: { 1: { halign: 'left' } },
      didParseCell: (datos) => {
        if (datos.section === 'body' && datos.column.index === 5) {
          datos.cell.styles.textColor = datos.cell.raw === 'Activa' ? ROJO : VERDE;
          datos.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Resumen por tipo
    if (reporte.alarmas_por_tipo?.length) {
      const linea = reporte.alarmas_por_tipo
        .map((x) => `${NOMBRES_ALARMA[x.tipo] ?? x.tipo}: ${x.total}`)
        .join('   ·   ');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text(`Conteo por tipo — ${linea}`, 14, y);
      y += 8;
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...VERDE);
    doc.text('Sin alarmas registradas: la incubadora se mantuvo dentro de los rangos.', 14, y + 2);
    y += 10;
  }

  // -------------------------------------------------------------- Bitácora
  if (reporte.eventos?.length) {
    if (y > 235) { doc.addPage(); y = 20; }
    y = seccion(doc, 'Bitácora de eventos', y);

    doc.autoTable({
      startY: y,
      head: [['Hora', 'Tipo', 'Descripción']],
      body: reporte.eventos.slice(0, 30).map((e) => [e.ts.slice(11, 19), e.tipo, e.descripcion]),
      theme: 'plain',
      headStyles: { fillColor: [240, 242, 246], textColor: AZUL, fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 1.2 },
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 26 } },
    });
  }

  // ------------------------------------------------------------- Firma y pie
  const alto = doc.internal.pageSize.getHeight();
  let yFirma = doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : y + 16;
  if (yFirma > alto - 32) { doc.addPage(); yFirma = 40; }

  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.3);
  doc.line(20, yFirma, 85, yFirma);
  doc.line(ancho - 85, yFirma, ancho - 20, yFirma);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text(t?.nombre ?? 'Técnico responsable', 52.5, yFirma + 4, { align: 'center' });
  doc.text('Técnico responsable', 52.5, yFirma + 8, { align: 'center' });
  doc.text('Supervisor de laboratorio', ancho - 52.5, yFirma + 8, { align: 'center' });

  pie(doc);

  const archivo = `SmartEgg_Informe_${reporte.fecha}.pdf`;
  doc.save(archivo);   // descarga automática
  return archivo;
}

export default generarReportePDF;
