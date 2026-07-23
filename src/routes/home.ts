import type { FastifyInstance } from 'fastify'
import { searchYouTube } from '../services/youtube.js'
import { POPULAR_SINGERS, MUSIC_DIRECTORS, LYRICISTS } from '../config.js'
import type { HomeData } from '../types.js'

export async function homeRoutes(app: FastifyInstance) {
  app.get('/data/home', async (_req, reply) => {
    try {
      const queries = [
        searchYouTube('latest bollywood songs 2026', 10),
        searchYouTube('trending hindi songs today', 10),
        searchYouTube('top bollywood hits 2026', 10),
        searchYouTube('romantic hindi songs 2026', 10),
        searchYouTube('party bollywood songs 2026', 10),
        searchYouTube('sad hindi songs 2026', 10),
        searchYouTube('bollywood dance workout songs', 10),
      ]
      const results = await Promise.all(queries)

      return reply.send({
        newReleases: results[0],
        trendingNow: results[1],
        topCharts: results[2],
        moodRomantic: results[3],
        moodParty: results[4],
        moodSad: results[5],
        moodEnergy: results[6],
        topArtists: POPULAR_SINGERS.map((name) => ({ name, image: '' })),
        musicDirectors: MUSIC_DIRECTORS.map((name) => ({ name, image: '' })),
        lyricists: LYRICISTS.map((name) => ({ name, image: '' })),
      } satisfies HomeData)
    } catch {
      return reply.send({
        newReleases: [], trendingNow: [], topCharts: [],
        moodRomantic: [], moodParty: [], moodSad: [], moodEnergy: [],
        topArtists: [], musicDirectors: [], lyricists: [],
      } satisfies HomeData)
    }
  })
}
