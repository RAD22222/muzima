import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import { getCachedStream, resolveAudioUrl, pipeAudioStream } from '../services/youtube.js'

export async function streamRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/data/stream/:id',
    async (req, reply) => {
      const { id } = req.params
      if (!id || id.length < 5) {
        return reply.status(400).send({ error: true, message: 'Invalid video ID' })
      }

      // Serve from cache if available
      const cached = getCachedStream(id)
      if (cached) {
        const stat = fs.statSync(cached.filePath)
        const fileSize = stat.size
        const range = req.headers.range

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
          reply.raw.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': cached.mime,
            'Cache-Control': 'max-age=86400',
          })
          fs.createReadStream(cached.filePath, { start, end }).pipe(reply.raw)
          return
        }

        reply.raw.writeHead(200, {
          'Content-Type': cached.mime,
          'Content-Length': fileSize,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'max-age=86400',
        })
        fs.createReadStream(cached.filePath).pipe(reply.raw)
        return
      }

      // Resolve audio URL and proxy
      const audioUrl = await resolveAudioUrl(id)
      if (!audioUrl) {
        return reply.status(502).send({ error: true, message: 'Stream unavailable. Try setting COOKIES_FILE (see /cookies-guide).' })
      }

      const range = req.headers.range as string | undefined
      pipeAudioStream(audioUrl, id, range, reply)
    },
  )
}
