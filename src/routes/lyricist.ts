import type { FastifyInstance } from 'fastify'
import { searchYouTube } from '../services/youtube.js'

export async function lyricistRoutes(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>(
    '/data/lyricist/:name',
    async (req, reply) => {
      const tracks = await searchYouTube(req.params.name + ' lyrics songs', 20)
      return reply.send({ data: tracks })
    },
  )
}
