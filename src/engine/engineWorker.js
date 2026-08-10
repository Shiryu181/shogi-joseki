// YaneuraOu WASM (@mizarjp/yaneuraou.k-p, GPL-3.0) を動かす Web Worker 本体。
//
// 実施済みスパイク(spike/engine-spike.html + public/spike-engine/engineWorker.js,
// 本実装に取り込み後は削除)のロジックをそのまま踏襲している。
//
// このファイルは意図的にプレーン JS(.js)にしている。TypeScript 化すると
// tsconfig の "lib" に DOM(window用)と WebWorker の両方を混在させる必要が
// 生じ、`self`/`postMessage` 等の型が衝突する。Worker用に別の tsconfig を
// 増やすほどの複雑さに見合わないため、素の JS で書く方をシンプルとして選んだ。
//
// 意図的に **classic worker**(`{ type: "module" }` を付けずに new Worker()
// する)として使う前提。classic worker でないと importScripts() が使えない。
//
// 重大な罠1(スパイクで発見・DESIGN.md 未記載につき必ずここに残す):
// Web Worker には `document` が無い。YaneuraOu の Emscripten glue コードは
// 通常 `document.currentScript` 等から自身のURL(_scriptDir)を推測して
// pthread 用の worker.js/wasm の URL を解決するが、Worker内にはそれが無いため
// 推測に失敗し、内部で pthread を spawn しようとした際に
// `URL.createObjectURL` の TypeError で落ちる。
// 対策: モジュールファクトリに `mainScriptUrlOrBlob` を明示的に渡す。ただし
// これは「子(pthread)ワーカーが自分自身をimportScriptsするためのURL」として
// しか使われない(下記の罠2を参照)。
//
// 重大な罠2(本実装で新たに発見。スパイクでは気付かなかった):
// mainScriptUrlOrBlob は wasm 本体・yaneuraou.k-p.worker.js(子ワーカーの
// 起動スクリプト)の取得先には使われない。glue コードを読むと、その2つは
// 「このワーカー自身の self.location.href から見たディレクトリ」を基準に
// 解決される(`_scriptDir` は `document.currentScript` が無い環境では
// 常に undefined になるため)。スパイクでは engineWorker.js 自体を
// yaneuraou.k-p.js と同じ public/spike-engine/ 直下に置いていたため
// 偶然一致して気付かなかったが、本実装のように engineWorker.js の配信元
// (dev: /src/engine/、build後: /assets/…)と /engine/ が別ディレクトリだと
// wasm/worker.js が誤ったパスから要求されてしまう(WebAssembly.instantiate
// が index.html を受け取って magic word エラーで落ちる、という形で顕在化した)。
// 対策: Module に `locateFile` を明示的に渡し、self.location に依存せず
// 常に /engine/ 配下を見るようにする。

/** 呼び出し元(usiEngine.ts)と揃える相対パス。public/engine/ にコピーされる。 */
const ENGINE_JS_PATH = "/engine/yaneuraou.k-p.js";
const ENGINE_DIR = "/engine/";

importScripts(self.location.origin + ENGINE_JS_PATH);

let engine = null;

async function boot() {
  try {
    // YaneuraOu_K_P は UMD ビルドのため、classic worker で importScripts()
    // した際はグローバル変数として公開される。
    engine = await self.YaneuraOu_K_P({
      mainScriptUrlOrBlob: self.location.origin + ENGINE_JS_PATH,
      locateFile: (path) => self.location.origin + ENGINE_DIR + path,
    });
    engine.addMessageListener((line) => {
      postMessage({ type: "line", line });
    });
    postMessage({ type: "ready" });
  } catch (err) {
    postMessage({ type: "error", error: String(err && err.stack ? err.stack : err) });
  }
}

self.addEventListener("message", (e) => {
  const msg = e.data;
  if (msg && msg.cmd === "send" && engine) {
    engine.postMessage(msg.command);
  }
});

boot();
