import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Video from 'react-native-video';
import { Api, PlaySession, VideoItem } from './src/api';

// Android emulator reaches the host at 10.0.2.2; iOS simulator uses localhost.
const DEFAULT_BASE_URL = 'http://10.0.2.2:3000';

type Screen = 'login' | 'list' | 'player';

export default function App(): React.JSX.Element {
  const [api] = useState(() => new Api(DEFAULT_BASE_URL));
  const [screen, setScreen] = useState<Screen>('login');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [email, setEmail] = useState('vdowatermark@vdowatermark.th');
  const [password, setPassword] = useState('vdowatermark9630');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [session, setSession] = useState<PlaySession | null>(null);

  async function doLogin() {
    setBusy(true);
    setError(null);
    try {
      api.baseUrl = baseUrl.trim();
      await api.login(email.trim(), password);
      setVideos(await api.listVideos());
      setScreen('list');
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function doPlay(v: VideoItem) {
    setBusy(true);
    setError(null);
    try {
      setSession(await api.play(v.id));
      setScreen('player');
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (screen === 'login') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.h1}>Sign in</Text>
        <TextInput style={styles.input} value={baseUrl} onChangeText={setBaseUrl} placeholder="Server URL" autoCapitalize="none" />
        <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" />
        <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
        {error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.button} onPress={doLogin} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (screen === 'list') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.h1}>Videos</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <FlatList
          data={videos}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => doPlay(item)} disabled={busy}>
              <View>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowMeta}>
                  {item.width}×{item.height} · {Math.round(item.durationSec)}s
                </Text>
              </View>
              <Text style={styles.pill}>{item.category}</Text>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    );
  }

  // player
  const uri = session ? api.tokenizedPlaylistUrl(session) : '';
  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={() => setScreen('list')}>
        <Text style={styles.link}>‹ Back</Text>
      </TouchableOpacity>
      {session && (
        <>
          <Video
            source={{ uri, headers: { Authorization: `Bearer ${session.sessionToken}` } }}
            style={styles.video}
            controls
            resizeMode="contain"
            onError={(e) => setError(JSON.stringify(e.error))}
          />
          <Text style={styles.meta}>Watermark: {session.watermark.text}</Text>
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#0f1115' },
  h1: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  input: { backgroundColor: '#171a21', color: '#fff', borderRadius: 8, padding: 12, marginBottom: 10 },
  button: { backgroundColor: '#3b82f6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: '#ef6d6d', marginVertical: 8 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#171a21', borderRadius: 8, padding: 14, marginBottom: 8,
  },
  rowTitle: { color: '#fff', fontWeight: '600' },
  rowMeta: { color: '#8b94a3', fontSize: 12, marginTop: 2 },
  pill: { color: '#b9c2d0', backgroundColor: '#22272f', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12 },
  link: { color: '#3b82f6', fontSize: 16, marginBottom: 10 },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 8 },
  meta: { color: '#9fe6a0', fontFamily: 'monospace', marginTop: 10 },
});
