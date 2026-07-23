import type { FastifyInstance } from 'fastify'
import { fetchLyrics } from '../services/lyrics.js'

export async function lyricsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { track?: string; artist?: string } }>(
    '/data/lyrics',
    async (req, reply) => {
      const track = (req.query.track || '').trim()
      const artist = (req.query.artist || '').trim()
      const result = await fetchLyrics(track, artist)
      return reply.send(result)
    },
  )
}
