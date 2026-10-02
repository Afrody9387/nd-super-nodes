# ND Super Nodes 1.8.2 — Afrody fork

Fixes ND Super LoRA Loader silently passing the original model through without applying any LoRAs on ComfyUI frontend 1.53.6.

The frontend now serializes stored node state through `serializeFromStoreState()`, bypassing the old `serialize()` override that created the LoRA execution widget. The fix creates the hidden `lora_bundle` widget during node creation and reads current values at execution time. `onSerialize` preserves the custom LoRA list through workflow saves and reloads.

The backend node names and input/output contracts are unchanged. Existing workflows and templates remain usable. Update checks and packaged updater downloads point to `Afrody9387/nd-super-nodes`. The updater preserves `.git` and `.github`.

The existing local customization allowing model and CLIP strengths from -20 to +20 is retained in this fork.

Validation includes reproducing the original missing-bundle bug with the installed frontend serialization code, then checking fresh strengths, independent model/CLIP values, enabled flags, workflow round trips, empty lists, and bypass behavior. TypeScript checking and Vite production build pass. Actual image generation and full browser interactions have not been verified.

Download `nd-super-nodes-v1.8.2.zip` and extract into a single `ComfyUI/custom_nodes/nd-super-nodes` directory. Save any unsaved LoRA list as a template first. Restart ComfyUI after installation and hard refresh the browser.

Upstream: https://github.com/HenkDz/nd-super-nodes — original MIT license and attribution retained.
