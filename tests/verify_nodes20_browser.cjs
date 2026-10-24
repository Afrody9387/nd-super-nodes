// Browser integration against the installed, unmodified ComfyUI frontend.
// Backend APIs are isolated fixtures: no user workflows, models, or GPU jobs.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
assert(process.argv.includes('--frontend-root'), '--frontend-root is required');
const frontend = path.resolve(option('--frontend-root'));
const plugin = path.resolve(__dirname, '..');
const screenshots = path.resolve(option('--screenshots') || '.');
fs.mkdirSync(screenshots, { recursive: true });
const definitions = {
  NdSuperLoraLoader: {
    input: { required: { model: ['MODEL'] }, optional: { clip: ['CLIP'], lora_bundle: ['STRING'] } },
    input_order: { required: ['model'], optional: ['clip', 'lora_bundle'] },
    output: ['MODEL', 'CLIP', 'STRING'], output_name: ['MODEL', 'CLIP', 'TRIGGER_WORDS'],
    output_is_list: [false, false, false], name: 'NdSuperLoraLoader', display_name: 'ND Super LoRA Loader',
    python_module: 'custom_nodes.nd-super-nodes', category: 'loaders', output_node: false,
  },
  LoraLoader: {
    input: { required: { lora_name: [['fixture/first.safetensors', 'fixture/second.safetensors', 'fixture/third.safetensors']] } },
    output: ['MODEL'], output_name: ['MODEL'], output_is_list: [false], name: 'LoraLoader',
    display_name: 'Load LoRA', category: 'loaders', output_node: false,
    python_module: 'nodes', description: '',
  },
};
const settings = { 'Comfy.VueNodes.Enabled': true, 'Comfy.TutorialCompleted': true, 'Comfy.InstalledVersion': '1.55.18', 'Comfy.ColorPalette': 'dark' };
const requests = new Set();
function send(res, value) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
function file(res, root, name) {
  const target = path.resolve(root, name);
  if (!target.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname.replace(/^\/api(?=\/)/, '');
  if (url.pathname.startsWith('/extensions/nd-super-nodes/')) return file(res, path.join(plugin, 'web'), url.pathname.slice('/extensions/nd-super-nodes/'.length));
  if (route === '/extensions') return send(res, ['/extensions/nd-super-nodes/extension.js']);
  if (route === '/object_info') return send(res, definitions);
  if (route.startsWith('/object_info/')) return send(res, definitions);
  if (route === '/settings') return send(res, settings);
  if (route.startsWith('/settings/')) return send(res, true);
  if (route === '/users') return send(res, { storage: 'server', migrated: true });
  if (route === '/system_stats') return send(res, { system: { comfyui_version: '0.38.0', os: 'win32', python_version: '3.13', pytorch_version: '2.12', argv: [], required_frontend_version: '1.55.18' }, devices: [] });
  if (route === '/jobs') return send(res, { jobs: [], pagination: { offset: 0, limit: 200, total: 0, has_more: false } });
  if (route === '/prompt') return send(res, { exec_info: { queue_remaining: 0 } });
  if (route === '/queue') return send(res, { queue_running: [], queue_pending: [] });
  if (route.startsWith('/userdata')) return send(res, []);
  if (route === '/super_lora/templates') return send(res, { templates: [] });
  if (route === '/super_lora/version') return send(res, { hasUpdate: false, localVersion: { version: '1.9.0' } });
  if (route.startsWith('/super_lora/')) return send(res, {});
  if (route.includes('/models') || route.startsWith('/embeddings') || route.startsWith('/workflow_templates')) return send(res, []);
  if (route.startsWith('/features') || route.startsWith('/server_features') || route.startsWith('/history') || route.startsWith('/global_subgraphs')) return send(res, {});
  if (url.pathname === '/' || /\.[a-z0-9]+$/i.test(url.pathname)) return file(res, frontend, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  requests.add(`${req.method} ${url.pathname}`);
  send(res, {});
});
const sockets = new Set();
server.on('upgrade', (req, socket) => {
  const accept = require('node:crypto').createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const message = Buffer.from(JSON.stringify({ type: 'status', data: { sid: 'qa', status: { exec_info: { queue_remaining: 0 } } } }));
  socket.write(Buffer.concat([Buffer.from([0x81, message.length]), message]));
  sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: option('--browser'), headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.app?.graph && window.SuperLoraNode && window.LiteGraph?.registered_node_types?.NdSuperLoraLoader, undefined, { timeout: 45000 });
    await page.evaluate(async () => {
      const app = window.app;
      await app.ui.settings.setSettingValue('Comfy.VueNodes.Enabled', true);
      app.graph.clear();
      const node = window.LiteGraph.createNode('NdSuperLoraLoader');
      app.graph.add(node); node.pos = [80, 90]; node.size = [520, 440];
      window.qaNode = node;
      window.SuperLoraNode.addLoraWidget(node, { lora: 'fixture/first.safetensors', strength: .8, strengthClip: .3, enabled: true });
      window.SuperLoraNode.addLoraWidget(node, { lora: 'fixture/second.safetensors', strength: 1, strengthClip: 1, enabled: true });
      node.properties.showSeparateStrengths = true;
      node.properties.autoFetchTriggerWords = false;
      window.SuperLoraNode.syncExecutionWidgets(node);
      app.canvas.ds.scale = 1; app.canvas.ds.offset = [0, 0]; app.canvas.setDirty(true, true);
    });
    const panel = page.locator('.nd-lora-panel');
    await page.waitForFunction(() => window.LiteGraph.vueNodesMode === true);
    await panel.waitFor({ state: 'visible', timeout: 20000 });
    assert.equal(await panel.locator('.nd-lora-row').count(), 2);
    await panel.getByLabel('Model strength', { exact: true }).first().fill('-2.5');
    await panel.getByLabel('CLIP strength', { exact: true }).first().fill('0.25');
    const words = panel.getByLabel('Trigger words', { exact: true }).first();
    await words.fill('typed trigger');
    assert.equal(await words.evaluate(el => document.activeElement === el), true);
    let bundle = await page.evaluate(() => JSON.parse(window.qaNode.widgets.find(w => w.name === 'lora_bundle').serializeValue()));
    assert.equal(bundle[0].strength, -2.5); assert.equal(bundle[0].strengthClip, .25); assert.equal(bundle[0].triggerWords, 'typed trigger');
    await panel.getByLabel('Enable LoRA', { exact: true }).first().uncheck();
    bundle = await page.evaluate(() => JSON.parse(window.qaNode.widgets.find(w => w.name === 'lora_bundle').serializeValue()));
    assert.equal(bundle[0].enabled, false);
    await panel.getByLabel('Move LoRA down', { exact: true }).first().click();
    bundle = await page.evaluate(() => JSON.parse(window.qaNode.widgets.find(w => w.name === 'lora_bundle').serializeValue()));
    assert.equal(bundle[0].lora, 'fixture/second.safetensors');
    await panel.locator('.nd-lora-group').first().click();
    assert.equal(await panel.locator('.nd-lora-row').count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(window.qaNode.widgets.find(w => w.name === 'lora_bundle').serializeValue()).length), 2);
    await panel.locator('.nd-lora-group').first().click();
    assert.equal(await panel.locator('.nd-lora-row').count(), 2);
    await panel.getByRole('button', { name: 'Add LoRA', exact: true }).click();
    await page.getByText('fixture/third', { exact: true }).click();
    assert.equal(await panel.locator('.nd-lora-row').count(), 3);
    await panel.getByLabel('Remove LoRA', { exact: true }).last().click();
    assert.equal(await panel.locator('.nd-lora-row').count(), 2);
    await page.evaluate(async () => {
      const saved = window.app.graph.serialize();
      await window.app.loadGraphData(saved);
      window.qaNode = window.app.graph._nodes.find(node => node.type === 'NdSuperLoraLoader');
    });
    assert.equal(await panel.locator('.nd-lora-row').count(), 2);
    const prompt = await page.evaluate(async () => {
      const data = await window.app.graphToPrompt();
      return data.output[window.qaNode.id].inputs;
    });
    assert.equal(JSON.parse(prompt.lora_bundle)[1].strength, -2.5);
    assert.equal('nd_super_lora_panel' in prompt, false);
    await page.screenshot({ path: path.join(screenshots, 'nodes20.png') });
    await panel.screenshot({ path: path.join(screenshots, 'nodes20-panel.png') });
    await page.evaluate(async () => { await window.app.ui.settings.setSettingValue('Comfy.VueNodes.Enabled', false); window.app.canvas.setDirty(true, true); });
    await panel.waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.LiteGraph.vueNodesMode === false);
    await panel.getByLabel('Model strength', { exact: true }).first().fill('20');
    bundle = await page.evaluate(() => JSON.parse(window.qaNode.widgets.find(w => w.name === 'lora_bundle').serializeValue()));
    assert.equal(bundle[0].strength, 20);
    await page.screenshot({ path: path.join(screenshots, 'classic.png') });
    assert.equal(errors.some(error => /SuperLoraPanel|ensureLoraPanel|SuperLoraNode\.syncExecutionWidgets/.test(error)), false);
    console.log('PASS: real Nodes 2.0 and classic renderers display the DOM panel; editing, focus, dual strengths, toggles, reorder, tag collapse, add/remove, workflow round trip and execution prompt serialization.');
    console.log('Isolated fixture console:', JSON.stringify([...new Set(errors.map(error => error.slice(0, 160)))]));
  } catch (error) {
    await page.screenshot({ path: path.join(screenshots, 'failure.png') });
    console.error('Browser errors:', [...new Set(errors.map(error => error.slice(0, 600)))].slice(0, 12));
    console.error('Other requests:', [...requests]);
    throw error;
  } finally { await browser.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
