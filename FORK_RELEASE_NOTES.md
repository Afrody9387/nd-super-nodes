# ND Super Nodes 1.11.0 — Drag to arrange categories

- Category headers now have a dedicated drag grip. Drag to move the entire category above or below another, including collapsed categories and General.
- The category title still toggles collapse separately. Keyboard Up/Down on the grip also reorders categories. Edge scrolling is shared with LoRA dragging.
- Category order is stored in node properties and survives workflow saves, reloads and regrouping. Existing workflows keep the previous default ordering until a category is moved.
- Moving a category preserves its LoRA membership, internal row order, values and collapse state. New categories are appended after the chosen order.
- Includes the theme-aware enabled/disabled row and expanded-detail styling from 1.10.1.

分类标题新增拖动手柄，可移动整个分类，收起时也能排序，General 同样支持。点击标题仍可展开或收起；分类内部顺序和数据保持，分类顺序随工作流保存。包含 1.10.1 的状态与详情配色改善。

Validation: TypeScript check, Vite build, and real frontend 1.55.18 in Edge with isolated fixtures. Both classic and Nodes 2.0 pass actual pointer category dragging, keyboard reordering, collapse toggling, workflow reload/regrouping and per-category LoRA-data equality checks, plus existing scrolling, resize and execution-serialization coverage. No GPU generation submitted.

Install nd-super-nodes-v1.11.0.zip or update this fork with Git; restart ComfyUI and hard refresh the browser.

Fork: https://github.com/Afrody9387/nd-super-nodes
Upstream: https://github.com/HenkDz/nd-super-nodes — MIT license and attribution retained.
