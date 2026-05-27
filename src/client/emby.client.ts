import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { EmbySearchHint, EmbyItem, EmbyAuthResult, Track } from '../models/types';
import { ticksToSeconds } from '../utils/time';

export class EmbyClient {
  private api: AxiosInstance;
  private accessToken = '';
  private userId = '';

  constructor() {
    this.api = axios.create({
      baseURL: config.EMBY_URL,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async authenticate(): Promise<void> {
    try {
      const res = await this.api.post<EmbyAuthResult>('/Users/AuthenticateByName', {
        Username: config.EMBY_USERNAME,
        Pw: config.EMBY_PASSWORD,
      }, {
        headers: {
          'X-Emby-Authorization': `MediaBrowser Client="DiscordEmbyBot", Device="VPS", DeviceId="discord-emby-bot", Version="1.0.0"`,
        },
      });

      this.accessToken = res.data.AccessToken;
      this.userId = res.data.User.Id;

      this.api.defaults.headers.common['X-Emby-Token'] = this.accessToken;

      logger.info(`Authenticated as ${res.data.User.Name} (${this.userId})`);
    } catch (err: any) {
      const detail = err?.response
        ? `Status ${err.response.status}: ${JSON.stringify(err.response.data)}`
        : err?.message || 'Unknown error';
      logger.error(`Emby auth failed (${config.EMBY_URL}): ${detail}`);
      throw new Error(`Failed to authenticate with Emby: ${detail}`);
    }
  }

  getUserId(): string {
    return this.userId;
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  async search(query: string, limit = 10): Promise<EmbySearchHint[]> {
    try {
      let hints: EmbySearchHint[] = [];

      const searchUrl = `/Search/Hints?SearchTerm=${encodeURIComponent(query)}&Limit=${limit}&UserId=${this.userId}&IncludeItemTypes=Audio%2CMusicAlbum%2CMusicArtist%2CPlaylist`;
      logger.debug(`Search: GET ${searchUrl.slice(0, 150)}`);
      const res = await this.api.get(searchUrl);
      const data = res.data;
      logger.debug(`Search: status=${res.status}, keys=${Object.keys(data).join(',')}`);
      const searchHints = data.SearchHints || data.Items || [];

      if (searchHints.length > 0) {
        hints = searchHints;
      } else {
        logger.debug('/Search/Hints empty, fallback to /Items');
        const itemsRes = await this.api.get(`/Users/${this.userId}/Items`, {
          params: {
            SearchTerm: query,
            IncludeItemTypes: 'Audio,MusicAlbum,MusicArtist,Playlist',
            Recursive: true,
            Limit: limit,
            SortBy: 'SortName',
            Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,IsFavorite',
          },
        });
        hints = (itemsRes.data.Items || []).map((item: any) => ({
          ItemId: item.Id,
          Id: item.Id,
          Name: item.Name,
          Type: item.Type,
          RunTimeTicks: item.RunTimeTicks,
          PrimaryImageTag: item.ImageTags?.Primary,
          AlbumArtist: item.AlbumArtist,
          Album: item.Album,
          Artists: item.Artists,
          AlbumId: item.AlbumId,
          ImageTags: item.ImageTags,
          ProductionYear: item.ProductionYear,
          IsFavorite: !!item.IsFavorite,
        }));
        logger.debug(`Items fallback returned ${hints.length} results`);
      }

      const filtered = hints
        .filter((h: any) => h.Type === 'Audio' || h.Type === 'MusicAlbum' || h.Type === 'MusicArtist' || h.Type === 'Playlist')
        .slice(0, limit);

      return filtered;
    } catch (err: any) {
      const detail = err?.response
        ? `Status ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 200)}`
        : err?.message || 'Unknown error';
      logger.error(`Search failed: ${detail}`);
      return [];
    }
  }

  async getItem(itemId: string): Promise<EmbyItem | null> {
    try {
      const res = await this.api.get<EmbyItem>(`/Users/${this.userId}/Items/${itemId}`);
      return res.data;
    } catch {
      return null;
    }
  }

  async getItems(ids: string[]): Promise<EmbyItem[]> {
    if (ids.length === 0) return [];
    try {
      const res = await this.api.get(`/Users/${this.userId}/Items`, {
        params: {
          Ids: ids.join(','),
          Limit: ids.length,
        },
      });
      return res.data.Items || [];
    } catch {
      return [];
    }
  }

  async getAlbumItems(albumId: string): Promise<EmbyItem[]> {
    try {
      const res = await this.api.get(`/Users/${this.userId}/Items`, {
        params: {
          ParentId: albumId,
          IncludeItemTypes: 'Audio',
          Recursive: true,
          SortBy: 'SortName',
        },
      });
      return res.data.Items || [];
    } catch {
      return [];
    }
  }

  async getArtistItems(artistName: string): Promise<EmbyItem[]> {
    try {
      const res = await this.api.get(`/Users/${this.userId}/Items`, {
        params: {
          Artists: artistName,
          IncludeItemTypes: 'Audio',
          Recursive: true,
          Limit: 50,
          SortBy: 'Album,SortName',
        },
      });
      return res.data.Items || [];
    } catch {
      return [];
    }
  }

  async getPlaylistItems(playlistId: string): Promise<EmbyItem[]> {
    try {
      const res = await this.api.get(`/Playlists/${playlistId}/Items`, {
        params: { UserId: this.userId },
      });
      return res.data.Items || [];
    } catch {
      return [];
    }
  }

  async getRandomTracks(count = 10): Promise<EmbyItem[]> {
    try {
      const res = await this.api.get(`/Users/${this.userId}/Items`, {
        params: {
          IncludeItemTypes: 'Audio',
          Recursive: true,
          Limit: 100,
          SortBy: 'Random',
        },
      });
      const items = res.data.Items || [];
      return items.sort(() => Math.random() - 0.5).slice(0, count);
    } catch {
      return [];
    }
  }

  getStreamUrl(itemId: string, seekSeconds = 0): string {
    let url = `${config.EMBY_URL}/Audio/${itemId}/stream?api_key=${this.accessToken}&Static=true`;
    if (seekSeconds > 0) {
      url += `&StartTimeTicks=${seekSeconds * 10_000_000}`;
    }
    return url;
  }

  getTranscodeUrl(itemId: string): string {
    return `${config.EMBY_URL}/Audio/${itemId}/stream?api_key=${this.accessToken}&TranscodeReasons=ContainerBitrateExceedsLimit&AudioCodec=mp3&MaxAudioChannels=2&StartTimeTicks=0&SubtitleMethod=Encode`;
  }

  hintToTrack(hint: EmbySearchHint): Track {
    return {
      id: hint.ItemId || hint.Id,
      name: hint.Name || 'Unknown',
      artist: hint.AlbumArtist || hint.Artists?.[0] || 'Unknown',
      album: hint.Album || '',
      albumId: hint.AlbumId || '',
      duration: ticksToSeconds(hint.RunTimeTicks || 0),
      imageTag: hint.PrimaryImageTag || hint.ImageTags?.Primary || null,
      type: this.mapType(hint.Type),
      isFavorite: !!hint.IsFavorite,
    };
  }

  itemToTrack(item: EmbyItem): Track {
    return {
      id: item.Id,
      name: item.Name || 'Unknown',
      artist: item.AlbumArtist || item.Artists?.[0] || 'Unknown',
      album: item.Album || '',
      albumId: item.AlbumId || '',
      duration: ticksToSeconds(item.RunTimeTicks || 0),
      imageTag: item.ImageTags?.Primary || null,
      type: this.mapType(item.Type),
      playlistItemId: item.PlaylistItemId,
      isFavorite: !!item.IsFavorite,
    };
  }

  private mapType(type: string): Track['type'] {
    switch (type) {
      case 'Audio': return 'audio';
      case 'MusicAlbum': return 'album';
      case 'Playlist': return 'playlist';
      case 'MusicArtist': return 'artist';
      default: return 'audio';
    }
  }

  async reportPlaybackStart(itemId: string, mediaSourceId: string): Promise<void> {
    try {
      await this.api.post('/Sessions/Playing', {
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlayMethod: 'DirectPlay',
        CanSeek: true,
        IsPaused: false,
        IsMuted: false,
        PositionTicks: 0,
        PlaybackRate: 1,
      });
    } catch { }
  }

  async reportPlaybackProgress(itemId: string, mediaSourceId: string, positionTicks: number, isPaused: boolean): Promise<void> {
    try {
      await this.api.post('/Sessions/Playing/Progress', {
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlayMethod: 'DirectPlay',
        CanSeek: true,
        IsPaused: isPaused,
        IsMuted: false,
        PositionTicks: positionTicks,
        PlaybackRate: 1,
      });
    } catch { }
  }

  async reportPlaybackStopped(itemId: string, mediaSourceId: string, positionTicks: number): Promise<void> {
    try {
      await this.api.post('/Sessions/Playing/Stopped', {
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlayMethod: 'DirectPlay',
        PositionTicks: positionTicks,
      });
    } catch { }
  }

  async getImageUrl(itemId: string): Promise<string | null> {
    try {
      await this.api.head(`/Items/${itemId}/Images/Primary`);
      return `${config.EMBY_URL}/Items/${itemId}/Images/Primary?tag=${Date.now()}&quality=90`;
    } catch {
      return null;
    }
  }

  async isFavorite(itemId: string): Promise<boolean> {
    try {
      const res = await this.api.get(`/Users/${this.userId}/Items/${itemId}`);
      const fav = !!res.data.IsFavorite;
      logger.debug(`isFavorite(${itemId})=${fav} (raw=${res.data.IsFavorite})`);
      return fav;
    } catch {
      return false;
    }
  }

  async toggleFavorite(itemId: string, currentFav: boolean): Promise<boolean> {
    // Use local state instead of isFavorite() to avoid Emby eventual consistency issues
    if (currentFav) {
      await this.removeFavorite(itemId);
    } else {
      await this.addFavorite(itemId);
    }
    return !currentFav;
  }

  async addFavorite(itemId: string): Promise<void> {
    try {
      await this.api.post(`/Users/${this.userId}/FavoriteItems/${itemId}`);
    } catch { }
  }

  async removeFavorite(itemId: string): Promise<void> {
    try {
      await this.api.delete(`/Users/${this.userId}/FavoriteItems/${itemId}`);
    } catch { }
  }

  async getFavorites(): Promise<EmbyItem[]> {
    try {
      const res = await this.api.get(`/Users/${this.userId}/Items`, {
        params: {
          Filters: 'IsFavorite',
          IncludeItemTypes: 'Audio',
          Recursive: true,
          Limit: 200,
          SortBy: 'SortName',
        },
      });
      return res.data.Items || [];
    } catch {
      return [];
    }
  }

  async getPlaylists(): Promise<EmbyItem[]> {
    try {
      const res = await this.api.get(`/Users/${this.userId}/Items`, {
        params: {
          IncludeItemTypes: 'Playlist',
          Recursive: true,
          SortBy: 'SortName',
        },
      });
      return res.data.Items || [];
    } catch {
      return [];
    }
  }

  async createPlaylist(name: string): Promise<string | null> {
    try {
      const res = await this.api.post('/Playlists', null, {
        params: { Name: name, UserId: this.userId, MediaType: 'Audio' },
      });
      return res.data.Id || null;
    } catch {
      return null;
    }
  }

  async addToPlaylist(playlistId: string, itemIds: string[]): Promise<void> {
    try {
      await this.api.post(`/Playlists/${playlistId}/Items`, null, {
        params: { Ids: itemIds.join(','), UserId: this.userId },
      });
    } catch { }
  }

  async removeFromPlaylist(playlistId: string, entryIds: string[]): Promise<void> {
    try {
      await this.api.delete(`/Playlists/${playlistId}/Items`, {
        params: { EntryIds: entryIds.join(','), UserId: this.userId },
      });
    } catch { }
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    try {
      await this.api.delete(`/Items/${playlistId}`);
    } catch { }
  }
}

export const embyClient = new EmbyClient();
