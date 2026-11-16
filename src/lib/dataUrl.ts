// A profile picture arrives as a `data:image/...;base64,...` text. It is decoded right here and nothing else is fetched: asking the
// network to open "the address" a person sent would let anyone make this server request any web address on their behalf.
const DATA_IMAGE = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;
export const MAX_PICTURE_BYTES = 3 * 1024 * 1024;

export function dataUrlToBlob(dataUrl: string, maxBytes = MAX_PICTURE_BYTES): Blob {
  const match = typeof dataUrl === 'string' ? DATA_IMAGE.exec(dataUrl) : null;
  if (!match) throw new Error('The picture must be a webp, png or jpeg image.');
  const binary = atob(match[2]);
  if (binary.length > maxBytes) throw new Error('The picture is too large.');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}
