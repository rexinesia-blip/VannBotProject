const axios = require('axios')
const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

// =========================================================
// ðŸŽ¨ CONSOLE LOGGER - Enhanced Logging System
// =========================================================
const Logger = {
  info(message) { console.log(`[AI-INFO] ${message}`) },
  error(message) { console.log(`[AI-ERROR] ${message}`) },
  success(message) { console.log(`[AI-SUCCESS] ${message}`) },
  warn(message) { console.log(`[AI-WARN] ${message}`) },
  debug(message) { console.log(`[AI-DEBUG] ${message}`) },
  db(message) { console.log(`[AI-DB] ${message}`) },
  whisper(message) { console.log(`[AI-WHISPER] ${message}`) },
  global(message) { console.log(`[AI-GLOBAL] ${message}`) },
  queue(message) { console.log(`[AI-QUEUE] ${message}`) },
  route(message) { console.log(`[AI-ROUTE] ${message}`) },
  multibot(message) { console.log(`[AI-MULTIBOT] ${message}`) },
  rank(message) { console.log(`[AI-RANK] ${message}`) }
}

// =========================================================
// ðŸ¤– MULTI-BOT CONFIGURATION - 4 Bot Slots
// =========================================================
const AI_BOT_SLOTS = [
  { 
    username: 'ChatGPT_API', 
    maxChars: 30, 
    role: 'primary',
    lineIndex: 0,
    format: (username, text) => `${username}: ${text}`
  },
  { 
    username: 'Ciaa', 
    maxChars: 60, 
    role: 'secondary',
    lineIndex: 1,
    format: (username, text) => text
  },
  { 
    username: 'Archivion', 
    maxChars: 60, 
    role: 'secondary',
    lineIndex: 2,
    format: (username, text) => text
  },
  { 
    username: 'Ryzen', 
    maxChars: 60, 
    role: 'footer',
    lineIndex: 3,
    format: (username, text) => text
  }
]

// Global bot registry
const registeredBots = new Map()

// =========================================================
// ðŸ† RANK DETECTOR - Extract Username from Rank Format
// =========================================================
class RankDetector {
  constructor() {
    this.ranks = [
      'SCOUT', 'ADVENTURER', 'GUARDIAN', 'SQUIRE', 'KNIGHT', 
      'NOBLE', 'GOVERNOR', 'DUKE', 'ARCHDUKE', 'LORD', 
      'OVERLORD', 'HIGH COUNCILOR', 'SOVEREIGN', 'ETERNAL', 'AN-MAZING'
    ]

    // Build regex pattern for rank detection
    const rankPattern = this.ranks.join('|')
    // Match: [RANK] Username * or [RANK] Username *
    this.rankRegex = new RegExp(`\\[(${rankPattern})\\]\\s+([^\\*]+?)\\s*\\*`, 'i')

    Logger.success(`RankDetector initialized with ${this.ranks.length} ranks`)
  }

  extractUsername(chatMessage) {
    // Try to extract username from rank format: [RANK] Username *
    const match = chatMessage.match(this.rankRegex)

    if (match) {
      const rank = match[1]
      const username = match[2].trim()

      // Clean the extracted username
      const cleanUser = this.cleanUsername(username)

      Logger.rank(`Detected rank [${rank}] for user: ${cleanUser}`)
      return {
        hasRank: true,
        rank: rank,
        username: cleanUser
      }
    }

    // No rank found
    return {
      hasRank: false,
      rank: null,
      username: null
    }
  }

  cleanUsername(username) {
    if (!username) return null

    // Remove color codes, spaces, special chars
    return username
      .replace(/Â§[0-9a-fk-or]/g, '')
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '')
  }

  parseGlobalChat(username, message) {
    // REVISI: First try to extract from rank format
    // If username contains rank format like "[DUKE] Vann *", extract the real username
    const extracted = this.extractUsername(username)

    if (extracted.hasRank && extracted.username) {
      // Rank detected, use extracted username
      Logger.rank(`Parsed with rank: [${extracted.rank}] ${extracted.username}`)
      return {
        username: extracted.username,
        message: message,
        hasRank: true,
        rank: extracted.rank
      }
    }

    // No rank, just clean the username
    const cleanUser = this.cleanUsername(username)
    Logger.rank(`Parsed without rank: ${cleanUser}`)

    return {
      username: cleanUser,
      message: message,
      hasRank: false
    }
  }
}

// =========================================================
// ðŸ’¬ WHISPER PATTERN MATCHER - 30+ Patterns
// =========================================================
class WhisperPatternMatcher {
  constructor() {
    this.patterns = [
      // ===== GROUP 1: [WHISPER] formats =====
      {
        name: 'WHISPER_BASIC',
        priority: 10,
        regex: /^\[WHISPER\]\s+([^:]+):\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'WHISPER_WITH_RANK',
        priority: 20,
        regex: /^\[WHISPER\]\s+\[([^\]]+)\]\s+([^:]+):\s+(.+)$/,
        extract: (match) => ({
          rank: match[1],
          sender: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'WHISPER_WITH_RANK_GUILD',
        priority: 25,
        regex: /^\[WHISPER\]\s+\[([^\]]+)\]\s+([^\s]+)\s*\*([^\s:]+):\s+(.+)$/,
        extract: (match) => ({
          rank: match[1],
          sender: this.cleanUsername(match[2]),
          guild: match[3],
          message: match[4].trim()
        })
      },
      {
        name: 'WHISPER_COLORED',
        priority: 15,
        regex: /^\[WHISPER\]\s+(?:Â§[0-9a-fk-or])*([^:Â§]+)(?:Â§[0-9a-fk-or])*:\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      // ===== GROUP 2: âœ‰ï¸â¬‡ MSG formats =====
      {
        name: 'MSG_ARROW_DOWN_RIGHT',
        priority: 30,
        regex: /âœ‰ï¸â¬‡\s+MSG\s+(.+?)\s+[âžºâ†’']\s+(.+?)\s+(.+)/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'MSG_ARROW_UP_RIGHT',
        priority: 30,
        regex: /âœ‰ï¸â¬†\s+MSG\s+(.+?)\s+[âžºâ†’']\s+(.+?)\s+(.+)/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'MSG_DOUBLE_ARROW',
        priority: 25,
        regex: /âœ‰ï¸â¬‡\s+MSG\s+(.+?)\s+<->\s+(.+?)\s+(.+)/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'MSG_WITH_RANKS',
        priority: 35,
        regex: /âœ‰ï¸â¬‡\s+MSG\s+\[([^\]]+)\]\s+(.+?)\s+[âžºâ†’']\s+\[([^\]]+)\]\s+(.+?)\s+(.+)/,
        extract: (match) => ({
          senderRank: match[1],
          sender: this.cleanUsername(match[2]),
          toRank: match[3],
          to: this.cleanUsername(match[4]),
          message: match[5].trim()
        })
      },
      {
        name: 'MSG_ARROWS_VARIANTS',
        priority: 28,
        regex: /âœ‰ï¸â¬‡\s+MSG\s+(.+?)\s+[â‡’âŸ¶=>]\s+(.+?)\s+(.+)/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      // ===== GROUP 3: From/To formats =====
      {
        name: 'FROM_TO_BASIC',
        priority: 12,
        regex: /^From\s+([^:]+):\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'FROM_TO_ARROW',
        priority: 15,
        regex: /^From\s+(.+?)\s+to\s+(.+?):\s+(.+)$/i,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'TO_FROM_REVERSE',
        priority: 15,
        regex: /^To\s+(.+?)\s+from\s+(.+?):\s+(.+)$/i,
        extract: (match) => ({
          to: this.cleanUsername(match[1]),
          sender: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'FROM_COLON',
        priority: 10,
        regex: /^From:\s+([^\s]+)\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      // ===== GROUP 4: [PM] / [DM] formats =====
      {
        name: 'PM_BASIC',
        priority: 10,
        regex: /^\[PM\]\s+([^:]+):\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'DM_BASIC',
        priority: 10,
        regex: /^\[DM\]\s+([^:]+):\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'PM_WITH_RANK',
        priority: 20,
        regex: /^\[PM\]\s+\[([^\]]+)\]\s+([^:]+):\s+(.+)$/,
        extract: (match) => ({
          rank: match[1],
          sender: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'DM_WITH_RANK',
        priority: 20,
        regex: /^\[DM\]\s+\[([^\]]+)\]\s+([^:]+):\s+(.+)$/,
        extract: (match) => ({
          rank: match[1],
          sender: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'MSG_BRACKET',
        priority: 18,
        regex: /^\[MSG\]\s+([^:]+):\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      // ===== GROUP 5: Essentials/Plugin formats =====
      {
        name: 'ESSENTIALS_TO_ME',
        priority: 22,
        regex: /^\[(.+?)\s+->\s+me\]\s+(.+)$/i,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'ESSENTIALS_FROM_ME',
        priority: 22,
        regex: /^\[me\s+->\s+(.+?)\]\s+(.+)$/i,
        extract: (match) => ({
          to: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'ESSENTIALS_ARROW',
        priority: 20,
        regex: /^\[(.+?)\s+->\s+(.+?)\]\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'ESSENTIALS_RANK',
        priority: 28,
        regex: /^\[\[([^\]]+)\]\s+(.+?)\s+->\s+(.+?)\]\s+(.+)$/,
        extract: (match) => ({
          rank: match[1],
          sender: this.cleanUsername(match[2]),
          to: this.cleanUsername(match[3]),
          message: match[4].trim()
        })
      },
      // ===== GROUP 6: Custom server formats =====
      {
        name: 'HYPHEN_FORMAT',
        priority: 8,
        regex: /^-\s*([^\s]+)\s*-\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'BRACKET_USERNAME',
        priority: 15,
        regex: /^<([^>]+)>\s*->\s*<([^>]+)>:\s*(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'ASTERISK_WHISPER',
        priority: 12,
        regex: /^\*([^\s]+)\*\s+whispers?:\s+(.+)$/i,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'PARENTHESIS_WHISPER',
        priority: 18,
        regex: /^\(Whisper from ([^)]+)\):\s+(.+)$/i,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'ARROW_SIMPLE',
        priority: 8,
        regex: /^([^\s]+)\s+->\s+(.+?):\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      // ===== GROUP 7: Unicode emoji variants =====
      {
        name: 'ENVELOPE_PACKAGE',
        priority: 30,
        regex: /ðŸ“©\s+(.+?)\s+â†’\s+(.+?):\s+(.+)/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      {
        name: 'ENVELOPE_INCOMING',
        priority: 28,
        regex: /ðŸ“¨\s+From\s+(.+?):\s+(.+)/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'SPEECH_BUBBLE',
        priority: 25,
        regex: /ðŸ’¬\s+([^:]+):\s+(.+)$/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'MEMO_ENVELOPE',
        priority: 23,
        regex: /ðŸ“âœ‰\s+(.+?)\s+[âžºâ†’']\s+(.+?)\s+(.+)/,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          to: this.cleanUsername(match[2]),
          message: match[3].trim()
        })
      },
      // ===== GROUP 8: Server-specific custom formats =====
      {
        name: 'WHISPER_PREFIX_COLON',
        priority: 18,
        regex: /^Whisper:\s+([^\s]+)\s+(.+)$/i,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'TELL_FORMAT',
        priority: 15,
        regex: /^([^\s]+)\s+tells you:\s+(.+)$/i,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      },
      {
        name: 'SAYS_QUIETLY',
        priority: 12,
        regex: /^([^\s]+)\s+says quietly:\s+(.+)$/i,
        extract: (match) => ({
          sender: this.cleanUsername(match[1]),
          message: match[2].trim()
        })
      }
    ]

    this.patterns.sort((a, b) => b.priority - a.priority)
    Logger.success(`WhisperPatternMatcher initialized with ${this.patterns.length} patterns`)
  }

  cleanUsername(username) {
    return username
      .replace(/Â§[0-9a-fk-or]/g, '')
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '')
  }

  parseWhisper(message) {
    for (const pattern of this.patterns) {
      try {
        const match = message.match(pattern.regex)
        if (match) {
          const extracted = pattern.extract(match)
          if (extracted.sender && extracted.message) {
            Logger.whisper(`Matched: ${pattern.name} from ${extracted.sender}`)
            return {
              matched: true,
              patternName: pattern.name,
              priority: pattern.priority,
              ...extracted
            }
          }
        }
      } catch (error) {
        Logger.warn(`Pattern ${pattern.name} error: ${error.message}`)
        continue
      }
    }

    return {
      matched: false,
      patternName: null,
      sender: null,
      message: null
    }
  }
}

// =========================================================
// ðŸ’¾ DATABASE MANAGER - SQLite with Channel Tracking
// =========================================================
class DatabaseManager {
  constructor() {
    this.dbPath = 'ai-history.db'
    this.db = null
    this.initDatabase()
    Logger.db('DatabaseManager initialized')
  }

  initDatabase() {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        Logger.error(`Database connection failed: ${err.message}`)
      } else {
        Logger.success(`Database connected: ${this.dbPath}`)
      }
    })

    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          channel TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          model TEXT,
          timestamp INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) Logger.error(`Table creation failed: ${err.message}`)
        else Logger.success('Table: conversations ready')
      })

      this.db.run(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          username TEXT PRIMARY KEY,
          preferred_model TEXT DEFAULT 'gpt-3.5-turbo',
          total_requests INTEGER DEFAULT 0,
          global_requests INTEGER DEFAULT 0,
          whisper_requests INTEGER DEFAULT 0,
          last_request INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) Logger.error(`Table creation failed: ${err.message}`)
        else Logger.success('Table: user_preferences ready')
      })

      this.db.run(`
        CREATE TABLE IF NOT EXISTS stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          channel TEXT,
          details TEXT,
          timestamp INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) Logger.error(`Table creation failed: ${err.message}`)
        else Logger.success('Table: stats ready')
      })

      this.db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_username ON conversations(username)`)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel)`)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp)`)
    })
  }

  saveMessage(username, channel, role, content, model = null) {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now()
      this.db.run(
        `INSERT INTO conversations (username, channel, role, content, model, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [username, channel, role, content, model, timestamp],
        (err) => {
          if (err) {
            Logger.error(`Save message failed: ${err.message}`)
            reject(err)
          } else {
            Logger.db(`Message saved: ${username} [${channel}]`)
            resolve()
          }
        }
      )
    })
  }

  getConversationHistory(username, channel, limit = 5) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT role, content FROM conversations
         WHERE username = ? AND channel = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
        [username, channel, limit],
        (err, rows) => {
          if (err) {
            Logger.error(`Get history failed: ${err.message}`)
            reject(err)
          } else {
            const history = rows.reverse()
            Logger.db(`History: ${username} [${channel}] (${history.length} msgs)`)
            resolve(history)
          }
        }
      )
    })
  }

  clearUserHistory(username, channel = null) {
    return new Promise((resolve, reject) => {
      let query, params
      if (channel) {
        query = `DELETE FROM conversations WHERE username = ? AND channel = ?`
        params = [username, channel]
      } else {
        query = `DELETE FROM conversations WHERE username = ?`
        params = [username]
      }

      this.db.run(query, params, function(err) {
        if (err) {
          Logger.error(`Clear history failed: ${err.message}`)
          reject(err)
        } else {
          Logger.db(`History cleared: ${username} (${this.changes} msgs)`)
          resolve(this.changes)
        }
      })
    })
  }

  getUserPreference(username) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT preferred_model FROM user_preferences WHERE username = ?`,
        [username],
        (err, row) => {
          if (err) {
            Logger.error(`Get preference failed: ${err.message}`)
            reject(err)
          } else {
            const model = row ? row.preferred_model : 'gpt-3.5-turbo'
            resolve(model)
          }
        }
      )
    })
  }

  incrementUserRequest(username, channel) {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now()
      const channelColumn = channel === 'global' ? 'global_requests' : 'whisper_requests'

      this.db.run(
        `INSERT INTO user_preferences (username, total_requests, ${channelColumn}, last_request)
         VALUES (?, 1, 1, ?)
         ON CONFLICT(username)
         DO UPDATE SET
           total_requests = total_requests + 1,
           ${channelColumn} = ${channelColumn} + 1,
           last_request = ?,
           updated_at = CURRENT_TIMESTAMP`,
        [username, timestamp, timestamp],
        (err) => {
          if (err) {
            Logger.error(`Increment failed: ${err.message}`)
            reject(err)
          } else {
            resolve()
          }
        }
      )
    })
  }

  getStats() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT
          (SELECT COUNT(DISTINCT username) FROM conversations) as total_users,
          (SELECT COUNT(*) FROM conversations) as total_messages,
          (SELECT COUNT(*) FROM conversations WHERE channel = 'global') as global_messages,
          (SELECT COUNT(*) FROM conversations WHERE channel = 'whisper') as whisper_messages
        `,
        [],
        (err, rows) => {
          if (err) {
            Logger.error(`Get stats failed: ${err.message}`)
            reject(err)
          } else {
            resolve(rows[0])
          }
        }
      )
    })
  }

  getUserStats(username) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT total_requests, global_requests, whisper_requests, preferred_model
         FROM user_preferences WHERE username = ?`,
        [username],
        (err, row) => {
          if (err) {
            Logger.error(`Get user stats failed: ${err.message}`)
            reject(err)
          } else if (row) {
            resolve(row)
          } else {
            resolve({
              total_requests: 0,
              global_requests: 0,
              whisper_requests: 0,
              preferred_model: 'gpt-3.5-turbo'
            })
          }
        }
      )
    })
  }
}

// =========================================================
// ðŸ“Š MULTI-BOT REQUEST QUEUE - 2.7s Delay Between Requests
// =========================================================
class MultiBotRequestQueue {
  constructor() {
    this.queue = []
    this.processing = false
    this.REQUEST_DELAY = 2700 // 2.7 seconds
    this.lastProcessTime = 0

    Logger.success('MultiBotRequestQueue initialized (2.7s delay)')
  }

  addRequest(username, question, isWhisper) {
    const request = {
      id: `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      username,
      question,
      isWhisper,
      timestamp: Date.now(),
      status: 'pending'
    }

    this.queue.push(request)
    Logger.queue(`Request queued: ${request.id} from ${username} (Queue: ${this.queue.length})`)

    if (!this.processing) {
      this.processNext()
    }

    return request
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true
    const request = this.queue.shift()

    Logger.queue(`Processing: ${request.id}`)

    try {
      // Store current request globally
      global.currentRequest = request

      // Wait for processing to complete
      await new Promise((resolve) => {
        global.requestResolver = resolve
        setTimeout(resolve, 15000) // 15s timeout
      })

      // Wait delay before next request
      if (this.queue.length > 0) {
        const timeSinceLast = Date.now() - this.lastProcessTime
        const waitTime = Math.max(0, this.REQUEST_DELAY - timeSinceLast)

        if (waitTime > 0) {
          Logger.queue(`Waiting ${waitTime}ms before next request...`)
          setTimeout(() => {
            this.processing = false
            this.processNext()
          }, waitTime)
        } else {
          this.processing = false
          this.processNext()
        }
      } else {
        this.processing = false
      }

      this.lastProcessTime = Date.now()

    } catch (error) {
      Logger.error(`Request processing failed: ${error.message}`)
      this.processing = false
      this.processNext()
    }
  }

  getQueueSize() {
    return this.queue.length
  }
}

// =========================================================
// ðŸ”‘ API MANAGER - Multi-Model Support
// =========================================================
class APIManager {
  constructor() {
    this.apiConfigs = [
      {
        id: 1,
        provider: 'ChatAnywhere',
        key: 'sk-3ZidMb4KLKWITlINZfR1dRg9MFaHicdCWpjT8HzjdkwQzt8N',
        baseURL: 'https://api.chatanywhere.tech/v1',
        models: ['gpt-3.5-turbo', 'gpt-4']
      },
      {
        id: 2,
        provider: 'A4F',
        key: 'ddc-a4f-625eda4b0a2e48f2bec9113cf42e80cf',
        baseURL: 'https://www.a4f.co/models/v1',
        models: ['gpt-4o-mini', 'gpt-4o']
      }
    ]

    this.currentConfigId = 1
    Logger.info('APIManager initialized')
  }

  getCurrentConfig() {
    return this.apiConfigs.find(c => c.id === this.currentConfigId) || this.apiConfigs[0]
  }

  async callAPI(messages, model) {
    const config = this.getCurrentConfig()

    if (!config.models.includes(model)) {
      model = config.models[0]
    }

    Logger.info(`Calling ${config.provider} API (${model})`)

    try {
      const response = await axios.post(
        `${config.baseURL}/chat/completions`,
        {
          model: model,
          messages: messages,
          max_tokens: 150,
          temperature: 0.7
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.key}`
          },
          timeout: 30000
        }
      )

      const reply = response.data.choices[0].message.content.trim()
      Logger.success(`API response: ${reply.length} chars`)
      return reply

    } catch (error) {
      Logger.error(`API call failed: ${error.message}`)
      return 'Maaf, terjadi error.'
    }
  }
}

// =========================================================
// âš™ï¸ CHATGPT CONFIG & UTILITIES
// =========================================================
const ChatGPTConfig = {
  maxInputLength: 200,
  maxOutputLength: 210,
  systemPrompt: 'Jawab ringkas dalam Bahasa Indonesia, maksimal 4 kalimat pendek, to the point.'
}

function detectPrefix(message) {
  const messageLower = message.toLowerCase()
  return messageLower.includes('@ai') || messageLower.includes('@chatgpt')
}

function removePrefix(message) {
  return message
    .replace(/@ai/gi, '')
    .replace(/@chatgpt/gi, '')
    .trim()
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

function splitToLines(text, username) {
  const words = text.split(' ')
  const lines = []
  let currentLine = ''

  for (let i = 0; i < AI_BOT_SLOTS.length; i++) {
    const maxChars = AI_BOT_SLOTS[i].maxChars

    while (words.length > 0) {
      const word = words[0]
      const testLine = currentLine ? currentLine + ' ' + word : word

      if (testLine.length <= maxChars) {
        currentLine = testLine
        words.shift()
      } else {
        break
      }
    }

    if (currentLine) {
      lines.push(currentLine)
      currentLine = ''
    } else if (words.length > 0) {
      lines.push(words.shift().substring(0, maxChars))
    }

    if (words.length === 0) break
  }

  while (lines.length < AI_BOT_SLOTS.length) {
    lines.push('')
  }

  return lines.slice(0, AI_BOT_SLOTS.length)
}

// =========================================================
// ðŸš€ AI RESPONSE HANDLER
// =========================================================
async function getChatGPTResponse(username, userMessage, channel, database, apiManager) {
  try {
    Logger.info(`Getting AI response for ${username} [${channel}]`)

    const preferredModel = await database.getUserPreference(username)
    const history = await database.getConversationHistory(username, channel, 3)

    const messages = [
      { role: 'system', content: ChatGPTConfig.systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage }
    ]

    let reply = await apiManager.callAPI(messages, preferredModel)

    if (reply.length > ChatGPTConfig.maxOutputLength) {
      reply = truncateText(reply, ChatGPTConfig.maxOutputLength)
    }

    await database.saveMessage(username, channel, 'user', userMessage, preferredModel)
    await database.saveMessage(username, channel, 'assistant', reply, preferredModel)
    await database.incrementUserRequest(username, channel)

    Logger.success(`Response generated: ${reply.length} chars`)
    return reply

  } catch (error) {
    Logger.error(`getChatGPTResponse error: ${error.message}`)
    return 'Error!'
  }
}

// =========================================================
// ðŸ¤– MULTI-BOT COORDINATED SENDER (Simultaneous)
// =========================================================
async function sendMultiBotResponse(username, lines, isWhisper) {
  Logger.multibot(`Sending coordinated response to ${username} (${isWhisper ? 'WHISPER' : 'GLOBAL'})`)

  // Send all bots simultaneously
  for (let i = 0; i < AI_BOT_SLOTS.length; i++) {
    const bot = registeredBots.get(i)
    const line = lines[i]

    if (!bot || !line) continue

    const botConfig = AI_BOT_SLOTS[i]
    let message

    if (i === 0) {
      // First bot: username + output
      message = botConfig.format(username, line)
    } else {
      // Other bots: output only
      message = line
    }

    try {
      if (isWhisper) {
        // REVISI: Use /msg instead of /r for reliability
        bot.chat(`/msg ${username} ${message}`)
        Logger.multibot(`[${botConfig.username}] Whisper to ${username}: ${message}`)
      } else {
        bot.chat(message)
        Logger.multibot(`[${botConfig.username}] Global: ${message}`)
      }
    } catch (error) {
      Logger.error(`[${botConfig.username}] Send error: ${error.message}`)
    }
  }

  Logger.success('âœ… Multi-bot response sent!')
}

// =========================================================
// ðŸ“¬ GLOBAL CHAT HANDLER (with Rank Detection)
// =========================================================
async function handleGlobalChat(username, message, requestQueue, database, apiManager, rankDetector) {
  // Check for AI prefix
  if (!detectPrefix(message)) return

  // REVISI: Parse username with rank detection
  const parsed = rankDetector.parseGlobalChat(username, message)
  const cleanUser = parsed.username

  if (!cleanUser) {
    Logger.warn(`Failed to parse username from: ${username}`)
    return
  }

  Logger.global(`AI request from ${cleanUser} in GLOBAL chat`)

  // Remove prefix
  const question = removePrefix(message)

  // Validate
  if (question.length === 0) {
    const bot = registeredBots.get(0)
    if (bot) bot.chat(`${cleanUser}: Halo! Tanya apa?`)
    return
  }

  if (question.length > ChatGPTConfig.maxInputLength) {
    const bot = registeredBots.get(0)
    if (bot) bot.chat(`${cleanUser}: Pertanyaan terlalu panjang!`)
    return
  }

  // Add to queue
  requestQueue.addRequest(cleanUser, question, false)

  // Get AI response
  const response = await getChatGPTResponse(cleanUser, question, 'global', database, apiManager)

  // Split into 4 lines
  const lines = splitToLines(response, cleanUser)

  Logger.info(`Response split into ${lines.length} lines`)

  // Send via all 4 bots simultaneously
  await sendMultiBotResponse(cleanUser, lines, false)

  // Resolve request
  if (global.requestResolver) {
    global.requestResolver()
  }
}

// =========================================================
// ðŸ“¬ WHISPER MESSAGE HANDLER
// =========================================================
async function handleWhisperMessage(messageStr, requestQueue, database, apiManager, whisperMatcher) {
  // Parse whisper
  const parsed = whisperMatcher.parseWhisper(messageStr)
  if (!parsed.matched || !parsed.sender || !parsed.message) return

  Logger.whisper(`Whisper from ${parsed.sender}`)

  // Check for AI prefix
  if (!detectPrefix(parsed.message)) return

  Logger.info(`AI request from ${parsed.sender} in WHISPER`)

  // Remove prefix
  const question = removePrefix(parsed.message)

  // Validate
  if (question.length === 0) {
    const bot = registeredBots.get(0)
    if (bot) bot.chat(`/msg ${parsed.sender} Halo! Tanya apa?`)
    return
  }

  if (question.length > ChatGPTConfig.maxInputLength) {
    const bot = registeredBots.get(0)
    if (bot) bot.chat(`/msg ${parsed.sender} Pertanyaan terlalu panjang!`)
    return
  }

  // Add to queue
  requestQueue.addRequest(parsed.sender, question, true)

  // Get AI response
  const response = await getChatGPTResponse(parsed.sender, question, 'whisper', database, apiManager)

  // Split into 4 lines
  const lines = splitToLines(response, parsed.sender)

  Logger.info(`Response split into ${lines.length} lines`)

  // Send via all 4 bots simultaneously
  await sendMultiBotResponse(parsed.sender, lines, true)

  // Resolve request
  if (global.requestResolver) {
    global.requestResolver()
  }
}

// =========================================================
// ðŸ’¨ ADMIN COMMANDS
// =========================================================
async function handleAdminCommands(username, message, database, rankDetector) {
  const messageLower = message.toLowerCase()

  // Parse username first (untuk handle rank format)
  const parsed = rankDetector.parseGlobalChat(username, message)
  const cleanUser = parsed.username || username

  // !clear
  if (messageLower === '!clear') {
    const total = await database.clearUserHistory(cleanUser)
    const bot = registeredBots.get(0)
    if (bot) bot.chat(`${cleanUser}: Context cleared! (${total} msgs)`)
    return true
  }

  // !stats
  if (messageLower === '!stats') {
    const dbStats = await database.getStats()
    const userStats = await database.getUserStats(cleanUser)

    const bot = registeredBots.get(0)
    if (bot) {
      bot.chat(`DB: ${dbStats.total_users} users, ${dbStats.total_messages} msgs`)
      bot.chat(`You: ${userStats.total_requests} reqs (${userStats.global_requests}G+${userStats.whisper_requests}W)`)
    }
    return true
  }

  return false
}

// =========================================================
// ðŸš¦ INITIALIZATION - Main Init Function
// =========================================================
function initAI(bot, index, config) {
  // Create singleton instances
  if (!global.aiDatabase) {
    global.aiDatabase = new DatabaseManager()
  }

  if (!global.aiRequestQueue) {
    global.aiRequestQueue = new MultiBotRequestQueue()
  }

  if (!global.aiAPIManager) {
    global.aiAPIManager = new APIManager()
  }

  if (!global.aiWhisperMatcher) {
    global.aiWhisperMatcher = new WhisperPatternMatcher()
  }

  if (!global.aiRankDetector) {
    global.aiRankDetector = new RankDetector()
  }

  const database = global.aiDatabase
  const requestQueue = global.aiRequestQueue
  const apiManager = global.aiAPIManager
  const whisperMatcher = global.aiWhisperMatcher
  const rankDetector = global.aiRankDetector

  // Register bot
  registeredBots.set(index, bot)

  const botConfig = AI_BOT_SLOTS[index]

  Logger.success(`=== Bot${index + 1} Initialized ===`)
  Logger.success(`Username: ${bot.username}`)
  Logger.success(`Role: ${botConfig.role.toUpperCase()}`)
  Logger.success(`Line: ${botConfig.lineIndex + 1} (max ${botConfig.maxChars} chars)`)
  Logger.success(`==============================`)

  // Only first bot handles requests
  if (index === 0) {
    Logger.info('â­ Primary bot - handling all requests')

    // Global chat
    bot.on('chat', (username, message) => {
      if (username === bot.username) return

      // Admin commands
      handleAdminCommands(username, message, database, rankDetector).catch(err => {
        Logger.error(`Admin command error: ${err.message}`)
      })

      // AI requests
      handleGlobalChat(username, message, requestQueue, database, apiManager, rankDetector).catch(err => {
        Logger.error(`Global chat error: ${err.message}`)
      })
    })

    // Whisper
    bot.on('messagestr', (message) => {
      handleWhisperMessage(message, requestQueue, database, apiManager, whisperMatcher).catch(err => {
        Logger.error(`Whisper error: ${err.message}`)
      })
    })

    // Startup announcement
    setTimeout(() => {
      bot.chat('ðŸ¤– 4-Bot AI System Ready!')
      bot.chat('Gunakan @ai untuk bertanya')
      bot.chat('Commands: !clear, !stats')
    }, config.world.delay + 2000)
  } else {
    Logger.info('âš¡ Secondary bot - output only')
  }

  // Error handling
  bot.on('kicked', (reason) => {
    Logger.error(`Bot${index + 1} kicked: ${reason}`)
    registeredBots.delete(index)
  })

  bot.on('error', (err) => {
    Logger.error(`Bot${index + 1} error: ${err.message}`)
  })

  bot.on('end', () => {
    Logger.warn(`Bot${index + 1} disconnected`)
    registeredBots.delete(index)
  })
}

// =========================================================
// ðŸ“¤ EXPORTS
// =========================================================
module.exports = {
  initAI,
  AI_BOT_SLOTS,
  Logger,
  RankDetector,
  WhisperPatternMatcher,
  DatabaseManager,
  MultiBotRequestQueue,
  APIManager,
  ChatGPTConfig
}