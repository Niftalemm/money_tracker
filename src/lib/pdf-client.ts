import type { Account } from './model';
import { PDF_LIMITS, pdfStatementSchema, type PdfStatement } from './pdf-types';
export const PDF_ERRORS: Record<string, string> = {
  size: 'PDFs must be 10 MB or smaller.',
  pages: 'PDFs must have at most 40 pages.',
  timeout:
    'PDF processing exceeded 20 seconds and was stopped. Try a smaller statement.',
  malformed: 'This PDF could not be read safely. No transactions were saved.',
  'active-content':
    'Embedded PDF scripting is rejected. Export a plain statement PDF.',
  scan: 'This PDF has no readable text. Scanned statements need manual entry or a bank CSV export.',
  encrypted:
    'Password-protected PDFs are not supported. Use a plain statement on your device.',
  'text-limit': 'This PDF exceeds the text or transaction limits.',
  'bank-mismatch': 'The statement bank does not match your selected account.',
  cancelled: 'PDF processing was cancelled.',
  unavailable: 'Local PDF processing is unavailable in this browser.',
};
export function parsePdf(
  file: File,
  account: Account,
  signal?: AbortSignal,
  factory = () => new Worker('/pdf-import.worker.mjs', { type: 'module' }),
): Promise<PdfStatement> {
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined,
      finished = false;
    const fail = (code: string) =>
      finish(undefined, new Error(PDF_ERRORS[code] ?? PDF_ERRORS.malformed));
    const finish = (result?: PdfStatement, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker?.terminate();
      error ? reject(error) : resolve(result!);
    };
    const abort = () => fail('cancelled');
    const timer = setTimeout(() => fail('timeout'), PDF_LIMITS.milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return fail('cancelled');
    if (!/\.pdf$/i.test(file.name) || file.size === 0) return fail('malformed');
    if (file.size > PDF_LIMITS.bytes) return fail('size');
    try {
      worker = factory();
    } catch {
      return fail('unavailable');
    }
    worker.onerror = (event) => {
      event.preventDefault();
      fail('malformed');
    };
    worker.onmessage = (event) => {
      if (event.data?.operation === 'error') return fail(event.data.code);
      if (event.data?.operation !== 'result') return; // PDF.js protocol messages contain no financial data.
      const checked = pdfStatementSchema.safeParse(event.data.statement);
      if (!checked.success || checked.data.account !== account)
        return fail('malformed');
      finish(checked.data);
    };
    file
      .arrayBuffer()
      .then((buffer) => {
        if (!finished)
          worker!.postMessage({ operation: 'parse', buffer, account }, [
            buffer,
          ]);
      })
      .catch(() => fail('malformed'));
  });
}
