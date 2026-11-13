import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { removeAnsiStyles } from '../../src/noColorOutput.js';
import { createFileUserConfiguration, defaultUserConfigurationPath } from '../../src/userConfiguration.js';

const temporaryDirectories = new Set<string>();

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buildframe-user-configuration-'));
  temporaryDirectories.add(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map(directory => fs.rm(directory, { recursive: true, force: true })));
  temporaryDirectories.clear();
});

describe('portable User Configuration', () => {
  it('strictly validates optional token palettes, preserves old files, and round-trips custom overrides', async () => {
    const directory = await temporaryDirectory();
    const configurationPath = path.join(directory, 'config.json');
    await fs.writeFile(
      configurationPath,
      JSON.stringify({
        version: 1,
        reviewing: {
          theme: { inherits: 'warm-carbon', tokens: { keyword: '#abcdef', string: 'red', bogus: '#123456' } },
          themes: [{ name: 'Custom', tokens: { comment: '#123456', markup: null } }],
        },
      }),
    );
    const configuration = createFileUserConfiguration(configurationPath);
    const loaded = await configuration.load();
    expect(loaded.preferences.theme.tokens).toEqual({ keyword: '#abcdef' });
    expect(loaded.themes[0]?.tokens).toEqual({ comment: '#123456' });
    expect(loaded.warning).toContain('reviewing.theme.tokens.string');
    expect(loaded.warning).toContain('reviewing.theme.tokens.bogus');
    expect(loaded.warning).toContain('reviewing.themes[0].tokens.markup');
    await expect(configuration.saveReviewingPreferences(loaded.preferences)).resolves.toEqual({ status: 'saved' });
    expect((await configuration.load()).preferences.theme.tokens).toEqual({ keyword: '#abcdef' });
    await expect(
      configuration.saveReviewingPreferences({
        ...loaded.preferences,
        theme: { colors: {}, tokens: { keyword: 'transparent' } },
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    for (const tokens of [[], null, '#abcdef', 12]) {
      await fs.writeFile(configurationPath, JSON.stringify({ version: 1, reviewing: { theme: { tokens } } }));
      const result = await configuration.load();
      expect(result.preferences.theme.tokens).toBeUndefined();
      expect(result.warning).toContain('reviewing.theme.tokens');
    }
  });

  it('atomically saves composable Reviewing presentation preferences and restores them', async () => {
    const directory = await temporaryDirectory();
    const configurationPath = path.join(directory, 'buildframe', 'config.json');
    const first = createFileUserConfiguration(configurationPath);

    await expect(first.load()).resolves.toEqual({
      preferences: {
        arrangement: 'workspace',
        filesVisible: true,
        filesPaneWidth: 34,
        questionsPaneWidth: 40,
        theme: { inherits: 'match-terminal', colors: {} },
        background: 'theme',
        icons: 'text',
        motion: 'smooth',
        header: { visible: true },
      },
      themes: [],
    });
    await expect(
      first.saveReviewingPreferences({
        arrangement: 'code-spotlight',
        filesVisible: false,
        filesPaneWidth: 46,
        questionsPaneWidth: 52,
        theme: {
          name: 'Terminal glass',
          inherits: 'quiet-graphite',
          colors: { border: '#789abc', accent: '#88ccee' },
        },
        background: 'terminal',
        icons: 'nerd',
        motion: 'smooth',
        header: { visible: false },
      }),
    ).resolves.toEqual({ status: 'saved' });

    const document = JSON.parse(await fs.readFile(configurationPath, 'utf8')) as {
      version: number;
      reviewing: { layout: Record<string, unknown> };
    };
    expect(document).toEqual({
      version: 1,
      reviewing: {
        arrangement: 'code-spotlight',
        theme: {
          name: 'Terminal glass',
          inherits: 'quiet-graphite',
          colors: {
            border: '#789abc',
            accent: '#88ccee',
          },
        },
        background: 'terminal',
        icons: 'nerd',
        motion: 'smooth',
        header: {
          visible: false,
        },
        layout: {
          filesVisible: false,
          filesPaneWidth: 46,
          questionsPaneWidth: 52,
        },
      },
    });
    expect((await fs.readdir(path.dirname(configurationPath))).filter(entry => entry.endsWith('.tmp'))).toEqual([]);

    const second = createFileUserConfiguration(configurationPath);
    await expect(second.load()).resolves.toEqual({
      preferences: {
        arrangement: 'code-spotlight',
        filesVisible: false,
        filesPaneWidth: 46,
        questionsPaneWidth: 52,
        theme: {
          name: 'Terminal glass',
          inherits: 'quiet-graphite',
          colors: { border: '#789abc', accent: '#88ccee' },
        },
        background: 'terminal',
        icons: 'nerd',
        motion: 'smooth',
        header: { visible: false },
      },
      themes: [],
    });
  });

  it('preserves unfamiliar fields and refuses to overwrite malformed or newer files', async () => {
    const directory = await temporaryDirectory();
    const configurationPath = path.join(directory, 'config.json');
    await fs.writeFile(
      configurationPath,
      JSON.stringify({
        version: 1,
        futureTopLevel: { retained: true },
        reviewing: {
          futureReviewing: 'retained',
          header: { futureHeader: 9 },
          layout: { futureLayout: 7 },
        },
      }),
    );
    const supported = createFileUserConfiguration(configurationPath);
    await supported.load();
    await expect(
      supported.saveReviewingPreferences({
        arrangement: 'workspace',
        filesVisible: true,
        filesPaneWidth: 30,
        questionsPaneWidth: 44,
        theme: { inherits: 'quiet-graphite', colors: {} },
        background: 'theme',
        icons: 'text',
        motion: 'smooth',
        header: { visible: true },
      }),
    ).resolves.toEqual({ status: 'saved' });
    const preserved = JSON.parse(await fs.readFile(configurationPath, 'utf8')) as Record<string, unknown>;
    expect(preserved).toMatchObject({
      futureTopLevel: { retained: true },
      reviewing: {
        futureReviewing: 'retained',
        header: {
          futureHeader: 9,
          visible: true,
        },
        layout: { futureLayout: 7 },
      },
    });

    const malformedText = '{ definitely not JSON';
    await fs.writeFile(configurationPath, malformedText);
    const malformed = createFileUserConfiguration(configurationPath);
    const loaded = await malformed.load();
    expect(loaded.warning).toContain('left unchanged');
    await expect(
      malformed.saveReviewingPreferences({
        arrangement: 'review-notebook',
        filesVisible: false,
        filesPaneWidth: 32,
        questionsPaneWidth: 42,
        theme: { inherits: 'quiet-graphite', colors: {} },
        background: 'terminal',
        icons: 'nerd',
        motion: 'smooth',
        header: { visible: false },
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    await expect(fs.readFile(configurationPath, 'utf8')).resolves.toBe(malformedText);

    const newerText = JSON.stringify({ version: 2, retained: true });
    await fs.writeFile(configurationPath, newerText);
    const newer = createFileUserConfiguration(configurationPath);
    const newerLoaded = await newer.load();
    expect(newerLoaded.warning).toContain('version 2 is unsupported');
    await expect(
      newer.saveReviewingPreferences({
        arrangement: 'workspace',
        filesVisible: true,
        filesPaneWidth: 34,
        questionsPaneWidth: 40,
        theme: { inherits: 'quiet-graphite', colors: {} },
        background: 'theme',
        icons: 'text',
        motion: 'smooth',
        header: { visible: true },
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    await expect(fs.readFile(configurationPath, 'utf8')).resolves.toBe(newerText);
  });

  it('defaults an invalid header field, ignores the retired header style, and drops it on save', async () => {
    const directory = await temporaryDirectory();
    const configurationPath = path.join(directory, 'config.json');
    await fs.writeFile(
      configurationPath,
      JSON.stringify({
        version: 1,
        reviewing: {
          arrangement: 'review-notebook',
          background: 'terminal',
          header: {
            style: 'floating-logo',
            visible: 'sometimes',
          },
        },
      }),
    );
    const configuration = createFileUserConfiguration(configurationPath);
    const loaded = await configuration.load();
    expect(loaded.preferences).toMatchObject({
      arrangement: 'review-notebook',
      background: 'terminal',
    });
    expect(loaded.preferences.header).toEqual({ visible: true });
    // Header styles were retired; an old value is not a configuration error.
    expect(loaded.warning).not.toContain('reviewing.header.style');
    expect(loaded.warning).toContain('reviewing.header.visible');
    const beforeRejectedSave = await fs.readFile(configurationPath, 'utf8');
    await expect(
      configuration.saveReviewingPreferences({
        ...loaded.preferences,
        header: { visible: 'sometimes' as never },
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    await expect(fs.readFile(configurationPath, 'utf8')).resolves.toBe(beforeRejectedSave);
    await expect(configuration.saveReviewingPreferences(loaded.preferences)).resolves.toEqual({ status: 'saved' });
    const saved = JSON.parse(await fs.readFile(configurationPath, 'utf8')) as { reviewing: { header: unknown } };
    expect(saved.reviewing.header).toEqual({ visible: true });
  });

  it('removes renderer styles without removing terminal lifecycle controls', () => {
    const input = Buffer.from('\u001b[38;2;112;183;212mBuildFrame\u001b[0m π\u001b[?1049h\u001b[2J');
    const output = removeAnsiStyles(input);
    expect(output.toString()).toBe('BuildFrame\u001b[0m π\u001b[?1049h\u001b[2J');
    expect(output.includes(Buffer.from('\u001b[38;2'))).toBe(false);
  });

  it('uses XDG_CONFIG_HOME without placing configuration in a workspace', () => {
    expect(defaultUserConfigurationPath({ XDG_CONFIG_HOME: '/portable/config' }, '/home/developer')).toBe(
      path.join('/portable/config', 'buildframe', 'config.json'),
    );
    expect(defaultUserConfigurationPath({}, '/home/developer')).toBe(
      path.join('/home/developer', '.config', 'buildframe', 'config.json'),
    );
  });
});
