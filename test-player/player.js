// Minimal test player: login -> list videos -> create a watermarked session ->
// play the HLS stream. Served same-origin from the streaming server.
const $ = (id) => document.getElementById(id);
const BASE = ''; // same origin as the server

let accessToken = null;
let hls = null;
let adEndHandler = null;

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
  const sel = $('externalSelect');
  sel.innerHTML = '';
  let externalCount = 0;
  for (const v of videos) {
    if (v.kind === 'external') {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.title} — ${v.category}`;
      sel.appendChild(opt);
      externalCount++;
      continue;
    }
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
  $('externalWrap').style.display = externalCount ? 'block' : 'none';
}

async function play(id) {
  setStatus($('playStatus'), 'Starting watermarked session…');
  $('streamUrl').value = '';
  try {
    const r = await api(`/api/videos/${id}/play`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    // Absolute, tokenized URL — copyable into VLC/MX/Kodi/QuickTime, which see the same burned-in watermark.
    const url = `${location.origin}${r.playlistUrl}?t=${encodeURIComponent(r.sessionToken)}`;
    $('streamUrl').value = url;
    const wm = r.watermark.text;
    if ($('adToggle').checked) {
      playAdThenMain(url, wm);
    } else {
      setStatus($('playStatus'), `Playing — watermark: ${wm}`);
      startPlayback(url);
    }
  } catch (err) {
    setStatus($('playStatus'), err.message, true);
  }
}

function clearAd() {
  if (adEndHandler) {
    $('video').removeEventListener('ended', adEndHandler);
    adEndHandler = null;
  }
}

// Client-side simulated pre-roll: play the 4s ad MP4 natively, then the main HLS.
// (Just sequencing two videos — NOT a watermark layer.)
function playAdThenMain(mainUrl, wm) {
  const video = $('video');
  if (hls) {
    hls.destroy();
    hls = null;
  }
  clearAd();
  setStatus($('playStatus'), 'Playing simulated 4-second ad…');
  video.src = '/ad.mp4';
  video.load();
  adEndHandler = () => {
    clearAd();
    video.removeAttribute('src');
    video.load();
    setStatus($('playStatus'), `Playing — watermark: ${wm}`);
    startPlayback(mainUrl);
  };
  video.addEventListener('ended', adEndHandler);
  video.play().catch(() => {});
}

function startPlayback(url) {
  const video = $('video');
  if (hls) {
    hls.destroy();
    hls = null;
  }

  // Prefer hls.js wherever MSE exists (Chrome / Firefox / Edge / desktop Safari):
  // it's far more reliable for a server-generated EVENT playlist than native HLS,
  // which some browsers advertise but play flakily. The stream is still being
  // written, so the first manifest/fragment can briefly 404 or be short — retry
  // generously and auto-recover instead of going black; log every event.
  if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({
      enableWorker: true,
      manifestLoadingMaxRetry: 8,
      manifestLoadingRetryDelay: 500,
      levelLoadingMaxRetry: 8,
      levelLoadingRetryDelay: 500,
      fragLoadingMaxRetry: 10,
      fragLoadingRetryDelay: 500,
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(window.Hls.Events.ERROR, (_e, data) => {
      (data.fatal ? console.error : console.warn)('[hls]', data.type, data.details, 'fatal=' + data.fatal);
      if (!data.fatal) return;
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
        setStatus($('playStatus'), `Network hiccup (${data.details}) — retrying…`);
        hls.startLoad();
      } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
        setStatus($('playStatus'), `Media hiccup (${data.details}) — recovering…`);
        hls.recoverMediaError();
      } else {
        setStatus($('playStatus'), `Playback error: ${data.details}`, true);
        hls.destroy();
      }
    });
    return;
  }

  // Native HLS fallback — iOS Safari (no MSE, so hls.js can't run).
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.addEventListener('error', () => setStatus($('playStatus'), 'Native HLS error — see console', true), { once: true });
    video.play().catch(() => {});
    return;
  }

  setStatus($('playStatus'), 'HLS is not supported in this browser.', true);
}

$('loginBtn').onclick = login;
$('externalPlayBtn').onclick = () => {
  const id = $('externalSelect').value;
  if (id) play(id);
};
$('copyUrlBtn').onclick = async () => {
  const url = $('streamUrl').value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    setStatus($('playStatus'), 'URL copied to clipboard.');
  } catch {
    $('streamUrl').select();
    document.execCommand('copy');
  }
};
prefillDemo();
