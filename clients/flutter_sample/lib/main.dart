import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'api.dart';

// Android emulator reaches the host machine at 10.0.2.2; iOS simulator uses
// localhost. Change this (or the field on the login screen) to your server.
const String kDefaultBaseUrl = 'http://10.0.2.2:3000';

void main() => runApp(const VodApp());

class VodApp extends StatelessWidget {
  const VodApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'VOD Watermark Sample',
      theme: ThemeData(colorSchemeSeed: Colors.indigo, useMaterial3: true, brightness: Brightness.dark),
      home: const LoginScreen(),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _baseUrl = TextEditingController(text: kDefaultBaseUrl);
  final _email = TextEditingController(text: 'vdowatermark@vdowatermark.th');
  final _password = TextEditingController(text: 'vdowatermark9630');
  bool _busy = false;
  String? _error;

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = Api(_baseUrl.text.trim());
      await api.login(_email.text.trim(), _password.text);
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => CatalogScreen(api: api)));
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            TextField(controller: _baseUrl, decoration: const InputDecoration(labelText: 'Server URL')),
            TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
            TextField(
              controller: _password,
              decoration: const InputDecoration(labelText: 'Password'),
              obscureText: true,
            ),
            const SizedBox(height: 16),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy ? null : _login,
              child: _busy ? const CircularProgressIndicator() : const Text('Sign in'),
            ),
          ],
        ),
      ),
    );
  }
}

class CatalogScreen extends StatefulWidget {
  final Api api;
  const CatalogScreen({super.key, required this.api});
  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  late Future<List<VideoItem>> _videos;

  @override
  void initState() {
    super.initState();
    _videos = widget.api.listVideos();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Videos')),
      body: FutureBuilder<List<VideoItem>>(
        future: _videos,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) return Center(child: Text('${snap.error}'));
          final videos = snap.data!;
          return ListView.separated(
            itemCount: videos.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final v = videos[i];
              return ListTile(
                title: Text(v.title),
                subtitle: Text('${v.width}×${v.height} · ${v.durationSec}s'),
                trailing: Chip(label: Text(v.category)),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => PlayerScreen(api: widget.api, video: v)),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class PlayerScreen extends StatefulWidget {
  final Api api;
  final VideoItem video;
  const PlayerScreen({super.key, required this.api, required this.video});
  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  VideoPlayerController? _controller;
  String? _status;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    setState(() => _status = 'Starting watermarked session…');
    try {
      final session = await widget.api.play(widget.video.id);
      final url = widget.api.tokenizedPlaylistUrl(session);
      final controller = VideoPlayerController.networkUrl(Uri.parse(url));
      await controller.initialize();
      await controller.play();
      if (!mounted) return;
      setState(() {
        _controller = controller;
        _status = 'Watermark: ${session.watermarkText}';
      });
    } catch (e) {
      setState(() => _status = '$e');
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    return Scaffold(
      appBar: AppBar(title: Text(widget.video.title)),
      body: Column(
        children: [
          if (c != null && c.value.isInitialized)
            AspectRatio(aspectRatio: c.value.aspectRatio, child: VideoPlayer(c))
          else
            const AspectRatio(aspectRatio: 16 / 9, child: Center(child: CircularProgressIndicator())),
          if (_status != null) Padding(padding: const EdgeInsets.all(12), child: Text(_status!)),
        ],
      ),
      floatingActionButton: c == null
          ? null
          : FloatingActionButton(
              onPressed: () => setState(() => c.value.isPlaying ? c.pause() : c.play()),
              child: Icon(c.value.isPlaying ? Icons.pause : Icons.play_arrow),
            ),
    );
  }
}
