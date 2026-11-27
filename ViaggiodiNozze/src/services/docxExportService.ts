/**
 * docxExportService.ts
 * Generatore client-side (100% offline, zero dipendenze esterne) di file Word (.docx)
 * completamente modificabili per l'itinerario HOUNIGO.
 */

import {
  type PdfExportOptions,
  type OperationalExportData,
  preparePdfData,
  prepareOperationalExportData,
  buildPdfFileName,
} from './pdfExportService';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ─── 1. MINI WRITER ZIP (Stored, CRC32 + UTF-8) ───
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries: Array<{ name: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true);         // Version needed
    lv.setUint16(6, 0x0800, true);     // UTF-8 filename flag
    lv.setUint16(8, 0, true);          // Compression: 0 (Stored)
    lv.setUint16(10, 0, true);         // Mod time
    lv.setUint16(12, 0x5421, true);    // Mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  let centralSize = 0;
  for (const cp of centralParts) centralSize += cp.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const blobParts: BlobPart[] = [...localParts, ...centralParts, eocd].map(
    (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
  );
  return new Blob(blobParts, { type: DOCX_MIME });
}

// ─── 2. OOXML HELPERS ───
function escXml(s: string | undefined | null): string {
  return String(s || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wP(
  text: string,
  opts: { style?: string; before?: number; after?: number; bold?: boolean; italic?: boolean; sz?: number; color?: string } = {}
): string {
  const style = opts.style ? `<w:pStyle w:val="${opts.style}"/>` : '';
  const spacing = `<w:spacing w:before="${opts.before ?? 20}" w:after="${opts.after ?? 40}"/>`;
  const bold = opts.bold ? '<w:b/>' : '';
  const italic = opts.italic ? '<w:i/>' : '';
  const sz = opts.sz ? `<w:sz w:val="${opts.sz}"/><w:szCs w:val="${opts.sz}"/>` : '';
  const color = opts.color ? `<w:color w:val="${opts.color}"/>` : '';
  const rPr = (bold || italic || sz || color) ? `<w:rPr>${bold}${italic}${sz}${color}</w:rPr>` : '';
  return `<w:p><w:pPr>${style}${spacing}</w:pPr><w:r>${rPr}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;
}

function wCell(
  text: string,
  widthDxa: number,
  opts: { bold?: boolean; fill?: string; sz?: number; color?: string } = {}
): string {
  const fill = opts.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.fill}"/>` : '';
  const tcPr = `<w:tcPr><w:tcW w:w="${widthDxa}" w:type="dxa"/>${fill}<w:tcMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tcMar></w:tcPr>`;
  return `<w:tc>${tcPr}${wP(text, { bold: opts.bold, sz: opts.sz ?? 16, before: 0, after: 0, color: opts.color })}</w:tc>`;
}

function wTable(headers: string[], rows: string[][], widths: number[]): string {
  const borders = `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders>`;
  const totalW = widths.reduce((a, b) => a + b, 0);
  const tblPr = `<w:tblPr><w:tblW w:w="${totalW}" w:type="dxa"/>${borders}</w:tblPr>`;
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const hdrRow = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${headers.map((h, i) => wCell(h, widths[i], { bold: true, fill: 'F1F5F9', sz: 15 })).join('')}</w:tr>`;
  const bodyRows = rows
    .map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => wCell(c, widths[i], { sz: 15, bold: i === 2 })).join('')}</w:tr>`)
    .join('');
  return `<w:tbl>${tblPr}${grid}${hdrRow}${bodyRows}</w:tbl>`;
}

function packageDocx(docBodyXml: string, footerLabel: string): Blob {
  const enc = new TextEncoder();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/><w:color w:val="172033"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="172033"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:shd w:val="clear" w:color="auto" w:fill="EEF2F6"/></w:pPr><w:rPr><w:b/><w:sz w:val="21"/><w:color w:val="172033"/></w:rPr></w:style>
</w:styles>`;

  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="right"/></w:pPr>
    <w:r><w:rPr><w:sz w:val="16"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">${escXml(footerLabel)} · Pagina </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>
    <w:r><w:rPr><w:sz w:val="16"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve"> di </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${docBodyXml}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="680" w:bottom="720" w:left="680" w:header="400" w:footer="400" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  return createStoredZip([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) },
    { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    { name: 'word/footer1.xml', data: enc.encode(footerXml) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
  ]);
}

function buildOperationalDocxBody(opData: OperationalExportData): string {
  let docBody = '';
  docBody += wP(`HOUNIGO — Compatto Operativo (${opData.tripTitle})`, { style: 'Heading1', before: 0, after: 40 });
  docBody += wP(`Periodo: ${opData.tripDates} · Documento modificabile pronto per la stampa`, { italic: true, sz: 18, color: '475569', after: 100 });

  if (opData.documents.length > 0) {
    docBody += wP('Documenti Essenziali', { style: 'Heading2', before: 80, after: 40 });
    docBody += wTable(
      ['Documento', 'Categoria'],
      opData.documents.map((d) => [d.title, d.category]),
      [7200, 3200]
    );
  }

  const summaryRows: string[][] = [
    ...opData.pendingBalances.map((b) => [b.date, b.name, `Residuo: ${b.amount}`]),
    ...opData.deposits.map((c) => [c.date, c.name, `Cauzione: ${c.cauzione}`]),
    ...opData.undatedDeadlines.map((s) => ['Da verificare', s.title, s.details]),
    ...opData.generalNotes.map((n) => ['Generale', n.title, n.content]),
  ];
  if (summaryRows.length > 0) {
    docBody += wP('Saldi Residui, Cauzioni e Note Generali', { style: 'Heading2', before: 120, after: 40 });
    docBody += wTable(['Data', 'Voce', 'Dettaglio'], summaryRows, [1600, 3400, 5400]);
  }

  for (const dg of opData.days) {
    docBody += wP(`Giorno ${dg.dayNum} — ${dg.label} (${dg.date})`, { style: 'Heading2', before: 140, after: 40 });
    if (dg.accommodation) {
      const a = dg.accommodation;
      const accTxt = `Alloggio: ${a.name}${a.address ? ` | ${a.address}` : ''} | Check-in/out: ${a.checkInOut}${a.ref ? ` | Rif: ${a.ref}` : ''}${a.finance ? ` | ${a.finance}` : ''}${a.instructions ? ` | Istruzioni: ${a.instructions}` : ''}`;
      docBody += wP(accTxt, { sz: 16, before: 20, after: 40 });
    } else {
      docBody += wP('Notte in volo / transito aeroportuale (nessun alloggio a terra).', { italic: true, sz: 16, before: 20, after: 40 });
    }

    if (dg.events.length > 0) {
      docBody += wTable(
        ['Orario / Stato', 'Categoria', 'Voce', 'Dettagli operativi'],
        dg.events.map((ev) => [`${ev.time} [${ev.badge}]`, ev.category, ev.title, ev.details]),
        [1600, 1400, 2600, 4800]
      );
    }
    for (const dn of dg.dayNotes) {
      docBody += wP(`Nota: ${dn}`, { sz: 16, before: 30, after: 30 });
    }
  }

  return docBody;
}

/**
 * Genera un file Word (.docx) modificabile dall'itinerario corrente (anche offline).
 */
export async function generateRoadbookDocx(options: PdfExportOptions): Promise<{
  blob: Blob;
  fileName: string;
}> {
  if (options.detailLevel === 'operational') {
    const opData = await prepareOperationalExportData(options);
    const body = buildOperationalDocxBody(opData);
    const blob = packageDocx(body, `HOUNIGO — Compatto Operativo (${opData.tripTitle})`);
    const fileName = buildPdfFileName(opData.tripTitle, 'Compatto Operativo').replace(/\.pdf$/i, '.docx');
    return { blob, fileName };
  }

  const data = await preparePdfData(options);
  let docBody = '';
  docBody += wP(`HOUNIGO — ${data.tripTitle}`, { style: 'Heading1', before: 0, after: 40 });
  docBody += wP(`${data.tripDates}${data.destinationsSummary ? ` · ${data.destinationsSummary}` : ''}`, { italic: true, sz: 18, color: '475569', after: 100 });

  for (const day of data.days) {
    docBody += wP(`Giorno ${day.dayNum} — ${day.date}`, { style: 'Heading2', before: 120, after: 40 });
    if (day.accommodation) {
      const a = day.accommodation;
      docBody += wP(`Alloggio: ${a.name}${a.address ? ` (${a.address})` : ''}${a.checkInTime ? ` · Check-in ${a.checkInTime}` : ''}${a.checkOutTime ? ` · Check-out ${a.checkOutTime}` : ''}`, { sz: 16, before: 20, after: 40 });
    }
    const allEv = [...day.timedEvents, ...day.untimedEvents];
    if (allEv.length > 0) {
      docBody += wTable(
        ['Orario', 'Categoria', 'Voce', 'Dettagli'],
        allEv.map((ev) => [
          ev.time || '--:--',
          ev.categoryOrType,
          ev.title,
          [ev.departureLocation && ev.arrivalLocation ? `${ev.departureLocation} -> ${ev.arrivalLocation}` : (ev.address || ev.location), ev.bookingRef ? `Rif: ${ev.bookingRef}` : '', options.detailLevel === 'detailed' ? ev.note : ''].filter(Boolean).join(' | '),
        ]),
        [1300, 1500, 2800, 4800]
      );
    }
    for (const n of day.notes) {
      docBody += wP(`Nota: ${n}`, { sz: 16, before: 30, after: 30 });
    }
  }

  const blob = packageDocx(docBody, `HOUNIGO — ${data.tripTitle}`);
  const fileName = buildPdfFileName(data.tripTitle).replace(/\.pdf$/i, '.docx');
  return { blob, fileName };
}
