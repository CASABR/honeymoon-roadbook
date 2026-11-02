import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

const MAX_PDF_PAGES = 30;
const MAX_EXTRACTED_CHARS = 30_000;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function extractTextFromPdfDataUrl(dataUrl: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({
    data: dataUrlToBytes(dataUrl),
    isEvalSupported: false,
    useWorkerFetch: false,
    verbosity: 0,
  } as any);
  const document = await loadingTask.promise;
  const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map(item => 'str' in item ? item.str : '')
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) pages.push(text);
    if (pages.join('\n').length >= MAX_EXTRACTED_CHARS) break;
  }
  await loadingTask.destroy();
  return pages.join('\n').slice(0, MAX_EXTRACTED_CHARS);
}
