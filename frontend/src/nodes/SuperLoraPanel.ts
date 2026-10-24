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
  reorder(row: any, target: any, after: boolean): void;
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
  private readonly rowsByElement = new WeakMap<HTMLElement, any>();
  private cancelDrag?: () => void;
  private readonly allButton: HTMLButtonElement;
  private readonly empty = element('div', 'nd-lora-empty');
  private disposed = false;
  readonly minimumHeight = 140;

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
    this.list.dataset.captureWheel = 'true';
    this.list.tabIndex = 0;
    this.list.addEventListener('pointerenter', () => {
      const active = document.activeElement;
      // Vue's wheel bridge honors capture only for a focused widget. Opt in
      // on hover without interrupting text being edited elsewhere.
      if (!this.list.contains(active) && !(active instanceof HTMLElement && active.matches('input,textarea,[contenteditable="true"]'))) {
        this.list.focus({ preventScroll: true });
      }
    });
    this.element.append(toolbar, this.list);
    // Inputs must retain native editing without starting graph drag/shortcuts.
    for (const name of ['pointerdown', 'mousedown', 'dblclick', 'keydown', 'keyup']) {
      this.element.addEventListener(name, event => event.stopPropagation());
    }
    this.list.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) return;
      // Claim the wheel before number inputs or Vue's graph handlers consume
      // it. Scrolling a list should neither change a weight nor zoom the graph.
      event.stopPropagation();
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.list.clientHeight : 1;
      this.list.scrollTop += event.deltaY * unit;
    }, { capture: true, passive: false });
    this.widget = node.addDOMWidget('nd_super_lora_panel', 'nd-super-lora-panel', this.element, {
      serialize: false,
      hideOnZoom: false,
      margin: 4,
      getMinHeight: () => this.minimumHeight,
    });
    this.widget.serialize = false;
    // computeSize makes LiteGraph treat a widget as fixed-height. A layout
    // request without maxHeight receives all remaining node space instead.
    this.widget.computeLayoutSize = () => ({ minHeight: this.minimumHeight, minWidth: 360 });
    const onRemove = this.widget.onRemove;
    this.widget.onRemove = () => {
      this.disposed = true;
      this.cancelDrag?.();
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
    const drag = button('⠿', 'Drag to reorder LoRA', () => {});
    drag.className = 'nd-lora-drag';
    drag.addEventListener('pointerdown', event => this.startDrag(event, row, root, drag));
    // Keyboard users can still reorder without separate arrow buttons.
    drag.addEventListener('keydown', event => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.actions.move(row, event.key === 'ArrowUp' ? -1 : 1);
      }
    });
    const remove = button('×', 'Remove LoRA', () => this.actions.remove(row));
    const controls = element('div', 'nd-lora-controls');
    const strength = (name: string, key: string) => {
      const label = element('label', 'nd-lora-strength');
      const text = element('span'); text.textContent = name === 'Model' ? 'M' : 'C';
      text.title = `${name} strength`;
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
    controls.append(model.label, clip.label);
    const triggers = element('div', 'nd-lora-triggers');
    const words = element('input');
    words.type = 'text'; words.placeholder = 'Trigger words';
    words.setAttribute('aria-label', 'Trigger words');
    words.addEventListener('input', () => this.actions.change(row, { triggerWords: words.value, autoFetched: false, fetchAttempted: false }));
    const refresh = button('↻', 'Refresh trigger words', async event => {
      refresh.disabled = true;
      try { await this.actions.refresh(row, event); } finally { refresh.disabled = false; this.update(); }
    });
    triggers.append(words, refresh, tag);
    const expand = button('▸', 'Toggle LoRA details', () => {
      row.value._triggerWordsExpanded = !row.value._triggerWordsExpanded;
      this.actions.changed();
    });
    expand.className = 'nd-lora-expand';
    top.append(enabled, choose, controls, drag, remove, expand);
    root.append(top, triggers);
    this.rowsByElement.set(root, row);
    return { root, update: (properties: any) => {
      const value = row.value;
      enabled.checked = !!value.enabled;
      root.classList.toggle('nd-lora-disabled', !value.enabled);
      choose.textContent = value.lora === 'None' ? 'Choose LoRA…' : String(value.lora);
      choose.title = String(value.lora);
      tag.textContent = value.tag || 'General';
      tag.hidden = !properties.enableTags || properties.showTagChip === false;
      drag.hidden = properties.showMoveArrows === false;
      remove.hidden = properties.showRemoveButton === false;
      controls.hidden = properties.showStrengthControls === false;
      clip.label.hidden = !properties.showSeparateStrengths;
      const expanded = !!value._triggerWordsExpanded;
      const hasDetails = properties.showTriggerWords !== false || !tag.hidden;
      triggers.hidden = !expanded || !hasDetails;
      words.hidden = refresh.hidden = properties.showTriggerWords === false;
      expand.hidden = !hasDetails;
      expand.textContent = expanded ? '▾' : '▸';
      expand.setAttribute('aria-expanded', String(expanded));
      for (const [input, next] of [[model.input, value.strength ?? 1], [clip.input, value.strengthClip ?? value.strength ?? 1], [words, value.triggerWords || '']] as const) {
        if (document.activeElement !== input) input.value = String(next);
      }
    } };
  }

  private startDrag(event: PointerEvent, row: any, root: HTMLElement, handle: HTMLButtonElement): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    handle.focus({ preventScroll: true });
    this.cancelDrag?.();
    handle.setPointerCapture(event.pointerId);
    root.classList.add('nd-lora-dragging');
    let marker: HTMLElement | undefined;
    let target: any;
    let after = false;
    let pointerY = event.clientY;
    let frame = 0;
    const mark = (x: number, y: number) => {
      marker?.classList.remove('nd-lora-drop-before', 'nd-lora-drop-after');
      marker = undefined; target = undefined;
      const candidate = document.elementFromPoint(x, y)?.closest<HTMLElement>('.nd-lora-row');
      if (!candidate || candidate === root || !this.list.contains(candidate)) return;
      target = this.rowsByElement.get(candidate);
      if (!target) return;
      marker = candidate;
      const rect = candidate.getBoundingClientRect();
      after = y > rect.top + rect.height / 2;
      candidate.classList.add(after ? 'nd-lora-drop-after' : 'nd-lora-drop-before');
    };
    let pointerX = event.clientX;
    const scroll = () => {
      const rect = this.list.getBoundingClientRect();
      const delta = pointerY < rect.top + 30 ? -8 : pointerY > rect.bottom - 30 ? 8 : 0;
      if (delta) { this.list.scrollTop += delta; mark(pointerX, pointerY); }
      frame = requestAnimationFrame(scroll);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      pointerX = e.clientX; pointerY = e.clientY;
      mark(pointerX, pointerY);
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      marker?.classList.remove('nd-lora-drop-before', 'nd-lora-drop-after');
      root.classList.remove('nd-lora-dragging');
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', drop, true);
      document.removeEventListener('pointercancel', cancel, true);
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      this.cancelDrag = undefined;
    };
    const drop = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      const selected = target;
      cleanup();
      if (selected) this.actions.reorder(row, selected, after);
    };
    const cancel = (e: PointerEvent) => { if (e.pointerId === event.pointerId) cleanup(); };
    this.cancelDrag = cleanup;
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', drop, true);
    document.addEventListener('pointercancel', cancel, true);
    frame = requestAnimationFrame(scroll);
  }
}

export function ensureLoraPanel(node: any, actions: PanelActions): void {
  if (typeof document === 'undefined' || typeof node.addDOMWidget !== 'function') return;
  if (!panels.has(node)) panels.set(node, new SuperLoraPanel(node, actions));
  panels.get(node)?.update();
}
