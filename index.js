const mineflayer = require('mineflayer');
const { getUserContext } = require('./ai');

// ⭐ SERVER CONFIG - Alwination.id (MAIN)
const SERVERS = {
  main: {
    host: 'alwination.id',
    port: 25565,
    version: '1.16.5'
  }
};

const config = SERVERS.main;
console.log(`🚀 VannBot connecting to ${config.host}:${config.port}`);

const bot = mineflayer.createBot(config);

// ⭐ CORE SYSTEMS
let maintenanceMode = process.env.MAINTENANCE === 'true' || false;
let earthModeActive = false;
const ADMINS = ['Vann', 'vann', 'Rexi', 'rexinesia'];

bot.once('spawn', async () => {
  console.log(`🤖 [${bot.username || 'VannBot'}] Spawned in ${bot.world?.dimension || 'overworld'}`);

  // Auto-maintenance lobby
  if (maintenanceMode) {
    setTimeout(() => {
      bot.chat('/move earth');
      earthModeActive = true;
      console.log('🏠 [MAINTENANCE] Moving to Earth lobby...');
    }, 3000);
  }
});

bot.on('chat', async (username, message) => {
  // Auto confirm earth move
  if (earthModeActive && message.toLowerCase().includes('earth') && !message.includes('failed')) {
    earthModeActive = false;
    console.log('✅ Earth lobby reached - Maintenance mode stable');
  }

  // ⭐ SUPER ADMIN COMMANDS (Vann/Rexi only)
  if (ADMINS.includes(username)) {
    switch (true) {
      case message === '/test':
        bot.chat('✅ VannBot v2.0 - Alwination.id TEST SUCCESS!');
        break;
      case message === '/maintenance on':
        maintenanceMode = true;
        earthModeActive = true;
        bot.chat('/move earth');
        console.log('🛠️ Maintenance ACTIVATED');
        break;
      case message === '/maintenance off':
        maintenanceMode = false;
        earthModeActive = false;
        console.log('✅ Maintenance DEACTIVATED');
        break;
      case message === '/status':
        const uptime = Math.floor(process.uptime() / 60);
        bot.chat(`🤖 Status: Maintenance=${maintenanceMode ? '🟡 ON' : '🟢 OFF'}, Uptime=${uptime}m, World=${bot.world?.dimension || 'unknown'}`);
        break;
      case message === '/restart':
        bot.chat('🔄 Restarting in 5 seconds...');
        setTimeout(() => process.exit(1), 5000);
        break;
    }
  }
});

// Error handling & auto-restart
bot.on('error', (err) => {
  console.error('❌ Bot error:', err.message);
});

bot.on('end', () => {
  console.log('🔌 Disconnected - Auto restart in 5s...');
  setTimeout(() => process.exit(1), 5000);
});

console.log('🎉 VannBot v2.0 READY! Commands: /test /status /maintenance');
module.exports = { bot, config, ADMINS };
