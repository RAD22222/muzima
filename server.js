const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const { spawn } = require('child_process')

const PORT = process.env.PORT || 5500
const ROOT = __dirname
const CACHE_DIR = process.env.CACHE_DIR || path.join(os.tmpdir(), 'muzima-cache')
const SEARCH_CACHE_TTL = 30 * 60 * 1000
const ALLOWED_ORIGINS = [
  'localhost:5500', '127.0.0.1:5500', '::1:5500',
  'muzima-de13.onbelmo.uk', '.onbelmo.uk',
  '.belmo.uk', 'localhost', '127.0.0.1',
]
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 30
const ACCESS_LOG = path.join(ROOT, 'access.log')

const POPULAR_SINGERS = [
  'Arijit Singh', 'Neha Kakkar', 'Atif Aslam', 'Shreya Ghoshal',
  'Kumar Sanu', 'Udit Narayan', 'Alka Yagnik', 'Sonu Nigam',
  'KK', 'Lata Mangeshkar', 'Sukhwinder Singh', 'Sunidhi Chauhan',
  'Mohit Chauhan', 'Jubin Nautiyal', 'Darshan Raval', 'B Praak',
  'Himesh Reshammiya', 'Shaan', 'Kailash Kher', 'Badshah'
]

const MUSIC_DIRECTORS = [
  'AR Rahman', 'Vishal-Shekhar', 'Pritam', 'Shankar-Ehsaan-Loy',
  'Laxmikant-Pyarelal', 'RD Burman', 'SD Burman', 'Anu Malik',
  'Himesh Reshammiya', 'Amit Trivedi', 'Sachin-Jigar', 'Mithoon',
  'Tanishk Bagchi', 'Amaal Mallik', 'Jatin-Lal'
]

const LYRICISTS = [
  'Gulzar', 'Javed Akhtar', 'Irshad Kamil', 'Amitabh Bhattacharya',
  'Sameer', 'Prasoon Joshi', 'Manoj Muntashir', 'Anand Bakshi',
  'Swanand Kirkire'
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
}

const searchCache = new Map()
const rateLimit = new Map()

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

const YT_DLP_PATH = path.join(ROOT, 'yt-dlp')
async function ensureYtDlp () {
  if (fs.existsSync(YT_DLP_PATH)) {
    const stat = fs.statSync(YT_DLP_PATH)
    console.log('yt-dlp exists size=' + stat.size + ' mode=' + stat.mode.toString(8))
    return true
  }
  console.log('yt-dlp not found at ' + YT_DLP_PATH + ', downloading...')
  try {
    const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(YT_DLP_PATH, buffer)
    fs.chmodSync(YT_DLP_PATH, 0o755)
    console.log('yt-dlp downloaded ' + buffer.length + ' bytes')
    return true
  } catch (e) {
    console.log('yt-dlp download failed: ' + e.message)
    return false
  }
}
async function testYtDlp () {
  try {
    const version = await new Promise((resolve, reject) => {
      const proc = spawn(YT_DLP_PATH, ['--version'], { timeout: 10000 })
      let out = ''
      proc.stdout.on('data', d => out += d)
      proc.on('close', code => {
        if (code === 0) resolve(out.trim())
        else reject(new Error('exit code ' + code))
      })
      proc.on('error', reject)
    })
    console.log('yt-dlp version: ' + version)
  } catch (e) {
    console.log('yt-dlp test failed: ' + e.message)
  }
}
ensureYtDlp().then(testYtDlp)



function log (msg) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}\n`
  console.log(line.trim())
  fs.appendFile(ACCESS_LOG, line, () => {})
}

function getClientIp (req) {
  const forwarded = req.headers['x-forwarded-for']
  return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress
}

function isAllowedOrigin (req) {
  const origin = req.headers['origin'] || ''
  const referer = req.headers['referer'] || ''
  const host = req.headers['host'] || ''
  const source = origin || referer
  const check = (val) => ALLOWED_ORIGINS.some(o => {
    const h = o.split(':')[0]
    return val === h || val.endsWith('.' + h)
  })
  if (!source) {
    return check(host.split(':')[0])
  }
  try {
    return check(new URL(source).hostname)
  } catch {
    return false
  }
}

function hasBrowserUA (req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase()
  if (!ua) return false
  if (/curl|wget|python|go-http|java|ruby|php|axios|node/i.test(ua)) return false
  return true
}

function checkRateLimit (ip) {
  const now = Date.now()
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, [])
  }
  const hits = rateLimit.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW)
  if (hits.length >= RATE_LIMIT_MAX) return false
  hits.push(now)
  rateLimit.set(ip, hits)
  return true
}

function serveStatic (res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = MIME[ext] || 'application/octet-stream'
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(data)
  })
}

function sendJSON (res, data, status) {
  status = status || 200
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(data))
}

function sendError (res, status, msg) {
  sendJSON(res, { error: true, message: msg }, status)
}

function getAudioCachePath (videoId) {
  return path.join(CACHE_DIR, videoId)
}

function isAudioCached (videoId) {
  const dir = getAudioCachePath(videoId)
  if (!fs.existsSync(dir)) return false
  try {
    const files = fs.readdirSync(dir)
    return files.some(f => f.endsWith('.webm') || f.endsWith('.m4a') || f.endsWith('.mp3'))
  } catch { return false }
}

function getCachedAudioFile (videoId) {
  const dir = getAudioCachePath(videoId)
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  for (const f of files) {
    if (f.endsWith('.webm') || f.endsWith('.m4a') || f.endsWith('.mp3')) {
      const fp = path.join(dir, f)
      return { file: fp, ext: path.extname(f) }
    }
  }
  return null
}

const mimeForExt = {
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.opus': 'audio/ogg',
}

async function searchYouTube (query, limit) {
  limit = limit || 20
  const cacheKey = crypto.createHash('md5').update(query.toLowerCase()).digest('hex')
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) {
    return cached.data
  }

  try {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query)
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US;q=0.9',
      }
    })
    const html = await res.text()

    const match = html.match(/ytInitialData\s*=\s*({.+?});\s*<\/script>/)
    if (!match) throw new Error('Could not extract ytInitialData')

    const data = JSON.parse(match[1])
    const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []

    const tracks = []
    for (const section of sections) {
      const items = section.itemSectionRenderer?.contents || []
      for (const item of items) {
        const video = item.videoRenderer
        if (!video || !video.videoId) continue

        const artist = video.ownerText?.runs?.[0]?.text
          || video.shortBylineText?.runs?.[0]?.text || 'Unknown'
        const thumbs = video.thumbnail?.thumbnails || []
        const image = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : ''

        let duration = 0
        if (video.lengthSeconds) {
          duration = parseInt(video.lengthSeconds)
        } else if (video.lengthText?.simpleText) {
          const parts = video.lengthText.simpleText.split(':').map(Number)
          duration = parts.reduce((acc, p) => acc * 60 + p, 0)
        }

        tracks.push({
          id: video.videoId,
          title: video.title?.runs?.[0]?.text || 'Unknown',
          artist,
          image,
          streaming_url: '/data/stream/' + video.videoId,
          duration,
          album: '',
          uploader: { name: artist, id: null, image: '' }
        })
        if (tracks.length >= limit) break
      }
      if (tracks.length >= limit) break
    }

    searchCache.set(cacheKey, { data: tracks, ts: Date.now() })
    if (searchCache.size > 500) {
      const firstKey = searchCache.keys().next().value
      searchCache.delete(firstKey)
    }
    return tracks
  } catch (e) {
    log('Search error for "' + query + '": ' + e.message + ' (stack: ' + e.stack?.split('\n')[0] + ')')
    return []
  }
}



async function handleSearch (req, res, parsed) {
  const query = (parsed.query.q || '').trim()
  if (!query || query.length < 2) {
    return sendJSON(res, { tracks: [], artists: [] })
  }
  const limit = parseInt(parsed.query.limit) || 30
  const type = parsed.query.type || 'tracks'

  if (type === 'artists') {
    const tracks = await searchYouTube(query + ' songs', limit)
    return sendJSON(res, { tracks, artists: [] })
  }

  if (type === 'directors') {
    const tracks = await searchYouTube(query + ' songs music director', limit)
    return sendJSON(res, { tracks, artists: [] })
  }

  if (type === 'lyricists') {
    const tracks = await searchYouTube(query + ' lyrics songs', limit)
    return sendJSON(res, { tracks, artists: [] })
  }

  // Default track search with original-first ranking
  const tracks = await searchYouTube(query, limit)
  const qLower = query.toLowerCase()
  const scored = tracks.map(t => {
    let score = 0
    const titleLower = t.title.toLowerCase()
    const artistLower = t.artist.toLowerCase()

    if (titleLower === qLower) score += 100
    else if (titleLower.startsWith(qLower)) score += 50
    else if (titleLower.includes(qLower)) score += 30

    if (artistLower.includes(qLower)) score += 40

    if (/cover|karaoke|remix|instrumental|lyrics|lyrical/i.test(titleLower)) score -= 20
    if (/cover|karaoke|remix/i.test(artistLower)) score -= 10

    if (/vevo|official/i.test(artistLower) || /official/i.test(titleLower)) score += 15

    return { track: t, score }
  })
  scored.sort((a, b) => b.score - a.score)

  // Related artists
  const artistTracks = await searchYouTube(query + ' singer', 5)
  const seen = new Set()
  const relatedArtists = []
  for (const t of artistTracks) {
    const name = t.artist
    if (!seen.has(name)) {
      seen.add(name)
      relatedArtists.push({ name, image: t.image || '' })
    }
    if (relatedArtists.length >= 6) break
  }

  sendJSON(res, {
    tracks: scored.map(s => s.track),
    artists: relatedArtists
  })
}

async function handleStream (req, res, videoId) {
  if (!videoId || videoId.length < 5) {
    return sendError(res, 400, 'Invalid video ID')
  }

  // Serve from cache if available
  const cached = getCachedAudioFile(videoId)
  if (cached) {
    const stat = fs.statSync(cached.file)
    const fileSize = stat.size
    const mimeType = mimeForExt[cached.ext] || 'audio/webm'
    const range = req.headers['range']

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': mimeType,
        'Cache-Control': 'max-age=86400',
      })
      fs.createReadStream(cached.file, { start, end }).pipe(res)
      return
    }

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'max-age=86400',
    })
    fs.createReadStream(cached.file).pipe(res)
    return
  }

  // Fetch audio URL via yt-dlp binary and proxy
  try {
    log('Resolving stream for ' + videoId)
    if (!fs.existsSync(YT_DLP_PATH)) {
      log('yt-dlp binary not found')
      return sendError(res, 502, 'Stream unavailable (binary not found)')
    }
    const audioUrl = await new Promise((resolve, reject) => {
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
      proc.stdout.on('data', d => stdout += d)
      proc.stderr.on('data', d => stderr += d)
      proc.on('close', code => {
        if (code === 0 && stdout.trim()) resolve(stdout.trim())
        else reject(new Error('code=' + code + ' stderr="' + (stderr || '').trim() + '" stdout="' + (stdout || '').trim().substring(0, 200) + '"'))
      })
      proc.on('error', reject)
    })
    if (!audioUrl || !audioUrl.startsWith('http')) {
      throw new Error('Invalid audio URL')
    }

    const urlObj = new URL(audioUrl)
    const mod = urlObj.protocol === 'https:' ? https : http
    const range = req.headers['range'] || ''

    const proxyOpts = { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET' }
    if (range) proxyOpts.headers = { Range: range }

    const proxyReq = mod.request(proxyOpts, (proxyRes) => {
      const statusCode = range && proxyRes.statusCode === 206 ? 206 : 200
      const responseHeaders = {
        'Content-Type': proxyRes.headers['content-type'] || 'audio/webm',
        'Cache-Control': 'no-cache',
        'Accept-Ranges': 'bytes',
      }
      if (proxyRes.headers['content-range']) responseHeaders['Content-Range'] = proxyRes.headers['content-range']
      if (proxyRes.headers['content-length']) responseHeaders['Content-Length'] = proxyRes.headers['content-length']

      res.writeHead(statusCode, responseHeaders)

      const cacheDir = getAudioCachePath(videoId)
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
      const ext = (proxyRes.headers['content-type'] || '').includes('mp4') ? '.m4a' : '.webm'
      const cachePath = path.join(cacheDir, 'audio' + ext)
      const fileStream = fs.createWriteStream(cachePath)
      proxyRes.on('data', chunk => fileStream.write(chunk))
      proxyRes.on('end', () => fileStream.end())
      proxyRes.pipe(res)
    })
    proxyReq.on('error', (err) => {
      log('Proxy error for ' + videoId + ': ' + err.message)
      if (!res.headersSent) sendError(res, 502, 'Stream unavailable')
    })
    proxyReq.end()
  } catch (e) {
    log('Stream error for ' + videoId + ': ' + e.message)
    const isBot = e.message.includes('Sign in') || e.message.includes('bot')
    const hint = isBot ? ' YouTube blocked Render IP. Set COOKIES_FILE env var (see /cookies-guide).' : ''
    if (!res.headersSent) sendError(res, 502, 'Stream unavailable.' + hint)
  }
}

async function handleLyrics (req, res, parsed) {
  const track = (parsed.query.track || '').trim()
  const artist = (parsed.query.artist || '').trim()

  if (!track) {
    return sendJSON(res, { lyrics: null, synced: null })
  }

  try {
    const params = new URLSearchParams({ track_name: track })
    if (artist) params.set('artist_name', artist)

    const response = await fetch('https://lrclib.net/api/get?' + params.toString(), {
      headers: { 'User-Agent': 'Muzima/1.0' }
    })

    if (response.ok) {
      const data = await response.json()
      sendJSON(res, {
        lyrics: data.plainLyrics || null,
        synced: data.syncedLyrics || null,
        instrumental: data.instrumental || false
      })
      return
    }

    // Search fallback
    const searchRes = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(track + ' ' + (artist || '')), {
      headers: { 'User-Agent': 'Muzima/1.0' }
    })
    if (searchRes.ok) {
      const results = await searchRes.json()
      if (results.length > 0) {
        const best = results[0]
        sendJSON(res, {
          lyrics: best.plainLyrics || null,
          synced: best.syncedLyrics || null,
          instrumental: best.instrumental || false
        })
        return
      }
    }
    sendJSON(res, { lyrics: null, synced: null })
  } catch (e) {
    log('Lyrics error: ' + e.message)
    sendJSON(res, { lyrics: null, synced: null })
  }
}

async function handleChart (req, res) {
  try {
    const queries = [
      'bollywood trending songs 2025',
      'viral hindi songs 2025',
      'top bollywood hits'
    ]
    const allTracks = []
    for (const q of queries) {
      const tracks = await searchYouTube(q, 15)
      for (const t of tracks) {
        if (!allTracks.some(x => x.id === t.id)) {
          allTracks.push(t)
        }
      }
    }
    sendJSON(res, {
      tracks: allTracks.slice(0, 30),
      albums: [], artists: [], playlists: []
    })
  } catch (e) {
    log('Chart error: ' + e.message)
    sendJSON(res, { tracks: [], albums: [], artists: [], playlists: [] })
  }
}

async function handleHome (req, res) {
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

    sendJSON(res, {
      newReleases: results[0],
      trendingNow: results[1],
      topCharts: results[2],
      moodRomantic: results[3],
      moodParty: results[4],
      moodSad: results[5],
      moodEnergy: results[6],
      topArtists: POPULAR_SINGERS.map(name => ({ name, image: '' })),
      musicDirectors: MUSIC_DIRECTORS.map(name => ({ name, image: '' })),
      lyricists: LYRICISTS.map(name => ({ name, image: '' })),
    })
  } catch (e) {
    log('Home error: ' + e.message)
    sendJSON(res, {
      newReleases: [], trendingNow: [], topCharts: [],
      moodRomantic: [], moodParty: [], moodSad: [], moodEnergy: [],
      topArtists: [], musicDirectors: [], lyricists: []
    })
  }
}

async function handleArtist (req, res, query) {
  const tracks = await searchYouTube(query + ' songs', 20)
  sendJSON(res, { data: tracks })
}

function routeAPI (req, res, parsed) {
  const pathname = parsed.pathname

  if (pathname === '/data/home') return handleHome(req, res)

  const streamMatch = pathname.match(/^\/data\/stream\/([a-zA-Z0-9_-]+)$/)
  if (streamMatch) return handleStream(req, res, streamMatch[1])

  const chartMatch = pathname.match(/^\/data\/chart\/(\d+)(?:\/tracks)?$/)
  if (chartMatch) return handleChart(req, res)

  if (pathname === '/data/search') return handleSearch(req, res, parsed)
  if (pathname === '/data/lyrics') return handleLyrics(req, res, parsed)

  const directorMatch = pathname.match(/^\/data\/director\/(.+)$/)
  if (directorMatch) {
    const tracks = searchYouTube(directorMatch[1] + ' songs music director', 20)
    return tracks.then(data => sendJSON(res, { data }))
  }

  const lyricistMatch = pathname.match(/^\/data\/lyricist\/(.+)$/)
  if (lyricistMatch) {
    const tracks = searchYouTube(lyricistMatch[1] + ' lyrics songs', 20)
    return tracks.then(data => sendJSON(res, { data }))
  }

  const artistMatch = pathname.match(/^\/data\/artist\/([^/]+)(?:\/(top))?$/)
  if (artistMatch) return handleArtist(req, res, artistMatch[1])

  const albumMatch = pathname.match(/^\/data\/album\/(.+)$/)
  if (albumMatch) return handleArtist(req, res, albumMatch[1])

  const playlistMatch = pathname.match(/^\/data\/playlist\/(.+)$/)
  if (playlistMatch) return handleArtist(req, res, playlistMatch[1])

  const trackMatch = pathname.match(/^\/data\/track\/(.+)$/)
  if (trackMatch) {
    return handleSearch(req, res, { query: { q: trackMatch[1], limit: '5' } })
  }

  sendError(res, 404, 'Not found')
}

const server = http.createServer((req, res) => {
  const ip = getClientIp(req)
  const _url = new URL(req.url, 'http://' + req.headers.host)
  const pathname = _url.pathname

  log(ip + ' ' + req.method + ' ' + pathname)

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')

  if (!checkRateLimit(ip)) {
    res.writeHead(429, { 'Content-Type': 'text/plain' })
    res.end('Too many requests')
    return
  }

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('OK')
    return
  }

  if (pathname === '/cookies-guide') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cookies Guide - Muzima</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,sans-serif;max-width:600px;margin:40px auto;padding:0 20px;line-height:1.6}h1{color:#e91e63}code{background:#f5f5f5;padding:2px 6px;border-radius:4px;font-size:.9em}ol li{margin:8px 0}</style></head><body>
<h1>Bypass YouTube Bot Detection</h1>
<p>YouTube blocks cloud IPs. Fix by providing browser cookies:</p>
<ol>
<li>Install <a href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc">Get cookies.txt LOCALLY</a> (Chrome) or <a href="https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/">cookies.txt</a> (Firefox)</li>
<li>Go to <strong>youtube.com</strong> and make sure you're logged in</li>
<li>Click the extension icon and export cookies as <strong>Netscape format</strong></li>
<li>In Render Dashboard → Environment → <strong>Secret Files</strong> → upload the <code>cookies.txt</code> file (mount path: <code>/etc/secrets/cookies.txt</code>)</li>
<li>Add env var <code>COOKIES_FILE</code> = <code>/etc/secrets/cookies.txt</code></li>
<li>Redeploy the service</li>
</ol>
<p>Without cookies: stream will fail with <code>Sign in to confirm you're not a bot</code>.</p>
</body></html>`)
    return
  }

  if (pathname.startsWith('/data/')) {
    if (!isAllowedOrigin(req) && !hasBrowserUA(req)) {
      log('Blocked: IP=' + ip)
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden')
      return
    }
    const parsed = {
      pathname,
      query: Object.fromEntries(_url.searchParams.entries())
    }
    return routeAPI(req, res, parsed)
  }

  const filePath = pathname === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, pathname)
  serveStatic(res, filePath)
})

server.listen(PORT, () => {
  console.log('muzima → http://localhost:' + PORT)
})
