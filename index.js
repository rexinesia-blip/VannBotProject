const mineflayer = require('mineflayer');
const { getUserContext } = require('./ai');

// ⭐ COMPLETE CONFIG - Alwination.id
const config = {
  host: 'alwination.id',
  port: 25565,
  version: '1.16.5',
  username: 'VannBot_v2'
};

console.log(`🚀 Starting VannBot v2.0 → ${config.host}`);
const bot = mineflayer.createBot(config);

// ⭐ ALL SYSTEMS
let maintenanceMode = false;
let earthModeActive = false;
const ADMINS = ['Vann', 'vann', 'Rexi', 'rexinesia'];

bot.once('spawn', async () => {
  console.log(`🤖 ${bot.username} spawned!`);

  if (maintenanceMode) {
    setTimeout(() => bot.chat('/move earth'), 3000);
  }
});

bot.on('chat', async (username, message) => {
  // Earth lobby auto-confirm
  if (earthModeActive && message.toLowerCase().includes('earth')) {
    earthModeActive = false;
    console.log('✅ Lobby reached');
  }

  // ⭐ SUPER ADMIN PANEL
  if (ADMINS.includes(username)) {
    const commands = {
      '/test': '✅ VannBot v2.0 - FULL FEATURES OK!',
      '/status': `Status: ${maintenanceMode ? 'ON' : 'OFF'}, ${Math.floor(process.uptime()/60)}m`,
      '/maintenance on': () => {
        maintenanceMode = true;
        earthModeActive = true;
        bot.chat('/move earth');
      },
      '/maintenance off': () => {
        maintenanceMode = false;
        earthModeActive = false;
      },
      '/restart': () => setTimeout(() => process.exit(1), 3000)
    };

    for (let [cmd, action] of Object.entries(commands)) {
      if (message === cmd) {
        if (typeof action === 'function') action();
        else bot.chat(action);
        break;
      }
    }
  }
});

bot.on('error', err => console.error('❌', err.message));
bot.on('end', () => {
  console.log('🔄 Auto-restart...');
  setTimeout(() => process.exit(1), 5000);
});

console.log('🎉 VannBot v2.0 LIVE! /test /status /maintenance');
