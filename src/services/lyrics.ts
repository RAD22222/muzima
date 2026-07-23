import type { LyricsResult } from '../types.js'

export async function fetchLyrics(track: string, artist: string): Promise<LyricsResult> {
  if (!track) return { lyrics: null, synced: null, instrumental: false }

  try {
    const params = new URLSearchParams({ track_name: track })
    if (artist) params.set('artist_name', artist)

    const response = await fetch('https://lrclib.net/api/get?' + params.toString(), {
      headers: { 'User-Agent': 'Muzima/2.0' },
    })

    if (response.ok) {
      const data = await response.json() as Record<string, unknown>
      return {
        lyrics: (data.plainLyrics as string) || null,
        synced: (data.syncedLyrics as string) || null,
        instrumental: Boolean(data.instrumental),
      }
    }

    const searchRes = await fetch(
      'https://lrclib.net/api/search?q=' + encodeURIComponent(track + ' ' + (artist || '')),
      { headers: { 'User-Agent': 'Muzima/2.0' } },
    )
    if (searchRes.ok) {
      const results = await searchRes.json() as Record<string, unknown>[]
      if (results.length > 0) {
        const best = results[0]
        return {
          lyrics: (best.plainLyrics as string) || null,
          synced: (best.syncedLyrics as string) || null,
          instrumental: Boolean(best.instrumental),
        }
      }
    }

    return { lyrics: null, synced: null, instrumental: false }
  } catch {
    return { lyrics: null, synced: null, instrumental: false }
  }
}
