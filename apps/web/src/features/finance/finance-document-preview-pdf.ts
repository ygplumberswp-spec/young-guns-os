/** Serialises the rendered document engine view to a genuine application/pdf download. */
export async function downloadFinancePreviewPdf(
  rootElement: HTMLElement,
  filename: string,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(rootElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#04070d',
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const printableWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * printableWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, 'PNG', margin, position, printableWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    position = margin - (imgHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, position, printableWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }

  const blob = pdf.output('blob');
  if (blob.type !== 'application/pdf') {
    throw new Error('PDF generation failed');
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
