import * as FileSystem from "expo-file-system/legacy";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { bn } from "./bn";
import { en, type TranslationKey } from "./en";
import { hi } from "./hi";
import { ta } from "./ta";

export type { TranslationKey };

export type Language = "en" | "hi" | "bn" | "ta";

/** Every language must define every key of the English dictionary. */
export type Dictionary = Record<TranslationKey, string>;

export type TranslateParams = Record<string, string | number>;

type PluralBase = {
  [K in TranslationKey]: K extends `${infer B}_one` ? B : never;
}[TranslationKey];

export const LANGUAGES: { code: Language; label: string; subLabel: string }[] = [
  { code: "en", label: "English", subLabel: "English (US)" },
  { code: "hi", label: "Hindi", subLabel: "हिन्दी" },
  { code: "bn", label: "Bengali", subLabel: "বাংলা" },
  { code: "ta", label: "Tamil", subLabel: "தமிழ்" },
];

const DICTIONARIES: Record<Language, Dictionary> = { en, hi, bn, ta };

const LANGUAGE_STORE = `${FileSystem.documentDirectory ?? ""}filedrop-language.txt`;

let currentLanguage: Language = "en";

function isLanguage(value: string): value is Language {
  return value === "en" || value === "hi" || value === "bn" || value === "ta";
}

export function getLanguage(): Language {
  return currentLanguage;
}

/** Hindi and Bengali need system fonts: Raleway/Poppins have no Devanagari or Bengali glyphs. */
export function isNonLatinLanguage(language: Language = currentLanguage): boolean {
  return language !== "en";
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function translate(language: Language, key: TranslationKey, params?: TranslateParams): string {
  const template = DICTIONARIES[language][key] ?? en[key] ?? key;
  return interpolate(template, params);
}

/** Translate outside React (lib code, alerts). Uses the active language. */
export function t(key: TranslationKey, params?: TranslateParams): string {
  return translate(currentLanguage, key, params);
}

function translatePlural(
  language: Language,
  base: PluralBase,
  count: number,
  params?: TranslateParams,
): string {
  const key = `${base}_${count === 1 ? "one" : "other"}` as TranslationKey;
  return translate(language, key, { ...params, count });
}

/** Plural-aware translate outside React: tn("files.available", 3). */
export function tn(base: PluralBase, count: number, params?: TranslateParams): string {
  return translatePlural(currentLanguage, base, count, params);
}

export function detectDeviceLanguage(): Language {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? "en";
    const code = locale.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(code)) {
      return code;
    }
  } catch {
    // Fall through to English.
  }
  return "en";
}

async function loadStoredLanguage(): Promise<Language> {
  try {
    const info = await FileSystem.getInfoAsync(LANGUAGE_STORE);
    if (info.exists) {
      const stored = (await FileSystem.readAsStringAsync(LANGUAGE_STORE)).trim();
      if (isLanguage(stored)) {
        return stored;
      }
    }
  } catch {
    // Fall back to the device language.
  }
  return detectDeviceLanguage();
}

async function saveLanguage(language: Language) {
  try {
    await FileSystem.writeAsStringAsync(LANGUAGE_STORE, language);
  } catch {
    // Ignore persistence errors; the in-memory choice still applies.
  }
}

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslateParams) => string;
  tn: (base: PluralBase, count: number, params?: TranslateParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [ready, setReady] = useState(false);

  // Keep the module-level language in sync before children render.
  currentLanguage = language;

  useEffect(() => {
    let cancelled = false;
    loadStoredLanguage().then((stored) => {
      if (cancelled) {
        return;
      }
      currentLanguage = stored;
      setLanguageState(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    currentLanguage = next;
    setLanguageState(next);
    saveLanguage(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => translate(language, key, params),
      tn: (base, count, params) => translatePlural(language, base, count, params),
    }),
    [language, setLanguage],
  );

  if (!ready) {
    return null;
  }

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return value;
}
