/**
 * Sample catalog entries. `sourceFile` is relative to MEDIA_DIR and is created
 * by `npm run make-media`. Duration/resolution are filled in at seed time by
 * probing the real file, so they are intentionally absent here.
 */
export interface VideoSeed {
  id: string;
  title: string;
  category: string;
  sourceFile: string;
}

export const VIDEO_SEEDS: VideoSeed[] = [
  // Local generated samples (transcoded with the watermark from media/).
  { id: 'vid_drama_001', title: 'Sample Drama', category: 'Drama', sourceFile: 'sample-drama.mp4' },
  { id: 'vid_doc_001', title: 'Sample Documentary', category: 'Documentary', sourceFile: 'sample-doc.mp4' },
  { id: 'vid_mv_001', title: 'Sample Music Video', category: 'Music Video', sourceFile: 'sample-mv.mp4' },

  // External public test streams (re-encoded with the watermark on the fly).
  // `sourceFile` is an http(s) M3U8 URL; these are probed at play time, not at
  // seed time. Free streams come and go — availability is not guaranteed, and
  // they only work where the server has direct internet (e.g. your machine).
  { id: 'ext_bipbop', title: 'Apple BipBop (external)', category: 'Demo', sourceFile: 'https://devimages.apple.com.edgekey.net/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8' },
  { id: 'ext_sintel', title: 'Sintel (external)', category: 'Animation', sourceFile: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
  { id: 'ext_mux', title: 'Mux Test Stream (external)', category: 'Demo', sourceFile: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'ext_fitfest', title: 'FitFest Sample (external)', category: 'Fitness', sourceFile: 'https://diceyk6a7voy4.cloudfront.net/e78752a1-2e83-43fa-85ae-3d508be29366/hls/fitfest-sample-1_Ott_Hls_Ts_Avc_Aac_16x9_1280x720p_30Hz_6.0Mbps_qvbr.m3u8' },
  { id: 'ext_multires', title: 'Multi-resolution Sample (external)', category: 'Demo', sourceFile: 'https://d1gnaphp93fop2.cloudfront.net/videos/multiresolution/rendition_new10.m3u8' },
];
