import type { FastifyInstance } from 'fastify'
import { searchYouTube } from '../services/youtube.js'

export async function playlistRoutes(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>(
    '/data/playlist/:name',
    async (req, reply) => {
      const tracks = await searchYouTube(req.params.name + ' playlist', 20)
      return reply.send({ data: tracks })
    },
  )
}
