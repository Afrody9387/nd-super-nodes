# ND Super Nodes 1.9.0 — Nodes 2.0 support

ND Super LoRA Loader now uses ComfyUI's registered DOM widget API instead of drawing its controls only through Canvas callbacks. The LoRA list and controls display in both modern Nodes 2.0 and classic Canvas mode.

- Native controls for adding/choosing/removing LoRAs, enabling rows, ordering, model/CLIP strengths, trigger words and refresh.
- Tag groups support collapse/expand; regrouping preserves collapsed state.
- Existing template save/load and settings menus remain connected to the same data and services.
- Long lists scroll inside a bounded panel. Inputs retain focus while editing and do not drag the graph.
- The DOM panel is excluded from execution parameters and saved widget values; existing workflows, templates and the live `lora_bundle` bridge remain compatible.
- Preserves the -20 to +20 strength range and the previous frontend 1.53 serialization repair.
- Loads the generated CSS explicitly and follows ComfyUI theme variables.

Validation: TypeScript checking and Vite build; existing LoRA path unit test; serialization regression against the installed frontend; headless Edge running the real, unmodified ComfyUI frontend 1.55.18 with isolated backend fixtures. Browser checks cover actual Nodes 2.0/classic modes, editing and focus, independent strengths, enable switches, ordering, tag collapse, file picker add/remove, workflow reload and generated execution requests. No actual GPU generation or every third-party extension combination has been tested.

Install `nd-super-nodes-v1.9.0.zip` into a single `ComfyUI/custom_nodes/nd-super-nodes` directory, or update this fork with Git. Save any unsaved edits first, then restart ComfyUI and hard refresh the browser. Both renderer modes now use the same native-control layout.

Updates use https://github.com/Afrody9387/nd-super-nodes . Upstream is https://github.com/HenkDz/nd-super-nodes ; the original MIT license and attribution are retained.
