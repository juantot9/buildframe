import { describe, expect, it } from 'vitest';

import {
  accessIsPrivate,
  tightenWindowsDirectory,
  userConfigurationDirectoryFor,
  userStateDirectoryFor,
  windowsRuntimeDirectoryFor,
} from '../../src/privateDirectories.js';

const USER = 'S-1-5-21-1515421397-2354242066-3459889582-1001';
const OTHER = 'S-1-5-21-1515421397-2354242066-3459889582-1002';
const PRIVATE_ACCESS = `D:P(A;OICI;FA;;;${USER})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)`;

describe('a private Windows access list', () => {
  it('is owned by the user and allows only the user, SYSTEM and Administrators', () => {
    expect(accessIsPrivate(`O:${USER}${PRIVATE_ACCESS}`, USER)).toBe(true);
    // Administrators may own it (an elevated process creates it that way).
    expect(accessIsPrivate(`O:BA${PRIVATE_ACCESS}`, USER)).toBe(true);
    // A deny entry only takes access away.
    expect(accessIsPrivate(`O:${USER}${PRIVATE_ACCESS}(D;OICI;FA;;;WD)`, USER)).toBe(true);
  });

  it('is refused when anyone else is allowed in, or ownership is elsewhere', () => {
    expect(accessIsPrivate(`O:${USER}${PRIVATE_ACCESS}(A;OICI;FR;;;BU)`, USER)).toBe(false);
    expect(accessIsPrivate(`O:${USER}${PRIVATE_ACCESS}(A;;0x1200a9;;;WD)`, USER)).toBe(false);
    expect(accessIsPrivate(`O:${USER}${PRIVATE_ACCESS}(A;OICI;FA;;;${OTHER})`, USER)).toBe(false);
    expect(accessIsPrivate(`O:${OTHER}${PRIVATE_ACCESS}`, USER)).toBe(false);
    // Any kind of allow entry counts by the account it lets in.
    expect(accessIsPrivate(`O:${USER}${PRIVATE_ACCESS}(OA;;FA;guid;;${OTHER})`, USER)).toBe(false);
    expect(accessIsPrivate(`O:${USER}${PRIVATE_ACCESS}(OA;;FA;guid;;${USER})`, USER)).toBe(true);
  });

  it('is refused when it still inherits from its parent or has no access list', () => {
    expect(accessIsPrivate(`O:${USER}D:(A;OICI;FA;;;${USER})(A;OICI;FA;;;SY)`, USER)).toBe(false);
    expect(accessIsPrivate(`O:${USER}D:AI(A;OICI;FA;;;${USER})`, USER)).toBe(false);
    expect(accessIsPrivate(`O:${USER}D:NO_ACCESS_CONTROL`, USER)).toBe(false);
    expect(accessIsPrivate(`O:${USER}`, USER)).toBe(false);
    expect(accessIsPrivate('', USER)).toBe(false);
  });

  it('is left to chmod outside Windows', () => {
    expect(tightenWindowsDirectory('/anywhere', 'linux')).toBe('not-windows');
    expect(tightenWindowsDirectory('/anywhere', 'darwin')).toBe('not-windows');
  });
});

describe('where BuildFrame keeps its files', () => {
  const windows = { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local', APPDATA: 'C:\\Users\\dev\\AppData\\Roaming' };

  it('keeps State in the platform location, after an explicit XDG_STATE_HOME', () => {
    expect(userStateDirectoryFor(windows, 'C:\\Users\\dev', 'win32')).toBe(
      'C:\\Users\\dev\\AppData\\Local\\BuildFrame',
    );
    expect(userStateDirectoryFor({}, '/home/dev', 'linux')).toBe('/home/dev/.local/state/buildframe');
    expect(userStateDirectoryFor({}, '/Users/dev', 'darwin')).toBe('/Users/dev/Library/Application Support/BuildFrame');
    expect(userStateDirectoryFor({ XDG_STATE_HOME: '/portable/state' }, '/home/dev', 'linux')).toBe(
      '/portable/state/buildframe',
    );
    expect(userStateDirectoryFor({ ...windows, XDG_STATE_HOME: 'D:\\state' }, 'C:\\Users\\dev', 'win32')).toBe(
      'D:\\state\\buildframe',
    );
  });

  it('has no State location without one it can use', () => {
    expect(userStateDirectoryFor({}, 'C:\\Users\\dev', 'win32')).toBeUndefined();
    expect(userStateDirectoryFor({ LOCALAPPDATA: 'relative' }, 'C:\\Users\\dev', 'win32')).toBeUndefined();
    expect(userStateDirectoryFor({}, '', 'linux')).toBeUndefined();
    expect(userStateDirectoryFor({ XDG_STATE_HOME: 'relative' }, 'relative', 'linux')).toBeUndefined();
  });

  it('keeps configuration in %APPDATA% on Windows and ~/.config elsewhere', () => {
    expect(userConfigurationDirectoryFor(windows, 'C:\\Users\\dev', 'win32')).toBe(
      'C:\\Users\\dev\\AppData\\Roaming\\BuildFrame',
    );
    expect(userConfigurationDirectoryFor({}, 'C:\\Users\\dev', 'win32')).toBe('C:\\Users\\dev\\.config\\buildframe');
    expect(userConfigurationDirectoryFor({}, '/home/dev', 'linux')).toBe('/home/dev/.config/buildframe');
    expect(userConfigurationDirectoryFor({ XDG_CONFIG_HOME: '/portable/config' }, '/home/dev', 'linux')).toBe(
      '/portable/config/buildframe',
    );
  });

  it('keeps the Windows runtime directory under %LOCALAPPDATA%', () => {
    expect(windowsRuntimeDirectoryFor(windows)).toBe('C:\\Users\\dev\\AppData\\Local\\BuildFrame\\runtime');
    expect(windowsRuntimeDirectoryFor({})).toBeUndefined();
  });
});
