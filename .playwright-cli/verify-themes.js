const WebSocket = require('ws');
const fs = require('fs');

// Read token
const envFile = fs.readFileSync('/var/tmp/vibe-kanban/worktrees/608e-ha-config-editor/Woow_ha_config_component/.env.ha-token', 'utf8');
const TOKEN = envFile.split('=')[1].trim();

const ws = new WebSocket('ws://localhost:15130/api/websocket');
let msgId = 1;

ws.on('open', () => console.log('Connected'));

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'auth_required') {
    ws.send(JSON.stringify({ type: 'auth', access_token: TOKEN }));
  }

  if (msg.type === 'auth_ok') {
    console.log('Authenticated');
    ws.send(JSON.stringify({ id: msgId++, type: 'frontend/get_themes' }));
  }

  if (msg.type === 'result' && msg.success && msg.id === 1) {
    const themes = Object.keys(msg.result.themes);
    console.log(`\nTotal themes loaded: ${themes.length}`);
    console.log('Default theme:', msg.result.default_theme);
    console.log('\nTheme list:');
    themes.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    ws.close();
    process.exit(0);
  }

  if (msg.type === 'result' && !msg.success) {
    console.error('Error:', msg.error);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (err) => { console.error('WS Error:', err.message); process.exit(1); });

setTimeout(() => { console.error('Timeout'); process.exit(1); }, 10000);
