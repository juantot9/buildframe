import type { WorkspaceView } from '@buildframe/workspace';

import { Key, matchesKey } from './reviewingInput.js';
import { Box } from './renderTree.js';
import { homeLauncherCard } from './shellHome.js';
import { theme } from './shellLook.js';
import { defineScreen, type HomeRow, type Screen } from './shellScreen.js';

/** The name Home opens under; no screen may take it. */
export const HOME_SCREEN = 'home';

interface HomeState {
  selected: string | undefined;
  /** Each contributing screen's views, as last read. */
  views: Readonly<Record<string, Readonly<Record<string, WorkspaceView>>>>;
}

/** A row's id on Home: the screen's name and the row's own id, so two screens never collide. */
const rowId = (screen: string, row: HomeRow): string => `${screen}-${row.id}`;

/**
 * Home: one card with the rows every screen adds, in the order the screens
 * are registered. It reads all their views together, so the rows always
 * describe one State version. j/k move, Enter chooses.
 */
export function homeScreen(screens: readonly Screen<any, any>[]): Screen<HomeState, 'home'> {
  const contributors = screens.filter(screen => screen.home !== undefined);
  if (screens.some(screen => screen.name === HOME_SCREEN)) throw new TypeError(`No screen may be named ${HOME_SCREEN}`);
  const rows = (state: HomeState): { readonly id: string; readonly row: HomeRow }[] =>
    contributors.flatMap(screen =>
      screen.home!.rows(state.views[screen.name] ?? {}).map(row => ({ id: rowId(screen.name, row), row })),
    );
  const selected = (state: HomeState) => {
    const all = rows(state);
    return all.find(entry => entry.id === state.selected) ?? all.find(entry => entry.row.available) ?? all[0];
  };
  return defineScreen<HomeState, 'home'>({
    name: HOME_SCREEN,
    open: () => ({ selected: undefined, views: {} }),
    title: () => 'Home',
    mode: () => 'home',
    modes: { home: {} },
    keys: [
      {
        id: 'move',
        keys: ['j', 'k', Key.down, Key.up],
        show: 'j/k',
        label: 'move',
        help: { group: 'MOVE', text: 'Move between choices' },
        run: (state, input) => {
          const all = rows(state);
          if (all.length === 0) return;
          const at = Math.max(0, all.indexOf(selected(state)!));
          const step = input.text === 'k' || matchesKey(input, Key.up) ? -1 : 1;
          state.selected = all[Math.min(all.length - 1, Math.max(0, at + step))]!.id;
        },
      },
      {
        id: 'open',
        keys: [Key.enter],
        show: 'Enter',
        label: 'open',
        help: { group: 'OPEN', text: 'Open the selected choice' },
        run: state => selected(state)?.row.choose(),
      },
    ],
    views: () =>
      Object.fromEntries(
        contributors.flatMap(screen =>
          Object.entries(screen.home!.views?.() ?? {}).map(([key, scope]) => [`${screen.name}:${key}`, scope]),
        ),
      ),
    receive: (state, views) => {
      state.views = Object.fromEntries(
        contributors.map(screen => [
          screen.name,
          Object.fromEntries(
            Object.entries(views).flatMap(([key, view]) =>
              key.startsWith(`${screen.name}:`) ? [[key.slice(screen.name.length + 1), view]] : [],
            ),
          ),
        ]),
      );
    },
    body: (state, look, height) => {
      const current = selected(state);
      const card = homeLauncherCard(
        look,
        rows(state).map(({ id, row }) => ({
          ...row,
          id,
          icon: look.presentation.ascii ? row.icon.ascii : row.icon.text,
        })),
        current?.id ?? '',
        HOME_SCREEN,
      );
      return [
        Box(
          {
            id: 'home-body',
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: Math.max(0, Math.floor((height - Math.min(card.height, height)) / 2)),
            backgroundColor: look.presentation.noColor ? 'transparent' : theme(look).background,
            overflow: 'hidden',
          },
          card.node,
        ),
      ];
    },
  });
}
