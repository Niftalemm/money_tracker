// Core text extraction only; no viewer, scripting manager, rendering, or remote resources.
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';
import { getDocument, version } from 'pdfjs-dist';
import { adaptPdf, linesFromItems } from '../lib/pdf-adapters';
import { PDF_LIMITS } from '../lib/pdf-types';
import { ACCOUNTS } from '../lib/model';
// A PDF.js loopback worker inside this dedicated Worker lets termination stop ALL parsing.
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = {
  WorkerMessageHandler,
};
for (const method of ['log', 'warn', 'error', 'info', 'debug'] as const)
  console[method] = () => {};
let started = false;
self.addEventListener('message', async (event: MessageEvent) => {
  if (started || event.data?.operation !== 'parse') return;
  started = true;
  let task: ReturnType<typeof getDocument> | undefined;
  try {
    const { buffer, account } = event.data;
    if (
      !(buffer instanceof ArrayBuffer) ||
      buffer.byteLength > PDF_LIMITS.bytes ||
      !ACCOUNTS.includes(account)
    )
      throw new Error('malformed');
    const bytes = new Uint8Array(buffer);
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-')
      throw new Error('malformed');
    task = getDocument({
      data: bytes,
      verbosity: 0,
      stopAtErrors: true,
      enableXfa: false,
      useWasm: false,
      useWorkerFetch: false,
      useSystemFonts: false,
      disableFontFace: true,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
    });
    const doc = await task.promise;
    if (doc.numPages > PDF_LIMITS.pages) throw new Error('pages');
    if ((await doc.hasJSActions()) || (await doc.getJSActions()))
      throw new Error('active-content');
    let chars = 0,
      count = 0;
    const lines = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      if (await page.getJSActions()) throw new Error('active-content');
      const reader = page
        .streamTextContent({ disableNormalization: false })
        .getReader();
      const items: Array<{ str: string; transform: number[] }> = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const item of value.items)
          if ('str' in item) {
            chars += item.str.length;
            count++;
            if (chars > PDF_LIMITS.characters || count > PDF_LIMITS.items)
              throw new Error('text-limit');
            items.push(item);
          }
      }
      lines.push(...linesFromItems(pageNumber, items));
      if (lines.length > PDF_LIMITS.lines) throw new Error('text-limit');
      page.cleanup();
    }
    if (!chars) throw new Error('scan');
    const statement = adaptPdf(lines, account, doc.numPages, version);
    // Empty or unfamiliar layouts still reach manual review; totals must reconcile.
    self.postMessage({ operation: 'result', statement });
  } catch (error) {
    const codes = [
      'pages',
      'active-content',
      'text-limit',
      'scan',
      'bank-mismatch',
    ];
    const code =
      error instanceof Error && codes.includes(error.message)
        ? error.message
        : (error as { name?: string })?.name === 'PasswordException'
          ? 'encrypted'
          : 'malformed';
    self.postMessage({ operation: 'error', code });
  } finally {
    await task?.destroy();
  }
});
