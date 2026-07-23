import ytsr from 'ytsr'
import ytdl from '@distube/ytdl-core'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import https from 'node:https'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { CACHE_DIR, COOKIES_FILE, ROOT, SEARCH_CACHE_TTL } from '../config.js'
import type { Track } from '../types.js'

const searchCache = new Map<string, { data: Track[]; ts: number }>()

const YT_DLP_PATH = path.join(ROOT, 'yt-dlp')
let ytDlpReady = false

async function ensureYtDlp(): Promise<boolean> {
  if (ytDlpReady) return true
  if (fs.existsSync(YT_DLP_PATH)) {
    ytDlpReady = true
    return true
  }
  try {
    console.log('downloading yt-dlp...')
    const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(YT_DLP_PATH, buffer)
    fs.chmodSync(YT_DLP_PATH, 0o755)
    ytDlpReady = true
    console.log('yt-dlp downloaded (' + buffer.length + ' bytes)')
    return true
  } catch (e) {
    console.error('yt-dlp download failed: ' + (e instanceof Error ? e.message : String(e)))
    return false
  }
}

// Start download in background
ensureYtDlp()

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

async function resolveViaYtDlp(videoId: string): Promise<string | null> {
  if (!fs.existsSync(YT_DLP_PATH)) return null
  try {
    const audioUrl = await new Promise<string>((resolve, reject) => {
      const args = [
        '-g', '-f', 'bestaudio', '--no-warnings',
        '--extractor-args', 'youtube:player_client=android',
      ]
      const cookiesFile = process.env.COOKIES_FILE
      if (cookiesFile && fs.existsSync(cookiesFile)) {
        args.push('--cookies', cookiesFile)
      }
      args.push('https://www.youtube.com/watch?v=' + videoId)
      const proc = spawn(YT_DLP_PATH, args, { timeout: 60000 })
      let stdout = '', stderr = ''
      proc.stdout.on('data', (d: Buffer) => stdout += d.toString())
      proc.stderr.on('data', (d: Buffer) => stderr += d.toString())
      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) resolve(stdout.trim())
        else reject(new Error('code=' + code + ' ' + (stderr || '').trim().substring(0, 200)))
      })
      proc.on('error', reject)
    })
    if (audioUrl && audioUrl.startsWith('http')) return audioUrl
    return null
  } catch (e) {
    console.error('yt-dlp error for ' + videoId + ': ' + (e instanceof Error ? e.message : String(e)))
    return null
  }
}

async function resolveViaYtdlCore(videoId: string): Promise<string | null> {
  try {
    let agent: ytdl.Agent | undefined
    if (COOKIES_FILE && fs.existsSync(COOKIES_FILE)) {
      const content = fs.readFileSync(COOKIES_FILE, 'utf-8')
      const cookies: ytdl.Cookie[] = []
      for (const line of content.split('\n')) {
        const parts = line.trim().split('\t')
        if (parts.length >= 7) {
          cookies.push({
            name: parts[5], value: parts[6],
            domain: parts[0], path: parts[2],
            secure: parts[3] === 'TRUE',
            httpOnly: parts[4] === 'TRUE',
          })
        }
      }
      if (cookies.length > 0) agent = ytdl.createAgent(cookies)
    }
    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=' + videoId, {
      agent,
      requestOptions: { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' } },
    })
    const format = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio', filter: 'audioonly' })
    return format?.url || null
  } catch {
    return null
  }
}

export async function resolveAudioUrl(videoId: string): Promise<string | null> {
  // Try yt-dlp first (more reliable on cloud IPs)
  const fromYtDlp = await resolveViaYtDlp(videoId)
  if (fromYtDlp) return fromYtDlp

  // Fallback to ytdl-core
  return resolveViaYtdlCore(videoId)
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
