export interface Track {
  id: string
  title: string
  artist: string
  image: string
  streaming_url: string
  duration: number
  album: string
  uploader: { name: string; id: null; image: string }
}

export interface ArtistBrief {
  name: string
  image: string
}

export interface HomeData {
  newReleases: Track[]
  trendingNow: Track[]
  topCharts: Track[]
  moodRomantic: Track[]
  moodParty: Track[]
  moodSad: Track[]
  moodEnergy: Track[]
  topArtists: ArtistBrief[]
  musicDirectors: ArtistBrief[]
  lyricists: ArtistBrief[]
}

export interface SearchResult {
  tracks: Track[]
  artists: ArtistBrief[]
}

export interface ChartResult {
  tracks: Track[]
  albums: never[]
  artists: never[]
  playlists: never[]
}

export interface LyricsResult {
  lyrics: string | null
  synced: string | null
  instrumental: boolean
}
