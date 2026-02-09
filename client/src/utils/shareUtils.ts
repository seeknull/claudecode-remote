export interface ShareResult {
  shared?: boolean;
  downloaded?: boolean;
  cancelled?: boolean;
  error?: string;
}

/**
 * Share or download a PDF file using the Web Share API with fallback to direct download
 */
export async function shareOrDownloadPDF(
  pdfBlob: Blob,
  filename: string,
  title: string = 'Session Export'
): Promise<ShareResult> {
  // Check Web Share API support
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      // Check if we can share files
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title,
          text: `Claude Code session export: ${filename}`,
        });
        return { shared: true };
      }
    } catch (err: any) {
      // User cancelled the share dialog
      if (err.name === 'AbortError') {
        return { cancelled: true };
      }
      // Fall through to download fallback on other errors
      console.warn('Share API failed, falling back to download:', err);
    }
  }

  // Fallback: Direct download
  try {
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up the blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 100);

    return { downloaded: true };
  } catch (err: any) {
    return { error: err.message || 'Failed to download PDF' };
  }
}

/**
 * Check if the Web Share API is available and can share files
 */
export function canShareFiles(): boolean {
  if (!navigator.share || !navigator.canShare) {
    return false;
  }

  // Create a dummy file to test
  const dummyFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
  return navigator.canShare({ files: [dummyFile] });
}

/**
 * Export messages as JSON (fallback for very large sessions)
 */
export function exportAsJSON(data: any, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace('.pdf', '.json');
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
