// Uses installed frontend serialization and the plugin's actual compiled class.
// UI drawing, widget storage, and unconnected link lookup are isolated doubles.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const assetsArg = process.argv.indexOf('--frontend-assets');
assert(assetsArg >= 0 && process.argv[assetsArg + 1], 'Usage: node tests/verify_frontend_serialization.cjs --frontend-assets /path/to/comfyui_frontend_package/static/assets');
const assets = path.resolve(process.argv[assetsArg + 1]);
const coreFile = fs.readdirSync(assets).find(f => f.startsWith('settingStore-') && f.endsWith('.js') &&
  fs.readFileSync(path.join(assets, f), 'utf8').includes('serializeFromStoreState(e){let t={id:serializeNodeId'));
const core = fs.readFileSync(path.join(assets, coreFile), 'utf8');
function between(s, start, end) {
  const a = s.indexOf(start);
  assert(a >= 0, start);
  const b = s.indexOf(end, a);
  assert(b > a, end);
  return s.slice(a, b);
}
class SuperLoraHeaderWidget {
  constructor() { this.name = 'header'; this.value = {}; }
  computeSize() { return [100, 30]; }
}
class SuperLoraTagWidget {
  constructor() { this.value = {}; }
  computeSize() { return [100, 30]; }
  isCollapsed() { return false; }
}
class SuperLoraWidget {
  constructor(name = 'lora_0') { this.name = name; this.value = {}; }
  computeSize() { return [100, 34]; }
  isCollapsedByTag() { return false; }
}
function environment(plugin) {
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    SuperLoraHeaderWidget, SuperLoraTagWidget, SuperLoraWidget,
    LoraService: { getInstance() { return {}; } },
    TemplateService: { getInstance() { return {}; } },
    LiteGraph: { NEVER: 2, BYPASS: 4 },
    Rr: { NEVER: 2, BYPASS: 4 },
    Z: { cloneObject: v => JSON.parse(JSON.stringify(v)) },
    serializeNodeId: v => Number(v),
    inputAsSerialisable: v => ({ ...v }),
    outputAsSerialisable: v => ({ ...v }),
    serialiseWidgetValues: widgets => ({ widgets_values: widgets.map(w => w.value) }),
    Tl: new Set(),
    runExtensionSerializeHook: (node, data, ignored, callback) => { callback?.(data); return data; },
    inputLinkId: () => null,
    compressWidgetInputSlots() {},
    Ac: () => ({ getGraphNodesFor: () => ctx.graph._nodes.map(n => n._state) }),
    compareNodeIds: (a, b) => Number(a) - Number(b),
    Ma(error) { throw error; },
  });
  const pluginClass = between(plugin, 'const _SuperLoraNode = class', 'let SuperLoraNode = _SuperLoraNode;');
  vm.runInContext(pluginClass + '\nglobalThis.Loader = _SuperLoraNode;', ctx);
  const base = between(core, 'serializeFromStoreState(e){let t={id:serializeNodeId', 'clone(){');
  vm.runInContext('globalThis.baseSerialize = ({' + base + '}).serializeFromStoreState;', ctx);
  vm.runInContext(between(core, 'function serialiseStoredNodes(', 'function serialiseStoredGroups('), ctx);
  vm.runInContext(between(core, 'zl=class ExecutableNodeDTO', ';function createPromotedWidgetStoreProjection') + ';', ctx);
  vm.runInContext(between(core, 'var graphToPrompt=async', ';function scanMissingNodes') + ';globalThis.makePrompt = graphToPrompt;', ctx);
  class Node {
    constructor() {
      this.id = '17'; this.type = this.comfyClass = 'NdSuperLoraLoader';
      this.title = this.type; this.pos = [0, 0]; this.size = [400, 200]; this.order = 0;
      this._state = { id: this.id, type: this.type, flags: {}, mode: 0, properties: {}, inputs: [], outputs: [] };
      this.properties = this._state.properties;
      this.inputs = []; this.outputs = []; this.widgets = []; this.mode = 0;
      this.onNodeCreated();
    }
    addWidget(type, name, value, callback, options) {
      const w = { type, name, value, callback, options };
      this.widgets.push(w); return w;
    }
    setDirtyCanvas() {}
    isSubgraphNode() { return false; }
    serialize() { return this.serializeFromStoreState(this._state); }
    serializeFromStoreState(state) { return ctx.baseSerialize.call(this, state); }
    configure(data) {
      if (data.properties) Object.assign(this.properties, data.properties);
      for (const [i, value] of (data.widgets_values || []).entries()) {
        if (this.widgets[i]) this.widgets[i].value = value;
      }
    }
  }
  ctx.LGraphNode = Node;
  ctx.Loader.setup(Node, {});
  const node = new Node();
  const graph = { id: 'test-graph', _nodes: [node], computeExecutionOrder() { return this._nodes; },
    serialize() { return { nodes: ctx.serialiseStoredNodes(this, false) }; } };
  graph.rootGraph = graph; node.graph = graph; ctx.graph = graph;
  function addRow(config) {
    const w = new SuperLoraWidget(); w.value = { ...config };
    node.customWidgets.push(w); ctx.Loader.syncExecutionWidgets(node); return w;
  }
  return { ctx, node, Node, graph, addRow };
}
async function main() {
  const originalBundle = require('node:child_process').execFileSync('git', ['show', '83dba34:web/extension.js'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const original = environment(originalBundle);
  original.addRow({ lora: 'example.safetensors', enabled: true, strength: 0.8, strengthClip: 0.3 });
  const before = await original.ctx.makePrompt(original.graph);
  assert.equal(before.output['17'].inputs.lora_bundle, undefined);
  assert.equal(before.workflow.nodes[0].customWidgets, undefined);
  console.log('Reproduced original bug: installed frontend omits LoRA bundle and saved custom widgets.');

  const env = environment(fs.readFileSync(path.join(root, 'web/extension.js'), 'utf8'));
  const row = env.addRow({ lora: 'folder\\example.safetensors', enabled: true, strength: 0.8, strengthClip: 0.3, triggerWords: 'test', tag: 'General' });
  env.addRow({ lora: 'disabled.safetensors', enabled: false, strength: 1, strengthClip: 1 });
  let result = await env.ctx.makePrompt(env.graph);
  let bundle = JSON.parse(result.output['17'].inputs.lora_bundle);
  assert.equal(bundle.length, 2);
  assert.equal(bundle[0].strength, 0.8);
  assert.equal(bundle[0].strengthClip, 0.3);
  assert.equal(bundle[1].enabled, false);
  assert.equal(result.workflow.nodes[0].customWidgets.widgets.length, 3);
  assert(Array.isArray(result.workflow.nodes[0].inputs));
  console.log('PASS: first prompt contains LoRA names, separate strengths, disabled flags, and saved list.');
  row.value.strength = -0.4; row.value.strengthClip = 0;
  result = await env.ctx.makePrompt(env.graph);
  bundle = JSON.parse(result.output['17'].inputs.lora_bundle);
  assert.equal(bundle[0].strength, -0.4); assert.equal(bundle[0].strengthClip, 0);
  console.log('PASS: subsequent prompt reads fresh weights, including negative and zero values.');
  const restored = new env.Node(); restored.graph = env.graph;
  restored.configure(JSON.parse(JSON.stringify(result.workflow.nodes[0])));
  env.graph._nodes = [restored];
  result = await env.ctx.makePrompt(env.graph);
  assert.equal(JSON.parse(result.output['17'].inputs.lora_bundle)[0].strength, -0.4);
  assert.equal(restored.widgets.filter(w => w.name === 'lora_bundle').length, 1);
  for (let i = 0; i < 3; i++) restored.serialize();
  assert.equal(restored.widgets.filter(w => w.name === 'lora_bundle').length, 1);
  console.log('PASS: workflow round trip restores list without duplicating the bridge.');
  restored.customWidgets = [new SuperLoraHeaderWidget()];
  result = await env.ctx.makePrompt(env.graph);
  assert.equal(result.output['17'].inputs.lora_bundle, '[]');
  restored.mode = 4;
  result = await env.ctx.makePrompt(env.graph);
  assert.equal(result.output['17'], undefined);
  console.log('PASS: clearing list sends an empty bundle; bypassed nodes remain excluded.');

}
main().catch(e => { console.error(e); process.exitCode = 1; });
