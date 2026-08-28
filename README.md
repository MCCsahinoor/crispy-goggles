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
