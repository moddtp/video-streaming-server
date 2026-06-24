# Flutter integration

A runnable sample lives in [`clients/flutter_sample/`](../clients/flutter_sample/).
This doc is the integration summary.

## Flow

1. `POST /api/login` → `accessToken`.
2. `GET /api/videos` (Bearer) → list.
3. `POST /api/videos/:id/play` (Bearer) → `{ playlistUrl, sessionToken, watermark }`.
4. Build the tokenized URL and play it.

## Play with `video_player`

`video_player` uses the platform players (ExoPlayer/Media3 on Android, AVPlayer
on iOS), both of which play HLS natively.

```dart
import 'package:video_player/video_player.dart';

// playlistUrl + sessionToken came from POST /play
final url = '$baseUrl$playlistUrl?t=${Uri.encodeQueryComponent(sessionToken)}';

final controller = VideoPlayerController.networkUrl(Uri.parse(url));
await controller.initialize();
await controller.play();
// AspectRatio(aspectRatio: controller.value.aspectRatio, child: VideoPlayer(controller))
```

```yaml
# pubspec.yaml
dependencies:
  video_player: ^2.9.2
  http: ^1.2.2
```

## The token model (important)

The session token guards both the playlist and every segment. Put it in the
**playlist URL as `?t=`** (not just a header): the server rewrites each segment
URI in the returned `.m3u8` to carry the same `?t=`, so segment requests stay
authorized even though native players don't forward headers to segment fetches.

`video_player` also accepts `httpHeaders:` on `networkUrl` if you prefer Bearer
for the playlist request — but keep the `?t=` for the segments.

## Alternatives

- **`better_player_enhanced`** — richer UI/controls, subtitle/quality menus,
  built on Media3; pass the same tokenized URL as the data source.
- **`media_kit`** — libmpv-based, good desktop + mobile support.

## Local dev over HTTP

The dev server is `http://`; mobile platforms block cleartext by default. See the
sample's [README](../clients/flutter_sample/README.md) for the one-line Android
(`usesCleartextTraffic`) and iOS (`NSAppTransportSecurity`) dev settings. Use the
emulator host `http://10.0.2.2:3000` (Android) or `http://localhost:3000` (iOS).
