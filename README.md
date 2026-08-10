# 将棋 定石学習アプリ(定石道場)

居飛車 vs 四間飛車を題材に、定石を「なぞって学ぶ」「実戦形式で練習する」将棋学習アプリ。
設計の唯一の正は [`DESIGN.md`](./DESIGN.md)。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint      # oxlint
```

`npm run dev` / `npm run build` の前に、将棋エンジン(下記)のアセットを
`node_modules` から `public/engine/` へ自動コピーする(`predev`/`prebuild`、
`scripts/copy-engine-assets.mjs`)。`public/engine/` は生成物のため git 管理下に
置いていない(`.gitignore` 参照)。

## エンジンについて(YaneuraOu WASM)

練習モード(実戦)では、定石を外れた手を指したときの参考として将棋エンジンの
評価値を表示する(`src/engine/`)。

- 使用パッケージ: [`@mizarjp/yaneuraou.k-p`](https://www.npmjs.com/package/@mizarjp/yaneuraou.k-p)
  (npm)。ソース: <https://github.com/mizar/YaneuraOu.wasm>(本家 [YaneuraOu](https://github.com/yaneurao/YaneuraOu) の WebAssembly 移植)
- **ライセンス: GPL-3.0**。評価関数(Suisho5系)はパッケージに内蔵されており、別途入手は不要。
  ソースの入手方法は上記リポジトリを参照。本アプリ自体のライセンス方針は別途検討中。
- ブラウザで動かすには **`Cross-Origin-Opener-Policy: same-origin`** /
  **`Cross-Origin-Embedder-Policy: require-corp`** の2ヘッダが必須(WASMの
  pthread が SharedArrayBuffer を要求するため。シングルスレッド版は存在しない)。
  `vite.config.ts` の dev/preview サーバーには設定済みだが、
  **本番デプロイ先(静的ホスティング/CDN/リバースプロキシ)でも同じ2ヘッダを
  トップレベルのHTMLレスポンスに設定する必要がある**。設定できない環境では
  エンジンは自動的に無効化され、練習モードは定石データのみで通常どおり動作する
  (グレースフルデグレード。エラーにはならない)。
- 練習モードに入ったときだけ遅延ロードする(学習/Sandbox 画面では読み込まれない)。

---

# React + TypeScript + Vite (テンプレート由来のメモ)

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
