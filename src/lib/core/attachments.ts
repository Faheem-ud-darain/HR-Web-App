// Attachment helpers shared by chats, tickets and team documents.

/** True for file names the browser can show inline as a picture. */
export function isImageAttachment(name?: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name || '');
}

/** "812 B", "34 KB", "1.5 MB"; empty when the size is unknown. */
export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
