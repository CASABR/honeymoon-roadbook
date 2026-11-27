/**
 * docxExportService.ts
 * Generatore client-side (100% offline) di file Word (.docx) tramite libreria ufficiale `docx`,
 * con stili nativi, tabelle modificabili, numerazione automatica delle pagine e sanitizzazione XML/UTF-16.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  type PdfExportOptions,
  type OperationalExportData,
  preparePdfData,
  prepareOperationalExportData,
  buildPdfFileName,
} from './pdfExportService';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Rimuove caratteri di controllo XML 1.0 non validi e eventuali surrogati UTF-16 spaiati
 * che causano l'errore "contenuto illeggibile" in Microsoft Word.
 */
export function sanitizeDocxText(raw: string | undefined | null): string {
  const input = String(raw || '');
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // Controllo caratteri XML 1.0 vietati
    if (
      (code >= 0x0000 && code <= 0x0008) ||
      code === 0x000b ||
      code === 0x000c ||
      (code >= 0x000e && code <= 0x001f) ||
      code === 0xfffe ||
      code === 0xffff
    ) {
      continue;
    }
    // Surrogato alto: mantieni solo se seguito da surrogato basso valido
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < input.length) {
        const next = input.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          out += input[i] + input[i + 1];
          i++;
          continue;
        }
      }
      continue;
    }
    // Surrogato basso isolato: scarta
    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }
    out += input[i];
  }
  return out;
}

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
} as const;

function buildEditableTable(headers: string[], rows: string[][], widthsDxa: number[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: widthsDxa[i], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F5F9' },
        margins: { top: 50, bottom: 50, left: 80, right: 80 },
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: sanitizeDocxText(h), bold: true, size: 16, color: '172033' })],
          }),
        ],
      })
    ),
  });

  const bodyRows = rows.map((row) =>
    new TableRow({
      cantSplit: true,
      children: row.map((cellText, i) =>
        new TableCell({
          width: { size: widthsDxa[i], type: WidthType.DXA },
          margins: { top: 45, bottom: 45, left: 80, right: 80 },
          children: [
            new Paragraph({
              spacing: { before: 0, after: 0 },
              children: [
                new TextRun({
                  text: sanitizeDocxText(cellText),
                  bold: i === 2,
                  size: 16,
                  color: '172033',
                }),
              ],
            }),
          ],
        })
      ),
    })
  );

  return new Table({
    width: { size: widthsDxa.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: [headerRow, ...bodyRows],
  });
}

function createStyledDocx(children: Array<Paragraph | Table>, footerTitle: string): Document {
  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 18,
            color: '172033',
          },
        },
        heading1: {
          run: {
            font: 'Calibri',
            size: 30,
            bold: true,
            color: '172033',
          },
          paragraph: {
            spacing: { before: 0, after: 80 },
          },
        },
        heading2: {
          run: {
            font: 'Calibri',
            size: 21,
            bold: true,
            color: '172033',
          },
          paragraph: {
            spacing: { before: 160, after: 60 },
            keepNext: true,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'EEF2F6' },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 720, right: 680, bottom: 720, left: 680, header: 400, footer: 400 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${sanitizeDocxText(footerTitle)} · Pagina `, size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
                  new TextRun({ text: ' di ', size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

function buildOperationalChildren(opData: OperationalExportData): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(sanitizeDocxText(`HOUNIGO — Compatto Operativo (${opData.tripTitle})`))],
    })
  );
  children.push(
    new Paragraph({
      spacing: { before: 0, after: 120 },
      children: [
        new TextRun({
          text: sanitizeDocxText(`Periodo: ${opData.tripDates} · Documento modificabile pronto per la stampa`),
          italics: true,
          size: 18,
          color: '475569',
        }),
      ],
    })
  );

  if (opData.documents.length > 0) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Documenti Essenziali')] }));
    children.push(
      buildEditableTable(
        ['Documento', 'Categoria'],
        opData.documents.map((d) => [d.title, d.category]),
        [7200, 3200]
      )
    );
  }

  const summaryRows: string[][] = [
    ...opData.pendingBalances.map((b) => [b.date, b.name, `Residuo: ${b.amount}`]),
    ...opData.deposits.map((c) => [c.date, c.name, `Cauzione: ${c.cauzione}`]),
    ...opData.undatedDeadlines.map((s) => ['Da verificare', s.title, s.details]),
    ...opData.generalNotes.map((n) => ['Generale', n.title, n.content]),
  ];
  if (summaryRows.length > 0) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Saldi Residui, Cauzioni e Note Generali')] }));
    children.push(buildEditableTable(['Data', 'Voce', 'Dettaglio'], summaryRows, [1600, 3400, 5400]));
  }

  for (const dg of opData.days) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(sanitizeDocxText(`Giorno ${dg.dayNum} — ${dg.label} (${dg.date})`))],
      })
    );

    if (dg.accommodation) {
      const a = dg.accommodation;
      const accTxt = `Alloggio: ${a.name}${a.address ? ` | ${a.address}` : ''} | Check-in/out: ${a.checkInOut}${a.ref ? ` | Rif: ${a.ref}` : ''}${a.finance ? ` | ${a.finance}` : ''}${a.instructions ? ` | Istruzioni: ${a.instructions}` : ''}`;
      children.push(
        new Paragraph({
          spacing: { before: 20, after: 60 },
          children: [new TextRun({ text: sanitizeDocxText(accTxt), size: 17, color: '172033' })],
        })
      );
    } else {
      children.push(
        new Paragraph({
          spacing: { before: 20, after: 60 },
          children: [new TextRun({ text: 'Notte in volo / transito aeroportuale (nessun alloggio a terra).', italics: true, size: 17, color: '475569' })],
        })
      );
    }

    if (dg.events.length > 0) {
      children.push(
        buildEditableTable(
          ['Orario / Stato', 'Categoria', 'Voce', 'Dettagli operativi'],
          dg.events.map((ev) => [`${ev.time} [${ev.badge}]`, ev.category, ev.title, ev.details]),
          [1600, 1400, 2600, 4800]
        )
      );
    }

    for (const dn of dg.dayNotes) {
      children.push(
        new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [new TextRun({ text: sanitizeDocxText(`Nota: ${dn}`), size: 17, color: '334155' })],
        })
      );
    }
  }

  return children;
}

/**
 * Genera un file Word (.docx) modificabile dall'itinerario corrente (anche offline) per tutti i 3 livelli.
 */
export async function generateRoadbookDocx(options: PdfExportOptions): Promise<{
  blob: Blob;
  fileName: string;
}> {
  if (options.detailLevel === 'operational') {
    const opData = await prepareOperationalExportData(options);
    const doc = createStyledDocx(buildOperationalChildren(opData), `HOUNIGO — Compatto Operativo (${opData.tripTitle})`);
    const rawBlob = await Packer.toBlob(doc);
    const blob = new Blob([rawBlob], { type: DOCX_MIME });
    const fileName = buildPdfFileName(opData.tripTitle, 'Compatto Operativo').replace(/\.pdf$/i, '.docx');
    return { blob, fileName };
  }

  const data = await preparePdfData(options);
  const levelLabel = options.detailLevel === 'detailed' ? 'Dettagliato' : 'Compatto';
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(sanitizeDocxText(`HOUNIGO — ${data.tripTitle} (${levelLabel})`))],
    }),
    new Paragraph({
      spacing: { before: 0, after: 120 },
      children: [
        new TextRun({
          text: sanitizeDocxText(`${data.tripDates}${data.destinationsSummary ? ` · ${data.destinationsSummary}` : ''}`),
          italics: true,
          size: 18,
          color: '475569',
        }),
      ],
    }),
  ];

  for (const day of data.days) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(sanitizeDocxText(`Giorno ${day.dayNum} — ${day.date}`))],
      })
    );
    if (day.accommodation) {
      const a = day.accommodation;
      const accSummary = `Alloggio: ${a.name}${a.address ? ` (${a.address})` : ''}${a.checkInTime ? ` · Check-in ${a.checkInTime}` : ''}${a.checkOutTime ? ` · Check-out ${a.checkOutTime}` : ''}`;
      children.push(
        new Paragraph({
          spacing: { before: 20, after: 60 },
          children: [new TextRun({ text: sanitizeDocxText(accSummary), size: 17 })],
        })
      );
    }

    const allEv = [...day.timedEvents, ...day.untimedEvents];
    if (allEv.length > 0) {
      children.push(
        buildEditableTable(
          ['Orario', 'Categoria', 'Voce', 'Dettagli'],
          allEv.map((ev) => [
            ev.time || '--:--',
            ev.categoryOrType,
            ev.title,
            [
              ev.departureLocation && ev.arrivalLocation ? `${ev.departureLocation} -> ${ev.arrivalLocation}` : (ev.address || ev.location),
              ev.bookingRef ? `Rif: ${ev.bookingRef}` : '',
              options.detailLevel === 'detailed' ? ev.note : '',
            ]
              .filter(Boolean)
              .join(' | '),
          ]),
          [1300, 1500, 2800, 4800]
        )
      );
    }

    for (const n of day.notes) {
      children.push(
        new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [new TextRun({ text: sanitizeDocxText(`Nota: ${n}`), size: 17, color: '334155' })],
        })
      );
    }
  }

  const doc = createStyledDocx(children, `HOUNIGO — ${data.tripTitle}`);
  const rawBlob = await Packer.toBlob(doc);
  const blob = new Blob([rawBlob], { type: DOCX_MIME });
  const fileName = buildPdfFileName(data.tripTitle).replace(/\.pdf$/i, '.docx');
  return { blob, fileName };
}
