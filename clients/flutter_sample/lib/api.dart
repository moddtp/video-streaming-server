import 'dart:convert';
import 'package:http/http.dart' as http;

/// Public video metadata from the catalog.
class VideoItem {
  final String id;
  final String title;
  final String category;
  final int durationSec;
  final int width;
  final int height;

  VideoItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        category = j['category'] as String,
        durationSec = (j['durationSec'] as num).round(),
        width = (j['width'] as num?)?.toInt() ?? 0,
        height = (j['height'] as num?)?.toInt() ?? 0;
}

/// Result of starting a playback session.
class PlaySession {
  final String sessionId;
  final String playlistUrl;
  final String sessionToken;
  final String watermarkText;

  PlaySession.fromJson(Map<String, dynamic> j)
      : sessionId = j['sessionId'] as String,
        playlistUrl = j['playlistUrl'] as String,
        sessionToken = j['sessionToken'] as String,
        watermarkText = (j['watermark']?['text'] as String?) ?? '';
}

/// Tiny client for the streaming server's HTTP API.
class Api {
  final String baseUrl;
  String? _accessToken;

  Api(this.baseUrl);

  Uri _u(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> get _authHeaders =>
      {'Authorization': 'Bearer ${_accessToken ?? ''}'};

  Future<String> login(String email, String password) async {
    final res = await http.post(
      _u('/api/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode != 200) {
      throw Exception('Login failed (${res.statusCode})');
    }
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    _accessToken = body['accessToken'] as String;
    return body['email'] as String;
  }

  Future<List<VideoItem>> listVideos() async {
    final res = await http.get(_u('/api/videos'), headers: _authHeaders);
    if (res.statusCode != 200) throw Exception('List failed (${res.statusCode})');
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['videos'] as List)
        .map((v) => VideoItem.fromJson(v as Map<String, dynamic>))
        .toList();
  }

  Future<PlaySession> play(String videoId) async {
    final res = await http.post(_u('/api/videos/$videoId/play'), headers: _authHeaders);
    if (res.statusCode == 503) {
      throw Exception('Server busy — try again shortly');
    }
    if (res.statusCode != 200) throw Exception('Play failed (${res.statusCode})');
    return PlaySession.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// The playlist URL with the session token attached. The server rewrites each
  /// segment URI to carry the same token, so segment requests stay authorized
  /// even though the platform player doesn't forward headers to them.
  String tokenizedPlaylistUrl(PlaySession s) =>
      '$baseUrl${s.playlistUrl}?t=${Uri.encodeQueryComponent(s.sessionToken)}';
}
