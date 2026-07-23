import type { FastifyInstance } from 'fastify'
import { searchYouTube } from '../services/youtube.js'

export async function trackRoutes(app: FastifyInstance) {
  app.get<{ Params: { query: string } }>(
    '/data/track/:query',
    async (req, reply) => {
      const tracks = await searchYouTube(req.params.query, 5)
      return reply.send({ tracks, artists: [] })
    },
  )
}
