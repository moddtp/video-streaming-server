# React Native sample client

A minimal React Native app that logs in, lists videos, and plays a per-user
watermarked HLS stream via [`react-native-video`](https://github.com/TheWidlarzGroup/react-native-video)
(v6) — which uses ExoPlayer/Media3 on Android and AVPlayer on iOS, both of which
play HLS natively.

This folder ships the app source (`App.tsx`, `src/api.ts`) but **not** the
generated native projects. Scaffold a fresh RN app, then drop these in.

## Setup

```bash
# 1. Scaffold a new bare React Native app (latest).
npx @react-native-community/cli@latest init VodSample
cd VodSample

# 2. Add the video player.
npm install react-native-video

# 3. Copy this sample's source over the generated files.
cp -r /path/to/clients/react_native_sample/App.tsx .
cp -r /path/to/clients/react_native_sample/src ./src

# 4. iOS only: install pods.
cd ios && pod install && cd ..
```

### Allow plaintext HTTP for local dev

The dev server is `http://`, which mobile platforms block by default. For local
testing only:

- **Android** — in `android/app/src/main/AndroidManifest.xml`, set
  `android:usesCleartextTraffic="true"` on `<application>`.
- **iOS** — in `ios/VodSample/Info.plist`, add:
  ```xml
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
  ```

In production your server should be behind HTTPS, and these aren't needed.

## Run

Start the streaming server first (`npm run dev` in the repo root), then:

```bash
npm run android   # or: npm run ios
```

Set the server URL on the login screen:

| Target           | URL                         |
| ---------------- | --------------------------- |
| Android emulator | `http://10.0.2.2:3000`      |
| iOS simulator    | `http://localhost:3000`     |
| Physical device  | `http://<your-LAN-IP>:3000` |

Sign in with a demo login (e.g. `phirapong@icbsolution.com` / `password123`),
pick a video, and watch the watermark move. See `../../docs/CLIENT-REACT-NATIVE.md`
for integration details.
