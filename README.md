# FileDrop Mobile (Expo)

React Native Expo app that connects to **FileDrop.exe** on your PC and downloads shared files.

## Setup

```powershell
cd F:\filedrop-mobile
npm install
npx expo install expo-camera expo-file-system expo-sharing
```

## Run

1. Start **FileDrop.exe** on your PC and add files.
2. Use **Global link** mode (easiest for mobile data).
3. In this app:

```powershell
npm start
```

4. Open in **Expo Go** on your phone (scan the Metro QR), or run:

```powershell
npm run android
```

## How to connect

### Global link mode
- Select **Global link** in the app
- Scan the Share QR from FileDrop PC, or paste the `https://...trycloudflare.com/s/...` link

### Local network mode
1. Select **Local network** in the app (and on FileDrop PC)
2. **Step 1:** Tap **Scan Wi-Fi QR** and join that network in phone Wi-Fi settings
3. **Step 2:** Scan **Share QR**, or enter PC IP (`192.168.137.1`), port (`8765`), and session token

If the PC owner set a password, enter it when prompted.

## Requirements

- FileDrop PC app running with files added
- **Global link:** phone can use mobile data
- **Local network:** phone must be on the same hotspot/Wi‑Fi as the PC

## Project layout

```
filedrop-mobile/
├── App.tsx              # Main UI
├── src/lib/filedrop.ts  # API client for FileDrop server
└── app.json             # Expo config + camera permission
```

## Project structure

```
app/                       Expo Router routes. Each file is a thin page that renders one screen component.
  _layout.tsx              Root layout (providers, app-wide hooks, Stack)
  index.tsx                Launch screen: choose PC or phone
  pc/                      Share with a PC
    _layout.tsx            Shell: header, footer, modals, shared session
    index.tsx              Step 1: connect (link or QR)
    password.tsx           Step 2: unlock (password-protected shares)
    files.tsx              Step 3: shared files
  phone.tsx                Share phone to phone
  settings.tsx             Settings
  +not-found.tsx           404 screen
src/
  components/common/       Shared UI (ui, ModalFrame, FontProvider, AdBanner, picker, AppButton, ...)
  components/layout/       ScreenContainer
  components/filora/       Filora screens and their parts (PcHeader, ConnectView, PasswordView, ...)
  features/filora/
    hooks/                 usePcSession (state and handlers for the PC flow)
    services/phone/        Phone-to-phone protocol, discovery, sender and receiver
    utils/                 Navigation helpers
  services/                api, device, ads, updates, storage
  hooks/ utils/ constants/ theme/ i18n/
assets/                    images, icons, fonts, animations
tests/                     unit, integration
```

Imports use the `@/` alias for `src/` in new code.