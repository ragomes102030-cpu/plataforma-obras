const WebSocket = require('C:/AIONUI0102/AionUi clone/node_modules/ws');
const url = process.argv[2];
const expr = process.argv[3];
const ws = new WebSocket(url);
let id = 0;
const send = (m, p = {}) => ws.send(JSON.stringify({ id: ++id, method: m, params: p }));
ws.on('open', () => {
  send('Runtime.enable');
  send('Page.enable');
  send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
});
ws.on('message', (m) => {
  const x = JSON.parse(m);
  if (x.id === 3) {
    if (x.error) console.log('ERRO:', JSON.stringify(x.error));
    else console.log(typeof x.result?.result?.value === 'string'
      ? x.result.result.value
      : JSON.stringify(x.result?.result?.value, null, 1));
    process.exit(0);
  }
});
ws.on('error', e => { console.log('WS ERROR:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 30000);
