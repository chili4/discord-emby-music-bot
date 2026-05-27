import { embyClient } from '../client/emby.client';
import { Track } from '../models/types';
import { logger } from '../utils/logger';

export interface SearchResult {
  tracks: Track[];
  type: 'single' | 'album' | 'artist' | 'playlist' | 'list';
}

export async function searchAndResolve(query: string, type?: number): Promise<SearchResult> {
  const hints = await embyClient.search(query, 25);
  if (hints.length === 0) return { tracks: [], type: 'list' };

  const targetType = resolveType(type);
  const filtered = targetType
    ? hints.filter(h => h.Type === targetType)
    : hints;

  if (filtered.length === 0) return { tracks: [], type: 'list' };

  const first = filtered[0];
  const firstTrack = embyClient.hintToTrack(first);

  if (first.Type === 'MusicAlbum' || first.Type === 'Playlist' || filtered.length <= 1 && !targetType) {
    if (first.Type === 'MusicAlbum') {
      const items = await embyClient.getAlbumItems(first.ItemId || first.Id);
      return { tracks: items.map(i => embyClient.itemToTrack(i)), type: 'album' };
    }
    if (first.Type === 'Playlist') {
      const items = await embyClient.getPlaylistItems(first.ItemId || first.Id);
      return { tracks: items.map(i => embyClient.itemToTrack(i)), type: 'playlist' };
    }
  }

  if (first.Type === 'MusicArtist') {
    const items = await embyClient.getArtistItems(first.Name);
    return { tracks: items.map(i => embyClient.itemToTrack(i)), type: 'artist' };
  }

  return { tracks: filtered.map(h => embyClient.hintToTrack(h)), type: 'list' };
}

export async function searchAutocomplete(query: string, type?: number): Promise<{ name: string; value: string }[]> {
  if (!query || query.length < 2) return [];

  const targetType = resolveType(type);
  const hints = await embyClient.search(query, 10);
  const filtered = targetType ? hints.filter(h => h.Type === targetType) : hints;

  return filtered.slice(0, 10).map(h => ({
    name: h.Name.length > 90 ? h.Name.slice(0, 87) + '...' : h.Name,
    value: h.Name.length > 90 ? h.Name.slice(0, 90) : h.Name,
  }));
}

function resolveType(type?: number): string | null {
  if (type === undefined) return null;
  switch (type) {
    case 0: return 'Audio';
    case 1: return 'MusicAlbum';
    case 2: return 'Playlist';
    case 4: return 'MusicArtist';
    default: return null;
  }
}
