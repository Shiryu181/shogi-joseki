/**
 * DESIGN.md §6 エンジン統合の本体。YaneuraOu WASM を Web Worker 上で動かし、
 * USI ハンドシェイクと `evaluate()` の直列化・タイムアウトを面倒みる。
 *
 * 遅延ロード: このファイルを import しただけではエンジンは起動しない。
 * `getEngine().init()` を呼んで初めて Worker が生成され WASM がロードされる
 * (練習モードに入るときに一度だけ呼ぶ想定。src/store/practiceStore.ts 参照)。
 */
import type { Engine, EngineEvaluateResult, EngineStatus } from "./types";
import { parseBestmoveLine, parseInfoLine } from "./usiParse";

/** Worker起動〜usiok/readyokのタイムアウト。WASMの初回コンパイルを見込み長めに取る。 */
const INIT_TIMEOUT_MS = 30_000;
/** evaluate() が bestmove を待つ上限。movetime に対する安全マージン。 */
const EVAL_TIMEOUT_BUFFER_MS = 5_000;

/** 控えめなリソース設定。練習モードの裏でCPUを使い切って他の操作を妨げないことを優先する。 */
function pickThreads(): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  if (!cores || cores <= 2) return 1;
  return Math.min(4, Math.max(1, cores - 2));
}

type WorkerMessage = { type: "ready" } | { type: "line"; line: string } | { type: "error"; error: string };

interface LatestInfo {
  scoreCp?: number;
  mate?: number;
  pv?: string[];
}

/**
 * Engine の実装。DESIGN.md §6 のラッパAPIに沿う。
 * mate は §6 記載のインターフェースへの純増拡張(types.ts 参照、`score mate` で
 * 落ちないようにするため)。
 */
class UsiEngine implements Engine {
  #status: EngineStatus = "idle";
  #worker: Worker | null = null;
  #initPromise: Promise<void> | null = null;
  /** evaluate() 呼び出しを直列化するキュー(エンジンは同時に1局面しか思考できない)。 */
  #queue: Promise<unknown> = Promise.resolve();
  /** 進行中の evaluate() 呼び出しへ info/bestmove 行を届けるハンドラ(直列化により常に高々1つ)。 */
  #currentLineHandler: ((line: string) => void) | null = null;

  get status(): EngineStatus {
    return this.#status;
  }

  init(): Promise<void> {
    if (this.#status === "ready") return Promise.resolve();
    if (this.#initPromise) return this.#initPromise;
    if (this.#status === "unavailable") {
      return Promise.reject(new Error("engine previously failed to initialize"));
    }

    // SharedArrayBuffer(pthread)にはクロスオリジン分離が必須。COOP/COEPが
    // 効いていない環境(本番でヘッダ未設定、非対応ブラウザ等)では Worker を
    // 起動する前にここで諦めた方が安く、失敗の切り分けもしやすい。
    if (typeof self !== "undefined" && self.crossOriginIsolated === false) {
      this.#status = "unavailable";
      return Promise.reject(
        new Error("crossOriginIsolated is false (COOP/COEP headers missing) — engine cannot start"),
      );
    }

    this.#status = "loading";
    this.#initPromise = this.#doInit().catch((err: unknown) => {
      this.#status = "unavailable";
      this.#initPromise = null;
      throw err;
    });
    return this.#initPromise;
  }

  async #doInit(): Promise<void> {
    const worker = new Worker(new URL("./engineWorker.js", import.meta.url));
    this.#worker = worker;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let gotUsiOk = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("engine init timed out"));
      }, INIT_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };

      const onError = (e: ErrorEvent) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`worker error: ${e.message}`));
      };

      const onMessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;
        if (msg.type === "error") {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(msg.error));
          return;
        }
        if (msg.type === "ready") {
          worker.postMessage({ cmd: "send", command: "usi" });
          return;
        }
        if (msg.type === "line") {
          const line = msg.line.trim();
          if (line === "usiok" && !gotUsiOk) {
            gotUsiOk = true;
            // 控えめなリソース設定。PvInterval は既定のままでよい(evaluateは
            // 最後の info/bestmoveしか見ず、途中経過の頻度は重要でない)。
            worker.postMessage({ cmd: "send", command: "setoption name USI_Hash value 64" });
            worker.postMessage({ cmd: "send", command: `setoption name Threads value ${pickThreads()}` });
            worker.postMessage({ cmd: "send", command: "isready" });
          } else if (line === "readyok") {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
          }
        }
      };

      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
    });

    // 以後の行は evaluate() 側のハンドラへ流す。ワーカーの想定外クラッシュは
    // 以後 evaluate() を reject させるため unavailable にする(練習モードは
    // 台本判定のまま継続でき、アプリは落ちない)。
    worker.addEventListener("message", (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === "line" && this.#currentLineHandler) {
        this.#currentLineHandler(msg.line);
      }
    });
    worker.addEventListener("error", () => {
      this.#status = "unavailable";
    });

    this.#status = "ready";
  }

  evaluate(sfen: string, ms: number): Promise<EngineEvaluateResult> {
    if (this.#status !== "ready" || !this.#worker) {
      return Promise.reject(new Error("engine is not ready"));
    }
    const worker = this.#worker;

    const run = (): Promise<EngineEvaluateResult> =>
      new Promise<EngineEvaluateResult>((resolve, reject) => {
        let lastInfo: LatestInfo = {};
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          this.#currentLineHandler = null;
          reject(new Error("evaluate timed out"));
        }, ms + EVAL_TIMEOUT_BUFFER_MS);

        this.#currentLineHandler = (line: string) => {
          const info = parseInfoLine(line);
          if (info) {
            lastInfo = { ...lastInfo, ...info };
            return;
          }
          const bestmove = parseBestmoveLine(line);
          if (bestmove && !settled) {
            settled = true;
            clearTimeout(timer);
            this.#currentLineHandler = null;
            resolve({
              bestMove: bestmove.bestMove,
              scoreCp: lastInfo.mate === undefined ? (lastInfo.scoreCp ?? 0) : 0,
              mate: lastInfo.mate,
              pv: lastInfo.pv ?? [],
            });
          }
        };

        worker.postMessage({ cmd: "send", command: `position sfen ${sfen}` });
        worker.postMessage({ cmd: "send", command: `go movetime ${ms}` });
      });

    const result = this.#queue.then(run, run);
    // キュー自体は前段の失敗で止めない(次の evaluate() は新規に走らせる)。
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  dispose(): void {
    this.#worker?.terminate();
    this.#worker = null;
    this.#initPromise = null;
    this.#currentLineHandler = null;
    this.#status = "idle";
  }
}

let sharedEngine: UsiEngine | null = null;

/**
 * アプリ全体で1つだけエンジンを持つ(練習画面を出入りしても Worker を作り直さない
 * ため。WASM の再ロードは数MB〜数十MB相当で、タブ切替のたびにやるには重すぎる)。
 * このファイルを import しただけではロードされない。実際に使うには
 * `getEngine().init()` を呼ぶこと(遅延ロード)。
 */
export function getEngine(): Engine {
  if (!sharedEngine) sharedEngine = new UsiEngine();
  return sharedEngine;
}
