import { createCanvas } from '@napi-rs/canvas';

/** Render một trang PDF thành PNG để đưa sang OCR (dùng cho PDF scan không có lớp chữ). */
export async function renderPdfPageToPng(pdf: any, pageNo: number, scale = 2): Promise<Buffer> {
  const page = await pdf.getPage(pageNo);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: context as any,
    viewport,
    canvas: canvas as any,
  }).promise;
  return canvas.toBuffer('image/png');
}
