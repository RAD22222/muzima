import ytsr from 'ytsr'
import ytdl from '@distube/ytdl-core'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import https from 'node:https'
import http from 'node:http'
import { CACHE_DIR, COOKIES_FILE, SEARCH_CACHE_TTL } from '../config.js'
import type { Track } from '../types.js'

const searchCache = new Map<string, { data: Track[]; ts: number }>()

let ytdlAgent: ytdl.Agent | undefined

function initAgent() {
  if (ytdlAgent !== undefined) return
  if (COOKIES_FILE && fs.existsSync(COOKIES_FILE)) {
    try {
      const content = fs.readFileSync(COOKIES_FILE, 'utf-8')
      const cookies: ytdl.Cookie[] = []
      for (const line of content.split('\n')) {
        const parts = line.trim().split('\t')
        if (parts.length >= 7) {
          cookies.push({
            name: parts[5],
            value: parts[6],
            domain: parts[0],
            path: parts[2],
            secure: parts[3] === 'TRUE',
            httpOnly: parts[4] === 'TRUE',
          })
        }
      }
      if (cookies.length > 0) ytdlAgent = ytdl.createAgent(cookies)
    } catch { /* ignore */ }
  }
  if (!ytdlAgent) ytdlAgent = null as unknown as ytdl.Agent
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function parseDuration(d: string): number {
  const parts = d.split(':').map(Number)
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

function trackFromYtsrResult(item: ytsr.Item, baseUrl: string): Track | null {
  if (item.type !== 'video') return null
  const v = item as ytsr.Video
  if (!v.id) return null
  const artist = v.author?.name || 'Unknown'
  const thumbs = v.bestThumbnail?.url || ''
  const duration = v.duration ? parseDuration(v.duration) : 0
  return {
    id: v.id,
    title: v.title || 'Unknown',
    artist,
    image: thumbs,
    streaming_url: baseUrl + v.id,
    duration,
    album: '',
    uploader: { name: artist, id: null, image: '' },
  }
}

export async function searchYouTube(query: string, limit = 20): Promise<Track[]> {
  const cacheKey = crypto.createHash('md5').update(query.toLowerCase()).digest('hex')
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) {
    return cached.data
  }

  const baseUrl = '/data/stream/'

  try {
    const result = await ytsr(query, { limit, safeSearch: false })
    const tracks: Track[] = []
    for (const item of result.items) {
      const track = trackFromYtsrResult(item, baseUrl)
      if (track) tracks.push(track)
      if (tracks.length >= limit) break
    }

    searchCache.set(cacheKey, { data: tracks, ts: Date.now() })
    if (searchCache.size > 500) {
      const firstKey = searchCache.keys().next().value
      if (firstKey) searchCache.delete(firstKey)
    }
    return tracks
  } catch {
    return []
  }
}

export function getCachedStream(videoId: string): { filePath: string; ext: string; mime: string } | null {
  const dir = path.join(CACHE_DIR, videoId)
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  const mimeMap: Record<string, string> = {
    '.webm': 'audio/webm',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.opus': 'audio/ogg',
  }
  for (const f of files) {
    const ext = path.extname(f)
    if (mimeMap[ext]) {
      return { filePath: path.join(dir, f), ext, mime: mimeMap[ext] }
    }
  }
  return null
}

export async function resolveAudioUrl(videoId: string): Promise<string | null> {
  initAgent()
  try {
    const options: ytdl.getInfoOptions = {
      agent: ytdlAgent || undefined,
      requestOptions: {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' },
      },
    }
    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=' + videoId, options)
    const format = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio', filter: 'audioonly' })
    return format?.url || null
  } catch (e) {
    console.error('resolveAudioUrl error for ' + videoId + ': ' + (e instanceof Error ? e.message : String(e)))
    return null
  }
}

export function pipeAudioStream(
  audioUrl: string,
  videoId: string,
  range: string | undefined,
  reply: any,
) {
  const urlObj = new URL(audioUrl)
  const mod = urlObj.protocol === 'https:' ? https : http

  const opts: http.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: { 'User-Agent': UA },
  }
  if (range) opts.headers = { ...opts.headers, Range: range }

  const proxyReq = mod.request(opts, (proxyRes) => {
    const status = range && proxyRes.statusCode === 206 ? 206 : 200
    const headers: Record<string, string> = {
      'Content-Type': proxyRes.headers['content-type'] || 'audio/webm',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    }
    if (proxyRes.headers['content-range']) headers['Content-Range'] = proxyRes.headers['content-range'] as string
    if (proxyRes.headers['content-length']) headers['Content-Length'] = proxyRes.headers['content-length'] as string

    reply.raw.writeHead(status, headers)

    // Cache to disk
    const cacheDir = path.join(CACHE_DIR, videoId)
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
    const isMp4 = (proxyRes.headers['content-type'] || '').includes('mp4')
    const cachePath = path.join(cacheDir, 'audio' + (isMp4 ? '.m4a' : '.webm'))
    const fileStream = fs.createWriteStream(cachePath)
    proxyRes.pipe(fileStream)
    proxyRes.pipe(reply.raw)
  })

  proxyReq.on('error', (err) => {
    console.error('proxy error for ' + videoId + ': ' + err.message)
    if (!reply.raw.headersSent) {
      reply.raw.writeHead(502, { 'Content-Type': 'application/json' })
      reply.raw.end(JSON.stringify({ error: true, message: 'Stream unavailable' }))
    }
  })

  proxyReq.end()
}
