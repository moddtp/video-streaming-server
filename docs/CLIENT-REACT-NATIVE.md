# React Native integration

A runnable sample lives in [`clients/react_native_sample/`](../clients/react_native_sample/).
This doc is the integration summary.

## Flow

1. `POST /api/login` → `accessToken`.
2. `GET /api/videos` (Bearer) → list.
3. `POST /api/videos/:id/play` (Bearer) → `{ playlistUrl, sessionToken, watermark }`.
4. Build the tokenized URL and play it.

## Play with `react-native-video` (v6)

`react-native-video` uses ExoPlayer/Media3 (Android) and AVPlayer (iOS), both of
which play HLS natively.

```tsx
import Video from 'react-native-video';

// playlistUrl + sessionToken came from POST /play
const uri = `${baseUrl}${playlistUrl}?t=${encodeURIComponent(sessionToken)}`;

<Video
  source={{ uri, headers: { Authorization: `Bearer ${sessionToken}` } }}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
  controls
  resizeMode="contain"
  onError={(e) => console.warn(e)}
/>;
```

```bash
npm install react-native-video   # v6+
cd ios && pod install             # iOS only
```

## The token model (important)

The session token guards both the playlist and every segment. Put it in the
**playlist URL as `?t=`**: the server rewrites each segment URI in the returned
`.m3u8` to carry the same `?t=`, so segment requests stay authorized even though
the native player doesn't propagate the `headers` you set on `source` to its
segment fetches. (Setting `headers` still helps the initial playlist request.)

## Local dev over HTTP

The dev server is `http://`; mobile platforms block cleartext by default. See the
sample's [README](../clients/react_native_sample/README.md) for the one-line
Android (`usesCleartextTraffic`) and iOS (`NSAppTransportSecurity`) dev settings.
Use the emulator host `http://10.0.2.2:3000` (Android) or `http://localhost:3000`
(iOS).
