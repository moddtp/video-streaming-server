export interface VideoItem {
  id: string;
  title: string;
  category: string;
  durationSec: number;
  width: number;
  height: number;
}

export interface PlaySession {
  sessionId: string;
  playlistUrl: string;
  sessionToken: string;
  watermark: { text: string };
}

/** Tiny client for the streaming server's HTTP API. */
export class Api {
  private accessToken: string | null = null;

  constructor(public baseUrl: string) {}

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken ?? ''}` };
  }

  async login(email: string, password: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Login failed (${res.status})`);
    const body = await res.json();
    this.accessToken = body.accessToken;
    return body.email;
  }

  async listVideos(): Promise<VideoItem[]> {
    const res = await fetch(`${this.baseUrl}/api/videos`, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`List failed (${res.status})`);
    return (await res.json()).videos;
  }

  async play(videoId: string): Promise<PlaySession> {
    const res = await fetch(`${this.baseUrl}/api/videos/${videoId}/play`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    if (res.status === 503) throw new Error('Server busy — try again shortly');
    if (!res.ok) throw new Error(`Play failed (${res.status})`);
    return res.json();
  }

  /**
   * Playlist URL with the session token attached. The server rewrites each
   * segment URI to carry the same token, so segment requests stay authorized
   * even when the native player doesn't forward headers to them.
   */
  tokenizedPlaylistUrl(s: PlaySession): string {
    return `${this.baseUrl}${s.playlistUrl}?t=${encodeURIComponent(s.sessionToken)}`;
  }
}
