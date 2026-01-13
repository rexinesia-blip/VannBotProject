const mineflayer = require('mineflayer')
const aiModule = require('./ai')
const imgModule = require('./img')
const schemModule = require('./schem')
const recorderModule = require('./recorder')

// =========================================================
// KONFIGURASI UTAMA
// =========================================================
const serverConfig = {
  host: 'alwination.id',
  port: 25565,
  version: "1.16.5"
}

// Konfigurasi perilaku Bot
const config = {
  world: {
    cmd: '/move earth',
    delay: 6000
  },
  auth: {
    loginDelay: 0,
    registerDelay: 3000
  }
}

// =========================================================
// DAFTAR AKUN - MULTI-BOT AI SYSTEM (4 BOT KOORDINASI)
// =========================================================
const accounts = [
  // === AI BOTS (4 slots untuk output terkoordinasi) ===
  { username: "ChatGPT_API", password: "revan999", type: "ai" },      // Slot 1: Primary (Line 1, 30 chars)
  { username: "Ciaa", password: "ica999", type: "ai" },               // Slot 2: Secondary (Line 2, 60 chars)
  { username: "Archivion", password: "rifani999", type: "ai" },       // Slot 3: Secondary (Line 3, 60 chars)
  { username: "", password: "", type: "ai" },          // Slot 4: Footer (Line 4, 60 chars)

  //=== UTILITY BOTS (Opsional - uncomment jika ingin aktifkan) ===
  { username: "", password: "", type: "killaura" },  // Slot 5: Kill Aura
  { username: "", password: "", type: "killaura" },                   // Slot 6: Kill Aura
  { username: "", password: "", type: "img" },                        // Slot 7: Image Builder
  { username: "", password: "", type: "schem" },                      // Slot 8: Schematic Builder
  { username: "_Ryzen", password: "", type: "recorder" }                    // Slot 9: Recorder Bot (Slimefun Helper)
]

// =========================================================
// LOGIKA UTAMA BOT
// =========================================================
function createBot(account, index) {
  if (!account.username || account.username === "") return

  const bot = mineflayer.createBot({
    host: serverConfig.host,
    port: serverConfig.port,
    username: account.username,
    auth: 'offline',
    version: serverConfig.version,
    hideErrors: true
  })

  let kickReasonLog = ""
  let attackInterval

  // -----------------------------------------------------
  // SPAWN & LOGIN LOGIC
  // -----------------------------------------------------
  bot.once('spawn', () => {
    console.log(`>>> [Slot ${index + 1}] ${account.username} berhasil spawn!`)

    setTimeout(() => {
      bot.chat(`/login ${account.password}`)
      console.log(`[Slot ${index + 1}] Mengetik: /login *****`)
    }, config.auth.loginDelay)

    setTimeout(() => {
      bot.chat(`/register ${account.password}`)
      console.log(`[Slot ${index + 1}] Mengetik: /register *****`)
    }, config.auth.registerDelay)

    setTimeout(() => {
      bot.chat(config.world.cmd)
      console.log(`[Slot ${index + 1}] Mengetik: ${config.world.cmd}`)
    }, config.world.delay)

    // =====================================================
    // INISIALISASI MODUL BERDASARKAN TYPE
    // =====================================================
    if (account.type === "ai") {
      // Pass index to AI module for multi-bot coordination
      aiModule.initAI(bot, index, config)
      console.log(`[Slot ${index + 1}] ðŸ¤– AI Module loaded (Multi-Bot Slot ${index + 1})`)
    } else if (account.type === "img") {
      imgModule.initImg(bot, index)
    } else if (account.type === "schem") {
      schemModule.initSchem(bot, index)
    } else if (account.type === "recorder") {
      recorderModule.initRecorder(bot, index)
    } else if (account.type === "killaura") {
      console.log(`[Slot ${index + 1}] âš”ï¸ Kill Aura AKTIF`)
      startKillAura()
    }
  })

  // -----------------------------------------------------
  // AUTO TPA (ALL BOTS)
  // -----------------------------------------------------
  bot.on('chat', (username, message) => {
    if (username === bot.username) return

    if (message.toLowerCase().includes('!tpa')) {
      console.log(`[Slot ${index + 1}] ðŸ“© TPA dari ${username}`)
      bot.chat('/tpaccept')
    }
  })

  // TPA dari whisper
  bot.on('messagestr', (message) => {
    const whisperRegex1 = /^\[WHISPER\]\s+([^:]+):\s+(.+)$/
    const whisperRegex2 = /âœ‰ï¸â¬‡\s+MSG\s+((.+?)\s+[âžºâ†’']\s+(.+?))\s+(.*)/

    let sender = null
    let content = null

    const match1 = message.match(whisperRegex1)
    const match2 = message.match(whisperRegex2)

    if (match1) {
      sender = match1[1]
      content = match1[2]
    } else if (match2) {
      sender = match2[1]
      content = match2[3]
    }

    if (content && content.trim().toLowerCase() === '!tpa') {
      console.log(`[Slot ${index + 1}] ðŸ“© TPA dari ${sender}`)
      bot.chat('/tpaccept')
    }
  })

  // -----------------------------------------------------
  // KILL AURA (SLOTS DENGAN TYPE KILLAURA)
  // -----------------------------------------------------
  function startKillAura() {
    const targetMobs = ['zombie', 'skeleton', 'spider', 'creeper', 'blaze',
                        'magma_cube', 'witch', 'enderman', 'slime', 'piglin']

    attackInterval = setInterval(() => {
      const mobFilter = e => e.type === 'mob' && targetMobs.includes(e.name)
      const mob = bot.nearestEntity(mobFilter)

      if (!mob) return

      const distance = bot.entity.position.distanceTo(mob.position)

      if (distance > 4) {
        bot.lookAt(mob.position.offset(0, mob.height, 0))
        return
      }

      bot.lookAt(mob.position.offset(0, mob.height, 0), true, () => {
        bot.attack(mob)
      })
    }, 1000)
  }

  // -----------------------------------------------------
  // MONITORING & AUTO RECONNECT
  // -----------------------------------------------------
  bot.on('messagestr', (message, position) => {
    // Only log from first bot to avoid spam
    if (index === 0 && position !== 'game_info') {
      if (message.includes('/register') || message.includes('/login')) return
      if (message.includes('âœ‰ï¸â¬‡') || message.includes('[WHISPER]')) return
      console.log(`[SERVER] ${message}`)
    }
  })

  bot.on('kicked', (reason) => {
    kickReasonLog = JSON.stringify(reason).toLowerCase()
    console.log(`[Slot ${index + 1}] âš ï¸ Kicked: ${kickReasonLog}`)
  })

  bot.on('end', () => {
    if (attackInterval) clearInterval(attackInterval)

    const isMaintenance = kickReasonLog.includes('maintenance') ||
                          kickReasonLog.includes('perbaikan') ||
                          kickReasonLog.includes('tutup') ||
                          kickReasonLog.includes('proxy')

    if (isMaintenance) {
      console.log(`[Slot ${index + 1}] ðŸ”§ Maintenance. Reconnect 60s...`)
      setTimeout(() => createBot(account, index), 60000)
    } else {
      console.log(`[Slot ${index + 1}] ðŸ”„ Reconnect 10s...`)
      setTimeout(() => createBot(account, index), 10000)
    }
  })

  bot.on('error', (err) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      console.log(`[Slot ${index + 1}] âŒ Connection Error. Retry 30s...`)
      setTimeout(() => createBot(account, index), 30000)
    } else {
      console.error(`[Slot ${index + 1}] Error:`, err.message)
    }
  })
}

// =========================================================
// STARTUP SEQUENCE
// =========================================================
console.log(`
â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘   MINECRAFT MULTI-BOT SYSTEM V6.0 FINAL + RECORDER   â•‘
â•‘  "4-Bot AI + Rank Detection + Slimefun Automation"   â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
`)

console.log(`ðŸ“‹ Konfigurasi:`)
console.log(`   Server: ${serverConfig.host}:${serverConfig.port}`)
console.log(`   Version: ${serverConfig.version}`)
console.log(``)

console.log(`ðŸ¤– Multi-Bot AI System (FINAL):`)
console.log(`   âœ… 4-Bot Coordinated Output`)
console.log(`   âœ… Bot 1 (ChatGPT_API): Line 1 - 30 chars + username`)
console.log(`   âœ… Bot 2 (Ciaa): Line 2 - 60 chars`)
console.log(`   âœ… Bot 3 (Archivion): Line 3 - 60 chars`)
console.log(`   âœ… Bot 4 (Ryzen): Line 4 - 60 chars + closing`)
console.log(``)

console.log(`ðŸ† Rank Detection System:`)
console.log(`   âœ… 15 Ranks Supported (SCOUT to AN-MAZING)`)
console.log(`   âœ… Auto-extract username from [RANK] Username * format`)
console.log(`   âœ… Smart username cleaning`)
console.log(``)

console.log(`âš¡ Key Features:`)
console.log(`   âœ… Simultaneous Send (0ms delay between bots)`)
console.log(`   âœ… Request Queue (2.7s delay between requests)`)
console.log(`   âœ… Token Optimized (3 msg history, 150 max tokens)`)
console.log(`   âœ… Bypass Chat Cooldown (4 bots instant)`)
console.log(`   âœ… 30+ Whisper Patterns`)
console.log(`   âœ… Database Tracking (SQLite3)`)
console.log(`   âœ… Global + Whisper Support`)
console.log(`   âœ… Admin Commands (!clear, !stats)`)
console.log(``)

console.log(`ðŸŽ¬ NEW: Recorder Module (Slimefun Helper):`)
console.log(`   âœ… Manual Step Builder`)
console.log(`   âœ… Fuzzy Matching (typo tolerant up to 3 chars)`)
console.log(`   âœ… Unlimited Stack Support (1s-1000s+)`)
console.log(`   âœ… Auto-detection & Smart container interaction`)
console.log(`   âœ… Loop System (unlimited automation)`)
console.log(`   âœ… Save/Load Recipes`)
console.log(`   âœ… Database Persistence`)
console.log(`   âœ… Whisper Support`)
console.log(``)

console.log(`ðŸ› ï¸ Modul Tambahan (Opsional):`)
console.log(`   â¸ï¸ IMG Module (uncomment slot 7)`)
console.log(`   â¸ï¸ SCHEM Module (uncomment slot 8)`)
console.log(`   â¸ï¸ RECORDER Module (uncomment slot 9) â¬…ï¸ NEW!`)
console.log(`   â¸ï¸ Kill Aura Module (uncomment slot 5-6)`)
console.log(``)

console.log(`ðŸš€ Starting bots...`)
console.log(``)

let currentBotIndex = 0

function startNextBot() {
  if (currentBotIndex < accounts.length) {
    const acc = accounts[currentBotIndex]

    if (acc.username && acc.username !== "") {
      createBot(acc, currentBotIndex)

      setTimeout(() => {
        currentBotIndex++
        startNextBot()
      }, 5000) // 5s delay between each bot startup
    } else {
      currentBotIndex++
      startNextBot()
    }
  } else {
    console.log(``)
    console.log(`âœ… All bots started successfully!`)
    console.log(``)
    console.log(`ðŸ“– Usage:`)
    console.log(`   AI: @ai cara jadi presiden`)
    console.log(`   Whisper: /msg ChatGPT_API @ai jelaskan AI`)
    console.log(`   Recorder: !setonwer Vann â†’ !set start â†’ !set1 â†’ !set2 takechest 8s Copper Dust`)
    console.log(``)
    console.log(`ðŸ“¤ AI Output Example:`)
    console.log(`   [ChatGPT_API] Vann: Untuk jadi presiden...`)
    console.log(`   [Ciaa] membangun visi yang kuat dan...`)
    console.log(`   [Archivion] mendapat dukungan rakyat luas...`)
    console.log(`   [Ryzen] melalui kampanye efektif.`)
    console.log(``)
    console.log(`ðŸŽ¬ Recorder Commands:`)
    console.log(`   !setonwer <name>  - Set owner`)
    console.log(`   !set start        - Set start position`)
    console.log(`   !set<N>           - Save waypoint`)
    console.log(`   !set<N> takechest <X>s <item>`)
    console.log(`   !set<N> putdispenser <X>s <item>`)
    console.log(`   !set<N> click <X>sec`)
    console.log(`   !setloop          - Enable loop`)
    console.log(`   !set play         - Start automation`)
    console.log(`   !set stop         - Stop automation`)
    console.log(`   !set help         - Show all commands`)
    console.log(``)
    console.log(`âš™ï¸ Admin Commands:`)
    console.log(`   !clear - Clear conversation history`)
    console.log(`   !stats - Show statistics`)
    console.log(``)
    console.log(`ðŸŽ¯ System ready! Waiting for requests...`)
    console.log(``)
  }
}

startNextBot()