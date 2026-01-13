const mineflayer = require('mineflayer')
const fs = require('fs')
const path = require('path')

// =========================================================
// IMPORT AI MODULE - Gunakan ai.js langsung
// =========================================================
const aiModule = require('./ai')

// =========================================================
// SUPER ADMIN SYSTEM
// =========================================================

const SUPER_ADMINS = ['Vann', 'vann']

function isSuperAdmin(username) {
  return SUPER_ADMINS.some(admin => username.toLowerCase().includes(admin.toLowerCase()))
}

// =========================================================
// DATABASE SYSTEM
// =========================================================

const DB_FOLDER = path.join(__dirname, 'database')
const BOT_OWNERSHIP_FILE = path.join(DB_FOLDER, 'bot_ownership.json')
const CBOT_ACCESS_FILE = path.join(DB_FOLDER, 'cbot_access.json')
const BOT_SETTINGS_FILE = path.join(DB_FOLDER, 'bot_settings.json')

if (!fs.existsSync(DB_FOLDER)) {
  fs.mkdirSync(DB_FOLDER, { recursive: true })
  console.log('[CBOT] Database folder created')
}

let ownershipDatabase = { users: {} }
let accessDatabase = { users: {}, history: [] }
let settingsDatabase = { users: {} }

function loadOwnershipDatabase() {
  try {
    if (fs.existsSync(BOT_OWNERSHIP_FILE)) {
      const data = fs.readFileSync(BOT_OWNERSHIP_FILE, 'utf8')
      ownershipDatabase = JSON.parse(data)
      console.log('[CBOT] Ownership database loaded:', Object.keys(ownershipDatabase.users).length, 'users')
      return true
    }
  } catch (error) {
    console.error('[CBOT] Error loading ownership database:', error)
  }
  return false
}

function saveOwnershipDatabase() {
  try {
    fs.writeFileSync(BOT_OWNERSHIP_FILE, JSON.stringify(ownershipDatabase, null, 2))
  } catch (error) {
    console.error('[CBOT] Error saving ownership database:', error)
  }
}

function loadAccessDatabase() {
  try {
    if (fs.existsSync(CBOT_ACCESS_FILE)) {
      const data = fs.readFileSync(CBOT_ACCESS_FILE, 'utf8')
      accessDatabase = JSON.parse(data)
      console.log('[CBOT] Access database loaded:', Object.keys(accessDatabase.users).length, 'users')
      return true
    }
  } catch (error) {
    console.error('[CBOT] Error loading access database:', error)
  }
  return false
}

function saveAccessDatabase() {
  try {
    fs.writeFileSync(CBOT_ACCESS_FILE, JSON.stringify(accessDatabase, null, 2))
  } catch (error) {
    console.error('[CBOT] Error saving access database:', error)
  }
}

function loadSettingsDatabase() {
  try {
    if (fs.existsSync(BOT_SETTINGS_FILE)) {
      const data = fs.readFileSync(BOT_SETTINGS_FILE, 'utf8')
      settingsDatabase = JSON.parse(data)
      console.log('[CBOT] Settings database loaded')
      return true
    }
  } catch (error) {
    console.error('[CBOT] Error loading settings database:', error)
  }
  return false
}

function saveSettingsDatabase() {
  try {
    fs.writeFileSync(BOT_SETTINGS_FILE, JSON.stringify(settingsDatabase, null, 2))
  } catch (error) {
    console.error('[CBOT] Error saving settings database:', error)
  }
}

function getUserSettings(username) {
  const userKey = username.toLowerCase()

  if (!settingsDatabase.users[userKey]) {
    settingsDatabase.users[userKey] = {
      worldCommand: '/move earth',
      worldDelay: 6000,
      autoKillAura: true,
      autoFollow: false,
      aiEnabled: true,
      updatedAt: Date.now()
    }
    saveSettingsDatabase()
  }

  return settingsDatabase.users[userKey]
}

function updateUserSettings(username, settings) {
  const userKey = username.toLowerCase()

  if (!settingsDatabase.users[userKey]) {
    settingsDatabase.users[userKey] = {
      worldCommand: '/move earth',
      worldDelay: 6000,
      autoKillAura: true,
      autoFollow: false,
      aiEnabled: true,
      updatedAt: Date.now()
    }
  }

  Object.assign(settingsDatabase.users[userKey], settings)
  settingsDatabase.users[userKey].updatedAt = Date.now()

  saveSettingsDatabase()
  console.log(`[CBOT] Updated settings for ${username}`)
}

function hasAccess(username) {
  if (isSuperAdmin(username)) return true
  const userKey = username.toLowerCase()
  return accessDatabase.users[userKey] && accessDatabase.users[userKey].hasAccess
}

function grantAccess(username, grantedBy) {
  const userKey = username.toLowerCase()
  accessDatabase.users[userKey] = {
    hasAccess: true,
    grantedBy: grantedBy,
    grantedAt: Date.now()
  }
  accessDatabase.history.push({
    action: 'grant',
    username: username,
    by: grantedBy,
    timestamp: Date.now()
  })
  saveAccessDatabase()
  console.log(`[CBOT] Access granted to ${username} by ${grantedBy}`)
}

function revokeAccess(username, revokedBy) {
  const userKey = username.toLowerCase()
  if (accessDatabase.users[userKey]) {
    accessDatabase.users[userKey].hasAccess = false
    accessDatabase.users[userKey].revokedBy = revokedBy
    accessDatabase.users[userKey].revokedAt = Date.now()
  }
  accessDatabase.history.push({
    action: 'revoke',
    username: username,
    by: revokedBy,
    timestamp: Date.now()
  })
  saveAccessDatabase()
  console.log(`[CBOT] Access revoked from ${username} by ${revokedBy}`)
}

function getAccessList() {
  const list = []
  for (const [username, data] of Object.entries(accessDatabase.users)) {
    if (data.hasAccess) {
      list.push({
        username: username,
        grantedBy: data.grantedBy,
        grantedAt: data.grantedAt
      })
    }
  }
  return list
}

function getUserBotCount(username) {
  const userKey = username.toLowerCase()
  if (!ownershipDatabase.users[userKey]) return 0
  return ownershipDatabase.users[userKey].bots.length
}

function addBotToUser(username, botname) {
  const userKey = username.toLowerCase()
  if (!ownershipDatabase.users[userKey]) {
    ownershipDatabase.users[userKey] = {
      bots: [],
      createdAt: Date.now(),
      lastBot: null
    }
  }
  ownershipDatabase.users[userKey].bots.push(botname)
  ownershipDatabase.users[userKey].lastBot = Date.now()
  saveOwnershipDatabase()
  console.log(`[CBOT] ${username} now has ${ownershipDatabase.users[userKey].bots.length} bot(s)`)
}

function removeBotFromUser(username, botname) {
  const userKey = username.toLowerCase()
  if (ownershipDatabase.users[userKey]) {
    ownershipDatabase.users[userKey].bots = ownershipDatabase.users[userKey].bots.filter(
      b => b.toLowerCase() !== botname.toLowerCase()
    )
    saveOwnershipDatabase()
    console.log(`[CBOT] Removed ${botname} from ${username}`)
  }
}

function getUserBots(username) {
  const userKey = username.toLowerCase()
  if (!ownershipDatabase.users[userKey]) return []
  return ownershipDatabase.users[userKey].bots
}

loadOwnershipDatabase()
loadAccessDatabase()
loadSettingsDatabase()

const DEFAULT_PASSWORD = 'rexinesy999'
let dynamicBots = []

// =========================================================
// DYNAMIC BOT CREATION - Langsung pakai ai.js
// =========================================================

function createDynamicBot(config, serverConfig) {
  const { username, password, owner } = config
  const userSettings = getUserSettings(owner)

  const bot = mineflayer.createBot({
    host: serverConfig.host,
    port: serverConfig.port,
    username: username,
    auth: 'offline',
    version: serverConfig.version,
    hideErrors: true
  })

  let kickReasonLog = ""
  let attackInterval
  let followInterval = null
  let isOnline = true

  const botData = {
    bot,
    username,
    password,
    owner,
    createdAt: Date.now(),
    isOnline: true,
    settings: userSettings
  }

  dynamicBots.push(botData)
  console.log(`[CBOT] Creating bot: ${username} for owner: ${owner}`)

  bot.once('spawn', () => {
    console.log(`[CBOT] ${username} spawned!`)

    setTimeout(() => {
      bot.chat(`/login ${password}`)
    }, 500)

    setTimeout(() => {
      bot.chat(`/register ${password}`)
    }, 2000)

    setTimeout(() => {
      bot.chat(userSettings.worldCommand)
      console.log(`[CBOT] ${username} executing: ${userSettings.worldCommand}`)
    }, userSettings.worldDelay)

    setTimeout(() => {
      bot.chat(`/msg ${owner} Bot ${username} siap! :D`)
      bot.chat(`/msg ${owner} Commands: !on !off !settings !come !terminate`)
      console.log(`[CBOT] ${username} notified owner ${owner}`)
    }, userSettings.worldDelay + 2000)

    // =====================================================
    // AI MODULE - Langsung gunakan ai.js initAI()
    // Semua fitur AI terbaru otomatis ikut dari ai.js
    // =====================================================
    if (userSettings.aiEnabled) {
      aiModule.initAI(bot, dynamicBots.length - 1, { 
        world: { 
          cmd: userSettings.worldCommand, 
          delay: userSettings.worldDelay 
        } 
      })
      console.log(`[CBOT] ${username} AI module loaded from ai.js`)
    }

    if (userSettings.autoKillAura) {
      startKillAura(bot)
      console.log(`[CBOT] ${username} Kill Aura enabled`)
    }
  })

  bot.on('chat', (username, message) => {
    const isOwner = username.toLowerCase() === owner.toLowerCase()
    const isAdmin = isSuperAdmin(username)

    if (!isOwner && !isAdmin) return

    if (message.toLowerCase().includes('!tpa')) {
      bot.chat('/tpaccept')
    }

    if (message.toLowerCase() === '!on') {
      if (!isOnline) {
        isOnline = true
        botData.isOnline = true
        bot.chat(`/msg ${username} Bot ${bot.username} ONLINE!`)
        if (botData.settings.autoKillAura) {
          startKillAura(bot)
        }
        console.log(`[CBOT] ${bot.username} turned ON by ${username}`)
      } else {
        bot.chat(`/msg ${username} Bot sudah ONLINE!`)
      }
    }

    if (message.toLowerCase() === '!off') {
      if (isOnline) {
        isOnline = false
        botData.isOnline = false
        bot.chat(`/msg ${username} Bot ${bot.username} OFFLINE! (Gunakan !on)`)
        if (attackInterval) {
          clearInterval(attackInterval)
          attackInterval = null
        }
        stopFollowing(bot)
        console.log(`[CBOT] ${bot.username} turned OFF by ${username}`)
      } else {
        bot.chat(`/msg ${username} Bot sudah OFFLINE!`)
      }
    }

    if (message.toLowerCase().startsWith('!settings')) {
      const parts = message.split(' ')

      if (parts.length === 1) {
        bot.chat(`/msg ${username} === Settings ${bot.username} ===`)
        bot.chat(`/msg ${username} World: ${botData.settings.worldCommand}`)
        bot.chat(`/msg ${username} Kill Aura: ${botData.settings.autoKillAura ? 'ON' : 'OFF'}`)
        bot.chat(`/msg ${username} AI ChatGPT: ${botData.settings.aiEnabled ? 'ON' : 'OFF'}`)
        bot.chat(`/msg ${username} Status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`)
        bot.chat(`/msg ${username} ---`)
        bot.chat(`/msg ${username} !settings world <cmd>`)
        bot.chat(`/msg ${username} !settings killaura on/off`)
        bot.chat(`/msg ${username} !settings ai on/off`)
        return
      }

      if (parts[1] === 'world' && parts.length >= 3) {
        const newWorldCmd = parts.slice(2).join(' ')
        botData.settings.worldCommand = newWorldCmd
        updateUserSettings(owner, { worldCommand: newWorldCmd })
        bot.chat(`/msg ${username} World: ${newWorldCmd}`)
        bot.chat(`/msg ${username} Akan digunakan saat restart!`)
        return
      }

      if (parts[1] === 'killaura' && parts.length >= 3) {
        const toggle = parts[2].toLowerCase()
        if (toggle === 'on') {
          botData.settings.autoKillAura = true
          updateUserSettings(owner, { autoKillAura: true })
          bot.chat(`/msg ${username} Kill Aura: ON`)
          if (isOnline) startKillAura(bot)
        } else if (toggle === 'off') {
          botData.settings.autoKillAura = false
          updateUserSettings(owner, { autoKillAura: false })
          bot.chat(`/msg ${username} Kill Aura: OFF`)
          if (attackInterval) {
            clearInterval(attackInterval)
            attackInterval = null
          }
        }
        return
      }

      if (parts[1] === 'ai' && parts.length >= 3) {
        const toggle = parts[2].toLowerCase()
        if (toggle === 'on') {
          botData.settings.aiEnabled = true
          updateUserSettings(owner, { aiEnabled: true })
          bot.chat(`/msg ${username} AI ChatGPT: ON (restart untuk apply)`)
        } else if (toggle === 'off') {
          botData.settings.aiEnabled = false
          updateUserSettings(owner, { aiEnabled: false })
          bot.chat(`/msg ${username} AI ChatGPT: OFF (restart untuk apply)`)
        }
        return
      }
    }

    if (message.toLowerCase().startsWith('!come')) {
      if (!isOnline) {
        bot.chat(`/msg ${username} Bot OFFLINE! Gunakan !on`)
        return
      }
      bot.chat(`/tp ${bot.username} ${username}`)
      setTimeout(() => {
        bot.chat(`/msg ${username} Datang!`)
      }, 500)
    }

    if (message.toLowerCase().startsWith('!follow')) {
      if (!isOnline) {
        bot.chat(`/msg ${username} Bot OFFLINE! Gunakan !on`)
        return
      }
      bot.chat(`/msg ${username} Mengikuti ${username}!`)
      startFollowing(bot, username)
    }

    if (message.toLowerCase().startsWith('!stopfollow')) {
      stopFollowing(bot)
      bot.chat(`/msg ${username} Stop mengikuti!`)
    }

    if (message.toLowerCase().startsWith('!terminate')) {
      if (isOwner || isAdmin) {
        bot.chat(`/msg ${username} Bot ${bot.username} shutting down...`)
        setTimeout(() => {
          removeBotFromUser(owner, bot.username)
          bot.quit()
          dynamicBots = dynamicBots.filter(b => b.username !== bot.username)
          console.log(`[CBOT] ${bot.username} terminated by ${username}`)
        }, 1000)
      }
    }

    if (message.toLowerCase().startsWith('!info')) {
      const uptime = ((Date.now() - botData.createdAt) / 1000 / 60).toFixed(1)
      bot.chat(`/msg ${username} Bot: ${bot.username} | Owner: ${owner}`)
      bot.chat(`/msg ${username} Status: ${isOnline ? 'ONLINE' : 'OFFLINE'} | ${uptime}m`)
      bot.chat(`/msg ${username} World: ${botData.settings.worldCommand}`)
      bot.chat(`/msg ${username} AI: ${botData.settings.aiEnabled ? 'ON' : 'OFF'}`)
    }
  })

  bot.on('messagestr', (message) => {
    const whisperRegex1 = /^\[WHISPER\]\s+([^:]+):\s+(.+)$/
    const whisperRegex2 = /âœ‰â¬‡\s+MSG\s+((.+?)\s+[âžºâ†”]\s+(.+?))\s+(.*)/

    let sender = null
    let content = null

    const match1 = message.match(whisperRegex1)
    const match2 = message.match(whisperRegex2)

    if (match1) {
      sender = match1[1]
      content = match1[2]
    } else if (match2) {
      sender = match2[1]
      content = match2[4]
    }

    if (!sender || !content) return

    const isOwner = sender.toLowerCase() === owner.toLowerCase()
    const isAdmin = isSuperAdmin(sender)

    if (!isOwner && !isAdmin) return

    if (content.trim().toLowerCase() === '!tpa') {
      bot.chat('/tpaccept')
    }

    if (content.trim().toLowerCase().startsWith('!say ')) {
      if (!isOnline) return
      const textToSay = content.trim().substring(5)
      const randomDelay = Math.random() * 1000 + 500
      setTimeout(() => {
        bot.chat(textToSay)
      }, randomDelay)
    }

    if (content.trim().toLowerCase().startsWith('!come')) {
      if (!isOnline) {
        bot.chat(`/r Bot OFFLINE! Gunakan !on`)
        return
      }
      bot.chat(`/tp ${bot.username} ${sender}`)
      setTimeout(() => {
        bot.chat(`/r Datang!`)
      }, 500)
    }
  })

  function startFollowing(bot, targetUsername) {
    stopFollowing(bot)
    followInterval = setInterval(() => {
      if (!isOnline) {
        stopFollowing(bot)
        return
      }
      const target = bot.players[targetUsername]
      if (!target || !target.entity) return
      const targetPos = target.entity.position
      const botPos = bot.entity.position
      const distance = botPos.distanceTo(targetPos)
      if (distance > 3) {
        if (bot.pathfinder) {
          const goals = require('mineflayer-pathfinder')
          const goal = new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2)
          bot.pathfinder.setGoal(goal, true)
        }
      }
    }, 1000)
  }

  function stopFollowing(bot) {
    if (followInterval) {
      clearInterval(followInterval)
      followInterval = null
    }
    if (bot.pathfinder) {
      bot.pathfinder.setGoal(null)
    }
  }

  function startKillAura(bot) {
    if (attackInterval) clearInterval(attackInterval)
    const targetMobs = ['zombie', 'skeleton', 'spider', 'creeper', 'blaze',
      'magma_cube', 'witch', 'enderman', 'slime', 'piglin']
    attackInterval = setInterval(() => {
      if (!isOnline || !botData.settings.autoKillAura) return
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

  bot.on('kicked', (reason) => {
    kickReasonLog = JSON.stringify(reason).toLowerCase()
    console.log(`[CBOT] ${username} kicked: ${kickReasonLog}`)
  })

  bot.on('end', () => {
    if (attackInterval) clearInterval(attackInterval)
    if (followInterval) clearInterval(followInterval)
    const isMaintenance = kickReasonLog.includes('maintenance') ||
      kickReasonLog.includes('perbaikan') ||
      kickReasonLog.includes('tutup') ||
      kickReasonLog.includes('proxy')
    if (isMaintenance) {
      console.log(`[CBOT] ${username} reconnecting in 60s...`)
      setTimeout(() => {
        dynamicBots = dynamicBots.filter(b => b.username !== username)
        createDynamicBot(config, serverConfig)
      }, 60000)
    } else {
      console.log(`[CBOT] ${username} reconnecting in 10s...`)
      setTimeout(() => {
        dynamicBots = dynamicBots.filter(b => b.username !== username)
        createDynamicBot(config, serverConfig)
      }, 10000)
    }
  })

  bot.on('error', (err) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      console.log(`[CBOT] ${username} connection error. Retry in 30s...`)
      setTimeout(() => {
        dynamicBots = dynamicBots.filter(b => b.username !== username)
        createDynamicBot(config, serverConfig)
      }, 30000)
    } else {
      console.error(`[CBOT] ${username} error:`, err.message)
    }
  })

  return botData
}

// =========================================================
// BOT MANAGER - Vann_CreateBot
// =========================================================

function createBotManager(serverConfig, worldConfig) {
  const managerConfig = {
    username: "Vann_CreateBot",
    password: "revan999",
    auth: 'offline'
  }

  const bot = mineflayer.createBot({
    host: serverConfig.host,
    port: serverConfig.port,
    username: managerConfig.username,
    auth: managerConfig.auth,
    version: serverConfig.version,
    hideErrors: true
  })

  let kickReasonLog = ""

  console.log(`[MANAGER] Starting Vann_CreateBot...`)

  bot.once('spawn', () => {
    console.log(`[MANAGER] Vann_CreateBot spawned!`)

    setTimeout(() => {
      bot.chat(`/login ${managerConfig.password}`)
    }, 500)

    setTimeout(() => {
      bot.chat(`/register ${managerConfig.password}`)
    }, 2000)

    setTimeout(() => {
      bot.chat(worldConfig.cmd)
    }, worldConfig.delay)

    setTimeout(() => {
      bot.chat('Vann_CreateBot ready! Whisper !help untuk commands')
      console.log(`[MANAGER] Vann_CreateBot is ready!`)
    }, worldConfig.delay + 2000)
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return

    if (message.toLowerCase().startsWith('!cbotaccess ')) {
      if (!isSuperAdmin(username)) {
        bot.chat(`/msg ${username} Hanya Vann yang bisa grant access!`)
        return
      }
      const parts = message.split(' ')
      if (parts.length < 2) {
        bot.chat(`/msg ${username} Format: !cbotaccess username`)
        return
      }
      const targetUser = parts[1]
      grantAccess(targetUser, username)
      bot.chat(`/msg ${username} Access granted to ${targetUser}!`)
      bot.chat(`/msg ${targetUser} Kamu bisa buat bot! Whisper !help ke Vann_CreateBot`)
      return
    }

    if (message.toLowerCase().startsWith('!cbotrevoke ')) {
      if (!isSuperAdmin(username)) {
        bot.chat(`/msg ${username} Hanya Vann yang bisa revoke!`)
        return
      }
      const parts = message.split(' ')
      if (parts.length < 2) {
        bot.chat(`/msg ${username} Format: !cbotrevoke username`)
        return
      }
      const targetUser = parts[1]
      revokeAccess(targetUser, username)
      bot.chat(`/msg ${username} Access revoked from ${targetUser}!`)
      return
    }

    if (message.toLowerCase().startsWith('!cbotlist')) {
      if (!isSuperAdmin(username)) {
        bot.chat(`/msg ${username} Hanya Vann yang bisa lihat list!`)
        return
      }
      const accessList = getAccessList()
      if (accessList.length === 0) {
        bot.chat(`/msg ${username} Belum ada user dengan akses.`)
        return
      }
      bot.chat(`/msg ${username} Users dengan akses (${accessList.length}):`)
      accessList.slice(0, 5).forEach((user, i) => {
        bot.chat(`/msg ${username} ${i + 1}. ${user.username} (by ${user.grantedBy})`)
      })
      if (accessList.length > 5) {
        bot.chat(`/msg ${username} ... dan ${accessList.length - 5} lainnya`)
      }
      return
    }

    if (message.toLowerCase().includes('!tpa')) {
      bot.chat('/tpaccept')
    }
  })

  bot.on('messagestr', (message) => {
    const whisperRegex1 = /^\[WHISPER\]\s+([^:]+):\s+(.+)$/
    const whisperRegex2 = /âœ‰â¬‡\s+MSG\s+((.+?)\s+[âžºâ†”]\s+(.+?))\s+(.*)/

    let sender = null
    let content = null

    const match1 = message.match(whisperRegex1)
    const match2 = message.match(whisperRegex2)

    if (match1) {
      sender = match1[1]
      content = match1[2]
    } else if (match2) {
      sender = match2[1]
      content = match2[4]
    }

    if (!sender || !content) return

    if (content.toLowerCase().startsWith('!cbotaccess ') && isSuperAdmin(sender)) {
      const parts = content.split(' ')
      if (parts.length < 2) {
        bot.chat(`/r Format: !cbotaccess username`)
        return
      }
      const targetUser = parts[1]
      grantAccess(targetUser, sender)
      bot.chat(`/r Access granted to ${targetUser}!`)
      bot.chat(`/msg ${targetUser} Kamu bisa buat bot! Whisper !help ke Vann_CreateBot`)
      return
    }

    if (content.toLowerCase().startsWith('!cbotrevoke ') && isSuperAdmin(sender)) {
      const parts = content.split(' ')
      if (parts.length < 2) {
        bot.chat(`/r Format: !cbotrevoke username`)
        return
      }
      const targetUser = parts[1]
      revokeAccess(targetUser, sender)
      bot.chat(`/r Access revoked from ${targetUser}!`)
      return
    }

    if (content.toLowerCase().startsWith('!cbotlist') && isSuperAdmin(sender)) {
      const accessList = getAccessList()
      if (accessList.length === 0) {
        bot.chat(`/r Belum ada user dengan akses.`)
        return
      }
      bot.chat(`/r Users dengan akses (${accessList.length}):`)
      accessList.slice(0, 5).forEach((user, i) => {
        bot.chat(`/r ${i + 1}. ${user.username}`)
      })
      return
    }

    if (content.toLowerCase().startsWith('!cbot ')) {
      handleCbotCommand(bot, sender, content, serverConfig)
      return
    }

    if (content.toLowerCase().startsWith('!listbots')) {
      handleListBotsCommand(bot, sender)
      return
    }

    if (content.toLowerCase().startsWith('!mybot')) {
      handleMyBotCommand(bot, sender)
      return
    }

    if (content.toLowerCase().startsWith('!requestaccess')) {
      bot.chat(`/r Minta akses ke Vann!`)
      bot.chat(`/msg Vann ${sender} minta akses bot`)
      return
    }

    if (content.toLowerCase().startsWith('!help')) {
      bot.chat(`/r === Vann_CreateBot Help ===`)
      bot.chat(`/r !requestaccess - Minta akses`)
      bot.chat(`/r !cbot nama [pass] - Buat bot`)
      bot.chat(`/r !mybot - Info bot kamu`)
      bot.chat(`/r !listbots - List semua bot`)
      bot.chat(`/r `)
      bot.chat(`/r === Bot Commands ===`)
      bot.chat(`/r !on/!off - Aktif/nonaktif`)
      bot.chat(`/r !settings - Settings bot`)
      bot.chat(`/r !come !follow !info !terminate`)
      bot.chat(`/r `)
      bot.chat(`/r Bot punya AI ChatGPT dari ai.js!`)
      return
    }

    if (content.trim().toLowerCase() === '!tpa') {
      bot.chat('/tpaccept')
    }
  })

  bot.on('kicked', (reason) => {
    kickReasonLog = JSON.stringify(reason).toLowerCase()
    console.log(`[MANAGER] Kicked: ${kickReasonLog}`)
  })

  bot.on('end', () => {
    const isMaintenance = kickReasonLog.includes('maintenance') ||
      kickReasonLog.includes('perbaikan') ||
      kickReasonLog.includes('tutup') ||
      kickReasonLog.includes('proxy')
    if (isMaintenance) {
      console.log(`[MANAGER] Reconnecting in 60s...`)
      setTimeout(() => createBotManager(serverConfig, worldConfig), 60000)
    } else {
      console.log(`[MANAGER] Reconnecting in 10s...`)
      setTimeout(() => createBotManager(serverConfig, worldConfig), 10000)
    }
  })

  bot.on('error', (err) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      console.log(`[MANAGER] Connection error. Retry in 30s...`)
      setTimeout(() => createBotManager(serverConfig, worldConfig), 30000)
    } else {
      console.error(`[MANAGER] Error:`, err.message)
    }
  })

  return bot
}

// =========================================================
// COMMAND FUNCTIONS
// =========================================================

function handleCbotCommand(bot, username, message, serverConfig) {
  if (!hasAccess(username)) {
    bot.chat(`/r ${username}, kamu belum punya akses!`)
    bot.chat(`/r Gunakan !requestaccess`)
    return
  }

  const parts = message.split(' ').filter(p => p.trim() !== '')
  if (parts.length < 2) {
    bot.chat(`/r Format: !cbot nama [password]`)
    return
  }

  const newBotName = parts[1]
  const newBotPassword = parts[2] || DEFAULT_PASSWORD

  const exists = dynamicBots.some(b => b.username.toLowerCase() === newBotName.toLowerCase())
  if (exists) {
    bot.chat(`/r Bot ${newBotName} sudah ada!`)
    return
  }

  const userBotCount = getUserBotCount(username)
  const isVann = isSuperAdmin(username)

  if (userBotCount >= 1 && !isVann) {
    const userBots = getUserBots(username)
    bot.chat(`/r ${username}, sudah punya: ${userBots[0]}`)
    bot.chat(`/r Terminate dulu bot lama!`)
    return
  }

  bot.chat(`/r Creating bot: ${newBotName}...`)
  console.log(`[MANAGER] ${username} creating bot: ${newBotName}`)

  const config = {
    username: newBotName,
    password: newBotPassword,
    owner: username
  }

  addBotToUser(username, newBotName)
  createDynamicBot(config, serverConfig)

  setTimeout(() => {
    bot.chat(`/r Bot ${newBotName} berhasil dibuat!`)
    bot.chat(`/r Bot punya AI ChatGPT dari ai.js!`)
  }, 2000)
}

function handleListBotsCommand(bot, username) {
  if (dynamicBots.length === 0) {
    bot.chat(`/r Belum ada bot aktif.`)
    return
  }

  bot.chat(`/r Dynamic Bots (${dynamicBots.length}):`)
  dynamicBots.slice(0, 5).forEach((b, i) => {
    const uptime = ((Date.now() - b.createdAt) / 1000 / 60).toFixed(1)
    const status = b.isOnline ? 'ON' : 'OFF'
    bot.chat(`/r ${i + 1}. ${b.username} [${status}] - ${b.owner} - ${uptime}m`)
  })

  if (dynamicBots.length > 5) {
    bot.chat(`/r ... dan ${dynamicBots.length - 5} lainnya`)
  }
}

function handleMyBotCommand(bot, username) {
  const myBots = getUserBots(username)

  if (myBots.length === 0) {
    bot.chat(`/r ${username}, belum punya bot.`)
    if (hasAccess(username)) {
      bot.chat(`/r Gunakan !cbot nama`)
    } else {
      bot.chat(`/r Gunakan !requestaccess`)
    }
    return
  }

  const onlineBots = dynamicBots.filter(b => b.owner.toLowerCase() === username.toLowerCase())

  bot.chat(`/r Bot ${username}: ${myBots[0]}`)

  if (onlineBots.length > 0) {
    const uptime = ((Date.now() - onlineBots[0].createdAt) / 1000 / 60).toFixed(1)
    const status = onlineBots[0].isOnline ? 'ONLINE' : 'OFFLINE'
    bot.chat(`/r Status: ${status} (${uptime}m)`)
    bot.chat(`/r World: ${onlineBots[0].settings.worldCommand}`)
    bot.chat(`/r AI: ${onlineBots[0].settings.aiEnabled ? 'ON' : 'OFF'}`)
  } else {
    bot.chat(`/r Status: OFFLINE`)
  }

  bot.chat(`/r Commands: !on !off !settings !terminate`)
}

module.exports = {
  createDynamicBot,
  createBotManager,
  isSuperAdmin,
  dynamicBots,
  DEFAULT_PASSWORD
}