/**
 * Who this phone is to other phones: a short handle and an emoji. Both travel with every share
 * (nearby broadcast, pairing info, transfer request) so the other side can show them instead of
 * a bare device model. Stored as a small JSON file next to the language choice.
 */
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";

export type Profile = { name: string; emoji: string };

export const PROFILE_NAME_MIN = 2;
export const PROFILE_NAME_MAX = 16;
/** Length of a generated handle, e.g. "SunnyFox" or "BoldOwl7". */
export const GENERATED_NAME_LENGTH = 8;

export const PROFILE_EMOJIS = [
  "📱", "😀", "😎", "🤩", "🥳", "🤖", "👻", "🐱",
  "🦊", "🐼", "🐯", "🦁", "🐸", "🐙", "🦄", "🐨",
  "🐧", "🦋", "🐬", "🦉", "🌟", "🔥", "🚀", "⚡",
  "🎧", "🎮", "🎸", "🎨", "⚽", "🏀", "🍕", "🍩",
  "🌈", "🪐", "💎", "🌸", "🍀", "🏔️", "🌊", "☕",
] as const;

const DEFAULT_EMOJI = "📱";
const STORE = `${FileSystem.documentDirectory ?? ""}filora-profile.json`;
const HANDLE = /^[A-Za-z0-9._]+$/;

const ADJECTIVES = ["Sunny", "Swift", "Cool", "Bold", "Calm", "Zesty", "Lucky", "Brave", "Nova", "Pixel", "Cosmo", "Neon", "Jolly", "Mint", "Rapid", "Zen", "Wild", "Ultra", "Royal", "Happy"];
const NOUNS = ["Fox", "Owl", "Cat", "Bee", "Yak", "Elk", "Koi", "Ant", "Jay", "Pup", "Doe", "Ram", "Emu", "Kit", "Orca", "Lynx", "Hawk", "Wolf", "Bear", "Seal"];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

/** The phone's own model name, e.g. "RMX3761" or "moto edge 60 pro". */
export function deviceModel(): string {
  const name = Constants.deviceName?.trim();
  return name ? name.slice(0, 40) : "Phone";
}

/** A fresh 8-character handle: adjective + animal, padded with digits when short. */
export function generateHandle(): string {
  let handle = `${pick(ADJECTIVES)}${pick(NOUNS)}`.slice(0, GENERATED_NAME_LENGTH);
  while (handle.length < GENERATED_NAME_LENGTH) {
    handle += String(Math.floor(Math.random() * 10));
  }
  return handle;
}

/** Strip a leading "@" and anything that is not a letter, digit, dot or underscore. */
export function sanitizeHandle(raw: string): string {
  return raw.replace(/^@+/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, PROFILE_NAME_MAX);
}

export function isValidHandle(name: string): boolean {
  return name.length >= PROFILE_NAME_MIN && name.length <= PROFILE_NAME_MAX && HANDLE.test(name);
}

export function isProfileEmoji(value: unknown): value is (typeof PROFILE_EMOJIS)[number] {
  return typeof value === "string" && (PROFILE_EMOJIS as readonly string[]).includes(value);
}

let cached: Profile | null = null;
let loading: Promise<Profile> | null = null;
const listeners = new Set<(profile: Profile) => void>();

async function persist(profile: Profile): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(STORE, JSON.stringify(profile));
  } catch {
    // The in-memory profile still applies for this session.
  }
}

/** The saved profile, or a freshly generated one on first run. */
export function loadProfile(): Promise<Profile> {
  if (cached) {
    return Promise.resolve(cached);
  }
  if (!loading) {
    loading = (async () => {
      try {
        const parsed = JSON.parse(await FileSystem.readAsStringAsync(STORE)) as Partial<Profile>;
        const name = sanitizeHandle(String(parsed.name ?? ""));
        if (isValidHandle(name)) {
          cached = { name, emoji: isProfileEmoji(parsed.emoji) ? parsed.emoji : DEFAULT_EMOJI };
          return cached;
        }
      } catch {
        // No profile yet.
      }
      cached = { name: generateHandle(), emoji: pick(PROFILE_EMOJIS) };
      void persist(cached);
      return cached;
    })();
  }
  return loading;
}

export async function saveProfile(next: Profile): Promise<void> {
  const profile: Profile = {
    name: isValidHandle(next.name) ? next.name : generateHandle(),
    emoji: isProfileEmoji(next.emoji) ? next.emoji : DEFAULT_EMOJI,
  };
  cached = profile;
  for (const listener of listeners) {
    listener(profile);
  }
  await persist(profile);
}

/** Current profile for a component; updates everywhere when saved. */
export function useProfile(): { profile: Profile; ready: boolean; save: (next: Profile) => Promise<void> } {
  const [profile, setProfile] = useState<Profile>(() => cached ?? { name: "", emoji: DEFAULT_EMOJI });
  const [ready, setReady] = useState(cached !== null);
  useEffect(() => {
    let active = true;
    void loadProfile().then((loaded) => {
      if (active) {
        setProfile(loaded);
        setReady(true);
      }
    });
    const listener = (next: Profile) => setProfile(next);
    listeners.add(listener);
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, []);
  return { profile, ready, save: saveProfile };
}
