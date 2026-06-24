// Minimal test player: login -> list videos -> create a watermarked session ->
// play the HLS stream. Served same-origin from the streaming server.
const $ = (id) => document.getElementById(id);
const BASE = ''; // same origin as the server

let accessToken = null;
let hls = null;

function setStatus(el, msg, isErr = false) {
  el.textContent = msg;
  el.className = 'status' + (isErr ? ' err' : '');
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
  return body;
}

async function prefillDemo() {
  try {
    const { logins } = await api('/api/demo-logins');
    if (logins && logins[0]) {
      $('email').value = logins[0].email;
      $('password').value = logins[0].password;
      $('demoHint').innerHTML =
        'Demo logins: ' + logins.map((l) => `<code>${l.email}</code> / <code>${l.password}</code>`).join(' · ');
    }
  } catch {
    /* server may disable this in prod */
  }
}

async function login() {
  $('loginBtn').disabled = true;
  setStatus($('loginStatus'), 'Signing in…');
  try {
    const { accessToken: tok, email } = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }),
    });
    accessToken = tok;
    setStatus($('loginStatus'), `Signed in as ${email}.`);
    $('catalogCard').style.display = 'block';
    await loadVideos();
  } catch (err) {
    setStatus($('loginStatus'), err.message, true);
  } finally {
    $('loginBtn').disabled = false;
  }
}

async function loadVideos() {
  const { videos } = await api('/api/videos', { headers: { Authorization: 'Bearer ' + accessToken } });
  const ul = $('videoList');
  ul.innerHTML = '';
  for (const v of videos) {
    const li = document.createElement('li');
    li.innerHTML =
      `<span><strong>${v.title}</strong><br><span class="meta">${v.width}×${v.height} · ${Math.round(v.durationSec)}s</span></span>` +
      `<span class="pill">${v.category}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Play';
    btn.onclick = () => play(v.id);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

async function play(id) {
  setStatus($('playStatus'), 'Starting watermarked session…');
  try {
    const r = await api(`/api/videos/${id}/play`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    const url = `${r.playlistUrl}?t=${encodeURIComponent(r.sessionToken)}`;
    setStatus($('playStatus'), `Playing — watermark: ${r.watermark.text}`);
    startPlayback(url);
  } catch (err) {
    setStatus($('playStatus'), err.message, true);
  }
}

function startPlayback(url) {
  const video = $('video');
  if (hls) {
    hls.destroy();
    hls = null;
  }
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari / iOS: native HLS.
    video.src = url;
    video.play().catch(() => {});
  } else if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({ lowLatencyMode: false });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(window.Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) setStatus($('playStatus'), `Playback error: ${data.details}`, true);
    });
  } else {
    setStatus($('playStatus'), 'HLS is not supported in this browser.', true);
  }
}

$('loginBtn').onclick = login;
prefillDemo();
