import axios from 'axios';

export async function fetchLyrics(artist: string, title: string): Promise<string | null> {
  const clean = (s: string) => s.replace(/[\r\n]+/g, '\n').trim();
  try {
    const res = await axios.get('https://lrclib.net/api/search', {
      params: { q: `${artist} ${title}`, p: 1, n: 1 },
      timeout: 5000,
    });
    const results: any[] = res.data;
    if (results && results.length > 0) {
      const lyrics = results[0]?.lyrics || results[0]?.synelyrics || null;
      if (lyrics) return clean(lyrics);
    }
  } catch { }

  try {
    const res = await axios.get('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title), {
      timeout: 5000,
    });
    return res.data.lyrics ? clean(res.data.lyrics) : null;
  } catch {
    return null;
  }
}
