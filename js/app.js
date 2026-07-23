;(function () {
  'use strict'

  const $ = (sel, ctx) => (ctx || document).querySelector(sel)
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel))

  function formatTime (s) {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return m + ':' + (sec < 10 ? '0' : '') + sec
  }

  function debounce (fn, ms) {
    let timer
    return function (...args) {
      clearTimeout(timer)
      timer = setTimeout(() => fn.apply(this, args), ms)
    }
  }

  function escHtml (str) {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function parseLRC (lrc) {
    if (!lrc) return []
    const lines = lrc.split('\n')
    const parsed = []
    const regex = /\[(\d+):(\d+)\.(\d+)\](.*)/
    for (const line of lines) {
      const match = line.match(regex)
      if (match) {
        const mins = parseInt(match[1])
        const secs = parseInt(match[2])
        const ms = parseInt(match[3].padEnd(3, '0').slice(0, 3))
        const time = mins * 60 + secs + ms / 1000
        const text = match[4].trim()
        if (text) {
          parsed.push({ time, text })
        }
      }
    }
    return parsed
  }

  const dom = {
    view: $('#view-container'),
    pageTitle: $('#page-title'),
    navItems: $$('.nav-item'),
    playerBar: $('#player-bar'),
    playerArt: $('#player-art'),
    playerTitle: $('#player-title'),
    playerArtist: $('#player-artist'),
    playBtn: $('#play-btn'),
    prevBtn: $('#prev-btn'),
    nextBtn: $('#next-btn'),
    shuffleBtn: $('#shuffle-btn'),
    repeatBtn: $('#repeat-btn'),
    seekSlider: $('#seek-slider'),
    progressFill: $('#progress-fill'),
    progressThumb: $('#progress-thumb'),
    currentTime: $('#current-time'),
    duration: $('#duration'),
    volumeSlider: $('#volume-slider'),
    volumeBtn: $('#volume-btn'),
    playerLike: $('#player-like-btn'),
    toastContainer: $('#toast-container'),
    overlay: $('#overlay'),
    mobileMenuBtn: $('#mobile-menu-btn'),
    sidebar: $('#sidebar'),
    searchInput: $('#search-input'),
    fullPlayer: $('#full-player'),
    fullPlayerArt: $('#full-player-art'),
    fullPlayerTitle: $('#full-player-title'),
    fullPlayerArtist: $('#full-player-artist'),
    fullPlayBtn: $('#full-play-btn'),
    fullPrevBtn: $('#full-prev-btn'),
    fullNextBtn: $('#full-next-btn'),
    fullShuffleBtn: $('#full-shuffle-btn'),
    fullRepeatBtn: $('#full-repeat-btn'),
    fullSeekSlider: $('#full-seek-slider'),
    fullCurrentTime: $('#full-current-time'),
    fullDuration: $('#full-duration'),
    fullVolumeSlider: $('#full-volume-slider'),
    fullVolumeBtn: $('#full-volume-btn'),
    fullPlayerClose: $('#full-player-close'),
    fullPlayerArtInner: $('#full-player-art-inner'),
    lyricsContainer: $('#lyrics-container'),
    tabItems: $$('.tab-item'),
  }

  const Toast = {
    show (message, duration) {
      duration = duration || 2000
      const el = document.createElement('div')
      el.className = 'toast'
      el.textContent = message
      dom.toastContainer.appendChild(el)
      setTimeout(() => {
        el.classList.add('out')
        setTimeout(() => el.remove(), 300)
      }, duration)
    }
  }

  const API = {
    base: '/data',

    async get (path) {
      const url = this.base + path
      try {
        const res = await fetch(url)
        const data = await res.json()
        return { ok: res.ok && !data.error, status: res.status, data }
      } catch (err) {
        return { ok: false, status: 0, data: null, error: err.message }
      }
    },

    async trending () {
      const res = await this.get('/chart/0')
      if (!res.ok || !res.data) return { ok: false, data: { results: [] } }
      const raw = res.data.tracks || []
      return { ok: true, data: { results: raw } }
    },

    async recent () {
      return this.trending()
    },

    async chart (type) {
      const res = await this.get('/chart/0/tracks')
      if (!res.ok || !res.data) return { ok: false, data: { results: [] } }
      const raw = Array.isArray(res.data) ? res.data : (res.data.data || res.data.tracks || [])
      return { ok: true, data: { results: raw } }
    },

    async chartAlbums () {
      return { ok: true, data: { results: [] } }
    },

    async chartArtists () {
      return { ok: true, data: { results: [] } }
    },

    async chartPlaylists () {
      return { ok: true, data: { results: [] } }
    },

    async home () {
      const res = await this.get('/home')
      if (!res.ok || !res.data) return { ok: false, data: {} }
      return { ok: true, data: res.data }
    },

    async search (q, type) {
      type = type || 'tracks'
      const res = await this.get('/search?q=' + encodeURIComponent(q) + '&limit=30&type=' + type)
      if (!res.ok || !res.data) return { ok: false, tracks: [], artists: [] }
      const data = res.data
      return {
        ok: true,
        tracks: data.tracks || [],
        artists: data.artists || []
      }
    },

    async artist (slug) {
      const res = await this.get('/artist/' + encodeURIComponent(slug))
      if (!res.ok || !res.data) return { ok: false, data: { results: null } }
      const raw = res.data.data || []
      return {
        ok: true,
        data: {
          results: {
            id: slug,
            name: slug,
            image: raw.length > 0 ? raw[0].image : '',
            genre: '',
            upload_count: raw.length,
            followers_count: 0,
            favorites_count: 0
          }
        }
      }
    },

    async artistUploads (slug) {
      const res = await this.get('/artist/' + encodeURIComponent(slug) + '/top')
      if (!res.ok || !res.data) return { ok: false, data: { results: [] } }
      const raw = res.data.data || []
      return { ok: true, data: { results: raw } }
    },

    async music (id) {
      const tracks = await this.search(id)
      if (tracks.ok && tracks.tracks && tracks.tracks.length > 0) {
        return { ok: true, data: { results: tracks.tracks[0] } }
      }
      return { ok: false, data: { results: null } }
    },

    async director (name) {
      const res = await this.get('/director/' + encodeURIComponent(name))
      if (!res.ok || !res.data) return { ok: false, data: { results: [] } }
      return { ok: true, data: { results: res.data.data || [] } }
    },

    async lyricist (name) {
      const res = await this.get('/lyricist/' + encodeURIComponent(name))
      if (!res.ok || !res.data) return { ok: false, data: { results: [] } }
      return { ok: true, data: { results: res.data.data || [] } }
    },

    async lyrics (track, artist) {
      const params = new URLSearchParams({ track: track || '', artist: artist || '' })
      try {
        const res = await fetch(this.base + '/lyrics?' + params.toString())
        const data = await res.json()
        return data
      } catch {
        return { lyrics: null, synced: null }
      }
    }
  }

  const Player = {
    audio: new Audio(),
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    shuffle: false,
    repeat: 'off',
    volume: 0.7,
    previousVolume: 0.7,
    lyrics: [],
    currentLyricIndex: -1,
    lyricInterval: null,

    init () {
      this.volume = parseFloat(localStorage.getItem('muzima_volume')) || 0.7
      dom.volumeSlider.value = this.volume
      dom.fullVolumeSlider.value = this.volume
      this.updateVolumeUI()
      this.updateFullVolumeUI()

      this.audio.volume = this.volume

      this.audio.addEventListener('timeupdate', () => this.onTimeUpdate())
      this.audio.addEventListener('loadedmetadata', () => this.onLoadedMetadata())
      this.audio.addEventListener('ended', () => this.onEnded())
      this.audio.addEventListener('error', () => this.onError())
      this.audio.addEventListener('play', () => this.onPlay())
      this.audio.addEventListener('pause', () => this.onPause())

      const onSeek = (e) => {
        if (this.audio.duration) {
          const pct = parseFloat(e.target.value)
          this.audio.currentTime = (pct / 100) * this.audio.duration
        }
      }
      dom.seekSlider.addEventListener('input', onSeek)
      dom.fullSeekSlider.addEventListener('input', onSeek)

      const onVolume = (e) => {
        this.volume = parseFloat(e.target.value)
        this.audio.volume = this.volume
        dom.volumeSlider.value = this.volume
        dom.fullVolumeSlider.value = this.volume
        this.updateVolumeUI()
        this.updateFullVolumeUI()
        localStorage.setItem('muzima_volume', this.volume)
      }
      dom.volumeSlider.addEventListener('input', onVolume)
      dom.fullVolumeSlider.addEventListener('input', onVolume)

      const toggleMute = () => {
        if (this.audio.volume > 0) {
          this.previousVolume = this.audio.volume
          this.audio.volume = 0
          dom.volumeSlider.value = 0
          dom.fullVolumeSlider.value = 0
          this.updateVolumeUI()
          this.updateFullVolumeUI()
        } else {
          this.audio.volume = this.previousVolume || 0.7
          dom.volumeSlider.value = this.audio.volume
          dom.fullVolumeSlider.value = this.audio.volume
          this.updateVolumeUI()
          this.updateFullVolumeUI()
        }
        this.volume = this.audio.volume
        localStorage.setItem('muzima_volume', this.volume)
      }
      dom.volumeBtn.addEventListener('click', toggleMute)
      dom.fullVolumeBtn.addEventListener('click', toggleMute)

      dom.playBtn.addEventListener('click', () => this.togglePlay())
      dom.prevBtn.addEventListener('click', () => this.prev())
      dom.nextBtn.addEventListener('click', () => this.next())
      dom.shuffleBtn.addEventListener('click', () => this.toggleShuffle())
      dom.repeatBtn.addEventListener('click', () => this.toggleRepeat())

      dom.fullPlayBtn.addEventListener('click', () => this.togglePlay())
      dom.fullPrevBtn.addEventListener('click', () => this.prev())
      dom.fullNextBtn.addEventListener('click', () => this.next())
      dom.fullShuffleBtn.addEventListener('click', () => this.toggleShuffle())
      dom.fullRepeatBtn.addEventListener('click', () => this.toggleRepeat())

      dom.playerLike.addEventListener('click', (e) => {
        e.stopPropagation()
        dom.playerLike.classList.toggle('liked')
      })

      dom.playerBar.addEventListener('click', (e) => {
        if (e.target.closest('button, .volume-control, .player-progress, input')) return
        if (this.audio.src) this.openFullPlayer()
      })

      dom.fullPlayerClose.addEventListener('click', () => this.closeFullPlayer())

      let touchStartY = 0
      dom.fullPlayer.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY
      }, { passive: true })
      dom.fullPlayer.addEventListener('touchmove', (e) => {
        const dy = e.touches[0].clientY - touchStartY
        if (dy > 80) this.closeFullPlayer()
      }, { passive: true })
    },

    openFullPlayer () {
      dom.fullPlayer.classList.add('open')
      document.body.style.overflow = 'hidden'
    },

    closeFullPlayer () {
      dom.fullPlayer.classList.remove('open')
      document.body.style.overflow = ''
    },

    updateFullVolumeUI () {
      const pct = (parseFloat(dom.fullVolumeSlider.value) || 0) * 100
      const el = dom.fullVolumeSlider.parentElement
      if (el) el.style.setProperty('--full-vol-pct', pct + '%')
    },

    updateVolumeUI () {
      const pct = (parseFloat(dom.volumeSlider.value) || 0) * 100
      const el = dom.volumeSlider.parentElement
      if (el) el.style.setProperty('--volume-percent', pct + '%')
    },

    syncLyrics () {
      if (!this.lyrics.length) return
      const ct = this.audio.currentTime
      let idx = -1
      for (let i = 0; i < this.lyrics.length; i++) {
        if (this.lyrics[i].time <= ct) {
          idx = i
        } else {
          break
        }
      }

      if (idx === this.currentLyricIndex) return
      this.currentLyricIndex = idx

      const lines = dom.lyricsContainer?.querySelectorAll('.lyric-line')
      if (!lines) return

      lines.forEach((line, i) => {
        line.classList.remove('active', 'prev')
        if (i === idx) {
          line.classList.add('active')
          line.scrollIntoView({ block: 'center', behavior: 'smooth' })
        } else if (i === idx - 1 || i === idx - 2) {
          line.classList.add('prev')
        }
      })
    },

    onTimeUpdate () {
      if (!this.audio.duration) return
      const pct = (this.audio.currentTime / this.audio.duration) * 100
      dom.seekSlider.value = pct
      dom.progressFill.style.width = pct + '%'
      dom.progressThumb.style.left = pct + '%'
      dom.currentTime.textContent = formatTime(this.audio.currentTime)
      dom.fullSeekSlider.value = pct
      dom.fullCurrentTime.textContent = formatTime(this.audio.currentTime)


      if (this.lyrics.length) {
        this.syncLyrics()
      }
    },

    onLoadedMetadata () {
      dom.duration.textContent = formatTime(this.audio.duration)
      dom.seekSlider.max = '100'
      dom.fullDuration.textContent = formatTime(this.audio.duration)
      dom.fullSeekSlider.max = '100'
    },

    onEnded () {
      if (this.repeat === 'one') {
        this.audio.currentTime = 0
        this.audio.play()
        return
      }
      this.next()
    },

    onError () {
      const code = this.audio.error ? this.audio.error.code : '?'
      const msg = this.audio.error ? this.audio.error.message : 'Playback failed'
      Toast.show('Stream error (' + code + '), skipping...')
      this.next()
    },

    onPlay () {
      this.isPlaying = true
      dom.playBtn.classList.add('playing')
      dom.playBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      dom.playBtn.title = 'Pause'
      dom.playerArt?.parentElement?.classList.add('playing')
      const viz = $('#player-visualizer')
      if (viz) viz.classList.add('active')
      dom.fullPlayBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><rect x="7" y="5" width="4" height="14"/><rect x="13" y="5" width="4" height="14"/></svg>'
      dom.fullPlayerArtInner?.classList.add('playing')
    },

    onPause () {
      this.isPlaying = false
      dom.playBtn.classList.remove('playing')
      dom.playBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>'
      dom.playBtn.title = 'Play'
      dom.playerArt?.parentElement?.classList.remove('playing')
      const viz = $('#player-visualizer')
      if (viz) viz.classList.remove('active')
      dom.fullPlayBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><polygon points="9,5 20,12 9,19"/></svg>'
      dom.fullPlayerArtInner?.classList.remove('playing')
    },

    async fetchLyrics (track, artist) {
      dom.lyricsContainer.innerHTML = '<p class="lyrics-placeholder">Loading lyrics...</p>'
      this.lyrics = []
      this.currentLyricIndex = -1

      try {
        const data = await API.lyrics(track, artist)
        const raw = data.synced || data.lyrics
        if (raw) {
          const parsed = parseLRC(raw)
          if (parsed.length > 0) {
            this.lyrics = parsed
            this.renderLyrics()
            return
          }
          // Plain lyrics
          const plainLines = data.lyrics.split('\n').filter(l => l.trim())
          this.lyrics = plainLines.map((text, i) => ({ time: i * 999, text }))
          this.renderLyrics()
          return
        }
        dom.lyricsContainer.innerHTML = '<p class="lyrics-placeholder">No lyrics available</p>'
      } catch {
        dom.lyricsContainer.innerHTML = '<p class="lyrics-placeholder">No lyrics available</p>'
      }
    },

    renderLyrics () {
      if (!dom.lyricsContainer) return
      if (this.lyrics.length === 0) {
        dom.lyricsContainer.innerHTML = '<p class="lyrics-placeholder">No lyrics available</p>'
        return
      }
      let html = ''
      for (let i = 0; i < this.lyrics.length; i++) {
        const cls = i === 0 ? 'lyric-line active' : 'lyric-line'
        html += '<p class="' + cls + '" data-idx="' + i + '">' + escHtml(this.lyrics[i].text) + '</p>'
      }
      dom.lyricsContainer.innerHTML = html
    },

    async loadTrack (track) {
      if (!track) return

      // Stop any current playback before loading new track
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()

      dom.playerBar.classList.remove('hidden')
      dom.playerArt.src = track.image || ''
      dom.playerTitle.textContent = track.title || 'Unknown'
      dom.playerArtist.textContent = track.artist || (track.uploader && track.uploader.name) || 'Unknown'
      dom.playerLike.classList.remove('liked')
      dom.fullPlayerArt.src = track.image || ''
      dom.fullPlayerTitle.textContent = track.title || 'Unknown'
      dom.fullPlayerArtist.textContent = track.artist || (track.uploader && track.uploader.name) || 'Unknown'

      if (!track.streaming_url) {
        Toast.show('Track unavailable')
        return
      }

      this.audio.src = track.streaming_url
      this.audio.load()
      this.audio.play().catch(() => {})

      this.updateActiveTrack()
      this.fetchLyrics(track.title, track.artist)
      this.preloadNext()
    },

    async preloadNext () {
      if (!this.queue.length || this.queue.length <= this.currentIndex + 1) return
    },

    async play (track) {
      if (!track) return
      const idx = this.queue.findIndex(t => String(t.id) === String(track.id))
      if (idx >= 0) {
        this.currentIndex = idx
        this.queue[this.currentIndex] = track
      } else {
        this.queue = [track]
        this.currentIndex = 0
      }
      this.loadTrack(track)
    },

    async playAll (tracks) {
      if (!tracks || !tracks.length) return
      this.queue = tracks
      this.currentIndex = 0
      this.loadTrack(tracks[0])
    },

    togglePlay () {
      if (!this.audio.src) {
        if (this.queue.length) {
          this.loadTrack(this.queue[this.currentIndex])
        }
        return
      }
      if (this.audio.paused) {
        this.audio.play()
      } else {
        this.audio.pause()
      }
    },

    async prev () {
      if (!this.queue.length) return
      if (this.audio.currentTime > 3) {
        this.audio.currentTime = 0
        return
      }
      this.currentIndex--
      if (this.currentIndex < 0) this.currentIndex = this.queue.length - 1
      this.loadTrack(this.queue[this.currentIndex])
    },

    async next () {
      if (!this.queue.length) return
      if (this.shuffle) {
        this.currentIndex = Math.floor(Math.random() * this.queue.length)
      } else {
        this.currentIndex++
        if (this.currentIndex >= this.queue.length) {
          if (this.repeat === 'all') {
            this.currentIndex = 0
          } else {
            this.pause()
            return
          }
        }
      }
      this.loadTrack(this.queue[this.currentIndex])
    },

    pause () {
      this.audio.pause()
    },

    toggleShuffle () {
      this.shuffle = !this.shuffle
      dom.shuffleBtn.classList.toggle('active', this.shuffle)
      dom.fullShuffleBtn.classList.toggle('active', this.shuffle)
      Toast.show(this.shuffle ? 'Shuffle on' : 'Shuffle off')
    },

    toggleRepeat () {
      const modes = ['off', 'all', 'one']
      const idx = modes.indexOf(this.repeat)
      this.repeat = modes[(idx + 1) % modes.length]
      const isActive = this.repeat !== 'off'
      dom.repeatBtn.classList.toggle('active', isActive)
      dom.fullRepeatBtn.classList.toggle('active', isActive)
      const icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>'
      const iconOne = '<span style="position:relative;display:flex">' + icon + '<span style="font-size:8px;font-weight:700;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">1</span></span>'
      dom.repeatBtn.innerHTML = this.repeat === 'one' ? iconOne : icon
      dom.fullRepeatBtn.innerHTML = this.repeat === 'one' ? iconOne : icon
      const labels = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }
      Toast.show(labels[this.repeat])
    },

    updateActiveTrack () {
      const currentId = String(this.queue[this.currentIndex]?.id)
      $$('.track-list-item').forEach(el => {
        el.classList.toggle('active', String(el.dataset.id) === currentId)
      })
      $$('.track-card').forEach(el => {
        el.classList.toggle('active', String(el.dataset.id) === currentId)
      })
    }
  }

  const Views = {
    skeletonHTML () {
      return '<div class="view view-home">' +
        '<div class="skeleton-hero skeleton-shimmer"></div>' +
        '<div class="skeleton-section">' +
          '<div class="skeleton-header skeleton-shimmer"></div>' +
          '<div class="skeleton-row">' +
            Array(5).fill('<div class="skeleton-card"><div class="skeleton-card-image skeleton-shimmer"></div><div class="skeleton-card-title skeleton-shimmer"></div><div class="skeleton-card-subtitle skeleton-shimmer"></div></div>').join('') +
          '</div>' +
        '</div>' +
        '<div class="skeleton-section">' +
          '<div class="skeleton-header skeleton-shimmer"></div>' +
          '<div class="skeleton-grid">' +
            Array(6).fill('<div class="skeleton-card"><div class="skeleton-card-image skeleton-shimmer"></div><div class="skeleton-card-title skeleton-shimmer"></div><div class="skeleton-card-subtitle skeleton-shimmer"></div></div>').join('') +
          '</div>' +
        '</div>' +
        '<div class="skeleton-section">' +
          '<div class="skeleton-header skeleton-shimmer"></div>' +
          '<div class="skeleton-row">' +
            Array(5).fill('<div class="skeleton-card"><div class="skeleton-card-image skeleton-shimmer"></div><div class="skeleton-card-title skeleton-shimmer"></div><div class="skeleton-card-subtitle skeleton-shimmer"></div></div>').join('') +
          '</div>' +
        '</div>' +
      '</div>'
    },

    skeletonBrowseHTML () {
      return '<div class="view view-browse">' +
        '<div class="skeleton-section">' +
          '<div class="skeleton-header skeleton-shimmer" style="width:300px"></div>' +
          Array(8).fill('<div style="display:flex;gap:14px;padding:8px 0;align-items:center"><div class="skeleton-shimmer" style="width:28px;height:20px;flex-shrink:0"></div><div class="skeleton-shimmer" style="width:44px;height:44px;border-radius:6px;flex-shrink:0"></div><div style="flex:1"><div class="skeleton-shimmer" style="width:60%;height:14px;margin-bottom:6px"></div><div class="skeleton-shimmer" style="width:40%;height:12px"></div></div></div>').join('') +
        '</div>' +
      '</div>'
    },

    errorHTML () {
      return '<div class="error-state"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h3>Something went wrong</h3><p>Please try again.</p></div>'
    },

    trackCardHTML (track) {
      const title = escHtml(track.title || 'Unknown')
      const artist = escHtml(track.artist || (track.uploader && track.uploader.name) || 'Unknown')
      const image = track.image || ''
      const id = track.id
      return '<div class="track-card" data-id="' + id + '" data-action="play">' +
        '<div class="track-card-image">' +
          '<img src="' + image + '" alt="' + title + '" loading="lazy">' +
          '<button class="track-card-play" data-action="play">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="white"><polygon points="7,5 18,12 7,19"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="track-card-info">' +
          '<h4>' + title + '</h4>' +
          '<p>' + artist + '</p>' +
        '</div>' +
      '</div>'
    },

    trackCardSmallHTML (track) {
      const title = escHtml(track.title || 'Unknown')
      const artist = escHtml(track.artist || (track.uploader && track.uploader.name) || 'Unknown')
      const image = track.image || ''
      const id = track.id
      return '<div class="track-card" data-id="' + id + '" data-action="play">' +
        '<div class="track-card-image">' +
          '<img src="' + image + '" alt="' + title + '" loading="lazy">' +
          '<button class="track-card-play" data-action="play">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><polygon points="7,5 18,12 7,19"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="track-card-info">' +
          '<h4>' + title + '</h4>' +
          '<p>' + artist + '</p>' +
        '</div>' +
      '</div>'
    },

    albumCardHTML (album) {
      const title = escHtml(album.title || 'Unknown')
      const artist = escHtml(album.artist || 'Unknown')
      const image = album.image || ''
      return '<div class="album-card">' +
        '<div class="album-card-image">' +
          '<img src="' + image + '" alt="' + title + '" loading="lazy">' +
        '</div>' +
        '<div class="album-card-info">' +
          '<h4>' + title + '</h4>' +
          '<p>' + artist + '</p>' +
        '</div>' +
      '</div>'
    },

    artistCardHTML (artist) {
      const name = escHtml(artist.name || 'Unknown')
      const image = artist.image || ''
      const id = artist.id || artist.uploader?.id
      const label = artist.fans ? (artist.fans >= 1000000 ? Math.floor(artist.fans/1000000) + 'M' : artist.fans >= 1000 ? Math.floor(artist.fans/1000) + 'K' : artist.fans) + ' fans' : 'Artist'
      return '<div class="artist-card" data-id="' + id + '" data-action="artist">' +
        '<div class="artist-card-image">' +
          '<img src="' + image + '" alt="' + name + '" loading="lazy">' +
        '</div>' +
        '<div class="artist-card-info">' +
          '<h4>' + name + '</h4>' +
          '<p>' + label + '</p>' +
        '</div>' +
      '</div>'
    },

    trackListItemHTML (track, index) {
      const title = escHtml(track.title || 'Unknown')
      const artist = escHtml(track.artist || (track.uploader && track.uploader.name) || 'Unknown')
      const image = track.image || ''
      const id = track.id
      const dur = track.duration ? formatTime(track.duration) : ''
      return '<div class="track-list-item" data-id="' + id + '" data-action="play">' +
        '<span class="track-list-number">' + (index + 1) + '</span>' +
        '<img class="track-list-image" src="' + image + '" alt="' + title + '" loading="lazy">' +
        '<div class="track-list-info">' +
          '<div class="track-list-title">' + title + '</div>' +
          '<div class="track-list-artist">' + artist + '</div>' +
        '</div>' +
        (dur ? '<span class="track-list-duration">' + dur + '</span>' : '') +
        '<button class="track-list-play" data-action="play">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>' +
        '</button>' +
      '</div>'
    },

    scrollRowHTML (tracks) {
      if (!tracks || !tracks.length) return ''
      return '<div class="scroll-row">' +
        tracks.map(t => this.trackCardHTML(t)).join('') +
      '</div>'
    },

    trackGridHTML (tracks) {
      if (!tracks || !tracks.length) return ''
      return '<div class="track-grid">' +
        tracks.slice(0, 6).map(t => this.trackCardHTML(t)).join('') +
      '</div>'
    },

    albumScrollRowHTML (albums) {
      if (!albums || !albums.length) return ''
      return '<div class="scroll-row">' +
        albums.map(a => this.albumCardHTML(a)).join('') +
      '</div>'
    },

    artistScrollRowHTML (artists) {
      if (!artists || !artists.length) return ''
      return '<div class="scroll-row">' +
        artists.map(a => this.artistCardSmallHTML(a)).join('') +
      '</div>'
    },

    artistCardSmallHTML (artist) {
      const name = escHtml(artist.name || 'Unknown')
      const image = artist.image || ''
      const type = artist.type || 'artist'
      const action = type === 'director' ? 'category-director' : type === 'lyricist' ? 'category-lyricist' : 'category-artist'
      return '<div class="artist-card" data-action="' + action + '" data-name="' + encodeURIComponent(artist.name) + '">' +
        '<div class="artist-card-image">' +
          (image ? '<img src="' + image + '" alt="' + name + '" loading="lazy">' : '<div class="artist-card-placeholder"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0112 0v2"/></svg></div>') +
        '</div>' +
        '<div class="artist-card-info">' +
          '<h4>' + name + '</h4>' +
          '<p>' + (type === 'director' ? 'Music Director' : type === 'lyricist' ? 'Lyricist' : 'Artist') + '</p>' +
        '</div>' +
      '</div>'
    },

    async home () {
      dom.pageTitle.textContent = 'Home'
      dom.view.innerHTML = this.skeletonHTML()

      try {
        const homeRes = await API.home()
        const data = homeRes.ok && homeRes.data ? homeRes.data : {}
        const trendingNow = data.trendingNow || []
        const newReleases = data.newReleases || []
        const topCharts = data.topCharts || []
        const moodRomantic = data.moodRomantic || []
        const moodParty = data.moodParty || []
        const moodSad = data.moodSad || []
        const moodEnergy = data.moodEnergy || []
        const topArtists = data.topArtists || []
        const musicDirectors = data.musicDirectors || []
        const lyricists = data.lyricists || []

        let html = '<div class="view view-home">'

        // Hero
        const hero = trendingNow[0]
        if (hero) {
          html += '<div class="hero-section" data-id="' + hero.id + '" data-action="play">' +
            '<img class="hero-bg" src="' + (hero.image || '') + '" alt="">' +
            '<div class="hero-color-accent"></div>' +
            '<div class="hero-gradient-mask"></div>' +
            '<div class="hero-content">' +
              '<span class="hero-badge">' +
                '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5,2 19,12 5,22"/></svg>' +
                'Trending' +
              '</span>' +
              '<h2 class="hero-title">' + escHtml(hero.title) + '</h2>' +
              '<p class="hero-artist">' + escHtml(hero.artist || (hero.uploader && hero.uploader.name) || '') + '</p>' +
              '<div class="hero-actions">' +
                '<button class="hero-play-btn" data-action="play">' +
                  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>' +
                  'Play' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        }

        // New Releases
        if (newReleases.length) {
          html += '<div class="section-row">' +
            '<div class="section-header">' +
              '<h3 class="section-title">New Releases</h3>' +
              '<a class="section-link" href="#browse">See all</a>' +
            '</div>' +
            this.scrollRowHTML(newReleases.slice(0, 10)) +
          '</div>'
        }

        // Trending Now
        if (trendingNow.length > 1) {
          html += '<div class="section-row">' +
            '<div class="section-header">' +
              '<h3 class="section-title">Trending Now</h3>' +
              '<a class="section-link" href="#browse">See all</a>' +
            '</div>' +
            this.scrollRowHTML(trendingNow.slice(1, 11)) +
          '</div>'
        }

        // Top Charts
        if (topCharts.length) {
          html += '<div class="section-row">' +
            '<div class="section-header">' +
              '<h3 class="section-title">Top Charts</h3>' +
              '<a class="section-link" href="#browse">See all</a>' +
            '</div>' +
            this.trackGridHTML(topCharts.slice(0, 6)) +
          '</div>'
        }

        // Moods & Genres
        const moods = [
          { name: 'Romantic', icon: '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" stroke-width="1.5"><path d="M16 28S6 20 4 14a6 6 0 0112-2 6 6 0 0112 2c-2 6-12 14-12 14z"/></svg>' },
          { name: 'Party', icon: '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" stroke-width="1.5"><circle cx="10" cy="16" r="6"/><circle cx="22" cy="16" r="6"/><line x1="16" y1="10" x2="16" y2="22"/><circle cx="16" cy="8" r="2"/></svg>' },
          { name: 'Sad', icon: '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" stroke-width="1.5"><circle cx="16" cy="16" r="12"/><path d="M10 20c2-3 10-3 12 0"/><circle cx="10" cy="11" r="1.5" fill="white"/><circle cx="22" cy="11" r="1.5" fill="white"/></svg>' },
          { name: 'Energy', icon: '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" stroke-width="1.5"><polygon points="16,4 28,28 4,28"/><line x1="16" y1="12" x2="16" y2="22"/><line x1="12" y1="18" x2="20" y2="18"/></svg>' },
        ]
        html += '<div class="section-row">' +
          '<div class="section-header">' +
            '<h3 class="section-title">Moods & Genres</h3>' +
          '</div>' +
          '<div class="genre-grid">' +
            moods.map((g, i) =>
              '<div class="genre-card" data-action="genre" data-genre="' + g.name.toLowerCase() + '">' +
                '<div class="genre-card-bg"></div>' +
                '<div class="genre-card-icon">' + g.icon + '</div>' +
                '<div class="genre-card-content">' + g.name + '</div>' +
              '</div>'
            ).join('') +
            '<div class="genre-card" data-action="genre" data-genre="pop">' +
              '<div class="genre-card-bg"></div>' +
              '<div class="genre-card-icon"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" stroke-width="1.5"><circle cx="16" cy="16" r="12"/><polygon points="16,8 20,16 16,24 12,16"/></svg></div>' +
              '<div class="genre-card-content">Pop</div>' +
            '</div>' +
            '<div class="genre-card" data-action="genre" data-genre="indie">' +
              '<div class="genre-card-bg"></div>' +
              '<div class="genre-card-icon"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" stroke-width="1.5"><path d="M8 24L16 8L24 24"/><line x1="12" y1="18" x2="20" y2="18"/></svg></div>' +
              '<div class="genre-card-content">Indie</div>' +
            '</div>' +
          '</div>' +
        '</div>'

        // Top Artists
        if (topArtists.length) {
          html += '<div class="section-row">' +
            '<div class="section-header">' +
              '<h3 class="section-title">Top Artists</h3>' +
            '</div>' +
            this.artistScrollRowHTML(topArtists.slice(0, 10)) +
          '</div>'
        }

        // Music Directors
        if (musicDirectors.length) {
          const directorsWithType = musicDirectors.map(d => ({ ...d, type: 'director' }))
          html += '<div class="section-row">' +
            '<div class="section-header">' +
              '<h3 class="section-title">Music Directors</h3>' +
            '</div>' +
            this.artistScrollRowHTML(directorsWithType.slice(0, 10)) +
          '</div>'
        }

        // Lyricists
        if (lyricists.length) {
          const lyricistsWithType = lyricists.map(l => ({ ...l, type: 'lyricist' }))
          html += '<div class="section-row">' +
            '<div class="section-header">' +
              '<h3 class="section-title">Lyricists</h3>' +
            '</div>' +
            this.artistScrollRowHTML(lyricistsWithType.slice(0, 8)) +
          '</div>'
        }

        html += '</div>'
        dom.view.innerHTML = html
        this.bindEvents()
      } catch (e) {
        console.error(e)
        dom.view.innerHTML = this.errorHTML()
      }
    },

    async browse (chartType) {
      chartType = chartType || 'daily'
      dom.pageTitle.textContent = 'Browse'
      dom.view.innerHTML = this.skeletonBrowseHTML()

      const tabs = [
        { key: 'daily', label: 'Daily' },
        { key: 'weekly', label: 'Weekly' },
        { key: 'monthly', label: 'Monthly' }
      ]

      try {
        const res = await API.chart(chartType)
        const tracks = res.ok && res.data ? (res.data.results || []) : []

        let html = '<div class="view view-browse">'
        html += '<div class="chart-tabs">'
        tabs.forEach(t => {
          html += '<button class="chart-tab' + (t.key === chartType ? ' active' : '') + '" data-action="chart" data-chart="' + t.key + '">' + t.label + '</button>'
        })
        html += '</div>'

        if (tracks.length) {
          html += '<h3 class="section-title" style="margin-bottom:20px">Top Songs</h3>'
          html += '<div class="track-list">'
          tracks.slice(0, 20).forEach((track, i) => {
            html += this.trackListItemHTML(track, i)
          })
          html += '</div>'
        }

        html += '</div>'
        dom.view.innerHTML = html
        this.bindEvents()
      } catch (e) {
        dom.view.innerHTML = Views.errorHTML()
      }
    },

    async search (query, activeTab) {
      activeTab = activeTab || 'tracks'
      dom.pageTitle.textContent = 'Search'
      dom.view.innerHTML = '<div class="view view-search">' +
        '<div class="search-container">' +
          '<div class="search-wrapper">' +
            '<svg class="search-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>' +
            '<input type="text" id="search-input" placeholder="Search for music..." value="' + escHtml(query || '') + '" autocomplete="off">' +
            '<button class="search-clear' + (query ? ' visible' : '') + '" id="search-clear">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
            '<div id="search-suggestions" class="search-suggestions' + (query ? ' hidden' : '') + '"></div>' +
          '</div>' +
        '</div>' +
        '<div id="search-tabs" class="search-tabs' + (query ? '' : ' hidden') + '">' +
          '<button class="search-tab' + (activeTab === 'tracks' ? ' active' : '') + '" data-search-tab="tracks">Songs</button>' +
          '<button class="search-tab' + (activeTab === 'artists' ? ' active' : '') + '" data-search-tab="artists">Artists</button>' +
          '<button class="search-tab' + (activeTab === 'directors' ? ' active' : '') + '" data-search-tab="directors">Directors</button>' +
          '<button class="search-tab' + (activeTab === 'lyricists' ? ' active' : '') + '" data-search-tab="lyricists">Lyricists</button>' +
        '</div>' +
        '<div id="search-results-area">' +
          this.searchPlaceholderHTML() +
        '</div>' +
      '</div>'

      this.bindSearchEvents()
      if (query && query.length >= 2) {
        this.doSearchInPlace(query, activeTab)
      } else {
        this.showPopularSuggestions()
      }
    },

    searchPlaceholderHTML () {
      return '<div class="search-placeholder"><h3>Search for music</h3><p>Find songs, artists, and albums</p></div>'
    },

    async doSearchInPlace (query, type) {
      type = type || 'tracks'
      const area = $('#search-results-area')
      const tabs = $('#search-tabs')
      if (!area) return
      if (tabs) tabs.classList.remove('hidden')

      area.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;padding:20px 0">' +
        Array(6).fill('<div class="skeleton-card"><div class="skeleton-card-image skeleton-shimmer"></div><div class="skeleton-card-title skeleton-shimmer"></div><div class="skeleton-card-subtitle skeleton-shimmer"></div></div>').join('') +
      '</div>'

      try {
        const res = await API.search(query, type)
        const tracks = res.tracks || []
        const artists = res.artists || []

        if (type === 'tracks') {
          if (tracks.length) {
            let html = '<div class="track-list">'
            tracks.slice(0, 30).forEach((track, i) => {
              html += this.trackListItemHTML(track, i)
            })
            html += '</div>'
            area.innerHTML = html
            this.bindEvents()
          } else {
            area.innerHTML = '<div class="search-placeholder"><h3>No songs found</h3><p>Try a different search term</p></div>'
          }
        } else if (type === 'artists') {
          if (tracks.length) {
            let html = '<div class="section-title" style="margin-bottom:16px;font-size:18px">Related Songs</div>'
            html += '<div class="track-list">'
            tracks.slice(0, 20).forEach((track, i) => {
              html += this.trackListItemHTML(track, i)
            })
            html += '</div>'
            area.innerHTML = html
            this.bindEvents()
          } else {
            area.innerHTML = '<div class="search-placeholder"><h3>No artists found</h3><p>Try a different search term</p></div>'
          }
        } else if (type === 'directors') {
          if (tracks.length) {
            let html = '<div class="section-title" style="margin-bottom:16px;font-size:18px">Songs by ' + escHtml(query) + '</div>'
            html += '<div class="track-list">'
            tracks.slice(0, 20).forEach((track, i) => {
              html += this.trackListItemHTML(track, i)
            })
            html += '</div>'
            area.innerHTML = html
            this.bindEvents()
          } else {
            area.innerHTML = '<div class="search-placeholder"><h3>No results for music director</h3><p>Try a different name</p></div>'
          }
        } else if (type === 'lyricists') {
          if (tracks.length) {
            let html = '<div class="section-title" style="margin-bottom:16px;font-size:18px">Songs by ' + escHtml(query) + '</div>'
            html += '<div class="track-list">'
            tracks.slice(0, 20).forEach((track, i) => {
              html += this.trackListItemHTML(track, i)
            })
            html += '</div>'
            area.innerHTML = html
            this.bindEvents()
          } else {
            area.innerHTML = '<div class="search-placeholder"><h3>No results for lyricist</h3><p>Try a different name</p></div>'
          }
        }
      } catch (e) {
        area.innerHTML = this.errorHTML()
      }
    },

    async artist (slug) {
      dom.pageTitle.textContent = 'Artist'
      dom.view.innerHTML = '<div class="view view-artist">' +
        '<div class="artist-header">' +
          '<div class="artist-image-wrapper"><div class="skeleton-shimmer" style="width:100%;height:100%;border-radius:50%"></div></div>' +
          '<div class="artist-info"><div class="skeleton-shimmer" style="width:200px;height:32px;margin-bottom:8px"></div><div class="skeleton-shimmer" style="width:300px;height:16px"></div></div>' +
        '</div>' +
        Array(5).fill('<div style="display:flex;gap:14px;padding:8px 0;align-items:center"><div class="skeleton-shimmer" style="width:44px;height:44px;border-radius:6px;flex-shrink:0"></div><div style="flex:1"><div class="skeleton-shimmer" style="width:60%;height:14px;margin-bottom:6px"></div><div class="skeleton-shimmer" style="width:40%;height:12px"></div></div></div>').join('') +
      '</div>'

      try {
        const [infoRes, uploadsRes] = await Promise.all([
          API.artist(slug),
          API.artistUploads(slug)
        ])

        const artist = infoRes.ok && infoRes.data ? infoRes.data.results : null
        const uploads = uploadsRes.ok && uploadsRes.data ? (uploadsRes.data.results || []) : []

        if (!artist) {
          dom.view.innerHTML = Views.errorHTML()
          return
        }

        let html = '<div class="view view-artist">'

        html += '<div class="artist-header">' +
          '<div class="artist-image-wrapper">' +
            '<img src="' + (artist.image || '') + '" alt="' + escHtml(artist.name || '') + '">' +
          '</div>' +
          '<div class="artist-info">' +
            '<h1>' + escHtml(artist.name || 'Unknown') + '</h1>' +
            (artist.genre ? '<p class="artist-genre">' + escHtml(artist.genre) + '</p>' : '') +
            '<div class="artist-stats">' +
              '<span class="artist-stat"><strong>' + (artist.upload_count || 0) + '</strong> tracks</span>' +
              '<span class="artist-stat"><strong>' + (artist.favorites_count || 0) + '</strong> albums</span>' +
            '</div>' +
          '</div>' +
        '</div>'

        if (uploads.length) {
          html += '<h3 class="section-title" style="margin-bottom:16px">Top Tracks</h3>'
          html += '<div class="track-list">'
          uploads.forEach((track, i) => {
            html += this.trackListItemHTML(track, i)
          })
          html += '</div>'
        } else {
          html += '<p style="color:var(--text-tertiary);padding:20px 0">No tracks found.</p>'
        }

        html += '</div>'
        dom.view.innerHTML = html
        this.bindEvents()
      } catch (e) {
        dom.view.innerHTML = this.errorHTML()
      }
    },

    async director (name) {
      dom.pageTitle.textContent = 'Music Director'
      dom.view.innerHTML = '<div class="view"><div class="skeleton-shimmer" style="height:160px;margin-bottom:28px;border-radius:12px"></div>' +
        Array(5).fill('<div style="display:flex;gap:14px;padding:8px 0;align-items:center"><div class="skeleton-shimmer" style="width:44px;height:44px;border-radius:6px;flex-shrink:0"></div><div style="flex:1"><div class="skeleton-shimmer" style="width:60%;height:14px;margin-bottom:6px"></div><div class="skeleton-shimmer" style="width:40%;height:12px"></div></div></div>').join('') +
      '</div>'

      try {
        const res = await API.director(name)
        const tracks = res.ok && res.data ? (res.data.results || []) : []

        let html = '<div class="view view-artist">'
        html += '<div class="artist-header">' +
          '<div class="artist-image-wrapper" style="border-radius:var(--radius-md)">' +
            '<div class="artist-card-placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--glass-bg-light)"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>' +
          '</div>' +
          '<div class="artist-info">' +
            '<h1>' + escHtml(name) + '</h1>' +
            '<p>Music Director</p>' +
            '<div class="artist-stats"><span class="artist-stat"><strong>' + tracks.length + '</strong> tracks</span></div>' +
          '</div>' +
        '</div>'

        if (tracks.length) {
          html += '<h3 class="section-title" style="margin-bottom:16px">Popular Songs</h3>'
          html += '<div class="track-list">'
          tracks.forEach((track, i) => {
            html += this.trackListItemHTML(track, i)
          })
          html += '</div>'
        }

        html += '</div>'
        dom.view.innerHTML = html
        this.bindEvents()
      } catch (e) {
        dom.view.innerHTML = this.errorHTML()
      }
    },

    async lyricist (name) {
      dom.pageTitle.textContent = 'Lyricist'
      dom.view.innerHTML = '<div class="view"><div class="skeleton-shimmer" style="height:160px;margin-bottom:28px;border-radius:12px"></div>' +
        Array(5).fill('<div style="display:flex;gap:14px;padding:8px 0;align-items:center"><div class="skeleton-shimmer" style="width:44px;height:44px;border-radius:6px;flex-shrink:0"></div><div style="flex:1"><div class="skeleton-shimmer" style="width:60%;height:14px;margin-bottom:6px"></div><div class="skeleton-shimmer" style="width:40%;height:12px"></div></div></div>').join('') +
      '</div>'

      try {
        const res = await API.lyricist(name)
        const tracks = res.ok && res.data ? (res.data.results || []) : []

        let html = '<div class="view view-artist">'
        html += '<div class="artist-header">' +
          '<div class="artist-image-wrapper" style="border-radius:var(--radius-md)">' +
            '<div class="artist-card-placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--glass-bg-light)"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></div>' +
          '</div>' +
          '<div class="artist-info">' +
            '<h1>' + escHtml(name) + '</h1>' +
            '<p>Lyricist</p>' +
            '<div class="artist-stats"><span class="artist-stat"><strong>' + tracks.length + '</strong> tracks</span></div>' +
          '</div>' +
        '</div>'

        if (tracks.length) {
          html += '<h3 class="section-title" style="margin-bottom:16px">Written Songs</h3>'
          html += '<div class="track-list">'
          tracks.forEach((track, i) => {
            html += this.trackListItemHTML(track, i)
          })
          html += '</div>'
        }

        html += '</div>'
        dom.view.innerHTML = html
        this.bindEvents()
      } catch (e) {
        dom.view.innerHTML = this.errorHTML()
      }
    },

    async playlist (id) {
      dom.pageTitle.textContent = 'Playlist'
      dom.view.innerHTML = '<div class="view"><div class="skeleton-hero skeleton-shimmer" style="height:160px;margin-bottom:28px"></div>' +
        Array(8).fill('<div style="display:flex;gap:14px;padding:8px 0;align-items:center"><div class="skeleton-shimmer" style="width:44px;height:44px;border-radius:6px;flex-shrink:0"></div><div style="flex:1"><div class="skeleton-shimmer" style="width:60%;height:14px;margin-bottom:6px"></div><div class="skeleton-shimmer" style="width:40%;height:12px"></div></div></div>').join('') +
      '</div>'

      try {
        const res = await API.search(id.replace(/[^a-zA-Z0-9\s]/g, ' ') + ' playlist')
        const tracks = res.tracks || []

        let html = '<div class="view view-playlist">'
        html += '<div class="playlist-header">' +
          '<div class="playlist-image-wrapper">' +
            '<img src="' + (tracks[0]?.image || '') + '" alt="Playlist">' +
          '</div>' +
          '<div class="playlist-info">' +
            '<h1>Playlist</h1>' +
            '<div class="playlist-meta">' +
              '<span>Various artists</span>' +
              '<span>' + tracks.length + ' songs</span>' +
            '</div>' +
            '<div class="playlist-actions">' +
              '<button class="play-all-btn" data-action="play-all">' +
                '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>' +
                'Play' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>'

        if (tracks.length) {
          html += '<div class="track-list" data-queue="all">'
          tracks.forEach((track, i) => {
            html += this.trackListItemHTML(track, i)
          })
          html += '</div>'
        }

        html += '</div>'
        dom.view.innerHTML = html
        this.bindEvents()
      } catch (e) {
        dom.view.innerHTML = this.errorHTML()
      }
    },

    async music (id) {
      dom.pageTitle.textContent = 'Track'
      dom.view.innerHTML = '<div class="view"><div class="skeleton-hero skeleton-shimmer" style="height:160px;margin-bottom:28px"></div></div>'

      try {
        const res = await API.music(id)
        const data = res.ok && res.data ? res.data.results : null

        if (!data) {
          dom.view.innerHTML = Views.errorHTML()
          return
        }

        const title = escHtml(data.title || 'Unknown')
        const artist = escHtml(data.artist || (data.uploader && data.uploader.name) || 'Unknown')
        const image = data.image || ''

        let html = '<div class="view view-music">'
        html += '<div class="playlist-header">' +
          '<div class="playlist-image-wrapper">' +
            '<img src="' + image + '" alt="' + title + '">' +
          '</div>' +
          '<div class="playlist-info">' +
            '<h1>' + title + '</h1>' +
            '<div class="playlist-meta">' +
              '<span>' + artist + '</span>' +
            '</div>' +
            '<div class="playlist-actions">' +
              '<button class="play-all-btn" data-action="play" data-id="' + data.id + '">' +
                '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>' +
                'Play' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>'
        html += '</div>'
        dom.view.innerHTML = html
        this.bindEvents()
      } catch (e) {
        dom.view.innerHTML = this.errorHTML()
      }
    },

    bindEvents () {
      $$('[data-action="play"]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          const trackEl = el.closest('[data-id]') || el
          const id = trackEl.dataset.id
          if (!id) return
          const card = el.closest('.track-card, .track-list-item, .hero-section')
          let track = null
          if (card) {
            const titleEl = card.querySelector('.track-card-info h4, .track-list-title, .hero-title')
            const artistEl = card.querySelector('.track-card-info p, .track-list-artist, .hero-artist')
            const imgEl = card.querySelector('img')
            const title = titleEl ? titleEl.textContent : 'Unknown'
            const artist = artistEl ? artistEl.textContent : 'Unknown'
            const image = imgEl ? imgEl.src : ''
            track = { id, title, artist, image, streaming_url: '/data/stream/' + id }
          }
          if (!track) {
            track = { id, title: 'Unknown', artist: 'Unknown', image: '', streaming_url: '/data/stream/' + id }
          }
          Player.play(track)
        })
      })

      $$('[data-action="play-all"]').forEach(el => {
        el.addEventListener('click', () => {
          const items = $$('.track-list-item')
          const tracks = items.map(item => ({
            id: item.dataset.id,
            title: item.querySelector('.track-list-title')?.textContent || 'Unknown',
            artist: item.querySelector('.track-list-artist')?.textContent || 'Unknown',
            image: item.querySelector('.track-list-image')?.src || '',
            streaming_url: '/data/stream/' + item.dataset.id
          }))
          if (tracks.length) Player.playAll(tracks)
        })
      })

      $$('[data-action="genre"]').forEach(el => {
        el.addEventListener('click', () => {
          const genre = el.dataset.genre
          if (genre) navigate('#search?q=' + encodeURIComponent(genre + ' hindi songs'))
        })
      })

      $$('[data-action="chart"]').forEach(el => {
        el.addEventListener('click', () => {
          const type = el.dataset.chart
          if (type) navigate('#browse?chart=' + type)
        })
      })

      $$('[data-action="artist"]').forEach(el => {
        el.addEventListener('click', () => {
          const name = el.querySelector('h4')?.textContent
          if (name) navigate('#search?q=' + encodeURIComponent(name))
        })
      })

      $$('[data-action="category-artist"]').forEach(el => {
        el.addEventListener('click', () => {
          const name = decodeURIComponent(el.dataset.name)
          if (name) navigate('#search?q=' + encodeURIComponent(name) + '&type=artists')
        })
      })

      $$('[data-action="category-director"]').forEach(el => {
        el.addEventListener('click', () => {
          const name = decodeURIComponent(el.dataset.name)
          if (name) navigate('#search?q=' + encodeURIComponent(name) + '&type=directors')
        })
      })

      $$('[data-action="category-lyricist"]').forEach(el => {
        el.addEventListener('click', () => {
          const name = decodeURIComponent(el.dataset.name)
          if (name) navigate('#search?q=' + encodeURIComponent(name) + '&type=lyricists')
        })
      })

      $$('[data-action="like"]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          Toast.show('Added to favorites')
        })
      })
    },

    bindSearchEvents () {
      const input = $('#search-input')
      if (!input) return
      const clearBtn = $('#search-clear')
      const tabs = $$('.search-tab')

      const getActiveTab = () => {
        const active = $('#search-tabs .search-tab.active')
        return active ? active.dataset.searchTab : 'tracks'
      }

      // Full search results (slower debounce)
      const doSearch = debounce((q) => {
        if (q.length >= 2) {
          const tabTabs = $('#search-tabs')
          if (tabTabs) tabTabs.classList.remove('hidden')
          Views.doSearchInPlace(q, getActiveTab())
        } else if (q.length === 0) {
          const area = $('#search-results-area')
          if (area) area.innerHTML = Views.searchPlaceholderHTML()
          const tabTabs = $('#search-tabs')
          if (tabTabs) tabTabs.classList.add('hidden')
        }
      }, 350)

      // Suggestions dropdown (faster debounce)
      const doSuggestions = debounce((q) => {
        if (q.length >= 2) {
          Views.showSuggestions(q)
        } else if (q.length === 0) {
          Views.showPopularSuggestions()
        } else {
          Views.hideSuggestions()
        }
      }, 150)

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'))
          tab.classList.add('active')
          const q = input.value.trim()
          if (q.length >= 2) {
            Views.doSearchInPlace(q, tab.dataset.searchTab)
            Views.hideSuggestions()
          }
        })
      })

      input.addEventListener('input', () => {
        const q = input.value.trim()
        clearBtn.classList.toggle('visible', !!q)
        doSearch(q)
        doSuggestions(q)
      })

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = input.value.trim()
          if (q) {
            Views.hideSuggestions()
            navigate('#search?q=' + encodeURIComponent(q) + '&type=' + getActiveTab())
          }
        }
        if (e.key === 'Escape') {
          Views.hideSuggestions()
          input.blur()
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const suggestions = $('#search-suggestions')
          if (!suggestions || suggestions.classList.contains('hidden')) return
          e.preventDefault()
          const items = $$('.suggestion-item', suggestions)
          let idx = items.findIndex(el => el.classList.contains('highlighted'))
          items.forEach(el => el.classList.remove('highlighted'))
          if (e.key === 'ArrowDown') {
            idx = idx < items.length - 1 ? idx + 1 : 0
          } else {
            idx = idx > 0 ? idx - 1 : items.length - 1
          }
          items[idx].classList.add('highlighted')
          items[idx].scrollIntoView({ block: 'nearest' })
        }
      })

      input.addEventListener('blur', () => {
        setTimeout(() => Views.hideSuggestions(), 200)
      })

      input.addEventListener('focus', () => {
        const q = input.value.trim()
        if (q.length >= 2) {
          Views.showSuggestions(q)
        } else {
          Views.showPopularSuggestions()
        }
      })

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          input.value = ''
          clearBtn.classList.remove('visible')
          input.focus()
          const area = $('#search-results-area')
          if (area) area.innerHTML = Views.searchPlaceholderHTML()
          const tabTabs = $('#search-tabs')
          if (tabTabs) tabTabs.classList.add('hidden')
          Views.showPopularSuggestions()
        })
      }

      setTimeout(() => input.focus(), 100)

      // Handle suggestion clicks via mousedown (fires before blur)
      const suggestionsContainer = $('#search-suggestions')
      if (suggestionsContainer) {
        suggestionsContainer.addEventListener('mousedown', (e) => {
          const item = e.target.closest('.suggestion-item')
          if (!item) return
          const type = item.dataset.suggestionType

          if (type === 'play') {
            const track = {
              id: item.dataset.trackId,
              title: item.dataset.trackTitle,
              artist: item.dataset.trackArtist,
              image: item.dataset.trackImage,
              streaming_url: '/data/stream/' + item.dataset.trackId
            }
            Player.play(track)
            Views.hideSuggestions()
            e.preventDefault()
            return
          }

          if (type === 'search' || type === 'search-all') {
            const q = item.dataset.suggestionQuery
            if (q) {
              Views.hideSuggestions()
              navigate('#search?q=' + encodeURIComponent(q))
            }
            e.preventDefault()
            return
          }

          if (type === 'artist') {
            const q = item.dataset.suggestionQuery
            if (q) {
              Views.hideSuggestions()
              navigate('#search?q=' + encodeURIComponent(q) + '&type=artists')
            }
            e.preventDefault()
            return
          }

          if (type === 'director') {
            const q = item.dataset.suggestionQuery
            if (q) {
              Views.hideSuggestions()
              navigate('#search?q=' + encodeURIComponent(q) + '&type=directors')
            }
            e.preventDefault()
            return
          }
        })
      }
    },

    showPopularSuggestions () {
      const container = $('#search-suggestions')
      if (!container) return
      const popular = [
        { text: 'Arijit Singh', sub: 'Popular artist', type: 'artist' },
        { text: 'Latest Bollywood Hits', sub: 'Trending songs', type: 'search' },
        { text: 'Romantic Hindi Songs', sub: 'Mood playlist', type: 'search' },
        { text: 'AR Rahman', sub: 'Music director', type: 'director' },
        { text: 'Party Bollywood Songs', sub: 'Mood playlist', type: 'search' },
      ]
      let html = '<div class="suggestion-section-label">Popular Searches</div>'
      popular.forEach(p => {
        html += '<div class="suggestion-item" data-suggestion-type="' + p.type + '" data-suggestion-query="' + escHtml(p.text) + '">' +
          '<div class="suggestion-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></div>' +
          '<div class="suggestion-info">' +
            '<div class="suggestion-title">' + escHtml(p.text) + '</div>' +
            '<div class="suggestion-sub">' + escHtml(p.sub) + '</div>' +
          '</div>' +
          '<div class="suggestion-action">Search</div>' +
        '</div>'
      })
      container.innerHTML = html
      container.classList.remove('hidden')
    },

    async showSuggestions (query) {
      const container = $('#search-suggestions')
      if (!container) return

      try {
        const res = await API.search(query, 'tracks')
        const tracks = (res.tracks || []).slice(0, 5)
        let html = ''

        if (tracks.length) {
          html += '<div class="suggestion-section-label">Songs</div>'
          tracks.forEach(t => {
            const img = escHtml(t.image || '')
            html += '<div class="suggestion-item" data-suggestion-type="play" data-track-id="' + escHtml(t.id) + '" data-track-title="' + escHtml(t.title) + '" data-track-artist="' + escHtml(t.artist) + '" data-track-image="' + img + '">' +
              (t.image ? '<img src="' + img + '" alt="" loading="lazy">' : '<div class="suggestion-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="8,5 19,12 8,19"/></svg></div>') +
              '<div class="suggestion-info">' +
                '<div class="suggestion-title">' + escHtml(t.title) + '</div>' +
                '<div class="suggestion-sub">' + escHtml(t.artist) + '</div>' +
              '</div>' +
              '<div class="suggestion-action">Play</div>' +
            '</div>'
          })
        }

        html += '<div class="suggestion-item" data-suggestion-type="search-all" data-suggestion-query="' + escHtml(query) + '">' +
          '<div class="suggestion-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></div>' +
          '<div class="suggestion-info">' +
            '<div class="suggestion-title">Search for "' + escHtml(query) + '"</div>' +
            '<div class="suggestion-sub">See all results</div>' +
          '</div>' +
          '<div class="suggestion-action">Enter</div>' +
        '</div>'

        container.innerHTML = html
        container.classList.remove('hidden')
      } catch (e) {
        container.classList.add('hidden')
      }
    },

    hideSuggestions () {
      const container = $('#search-suggestions')
      if (container) container.classList.add('hidden')
    },
  }

  function navigate (hash) {
    if (hash === '#home' || !hash) {
      window.location.hash = 'home'
    } else {
      window.location.hash = hash.replace(/^#/, '')
    }
  }

  function handleRoute () {
    const hash = window.location.hash.replace(/^#/, '') || 'home'
    let [route, queryString] = hash.split('?')
    const params = {}
    if (queryString) {
      queryString.split('&').forEach(pair => {
        const [k, v] = pair.split('=')
        params[decodeURIComponent(k)] = decodeURIComponent(v || '')
      })
    }

    let activeNav = route
    if (route === 'artist' || route === 'music' || route === 'playlist' || route === 'album') activeNav = 'browse'
    if (route === 'search') activeNav = 'search'

    dom.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.view === activeNav)
      if (item.dataset.view === activeNav) {
        dom.pageTitle.textContent = item.querySelector('span')?.textContent || 'Home'
      }
    })
    dom.tabItems.forEach(item => {
      item.classList.toggle('active', item.dataset.view === activeNav)
    })

    switch (route) {
      case 'home': Views.home(); break
      case 'browse': Views.browse(params.chart || 'daily'); break
      case 'search': Views.search(params.q || '', params.type || 'tracks'); break
      case 'artist': if (params.slug) Views.artist(params.slug); else navigate('#home'); break
      case 'director': if (params.name) Views.director(params.name); else navigate('#home'); break
      case 'lyricist': if (params.name) Views.lyricist(params.name); else navigate('#home'); break
      case 'album': if (params.slug) Views.artist(params.slug); else navigate('#home'); break
      case 'playlist': if (params.id) Views.playlist(params.id); else navigate('#home'); break
      case 'music': if (params.id) Views.music(params.id); else navigate('#home'); break
      default: navigate('#home')
    }
  }

  function initUI () {
    dom.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault()
        const view = item.dataset.view
        navigate('#' + view)
        dom.sidebar.classList.remove('open')
        dom.overlay.classList.remove('visible')
      })
    })

    dom.tabItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault()
        const view = item.dataset.view
        navigate('#' + view)
      })
    })

    dom.mobileMenuBtn.addEventListener('click', () => {
      dom.sidebar.classList.toggle('open')
      dom.overlay.classList.toggle('visible')
    })

    dom.overlay.addEventListener('click', () => {
      dom.sidebar.classList.remove('open')
      dom.overlay.classList.remove('visible')
    })

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      switch (e.code) {
        case 'Space': e.preventDefault(); Player.togglePlay(); break
        case 'ArrowLeft': Player.prev(); break
        case 'ArrowRight': Player.next(); break
      }
    })

    if (window.location.hash.includes('search')) {
      setTimeout(() => {
        const input = $('#search-input')
        if (input) input.focus()
      }, 200)
    }
  }

  function init () {
    Player.init()
    handleRoute()
    window.addEventListener('hashchange', handleRoute)
    initUI()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
