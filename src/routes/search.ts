import type { FastifyInstance } from 'fastify'
import { searchYouTube } from '../services/youtube.js'
import type { SearchResult } from '../types.js'

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; limit?: string; type?: string } }>(
    '/data/search',
    async (req, reply) => {
      const query = (req.query.q || '').trim()
      if (!query || query.length < 2) {
        return reply.send({ tracks: [], artists: [] } satisfies SearchResult)
      }

      const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 50)
      const type = req.query.type || 'tracks'

      let searchQuery = query
      if (type === 'artists') searchQuery = query + ' songs'
      else if (type === 'directors') searchQuery = query + ' songs music director'
      else if (type === 'lyricists') searchQuery = query + ' lyrics songs'

      const tracks = await searchYouTube(searchQuery, limit)
      const result: SearchResult = { tracks, artists: [] }

      if (type === 'tracks') {
        const qLower = query.toLowerCase()
        const scored = tracks.map((t) => {
          let score = 0
          const titleLower = t.title.toLowerCase()
          const artistLower = t.artist.toLowerCase()

          if (titleLower === qLower) score += 100
          else if (titleLower.startsWith(qLower)) score += 50
          else if (titleLower.includes(qLower)) score += 30
          if (artistLower.includes(qLower)) score += 40
          if (/cover|karaoke|remix|instrumental|lyrics|lyrical/i.test(titleLower)) score -= 20
          if (/cover|karaoke|remix/i.test(artistLower)) score -= 10
          if (/vevo|official/i.test(artistLower) || /official/i.test(titleLower)) score += 15
          return { track: t, score }
        })
        scored.sort((a, b) => b.score - a.score)
        result.tracks = scored.map((s) => s.track)

        const artistTracks = await searchYouTube(query + ' singer', 5)
        const seen = new Set<string>()
        for (const t of artistTracks) {
          const name = t.artist
          if (!seen.has(name)) {
            seen.add(name)
            result.artists.push({ name, image: t.image || '' })
          }
          if (result.artists.length >= 6) break
        }
      }

      return reply.send(result)
    },
  )
}
