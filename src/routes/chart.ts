import type { FastifyInstance } from 'fastify'
import { searchYouTube } from '../services/youtube.js'
import type { ChartResult, Track } from '../types.js'

export async function chartRoutes(app: FastifyInstance) {
  app.get('/data/chart/:id', async (_req, reply) => {
    try {
      const queries = [
        'bollywood trending songs 2025',
        'viral hindi songs 2025',
        'top bollywood hits',
      ]
      const allTracks: Track[] = []
      for (const q of queries) {
        const tracks = await searchYouTube(q, 15)
        for (const t of tracks) {
          if (!allTracks.some((x) => x.id === t.id)) {
            allTracks.push(t)
          }
        }
      }
      return reply.send({
        tracks: allTracks.slice(0, 30),
        albums: [], artists: [], playlists: [],
      } satisfies ChartResult)
    } catch {
      return reply.send({ tracks: [], albums: [], artists: [], playlists: [] } satisfies ChartResult)
    }
  })

  app.get('/data/chart/:id/tracks', async (_req, reply) => {
    try {
      const queries = [
        'bollywood trending songs 2025',
        'viral hindi songs 2025',
        'top bollywood hits',
      ]
      const allTracks: Track[] = []
      for (const q of queries) {
        const tracks = await searchYouTube(q, 15)
        for (const t of tracks) {
          if (!allTracks.some((x) => x.id === t.id)) {
            allTracks.push(t)
          }
        }
      }
      return reply.send({
        tracks: allTracks.slice(0, 30),
        albums: [], artists: [], playlists: [],
      } satisfies ChartResult)
    } catch {
      return reply.send({ tracks: [], albums: [], artists: [], playlists: [] } satisfies ChartResult)
    }
  })
}
