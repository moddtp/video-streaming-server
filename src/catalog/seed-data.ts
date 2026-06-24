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
  { id: 'vid_drama_001', title: 'Sample Drama', category: 'Drama', sourceFile: 'sample-drama.mp4' },
  { id: 'vid_doc_001', title: 'Sample Documentary', category: 'Documentary', sourceFile: 'sample-doc.mp4' },
  { id: 'vid_mv_001', title: 'Sample Music Video', category: 'Music Video', sourceFile: 'sample-mv.mp4' },
];
