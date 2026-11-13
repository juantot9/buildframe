const INVALID_BYTES_BASE64 = 'bytesBase64 must be canonical Base64';

/** Encodes the exact selected bytes with the standard padded Base64 alphabet. */
export function encodeBytesBase64(bytes: Uint8Array): string {
  const selected = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return selected.toString('base64');
}

/** Decodes only the one standard padded Base64 spelling for a byte sequence. */
export function decodeBytesBase64(value: unknown): Buffer {
  if (typeof value !== 'string') throw new TypeError(INVALID_BYTES_BASE64);
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) {
    throw new TypeError(INVALID_BYTES_BASE64);
  }
  return bytes;
}
