function collectDocumentStyles(): string {
  return Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('\n');
}

export async function exportElementToPdf(title: string, element: HTMLElement): Promise<void> {
  const printWindow = window.open('', '_blank', 'width=1200,height=900');
  if (!printWindow) {
    throw new Error('Unable to open the print window. Please allow pop-ups and try again.');
  }

  const styles = collectDocumentStyles();
  const printableMarkup = element.outerHTML;

  const doc = printWindow.document;
  doc.open();
  doc.write('<!doctype html><html lang="en"><head></head><body></body></html>');
  doc.close();

  doc.title = title;

  const metaCharset = doc.createElement('meta');
  metaCharset.setAttribute('charset', 'utf-8');
  doc.head.appendChild(metaCharset);

  const metaViewport = doc.createElement('meta');
  metaViewport.setAttribute('name', 'viewport');
  metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
  doc.head.appendChild(metaViewport);

  const clonedStyles = doc.createElement('div');
  clonedStyles.innerHTML = styles;
  while (clonedStyles.firstChild) {
    doc.head.appendChild(clonedStyles.firstChild);
  }

  const inlineStyle = doc.createElement('style');
  inlineStyle.textContent = `
    body {
      margin: 0;
      padding: 24px;
      background: #ffffff;
    }

    .ct-pdf-shell {
      max-width: 1280px;
      margin: 0 auto;
    }

    @page {
      size: auto;
      margin: 12mm;
    }

    @media print {
      body {
        padding: 0;
      }
    }
  `;
  doc.head.appendChild(inlineStyle);

  const shell = doc.createElement('div');
  shell.className = 'ct-pdf-shell';
  shell.innerHTML = printableMarkup;
  doc.body.innerHTML = '';
  doc.body.appendChild(shell);

  await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 700));

  printWindow.focus();
  printWindow.print();
}
