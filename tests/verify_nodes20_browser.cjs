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
    assert.equal(await words.isVisible(), false);
    assert.equal(await panel.getByLabel('Choose LoRA tag', { exact: true }).first().isVisible(), false);
    await panel.getByLabel('Toggle LoRA details', { exact: true }).first().click();
    assert.equal(await panel.getByLabel('Choose LoRA tag', { exact: true }).first().isVisible(), true);
    await words.fill('typed trigger');
    assert.equal(await words.evaluate(el => document.activeElement === el), true);
    let bundle = await page.evaluate(() => JSON.parse(window.qaNode.widgets.find(w => w.name === 'lora_bundle').serializeValue()));
    assert.equal(bundle[0].strength, -2.5); assert.equal(bundle[0].strengthClip, .25); assert.equal(bundle[0].triggerWords, 'typed trigger');
    await panel.getByLabel('Enable LoRA', { exact: true }).first().uncheck();
    bundle = await page.evaluate(() => JSON.parse(window.qaNode.widgets.find(w => w.name === 'lora_bundle').serializeValue()));
    assert.equal(bundle[0].enabled, false);
    const handle = await panel.getByLabel('Drag to reorder LoRA', { exact: true }).first().boundingBox();
    const targetRow = await panel.locator('.nd-lora-row').last().boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetRow.x + targetRow.width / 2, targetRow.y + targetRow.height - 3, { steps: 10 });
    await page.mouse.up();
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

    // A long list must stay inside the node in both renderers. Changing any
    // LoRA value must not undo a height the user chose with the resize grip.
    await page.evaluate(() => {
      const node = window.qaNode;
      for (const row of node.customWidgets) if (row.value) row.value._triggerWordsExpanded = false;
      for (let i = 0; i < 28; i++) window.SuperLoraNode.addLoraWidget(node, { lora: `fixture/extra-${i}.safetensors`, enabled: true });
      window.SuperLoraNode.syncExecutionWidgets(node);
    });
    const metrics = () => panel.locator('.nd-lora-list').evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight, top: el.scrollTop }));
    for (const modern of [false, true]) {
      await page.evaluate(async modern => {
        await window.app.ui.settings.setSettingValue('Comfy.VueNodes.Enabled', modern);
        window.app.canvas.setDirty(true, true);
      }, modern);
      await page.waitForFunction(modern => window.LiteGraph.vueNodesMode === modern, modern);
      await panel.waitFor({ state: 'visible' });
      await page.waitForTimeout(150);
      const small = await metrics();
      assert(small.height > 80 && small.scroll > small.height + 100, `bounded ${modern ? 'modern' : 'classic'} list: ${JSON.stringify(small)}`);
      const rowHeight = await panel.locator('.nd-lora-row').first().evaluate(el => el.getBoundingClientRect().height);
      assert(rowHeight < 42, `compact single-line row is ${rowHeight}px`);
      const grip = await page.evaluate(modern => {
        if (modern) {
          const host = document.querySelector('.nd-lora-panel').closest('[data-node-id]');
          const rect = host.getBoundingClientRect();
          return { x: rect.right - 3, y: rect.bottom - 3 };
        }
        const node = window.qaNode, canvas = window.app.canvas;
        const rect = canvas.canvas.getBoundingClientRect(), ds = canvas.ds;
        return { x: rect.left + (node.pos[0] + ds.offset[0] + node.size[0]) * ds.scale - 3,
          y: rect.top + (node.pos[1] + ds.offset[1] + node.size[1]) * ds.scale - 3 };
      }, modern);
      await page.mouse.move(grip.x, grip.y);
      await page.mouse.down();
      await page.mouse.move(grip.x, grip.y + 170, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(150);
      const large = await metrics();
      assert(large.height > small.height + 100, `${modern ? 'modern' : 'classic'} resize must grow viewport: ${JSON.stringify({ small, large, grip })}`);
      await panel.getByLabel('Model strength', { exact: true }).first().fill('1.5');
      assert(Math.abs((await metrics()).height - large.height) < 5, 'editing must preserve resized height');
      const list = panel.locator('.nd-lora-list');
      await page.evaluate(() => document.activeElement?.blur());
      await page.mouse.move(1450, 1000);
      await list.hover();
      const zoomBefore = await page.evaluate(() => window.app.canvas.ds.scale);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(300);
      assert((await metrics()).top > 0, `list must scroll with wheel: ${JSON.stringify({ modern, metrics: await metrics() })}`);
      assert.equal(await page.evaluate(() => window.app.canvas.ds.scale), zoomBefore, 'list wheel must not zoom the graph');
      await list.evaluate(el => { el.scrollTop = 0; });
      await panel.screenshot({ path: path.join(screenshots, modern ? 'compact-modern.png' : 'compact-classic.png') });
    }
    const sourceName = await page.evaluate(() => JSON.parse(window.qaNode.widgets.find(w => w.name === 'lora_bundle').serializeValue())[0].lora);
    const sourceGrip = await panel.getByLabel('Drag to reorder LoRA', { exact: true }).first().boundingBox();
    const listBox = await panel.locator('.nd-lora-list').boundingBox();
    await page.mouse.move(sourceGrip.x + sourceGrip.width / 2, sourceGrip.y + sourceGrip.height / 2);
    await page.mouse.down();
    await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height - 8, { steps: 10 });
    await page.waitForTimeout(250);
    assert((await metrics()).top > 0, 'dragging near the list edge must auto-scroll');
    await page.mouse.up();
    assert.equal(await panel.locator('.nd-lora-dragging').count(), 0);
    assert.notEqual(await page.evaluate(() => JSON.parse(window.qaNode.widgets.find(w => w.name === 'lora_bundle').serializeValue())[0].lora), sourceName);
    await panel.locator('.nd-lora-list').evaluate(el => { el.scrollTop = 0; });
    await page.evaluate(() => { window.qaNode.properties.showSeparateStrengths = false; window.SuperLoraNode.syncExecutionWidgets(window.qaNode); });
    assert.equal(await panel.getByLabel('CLIP strength', { exact: true }).first().isVisible(), false);
    assert.equal(await panel.getByLabel('Trigger words', { exact: true }).first().isVisible(), false);
    const beforeShrink = await metrics();
    const shrinkGrip = await panel.evaluate(el => { const rect = el.closest('[data-node-id]').getBoundingClientRect(); return { x: rect.right - 3, y: rect.bottom - 3 }; });
    await page.mouse.move(shrinkGrip.x, shrinkGrip.y); await page.mouse.down();
    await page.mouse.move(shrinkGrip.x, shrinkGrip.y - 250, { steps: 15 }); await page.mouse.up();
    await page.waitForTimeout(150);
    assert((await metrics()).height < beforeShrink.height - 100, 'node must also shrink without expanding to fit all rows');
    await panel.screenshot({ path: path.join(screenshots, 'compact-preview.png') });
    assert.equal(errors.some(error => /SuperLoraPanel|ensureLoraPanel|SuperLoraNode\.syncExecutionWidgets/.test(error)), false);
    console.log('PASS: real Nodes 2.0/classic renderers; compact rows, collapsed triggers, drag reorder, 30-row bounded scrolling, actual grip resizing, edit-preserved height, wheel without graph zoom, focus, strengths, toggles, tags, add/remove, workflow reload and execution serialization.');
    console.log('Isolated fixture console:', JSON.stringify([...new Set(errors.map(error => error.slice(0, 160)))]));
  } catch (error) {
    await page.screenshot({ path: path.join(screenshots, 'failure.png') });
    console.error('Browser errors:', [...new Set(errors.map(error => error.slice(0, 600)))].slice(0, 12));
    console.error('Other requests:', [...requests]);
    throw error;
  } finally { await browser.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
