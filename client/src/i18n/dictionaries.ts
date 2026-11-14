import { DEFAULT_LANG, LANGS, type Lang } from '@agent-office/shared';
import en from './en.json';
import tr from './tr.json';

export type MessageKey = keyof typeof en;
export type Dictionary = Record<MessageKey, string>;

// Typed as Dictionary: a key missing from tr.json is a compile error.
const trDict: Dictionary = tr;

export const dictionaries: Record<Lang, Dictionary> = { en, tr: trDict };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/** Look up a key and fill {{placeholders}}. Falls back to English, then to the key itself. */
export function translate(
  lang: Lang,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = dictionaries[lang][key] ?? dictionaries[DEFAULT_LANG][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
