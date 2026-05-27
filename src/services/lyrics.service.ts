import axios from 'axios';

interface LyricsResponse {
  lyrics: string;
  error?: string;
}

export async function fetchLyrics(artist: string, title: string): Promise<string | null> {
  try {
    const res = await axios.get<LyricsResponse>('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title), {
      timeout: 5000,
    });
    return res.data.lyrics || null;
  } catch {
    return null;
  }
}
