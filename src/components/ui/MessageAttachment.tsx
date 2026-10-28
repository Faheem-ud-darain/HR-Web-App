'use client';

import { FileTextIcon as FileText, DownloadSimpleIcon as Download } from '@phosphor-icons/react/dist/ssr';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { isImageAttachment, formatBytes } from '@/lib/core/attachments';
import { safeHref } from '@/lib/sanitize';

interface MessageAttachmentProps {
  url: string;
  name?: string;
  size?: number;
  /** True when there is text above, so the attachment gets a small top margin. */
  spaced: boolean;
  /** Colour classes for the file link, which sits on differently coloured bubbles. */
  linkClass: string;
  onOpenImage: (url: string, name?: string) => void;
  /** Tickets save the file to the device; chats open it in a new tab. */
  download?: boolean;
  /** Tickets show the picture as it is; chats use the fading, lazy-loaded image. */
  plainImage?: boolean;
}

// One attachment inside a chat message or ticket reply: a picture that opens in the in-app lightbox
// (never an external browser, which cannot show a data: URL on Android), or a file link with its size.
export function MessageAttachment({ url, name, size, spaced, linkClass, onOpenImage, download, plainImage }: MessageAttachmentProps) {
  if (isImageAttachment(name)) {
    return (
      <button type="button" onClick={() => onOpenImage(url, name)} className={spaced ? 'block mt-2' : 'block'}>
        {plainImage ? (
          <img src={url} alt={name || 'attachment'} loading="lazy" decoding="async" className="rounded-lg max-h-56 object-cover" />
        ) : (
          <OptimizedImage src={url} alt={name || 'attachment'} width={400} height={220} className="rounded-lg max-h-56 object-cover" />
        )}
      </button>
    );
  }
  return (
    <a
      href={safeHref(url)}
      {...(download ? { download: name } : { target: '_blank', rel: 'noreferrer' })}
      className={`flex items-center gap-1.5 min-w-0 break-all text-caption font-bold underline ${spaced ? 'mt-2' : ''} ${linkClass}`}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" /> {name || 'Attachment'}
      {size !== undefined && <span className="font-semibold opacity-80">({formatBytes(size)})</span>}
      <Download className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}
