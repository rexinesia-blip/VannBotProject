const fs = require('fs')
const path = require('path')
const { Vec3 } = require('vec3')

// =========================================================
// AUTO CREATE FOLDERS & DATABASE
// =========================================================
function ensureFolderExists(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true })
    console.log(`[RECORDER] ðŸ“ Folder created: ${folderPath}`)
  }
}

const DB_FOLDER = path.join(__dirname, 'database')
const RECIPES_FOLDER = path.join(__dirname, 'recipes')
const RECORDER_DB_FILE = path.join(DB_FOLDER, 'recorder_tasks.json')

ensureFolderExists(DB_FOLDER)
ensureFolderExists(RECIPES_FOLDER)

// =========================================================
// DATABASE MANAGEMENT
// =========================================================
let taskDatabase = {
  currentOwner: null,
  currentTask: null,
  savedRecipes: {}
}

function loadDatabase() {
  try {
    if (fs.existsSync(RECORDER_DB_FILE)) {
      const data = fs.readFileSync(RECORDER_DB_FILE, 'utf8')
      taskDatabase = JSON.parse(data)
      console.log('[RECORDER] ðŸ“‚ Database loaded')
      return true
    }
  } catch (error) {
    console.error('[RECORDER] âŒ Error loading database:', error.message)
  }
  return false
}

function saveDatabase() {
  try {
    fs.writeFileSync(RECORDER_DB_FILE, JSON.stringify(taskDatabase, null, 2))
    console.log('[RECORDER] ðŸ’¾ Database saved')
  } catch (error) {
    console.error('[RECORDER] âŒ Error saving database:', error.message)
  }
}

// =========================================================
// WHISPER TRACKING
// =========================================================
let currentWhisperSender = null

// =========================================================
// TASK STATE
// =========================================================
let taskState = {
  owner: null,
  isRunning: false,
  isPaused: false,
  isLooping: false,
  startPosition: null,
  steps: [],
  currentStepIndex: 0,
  executionCount: 0,
  startTime: null,
  lastStepTime: null
}

function resetTaskState() {
  taskState = {
    owner: taskState.owner,
    isRunning: false,
    isPaused: false,
    isLooping: taskState.isLooping,
    startPosition: taskState.startPosition,
    steps: taskState.steps,
    currentStepIndex: 0,
    executionCount: 0,
    startTime: null,
    lastStepTime: null
  }
}

// =========================================================
// SMART CHAT FUNCTION
// =========================================================
function smartChat(bot, message) {
  if (currentWhisperSender) {
    bot.chat(`/r ${message}`)
    console.log(`[RECORDER] ðŸ’¬ Whisper to ${currentWhisperSender}: ${message}`)
  } else {
    bot.chat(message)
    console.log(`[RECORDER] ðŸ’¬ Global: ${message}`)
  }
}

// =========================================================
// UTILITY FUNCTIONS - ENHANCED
// =========================================================

// Parse stack amount - UNLIMITED SUPPORT!
function parseStackAmount(stackStr) {
  const match = stackStr.match(/^(\d+)s$/i)
  if (!match) return null
  return parseInt(match[1]) * 64
}

// Normalize item name
function normalizeItemName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .trim()
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(str1, str2) {
  const matrix = []
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[str2.length][str1.length]
}

// Find best matching item (FUZZY MATCHING!)
function findBestMatchingItem(bot, window, searchName) {
  const normalized = normalizeItemName(searchName)
  let bestMatch = null
  let bestScore = 999

  const items = window ? window.containerItems() : bot.inventory.items()

  for (const item of items) {
    const itemName = normalizeItemName(item.name)

    if (itemName === normalized) {
      console.log(`[RECORDER] âœ… Exact match: ${item.name}`)
      return item
    }

    const distance = levenshteinDistance(normalized, itemName)

    if (itemName.includes(normalized) || normalized.includes(itemName)) {
      if (distance < bestScore) {
        bestScore = distance
        bestMatch = item
      }
    } else if (distance < bestScore && distance <= 3) {
      bestScore = distance
      bestMatch = item
    }
  }

  if (bestMatch) {
    console.log(`[RECORDER] ðŸŽ¯ Fuzzy match: "${searchName}" â†’ "${bestMatch.name}" (distance: ${bestScore})`)
    smartChat(bot, `ðŸŽ¯ Detected: ${bestMatch.name}`)
  }

  return bestMatch
}

async function takeItemFromContainer(bot, window, itemName, amount) {
  try {
    const item = findBestMatchingItem(bot, window, itemName)

    if (!item) {
      smartChat(bot, `âŒ Item "${itemName}" not found`)
      return false
    }

    const actualItemName = item.name
    let taken = 0

    while (taken < amount) {
      const item = window.containerItems().find(i => 
        normalizeItemName(i.name) === normalizeItemName(actualItemName)
      )

      if (!item) break

      const toTake = Math.min(amount - taken, item.count)
      await bot.clickWindow(item.slot, 0, 0)
      taken += toTake
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`[RECORDER] âœ… Took ${taken}x ${actualItemName}`)
    return true
  } catch (error) {
    console.error(`[RECORDER] âŒ Error taking item:`, error.message)
    return false
  }
}

async function putItemToContainer(bot, window, itemName, amount) {
  try {
    const item = findBestMatchingItem(bot, null, itemName)

    if (!item) {
      smartChat(bot, `âŒ Item "${itemName}" not in inventory`)
      return false
    }

    const actualItemName = item.name
    const items = bot.inventory.items().filter(i => 
      normalizeItemName(i.name) === normalizeItemName(actualItemName)
    )

    let deposited = 0

    for (const invItem of items) {
      if (deposited >= amount) break

      const toPut = Math.min(amount - deposited, invItem.count)
      await bot.clickWindow(invItem.slot, 0, 0)
      await new Promise(resolve => setTimeout(resolve, 50))

      const containerSlots = window.containerSlots()
      for (let i = 0; i < containerSlots.length; i++) {
        const slot = containerSlots[i]
        if (!slot || (normalizeItemName(slot.name) === normalizeItemName(actualItemName) && slot.count < 64)) {
          await bot.clickWindow(i, 0, 0)
          deposited += toPut
          break
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`[RECORDER] âœ… Put ${deposited}x ${actualItemName}`)
    return true
  } catch (error) {
    console.error(`[RECORDER] âŒ Error putting item:`, error.message)
    return false
  }
}

function findNearestFence(bot) {
  const fenceTypes = ['oak_fence', 'nether_brick_fence', 'spruce_fence', 'birch_fence', 'jungle_fence', 'acacia_fence', 'dark_oak_fence']
  let nearest = null
  let nearestDistance = 999

  for (const fenceType of fenceTypes) {
    const fence = bot.findBlock({
      matching: block => block.name === fenceType,
      maxDistance: 10
    })

    if (fence) {
      const distance = bot.entity.position.distanceTo(fence.position)
      if (distance < nearestDistance) {
        nearest = fence
        nearestDistance = distance
      }
    }
  }

  return nearest
}

// =========================================================
// STEP EXECUTION ENGINE
// =========================================================
async function executeStep(bot, step) {
  console.log(`[RECORDER] ðŸŽ¯ Executing step ${step.number}: ${step.type}`)
  taskState.lastStepTime = Date.now()

  try {
    switch (step.type) {
      case 'goto':
        return await executeGoto(bot, step)
      case 'takechest':
        return await executeTakeChest(bot, step)
      case 'putchest':
        return await executePutChest(bot, step)
      case 'takedispenser':
        return await executeTakeDispenser(bot, step)
      case 'putdispenser':
        return await executePutDispenser(bot, step)
      case 'click':
        return await executeClick(bot, step)
      default:
        console.log(`[RECORDER] âš ï¸ Unknown step type: ${step.type}`)
        return true
    }
  } catch (error) {
    console.error(`[RECORDER] âŒ Error executing step ${step.number}:`, error.message)
    smartChat(bot, `âŒ Error at step ${step.number}: ${error.message}`)
    return false
  }
}

async function executeGoto(bot, step) {
  const targetPos = step.position
  const currentPos = bot.entity.position
  const distance = currentPos.distanceTo(new Vec3(targetPos.x, targetPos.y, targetPos.z))

  console.log(`[RECORDER] ðŸš¶ Going to: ${targetPos.x}, ${targetPos.y}, ${targetPos.z}`)

  if (distance < 2) {
    console.log(`[RECORDER] âœ… Already at position`)
    return true
  }

  if (bot.pathfinder) {
    const { goals } = require('mineflayer-pathfinder')
    const goal = new goals.GoalBlock(targetPos.x, targetPos.y, targetPos.z)

    try {
      await bot.pathfinder.goto(goal)
      console.log(`[RECORDER] âœ… Arrived`)
      return true
    } catch (error) {
      console.error(`[RECORDER] âŒ Pathfinding failed:`, error.message)
      smartChat(bot, `âŒ Failed to reach step ${step.number}`)
      return false
    }
  } else {
    smartChat(bot, `âš ï¸ Pathfinder not available`)
    return false
  }
}

async function executeTakeChest(bot, step) {
  await executeGoto(bot, step)

  const chestBlock = bot.blockAt(new Vec3(step.position.x, step.position.y, step.position.z))
  if (!chestBlock || !chestBlock.name.includes('chest')) {
    smartChat(bot, `âŒ No chest at step ${step.number}`)
    return false
  }

  console.log(`[RECORDER] ðŸ“¦ Opening chest...`)
  const chest = await bot.openContainer(chestBlock)
  await new Promise(resolve => setTimeout(resolve, 500))

  const success = await takeItemFromContainer(bot, chest, step.itemName, step.amount)

  chest.close()
  await new Promise(resolve => setTimeout(resolve, 300))

  if (success) {
    smartChat(bot, `âœ… Took ${step.amount}x ${step.itemName}`)
  }

  return success
}

async function executePutChest(bot, step) {
  await executeGoto(bot, step)

  const chestBlock = bot.blockAt(new Vec3(step.position.x, step.position.y, step.position.z))
  if (!chestBlock || !chestBlock.name.includes('chest')) {
    smartChat(bot, `âŒ No chest at step ${step.number}`)
    return false
  }

  console.log(`[RECORDER] ðŸ“¦ Opening chest...`)
  const chest = await bot.openContainer(chestBlock)
  await new Promise(resolve => setTimeout(resolve, 500))

  const success = await putItemToContainer(bot, chest, step.itemName, step.amount)

  chest.close()
  await new Promise(resolve => setTimeout(resolve, 300))

  if (success) {
    smartChat(bot, `âœ… Put ${step.amount}x ${step.itemName}`)
  }

  return success
}

async function executeTakeDispenser(bot, step) {
  await executeGoto(bot, step)

  const dispenserBlock = bot.blockAt(new Vec3(step.position.x, step.position.y, step.position.z))
  if (!dispenserBlock || dispenserBlock.name !== 'dispenser') {
    smartChat(bot, `âŒ No dispenser at step ${step.number}`)
    return false
  }

  console.log(`[RECORDER] ðŸŽ° Opening dispenser...`)
  const dispenser = await bot.openContainer(dispenserBlock)
  await new Promise(resolve => setTimeout(resolve, 500))

  const success = await takeItemFromContainer(bot, dispenser, step.itemName, step.amount)

  dispenser.close()
  await new Promise(resolve => setTimeout(resolve, 300))

  if (success) {
    smartChat(bot, `âœ… Took ${step.amount}x ${step.itemName}`)
  }

  return success
}

async function executePutDispenser(bot, step) {
  await executeGoto(bot, step)

  const dispenserBlock = bot.blockAt(new Vec3(step.position.x, step.position.y, step.position.z))
  if (!dispenserBlock || dispenserBlock.name !== 'dispenser') {
    smartChat(bot, `âŒ No dispenser at step ${step.number}`)
    return false
  }

  console.log(`[RECORDER] ðŸŽ° Opening dispenser...`)
  const dispenser = await bot.openContainer(dispenserBlock)
  await new Promise(resolve => setTimeout(resolve, 500))

  const success = await putItemToContainer(bot, dispenser, step.itemName, step.amount)

  dispenser.close()
  await new Promise(resolve => setTimeout(resolve, 300))

  if (success) {
    smartChat(bot, `âœ… Put ${step.amount}x ${step.itemName}`)
  }

  return success
}

async function executeClick(bot, step) {
  const fence = findNearestFence(bot)

  if (!fence) {
    smartChat(bot, `âŒ No fence found at step ${step.number}`)
    return false
  }

  const fencePos = fence.position
  console.log(`[RECORDER] ðŸŽ¯ Found fence at: ${fencePos.x}, ${fencePos.y}, ${fencePos.z}`)
  smartChat(bot, `ðŸŽ¯ Clicking fence for ${step.duration}s...`)

  const endTime = Date.now() + (step.duration * 1000)
  let clicks = 0

  while (Date.now() < endTime && taskState.isRunning && !taskState.isPaused) {
    try {
      await bot.lookAt(fencePos.offset(0.5, 0.5, 0.5))
      await bot.activateBlock(fence)
      clicks++
      await new Promise(resolve => setTimeout(resolve, 50))
    } catch (error) {
      console.error(`[RECORDER] âš ï¸ Click error:`, error.message)
    }
  }

  console.log(`[RECORDER] âœ… Clicked ${clicks} times in ${step.duration}s`)
  smartChat(bot, `âœ… Clicked fence ${clicks}x`)

  return true
}

// =========================================================
// TASK EXECUTION LOOP
// =========================================================
async function executeTask(bot) {
  if (!taskState.owner) {
    smartChat(bot, 'âŒ Owner not set! Use !setonwer <name>')
    return
  }

  if (taskState.steps.length === 0) {
    smartChat(bot, 'âŒ No steps! Use !set1, !set2, etc')
    return
  }

  taskState.isRunning = true
  taskState.isPaused = false
  taskState.startTime = Date.now()
  taskState.executionCount++

  console.log(`[RECORDER] ðŸš€ Starting task #${taskState.executionCount}`)
  smartChat(bot, `ðŸš€ Starting task... (${taskState.steps.length} steps)`)

  if (taskState.startPosition) {
    console.log(`[RECORDER] ðŸ Going to start position...`)
    await executeGoto(bot, { position: taskState.startPosition, number: 0 })
  }

  for (let i = 0; i < taskState.steps.length; i++) {
    if (!taskState.isRunning) {
      smartChat(bot, 'â¹ï¸ Task stopped')
      break
    }

    while (taskState.isPaused) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    taskState.currentStepIndex = i
    const step = taskState.steps[i]

    const success = await executeStep(bot, step)

    if (!success) {
      smartChat(bot, `âŒ Task failed at step ${step.number}`)
      taskState.isRunning = false
      return
    }

    await new Promise(resolve => setTimeout(resolve, 300))
  }

  const elapsed = ((Date.now() - taskState.startTime) / 1000).toFixed(1)
  console.log(`[RECORDER] âœ… Task completed in ${elapsed}s`)
  smartChat(bot, `âœ… Task complete! (${elapsed}s)`)

  if (taskState.isLooping && taskState.isRunning) {
    console.log(`[RECORDER] ðŸ”„ Looping... (#${taskState.executionCount})`)
    smartChat(bot, `ðŸ”„ Loop #${taskState.executionCount + 1}...`)
    await new Promise(resolve => setTimeout(resolve, 1000))
    await executeTask(bot)
  } else {
    taskState.isRunning = false
  }
}

// =========================================================
// COMMAND HANDLERS
// =========================================================
function handleSetOnwerCommand(bot, username, message, isWhisper = false) {
  const match = message.match(/^!setonwer\s+(\S+)$/i)
  if (!match) return

  const owner = match[1]
  taskState.owner = owner
  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, `âœ… Owner set: ${owner}`)
  console.log(`[RECORDER] ðŸ‘¤ Owner: ${owner}`)
  saveDatabase()
}

async function handleSetStartCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!set\s+start$/i)) return

  if (!taskState.owner) {
    smartChat(bot, 'âŒ Set owner first: !setonwer <name>')
    return
  }

  const owner = bot.players[taskState.owner]
  if (!owner || !owner.entity) {
    smartChat(bot, `âŒ Player ${taskState.owner} not found`)
    return
  }

  taskState.startPosition = owner.entity.position.floored()
  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, `ðŸ Start position set!`)
  console.log(`[RECORDER] ðŸ Start: ${taskState.startPosition.x}, ${taskState.startPosition.y}, ${taskState.startPosition.z}`)

  if (bot.pathfinder) {
    const { goals } = require('mineflayer-pathfinder')
    const goal = new goals.GoalBlock(taskState.startPosition.x, taskState.startPosition.y, taskState.startPosition.z)

    try {
      await bot.pathfinder.goto(goal)
      smartChat(bot, `âœ… Arrived at start!`)
    } catch (error) {
      smartChat(bot, `âŒ Failed to reach start`)
    }
  }

  saveDatabase()
}

function handleSetStepCommand(bot, username, message, isWhisper = false) {
  const match = message.match(/^!set(\d+)(?:\s+(.+))?$/i)
  if (!match) return

  if (!taskState.owner) {
    smartChat(bot, 'âŒ Set owner first: !setonwer <name>')
    return
  }

  const stepNumber = parseInt(match[1])
  const actionStr = match[2]
  currentWhisperSender = isWhisper ? username : null

  const owner = bot.players[taskState.owner]
  if (!owner || !owner.entity) {
    smartChat(bot, `âŒ Player ${taskState.owner} not found`)
    return
  }

  const ownerPos = owner.entity.position.floored()

  if (!actionStr) {
    const step = {
      number: stepNumber,
      type: 'goto',
      position: ownerPos
    }

    const existingIndex = taskState.steps.findIndex(s => s.number === stepNumber)
    if (existingIndex >= 0) {
      taskState.steps[existingIndex] = step
    } else {
      taskState.steps.push(step)
    }

    taskState.steps.sort((a, b) => a.number - b.number)

    smartChat(bot, `âœ… Step ${stepNumber} saved (goto)`)
    console.log(`[RECORDER] ðŸ“ Step ${stepNumber}: goto`)
    saveDatabase()
    return
  }

  let step = {
    number: stepNumber,
    position: ownerPos
  }

  if (actionStr.match(/^takechest\s+(\d+s)\s+(.+)$/i)) {
    const parts = actionStr.match(/^takechest\s+(\d+s)\s+(.+)$/i)
    const amount = parseStackAmount(parts[1])
    const itemName = parts[2].trim()

    step.type = 'takechest'
    step.amount = amount
    step.itemName = itemName

    smartChat(bot, `âœ… Step ${stepNumber}: takechest ${amount}x ${itemName}`)
  }
  else if (actionStr.match(/^putchest\s+(\d+s)\s+(.+)$/i)) {
    const parts = actionStr.match(/^putchest\s+(\d+s)\s+(.+)$/i)
    const amount = parseStackAmount(parts[1])
    const itemName = parts[2].trim()

    step.type = 'putchest'
    step.amount = amount
    step.itemName = itemName

    smartChat(bot, `âœ… Step ${stepNumber}: putchest ${amount}x ${itemName}`)
  }
  else if (actionStr.match(/^takedispenser\s+(\d+s)\s+(.+)$/i)) {
    const parts = actionStr.match(/^takedispenser\s+(\d+s)\s+(.+)$/i)
    const amount = parseStackAmount(parts[1])
    const itemName = parts[2].trim()

    step.type = 'takedispenser'
    step.amount = amount
    step.itemName = itemName

    smartChat(bot, `âœ… Step ${stepNumber}: takedispenser ${amount}x ${itemName}`)
  }
  else if (actionStr.match(/^putdispenser\s+(\d+s)\s+(.+)$/i)) {
    const parts = actionStr.match(/^putdispenser\s+(\d+s)\s+(.+)$/i)
    const amount = parseStackAmount(parts[1])
    const itemName = parts[2].trim()

    step.type = 'putdispenser'
    step.amount = amount
    step.itemName = itemName

    smartChat(bot, `âœ… Step ${stepNumber}: putdispenser ${amount}x ${itemName}`)
  }
  else if (actionStr.match(/^click\s+(\d+)sec$/i)) {
    const parts = actionStr.match(/^click\s+(\d+)sec$/i)
    const duration = parseInt(parts[1])

    step.type = 'click'
    step.duration = duration

    smartChat(bot, `âœ… Step ${stepNumber}: click ${duration}s`)
  }
  else {
    smartChat(bot, `âŒ Invalid format! Example: !set2 takechest 8s Copper Dust`)
    return
  }

  const existingIndex = taskState.steps.findIndex(s => s.number === stepNumber)
  if (existingIndex >= 0) {
    taskState.steps[existingIndex] = step
  } else {
    taskState.steps.push(step)
  }

  taskState.steps.sort((a, b) => a.number - b.number)

  console.log(`[RECORDER] âœ… Step ${stepNumber} saved`)
  saveDatabase()
}

function handleSetLoopCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!setloop$/i)) return

  taskState.isLooping = true
  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, `ðŸ”„ Loop: ENABLED`)
  console.log(`[RECORDER] ðŸ”„ Loop enabled`)
  saveDatabase()
}

function handleSetNoLoopCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!setnoloop$/i)) return

  taskState.isLooping = false
  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, `â­• Loop: DISABLED`)
  console.log(`[RECORDER] â­• Loop disabled`)
  saveDatabase()
}

async function handleSetPlayCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!set\s+play$/i)) return

  if (taskState.isRunning) {
    smartChat(bot, 'âš ï¸ Task already running!')
    return
  }

  currentWhisperSender = isWhisper ? username : null
  await executeTask(bot)
}

function handleSetStopCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!set\s+stop$/i)) return

  if (!taskState.isRunning) {
    smartChat(bot, 'âš ï¸ Task not running')
    return
  }

  taskState.isRunning = false
  taskState.isPaused = false
  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, 'â¹ï¸ Task stopped')
  console.log(`[RECORDER] â¹ï¸ Task stopped`)
}

function handleSetPauseCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!set\s+pause$/i)) return

  if (!taskState.isRunning) {
    smartChat(bot, 'âš ï¸ Task not running')
    return
  }

  if (taskState.isPaused) {
    smartChat(bot, 'âš ï¸ Already paused')
    return
  }

  taskState.isPaused = true
  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, 'â¸ï¸ Task paused')
  console.log(`[RECORDER] â¸ï¸ Task paused`)
}

function handleSetResumeCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!set\s+resume$/i)) return

  if (!taskState.isRunning) {
    smartChat(bot, 'âš ï¸ Task not running')
    return
  }

  if (!taskState.isPaused) {
    smartChat(bot, 'âš ï¸ Not paused')
    return
  }

  taskState.isPaused = false
  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, 'â–¶ï¸ Task resumed')
  console.log(`[RECORDER] â–¶ï¸ Task resumed`)
}

function handleSetListCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!set\s+list$/i)) return

  currentWhisperSender = isWhisper ? username : null

  if (taskState.steps.length === 0) {
    smartChat(bot, 'ðŸ“‹ No steps')
    return
  }

  smartChat(bot, `ðŸ“‹ Steps (${taskState.steps.length}):`)
  taskState.steps.forEach((step, i) => {
    if (i >= 5) return

    let desc = `${step.number}. ${step.type}`
    if (step.type === 'takechest' || step.type === 'putchest' || 
        step.type === 'takedispenser' || step.type === 'putdispenser') {
      desc += ` ${step.amount}x ${step.itemName}`
    } else if (step.type === 'click') {
      desc += ` ${step.duration}s`
    }
    smartChat(bot, desc)
  })

  if (taskState.steps.length > 5) {
    smartChat(bot, `... and ${taskState.steps.length - 5} more`)
  }

  smartChat(bot, `Loop: ${taskState.isLooping ? 'ON' : 'OFF'}`)
}

function handleSetClearCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!set\s+clear$/i)) return

  taskState.steps = []
  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, 'ðŸ—‘ï¸ All steps cleared')
  console.log(`[RECORDER] ðŸ—‘ï¸ Steps cleared`)
  saveDatabase()
}

function handleSetStatusCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!set\s+status$/i)) return

  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, `ðŸ“Š Recorder Status:`)
  smartChat(bot, `Owner: ${taskState.owner || 'Not set'}`)
  smartChat(bot, `Steps: ${taskState.steps.length}`)
  smartChat(bot, `Loop: ${taskState.isLooping ? 'ON' : 'OFF'}`)
  smartChat(bot, `Running: ${taskState.isRunning ? 'YES' : 'NO'}`)

  if (taskState.isRunning) {
    smartChat(bot, `Step: ${taskState.currentStepIndex + 1}/${taskState.steps.length}`)
    smartChat(bot, `Cycle: #${taskState.executionCount}`)
  }
}

function handleSetHelpCommand(bot, username, message, isWhisper = false) {
  if (!message.match(/^!set\s+help$/i)) return

  currentWhisperSender = isWhisper ? username : null

  smartChat(bot, '=== Recorder Bot Commands ===')
  smartChat(bot, '!setonwer <name> - Set owner')
  smartChat(bot, '!set start - Set start point')
  smartChat(bot, '!set<N> - Save position')
  smartChat(bot, '!set<N> takechest <X>s <item>')
  smartChat(bot, '!set<N> putdispenser <X>s <item>')
  smartChat(bot, '!set<N> click <X>sec')
  smartChat(bot, '!setloop / !setnoloop')
  smartChat(bot, '!set play / stop / pause')
  smartChat(bot, '!set list / clear / status')
  smartChat(bot, 'âœ¨ Fuzzy match + Unlimited stack!')
}

// =========================================================
// WHISPER HANDLER
// =========================================================
async function handleWhisperMessage(bot, message) {
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

  if (sender && content) {
    console.log(`[RECORDER Whisper] ðŸ“¨ ${sender}: "${content}"`)
    currentWhisperSender = sender

    handleSetOnwerCommand(bot, sender, content, true)
    await handleSetStartCommand(bot, sender, content, true)
    handleSetStepCommand(bot, sender, content, true)
    handleSetLoopCommand(bot, sender, content, true)
    handleSetNoLoopCommand(bot, sender, content, true)
    await handleSetPlayCommand(bot, sender, content, true)
    handleSetStopCommand(bot, sender, content, true)
    handleSetPauseCommand(bot, sender, content, true)
    handleSetResumeCommand(bot, sender, content, true)
    handleSetListCommand(bot, sender, content, true)
    handleSetClearCommand(bot, sender, content, true)
    handleSetStatusCommand(bot, sender, content, true)
    handleSetHelpCommand(bot, sender, content, true)

    setTimeout(() => {
      currentWhisperSender = null
    }, 5000)
  }
}

// =========================================================
// INITIALIZATION
// =========================================================
function initRecorder(bot, index) {
  console.log(`[Slot ${index + 1}] ðŸŽ¬ Recorder Bot ACTIVE`)
  console.log(`[Slot ${index + 1}] ðŸ’¾ Database: ${RECORDER_DB_FILE}`)
  console.log(`[Slot ${index + 1}] âœ¨ Fuzzy Matching + Unlimited Stack`)

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

  loadDatabase()

  bot.once('spawn', () => {
    if (taskState.owner && taskState.steps.length > 0) {
      bot.chat(`ðŸŽ¬ Recorder ready! Owner: ${taskState.owner}`)
      bot.chat(`âœ¨ ${taskState.steps.length} steps | Loop: ${taskState.isLooping ? 'ON' : 'OFF'}`)
    }
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return

    handleSetOnwerCommand(bot, username, message)
    handleSetStartCommand(bot, username, message)
    handleSetStepCommand(bot, username, message)
    handleSetLoopCommand(bot, username, message)
    handleSetNoLoopCommand(bot, username, message)
    handleSetPlayCommand(bot, username, message)
    handleSetStopCommand(bot, username, message)
    handleSetPauseCommand(bot, username, message)
    handleSetResumeCommand(bot, username, message)
    handleSetListCommand(bot, username, message)
    handleSetClearCommand(bot, username, message)
    handleSetStatusCommand(bot, username, message)
    handleSetHelpCommand(bot, username, message)
  })

  bot.on('messagestr', (message) => {
    handleWhisperMessage(bot, message)
  })

  bot.on('end', () => {
    if (taskState.steps.length > 0) {
      console.log(`[RECORDER] ðŸ’¾ Auto-saving...`)
      saveDatabase()
    }
  })

  setTimeout(() => {
    bot.chat('ðŸŽ¬ Recorder Bot ready!')
    bot.chat('âœ¨ Type !set help for commands')
  }, 10000)
}

module.exports = {
  initRecorder,
  taskState,
  loadDatabase,
  saveDatabase
}