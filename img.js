const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { Vec3 } = require('vec3')

// Library untuk image processing
let Jimp, nearestColor
try {
  Jimp = require('jimp')
  nearestColor = require('nearest-color')
} catch (e) {
  console.log('[IMG] âš ï¸ Install: npm install jimp nearest-color')
}

// =========================================================
// AUTO CREATE FOLDERS & DATABASE
// =========================================================
function ensureFolderExists(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true })
    console.log(`[IMG] ðŸ“ Folder dibuat: ${folderPath}`)
  }
}

const IMAGES_FOLDER = path.join(__dirname, 'images')
const DB_FOLDER = path.join(__dirname, 'database')
const IMG_DB_FILE = path.join(DB_FOLDER, 'img_builds.json')

// Buat folder otomatis saat startup
ensureFolderExists(IMAGES_FOLDER)
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
    if (fs.existsSync(IMG_DB_FILE)) {
      const data = fs.readFileSync(IMG_DB_FILE, 'utf8')
      buildsDatabase = JSON.parse(data)
      console.log('[IMG] ðŸ“‚ Database loaded')
      return true
    }
  } catch (error) {
    console.error('[IMG] âŒ Error loading database:', error)
  }
  return false
}

function saveDatabase() {
  try {
    fs.writeFileSync(IMG_DB_FILE, JSON.stringify(buildsDatabase, null, 2))
    console.log('[IMG] ðŸ’¾ Database saved')
  } catch (error) {
    console.error('[IMG] âŒ Error saving database:', error)
  }
}

// =========================================================
// WHISPER TRACKING
// =========================================================
let currentWhisperSender = null

// =========================================================
// BUILD STATE
// =========================================================
let buildState = {
  isBuilding: false,
  buildId: null,
  imageName: null,
  imageUrl: null,
  palette: 'wool',
  width: 64,
  height: 64,
  startPos: null,
  pixelData: [],
  placedBlocks: 0,
  totalBlocks: 0,
  currentRow: 0,
  currentCol: 0,
  startTime: null,
  lastSaveTime: null,
  requiredBlocks: {},
  username: null,
  isWhisper: false,
  botOriginalPos: null
}

function createBuildId() {
  return `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function saveBuildToDatabase() {
  if (!buildState.isBuilding) return

  buildState.lastSaveTime = Date.now()

  const buildData = {
    buildId: buildState.buildId,
    imageName: buildState.imageName,
    imageUrl: buildState.imageUrl,
    palette: buildState.palette,
    width: buildState.width,
    height: buildState.height,
    startPos: buildState.startPos,
    pixelData: buildState.pixelData,
    placedBlocks: buildState.placedBlocks,
    totalBlocks: buildState.totalBlocks,
    currentRow: buildState.currentRow,
    currentCol: buildState.currentCol,
    startTime: buildState.startTime,
    lastSaveTime: buildState.lastSaveTime,
    requiredBlocks: buildState.requiredBlocks,
    username: buildState.username,
    isWhisper: buildState.isWhisper,
    botOriginalPos: buildState.botOriginalPos,
    status: 'active'
  }

  buildsDatabase.active = buildData
  saveDatabase()
  console.log(`[IMG] ðŸ’¾ Build saved to database: ${buildState.buildId}`)
}

function loadBuildFromDatabase() {
  loadDatabase()
  if (buildsDatabase.active && buildsDatabase.active.status === 'active') {
    buildState = {
      isBuilding: false, // Will be set true when resume
      buildId: buildsDatabase.active.buildId,
      imageName: buildsDatabase.active.imageName,
      imageUrl: buildsDatabase.active.imageUrl,
      palette: buildsDatabase.active.palette,
      width: buildsDatabase.active.width,
      height: buildsDatabase.active.height,
      startPos: buildsDatabase.active.startPos,
      pixelData: buildsDatabase.active.pixelData,
      placedBlocks: buildsDatabase.active.placedBlocks,
      totalBlocks: buildsDatabase.active.totalBlocks,
      currentRow: buildsDatabase.active.currentRow,
      currentCol: buildsDatabase.active.currentCol,
      startTime: buildsDatabase.active.startTime,
      lastSaveTime: buildsDatabase.active.lastSaveTime,
      requiredBlocks: buildsDatabase.active.requiredBlocks,
      username: buildsDatabase.active.username,
      isWhisper: buildsDatabase.active.isWhisper,
      botOriginalPos: buildsDatabase.active.botOriginalPos
    }
    console.log(`[IMG] ðŸ“‚ Loaded build from database: ${buildState.buildId}`)
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

  buildState = {
    isBuilding: false,
    buildId: null,
    imageName: null,
    imageUrl: null,
    palette: 'wool',
    width: 64,
    height: 64,
    startPos: null,
    pixelData: [],
    placedBlocks: 0,
    totalBlocks: 0,
    currentRow: 0,
    currentCol: 0,
    startTime: null,
    lastSaveTime: null,
    requiredBlocks: {},
    username: null,
    isWhisper: false,
    botOriginalPos: null
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
  if (buildState.isWhisper && buildState.username) {
    bot.chat(`/r ${message}`)
    console.log(`[IMG] ðŸ’¬ Whisper to ${buildState.username}: ${message}`)
  } else if (currentWhisperSender) {
    bot.chat(`/r ${message}`)
    console.log(`[IMG] ðŸ’¬ Whisper to ${currentWhisperSender}: ${message}`)
  } else {
    bot.chat(message)
    console.log(`[IMG] ðŸ’¬ Global: ${message}`)
  }
}

// =========================================================
// TELEPORT FUNCTION
// =========================================================
async function teleportToLocation(bot, targetPos) {
  try {
    const currentPos = bot.entity.position
    const distance = currentPos.distanceTo(new Vec3(targetPos.x, targetPos.y, targetPos.z))

    console.log(`[IMG] ðŸ“ Current pos: ${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}`)
    console.log(`[IMG] ðŸ“ Target pos: ${targetPos.x}, ${targetPos.y}, ${targetPos.z}`)
    console.log(`[IMG] ðŸ“ Distance: ${distance.toFixed(1)} blocks`)

    if (distance > 4.5) {
      console.log(`[IMG] ðŸš¶ Bot jauh dari build location, pathfinding...`)
      smartChat(bot, `ðŸš¶ Kembali ke lokasi build (${distance.toFixed(0)} blocks)...`)

      if (bot.pathfinder) {
        const { goals } = require('mineflayer-pathfinder')
        const goal = new goals.GoalBlock(targetPos.x, targetPos.y, targetPos.z)
        await bot.pathfinder.goto(goal)
        console.log(`[IMG] âœ… Arrived at build location`)
        smartChat(bot, `âœ… Sampai di lokasi build!`)
        return true
      } else {
        smartChat(bot, `âš ï¸ Pathfinder tidak tersedia, gunakan /tp`)
        return false
      }
    } else {
      console.log(`[IMG] âœ… Already at build location`)
      return true
    }
  } catch (error) {
    console.error(`[IMG] âŒ Teleport error:`, error.message)
    smartChat(bot, `âŒ Gagal ke lokasi: ${error.message}`)
    return false
  }
}

// =========================================================
// MINECRAFT BLOCK COLOR PALETTE
// =========================================================
const BLOCK_COLORS = {
  'white_wool': '#E9ECEC',
  'light_gray_wool': '#9AA1A1',
  'gray_wool': '#4C4F51',
  'black_wool': '#1E1B1B',
  'brown_wool': '#8E5C42',
  'red_wool': '#A12722',
  'orange_wool': '#EA7E35',
  'yellow_wool': '#FECB00',
  'lime_wool': '#70B919',
  'green_wool': '#5B7F1E',
  'cyan_wool': '#157788',
  'light_blue_wool': '#3AAFD9',
  'blue_wool': '#354F9C',
  'purple_wool': '#7E3DB5',
  'magenta_wool': '#BE49C9',
  'pink_wool': '#EE8DAC',
  'white_concrete': '#CFD5D6',
  'light_gray_concrete': '#7D7D73',
  'gray_concrete': '#36393D',
  'black_concrete': '#080A0F',
  'brown_concrete': '#603B1F',
  'red_concrete': '#8E2121',
  'orange_concrete': '#E06101',
  'yellow_concrete': '#F4AF15',
  'lime_concrete': '#5EA918',
  'green_concrete': '#495B24',
  'cyan_concrete': '#157788',
  'light_blue_concrete': '#29A4C7',
  'blue_concrete': '#2C2E8F',
  'purple_concrete': '#64209C',
  'magenta_concrete': '#A9309F',
  'pink_concrete': '#D5668E',
  'dirt': '#866043',
  'cobblestone': '#7F7F7F',
  'stone': '#7D7D7D',
  'oak_planks': '#9C7F4E',
  'birch_planks': '#D7CB8D',
  'spruce_planks': '#805E36',
  'sand': '#DBD3A0',
  'gravel': '#7E7E7E'
}

// =========================================================
// COLOR MATCHING
// =========================================================
function getClosestBlock(pixelColor, palette) {
  let availableBlocks = {}
  if (palette === 'wool') {
    Object.keys(BLOCK_COLORS).forEach(block => {
      if (block.includes('_wool')) availableBlocks[block] = BLOCK_COLORS[block]
    })
  } else if (palette === 'concrete') {
    Object.keys(BLOCK_COLORS).forEach(block => {
      if (block.includes('_concrete')) availableBlocks[block] = BLOCK_COLORS[block]
    })
  } else if (palette === 'basic') {
    availableBlocks = {
      'dirt': BLOCK_COLORS['dirt'],
      'cobblestone': BLOCK_COLORS['cobblestone'],
      'stone': BLOCK_COLORS['stone'],
      'oak_planks': BLOCK_COLORS['oak_planks']
    }
  } else {
    availableBlocks = BLOCK_COLORS
  }

  const nearest = nearestColor.from(availableBlocks)
  const hex = `#${pixelColor.toString(16).padStart(6, '0')}`
  const result = nearest(hex)
  return result ? result.name : 'white_wool'
}

// =========================================================
// IMAGE PROCESSING
// =========================================================
async function downloadImage(url, filename) {
  console.log(`[IMG] ðŸ“¥ Downloading image from URL...`)
  try {
    const response = await axios({
      url: url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000
    })
    const filepath = path.join(IMAGES_FOLDER, filename)
    fs.writeFileSync(filepath, response.data)
    console.log(`[IMG] âœ… Image saved: ${filename}`)
    return { success: true, filepath }
  } catch (error) {
    console.error(`[IMG] âŒ Download error:`, error.message)
    return { success: false, error: error.message }
  }
}

async function processImage(imagePath, targetWidth, targetHeight, palette) {
  console.log(`[IMG] ðŸŽ¨ Processing image: ${path.basename(imagePath)}`)
  try {
    const image = await Jimp.read(imagePath)

    if (!targetHeight) {
      const aspectRatio = image.bitmap.height / image.bitmap.width
      targetHeight = Math.round(targetWidth * aspectRatio)
    }

    image.resize(targetWidth, targetHeight, Jimp.RESIZE_NEAREST_NEIGHBOR)
    console.log(`[IMG] ðŸ“ Size: ${targetWidth}x${targetHeight}`)

    const pixelData = []
    const blockCount = {}

    for (let y = 0; y < image.bitmap.height; y++) {
      const row = []
      for (let x = 0; x < image.bitmap.width; x++) {
        const color = image.getPixelColor(x, y)
        const rgba = Jimp.intToRGBA(color)

        if (rgba.a < 128) {
          row.push(null)
          continue
        }

        const pixelHex = (rgba.r << 16) + (rgba.g << 8) + rgba.b
        const blockName = getClosestBlock(pixelHex, palette)
        row.push(blockName)
        blockCount[blockName] = (blockCount[blockName] || 0) + 1
      }
      pixelData.push(row)
    }

    console.log(`[IMG] âœ… Processed: ${Object.keys(blockCount).length} unique blocks`)
    return {
      success: true,
      pixelData,
      width: targetWidth,
      height: targetHeight,
      blockCount
    }
  } catch (error) {
    console.error(`[IMG] âŒ Processing error:`, error.message)
    return { success: false, error: error.message }
  }
}

// =========================================================
// INVENTORY MANAGEMENT
// =========================================================
function getInventoryCount(bot, blockName) {
  const items = bot.inventory.items()
  let count = 0
  for (const item of items) {
    if (item.name === blockName) {
      count += item.count
    }
  }
  return count
}

function hasRequiredBlock(bot, blockName) {
  return getInventoryCount(bot, blockName) > 0
}

async function equipBlock(bot, blockName) {
  try {
    const item = bot.inventory.items().find(i => i.name === blockName)
    if (item) {
      await bot.equip(item, 'hand')
      return true
    }
    return false
  } catch (error) {
    console.error(`[IMG] âŒ Equip error:`, error.message)
    return false
  }
}

function getInventoryStatus(bot, requiredBlocks) {
  const status = {}
  const missing = []
  for (const blockName in requiredBlocks) {
    const required = requiredBlocks[blockName]
    const available = getInventoryCount(bot, blockName)
    status[blockName] = { required, available, missing: Math.max(0, required - available) }
    if (available < required) {
      missing.push(`${blockName}: ${available}/${required}`)
    }
  }
  return { status, missing }
}

// =========================================================
// BUILDING LOGIC
// =========================================================
async function placeBlockAt(bot, pos, blockName) {
  try {
    if (!hasRequiredBlock(bot, blockName)) {
      console.log(`[IMG] âš ï¸ Missing block: ${blockName}`)
      return false
    }

    const equipped = await equipBlock(bot, blockName)
    if (!equipped) {
      console.log(`[IMG] âš ï¸ Cannot equip: ${blockName}`)
      return false
    }

    const distance = bot.entity.position.distanceTo(pos)
    if (distance > 4.5) {
      console.log(`[IMG] ðŸš¶ Moving to position...`)
      if (bot.pathfinder) {
        const { goals } = require('mineflayer-pathfinder')
        const goal = new goals.GoalNear(pos.x, pos.y, pos.z, 4)
        await bot.pathfinder.goto(goal)
      }
    }

    const referenceBlock = bot.blockAt(pos.offset(0, -1, 0))
    if (!referenceBlock) {
      console.log(`[IMG] âš ï¸ No reference block at ${pos}`)
      return false
    }

    await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0))
    console.log(`[IMG] âœ… Placed ${blockName} at ${pos}`)
    return true
  } catch (error) {
    console.error(`[IMG] âŒ Place error at ${pos}:`, error.message)
    return false
  }
}

async function buildImageSurvival(bot) {
  if (!buildState.isBuilding) return

  const { pixelData, startPos, width, height } = buildState
  console.log(`[IMG] ðŸ—ï¸ Building from row ${buildState.currentRow}, col ${buildState.currentCol}`)

  // Check distance and teleport if needed
  const atLocation = await teleportToLocation(bot, startPos)
  if (!atLocation) {
    smartChat(bot, `âš ï¸ Tidak bisa sampai lokasi, build di-pause`)
    buildState.isBuilding = false
    saveBuildToDatabase()
    return
  }

  for (let y = buildState.currentRow; y < height; y++) {
    for (let x = buildState.currentCol; x < width; x++) {
      if (!buildState.isBuilding) {
        console.log(`[IMG] â¸ï¸ Build paused`)
        saveBuildToDatabase()
        return
      }

      const blockName = pixelData[y][x]
      if (!blockName) continue

      const worldPos = new Vec3(
        startPos.x + x,
        startPos.y + y,
        startPos.z
      )

      // Check distance periodically
      const currentDistance = bot.entity.position.distanceTo(worldPos)
      if (currentDistance > 10) {
        console.log(`[IMG] ðŸ“ Bot too far (${currentDistance.toFixed(1)}), relocating...`)
        const relocated = await teleportToLocation(bot, startPos)
        if (!relocated) {
          smartChat(bot, `âš ï¸ Bot terpisah dari build, pausing...`)
          buildState.isBuilding = false
          saveBuildToDatabase()
          return
        }
      }

      const placed = await placeBlockAt(bot, worldPos, blockName)
      if (placed) {
        buildState.placedBlocks++
        buildState.currentRow = y
        buildState.currentCol = x

        if (buildState.placedBlocks % 10 === 0) {
          const progress = ((buildState.placedBlocks / buildState.totalBlocks) * 100).toFixed(1)
          smartChat(bot, `Progress: ${progress}% (${buildState.placedBlocks}/${buildState.totalBlocks})`)
          console.log(`[IMG] ðŸ“Š Progress: ${progress}%`)
          saveBuildToDatabase()
        }

        await sleep(500)
      } else {
        smartChat(bot, `Missing: ${blockName}! Pausing...`)
        console.log(`[IMG] â¸ï¸ Missing block: ${blockName}`)
        buildState.isBuilding = false
        saveBuildToDatabase()
        return
      }
    }
    buildState.currentCol = 0
  }

  const elapsed = ((Date.now() - buildState.startTime) / 1000 / 60).toFixed(1)
  smartChat(bot, `Build selesai! Total: ${buildState.placedBlocks} blocks dalam ${elapsed} menit`)
  console.log(`[IMG] âœ… BUILD COMPLETE! ${buildState.placedBlocks} blocks in ${elapsed} minutes`)
  completeBuild()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// =========================================================
// COMMAND HANDLERS
// =========================================================
async function handleUrlCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!url ')) return

  if (buildState.isBuilding) {
    smartChat(bot, `${username}, masih ada build yang berjalan!`)
    return
  }

  const parts = message.split(' ')
  if (parts.length < 2) {
    smartChat(bot, 'Format: !url <url> [palette] [size]')
    return
  }

  const url = parts[1]
  const palette = parts[2] || 'wool'
  const sizeStr = parts[3] || '64'
  const sizeMatch = sizeStr.match(/^(\d+)(?:x(\d+))?$/i)

  if (!sizeMatch) {
    smartChat(bot, 'Size format: 64 atau 64x64')
    return
  }

  const width = parseInt(sizeMatch[1])
  const height = sizeMatch[2] ? parseInt(sizeMatch[2]) : null

  smartChat(bot, `${username}, downloading image dari URL...`)

  const filename = `url_${Date.now()}.png`
  const download = await downloadImage(url, filename)

  if (!download.success) {
    smartChat(bot, `Error download: ${download.error}`)
    return
  }

  smartChat(bot, 'Processing image...')
  const result = await processImage(download.filepath, width, height, palette)

  if (!result.success) {
    smartChat(bot, `Error processing: ${result.error}`)
    return
  }

  buildState = {
    isBuilding: true,
    buildId: createBuildId(),
    imageName: filename,
    imageUrl: url,
    palette,
    width: result.width,
    height: result.height,
    startPos: bot.entity.position.floored(),
    pixelData: result.pixelData,
    placedBlocks: 0,
    totalBlocks: Object.values(result.blockCount).reduce((a, b) => a + b, 0),
    currentRow: 0,
    currentCol: 0,
    startTime: Date.now(),
    lastSaveTime: Date.now(),
    requiredBlocks: result.blockCount,
    username,
    isWhisper,
    botOriginalPos: bot.entity.position.floored()
  }

  const invStatus = getInventoryStatus(bot, result.blockCount)
  smartChat(bot, `Image ready! Size: ${result.width}x${result.height}`)
  smartChat(bot, `Total blocks: ${buildState.totalBlocks}`)
  smartChat(bot, `Build ID: ${buildState.buildId}`)

  if (invStatus.missing.length > 0) {
    smartChat(bot, `âš ï¸ Missing blocks:`)
    invStatus.missing.slice(0, 3).forEach(m => smartChat(bot, m))
    smartChat(bot, 'Use !inventory untuk list lengkap')
  } else {
    smartChat(bot, `âœ… All blocks available! Starting build...`)
    saveBuildToDatabase()
    buildImageSurvival(bot)
  }
}

async function handleBuildCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!build ')) return

  if (buildState.isBuilding) {
    smartChat(bot, `${username}, masih ada build yang berjalan!`)
    return
  }

  const parts = message.split(' ')
  if (parts.length < 2) {
    smartChat(bot, 'Format: !build <filename> [palette] [size]')
    return
  }

  const filename = parts[1]
  const palette = parts[2] || 'wool'
  const sizeStr = parts[3] || '64'
  const filepath = path.join(IMAGES_FOLDER, filename)

  if (!fs.existsSync(filepath)) {
    smartChat(bot, `Image tidak ditemukan: ${filename}`)
    return
  }

  const sizeMatch = sizeStr.match(/^(\d+)(?:x(\d+))?$/i)
  const width = parseInt(sizeMatch[1])
  const height = sizeMatch[2] ? parseInt(sizeMatch[2]) : null

  smartChat(bot, `${username}, processing image...`)
  const result = await processImage(filepath, width, height, palette)

  if (!result.success) {
    smartChat(bot, `Error: ${result.error}`)
    return
  }

  buildState = {
    isBuilding: true,
    buildId: createBuildId(),
    imageName: filename,
    imageUrl: null,
    palette,
    width: result.width,
    height: result.height,
    startPos: bot.entity.position.floored(),
    pixelData: result.pixelData,
    placedBlocks: 0,
    totalBlocks: Object.values(result.blockCount).reduce((a, b) => a + b, 0),
    currentRow: 0,
    currentCol: 0,
    startTime: Date.now(),
    lastSaveTime: Date.now(),
    requiredBlocks: result.blockCount,
    username,
    isWhisper,
    botOriginalPos: bot.entity.position.floored()
  }

  const invStatus = getInventoryStatus(bot, result.blockCount)
  smartChat(bot, `Ready! Size: ${result.width}x${result.height}, Blocks: ${buildState.totalBlocks}`)
  smartChat(bot, `Build ID: ${buildState.buildId}`)

  if (invStatus.missing.length === 0) {
    smartChat(bot, `Starting build...`)
    saveBuildToDatabase()
    buildImageSurvival(bot)
  } else {
    smartChat(bot, `âš ï¸ Missing blocks! Use !inventory`)
  }
}

function handlePauseCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!pause')) return

  if (buildState.isBuilding) {
    buildState.isBuilding = false
    saveBuildToDatabase()
    smartChat(bot, `${username}, build di-pause. ID: ${buildState.buildId}`)
  } else {
    smartChat(bot, `${username}, tidak ada build yang berjalan.`)
  }
}

function handleResumeCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!resume')) return

  if (buildState.isBuilding) {
    smartChat(bot, `${username}, build sudah berjalan!`)
    return
  }

  const loaded = loadBuildFromDatabase()
  if (loaded && buildState.pixelData.length > 0) {
    buildState.isBuilding = true
    buildState.isWhisper = isWhisper
    buildState.username = username
    const progress = ((buildState.placedBlocks / buildState.totalBlocks) * 100).toFixed(1)
    smartChat(bot, `${username}, resuming build... Progress: ${progress}%`)
    smartChat(bot, `Build ID: ${buildState.buildId}`)
    buildImageSurvival(bot)
  } else {
    smartChat(bot, `${username}, tidak ada build untuk di-resume.`)
  }
}

function handleInventoryCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!inventory')) return

  if (!buildState.requiredBlocks || Object.keys(buildState.requiredBlocks).length === 0) {
    smartChat(bot, `${username}, tidak ada build aktif.`)
    return
  }

  const invStatus = getInventoryStatus(bot, buildState.requiredBlocks)
  smartChat(bot, `ðŸ“¦ Inventory Status:`)

  if (invStatus.missing.length === 0) {
    smartChat(bot, `âœ… All blocks available!`)
  } else {
    smartChat(bot, `âš ï¸ Missing ${invStatus.missing.length} types:`)
    invStatus.missing.slice(0, 5).forEach(m => smartChat(bot, m))
    if (invStatus.missing.length > 5) {
      smartChat(bot, `... dan ${invStatus.missing.length - 5} lainnya`)
    }
  }
}

function handleStopCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!stop')) return

  if (buildState.isBuilding || buildsDatabase.active) {
    const buildId = buildState.buildId
    buildState.isBuilding = false
    cancelBuild()
    smartChat(bot, `${username}, build dibatalkan. ID: ${buildId}`)
  } else {
    smartChat(bot, `${username}, tidak ada build yang berjalan.`)
  }
}

function handleHistoryCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!history')) return

  loadDatabase()
  smartChat(bot, `ðŸ“œ Build History (last 5):`)

  const history = buildsDatabase.history.slice(-5).reverse()
  if (history.length === 0) {
    smartChat(bot, `Belum ada history build`)
  } else {
    history.forEach((build, i) => {
      const progress = ((build.placedBlocks / build.totalBlocks) * 100).toFixed(0)
      const status = build.status === 'completed' ? 'âœ…' : 'âŒ'
      smartChat(bot, `${i+1}. ${status} ${build.imageName} (${progress}%)`)
    })
  }
}

function handleHelpCommand(bot, username, message, isWhisper = false) {
  if (!message.startsWith('!help') || message.startsWith('!helpschem')) return

  smartChat(bot, '=== IMG Builder Commands ===')
  smartChat(bot, '!url <url> [palette] [size] - Build dari URL')
  smartChat(bot, '!build <file> [palette] [size] - Build dari file')
  smartChat(bot, '!pause - Pause build')
  smartChat(bot, '!resume - Resume build (auto TP)')
  smartChat(bot, '!stop - Cancel build')
  smartChat(bot, '!inventory - Cek inventory')
  smartChat(bot, '!history - Lihat history build')
  smartChat(bot, 'Palette: wool, concrete, basic, all')
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
    console.log(`[IMG Whisper] ðŸ“¨ From ${sender}: "${content}"`)
    currentWhisperSender = sender

    await handleUrlCommand(bot, sender, content, true)
    await handleBuildCommand(bot, sender, content, true)
    handlePauseCommand(bot, sender, content, true)
    handleResumeCommand(bot, sender, content, true)
    handleInventoryCommand(bot, sender, content, true)
    handleStopCommand(bot, sender, content, true)
    handleHistoryCommand(bot, sender, content, true)
    handleHelpCommand(bot, sender, content, true)

    setTimeout(() => {
      currentWhisperSender = null
    }, 5000)
  }
}

// =========================================================
// INITIALIZATION
// =========================================================
function initImg(bot, index) {
  console.log(`[Slot ${index + 1}] ðŸ–¼ï¸ IMG Builder AKTIF (SURVIVAL MODE)`)
  console.log(`[Slot ${index + 1}] ðŸ“ Images: ${IMAGES_FOLDER}`)
  console.log(`[Slot ${index + 1}] ðŸ’¾ Database: ${IMG_DB_FILE}`)
  console.log(`[Slot ${index + 1}] ðŸŽ¨ Palettes: wool, concrete, basic, all`)
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

  bot.once('spawn', () => {
    const loaded = loadBuildFromDatabase()
    if (loaded && buildState.pixelData.length > 0) {
      const progress = ((buildState.placedBlocks / buildState.totalBlocks) * 100).toFixed(1)
      bot.chat(`ðŸ”„ Unfinished build detected!`)
      bot.chat(`ðŸ“Š Progress: ${progress}% - ID: ${buildState.buildId}`)
      bot.chat(`Use !resume untuk melanjutkan`)
    }
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    handleUrlCommand(bot, username, message)
    handleBuildCommand(bot, username, message)
    handlePauseCommand(bot, username, message)
    handleResumeCommand(bot, username, message)
    handleInventoryCommand(bot, username, message)
    handleStopCommand(bot, username, message)
    handleHistoryCommand(bot, username, message)
    handleHelpCommand(bot, username, message)
  })

  bot.on('messagestr', (message) => {
    handleWhisperMessage(bot, message)
  })

  bot.on('end', () => {
    if (buildState.isBuilding) {
      console.log(`[IMG] ðŸ’¾ Auto-saving build state...`)
      saveBuildToDatabase()
    }
  })

  setTimeout(() => {
    bot.chat('ðŸ–¼ï¸ IMG Builder ready! (Survival + Auto TP)')
    bot.chat('Type !help untuk commands')
  }, 8000)
}

module.exports = {
  initImg,
  IMAGES_FOLDER,
  buildState,
  loadBuildFromDatabase,
  saveBuildToDatabase
}