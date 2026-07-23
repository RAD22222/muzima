import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fs from 'node:fs'
import path from 'node:path'
import { PORT, ROOT, CACHE_DIR, RATE_LIMIT_MAX } from './config.js'
import { homeRoutes } from './routes/home.js'
import { searchRoutes } from './routes/search.js'
import { streamRoutes } from './routes/stream.js'
import { lyricsRoutes } from './routes/lyrics.js'
import { chartRoutes } from './routes/chart.js'
import { artistRoutes } from './routes/artist.js'
import { directorRoutes } from './routes/director.js'
import { lyricistRoutes } from './routes/lyricist.js'
import { trackRoutes } from './routes/track.js'
import { albumRoutes } from './routes/album.js'
import { playlistRoutes } from './routes/playlist.js'

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

const app = Fastify({ logger: false })

await app.register(cors, { origin: true })
await app.register(rateLimit, { max: RATE_LIMIT_MAX, timeWindow: '1 minute' })

app.get('/health', async (_req, reply) => reply.type('text/plain').send('OK'))

app.get('/cookies-guide', async (_req, reply) => {
  return reply.type('text/html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cookies Guide - Muzima</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,sans-serif;max-width:600px;margin:40px auto;padding:0 20px;line-height:1.6}h1{color:#e91e63}code{background:#f5f5f5;padding:2px 6px;border-radius:4px;font-size:.9em}ol li{margin:8px 0}</style></head><body>
<h1>Bypass YouTube Bot Detection</h1>
<p>YouTube blocks cloud IPs. Fix by providing browser cookies:</p>
<ol>
<li>Install <a href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc">Get cookies.txt LOCALLY</a> (Chrome) or <a href="https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/">cookies.txt</a> (Firefox)</li>
<li>Go to <strong>youtube.com</strong> and make sure you're logged in</li>
<li>Click the extension icon and export cookies as <strong>Netscape format</strong></li>
<li>Add env var <code>COOKIES_FILE</code> pointing to your cookies.txt file</li>
<li>Redeploy the service</li>
</ol>
<p>Without cookies: stream may fail if YouTube blocks the request.</p>
</body></html>`)
})

// API routes registered BEFORE static to take precedence
await app.register(homeRoutes)
await app.register(searchRoutes)
await app.register(streamRoutes)
await app.register(lyricsRoutes)
await app.register(chartRoutes)
await app.register(artistRoutes)
await app.register(directorRoutes)
await app.register(lyricistRoutes)
await app.register(trackRoutes)
await app.register(albumRoutes)
await app.register(playlistRoutes)

// Serve static files (html, css, js) — only for non-data paths
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

app.get('/*', async (req, reply) => {
  const p = (req as any).params['*'] || ''
  // Don't intercept API routes
  if (p.startsWith('data/') || p === 'data') return reply.callNotFound()

  const filePath = p
    ? path.join(ROOT, p)
    : path.join(ROOT, 'index.html')

  if (!fs.existsSync(filePath)) return reply.callNotFound()

  const ext = path.extname(filePath).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  const content = fs.readFileSync(filePath)
  return reply.type(mime).send(content)
})

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`muzima → http://localhost:${PORT}`)
} catch (err) {
  console.error(err)
  process.exit(1)
}
