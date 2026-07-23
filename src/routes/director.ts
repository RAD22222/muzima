import type { FastifyInstance } from 'fastify'
import { searchYouTube } from '../services/youtube.js'

export async function directorRoutes(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>(
    '/data/director/:name',
    async (req, reply) => {
      const tracks = await searchYouTube(req.params.name + ' songs music director', 20)
      return reply.send({ data: tracks })
    },
  )
}
