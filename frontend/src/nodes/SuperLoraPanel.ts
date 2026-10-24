/** Native DOM controls supported by both the Canvas and Nodes 2.0 renderers. */
export interface PanelActions {
  rows(): any[];
  isTag(widget: any): boolean;
  add(): void;
  save(): void;
  load(event: MouseEvent): void;
  settings(event: MouseEvent): void;
  choose(row: any, event: MouseEvent): void;
  tag(row: any): void;
  remove(row: any): void;
  refresh(row: any, event: MouseEvent): Promise<unknown>;
  move(row: any, direction: number): void;
  change(row: any, values: Record<string, unknown>): void;
  changed(): void;
}

const panels = new WeakMap<object, SuperLoraPanel>();
export function getLoraPanel(node: any): SuperLoraPanel | undefined {
  return panels.get(node);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '') {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

function button(label: string, title: string, action: (event: MouseEvent) => void) {
  const el = element('button');
  el.type = 'button';
  el.textContent = label;
  el.title = title;
  el.setAttribute('aria-label', title);
  el.addEventListener('click', action);
  return el;
}

// Moving a focused input through replaceChildren() drops focus in browsers.
function reconcile(parent: HTMLElement, children: HTMLElement[]) {
  children.forEach((child, index) => {
    if (parent.children[index] !== child) parent.insertBefore(child, parent.children[index] ?? null);
  });
  while (parent.children.length > children.length) parent.lastElementChild?.remove();
}

export class SuperLoraPanel {
  readonly element = element('div', 'nd-lora-panel');
  readonly widget: any;
  private readonly list = element('div', 'nd-lora-list');
  private readonly rowViews = new WeakMap<object, ReturnType<SuperLoraPanel['createRow']>>();
  private readonly tagViews = new WeakMap<object, HTMLButtonElement>();
  private readonly allButton: HTMLButtonElement;
  private readonly empty = element('div', 'nd-lora-empty');
  private disposed = false;
  height = 160;

  constructor(private readonly node: any, private readonly actions: PanelActions) {
    const toolbar = element('div', 'nd-lora-toolbar');
    toolbar.append(button('+ Add LoRA', 'Add LoRA', () => actions.add()));
    this.allButton = button('Disable all', 'Toggle all LoRAs', () => {
      const rows = actions.rows();
      const enabled = !rows.every(row => row.value.enabled);
      rows.forEach(row => { row.value.enabled = enabled; });
      actions.changed();
    });
    toolbar.append(this.allButton,
      button('Save set', 'Save LoRA template', () => actions.save()),
      button('Load set', 'Load LoRA template', event => actions.load(event)),
      button('Settings', 'LoRA loader settings', event => actions.settings(event)));
    this.empty.textContent = 'No LoRAs yet. Use Add LoRA to choose a file.';
    this.list.setAttribute('aria-label', 'LoRA list');
    this.element.append(toolbar, this.list);
    // Inputs must retain native editing without starting graph drag/shortcuts.
    for (const name of ['pointerdown', 'mousedown', 'dblclick', 'keydown', 'keyup']) {
      this.element.addEventListener(name, event => event.stopPropagation());
    }
    this.list.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    });
    this.widget = node.addDOMWidget('nd_super_lora_panel', 'nd-super-lora-panel', this.element, {
      serialize: false,
      hideOnZoom: false,
      margin: 4,
      getMinHeight: () => this.height,
      getMaxHeight: () => this.height,
      getHeight: () => this.height,
    });
    this.widget.serialize = false;
    this.widget.computeSize = () => [280, this.height];
    this.widget.computeLayoutSize = () => ({ minHeight: this.height, maxHeight: this.height, minWidth: 280 });
    const onRemove = this.widget.onRemove;
    this.widget.onRemove = () => {
      this.disposed = true;
      panels.delete(node);
      onRemove?.call(this.widget);
    };
    this.update();
  }

  update(): void {
    if (this.disposed) return;
    const rows = this.actions.rows();
    const properties = this.node.properties || {};
    const children: HTMLElement[] = [];
    let collapsed = false;
    for (const item of this.node.customWidgets || []) {
      if (this.actions.isTag(item) && properties.enableTags) {
        let header = this.tagViews.get(item);
        if (!header) {
          header = button('', 'Collapse LoRA tag', () => {
            item.value.collapsed = !item.value.collapsed;
            this.actions.changed();
          });
          header.className = 'nd-lora-group';
          this.tagViews.set(item, header);
        }
        collapsed = !!item.value.collapsed;
        header.textContent = `${collapsed ? '▸' : '▾'} ${item.value.tag} (${rows.filter(row => row.value.tag === item.value.tag).length})`;
        header.setAttribute('aria-expanded', String(!collapsed));
        children.push(header);
      } else if (rows.includes(item) && !collapsed) {
        let view = this.rowViews.get(item);
        if (!view) { view = this.createRow(item); this.rowViews.set(item, view); }
        view.update(properties);
        children.push(view.root);
      }
    }
    this.allButton.textContent = rows.length && rows.every(row => row.value.enabled) ? 'Disable all' : 'Enable all';
    this.allButton.disabled = rows.length === 0;
    reconcile(this.list, children.length ? children : rows.length ? [] : [this.empty]);
    const visibleRows = children.filter(child => child.classList.contains('nd-lora-row')).length;
    this.height = Math.min(600, Math.max(160, 82 + visibleRows * (properties.showTriggerWords === false ? 88 : 120) + (children.length - visibleRows) * 30));
    this.element.style.height = `${this.height}px`;
  }

  private createRow(row: any) {
    const root = element('section', 'nd-lora-row');
    const top = element('div', 'nd-lora-row-top');
    const enabled = element('input');
    enabled.type = 'checkbox';
    enabled.setAttribute('aria-label', 'Enable LoRA');
    enabled.addEventListener('change', () => this.actions.change(row, { enabled: enabled.checked }));
    const choose = button('', 'Choose LoRA file', event => this.actions.choose(row, event));
    choose.className = 'nd-lora-name';
    const up = button('↑', 'Move LoRA up', () => this.actions.move(row, -1));
    const down = button('↓', 'Move LoRA down', () => this.actions.move(row, 1));
    const remove = button('×', 'Remove LoRA', () => this.actions.remove(row));
    top.append(enabled, choose, up, down, remove);
    const controls = element('div', 'nd-lora-controls');
    const strength = (name: string, key: string) => {
      const label = element('label', 'nd-lora-strength');
      const text = element('span'); text.textContent = name;
      const input = element('input');
      input.type = 'number'; input.min = '-20'; input.max = '20'; input.step = '0.05';
      input.setAttribute('aria-label', `${name} strength`);
      input.addEventListener('input', () => {
        if (!Number.isFinite(input.valueAsNumber)) return;
        const value = Math.max(-20, Math.min(20, input.valueAsNumber));
        const patch: Record<string, unknown> = { [key]: value };
        if (key === 'strength' && !this.node.properties.showSeparateStrengths) patch.strengthClip = value;
        this.actions.change(row, patch);
      });
      input.addEventListener('change', () => { input.value = String(row.value[key] ?? row.value.strength ?? 1); });
      label.append(text, input);
      return { label, input };
    };
    const model = strength('Model', 'strength');
    const clip = strength('CLIP', 'strengthClip');
    const tag = button('', 'Choose LoRA tag', () => this.actions.tag(row));
    tag.className = 'nd-lora-tag';
    controls.append(model.label, clip.label, tag);
    const triggers = element('div', 'nd-lora-triggers');
    const words = element('input');
    words.type = 'text'; words.placeholder = 'Trigger words';
    words.setAttribute('aria-label', 'Trigger words');
    words.addEventListener('input', () => this.actions.change(row, { triggerWords: words.value, autoFetched: false, fetchAttempted: false }));
    const refresh = button('↻', 'Refresh trigger words', async event => {
      refresh.disabled = true;
      try { await this.actions.refresh(row, event); } finally { refresh.disabled = false; this.update(); }
    });
    triggers.append(words, refresh);
    root.append(top, controls, triggers);
    return { root, update: (properties: any) => {
      const value = row.value;
      enabled.checked = !!value.enabled;
      root.classList.toggle('nd-lora-disabled', !value.enabled);
      choose.textContent = value.lora === 'None' ? 'Choose LoRA…' : String(value.lora);
      choose.title = String(value.lora);
      tag.textContent = value.tag || 'General';
      tag.hidden = !properties.enableTags || properties.showTagChip === false;
      up.hidden = down.hidden = properties.showMoveArrows === false;
      remove.hidden = properties.showRemoveButton === false;
      controls.hidden = properties.showStrengthControls === false;
      clip.label.hidden = !properties.showSeparateStrengths;
      triggers.hidden = properties.showTriggerWords === false;
      for (const [input, next] of [[model.input, value.strength ?? 1], [clip.input, value.strengthClip ?? value.strength ?? 1], [words, value.triggerWords || '']] as const) {
        if (document.activeElement !== input) input.value = String(next);
      }
    } };
  }
}

export function ensureLoraPanel(node: any, actions: PanelActions): void {
  if (typeof document === 'undefined' || typeof node.addDOMWidget !== 'function') return;
  if (!panels.has(node)) panels.set(node, new SuperLoraPanel(node, actions));
  panels.get(node)?.update();
}
