import { Color } from "../../domain/shogi";
import { useSandboxStore } from "../../store/sandboxStore";
import { Board } from "../../ui/Board";
import "./Sandbox.css";

/**
 * Phase 0 検証用画面: 初期局面から合法手だけで自由に駒を動かせる。
 */
export function Sandbox() {
  const turn = useSandboxStore((s) => s.position.color);
  const lastMoveText = useSandboxStore((s) => s.lastMoveText);
  const reset = useSandboxStore((s) => s.reset);

  return (
    <div className="sandbox-wrap">
      <div className="sandbox-frame">
        <div className="sandbox-head">
          <div className="tl">JOSEKI DOJO ・ SANDBOX</div>
          <h1>自由対局(検証用)</h1>
        </div>
        <div className="binfo">
          <span className={`badge b-turn${turn === Color.WHITE ? " gote" : ""}`}>
            {turn === Color.BLACK ? "▲ 先手番" : "△ 後手番"}
          </span>
          <span className="badge b-prog">Phase 0 ・ 合法手のみ</span>
        </div>
        <Board />
        <div className="lastmove">{lastMoveText ? <b>{lastMoveText}</b> : "駒をクリックして動かしてみましょう"}</div>
        <div className="navrow">
          <button type="button" onClick={reset}>
            ⟲ 初期局面に戻す
          </button>
        </div>
      </div>
    </div>
  );
}
