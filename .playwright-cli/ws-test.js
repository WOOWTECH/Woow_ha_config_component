const WebSocket = require('ws');

const TOKEN = process.argv[2];
const DEPTH = parseInt(process.argv[3] || '10');

const ws = new WebSocket('ws://localhost:15130/api/websocket');

let msgId = 1;

ws.on('open', () => {});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'auth_required') {
    ws.send(JSON.stringify({ type: 'auth', access_token: TOKEN }));
  }

  if (msg.type === 'auth_ok') {
    // List files with specified depth
    ws.send(JSON.stringify({
      id: msgId++,
      type: 'config_editor/ws',
      action: 'list',
      file: '',
      data: '',
      ext: 'yaml',
      depth: DEPTH
    }));
  }

  if (msg.type === 'result' && msg.success) {
    const r = msg.result;
    console.log('=== DEPTH: ' + DEPTH + ' ===');
    console.log('Status: ' + r.msg);
    console.log('Files found: ' + r.file.length);
    r.file.sort().forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));

    // Also list ALL files
    ws.send(JSON.stringify({
      id: msgId++,
      type: 'config_editor/ws',
      action: 'list',
      file: '',
      data: '',
      ext: 'all',
      depth: DEPTH
    }));
  }

  if (msg.id === 2 && msg.type === 'result' && msg.success) {
    const r = msg.result;
    console.log('\n=== ALL FILES (ext=all, depth=' + DEPTH + ') ===');
    console.log('Status: ' + r.msg);
    console.log('Files found: ' + r.file.length);
    r.file.sort().forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));

    // Test save (new file creation) - just test the mechanism
    ws.send(JSON.stringify({
      id: msgId++,
      type: 'config_editor/ws',
      action: 'save',
      file: 'test_new_file.yaml',
      data: '# Test new file creation\ntest: true\ncreated_by: verification_script\n',
      ext: 'yaml',
      depth: DEPTH
    }));
  }

  if (msg.id === 3 && msg.type === 'result') {
    if (msg.success) {
      console.log('\n=== NEW FILE CREATION TEST ===');
      console.log('Result: ' + msg.result.msg);
      console.log('New file creation: SUCCESS');

      // Now delete the test file by loading + verify
      ws.send(JSON.stringify({
        id: msgId++,
        type: 'config_editor/ws',
        action: 'load',
        file: 'test_new_file.yaml',
        data: '',
        ext: 'yaml',
        depth: DEPTH
      }));
    } else {
      console.log('New file creation: FAILED - ' + JSON.stringify(msg.error));
    }
  }

  if (msg.id === 4 && msg.type === 'result') {
    if (msg.success) {
      console.log('Verify load: ' + msg.result.msg);
      console.log('Content: ' + msg.result.data.trim());
    }
    console.log('\n=== ALL TESTS COMPLETE ===');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('Timeout');
  process.exit(1);
}, 15000);
