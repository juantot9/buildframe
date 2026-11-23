import type { HomeLauncherSelection, ReviewingApplicationState } from './reviewingModel.js';
import type { HomeChoice } from './shellHome.js';
import type { HomeEntry } from './shellHomeScreen.js';

/**
 * Reviewing still draws Home (WF-301), so its launcher also lists the rows
 * other screens add there; choosing one opens that screen over Reviewing.
 */

/** Another screen's row on Reviewing's launcher. */
export interface ExtraHomeRow {
  readonly id: `row:${string}`;
  readonly icon: { readonly text: string; readonly ascii: string };
  readonly label: string;
  readonly description: string;
  readonly available: boolean;
}

export function extraHomeRows(entries: readonly HomeEntry[]): readonly ExtraHomeRow[] {
  return entries.map(({ id, row }) => ({
    id: `row:${id}`,
    icon: row.icon,
    label: row.label,
    description: row.description,
    available: row.available,
  }));
}

/** The launcher's choices in order: Reviewing's own, then the rows other screens add. */
export function homeLauncherOptions(state: ReviewingApplicationState): HomeLauncherSelection[] {
  const home = state.home;
  if (home === undefined) return ['primary'];
  return [
    'primary',
    ...(home.currentReview === undefined ? [] : ['new-current' as const]),
    'comparison',
    ...(home.header.totalPastReviews > 0 ? ['history' as const] : []),
    ...state.extraHomeRows.filter(row => row.available).map(row => row.id),
  ];
}

/** Whether the selected launcher choice is still there to choose. */
export function homeSelectionAvailable(state: ReviewingApplicationState): boolean {
  return homeLauncherOptions(state).includes(state.homeLauncherSelection);
}

/** Home's launcher choices: Reviewing's own, then the rows other screens add. */
export function homeChoices(state: ReviewingApplicationState): readonly HomeChoice[] {
  const home = state.home!;
  const current = home.currentReview;
  const ascii = state.presentation.ascii;
  return [
    {
      id: 'primary',
      // ASCII twins stay distinct from the `>` cursor and the `-` separator.
      icon: current === undefined ? (ascii ? '+' : '◇') : ascii ? '@' : '●',
      label: current === undefined ? 'Review current changes' : 'Continue Current Review',
      description:
        current === undefined
          ? 'Everything since your last commit, including uncommitted changes.'
          : 'Go back to the open Review and its Messages.',
      available: true,
    },
    ...(current === undefined
      ? []
      : [
          {
            id: 'new-current',
            icon: ascii ? '+' : '◆',
            label: 'Start new Review',
            description: 'Start fresh from the code as it is now; the open Review moves to Previous Reviews.',
            available: true,
          },
        ]),
    {
      id: 'comparison',
      icon: ascii ? '=' : '↔',
      label: 'Review a commit or range',
      description: 'Pick commits from history; your files are not touched.',
      available: true,
    },
    {
      id: 'history',
      icon: ascii ? '%' : '◷',
      label:
        home.header.totalPastReviews === 0
          ? 'Previous Reviews (none yet)'
          : `Previous Reviews (${home.header.totalPastReviews})`,
      description:
        home.header.totalPastReviews === 0
          ? 'A Review moves here when you start a new one.'
          : 'Read earlier Reviews and their Messages.',
      available: home.header.totalPastReviews > 0,
    },
    ...state.extraHomeRows.map(row => ({
      id: row.id,
      icon: ascii ? row.icon.ascii : row.icon.text,
      label: row.label,
      description: row.description,
      available: row.available,
    })),
  ];
}
