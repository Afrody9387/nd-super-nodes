# ND Super Nodes 1.10.1 — Clearer LoRA state and details

- Enabled LoRAs have a theme-accent tinted background and solid side stripe.
- Disabled LoRAs use a neutral background, dashed side stripe and dimmed name/strengths. Controls remain usable.
- Expanded trigger/tag details have a separate surface, divider and indentation. The open triangle uses the theme accent.
- Colors follow ComfyUI theme variables. Compact rows, drag sorting, scrolling and resizing remain available in classic and Nodes 2.0.

Validation: TypeScript check and Vite build; headless Edge on frontend 1.55.18 with both actual renderers, scrolling/resizing, drag/drop, workflow persistence and execution serialization. Preview includes disabled, enabled and expanded rows. No GPU generation submitted.

Install nd-super-nodes-v1.10.1.zip or update this fork with Git, then restart ComfyUI and hard refresh the browser.

Fork: https://github.com/Afrody9387/nd-super-nodes
Upstream: https://github.com/HenkDz/nd-super-nodes — MIT license and attribution retained.
