# Flutter sample client

A minimal Flutter app that logs in, lists videos, and plays a per-user
watermarked HLS stream from the streaming server.

This folder ships the app source (`lib/`, `pubspec.yaml`) but **not** the
generated `android/` and `ios/` platform folders. Generate them once with
`flutter create`, then run.

## Setup

```bash
cd clients/flutter_sample

# Generate the android/ + ios/ platform scaffolding in place (keeps lib/ & pubspec.yaml).
flutter create --project-name vod_sample --org com.example .

flutter pub get
```

### Allow plaintext HTTP for local dev

The dev server is `http://` (not `https://`), which mobile platforms block by
default. For local testing only:

- **Android** — in `android/app/src/main/AndroidManifest.xml`, add
  `android:usesCleartextTraffic="true"` to the `<application>` tag.
- **iOS** — in `ios/Runner/Info.plist`, add:
  ```xml
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
  ```

In production your server should be behind HTTPS, and these aren't needed.

## Run

Start the streaming server first (`npm run dev` in the repo root). Then:

```bash
flutter run
```

Set the **Server URL** on the login screen:

| Target                | URL                       |
| --------------------- | ------------------------- |
| Android emulator      | `http://10.0.2.2:3000`    |
| iOS simulator         | `http://localhost:3000`   |
| Physical device       | `http://<your-LAN-IP>:3000` |

Sign in with a demo login (e.g. `vdowatermark@vdowatermark.th` / `vdowatermark9630`),
pick a video, and watch the watermark move. See `../../docs/CLIENT-FLUTTER.md`
for the integration details and `better_player` / `media_kit` alternatives.
