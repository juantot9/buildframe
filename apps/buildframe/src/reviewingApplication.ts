import { type CliRenderer } from '@opentui/core';
import { decodeBytesBase64 } from '@buildframe/workspace/bytes-base64';
import type { Workspace, WorkspaceCommand } from '@buildframe/workspace';
import type { ReviewHarnessInteractionViewScope } from '@buildframe/workspace/harness-interaction';
import type {
  ReviewLiveFilesView,
  ReviewLiveManifestView,
  ReviewManifestView,
  ReviewQuestionBodyView,
  WorkspaceHomeView,
  WorkspaceProjectionViewScope,
} from '@buildframe/workspace/projection';
import type { ReviewIdentity, ReviewSnapshotIdentity } from '@buildframe/workspace/reviewing';

import {
  ShellClipboard,
  productionClipboard,
  terminalFallbackClipboard,
  type ShellClipboardFactory,
} from './shellClipboard.js';
import { DebouncedSave } from './shellPreferences.js';
import { executeCommand, semanticError } from './shellCommands.js';
import { isLiveScope, liveViewIdentity, ShellWatch } from './shellWatch.js';
import { ShellTerminal } from './shellTerminal.js';
import {
  DIFF_WINDOW_SIZE,
  HARNESS_INTERACTION_WINDOW_SIZE,
  HOME_WINDOW_SIZE,
  LIVE_FILE_WINDOW_SIZE,
  MAX_PROJECTION_ATTEMPTS,
  MESSAGE_BODY_LIMIT_BYTES,
  MESSAGE_BODY_WINDOW_BYTES,
  MANIFEST_WINDOW_SIZE,
  QUESTION_BODY_WINDOW_BYTES,
  QUESTION_WINDOW_SIZE,
  REVIEW_BASIS_WINDOW_SIZE,
  REVIEW_MESSAGE_WINDOW_SIZE,
  SEARCH_RESULT_WINDOW_SIZE,
  VERSION_WINDOW_SIZE,
  ReviewingApplicationModel,
  noticeToneOf,
  reviewingSourceKey,
  type HomeMode,
  type ReviewLoadTarget,
  type ReviewSelectionHint,
  type ReviewingModelEffect,
  type ReviewingPresentation,
  type ReviewViewBundle,
} from './reviewingModel.js';
import { firstListedFile, manifestFileItems } from './reviewingFileList.js';
import { ReviewingView } from './reviewingView.js';
import { NOTICE_LIFETIME_MS, SPINNER_FRAME_MS } from './reviewingStatus.js';
import { ReviewingHighlight } from './reviewingHighlight.js';
import {
  createEphemeralUserConfiguration,
  type ReviewingPreferences,
  type UserConfiguration,
} from './userConfiguration.js';

export interface ReviewingApplicationOptions {
  /** A connected runtime's closed Workspace Interface. */
  readonly workspace: Workspace;
  readonly presentation?: Partial<ReviewingPresentation>;
  /** Portable UI preferences; production supplies the file-backed Module. */
  readonly userConfiguration?: UserConfiguration;
}

export interface ReviewingApplication {
  /** Resolves when terminal ownership and the connected Workspace use have ended. */
  readonly closed: Promise<void>;
  /** Starts OpenTUI and resolves after the Current Review or minimal launcher is visible. */
  start(): Promise<void>;
  /** Stops subscriptions and terminal ownership without changing workflow meaning. */
  stop(): Promise<void>;
}

interface ActiveHomeRoute {
  readonly kind: 'home';
  readonly offset: number;
  readonly preferredReviewIdentity?: ReviewIdentity;
  readonly mode?: HomeMode;
  readonly autoOpenActive?: boolean;
}

interface ActiveReviewRoute {
  readonly kind: 'review';
  readonly target: ReviewLoadTarget;
  readonly selection?: ReviewSelectionHint;
  readonly fromSearch?: boolean;
}

type ActiveRoute = ActiveHomeRoute | ActiveReviewRoute;

type ReviewingSubscriptionScope = WorkspaceProjectionViewScope | ReviewHarnessInteractionViewScope;

class ProjectionVersionsDidNotConverge extends Error {}
class LiveChangesTemporarilyUnverified extends Error {}

class OpenReviewingApplication implements ReviewingApplication {
  readonly closed: Promise<void>;
  readonly #workspace: Workspace;
  readonly #providedRenderer: CliRenderer | undefined;
  readonly #userConfiguration: UserConfiguration;
  readonly #model: ReviewingApplicationModel;
  #renderer: CliRenderer | undefined;
  #view: ReviewingView | undefined;
  readonly #highlight: ReviewingHighlight;
  readonly #createClipboard: ShellClipboardFactory;
  #clipboard: ShellClipboard | undefined;
  #terminal: ShellTerminal | undefined;
  #unsubscribeFromConnection: (() => void) | undefined;
  #route?: ActiveRoute;
  #routeGeneration = 0;
  #loadSequence = 0;
  #comparisonPreviewSequence = 0;
  #comparisonPreviewTimer: NodeJS.Timeout | undefined;
  #reviewSearchSequence = 0;
  #reviewSearchTimer: NodeJS.Timeout | undefined;
  #searchPreviewSequence = 0;
  #searchPreviewTimer: NodeJS.Timeout | undefined;
  #filePreviewEffect:
    | Extract<ReviewingModelEffect, { readonly type: 'preview-file' | 'preview-file-content' }>
    | undefined;
  #filePreviewTimer: NodeJS.Timeout | undefined;
  readonly #reviewLoads = new Map<string, Promise<void>>();
  readonly #reviewDiffLoads = new Map<string, Promise<void>>();
  readonly #watch: ShellWatch;
  readonly #preferencesSave = new DebouncedSave<ReviewingPreferences>(async preferences => {
    try {
      const result = await this.#userConfiguration.saveReviewingPreferences(preferences);
      if (result.status === 'rejected' && !this.#stopped) {
        this.#model.reportConfigurationWarning(`Layout was not saved: ${result.reason}.`);
        this.#render();
      }
    } catch (error) {
      if (!this.#stopped) {
        this.#model.reportConfigurationWarning(`Couldn’t save the layout. ${semanticError(error)}`);
        this.#render();
      }
    }
  });
  #started = false;
  #stopped = false;
  #diffPrefetchInFlight = false;
  #diffPrefetchDeclined: string | undefined;
  #resolveClosed!: () => void;

  constructor(
    options: ReviewingApplicationOptions,
    renderer?: CliRenderer,
    createHighlightClient?: ConstructorParameters<typeof ReviewingHighlight>[1],
    createClipboardService: ShellClipboardFactory = productionClipboard,
  ) {
    this.closed = new Promise(resolve => {
      this.#resolveClosed = resolve;
    });
    this.#workspace = options.workspace;
    this.#providedRenderer = renderer;
    this.#userConfiguration = options.userConfiguration ?? createEphemeralUserConfiguration();
    this.#model = new ReviewingApplicationModel(options.presentation);
    this.#highlight = new ReviewingHighlight(() => this.#view?.invalidateHighlight(), createHighlightClient);
    this.#createClipboard = createClipboardService;
    this.#watch = new ShellWatch({
      workspace: this.#workspace,
      current: generation => !this.#stopped && generation === this.#routeGeneration,
      stopped: () => this.#stopped,
      isLive: isLiveScope,
      failed: () => {
        this.#model.fail('Review projection records are invalid.');
        this.#render();
      },
      refresh: async () => await this.#refreshCurrent(),
    });
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    let configurationWarning: string | undefined;
    try {
      const loaded = await this.#userConfiguration.load();
      this.#model.applyReviewingPreferences(loaded.preferences, loaded.themes);
      configurationWarning = loaded.warning;
    } catch (error) {
      configurationWarning = `Couldn’t read your settings, so defaults are in use. ${semanticError(error)}`;
    }
    this.#terminal = await ShellTerminal.open({
      provided: this.#providedRenderer,
      noColor: this.#model.state.presentation.noColor,
      host: {
        attention: attention => this.#workspace.setAttention(attention),
        themeMode: mode => {
          if (this.#model.setTerminalThemeMode(mode) && this.#view !== undefined) this.#render();
        },
      },
    });
    this.#renderer = this.#terminal.renderer;
    this.#highlight.attachRenderer(this.#renderer.nativeScene);
    this.#clipboard = new ShellClipboard(this.#createClipboard, this.#renderer);
    // Paint the first frame in the terminal's own light/dark so a light
    // terminal never flashes the dark theme; a silent terminal stays dark.
    this.#model.setTerminalThemeMode(await this.#terminal.listen());
    this.#view = new ReviewingView(
      this.#renderer,
      this.#model,
      effects => {
        // Local selection changes render inside ReviewingView before effects
        // cross this callback. Start warming the new neighbors immediately,
        // including when the selected file itself came from the session cache.
        this.#scheduleNeighborWarmup();
        const crossesWorkspace = effects.some(effect => effect.type === 'execute');
        if (!crossesWorkspace) {
          this.#runEffects(effects);
          return;
        }
        // Workspace I/O waits until OpenTUI has drawn the local pending state.
        void this.#renderer?.idle().then(() => {
          if (!this.#stopped) this.#runEffects(effects);
        });
      },
      this.#highlight,
      () => this.#scheduleDiffPrefetch(),
    );
    this.#view.start();
    this.#subscribeToConnection();
    try {
      await this.#showHome({ kind: 'home', offset: 0, autoOpenActive: true });
      if (configurationWarning !== undefined) {
        this.#model.reportConfigurationWarning(configurationWarning);
        this.#render();
      }
    } catch (error) {
      this.#model.fail(`Couldn’t load Home. ${semanticError(error)}`);
      this.#render();
      throw error;
    }
  }

  /** The header's agent indicator follows the Workspace for the whole session, across routes. */
  #subscribeToConnection(): void {
    try {
      this.#unsubscribeFromConnection = this.#workspace.subscribe({ kind: 'harness.connection' }, update => {
        if (this.#stopped) return;
        this.#model.setHarnessConnection(update);
        this.#render();
      });
    } catch {
      // A Workspace without the runtime-owned writer has no agents: no indicator.
    }
  }

  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#routeGeneration += 1;
    this.#loadSequence += 1;
    this.#clipboard?.cancel();
    this.#clearSubscriptions();
    this.#unsubscribeFromConnection?.();
    this.#unsubscribeFromConnection = undefined;
    this.#comparisonPreviewSequence += 1;
    if (this.#comparisonPreviewTimer !== undefined) {
      clearTimeout(this.#comparisonPreviewTimer);
      this.#comparisonPreviewTimer = undefined;
    }
    if (this.#animationTimer !== undefined) clearTimeout(this.#animationTimer);
    this.#animationTimer = undefined;
    if (this.#noticeTimer !== undefined) clearTimeout(this.#noticeTimer);
    this.#noticeTimer = undefined;
    this.#reviewSearchSequence += 1;
    if (this.#reviewSearchTimer !== undefined) {
      clearTimeout(this.#reviewSearchTimer);
      this.#reviewSearchTimer = undefined;
    }
    this.#searchPreviewSequence += 1;
    if (this.#searchPreviewTimer !== undefined) {
      clearTimeout(this.#searchPreviewTimer);
      this.#searchPreviewTimer = undefined;
    }
    this.#filePreviewEffect = undefined;
    this.#reviewLoads.clear();
    this.#reviewDiffLoads.clear();
    if (this.#filePreviewTimer !== undefined) {
      clearTimeout(this.#filePreviewTimer);
      this.#filePreviewTimer = undefined;
    }
    if (this.#neighborWarmupTimer !== undefined) {
      clearTimeout(this.#neighborWarmupTimer);
      this.#neighborWarmupTimer = undefined;
    }
    await this.#preferencesSave.settle();
    this.#view?.stop();
    this.#view = undefined;
    this.#terminal?.stopResizing();
    const clipboard = this.#clipboard;
    this.#clipboard = undefined;
    try {
      await this.#highlight.destroy();
    } finally {
      try {
        await clipboard?.dispose();
      } finally {
        const terminal = this.#terminal;
        this.#terminal = undefined;
        this.#renderer = undefined;
        await terminal?.close();
      }
    }
    this.#resolveClosed();
  }

  #render(): void {
    this.#view?.render();
    this.#scheduleNeighborWarmup();
    this.#scheduleAnimation();
    this.#scheduleNoticeExpiry();
  }

  /**
   * Reads the next Diff window before the view reaches the loaded edge, so a
   * long file scrolls as one document. One read at a time; a window that could
   * not join is not asked for again until something changes.
   */
  #scheduleDiffPrefetch(): void {
    if (this.#stopped || this.#diffPrefetchInFlight) return;
    const review = this.#model.state.review;
    const request = this.#model.diffPrefetch();
    if (review === undefined || request === undefined) return;
    const changes = this.#model.state.shownStep;
    const key = JSON.stringify([reviewingSourceKey(review), changes?.key, request.fileIdentity, request.offset]);
    if (key === this.#diffPrefetchDeclined) return;
    this.#diffPrefetchInFlight = true;
    const source = review.source;
    const read: Promise<ReviewViewBundle['diff']> =
      changes !== undefined
        ? this.#workspace
            .read({
              kind: 'review.step-changes-diff',
              reviewIdentity: review.manifest.header.reviewIdentity,
              from: changes.from,
              to: changes.to,
              fileIdentity: request.fileIdentity,
              offset: request.offset,
              limit: DIFF_WINDOW_SIZE,
            })
            .then(view => this.#model.stepChangeDiffPage(view))
        : source.kind === 'live'
          ? this.#workspace.read({
              kind: 'review.live-diff',
              reviewIdentity: review.manifest.header.reviewIdentity,
              liveChangesIdentity: source.liveChangesIdentity,
              fileIdentity: request.fileIdentity,
              offset: request.offset,
              limit: DIFF_WINDOW_SIZE,
            })
          : this.#workspace.read({
              kind: 'review.diff',
              reviewIdentity: review.manifest.header.reviewIdentity,
              reviewSnapshotIdentity: source.reviewSnapshotIdentity,
              fileIdentity: request.fileIdentity,
              offset: request.offset,
              limit: DIFF_WINDOW_SIZE,
            });
    void read
      .then(page => {
        this.#diffPrefetchInFlight = false;
        if (this.#stopped) return;
        if (page?.status === 'available' && this.#model.extendDiff(page, changes?.key)) {
          this.#diffPrefetchDeclined = undefined;
          this.#render();
          return;
        }
        this.#diffPrefetchDeclined = key;
      })
      .catch(() => {
        // The next refresh or key press reads again.
        this.#diffPrefetchInFlight = false;
        this.#diffPrefetchDeclined = key;
      });
  }

  /** Keeps spinners moving while something works; stops as soon as nothing does. */
  #scheduleAnimation(): void {
    if (this.#stopped || this.#animationTimer !== undefined || !this.#model.animating()) return;
    this.#animationTimer = setTimeout(() => {
      this.#animationTimer = undefined;
      if (this.#stopped) return;
      this.#model.advanceAnimation();
      this.#render();
    }, SPINNER_FRAME_MS);
  }

  /** Clears a status-line notice after its tone's lifetime unless something replaced it. */
  #scheduleNoticeExpiry(): void {
    const notice = this.#model.state.notice;
    if (notice === this.#noticeShown) return;
    this.#noticeShown = notice;
    if (this.#noticeTimer !== undefined) clearTimeout(this.#noticeTimer);
    this.#noticeTimer = undefined;
    if (notice === undefined || this.#stopped) return;
    this.#noticeTimer = setTimeout(() => {
      this.#noticeTimer = undefined;
      if (this.#stopped || this.#model.state.notice !== notice) return;
      this.#model.state.notice = undefined;
      this.#render();
    }, NOTICE_LIFETIME_MS[noticeToneOf(this.#model.state)]);
  }

  #runEffects(effects: readonly ReviewingModelEffect[]): void {
    for (const effect of effects) {
      if (effect.type === 'stop') {
        void this.stop();
      } else if (effect.type === 'show-home') {
        this.#showHomeFromEffect({
          kind: 'home',
          offset: effect.offset,
          ...(effect.preferredReviewIdentity === undefined
            ? {}
            : { preferredReviewIdentity: effect.preferredReviewIdentity }),
          ...(effect.mode === undefined ? {} : { mode: effect.mode }),
        });
      } else if (effect.type === 'show-review') {
        void this.#showReview({
          kind: 'review',
          target: effect.target,
          ...(effect.selection === undefined ? {} : { selection: effect.selection }),
          ...(effect.fromSearch === undefined ? {} : { fromSearch: effect.fromSearch }),
        });
      } else if (effect.type === 'show-review-diff') {
        void this.#showReviewDiff(effect.target, effect.selection);
      } else if (effect.type === 'preview-file' || effect.type === 'preview-file-content') {
        this.#scheduleFilePreview(effect);
      } else if (effect.type === 'load-commit-graph') {
        void this.#loadCommitGraph();
      } else if (effect.type === 'preview-comparison') {
        this.#scheduleComparisonPreview(effect.selection);
      } else if (effect.type === 'search-review') {
        this.#scheduleReviewSearch(effect.reviewIdentity, effect.query, effect.offset);
      } else if (effect.type === 'preview-search-result') {
        this.#scheduleSearchPreview(effect);
      } else if (effect.type === 'inspect-review-message') {
        void this.#inspectReviewMessage(effect);
      } else if (effect.type === 'open-review-message-origin') {
        void this.#openReviewMessageOrigin(effect);
      } else if (effect.type === 'load-message-body') {
        void this.#loadMessageBody(effect).catch((error: unknown) => {
          if (this.#stopped) return;
          this.#model.failMessageBody(effect.reviewMessageIdentity, effect.part);
          const body = effect.part === 'response' ? 'Response' : 'Message';
          this.#model.reportConfigurationWarning(`Couldn’t load the full ${body}. ${semanticError(error)}`);
          this.#render();
        });
      } else if (effect.type === 'load-question-discussion') {
        void this.#loadQuestionDiscussion(effect.reviewIdentity, effect.itemIdentity).catch((error: unknown) => {
          if (this.#stopped) return;
          this.#model.failQuestionDiscussion(effect.itemIdentity);
          this.#model.reportConfigurationWarning(`Couldn’t load the Question’s discussion. ${semanticError(error)}`);
          this.#render();
        });
      } else if (effect.type === 'locate-question') {
        void this.#locateQuestion(effect.reviewIdentity, effect.itemIdentity, effect.questionAbsolute);
      } else if (effect.type === 'save-reviewing-preferences') {
        this.#preferencesSave.schedule(effect.preferences);
      } else if (effect.type === 'copy-text') {
        void this.#copyText(effect);
      } else if (effect.type === 'load-step-changes' || effect.type === 'load-step-change-diff') {
        void this.#loadStepChanges(effect).catch((error: unknown) => {
          if (this.#stopped) return;
          this.#model.reportConfigurationWarning(`Couldn’t load what changed. ${semanticError(error)}`);
          this.#render();
        });
      } else {
        void this.#execute(effect.command);
      }
    }
  }

  /** One stretch's changed files, or one file's before → after rows in it. */
  async #loadStepChanges(
    effect: Extract<ReviewingModelEffect, { readonly type: 'load-step-changes' | 'load-step-change-diff' }>,
  ): Promise<void> {
    if (effect.type === 'load-step-changes') {
      const view = await this.#workspace.read({
        kind: 'review.step-changes',
        reviewIdentity: effect.reviewIdentity,
        from: effect.from,
        to: effect.to,
        offset: 0,
        limit: MANIFEST_WINDOW_SIZE,
      });
      if (this.#stopped) return;
      const next = this.#model.applyStepChanges(view);
      this.#render();
      this.#runEffects(next);
      return;
    }
    const view = await this.#workspace.read({
      kind: 'review.step-changes-diff',
      reviewIdentity: effect.reviewIdentity,
      from: effect.from,
      to: effect.to,
      fileIdentity: effect.fileIdentity,
      offset: effect.offset,
      limit: DIFF_WINDOW_SIZE,
    });
    if (this.#stopped) return;
    this.#model.applyStepChangeDiff(view, effect.rowAbsolute);
    this.#render();
  }

  async #copyText(effect: Extract<ReviewingModelEffect, { readonly type: 'copy-text' }>): Promise<void> {
    const outcome = this.#clipboard === undefined ? 'unavailable' : await this.#clipboard.copy(effect.text);
    if (this.#stopped || outcome === undefined) return;
    if (effect.announce === 'failure-only' && outcome !== 'unavailable') return;
    this.#model.reportClipboardCopy(effect.source, outcome, Buffer.byteLength(effect.text));
    this.#render();
  }

  #showHomeFromEffect(route: ActiveHomeRoute): void {
    const pending = this.#showHome(route);
    const generation = this.#routeGeneration;
    void pending
      .catch((error: unknown) => {
        if (this.#stopped || generation !== this.#routeGeneration) return;
        this.#model.fail(`Couldn’t load Home. ${semanticError(error)}`);
        this.#render();
      })
      .catch(() => undefined);
  }

  async #showHome(route: ActiveHomeRoute): Promise<void> {
    if (this.#stopped) return;
    const generation = ++this.#routeGeneration;
    this.#route = route;
    this.#clearSubscriptions();
    this.#model.setLoading('Loading Home', 'home');
    this.#render();
    const view = await this.#readHome(route.offset);
    if (this.#stopped || generation !== this.#routeGeneration) return;
    if (this.#model.shouldDeferProjection(view.stateVersion)) return;
    this.#model.rememberHomeContext(view);
    if (route.autoOpenActive === true && view.header.currentReviewIdentity !== undefined) {
      await this.#showReview({
        kind: 'review',
        target: {
          reviewIdentity: view.header.currentReviewIdentity,
          manifestOffset: 0,
          diffOffset: 0,
          questionOffset: 0,
        },
      });
      return;
    }
    const effects = this.#model.applyHome(view, route.preferredReviewIdentity, route.mode);
    this.#route = {
      kind: 'home',
      offset: view.reviews.offset,
      ...(this.#model.state.selectedReviewIdentity === undefined
        ? {}
        : { preferredReviewIdentity: this.#model.state.selectedReviewIdentity }),
      mode: this.#model.state.homeMode,
    };
    // The subscription's first delivery reconciles a commit that landed after this read.
    this.#subscribeHome(view.reviews.offset, generation, view.stateVersion);
    this.#render();
    this.#runEffects(effects);
  }

  #showReview(route: ActiveReviewRoute): Promise<void> {
    const identity = JSON.stringify(route);
    const existing = this.#reviewLoads.get(identity);
    if (existing !== undefined) return existing;
    const pending = this.#showReviewOnce(route).finally(() => {
      if (this.#reviewLoads.get(identity) === pending) this.#reviewLoads.delete(identity);
    });
    this.#reviewLoads.set(identity, pending);
    return pending;
  }

  async #showReviewOnce(route: ActiveReviewRoute): Promise<void> {
    if (this.#stopped) return;
    const generation = ++this.#routeGeneration;
    this.#route = route;
    this.#clearSubscriptions();
    // Reloading the open Review keeps what the status line just said (an answer, a commit).
    const sameReview = this.#model.state.review?.manifest.header.reviewIdentity === route.target.reviewIdentity;
    this.#model.setLoading('Loading same-version Review views', undefined, sameReview);
    this.#render();
    try {
      const loaded = await this.#readReviewBundle(route.target);
      if (this.#stopped || generation !== this.#routeGeneration) return;
      if (this.#model.shouldDeferProjection(loaded.bundle.stateVersion)) return;
      const effects = this.#model.applyReview(loaded.bundle, loaded.target, route.selection, route.fromSearch ?? false);
      this.#route = {
        kind: 'review',
        target: loaded.target,
      };
      // Each subscription first delivers the current view, so a commit between
      // this read and the subscriptions (a Harness settling right after an Ask)
      // still arrives as a newer version and refreshes; nothing else re-reads.
      this.#subscribeReview(loaded.target, generation, loaded.bundle);
      this.#render();
      this.#runEffects(effects);
    } catch (error) {
      if (this.#stopped || generation !== this.#routeGeneration) return;
      this.#model.failReviewOpen(`Couldn’t open the Review. ${semanticError(error)}`);
      this.#render();
    }
  }

  /** Short trailing debounce coalesces key-repeat bursts without making one move feel delayed. */
  #scheduleFilePreview(
    effect: Extract<ReviewingModelEffect, { readonly type: 'preview-file' | 'preview-file-content' }>,
  ): void {
    this.#filePreviewEffect = effect;
    if (this.#filePreviewTimer !== undefined) clearTimeout(this.#filePreviewTimer);
    this.#filePreviewTimer = setTimeout(() => {
      this.#filePreviewTimer = undefined;
      const scheduled = this.#filePreviewEffect;
      this.#filePreviewEffect = undefined;
      if (this.#stopped || scheduled === undefined) return;
      // Moving on and back (J then K) can return to the file already shown,
      // which needs no load; a preview for the file left behind is dropped.
      const wanted = scheduled.type === 'preview-file' ? scheduled.selection?.fileIdentity : undefined;
      if (wanted !== undefined && wanted !== this.#model.state.selectedFileIdentity) return;
      if (scheduled.type === 'preview-file') {
        void this.#showReviewDiff(scheduled.target, scheduled.selection, true);
        return;
      }
      void this.#previewUnchangedFileContent(scheduled);
    }, 20);
  }

  async #previewUnchangedFileContent(
    effect: Extract<ReviewingModelEffect, { readonly type: 'preview-file-content' }>,
  ): Promise<void> {
    const generation = this.#routeGeneration;
    const anchorLine = effect.windowLine ?? effect.anchorLine;
    try {
      const view = await this.#workspace.read({
        kind: 'review.live-file-content',
        reviewIdentity: effect.reviewIdentity,
        liveChangesIdentity: effect.liveChangesIdentity,
        pathBytesBase64: effect.pathBytesBase64,
        ...(anchorLine === undefined ? {} : { anchorLine }),
      });
      if (this.#stopped || generation !== this.#routeGeneration) return;
      this.#model.applyUnchangedFileContent(effect.pathBytesBase64, view, effect.anchorLine, effect.windowLine);
      this.#render();
      this.#scheduleNeighborWarmup();
    } catch {
      if (this.#stopped || generation !== this.#routeGeneration) return;
      this.#model.failUnchangedFileContent(effect.pathBytesBase64);
      this.#render();
    }
  }

  #neighborWarmupTimer: NodeJS.Timeout | undefined;
  #animationTimer: NodeJS.Timeout | undefined;
  #noticeTimer: NodeJS.Timeout | undefined;
  #noticeShown: string | undefined;
  #neighborWarmupSelection: string | undefined;

  /** Prefetches around each newly presented selection without delaying its own preview. */
  #scheduleNeighborWarmup(): void {
    const review = this.#model.state.review;
    const selected = this.#model.state.selectedFileIdentity;
    if (
      this.#stopped ||
      this.#route?.kind !== 'review' ||
      this.#model.state.screen !== 'review' ||
      review === undefined ||
      selected === undefined
    ) {
      if (this.#neighborWarmupTimer !== undefined) clearTimeout(this.#neighborWarmupTimer);
      this.#neighborWarmupTimer = undefined;
      this.#neighborWarmupSelection = undefined;
      return;
    }
    const sourceIdentity =
      review.source.kind === 'live' ? review.source.liveChangesIdentity : review.source.reviewSnapshotIdentity;
    const selection = `${review.stateVersion}:${sourceIdentity}:${selected}`;
    if (selection === this.#neighborWarmupSelection) return;
    this.#neighborWarmupSelection = selection;
    if (this.#neighborWarmupTimer !== undefined) clearTimeout(this.#neighborWarmupTimer);
    this.#neighborWarmupTimer = setTimeout(() => {
      this.#neighborWarmupTimer = undefined;
      void this.#warmNeighbors();
    }, 100);
  }

  async #warmNeighbors(): Promise<void> {
    const generation = this.#routeGeneration;
    const review = this.#model.state.review;
    const source = review?.source;
    if (this.#stopped || review === undefined) return;
    await Promise.all(
      this.#model.neighborPreviewables().map(async neighbor => {
        if (this.#stopped || generation !== this.#routeGeneration) return;
        try {
          if (neighbor.kind === 'diff') {
            if (source === undefined) return;
            const diff: ReviewViewBundle['diff'] =
              source.kind === 'live'
                ? await this.#workspace.read({
                    kind: 'review.live-diff',
                    reviewIdentity: review.manifest.header.reviewIdentity,
                    liveChangesIdentity: source.liveChangesIdentity,
                    fileIdentity: neighbor.fileIdentity,
                    offset: 0,
                    limit: DIFF_WINDOW_SIZE,
                  })
                : await this.#workspace.read({
                    kind: 'review.diff',
                    reviewIdentity: review.manifest.header.reviewIdentity,
                    reviewSnapshotIdentity: source.reviewSnapshotIdentity,
                    fileIdentity: neighbor.fileIdentity,
                    offset: 0,
                    limit: DIFF_WINDOW_SIZE,
                  });
            if (this.#stopped || generation !== this.#routeGeneration) return;
            this.#model.warmDiff(diff);
            return;
          }
          const view = await this.#workspace.read({
            kind: 'review.live-file-content',
            reviewIdentity: review.manifest.header.reviewIdentity,
            liveChangesIdentity: neighbor.liveChangesIdentity,
            pathBytesBase64: neighbor.pathBytesBase64,
          });
          if (this.#stopped || generation !== this.#routeGeneration) return;
          this.#model.warmContent(view);
        } catch {
          // Prefetch is best-effort; a later hover loads it normally.
        }
      }),
    );
  }

  #showReviewDiff(requested: ReviewLoadTarget, selection?: ReviewSelectionHint, preview = false): Promise<void> {
    const identity = JSON.stringify({ requested, selection });
    const existing = this.#reviewDiffLoads.get(identity);
    if (existing !== undefined) return existing;
    const pending = this.#showReviewDiffOnce(requested, selection, preview).finally(() => {
      if (this.#reviewDiffLoads.get(identity) === pending) this.#reviewDiffLoads.delete(identity);
    });
    this.#reviewDiffLoads.set(identity, pending);
    return pending;
  }

  async #showReviewDiffOnce(
    requested: ReviewLoadTarget,
    selection?: ReviewSelectionHint,
    /** A Files preview, which only counts while its file is still the selected one. */
    preview = false,
  ): Promise<void> {
    if (this.#stopped) return;
    const route = this.#route;
    const visible = this.#model.state.review;
    if (
      route?.kind !== 'review' ||
      visible === undefined ||
      requested.fileIdentity === undefined ||
      route.target.reviewIdentity !== requested.reviewIdentity ||
      route.target.reviewSnapshotIdentity !== requested.reviewSnapshotIdentity ||
      visible.manifest.header.reviewIdentity !== requested.reviewIdentity
    ) {
      await this.#showReview({
        kind: 'review',
        target: requested,
        ...(selection === undefined ? {} : { selection }),
      });
      return;
    }

    // Publish the selected-file route before the asynchronous Diff read. A
    // same-version subscription reconciliation may supersede this read, and
    // must then reload the newly selected file rather than the previous one.
    this.#route = { kind: 'review', target: requested };
    const generation = this.#routeGeneration;
    const sequence = ++this.#loadSequence;
    try {
      let diff: ReviewViewBundle['diff'] =
        visible.source.kind === 'live'
          ? await this.#workspace.read({
              kind: 'review.live-diff',
              reviewIdentity: requested.reviewIdentity,
              liveChangesIdentity: visible.source.liveChangesIdentity,
              fileIdentity: requested.fileIdentity,
              offset: requested.diffOffset,
              limit: DIFF_WINDOW_SIZE,
              ...(requested.anchorLine === undefined ? {} : { anchorLine: requested.anchorLine }),
            })
          : await this.#workspace.read({
              kind: 'review.diff',
              reviewIdentity: requested.reviewIdentity,
              reviewSnapshotIdentity: visible.source.reviewSnapshotIdentity,
              fileIdentity: requested.fileIdentity,
              offset: requested.diffOffset,
              limit: DIFF_WINDOW_SIZE,
              ...(requested.anchorLine === undefined ? {} : { anchorLine: requested.anchorLine }),
            });
      if (
        this.#stopped ||
        generation !== this.#routeGeneration ||
        sequence !== this.#loadSequence ||
        this.#route?.kind !== 'review' ||
        this.#route.target.reviewIdentity !== requested.reviewIdentity ||
        // The reader moved on while this preview read ran (J then K back to the file already shown).
        (preview &&
          selection?.fileIdentity !== undefined &&
          selection.fileIdentity !== this.#model.state.selectedFileIdentity)
      ) {
        return;
      }
      // Files previews open on the part that changed: when the caller did not
      // pin a row or an exact source line, jump to the file's first changed
      // hunk if it needs another bounded window.
      let jumpRow: number | undefined;
      if (selection?.rowAbsolute === undefined && selection?.anchorLine === undefined && diff.status === 'available') {
        jumpRow = diff.firstChangedRow;
        const within =
          jumpRow !== undefined &&
          jumpRow >= diff.window.offset &&
          jumpRow < diff.window.offset + diff.window.rows.length;
        if (jumpRow !== undefined && !within) {
          const jumpDiff =
            visible.source.kind === 'live'
              ? await this.#workspace.read({
                  kind: 'review.live-diff',
                  reviewIdentity: requested.reviewIdentity,
                  liveChangesIdentity: visible.source.liveChangesIdentity,
                  fileIdentity: requested.fileIdentity,
                  offset: Math.floor(jumpRow / DIFF_WINDOW_SIZE) * DIFF_WINDOW_SIZE,
                  limit: DIFF_WINDOW_SIZE,
                })
              : diff;
          if (this.#stopped || generation !== this.#routeGeneration || sequence !== this.#loadSequence) return;
          if (jumpDiff.status === 'available') diff = jumpDiff;
        }
      }
      if (diff.stateVersion !== visible.stateVersion) {
        await this.#showReview({
          kind: 'review',
          target: requested,
          ...(selection === undefined ? {} : { selection }),
        });
        return;
      }
      const target: ReviewLoadTarget = {
        reviewIdentity: requested.reviewIdentity,
        ...(visible.source.kind === 'snapshot'
          ? {
              reviewSnapshotIdentity: visible.source.reviewSnapshotIdentity,
            }
          : {}),
        versionsOffset: visible.versions.versions.offset,
        manifestOffset: visible.manifest.manifest.offset,
        fileIdentity: requested.fileIdentity,
        diffOffset: diff.status === 'available' ? diff.window.offset : 0,
        questionOffset: visible.questions.list.offset,
      };
      this.#model.applyReviewDiff(
        diff,
        target,
        jumpRow === undefined ? selection : { ...selection, rowAbsolute: jumpRow },
      );
      this.#route = { kind: 'review', target };
      this.#replaceReviewDiffSubscription(target, generation, diff.stateVersion);
      this.#render();
      this.#scheduleNeighborWarmup();
    } catch (error) {
      if (this.#stopped || generation !== this.#routeGeneration || sequence !== this.#loadSequence) {
        return;
      }
      this.#model.failReviewDiffLoad(`Couldn’t load the Diff. ${semanticError(error)}`);
      this.#render();
    }
  }

  async #refreshCurrent(): Promise<void> {
    if (this.#stopped || this.#route === undefined) return;
    const route = this.#route;
    const generation = this.#routeGeneration;
    const sequence = ++this.#loadSequence;
    try {
      if (route.kind === 'home') {
        const view = await this.#readHome(route.offset);
        if (
          this.#stopped ||
          generation !== this.#routeGeneration ||
          sequence !== this.#loadSequence ||
          this.#model.shouldDeferProjection(view.stateVersion)
        ) {
          return;
        }
        const effects = this.#model.applyHome(view, this.#model.state.selectedReviewIdentity);
        this.#render();
        this.#runEffects(effects);
        return;
      }

      // The Review is still opening: its own load reads the latest version, and
      // the subscriptions it installs afterwards report anything newer.
      if (this.#reviewLoads.size > 0) return;
      const loaded = await this.#readReviewBundle(route.target);
      if (
        this.#stopped ||
        generation !== this.#routeGeneration ||
        sequence !== this.#loadSequence ||
        this.#model.shouldDeferProjection(loaded.bundle.stateVersion)
      ) {
        return;
      }
      const effects = this.#model.applyReview(loaded.bundle, loaded.target);
      this.#route = { kind: 'review', target: loaded.target };
      this.#render();
      this.#runEffects(effects);
    } catch (error) {
      if (generation !== this.#routeGeneration || error instanceof LiveChangesTemporarilyUnverified) {
        return;
      }
      this.#model.fail(`Couldn’t refresh. ${semanticError(error)}`);
      this.#render();
    }
  }

  async #readHome(offset: number): Promise<WorkspaceHomeView> {
    return await this.#workspace.read({
      kind: 'workspace.home',
      offset,
      limit: HOME_WINDOW_SIZE,
    });
  }

  /**
   * A file asked for only by its path may sit in any window of the file list.
   * Find the window that holds it, so opening a Message never depends on
   * which 64 files happen to be loaded.
   */
  async #withFileWindow(requested: ReviewLoadTarget): Promise<ReviewLoadTarget> {
    const path = requested.filePathBytesBase64;
    if (path === undefined || requested.fileIdentity !== undefined || requested.fileAbsolute !== undefined) {
      return requested;
    }
    const reviewIdentity = requested.reviewIdentity;
    const snapshot = requested.reviewSnapshotIdentity;
    let located = requested;
    // Changed files: the live list, or the saved one for a fixed comparison or a snapshot.
    let live = snapshot === undefined;
    let liveChangesIdentity: string | undefined;
    for (let offset: number | null = 0, window = 0; offset !== null && window < 1024; window += 1) {
      const view: ReviewLiveManifestView | ReviewManifestView = live
        ? await this.#workspace.read({
            kind: 'review.live-manifest',
            reviewIdentity,
            offset,
            limit: MANIFEST_WINDOW_SIZE,
          })
        : await this.#workspace.read({
            kind: 'review.manifest',
            reviewIdentity,
            ...(snapshot === undefined ? {} : { reviewSnapshotIdentity: snapshot }),
            offset,
            limit: MANIFEST_WINDOW_SIZE,
          });
      if (view.status !== 'available') {
        if (live && view.status === 'fixed') {
          live = false;
          continue;
        }
        break;
      }
      if (view.kind === 'review.live-manifest') liveChangesIdentity = view.liveChangesIdentity;
      if (
        view.manifest.files.some(
          file => file.newSide?.pathBytesBase64 === path || file.oldSide?.pathBytesBase64 === path,
        )
      ) {
        located = { ...located, manifestOffset: view.manifest.offset };
        break;
      }
      const nextOffset: number | null = view.manifest.nextOffset;
      offset = nextOffset;
    }
    // All files (after f): the live list of every file, unchanged ones included.
    if (requested.liveFilesOffset !== undefined && liveChangesIdentity !== undefined) {
      for (let offset: number | null = 0, window = 0; offset !== null && window < 1024; window += 1) {
        const view: ReviewLiveFilesView = await this.#workspace.read({
          kind: 'review.live-files',
          reviewIdentity,
          liveChangesIdentity,
          offset,
          limit: LIVE_FILE_WINDOW_SIZE,
        });
        if (view.status !== 'available') break;
        if (view.files.items.some(file => file.path.bytesBase64 === path)) {
          located = { ...located, liveFilesOffset: view.files.offset };
          break;
        }
        const nextOffset: number | null = view.files.nextOffset;
        offset = nextOffset;
      }
    }
    return located;
  }

  async #readReviewBundle(
    asked: ReviewLoadTarget,
  ): Promise<{ readonly bundle: ReviewViewBundle; readonly target: ReviewLoadTarget }> {
    const requested = await this.#withFileWindow(asked);
    for (let attempt = 0; attempt < MAX_PROJECTION_ATTEMPTS; attempt += 1) {
      const selectedSnapshot = requested.reviewSnapshotIdentity;
      const [snapshotManifest, questions, versions, bases, messages, history, liveManifest, continuation] =
        await Promise.all([
          this.#workspace.read({
            kind: 'review.manifest',
            reviewIdentity: requested.reviewIdentity,
            ...(selectedSnapshot === undefined ? {} : { reviewSnapshotIdentity: selectedSnapshot }),
            offset: requested.manifestOffset,
            limit: MANIFEST_WINDOW_SIZE,
          }),
          this.#workspace.read({
            kind: 'review.questions',
            reviewIdentity: requested.reviewIdentity,
            ...(selectedSnapshot === undefined ? {} : { reviewSnapshotIdentity: selectedSnapshot }),
            offset: requested.questionOffset,
            limit: QUESTION_WINDOW_SIZE,
          }),
          this.#workspace.read({
            kind: 'review.versions',
            reviewIdentity: requested.reviewIdentity,
            offset: requested.versionsOffset ?? 0,
            limit: VERSION_WINDOW_SIZE,
          }),
          this.#workspace.read({
            kind: 'review.bases',
            reviewIdentity: requested.reviewIdentity,
            offset: 0,
            limit: REVIEW_BASIS_WINDOW_SIZE,
          }),
          this.#workspace.read({
            kind: 'review.messages',
            reviewIdentity: requested.reviewIdentity,
            offset: requested.messageOffset ?? 0,
            limit: REVIEW_MESSAGE_WINDOW_SIZE,
          }),
          this.#workspace.read({ kind: 'review.history', reviewIdentity: requested.reviewIdentity }),
          selectedSnapshot === undefined
            ? this.#workspace.read({
                kind: 'review.live-manifest',
                reviewIdentity: requested.reviewIdentity,
                offset: requested.manifestOffset,
                limit: MANIFEST_WINDOW_SIZE,
              })
            : Promise.resolve(undefined),
          selectedSnapshot === undefined
            ? this.#workspace.read({
                kind: 'review.continuation',
                reviewIdentity: requested.reviewIdentity,
              })
            : Promise.resolve(undefined),
        ]);
      if (
        snapshotManifest.status !== 'available' ||
        questions.status !== 'available' ||
        versions.status !== 'available' ||
        bases.status !== 'available' ||
        messages.status !== 'available'
      ) {
        throw new Error('Review was not found');
      }
      if (
        questions.stateVersion !== snapshotManifest.stateVersion ||
        versions.stateVersion !== snapshotManifest.stateVersion ||
        bases.stateVersion !== snapshotManifest.stateVersion ||
        messages.stateVersion !== snapshotManifest.stateVersion ||
        history.stateVersion !== snapshotManifest.stateVersion ||
        (liveManifest !== undefined && liveManifest.stateVersion !== snapshotManifest.stateVersion) ||
        (continuation !== undefined && continuation.stateVersion !== snapshotManifest.stateVersion)
      ) {
        continue;
      }
      if (liveManifest?.status === 'unverified') {
        throw new LiveChangesTemporarilyUnverified();
      }
      const useLive = liveManifest?.status === 'available';
      const manifest = useLive
        ? {
            ...snapshotManifest,
            manifest: {
              ...liveManifest.manifest,
              identity: liveManifest.liveChangesIdentity,
            },
          }
        : snapshotManifest;
      const source: ReviewViewBundle['source'] = useLive
        ? {
            kind: 'live',
            liveChangesIdentity: liveManifest.liveChangesIdentity,
            matchesLatestSnapshot: liveManifest.matchesLatestSnapshot,
          }
        : {
            kind: 'snapshot',
            reviewSnapshotIdentity: snapshotManifest.header.reviewSnapshotIdentity as ReviewSnapshotIdentity,
            isLatest: snapshotManifest.header.version?.isLatest ?? false,
          };
      const liveFiles: ReviewViewBundle['liveFiles'] =
        source.kind === 'live'
          ? await this.#workspace.read({
              kind: 'review.live-files',
              reviewIdentity: requested.reviewIdentity,
              liveChangesIdentity: source.liveChangesIdentity,
              offset: requested.liveFilesOffset ?? 0,
              limit: LIVE_FILE_WINDOW_SIZE,
            })
          : undefined;
      if (liveFiles !== undefined && liveFiles.stateVersion !== snapshotManifest.stateVersion) continue;
      if (liveFiles?.status === 'moved') continue;
      // Match only what was asked for: a deleted file has no new side, and
      // `undefined === undefined` must not make it the requested file.
      const requestedPath = requested.filePathBytesBase64;
      const requestedIdentity = requested.fileIdentity;
      const requestedLiveFile =
        liveFiles?.status === 'available'
          ? requested.fileAbsolute === undefined
            ? liveFiles.files.items.find(
                file =>
                  (requestedIdentity !== undefined && file.fileIdentity === requestedIdentity) ||
                  (requestedPath !== undefined && file.path.bytesBase64 === requestedPath),
              )
            : liveFiles.files.items[requested.fileAbsolute - liveFiles.files.offset]
          : undefined;
      const requestedManifestFile =
        requested.fileAbsolute === undefined
          ? manifest.manifest.files.find(
              file =>
                (requestedIdentity !== undefined && file.fileIdentity === requestedIdentity) ||
                (requestedPath !== undefined &&
                  (file.newSide?.pathBytesBase64 === requestedPath || file.oldSide?.pathBytesBase64 === requestedPath)),
            )
          : requestedLiveFile === undefined
            ? manifest.manifest.files[requested.fileAbsolute - manifest.manifest.offset]
            : undefined;
      const diffFileIdentity =
        requestedLiveFile?.changedFile?.fileIdentity ??
        requestedManifestFile?.fileIdentity ??
        // With no file asked for, open the one the Files pane lists first.
        (requested.fileIdentity === undefined
          ? firstListedFile(manifestFileItems(manifest.manifest.files), [])?.fileIdentity
          : undefined);
      const selectedFileIdentity =
        requestedLiveFile?.fileIdentity ?? requestedManifestFile?.fileIdentity ?? diffFileIdentity;
      const diffRead: Promise<ReviewViewBundle['diff']> =
        diffFileIdentity === undefined
          ? Promise.resolve(undefined)
          : source.kind === 'live'
            ? this.#workspace.read({
                kind: 'review.live-diff',
                reviewIdentity: requested.reviewIdentity,
                liveChangesIdentity: source.liveChangesIdentity,
                fileIdentity: diffFileIdentity,
                offset: requested.diffOffset,
                limit: DIFF_WINDOW_SIZE,
              })
            : this.#workspace.read({
                kind: 'review.diff',
                reviewIdentity: requested.reviewIdentity,
                reviewSnapshotIdentity: source.reviewSnapshotIdentity,
                fileIdentity: diffFileIdentity,
                offset: requested.diffOffset,
                limit: DIFF_WINDOW_SIZE,
              });
      const [diff, harnessInteraction] = await Promise.all([
        diffRead,
        this.#workspace.read({
          kind: 'harness.review-interaction',
          reviewIdentity: requested.reviewIdentity,
          offset: 0,
          limit: HARNESS_INTERACTION_WINDOW_SIZE,
        }),
      ]);
      if (diff?.kind === 'review.live-diff' && diff.status === 'moved') {
        continue;
      }
      if (
        (diff !== undefined && diff.stateVersion !== manifest.stateVersion) ||
        harnessInteraction.stateVersion !== manifest.stateVersion
      ) {
        continue;
      }
      const target: ReviewLoadTarget = {
        reviewIdentity: requested.reviewIdentity,
        ...(selectedSnapshot === undefined ? {} : { reviewSnapshotIdentity: selectedSnapshot }),
        versionsOffset: versions.versions.offset,
        manifestOffset: manifest.manifest.offset,
        ...(selectedFileIdentity === undefined ? {} : { fileIdentity: selectedFileIdentity }),
        diffOffset: diff?.status === 'available' ? diff.window.offset : 0,
        messageOffset: messages.messages.offset,
        questionOffset: questions.list.offset,
      };
      return {
        bundle: {
          stateVersion: manifest.stateVersion,
          source,
          manifest,
          ...(diff === undefined ? {} : { diff }),
          versions,
          bases,
          messages,
          ...(history.status === 'available' ? { history } : {}),
          ...(liveFiles === undefined ? {} : { liveFiles }),
          questions,
          harnessInteraction,
          ...(continuation === undefined ? {} : { continuation }),
        },
        target,
      };
    }
    throw new ProjectionVersionsDidNotConverge('Review projections did not converge on one committed version');
  }

  #subscribeHome(offset: number, generation: number, knownStateVersion: number): void {
    const scope = {
      kind: 'workspace.home',
      offset,
      limit: HOME_WINDOW_SIZE,
    } as const;
    this.#subscribe(scope, generation, knownStateVersion);
  }

  #subscribeReview(target: ReviewLoadTarget, generation: number, shown: ReviewViewBundle): void {
    const version = shown.stateVersion;
    const live = shown.source.kind === 'live' ? shown.source.liveChangesIdentity : undefined;
    const continuation = shown.continuation === undefined ? undefined : liveViewIdentity(shown.continuation);
    this.#subscribe(
      {
        kind: 'review.manifest',
        reviewIdentity: target.reviewIdentity,
        ...(target.reviewSnapshotIdentity === undefined
          ? {}
          : { reviewSnapshotIdentity: target.reviewSnapshotIdentity }),
        offset: target.manifestOffset,
        limit: MANIFEST_WINDOW_SIZE,
      },
      generation,
      version,
    );
    if (target.reviewSnapshotIdentity === undefined) {
      this.#subscribe(
        {
          kind: 'review.live-manifest',
          reviewIdentity: target.reviewIdentity,
          offset: target.manifestOffset,
          limit: MANIFEST_WINDOW_SIZE,
        },
        generation,
        version,
        live,
      );
      this.#subscribe(
        {
          kind: 'review.continuation',
          reviewIdentity: target.reviewIdentity,
        },
        generation,
        version,
        continuation,
      );
      const visible = this.#model.state.review;
      if (visible?.source.kind === 'live') {
        this.#subscribe(
          {
            kind: 'review.live-files',
            reviewIdentity: target.reviewIdentity,
            liveChangesIdentity: visible.source.liveChangesIdentity,
            offset: target.liveFilesOffset ?? 0,
            limit: LIVE_FILE_WINDOW_SIZE,
          },
          generation,
          version,
          shown.liveFiles === undefined ? live : liveViewIdentity(shown.liveFiles),
        );
      }
    } else if (target.fileIdentity !== undefined) {
      this.#subscribe(
        {
          kind: 'review.diff',
          reviewIdentity: target.reviewIdentity,
          reviewSnapshotIdentity: target.reviewSnapshotIdentity,
          fileIdentity: target.fileIdentity,
          offset: target.diffOffset,
          limit: DIFF_WINDOW_SIZE,
        },
        generation,
        version,
      );
    }
    this.#subscribe(
      {
        kind: 'review.bases',
        reviewIdentity: target.reviewIdentity,
        offset: 0,
        limit: REVIEW_BASIS_WINDOW_SIZE,
      },
      generation,
      version,
    );
    this.#subscribe(
      {
        kind: 'review.messages',
        reviewIdentity: target.reviewIdentity,
        offset: target.messageOffset ?? 0,
        limit: REVIEW_MESSAGE_WINDOW_SIZE,
      },
      generation,
      version,
    );
    this.#subscribe(
      {
        kind: 'review.versions',
        reviewIdentity: target.reviewIdentity,
        offset: target.versionsOffset ?? 0,
        limit: VERSION_WINDOW_SIZE,
      },
      generation,
      version,
    );
    this.#subscribe(
      {
        kind: 'review.questions',
        reviewIdentity: target.reviewIdentity,
        ...(target.reviewSnapshotIdentity === undefined
          ? {}
          : { reviewSnapshotIdentity: target.reviewSnapshotIdentity }),
        offset: target.questionOffset,
        limit: QUESTION_WINDOW_SIZE,
      },
      generation,
      version,
    );
    this.#subscribe(
      {
        kind: 'harness.review-interaction',
        reviewIdentity: target.reviewIdentity,
        offset: 0,
        limit: HARNESS_INTERACTION_WINDOW_SIZE,
      },
      generation,
      version,
    );
  }

  /**
   * Every Workspace subscription first delivers the current view. Starting it
   * with the version (and Live Changes identity) already on screen makes that
   * first delivery a no-op, while a commit that landed between our read and
   * the subscription still arrives as newer and refreshes.
   */
  #subscribe(
    scope: ReviewingSubscriptionScope,
    generation: number,
    knownStateVersion = -1,
    knownLiveIdentity?: string,
  ): void {
    // Whichever Diff is shown holds the one Diff slot.
    const slot = scope.kind === 'review.diff' ? 'diff' : undefined;
    this.#watch.watch(scope, generation, knownStateVersion, knownLiveIdentity, slot);
  }

  #scheduleRefresh(): void {
    this.#watch.requestRefresh();
  }

  #replaceReviewDiffSubscription(target: ReviewLoadTarget, generation: number, knownStateVersion: number): void {
    this.#watch.release('diff');
    if (target.fileIdentity === undefined || target.reviewSnapshotIdentity === undefined) return;
    this.#watch.watch(
      {
        kind: 'review.diff',
        reviewIdentity: target.reviewIdentity,
        reviewSnapshotIdentity: target.reviewSnapshotIdentity,
        fileIdentity: target.fileIdentity,
        offset: target.diffOffset,
        limit: DIFF_WINDOW_SIZE,
      },
      generation,
      knownStateVersion,
      undefined,
      'diff',
    );
  }

  #clearSubscriptions(): void {
    this.#watch.clear();
  }

  async #execute(command: WorkspaceCommand): Promise<void> {
    const outcome = await executeCommand(this.#workspace, command, () => this.#stopped);
    if (outcome.status === 'stopped') return;
    if (outcome.status === 'lost') {
      this.#model.markCommandResultUnavailable(outcome.sentence);
      this.#render();
      return;
    }
    const effects = this.#model.applyCommandResult(outcome.result);
    this.#render();
    this.#runEffects(effects);
    if (!effects.some(effect => effect.type === 'show-home' || effect.type === 'show-review')) {
      this.#scheduleRefresh();
    }
  }

  async #loadCommitGraph(): Promise<void> {
    try {
      const graph = await this.#workspace.read({ kind: 'review.commit-graph' });
      if (this.#stopped) return;
      const effects = this.#model.applyCommitGraph(graph);
      this.#render();
      this.#runEffects(effects);
    } catch (error) {
      if (this.#stopped) return;
      this.#model.fail(`Couldn’t load commit history. ${semanticError(error)}`);
      this.#render();
    }
  }

  #scheduleComparisonPreview(
    selection: Extract<ReviewingModelEffect, { type: 'preview-comparison' }>['selection'],
  ): void {
    const sequence = ++this.#comparisonPreviewSequence;
    if (this.#comparisonPreviewTimer !== undefined) {
      clearTimeout(this.#comparisonPreviewTimer);
    }
    this.#comparisonPreviewTimer = setTimeout(() => {
      this.#comparisonPreviewTimer = undefined;
      void this.#previewComparison(selection, sequence);
    }, 40);
  }

  async #previewComparison(
    selection: Extract<ReviewingModelEffect, { type: 'preview-comparison' }>['selection'],
    sequence: number,
  ): Promise<void> {
    try {
      const preview = await this.#workspace.read({
        kind: 'review.comparison-preview',
        selection,
      });
      if (this.#stopped || sequence !== this.#comparisonPreviewSequence) return;
      this.#model.applyComparisonPreview(preview, selection);
      this.#render();
    } catch (error) {
      if (this.#stopped || sequence !== this.#comparisonPreviewSequence) return;
      this.#model.fail(`Couldn’t load that comparison. ${semanticError(error)}`);
      this.#render();
    }
  }

  #scheduleReviewSearch(reviewIdentity: ReviewIdentity, query: string, offset: number): void {
    const sequence = ++this.#reviewSearchSequence;
    if (this.#reviewSearchTimer !== undefined) {
      clearTimeout(this.#reviewSearchTimer);
    }
    this.#reviewSearchTimer = setTimeout(() => {
      this.#reviewSearchTimer = undefined;
      void this.#searchReview(reviewIdentity, query, offset, sequence);
    }, 80);
  }

  async #searchReview(reviewIdentity: ReviewIdentity, query: string, offset: number, sequence: number): Promise<void> {
    try {
      const view = await this.#workspace.read({
        kind: 'review.search',
        reviewIdentity,
        query,
        offset,
        limit: SEARCH_RESULT_WINDOW_SIZE,
      });
      if (this.#stopped || sequence !== this.#reviewSearchSequence) return;
      const effects = this.#model.applyReviewSearch(view, query);
      this.#render();
      this.#runEffects(effects);
    } catch (error) {
      if (this.#stopped || sequence !== this.#reviewSearchSequence) return;
      this.#model.failReviewSearch(`Search failed. ${semanticError(error)}`);
      this.#render();
    }
  }

  #scheduleSearchPreview(effect: Extract<ReviewingModelEffect, { type: 'preview-search-result' }>): void {
    const sequence = ++this.#searchPreviewSequence;
    if (this.#searchPreviewTimer !== undefined) {
      clearTimeout(this.#searchPreviewTimer);
    }
    this.#searchPreviewTimer = setTimeout(() => {
      this.#searchPreviewTimer = undefined;
      void this.#previewSearchResult(effect, sequence);
    }, 40);
  }

  async #previewSearchResult(
    effect: Extract<ReviewingModelEffect, { type: 'preview-search-result' }>,
    sequence: number,
  ): Promise<void> {
    try {
      const view = await this.#workspace.read({
        kind: 'review.search-preview',
        reviewIdentity: effect.reviewIdentity,
        fileIdentity: effect.fileIdentity,
        offset: Math.floor(effect.rowAbsolute / DIFF_WINDOW_SIZE) * DIFF_WINDOW_SIZE,
        limit: DIFF_WINDOW_SIZE,
      });
      if (this.#stopped || sequence !== this.#searchPreviewSequence) return;
      this.#model.applySearchPreview(view, effect.resultIdentity);
      this.#render();
    } catch (error) {
      if (this.#stopped || sequence !== this.#searchPreviewSequence) return;
      this.#model.failSearchPreview(`Couldn’t load the preview. ${semanticError(error)}`, effect.resultIdentity);
      this.#render();
    }
  }

  async #inspectReviewMessage(
    effect: Extract<ReviewingModelEffect, { readonly type: 'inspect-review-message' }>,
  ): Promise<void> {
    const generation = this.#routeGeneration;
    let template: Awaited<ReturnType<UserConfiguration['readMessageTemplate']>>;
    try {
      template = await this.#userConfiguration.readMessageTemplate();
    } catch {
      template = { status: 'unreadable' };
    }
    if (this.#stopped || generation !== this.#routeGeneration) return;
    if (template.status === 'unreadable') {
      this.#model.failReviewMessageInspection(
        effect.requestIdentity,
        'Message not sent: the message template could not be read. Fix or remove the template file beside the configuration.',
      );
      this.#render();
      return;
    }
    try {
      const view = await this.#workspace.read({
        kind: 'harness.review-message.inspect-default',
        reviewIdentity: effect.reviewIdentity,
        originReviewBasisIdentity: effect.originReviewBasisIdentity,
        location: effect.location,
        body: effect.body,
        purpose: effect.purpose,
        ...(template.status === 'present' ? { outgoingTemplate: template.template } : {}),
      });
      if (this.#stopped || generation !== this.#routeGeneration) return;
      const effects = this.#model.applyReviewMessageInspection(effect.requestIdentity, effect.purpose, view);
      this.#render();
      this.#runEffects(effects);
    } catch (error) {
      if (this.#stopped || generation !== this.#routeGeneration) return;
      this.#model.failReviewMessageInspection(
        effect.requestIdentity,
        `Couldn’t check the Message before sending. ${semanticError(error)}`,
      );
      this.#render();
    }
  }

  async #openReviewMessageOrigin(
    effect: Extract<ReviewingModelEffect, { readonly type: 'open-review-message-origin' }>,
  ): Promise<void> {
    const generation = this.#routeGeneration;
    try {
      const view = await this.#workspace.read({
        kind: 'review.message-origin',
        reviewIdentity: effect.reviewIdentity,
        reviewMessageIdentity: effect.reviewMessageIdentity,
      });
      if (this.#stopped || generation !== this.#routeGeneration) return;
      const effects = this.#model.applyReviewMessageOrigin(view, effect.messageAbsolute);
      this.#render();
      this.#runEffects(effects);
    } catch (error) {
      if (this.#stopped || generation !== this.#routeGeneration) return;
      this.#model.reportConfigurationWarning(`Couldn’t find where this Message came from. ${semanticError(error)}`);
      this.#render();
    }
  }

  async #loadMessageBody(effect: Extract<ReviewingModelEffect, { readonly type: 'load-message-body' }>): Promise<void> {
    for (let attempt = 0; attempt < MAX_PROJECTION_ATTEMPTS; attempt += 1) {
      const chunks: Buffer[] = [];
      let offset = 0;
      let stateVersion: number | undefined;
      let restart = false;
      while (offset <= MESSAGE_BODY_LIMIT_BYTES) {
        const view = await this.#workspace.read({
          kind: 'review.message-body',
          reviewIdentity: effect.reviewIdentity,
          reviewMessageIdentity: effect.reviewMessageIdentity,
          part: effect.part,
          offset,
          length: MESSAGE_BODY_WINDOW_BYTES,
        });
        if (view.status !== 'available') {
          this.#model.failMessageBody(effect.reviewMessageIdentity, effect.part);
          this.#render();
          return;
        }
        if (stateVersion === undefined) stateVersion = view.stateVersion;
        if (view.stateVersion !== stateVersion) {
          restart = true;
          break;
        }
        const bytes = decodeBytesBase64(view.body.bytesBase64);
        chunks.push(bytes);
        offset += bytes.byteLength;
        if (!view.body.truncated || offset >= view.body.totalByteLength) {
          this.#model.applyMessageBody(
            effect.reviewMessageIdentity,
            effect.part,
            Buffer.concat(chunks).toString('utf8'),
          );
          this.#render();
          return;
        }
        if (bytes.byteLength === 0) break;
      }
      if (!restart) break;
    }
    this.#model.failMessageBody(effect.reviewMessageIdentity, effect.part);
    this.#render();
  }

  async #locateQuestion(
    reviewIdentity: ReviewIdentity,
    itemIdentity: Extract<ReviewingModelEffect, { readonly type: 'locate-question' }>['itemIdentity'],
    questionAbsolute: number,
  ): Promise<void> {
    const generation = this.#routeGeneration;
    try {
      const view = await this.#workspace.read({
        kind: 'review.question-location',
        reviewIdentity,
        itemIdentity,
      });
      if (this.#stopped || generation !== this.#routeGeneration) return;
      const effects = this.#model.applyQuestionLocation(view, questionAbsolute);
      this.#render();
      this.#runEffects(effects);
    } catch (error) {
      if (this.#stopped || generation !== this.#routeGeneration) return;
      this.#model.reportConfigurationWarning(`Couldn’t find where this Question was asked. ${semanticError(error)}`);
      this.#render();
    }
  }

  async #loadQuestionDiscussion(
    reviewIdentity: ReviewIdentity,
    itemIdentity: Extract<ReviewingModelEffect, { readonly type: 'load-question-discussion' }>['itemIdentity'],
  ): Promise<void> {
    for (let attempt = 0; attempt < MAX_PROJECTION_ATTEMPTS; attempt += 1) {
      const chunks: Buffer[] = [];
      let offset = 0;
      let stateVersion: number | undefined;
      let restart = false;
      while (offset <= 64 * 1024) {
        const view: ReviewQuestionBodyView = await this.#workspace.read({
          kind: 'review.question-body',
          reviewIdentity,
          itemIdentity,
          offset,
          length: QUESTION_BODY_WINDOW_BYTES,
        });
        if (view.status !== 'available' || view.window === undefined) {
          this.#model.failQuestionDiscussion(itemIdentity);
          this.#render();
          return;
        }
        if (stateVersion === undefined) stateVersion = view.stateVersion;
        if (view.stateVersion !== stateVersion) {
          restart = true;
          break;
        }
        const bytes = decodeBytesBase64(view.window.bytesBase64);
        chunks.push(bytes);
        offset += bytes.byteLength;
        if (view.window.complete) {
          this.#model.applyQuestionDiscussion(itemIdentity, Buffer.concat(chunks).toString('utf8'));
          this.#render();
          return;
        }
        if (bytes.byteLength === 0) break;
      }
      if (!restart) break;
    }
    this.#model.failQuestionDiscussion(itemIdentity);
    this.#render();
  }
}

/** Creates the deep v1 Reviewing Application Module over the Workspace Interface. */
export function createReviewingApplication(options: ReviewingApplicationOptions): ReviewingApplication {
  return new OpenReviewingApplication(options);
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
  return new OpenReviewingApplication(
    {
      ...applicationOptions,
      // Scenario tests read exact geometry right after input; motion is opt-in there.
      presentation: { reducedMotion: true, ...applicationOptions.presentation },
    },
    renderer,
    createHighlightClient,
    createClipboardService ?? terminalFallbackClipboard,
  );
}
