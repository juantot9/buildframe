import type { CliRenderer } from '@opentui/core';
import type { Workspace } from '@buildframe/workspace';
import { joinFileListPieces } from './reviewingFileListPieces.js';

import { ReviewingExtension } from './reviewingApplication.js';
import type { ReviewingHighlight } from './reviewingHighlight.js';
import type { ReviewingPresentation } from './reviewingModel.js';
import { createShell, type Shell } from './shell.js';
import { terminalFallbackClipboard, type ShellClipboardFactory } from './shellClipboard.js';
import { defineScreen, type Screen } from './shellScreen.js';
import type { UserConfiguration } from './userConfiguration.js';

/** Reviewing as a screen of the shell, and the app made of it. */

export interface ReviewingApplicationOptions {
  /** A connected runtime's closed Workspace Interface. */
  readonly workspace: Workspace;
  readonly presentation?: Partial<ReviewingPresentation>;
  /** Portable UI preferences; production supplies the file-backed Module. */
  readonly userConfiguration?: UserConfiguration;
  /** Screens that join Reviewing (Planning); their Home rows show on Reviewing's Home. */
  readonly screens?: readonly Screen<any, any>[];
}

/** Reviewing runs as the shell with one screen. */
export type ReviewingApplication = Shell;

/** Reviewing as the shell's one screen, while it still loads, listens and draws for itself. */
function reviewingScreen(
  options: ReviewingApplicationOptions,
  createHighlightClient?: ConstructorParameters<typeof ReviewingHighlight>[1],
): Screen<undefined, 'reviewing'> {
  return defineScreen<undefined, 'reviewing'>({
    name: 'reviewing',
    open: () => undefined,
    title: () => 'Reviewing',
    mode: () => 'reviewing',
    modes: { reviewing: {} },
    keys: [],
    body: () => [],
    // Long file lists arrive in pieces that fit the runtime's message cap; Reviewing reads them joined.
    extend: surface =>
      new ReviewingExtension(
        { ...options, workspace: joinFileListPieces(options.workspace) },
        surface,
        createHighlightClient,
      ),
  });
}

export function createReviewingApplication(options: ReviewingApplicationOptions): ReviewingApplication {
  return createShell({
    workspace: options.workspace,
    screens: [reviewingScreen(options), ...(options.screens ?? [])],
    first: { screen: 'reviewing' },
    ...(options.presentation === undefined ? {} : { presentation: options.presentation }),
    ...(options.userConfiguration === undefined ? {} : { userConfiguration: options.userConfiguration }),
  });
}

/** @internal Concrete OpenTUI test seam; deliberately absent from package exports. */
export function createReviewingApplicationForTest(
  options: ReviewingApplicationOptions & {
    readonly renderer: CliRenderer;
    readonly createHighlightClient?: ConstructorParameters<typeof ReviewingHighlight>[1];
    readonly createClipboardService?: ShellClipboardFactory;
  },
): ReviewingApplication {
  const { renderer, createHighlightClient, createClipboardService, ...applicationOptions } = options;
  // Scenario tests read exact geometry right after input; motion is opt-in there.
  const presentation = { reducedMotion: true, ...applicationOptions.presentation };
  return createShell({
    workspace: applicationOptions.workspace,
    screens: [
      reviewingScreen({ ...applicationOptions, presentation }, createHighlightClient),
      ...(applicationOptions.screens ?? []),
    ],
    first: { screen: 'reviewing' },
    presentation,
    ...(applicationOptions.userConfiguration === undefined
      ? {}
      : { userConfiguration: applicationOptions.userConfiguration }),
    renderer,
    createClipboard: createClipboardService ?? terminalFallbackClipboard,
  });
}
