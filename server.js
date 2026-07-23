const http = require('http')

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const play = require('play-dl')

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
    const results = await play.search(query, { limit, source: { youtube: 'video' } })

    const tracks = results.map(r => ({
      id: r.id || '',
      title: r.title || 'Unknown',
      artist: r.channel?.name || 'Unknown',
      image: r.thumbnail?.url || '',
      streaming_url: '/data/stream/' + (r.id || ''),
      duration: r.durationInSec || 0,
      album: '',
      uploader: { name: r.channel?.name || 'Unknown', id: null, image: '' }
    }))

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

  // Fetch and stream from YouTube via play-dl
  try {
    log('Streaming ' + videoId + ' via play-dl')
    const url = 'https://www.youtube.com/watch?v=' + videoId
    const audioStream = await play.stream(url, { quality: 0 })

    const cacheDir = getAudioCachePath(videoId)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    const cachePath = path.join(cacheDir, 'audio.webm')
    const fileStream = fs.createWriteStream(cachePath)

    res.writeHead(200, {
      'Content-Type': 'audio/webm',
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes',
    })

    audioStream.stream.pipe(fileStream)
    audioStream.stream.pipe(res)
  } catch (e) {
    log('Stream error for ' + videoId + ': ' + e.message)
    if (!res.headersSent) sendError(res, 502, 'Stream unavailable')
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
