const sqlite3 = require('sqlite3').verbose();

// ⭐ PER-PLAYER AI MEMORY
const USER_DB = new sqlite3.Database('./user_context.db');

USER_DB.run(`CREATE TABLE IF NOT EXISTS players (
  username TEXT PRIMARY KEY,
  chats INTEGER DEFAULT 0,
  personality TEXT DEFAULT 'normal',
  last_seen INTEGER,
  favorite_topic TEXT
)`);

async function getPlayer(username) {
  return new Promise(resolve => {
    USER_DB.get('SELECT * FROM players WHERE username = ?', [username], (err, row) => {
      resolve(row || { personality: 'normal', chats: 0 });
    });
  });
}

function rememberPlayer(username, info) {
  USER_DB.run(`INSERT OR REPLACE INTO players (username, chats, personality, last_seen)
    VALUES (?, COALESCE((SELECT chats+1 FROM players WHERE username=?), 1), ?, ?)`,
    [username, username, info.personality || 'normal', Date.now()]);
}

module.exports = { getPlayer, rememberPlayer };
console.log('🧠 Player Memory System ACTIVE');
