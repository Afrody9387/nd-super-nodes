# ND Super Nodes 1.10.0 — Compact, resizable LoRA list

- Each LoRA uses one compact line: enabled switch, file name, inline model/CLIP strength, one drag handle, remove, and a rightmost details triangle.
- Trigger words and the per-row tag button are collapsed into the details line by default. The tag button remains accessible even when trigger words are hidden in settings. Expanding a row never changes its LoRA data. Expansion state survives workflow saves.
- The standard node setting controls whether there is one strength field or separate Model/CLIP fields. Existing strength preferences and the -20 to +20 range remain intact.
- One drag handle replaces the two arrow buttons. Drag to an insertion marker and release to reorder. Holding at the list edge scrolls automatically. Dropping into another tag group adopts that group. The focused handle also supports keyboard Up/Down.
- Both classic and Nodes 2.0 use a bounded list with a visible scrollbar. Resize the node to show more rows; editing or adding LoRAs no longer resets the node height. Wheel scrolling stays in the list instead of changing weights or zooming the graph.

Validation: TypeScript and Vite build; actual frontend serialization regression; headless Edge running the unmodified frontend 1.55.18 with isolated backend fixtures. Tests exercise both renderer modes, a 30-row scrolling list, actual resize-grip dragging and increased viewport height, edit-preserved height, wheel scrolling without graph zoom, compact row height, collapsed trigger editing, pointer drag/drop with edge auto-scroll, strengths, toggles, tags, add/remove, workflow reload and generated execution parameters. No GPU generation was submitted.

Update this fork with Git or install `nd-super-nodes-v1.10.0.zip` into a single `ComfyUI/custom_nodes/nd-super-nodes` directory. Restart ComfyUI and hard refresh the browser. Existing workflows and templates remain supported.

Fork: https://github.com/Afrody9387/nd-super-nodes
Upstream: https://github.com/HenkDz/nd-super-nodes — original MIT license and attribution retained.
