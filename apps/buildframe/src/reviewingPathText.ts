import { displayCells, fitDisplayCellsEnd, fitDisplayCellsStart } from './displayCells.js';

/** How Reviewing shortens paths to fit: tree names, short paths and pane-title details. */

/** The last path segment, keeping a directory's trailing slash; the tree indent shows the rest. */
export function treeName(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const name = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return path.endsWith('/') ? `${name}/` : name;
}

export function shortDisplayPath(displayPath: string): string {
  const segments = displayPath.split('/');
  return segments.slice(-2).join('/');
}

/**
 * Fits a pane detail such as `since last commit · src/review.ts` into `width`
 * cells without cutting words out of the middle. The file name is the part
 * worth keeping: the path shortens to its name first, then basis words drop
 * (never a leading PAST or composing), then the name loses its start.
 */
export function fitPaneDetail(detail: string, width: number, ellipsis: string): string {
  if (displayCells(detail) <= width) return detail;
  const segments = detail.split(' · ');
  let pathAt = segments.length - 1;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index]!.includes('/')) {
      pathAt = index;
      break;
    }
  }
  segments[pathAt] = segments[pathAt]!.replace(/^.*\//u, '');
  const kept = (segment: string, index: number): boolean =>
    index === pathAt || (index === 0 && /^(PAST|composing)$/u.test(segment)) || segment === 'loading';
  const fits = (): boolean => displayCells(segments.join(' · ')) <= width;
  for (let index = 0; !fits() && index < segments.length;) {
    if (kept(segments[index]!, index)) index += 1;
    else segments.splice(index, 1);
  }
  const joined = segments.join(' · ');
  if (displayCells(joined) <= width) return joined;
  const name = segments.findIndex(segment => segment.includes('.') || segment.includes(':'));
  const at = name < 0 ? segments.length - 1 : name;
  const others = displayCells(
    segments
      .filter((_, index) => index !== at)
      .map(segment => `${segment} · `)
      .join(''),
  );
  segments[at] = fitDisplayCellsStart(segments[at]!, Math.max(1, width - others), ellipsis);
  return fitDisplayCellsEnd(segments.join(' · '), Math.max(1, width), ellipsis);
}
