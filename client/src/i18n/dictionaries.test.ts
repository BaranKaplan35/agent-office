import { describe, expect, it } from 'vitest';
import { dictionaries, translate } from './dictionaries';

describe('i18n dictionaries', () => {
  it('every language has exactly the same keys as English', () => {
    const enKeys = Object.keys(dictionaries.en).sort();
    for (const [lang, dict] of Object.entries(dictionaries)) {
      expect(Object.keys(dict).sort(), `keys of ${lang}.json`).toEqual(enKeys);
    }
  });

  it('no translation is empty', () => {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${lang}.json → ${key}`).not.toBe('');
      }
    }
  });

  it('fills placeholders', () => {
    expect(translate('en', 'status.online', { provider: 'mock' })).toBe('Server online · mock');
    expect(translate('tr', 'status.online', { provider: 'mock' })).toBe('Sunucu çevrimiçi · mock');
  });
});
