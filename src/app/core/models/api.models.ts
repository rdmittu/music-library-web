export interface User {
  userId: string;
  role: 'admin' | 'contributor' | 'viewer';
}

export interface AuthResponse {
  accessToken: string;
  userId: string;
  role: string;
}

export type ArtistType = 'person' | 'group';

export interface ArtistMember {
  id: string;
  member_id: string;
  name: string;
  artist_type: ArtistType;
  role_label: string | null;
  instruments: string[];
  years_start: number | null;
  years_end: number | null;
  notes?: string | null;
}

export interface Artist {
  id: string;
  name: string;
  artist_type: ArtistType;
  instruments: string[];
  bio?: string | null;
  image_url?: string | null;
  members?: ArtistMember[];
  created_at: string;
}

export interface Genre {
  id: string;
  name: string;
  color_hex: string;
  parent_id: string | null;
  parent_name?: string | null;
  children?: Genre[];
}

export interface AlbumArtist {
  id: string;
  name: string;
  artist_type: ArtistType;
  billing_order: number;
}

export interface AlbumGenre extends Genre {
  is_primary: boolean;
}

export type CreditRole = 'featured' | 'session' | 'composer' | 'lyricist' | 'producer' | 'arranger' | 'other';

export interface AlbumCredit {
  id: string;
  artist_id: string;
  name: string;
  artist_type: ArtistType;
  role: CreditRole;
  instruments: string[];
  notes: string | null;
  billing_order: number;
}

export type AlbumType = 'studio' | 'live' | 'compilation' | 'ep';

export interface Album {
  id: string;
  title: string;
  album_type: AlbumType;
  release_date: string | null;
  recorded_start: string | null;
  recorded_end: string | null;
  cover_art_file_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  artists: AlbumArtist[];
  genres: AlbumGenre[];
  credits: AlbumCredit[];
  tracks?: Track[];
  member_names?: string;
}

export interface TrackCredit {
  id: string;
  track_id: string;
  artist_id: string;
  name: string;
  artist_type: string;
  role: CreditRole;
  instruments: string[];
  notes: string | null;
  billing_order: number;
}

export interface TrackFile {
  file_id: string;
  format: string;
  is_browser_streamable: boolean;
  size_bytes: number | null;
}

export interface Track {
  id: string;
  album_id: string;
  title: string;
  duration_seconds: number | null;
  track_number: number | null;
  disc_number: number;
  /** Primary playback file (browser-streamable preferred). */
  file_id: string | null;
  format?: string;
  is_browser_streamable?: boolean;
  /** All audio files attached to this track (ALAC, AAC, etc.). */
  files?: TrackFile[];
  created_at: string;
  credits?: TrackCredit[];
  // Denormalized for player display
  album_title?: string;
  artist_names?: string;
  cover_art_file_id?: string | null;
  s3_key?: string | null;
  streaming_base_url?: string | null;
}

export type EdgeType = 'artist_continuity' | 'cover' | 'influence' | 'sample' | 'collaboration' | 'other';

export interface Edge {
  id: string;
  source_album_id: string;
  target_album_id: string;
  source_title?: string;
  target_title?: string;
  type: EdgeType;
  label: string | null;
  notes: string | null;
  is_auto: boolean;
  created_at: string;
}

export interface MusicFile {
  id: string;
  original_filename: string;
  format: string;
  size_bytes: number;
  is_browser_streamable: boolean;
  created_at: string;
}

// DAG types
export interface DagNode {
  albumId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  album: Album;
}

export interface DagEdge {
  id: string;
  type: EdgeType;
  label: string | null;
  notes: string | null;
  is_auto: boolean;
  sourceAlbumId: string;
  targetAlbumId: string;
  path: string;
}

export interface GenreLane {
  id: string;
  name: string;
  color_hex: string;
  laneY: number;
  laneHeight: number;
}

export interface DagLayout {
  nodes: DagNode[];
  edges: DagEdge[];
  genres: GenreLane[];
  canvasBounds: { width: number; height: number };
  timeRange: { minDate: string | null; maxDate: string | null };
}

export interface StreamingServer {
  id: string;
  name: string;
  base_url: string;
  owner_id: string;
  created_at: string;
}

export interface IngestItem {
  id: string;
  file_id: string;
  original_filename: string;
  tag_title: string | null;
  tag_artist: string | null;
  tag_album: string | null;
  tag_album_artist: string | null;
  tag_track_num: number | null;
  tag_disc_num: number;
  tag_year: number | null;
  tag_genre: string | null;
  tag_duration_sec: number | null;
  status: 'pending' | 'matched' | 'rejected';
  created_at: string;
  matched_album_id: string | null;
}

// Instrument suggestions for the UI
export const COMMON_INSTRUMENTS = [
  'Vocals', 'Guitar', 'Bass Guitar', 'Electric Guitar', 'Acoustic Guitar',
  'Piano', 'Keyboards', 'Synthesizer', 'Organ',
  'Drums', 'Percussion', 'Drum Machine',
  'Trumpet', 'Trombone', 'Saxophone', 'Flute', 'Clarinet', 'French Horn',
  'Violin', 'Viola', 'Cello', 'Double Bass',
  'Harp', 'Banjo', 'Mandolin', 'Ukulele',
  'Turntables', 'Sampler', 'Beatbox',
] as const;

export const CREDIT_ROLE_LABELS: Record<CreditRole, string> = {
  featured:    'Featured Artist',
  session:     'Session Musician',
  composer:    'Composer',
  lyricist:    'Lyricist',
  producer:    'Producer',
  arranger:    'Arranger',
  other:       'Other',
};
