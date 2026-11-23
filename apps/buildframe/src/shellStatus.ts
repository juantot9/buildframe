/** How the shell says things: status tones, notice lifetimes and glyphs, and the spinner. */

export type StatusTone = 'success' | 'accent' | 'warning' | 'danger' | 'muted';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
// Not | / - \: those are the ASCII borders and separators.
const ASCII_SPINNER = ['.', ':', "'", ':'];

/** Milliseconds between spinner frames while something is working. */
export const SPINNER_FRAME_MS = 120;

export function spinnerGlyph(frame: number, ascii: boolean): string {
  const frames = ascii ? ASCII_SPINNER : SPINNER;
  return frames[Math.abs(frame) % frames.length]!;
}

/** Status-line severity: it picks the symbol, the colour and how long the line stays. */
export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export const NOTICE_LIFETIME_MS: Record<NoticeTone, number> = {
  info: 5_000,
  success: 5_000,
  warning: 10_000,
  error: 20_000,
};

export function noticeGlyph(tone: NoticeTone, ascii: boolean): string {
  switch (tone) {
    case 'success':
      return ascii ? '+' : '✓';
    case 'warning':
      return '!';
    case 'error':
      return ascii ? 'x' : '✗';
    case 'info':
      return '';
  }
}

export function noticeStatusTone(tone: NoticeTone): StatusTone {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'danger';
    case 'info':
      return 'muted';
  }
}
