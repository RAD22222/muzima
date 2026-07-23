import type { FastifyInstance } from 'fastify'
import { searchYouTube } from '../services/youtube.js'

export async function albumRoutes(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>(
    '/data/album/:name',
    async (req, reply) => {
      const tracks = await searchYouTube(req.params.name + ' songs', 20)
      return reply.send({ data: tracks })
    },
  )
}
