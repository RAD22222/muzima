import path from 'node:path'
import os from 'node:os'

export const PORT = parseInt(process.env.PORT || '5500', 10)
export const ROOT = path.resolve(import.meta.dirname, '..')
export const CACHE_DIR = process.env.CACHE_DIR || path.join(os.tmpdir(), 'muzima-cache')
export const SEARCH_CACHE_TTL = 30 * 60 * 1000
export const RATE_LIMIT_MAX = 30
export const RATE_LIMIT_WINDOW = 60_000
export const COOKIES_FILE = process.env.COOKIES_FILE || ''

export const POPULAR_SINGERS = [
  'Arijit Singh', 'Neha Kakkar', 'Atif Aslam', 'Shreya Ghoshal',
  'Kumar Sanu', 'Udit Narayan', 'Alka Yagnik', 'Sonu Nigam',
  'KK', 'Lata Mangeshkar', 'Sukhwinder Singh', 'Sunidhi Chauhan',
  'Mohit Chauhan', 'Jubin Nautiyal', 'Darshan Raval', 'B Praak',
  'Himesh Reshammiya', 'Shaan', 'Kailash Kher', 'Badshah',
]

export const MUSIC_DIRECTORS = [
  'AR Rahman', 'Vishal-Shekhar', 'Pritam', 'Shankar-Ehsaan-Loy',
  'Laxmikant-Pyarelal', 'RD Burman', 'SD Burman', 'Anu Malik',
  'Himesh Reshammiya', 'Amit Trivedi', 'Sachin-Jigar', 'Mithoon',
  'Tanishk Bagchi', 'Amaal Mallik', 'Jatin-Lal',
]

export const LYRICISTS = [
  'Gulzar', 'Javed Akhtar', 'Irshad Kamil', 'Amitabh Bhattacharya',
  'Sameer', 'Prasoon Joshi', 'Manoj Muntashir', 'Anand Bakshi',
  'Swanand Kirkire',
]
