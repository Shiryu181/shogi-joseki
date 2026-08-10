#!/usr/bin/env node
/**
 * YaneuraOu WASM エンジン(@mizarjp/yaneuraou.k-p, GPL-3.0)の実行時アセットを
 * node_modules から public/engine/ へコピーする。
 *
 * 方針(DESIGN.md §6/§8):エンジンのバイナリ(.wasm 等)は git にコミットしない。
 * dev/build のたびに node_modules から自動コピーし、public/engine/ は .gitignore
 * している。これにより npm install さえすれば誰でも同じアセットを再現できる。
 *
 * 実行タイミング: package.json の "predev" / "prebuild" から呼ばれる(npm の
 * ライフサイクルフックにより `npm run dev` / `npm run build` の直前に自動実行される)。
 */
import { existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const SRC_DIR = join(projectRoot, "node_modules", "@mizarjp", "yaneuraou.k-p", "lib");
const DEST_DIR = join(projectRoot, "public", "engine");

// 実行に必要な3ファイルのみコピーする(.br/.gz の事前圧縮版・型定義は不要)。
const FILES = ["yaneuraou.k-p.js", "yaneuraou.k-p.wasm", "yaneuraou.k-p.worker.js"];

function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(
      `[copy-engine-assets] ${SRC_DIR} が見つかりません。` +
        `@mizarjp/yaneuraou.k-p が npm install されているか確認してください。`,
    );
    process.exit(1);
  }

  mkdirSync(DEST_DIR, { recursive: true });

  let copied = 0;
  for (const file of FILES) {
    const src = join(SRC_DIR, file);
    const dest = join(DEST_DIR, file);
    if (!existsSync(src)) {
      console.error(`[copy-engine-assets] 想定ファイルが無い: ${src}`);
      process.exit(1);
    }
    // 既にコピー済みでサイズが一致するならスキップ(毎回の dev 起動を軽くする)。
    if (existsSync(dest) && statSync(dest).size === statSync(src).size) {
      continue;
    }
    copyFileSync(src, dest);
    copied += 1;
  }

  if (copied > 0) {
    console.log(`[copy-engine-assets] ${copied} 件のエンジンアセットを public/engine/ にコピーしました。`);
  }
}

main();
