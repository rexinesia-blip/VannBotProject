const fs = require('fs').promises
const fss = require('fs')
const path = require('path')
const { Vec3 } = require('vec3')

// Library untuk schematic
let Schematic, Build, builder
try {
  const schematicModule = require('prismarine-schematic')
  Schematic = schematicModule.Schematic
  const builderModule = require('mineflayer-schem')
  Build = builderModule.Build
  builder = builderModule.builder
} catch (e) {
  console.log('[SCHEM] âš ï¸ Install: npm install mineflayer-schem prismarine-schematic')
}

// =========================================================
// AUTO CREATE FOLDERS & DATABASE
// =========================================================
function ensureFolderExists(folderPath) {
  if (!fss.existsSync(folderPath)) {
    fss.mkdirSync(folderPath, { recursive: true })
    console.log(`[SCHEM] ðŸ“ Folder dibuat: ${folderPath}`)
  }
}

const SCHEMATICS_FOLDER = path.join(__dirname, 'schematics')
const DB_FOLDER = path.join(__dirname, 'database')
const SCHEM_DB_FILE = path.join(DB_FOLDER, 'schem_builds.json')

// Buat folder otomatis saat startup
ensureFolderExists(SCHEMATICS_FOLDER)
ensureFolderExists(DB_FOLDER)

// =========================================================
// DATABASE MANAGEMENT
// =========================================================
let buildsDatabase = {
  active: null,
  history: []
}

function loadDatabase() {
  try {
    if (fss.existsSync(SCHEM_DB_FILE)) {
      const data = fss.readFileSync(SCHEM_DB_FILE, 'utf8')
      buildsDatabase = JSON.parse(data)
      console.log('[SCHEM] ðŸ“‚ Database loaded')
      return true
    }
  } catch (error) {
    console.error('[SCHEM] âŒ Error loading database:', error)
  }
  return false
}

function saveDatabase() {
  try {
    fss.writeFileSync(SCHEM_DB_FILE, JSON.stringify(buildsDatabase, null, 2))
    console.log('[SCHEM] ðŸ’¾ Database saved')
  } catch (error) {
    console.error('[SCHEM] âŒ Error saving database:', error)
  }
}

// =========================================================
// WHISPER TRACKING
// =========================================================
let currentWhisperSender = null

// =========================================================
// SCHEMATIC STATE
// =========================================================
let schemState = {
  isBuilding: false,
  buildId: null,
  schematicName: null,
  startPos: null,
  totalBlocks: 0,
  placedBlocks: 0,
  startTime: null,
  lastSaveTime: null,
  username: null,
  isWhisper: false,
  buildSpeed: 1.0,
  useChests: true,
  botOriginalPos: null,
  schematicSize: null
}

function createBuildId() {
  return `schem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function saveBuildToDatabase() {
  if (!schemState.isBuilding && !buildsDatabase.active) return

  schemState.lastSaveTime = Date.now()

  const buildData = {
    buildId: schemState.buildId,
    schematicName: schemState.schematicName,
    startPos: schemState.startPos,
    totalBlocks: schemState.totalBlocks,
    placedBlocks: schemState.placedBlocks,
    startTime: schemState.startTime,
    lastSaveTime: schemState.lastSaveTime,
    username: schemState.username,
    isWhisper: schemState.isWhisper,
    buildSpeed: schemState.buildSpeed,
    useChests: schemState.useChests,
    botOriginalPos: schemState.botOriginalPos,
    schematicSize: schemState.schematicSize,
    status: 'active'
  }

  buildsDatabase.active = buildData
  saveDatabase()
  console.log(`[SCHEM] ðŸ’¾ Build saved to database: ${schemState.buildId}`)
}

function loadBuildFromDatabase() {
  loadDatabase()
  if (buildsDatabase.active && buildsDatabase.active.status === 'active') {
    schemState = {
      isBuilding: false,
      buildId: buildsDatabase.active.buildId,
      schematicName: buildsDatabase.active.schematicName,
      startPos: buildsDatabase.active.startPos,
      totalBlocks: buildsDatabase.active.totalBlocks,
      placedBlocks: buildsDatabase.active.placedBlocks,
      startTime: buildsDatabase.active.startTime,
      lastSaveTime: buildsDatabase.active.lastSaveTime,
      username: buildsDatabase.active.username,
      isWhisper: buildsDatabase.active.isWhisper,
      buildSpeed: buildsDatabase.active.buildSpeed,
      useChests: buildsDatabase.active.useChests,
      botOriginalPos: buildsDatabase.active.botOriginalPos,
      schematicSize: buildsDatabase.active.schematicSize
    }
    console.log(`[SCHEM] ðŸ“‚ Loaded build from database: ${schemState.buildId}`)
    return true
  }
  return false
}

function completeBuild() {
  if (buildsDatabase.active) {
    buildsDatabase.active.status = 'completed'
    buildsDatabase.active.completedTime = Date.now()
    buildsDatabase.history.push(buildsDatabase.active)
    buildsDatabase.active = null
    saveDatabase()
  }

  schemState = {
    isBuilding: false,
    buildId: null,
    schematicName: null,
    startPos: null,
    totalBlocks: 0,
    placedBlocks: 0,
    startTime: null,
    lastSaveTime: null,
    username: null,
    isWhisper: false,
    buildSpeed: 1.0,
    useChests: true,
    botOriginalPos: null,
    schematicSize: null
  }
}

function cancelBuild() {
  if (buildsDatabase.active) {
    buildsDatabase.active.status = 'cancelled'
    buildsDatabase.active.cancelledTime = Date.now()
    buildsDatabase.history.push(buildsDatabase.active)
    buildsDatabase.active = null
    saveDatabase()
  }
  completeBuild()
}

// =========================================================
// SMART CHAT FUNCTION
// =========================================================
function smartChat(bot, message) {
  if (schemState.isWhisper && schemState.username) {
    bot.chat(`/r ${message}`)
    console.log(`[SCHEM] ðŸ’¬ Whisper to ${schemState.username}: ${message}`)
  } else if (currentWhisperSender) {
    bot.chat(`/r ${message}`)
    console.log(`[SCHEM] ðŸ’¬ Whisper to ${currentWhisperSender}: ${message}`)
  } else {
    bot.chat(message)
    console.log(`[SCHEM] ðŸ’¬ Global: ${message}`)
  }
}

// =========================================================
// TELEPORT FUNCTION
// =========================================================
async function teleportToLocation(bot, targetPos) {
  try {
    const currentPos = bot.entity.position
    const distance = currentPos.distanceTo(new Vec3(targetPos.x, targetPos.y, targetPos.z))

    console.log(`[SCHEM] ðŸ“ Current pos: ${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}`)
    console.log(`[SCHEM] ðŸ“ Target pos: ${targetPos.x}, ${targetPos.y}, ${targetPos.z}`)
    console.log(`[SCHEM] ðŸ“ Distance: ${distance.toFixed(1)} blocks`)

    if (distance > 10) {
      console.log(`[SCHEM] ðŸš¶ Bot jauh dari build location, pathfinding...`)
      smartChat(bot, `ðŸš¶ Kembali ke lokasi build (${distance.toFixed(0)} blocks)...`)

      if (bot.pathfinder) {
        const { goals } = require('mineflayer-pathfinder')
        const goal = new goals.GoalBlock(targetPos.x, targetPos.y, targetPos.z)
        await bot.pathfinder.goto(goal)
        console.log(`[SCHEM] âœ… Arrived at build location`)
        smartChat(bot, `âœ… Sampai di lokasi build!`)
        return true
      } else {
        smartChat(bot, `âš ï¸ Pathfinder tidak tersedia, gunakan /tp`)
        return false
      }
    } else {
      console.log(`[SCHEM] âœ… Already at build location`)
      return true
    }
  } catch (error) {
    console.error(`[SCHEM] âŒ Teleport error:`, error.message)
    smartChat(bot, `âŒ Gagal ke lokasi: ${error.message}`)
    return false
  }
}

// =========================================================
// LIST SCHEMATICS
// =========================================================
async function listSchematics() {
  try {
    const files = await fs.readdir(SCHEMATICS_FOLDER)
    const schematicFiles = files.filter(f => 
      f.endsWith('.schem') || 
      f.endsWith('.schematic') || 
      f.endsWith('.litematic') ||
      f.endsWith('.nbt')
    )
    return schematicFiles
  } catch (error) {
    console.error('[SCHEM] âŒ Error listing schematics:', error)
    return []
  }
}

// =========================================================
// UPLOAD SCHEMATIC (AUTO-CREATE FOLDER)
// =========================================================
async function saveSchematicFile(filename, data) {
  try {
    const filepath = path.join(SCHEMATICS_FOLDER, filename)
    await fs.writeFile(filepath, data)
    console.log(`[SCHEM] âœ… Schematic saved: ${filename}`)
    return { success: true, filepath }
  } catch (error) {
    console.error(`[SCHEM] âŒ Save error:`, error.message)
    return { success: false, error: error.message }
  }
}

// =========================================================
// LOAD AND BUILD SCHEMATIC
// =========================================================
async function buildSchematic(bot, schematicName, options = {}) {
  const filepath = path.join(SCHEMATICS_FOLDER, schematicName)

  if (!fss.existsSync(filepath)) {
    smartChat(bot, `âŒ Schematic tidak ditemukan: ${schematicName}`)
    console.log(`[SCHEM] âŒ File not found: ${filepath}`)
    return false
  }

  try {
    console.log(`[SCHEM] ðŸ“– Loading schematic: ${schematicName}`)
    smartChat(bot, `ðŸ“– Loading schematic: ${schematicName}...`)

    const schematicData = await fs.readFile(filepath)
    const schematic = await Schematic.read(schematicData, bot.version)

    const schematicSize = {
      width: schematic.size[0],
      height: schematic.size[1],
      length: schematic.size[2]
    }

    console.log(`[SCHEM] âœ… Schematic loaded`)
    console.log(`[SCHEM] ðŸ“ Size: ${schematicSize.width}x${schematicSize.height}x${schematicSize.length}`)

    const startPos = bot.entity.position.floored()
    const build = new Build(schematic, bot.world, startPos)
    const totalBlocks = build.actions ? build.actions.length : 0

    console.log(`[SCHEM] ðŸ§± Total blocks: ${totalBlocks}`)
    smartChat(bot, `ðŸ“ Size: ${schematicSize.width}x${schematicSize.height}x${schematicSize.length}`)
    smartChat(bot, `ðŸ§± Total blocks: ${totalBlocks}`)

    schemState.isBuilding = true
    schemState.buildId = createBuildId()
    schemState.schematicName = schematicName
    schemState.startPos = startPos
    schemState.totalBlocks = totalBlocks
    schemState.placedBlocks = 0
    schemState.startTime = Date.now()
    schemState.lastSaveTime = Date.now()
    schemState.buildSpeed = options.buildSpeed || 1.0
    schemState.useChests = options.useChests !== false
    schemState.botOriginalPos = startPos
    schemState.schematicSize = schematicSize

    saveBuildToDatabase()

    const buildOptions = {
      buildSpeed: schemState.buildSpeed,
      onError: 'pause',
      retryCount: 3,
      useNearestChest: schemState.useChests,
      bots: [bot]
    }

    console.log(`[SCHEM] ðŸ—ï¸ Starting build with speed: ${buildOptions.buildSpeed}x`)
    smartChat(bot, `ðŸ—ï¸ Memulai pembangunan...`)
    smartChat(bot, `âš¡ Speed: ${buildOptions.buildSpeed}x`)
    smartChat(bot, `ðŸ†” Build ID: ${schemState.buildId}`)

    if (buildOptions.useNearestChest) {
      smartChat(bot, `ðŸ“¦ Auto-chest: ENABLED`)
    }

    // Progress tracking
    let lastProgressUpdate = 0
    bot.on('builder_progress', (progress) => {
      schemState.placedBlocks = progress.completed
      const percent = Math.floor((progress.completed / progress.total) * 100)

      console.log(`[SCHEM] ðŸ“Š Progress: ${percent}% (${progress.completed}/${progress.total})`)

      // Update setiap 10% atau setiap 100 blocks
      const shouldUpdate = (percent - lastProgressUpdate >= 10) || 
                          (progress.completed % 100 === 0)

      if (shouldUpdate && percent > lastProgressUpdate) {
        lastProgressUpdate = percent
        smartChat(bot, `ðŸ“Š Progress: ${percent}% (${progress.completed}/${progress.total})`)
        saveBuildToDatabase()
      }

      // Check distance periodically
      if (progress.completed % 50 === 0) {
        const distance = bot.entity.position.distanceTo(new Vec3(
          schemState.startPos.x,
          schemState.startPos.y,
          schemState.startPos.z
        ))

        if (distance > 20) {
          console.log(`[SCHEM] âš ï¸ Bot too far (${distance.toFixed(1)}), may need relocation`)
        }
      }
    })

    bot.on('builder_error', (error) => {
      console.error('[SCHEM] âŒ Build error:', error.message)
      smartChat(bot, `âŒ Error: ${error.message}`)

      if (error.message.includes('Missing')) {
        smartChat(bot, `âš ï¸ Block hilang! Cek inventory/chest`)
      }

      saveBuildToDatabase()
    })

    bot.on('builder_finished', () => {
      const elapsed = ((Date.now() - schemState.startTime) / 1000 / 60).toFixed(1)
      console.log(`[SCHEM] âœ… BUILD COMPLETE in ${elapsed} minutes`)
      smartChat(bot, `âœ… Build selesai!`)
      smartChat(bot, `â±ï¸ Waktu: ${elapsed} menit`)
      smartChat(bot, `ðŸ§± Total: ${schemState.totalBlocks} blocks`)
      completeBuild()
    })

    await bot.builder.build(build, buildOptions)

    return true

  } catch (error) {
    console.error('[SCHEM] âŒ Error building schematic:', error)
    smartChat(bot, `âŒ Error: ${error.message}`)
    schemState.isBuilding = false
    saveBuildToDatabase()
    return false
  }
}

// =========================================================
// COMMAND HANDLERS
// =========================================================
async function handleListCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!list')) return

  smartChat(bot, `ðŸ“‹ Available schematics:`)
  const schematics = await listSchematics()

  if (schematics.length === 0) {
    smartChat(bot, `âŒ Tidak ada schematic di folder`)
    smartChat(bot, `ðŸ“ Path: ${SCHEMATICS_FOLDER}`)
    smartChat(bot, `ðŸ’¡ Upload file ke folder schematics/`)
  } else {
    schematics.slice(0, 10).forEach((name, i) => {
      smartChat(bot, `${i + 1}. ${name}`)
    })
    if (schematics.length > 10) {
      smartChat(bot, `... dan ${schematics.length - 10} lainnya`)
    }
  }
}

async function handleSchemCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!schem ')) return

  if (schemState.isBuilding) {
    smartChat(bot, `${username}, masih ada build yang berjalan!`)
    return
  }

  const parts = message.split(' ')
  if (parts.length < 2) {
    smartChat(bot, 'Format: !schem <filename> [speed] [chests:true/false]')
    return
  }

  const filename = parts[1]
  const speed = parts[2] ? parseFloat(parts[2]) : 1.0
  const useChests = parts[3] ? parts[3].toLowerCase() !== 'false' : true

  if (speed < 0.1 || speed > 5.0) {
    smartChat(bot, 'âš ï¸ Speed harus antara 0.1 - 5.0')
    return
  }

  schemState.username = username
  schemState.isWhisper = isWhisper

  const options = {
    buildSpeed: speed,
    useChests: useChests
  }

  await buildSchematic(bot, filename, options)
}

async function handlePauseCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!pauseschem')) return

  if (schemState.isBuilding) {
    try {
      if (bot.builder && bot.builder.pause) {
        bot.builder.pause()
        schemState.isBuilding = false
        smartChat(bot, `${username}, build di-pause`)
        smartChat(bot, `ID: ${schemState.buildId}`)
        saveBuildToDatabase()
      }
    } catch (error) {
      console.error('[SCHEM] âŒ Pause error:', error)
      smartChat(bot, 'Error pause build')
    }
  } else {
    smartChat(bot, `${username}, tidak ada build yang berjalan`)
  }
}

async function handleResumeCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!resumeschem')) return

  const loaded = loadBuildFromDatabase()

  if (loaded && schemState.schematicName) {
    // Check if bot is far from build location
    const atLocation = await teleportToLocation(bot, schemState.startPos)

    if (!atLocation) {
      smartChat(bot, `âš ï¸ Tidak bisa sampai lokasi build`)
      smartChat(bot, `Gunakan /tp atau pindah manual`)
      return
    }

    schemState.isBuilding = true
    schemState.isWhisper = isWhisper
    schemState.username = username

    const progress = ((schemState.placedBlocks / schemState.totalBlocks) * 100).toFixed(1)
    smartChat(bot, `${username}, resuming build...`)
    smartChat(bot, `Progress: ${progress}%`)
    smartChat(bot, `ID: ${schemState.buildId}`)

    // Rebuild from schematic file
    const options = {
      buildSpeed: schemState.buildSpeed,
      useChests: schemState.useChests
    }

    await buildSchematic(bot, schemState.schematicName, options)
  } else {
    smartChat(bot, `${username}, tidak ada build untuk di-resume`)
  }
}

async function handleStopCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!stopschem')) return

  if (schemState.isBuilding || buildsDatabase.active) {
    try {
      if (bot.builder && bot.builder.stop) {
        bot.builder.stop()
      }
      const buildId = schemState.buildId
      schemState.isBuilding = false
      cancelBuild()
      smartChat(bot, `${username}, build dibatalkan`)
      smartChat(bot, `ID: ${buildId}`)
    } catch (error) {
      console.error('[SCHEM] âŒ Stop error:', error)
      smartChat(bot, 'Error stop build')
    }
  } else {
    smartChat(bot, `${username}, tidak ada build yang berjalan`)
  }
}

async function handleStatusCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!status')) return

  if (schemState.isBuilding || buildsDatabase.active) {
    const percent = ((schemState.placedBlocks / schemState.totalBlocks) * 100).toFixed(1)
    const elapsed = ((Date.now() - schemState.startTime) / 1000 / 60).toFixed(1)

    smartChat(bot, `ðŸ“Š Build Status:`)
    smartChat(bot, `ðŸ†” ID: ${schemState.buildId}`)
    smartChat(bot, `ðŸ“ Schematic: ${schemState.schematicName}`)
    smartChat(bot, `ðŸ“ˆ Progress: ${percent}%`)
    smartChat(bot, `ðŸ§± Blocks: ${schemState.placedBlocks}/${schemState.totalBlocks}`)
    smartChat(bot, `â±ï¸ Elapsed: ${elapsed} min`)
    smartChat(bot, `âš¡ Speed: ${schemState.buildSpeed}x`)

    if (schemState.startPos) {
      const distance = bot.entity.position.distanceTo(new Vec3(
        schemState.startPos.x,
        schemState.startPos.y,
        schemState.startPos.z
      ))
      smartChat(bot, `ðŸ“ Distance: ${distance.toFixed(1)} blocks`)
    }
  } else {
    smartChat(bot, `${username}, tidak ada build aktif`)
  }
}

async function handleHistoryCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!historyschem')) return

  loadDatabase()
  smartChat(bot, `ðŸ“œ Build History (last 5):`)

  const history = buildsDatabase.history.slice(-5).reverse()
  if (history.length === 0) {
    smartChat(bot, `Belum ada history build`)
  } else {
    history.forEach((build, i) => {
      const progress = ((build.placedBlocks / build.totalBlocks) * 100).toFixed(0)
      const status = build.status === 'completed' ? 'âœ…' : 'âŒ'
      smartChat(bot, `${i+1}. ${status} ${build.schematicName} (${progress}%)`)
    })
  }
}

async function handleHelpSchemCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!helpschem')) return

  smartChat(bot, '=== Schematic Builder Commands ===')
  smartChat(bot, '!list - List schematics')
  smartChat(bot, '!schem <file> [speed] [chests] - Build')
  smartChat(bot, '!pauseschem - Pause build')
  smartChat(bot, '!resumeschem - Resume (auto TP)')
  smartChat(bot, '!stopschem - Cancel build')
  smartChat(bot, '!status - Build status')
  smartChat(bot, '!historyschem - Build history')
  smartChat(bot, 'Speed: 0.1-5.0 | Chests: true/false')
  smartChat(bot, 'Format: .schem .schematic .litematic')
}

// =========================================================
// WHISPER HANDLER
// =========================================================
async function handleWhisperMessage(bot, message) {
  const whisperRegex1 = /^\[WHISPER\]\s+([^:]+):\s+(.+)$/
  const whisperRegex2 = /âœ‰â¬‡\s+MSG\s+((.+?)\s+[âžºâ†’]\s+(.+?))\s+(.*)/

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

  if (sender && content) {
    console.log(`[SCHEM Whisper] ðŸ“¨ From ${sender}: "${content}"`)
    currentWhisperSender = sender

    await handleListCommand(bot, sender, content, true)
    await handleSchemCommand(bot, sender, content, true)
    await handlePauseCommand(bot, sender, content, true)
    await handleResumeCommand(bot, sender, content, true)
    await handleStopCommand(bot, sender, content, true)
    await handleStatusCommand(bot, sender, content, true)
    await handleHistoryCommand(bot, sender, content, true)
    await handleHelpSchemCommand(bot, sender, content, true)

    setTimeout(() => {
      currentWhisperSender = null
    }, 5000)
  }
}

// =========================================================
// INITIALIZATION
// =========================================================
function initSchem(bot, index) {
  console.log(`[Slot ${index + 1}] ðŸ›ï¸ Schematic Builder AKTIF (SURVIVAL MODE)`)
  console.log(`[Slot ${index + 1}] ðŸ“ Schematics: ${SCHEMATICS_FOLDER}`)
  console.log(`[Slot ${index + 1}] ðŸ’¾ Database: ${SCHEM_DB_FILE}`)
  console.log(`[Slot ${index + 1}] ðŸŽ® Mode: SURVIVAL + AUTO CHEST`)
  console.log(`[Slot ${index + 1}] ðŸš¶ Auto-teleport: ENABLED`)
  console.log(`[Slot ${index + 1}] ðŸ’¬ Whisper Support: ENABLED`)

  try {
    const pathfinder = require('mineflayer-pathfinder').pathfinder
    const Movements = require('mineflayer-pathfinder').Movements
    bot.loadPlugin(pathfinder)
    const mcData = require('minecraft-data')(bot.version)
    const defaultMove = new Movements(bot, mcData)
    bot.pathfinder.setMovements(defaultMove)
    console.log(`[Slot ${index + 1}] âœ… Pathfinder loaded`)
  } catch (e) {
    console.log(`[Slot ${index + 1}] âš ï¸ Install: npm install mineflayer-pathfinder`)
  }

  try {
    bot.loadPlugin(builder)
    console.log(`[Slot ${index + 1}] âœ… Builder plugin loaded`)
  } catch (e) {
    console.log(`[Slot ${index + 1}] âš ï¸ Install: npm install mineflayer-schem`)
  }

  bot.once('spawn', () => {
    const loaded = loadBuildFromDatabase()
    if (loaded && schemState.schematicName) {
      const percent = ((schemState.placedBlocks / schemState.totalBlocks) * 100).toFixed(1)
      bot.chat(`ðŸ”„ Unfinished build detected!`)
      bot.chat(`ðŸ“Š Progress: ${percent}% - ID: ${schemState.buildId}`)
      bot.chat(`Use !resumeschem untuk melanjutkan`)
    }
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    handleListCommand(bot, username, message)
    handleSchemCommand(bot, username, message)
    handlePauseCommand(bot, username, message)
    handleResumeCommand(bot, username, message)
    handleStopCommand(bot, username, message)
    handleStatusCommand(bot, username, message)
    handleHistoryCommand(bot, username, message)
    handleHelpSchemCommand(bot, username, message)
  })

  bot.on('messagestr', (message) => {
    handleWhisperMessage(bot, message)
  })

  bot.on('end', () => {
    if (schemState.isBuilding) {
      console.log(`[SCHEM] ðŸ’¾ Auto-saving build state...`)
      saveBuildToDatabase()
    }
  })

  setTimeout(() => {
    bot.chat('ðŸ›ï¸ Schematic Builder ready! (Survival + Auto TP)')
    bot.chat('Formats: .schem .schematic .litematic')
    bot.chat('Type !helpschem untuk commands')
  }, 10000)
}

module.exports = {
  initSchem,
  SCHEMATICS_FOLDER,
  schemState,
  loadBuildFromDatabase,
  saveBuildToDatabase
}