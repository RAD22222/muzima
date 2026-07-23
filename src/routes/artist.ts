import type { FastifyInstance } from 'fastify'
import { searchYouTube } from '../services/youtube.js'

export async function artistRoutes(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>(
    '/data/artist/:name',
    async (req, reply) => {
      const tracks = await searchYouTube(req.params.name + ' songs', 20)
      return reply.send({ data: tracks })
    },
  )

  app.get<{ Params: { name: string } }>(
    '/data/artist/:name/top',
    async (req, reply) => {
      const tracks = await searchYouTube(req.params.name + ' songs', 20)
      return reply.send({ data: tracks })
    },
  )
}
