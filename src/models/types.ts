import { AudioResource } from '@discordjs/voice';

export interface EmbyCredentials {
  username: string;
  password: string;
}

export interface EmbyAuthResult {
  AccessToken: string;
  User: { Id: string; Name: string };
  SessionInfo: { Id: string };
}

export interface EmbySearchHint {
  ItemId: string;
  Id: string;
  Name: string;
  Type: string;
  RunTimeTicks?: number;
  PrimaryImageTag?: string;
  AlbumArtist?: string;
  Album?: string;
  Artists?: string[];
  AlbumId?: string;
  ParentId?: string;
  ImageTags?: { Primary?: string };
  ProductionYear?: number;
}

export interface EmbyItem {
  Id: string;
  Name: string;
  Type: string;
  RunTimeTicks?: number;
  AlbumArtist?: string;
  Album?: string;
  Artists?: string[];
  AlbumId?: string;
  ParentId?: string;
  ImageTags?: { Primary?: string };
  ProductionYear?: number;
  MediaSources?: EmbyMediaSource[];
}

export interface EmbyMediaSource {
  Id: string;
  Container: string;
  Path: string;
}

export interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumId: string;
  duration: number;
  imageTag: string | null;
  type: 'audio' | 'album' | 'playlist' | 'artist';
}

export interface QueueItem {
  track: Track;
  requestedBy: string;
}

export interface QueueState {
  items: QueueItem[];
  currentIndex: number;
  connection: AudioPlayerConnection | null;
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
  loopMode: 'none' | 'all' | 'one';
  scrobbleInterval: NodeJS.Timeout | null;
}

export interface AudioPlayerConnection {
  audioPlayer: import('@discordjs/voice').AudioPlayer;
  connection: import('@discordjs/voice').VoiceConnection;
  resource: AudioResource | null;
  startTime: number;
}
