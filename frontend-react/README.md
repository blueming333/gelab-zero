# frontend-react（Vite + React + TS + Ant Design）

独立的实时任务跟踪前端，复刻 UI-TARS-desktop 风格，基于后端 SSE 事件流。

## 快速开始

```bash
cd frontend-react
pnpm install
# 如需自定义后端地址，复制 env.example 为 .env 并修改 VITE_API_BASE
pnpm dev
```

默认开发代理指向 `http://127.0.0.1:8000`（见 `vite.config.ts`）。如使用代理，`VITE_API_BASE` 可留空走相对路径。

## 主要功能
- 任务发布：任务文本、模型选择、可选参数（max_steps、delay_after_capture、device_id、重启/自动回复开关）。
- 实时轨迹：SSE 订阅 `/api/tasks/{task_id}/events`，展示截图 + 动作/思考 Markdown。
- 历史查看：调用 `/api/tasks/history` 与 `/api/tasks/history/{session_id}`，复用时间线渲染。
- 模型选择：从 `/api/models` 拉取模型列表。

## 目录结构
- `src/api`：API 封装、类型与 SSE 订阅。
- `src/components`：任务表单、时间线、历史列表。
- `src/App.tsx`：页面编排与状态管理。

## 环境变量
- `VITE_API_BASE`：后端地址（含协议端口），为空则使用相对路径走 Vite 代理。
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
