import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CONFIGURATION_VERSION = 1;
const LEFT_PANE_MINIMUM = 16;
const RIGHT_PANE_MINIMUM = 20;
const PANE_MAXIMUM = 4_096;

export type ReviewArrangement = 'workspace' | 'code-spotlight' | 'review-notebook';

export type ReviewingColorRole =
  | 'background'
  | 'surface'
  | 'raised'
  | 'border'
  | 'text'
  | 'muted'
  | 'accent'
  | 'accentSoft'
  | 'success'
  | 'successSoft'
  | 'danger'
  | 'dangerSoft'
  | 'warning'
  | 'code';

export type ReviewingThemeColors = Readonly<Partial<Record<ReviewingColorRole, string>>>;

export type ReviewingTokenRole =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'type'
  | 'variable'
  | 'property'
  | 'operator'
  | 'punctuation'
  | 'constant'
  | 'tag'
  | 'markup';
export const REVIEWING_TOKEN_ROLES: readonly ReviewingTokenRole[] = Object.freeze([
  'keyword',
  'string',
  'number',
  'comment',
  'function',
  'type',
  'variable',
  'property',
  'operator',
  'punctuation',
  'constant',
  'tag',
  'markup',
]);
export type ReviewingTokenPalette = Readonly<Partial<Record<ReviewingTokenRole, string>>>;

/** An open semantic palette: a preset is only a base for arbitrary role overrides. */
export interface ReviewingThemeDefinition {
  readonly name?: string;
  readonly inherits?: string;
  readonly colors: ReviewingThemeColors;
  readonly tokens?: ReviewingTokenPalette;
}

export type ReviewingBackground = 'theme' | 'terminal';

export interface ReviewingHeaderPreferences {
  readonly visible: boolean;
}

export interface ReviewingPreferences {
  readonly arrangement: ReviewArrangement;
  readonly filesVisible: boolean;
  /** Only the Diff, at every width: Files and History stay a key away. */
  readonly codeOnly: boolean;
  readonly filesPaneWidth: number;
  readonly questionsPaneWidth: number;
  readonly theme: ReviewingThemeDefinition;
  readonly background: ReviewingBackground;
  readonly header: ReviewingHeaderPreferences;
  /** 'nerd' renders Nerd Font glyphs; requires a patched terminal font. */
  readonly icons: 'text' | 'nerd';
  /** 'smooth' eases pane scrolling; 'off' jumps, for slow links or reduced motion. */
  readonly motion: 'smooth' | 'off';
}

export interface UserConfigurationLoadResult {
  readonly preferences: ReviewingPreferences;
  /** Named custom themes available beside the built-in presets. */
  readonly themes: readonly ReviewingThemeDefinition[];
  readonly warning?: string;
}

export type UserConfigurationSaveResult =
  | { readonly status: 'saved' }
  | { readonly status: 'rejected'; readonly reason: string };

/** The optional user-formatted outgoing Message structure beside the config file. */
export type MessageTemplateRead =
  | { readonly status: 'missing' }
  | { readonly status: 'present'; readonly template: string }
  | { readonly status: 'unreadable' };

/** Separate from workflow State: portable presentation preferences only. */
export interface UserConfiguration {
  load(): Promise<UserConfigurationLoadResult>;
  saveReviewingPreferences(preferences: ReviewingPreferences): Promise<UserConfigurationSaveResult>;
  /** Absent template means the built-in structure; never a silent substitute. */
  readMessageTemplate(): Promise<MessageTemplateRead>;
}

export const DEFAULT_REVIEWING_PREFERENCES: ReviewingPreferences = Object.freeze({
  arrangement: 'workspace',
  filesVisible: true,
  codeOnly: false,
  filesPaneWidth: 34,
  questionsPaneWidth: 40,
  theme: Object.freeze({
    inherits: 'match-terminal',
    colors: Object.freeze({}),
  }),
  background: 'theme',
  icons: 'text',
  motion: 'smooth',
  header: Object.freeze({
    visible: true,
  }),
});

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validWidth(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= PANE_MAXIMUM;
}

const COLOR_ROLES: readonly ReviewingColorRole[] = Object.freeze([
  'background',
  'surface',
  'raised',
  'border',
  'text',
  'muted',
  'accent',
  'accentSoft',
  'success',
  'successSoft',
  'danger',
  'dangerSoft',
  'warning',
  'code',
]);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

function validArrangement(value: unknown): value is ReviewArrangement {
  return value === 'workspace' || value === 'code-spotlight' || value === 'review-notebook';
}

function validThemeText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function tokenPalette(value: unknown, path: string, invalid: string[]): ReviewingTokenPalette | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    invalid.push(path);
    return undefined;
  }
  const tokens: Partial<Record<ReviewingTokenRole, string>> = {};
  for (const [role, color] of Object.entries(value)) {
    if (
      REVIEWING_TOKEN_ROLES.includes(role as ReviewingTokenRole) &&
      typeof color === 'string' &&
      COLOR_PATTERN.test(color)
    ) {
      tokens[role as ReviewingTokenRole] = color;
    } else invalid.push(`${path}.${role}`);
  }
  return Object.freeze(tokens);
}

function customThemesFromValue(value: unknown, invalid: string[]): readonly ReviewingThemeDefinition[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    invalid.push('reviewing.themes');
    return Object.freeze([]);
  }
  const names = new Set<string>();
  const themes: ReviewingThemeDefinition[] = [];
  for (const [index, candidate] of value.entries()) {
    const path = `reviewing.themes[${index}]`;
    if (!isRecord(candidate)) {
      invalid.push(path);
      continue;
    }
    if (!validThemeText(candidate.name)) {
      invalid.push(`${path}.name`);
      continue;
    }
    const name = candidate.name.trim();
    if (names.has(name)) {
      invalid.push(`${path}.name`);
      continue;
    }
    names.add(name);
    const inherits = validThemeText(candidate.inherits) ? candidate.inherits : undefined;
    if (candidate.inherits !== undefined && inherits === undefined) {
      invalid.push(`${path}.inherits`);
    }
    const sourceColors = isRecord(candidate.colors) ? candidate.colors : undefined;
    if (candidate.colors !== undefined && sourceColors === undefined) {
      invalid.push(`${path}.colors`);
    }
    const colors: Partial<Record<ReviewingColorRole, string>> = {};
    for (const role of COLOR_ROLES) {
      const color = sourceColors?.[role];
      if (color === undefined) continue;
      if (typeof color === 'string' && COLOR_PATTERN.test(color)) {
        colors[role] = color;
      } else {
        invalid.push(`${path}.colors.${role}`);
      }
    }
    const tokens = tokenPalette(candidate.tokens, `${path}.tokens`, invalid);
    themes.push(
      Object.freeze({
        name,
        ...(tokens === undefined ? {} : { tokens }),
        ...(inherits === undefined ? {} : { inherits }),
        colors: Object.freeze(colors),
      }),
    );
  }
  return Object.freeze(themes);
}

function preferencesFromDocument(document: JsonRecord): {
  readonly preferences: ReviewingPreferences;
  readonly themes: readonly ReviewingThemeDefinition[];
  readonly warning?: string;
} {
  const reviewing = isRecord(document.reviewing) ? document.reviewing : undefined;
  const layout = isRecord(reviewing?.layout) ? reviewing.layout : undefined;
  const sourceTheme = isRecord(reviewing?.theme) ? reviewing.theme : undefined;
  const sourceHeader = isRecord(reviewing?.header) ? reviewing.header : undefined;
  const legacyTransparency = isRecord(reviewing?.transparency) ? reviewing.transparency : undefined;
  const invalid: string[] = [];
  const themes = customThemesFromValue(reviewing?.themes, invalid);

  const arrangement = validArrangement(reviewing?.arrangement)
    ? reviewing.arrangement
    : DEFAULT_REVIEWING_PREFERENCES.arrangement;
  if (reviewing?.arrangement !== undefined && !validArrangement(reviewing.arrangement)) {
    invalid.push('reviewing.arrangement');
  }

  if (reviewing?.header !== undefined && sourceHeader === undefined) {
    invalid.push('reviewing.header');
  }
  const headerVisible =
    typeof sourceHeader?.visible === 'boolean' ? sourceHeader.visible : DEFAULT_REVIEWING_PREFERENCES.header.visible;
  if (sourceHeader?.visible !== undefined && typeof sourceHeader.visible !== 'boolean') {
    invalid.push('reviewing.header.visible');
  }

  const background =
    reviewing?.background === 'theme' || reviewing?.background === 'terminal'
      ? reviewing.background
      : legacyTransparency?.enabled === true
        ? 'terminal'
        : DEFAULT_REVIEWING_PREFERENCES.background;
  if (reviewing?.background !== undefined && reviewing.background !== 'theme' && reviewing.background !== 'terminal')
    invalid.push('reviewing.background');

  const filesVisible =
    typeof layout?.filesVisible === 'boolean' ? layout.filesVisible : DEFAULT_REVIEWING_PREFERENCES.filesVisible;
  if (layout?.filesVisible !== undefined && typeof layout.filesVisible !== 'boolean') {
    invalid.push('reviewing.layout.filesVisible');
  }
  const codeOnly = typeof layout?.codeOnly === 'boolean' ? layout.codeOnly : DEFAULT_REVIEWING_PREFERENCES.codeOnly;
  if (layout?.codeOnly !== undefined && typeof layout.codeOnly !== 'boolean') {
    invalid.push('reviewing.layout.codeOnly');
  }

  const icons = reviewing?.icons === 'text' || reviewing?.icons === 'nerd' ? reviewing.icons : 'text';
  if (reviewing?.icons !== undefined && reviewing.icons !== 'text' && reviewing.icons !== 'nerd') {
    invalid.push('reviewing.icons');
  }
  const motion =
    reviewing?.motion === 'smooth' || reviewing?.motion === 'off'
      ? reviewing.motion
      : DEFAULT_REVIEWING_PREFERENCES.motion;
  if (reviewing?.motion !== undefined && reviewing.motion !== 'smooth' && reviewing.motion !== 'off') {
    invalid.push('reviewing.motion');
  }

  const filesPaneWidth = validWidth(layout?.filesPaneWidth, LEFT_PANE_MINIMUM)
    ? layout.filesPaneWidth
    : DEFAULT_REVIEWING_PREFERENCES.filesPaneWidth;
  if (layout?.filesPaneWidth !== undefined && !validWidth(layout.filesPaneWidth, LEFT_PANE_MINIMUM))
    invalid.push('reviewing.layout.filesPaneWidth');

  const questionsPaneWidth = validWidth(layout?.questionsPaneWidth, RIGHT_PANE_MINIMUM)
    ? layout.questionsPaneWidth
    : DEFAULT_REVIEWING_PREFERENCES.questionsPaneWidth;
  if (layout?.questionsPaneWidth !== undefined && !validWidth(layout.questionsPaneWidth, RIGHT_PANE_MINIMUM))
    invalid.push('reviewing.layout.questionsPaneWidth');

  const name = validThemeText(sourceTheme?.name) ? sourceTheme.name : undefined;
  if (sourceTheme?.name !== undefined && name === undefined) invalid.push('reviewing.theme.name');
  const inherits = validThemeText(sourceTheme?.inherits)
    ? sourceTheme.inherits
    : sourceTheme === undefined
      ? DEFAULT_REVIEWING_PREFERENCES.theme.inherits
      : undefined;
  if (sourceTheme?.inherits !== undefined && inherits === undefined) {
    invalid.push('reviewing.theme.inherits');
  }
  const sourceColors = isRecord(sourceTheme?.colors) ? sourceTheme.colors : undefined;
  if (sourceTheme?.colors !== undefined && sourceColors === undefined) {
    invalid.push('reviewing.theme.colors');
  }
  const colors: Partial<Record<ReviewingColorRole, string>> = {};
  for (const role of COLOR_ROLES) {
    const value = sourceColors?.[role];
    if (value === undefined) continue;
    if (typeof value === 'string' && COLOR_PATTERN.test(value)) {
      colors[role] = value;
    } else {
      invalid.push(`reviewing.theme.colors.${role}`);
    }
  }

  const tokens = tokenPalette(sourceTheme?.tokens, 'reviewing.theme.tokens', invalid);
  return {
    preferences: Object.freeze({
      arrangement,
      filesVisible,
      codeOnly,
      filesPaneWidth,
      questionsPaneWidth,
      theme: Object.freeze({
        ...(name === undefined ? {} : { name }),
        ...(inherits === undefined ? {} : { inherits }),
        colors: Object.freeze(colors),
        ...(tokens === undefined ? {} : { tokens }),
      }),
      background,
      icons,
      motion,
      header: Object.freeze({
        visible: headerVisible,
      }),
    }),
    themes,
    ...(invalid.length === 0 ? {} : { warning: `Ignored invalid User Configuration: ${invalid.join(', ')}.` }),
  };
}

function parseSupportedDocument(text: string):
  | { readonly status: 'supported'; readonly document: JsonRecord }
  | {
      readonly status: 'rejected';
      readonly reason: string;
    } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: 'rejected', reason: 'the file is not valid JSON' };
  }
  if (!isRecord(parsed)) {
    return { status: 'rejected', reason: 'the root must be a JSON object' };
  }
  if (parsed.version !== CONFIGURATION_VERSION) {
    return {
      status: 'rejected',
      reason: `version ${String(parsed.version)} is unsupported`,
    };
  }
  return { status: 'supported', document: parsed };
}

export function defaultUserConfigurationPath(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = os.homedir(),
): string {
  const xdg = environment.XDG_CONFIG_HOME;
  const base = xdg !== undefined && path.isAbsolute(xdg) ? xdg : path.join(homeDirectory, '.config');
  return path.join(base, 'buildframe', 'config.json');
}

/** The user-level outgoing Message template beside the configuration file. */
export function messageTemplatePath(configurationPath: string = defaultUserConfigurationPath()): string {
  return path.join(path.dirname(configurationPath), 'message-template.md');
}

async function readIfPresent(
  configurationPath: string,
): Promise<{ readonly status: 'missing' } | { readonly status: 'present'; readonly text: string }> {
  try {
    return {
      status: 'present',
      text: await fs.readFile(configurationPath, 'utf8'),
    };
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return { status: 'missing' };
    }
    throw error;
  }
}

class FileUserConfiguration implements UserConfiguration {
  readonly #path: string;
  #saveAllowed = true;

  constructor(configurationPath: string) {
    this.#path = configurationPath;
  }

  async readMessageTemplate(): Promise<MessageTemplateRead> {
    let source: Awaited<ReturnType<typeof readIfPresent>>;
    try {
      source = await readIfPresent(messageTemplatePath(this.#path));
    } catch {
      return { status: 'unreadable' };
    }
    return source.status === 'missing' ? { status: 'missing' } : { status: 'present', template: source.text };
  }

  async load(): Promise<UserConfigurationLoadResult> {
    let source: Awaited<ReturnType<typeof readIfPresent>>;
    try {
      source = await readIfPresent(this.#path);
    } catch (error) {
      this.#saveAllowed = false;
      return {
        preferences: DEFAULT_REVIEWING_PREFERENCES,
        themes: Object.freeze([]),
        warning: `User Configuration could not be read at ${this.#path}: ${error instanceof Error ? error.message : 'read failed'}.`,
      };
    }
    if (source.status === 'missing') {
      this.#saveAllowed = true;
      return { preferences: DEFAULT_REVIEWING_PREFERENCES, themes: Object.freeze([]) };
    }
    const parsed = parseSupportedDocument(source.text);
    if (parsed.status === 'rejected') {
      this.#saveAllowed = false;
      return {
        preferences: DEFAULT_REVIEWING_PREFERENCES,
        themes: Object.freeze([]),
        warning: `User Configuration was left unchanged at ${this.#path}: ${parsed.reason}.`,
      };
    }
    this.#saveAllowed = true;
    const loaded = preferencesFromDocument(parsed.document);
    return {
      preferences: loaded.preferences,
      themes: loaded.themes,
      ...(loaded.warning === undefined ? {} : { warning: `${loaded.warning} File: ${this.#path}` }),
    };
  }

  async saveReviewingPreferences(preferences: ReviewingPreferences): Promise<UserConfigurationSaveResult> {
    const colorsValid = Object.entries(preferences.theme.colors).every(
      ([role, value]) =>
        COLOR_ROLES.includes(role as ReviewingColorRole) && typeof value === 'string' && COLOR_PATTERN.test(value),
    );
    const invalidTokens: string[] = [];
    tokenPalette(preferences.theme.tokens, 'tokens', invalidTokens);
    if (
      invalidTokens.length > 0 ||
      !validArrangement(preferences.arrangement) ||
      typeof preferences.filesVisible !== 'boolean' ||
      typeof preferences.codeOnly !== 'boolean' ||
      !validWidth(preferences.filesPaneWidth, LEFT_PANE_MINIMUM) ||
      !validWidth(preferences.questionsPaneWidth, RIGHT_PANE_MINIMUM) ||
      (preferences.theme.name !== undefined && !validThemeText(preferences.theme.name)) ||
      (preferences.theme.inherits !== undefined && !validThemeText(preferences.theme.inherits)) ||
      (preferences.background !== 'theme' && preferences.background !== 'terminal') ||
      (preferences.icons !== 'text' && preferences.icons !== 'nerd') ||
      (preferences.motion !== 'smooth' && preferences.motion !== 'off') ||
      typeof preferences.header.visible !== 'boolean' ||
      !colorsValid
    ) {
      return {
        status: 'rejected',
        reason: 'the Reviewing presentation preferences are invalid',
      };
    }
    if (!this.#saveAllowed) {
      return {
        status: 'rejected',
        reason: `the existing file is unreadable or unsupported (${this.#path})`,
      };
    }

    let current: JsonRecord = { version: CONFIGURATION_VERSION };
    try {
      const source = await readIfPresent(this.#path);
      if (source.status === 'present') {
        const parsed = parseSupportedDocument(source.text);
        if (parsed.status === 'rejected') {
          this.#saveAllowed = false;
          return {
            status: 'rejected',
            reason: `the existing file changed and ${parsed.reason} (${this.#path})`,
          };
        }
        current = parsed.document;
      }

      const reviewing = isRecord(current.reviewing) ? current.reviewing : {};
      const layout = isRecord(reviewing.layout) ? reviewing.layout : {};
      const existingTheme = isRecord(reviewing.theme) ? reviewing.theme : {};
      // Header styles were retired for one compact row; an old `style` key is dropped on save.
      const { style: _retiredStyle, ...existingHeader } = isRecord(reviewing.header) ? reviewing.header : {};
      const existingColors = isRecord(existingTheme.colors) ? existingTheme.colors : {};
      const unfamiliarColors = Object.fromEntries(
        Object.entries(existingColors).filter(([role]) => !COLOR_ROLES.includes(role as ReviewingColorRole)),
      );
      const next: JsonRecord = {
        ...current,
        version: CONFIGURATION_VERSION,
        reviewing: {
          ...reviewing,
          arrangement: preferences.arrangement,
          theme: {
            ...existingTheme,
            name: preferences.theme.name,
            inherits: preferences.theme.inherits,
            tokens: preferences.theme.tokens,
            colors: {
              ...unfamiliarColors,
              ...preferences.theme.colors,
            },
          },
          background: preferences.background,
          icons: preferences.icons,
          motion: preferences.motion,
          header: {
            ...existingHeader,
            visible: preferences.header.visible,
          },
          transparency: undefined,
          layout: {
            ...layout,
            filesVisible: preferences.filesVisible,
            codeOnly: preferences.codeOnly,
            filesPaneWidth: preferences.filesPaneWidth,
            questionsPaneWidth: preferences.questionsPaneWidth,
          },
        },
      };
      const directory = path.dirname(this.#path);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = path.join(directory, `.${path.basename(this.#path)}.${process.pid}.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        });
        await fs.rename(temporary, this.#path);
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
      }
      return { status: 'saved' };
    } catch (error) {
      return {
        status: 'rejected',
        reason: `${error instanceof Error ? error.message : 'save failed'} (${this.#path})`,
      };
    }
  }
}

class EphemeralUserConfiguration implements UserConfiguration {
  async load(): Promise<UserConfigurationLoadResult> {
    return { preferences: DEFAULT_REVIEWING_PREFERENCES, themes: Object.freeze([]) };
  }

  async saveReviewingPreferences(): Promise<UserConfigurationSaveResult> {
    return { status: 'saved' };
  }

  async readMessageTemplate(): Promise<MessageTemplateRead> {
    return { status: 'missing' };
  }
}

export function createFileUserConfiguration(
  configurationPath: string = defaultUserConfigurationPath(),
): UserConfiguration {
  return new FileUserConfiguration(configurationPath);
}

export function createEphemeralUserConfiguration(): UserConfiguration {
  return new EphemeralUserConfiguration();
}
