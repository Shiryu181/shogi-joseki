import { useMemo } from "react";
import { Color } from "../../domain/shogi";
import { useSandboxStore } from "../../store/sandboxStore";
import { Board } from "../../ui/Board";
import "./Sandbox.css";

export interface SandboxProps {
  /** 戻るボタン(開発メニュー)の遷移先。 */
  onBack: () => void;
}

/**
 * Phase 0 検証用画面: 初期局面から合法手だけで自由に駒を動かせる。
 * 開発用画面(§本タスクの ?dev=1 導線)専用で、通常のユーザー導線には出さない。
 */
export function Sandbox({ onBack }: SandboxProps) {
  const position = useSandboxStore((s) => s.position);
  const selected = useSandboxStore((s) => s.selected);
  const moveDests = useSandboxStore((s) => s.moveDests);
  const dropDests = useSandboxStore((s) => s.dropDests);
  const lastMove = useSandboxStore((s) => s.lastMove);
  const lastMoveText = useSandboxStore((s) => s.lastMoveText);
  const selectSquare = useSandboxStore((s) => s.selectSquare);
  const selectHand = useSandboxStore((s) => s.selectHand);
  const reset = useSandboxStore((s) => s.reset);

  const turn = position.color;

  const glowKeys = useMemo(() => {
    if (!selected) return undefined;
    const dests =
      selected.kind === "board"
        ? (moveDests.get(selected.square.usi) ?? [])
        : (dropDests.get(selected.pieceType) ?? []);
    return new Set(dests.map((s) => s.usi));
  }, [selected, moveDests, dropDests]);

  const lastKeys = useMemo(() => {
    if (!lastMove) return undefined;
    const keys = new Set<string>([lastMove.to.usi]);
    if (lastMove.from) keys.add(lastMove.from.usi);
    return keys;
  }, [lastMove]);

  const fromKey = selected?.kind === "board" ? selected.square.usi : null;
  const fromHand = selected?.kind === "hand" ? { type: selected.pieceType, color: turn } : null;

  return (
    <div className="sandbox-wrap">
      <div className="sandbox-frame">
        <div className="abar">
          <button type="button" className="back" onClick={onBack} aria-label="戻る">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="sandbox-head">
            <div className="tl">JOSEKI DOJO ・ SANDBOX(開発用)</div>
            <h1>自由対局(検証用)</h1>
          </div>
        </div>
        <div className="binfo">
          <span className={`badge b-turn${turn === Color.WHITE ? " gote" : ""}`}>
            {turn === Color.BLACK ? "▲ 先手番" : "△ 後手番"}
          </span>
          <span className="badge b-prog">Phase 0 ・ 合法手のみ</span>
        </div>
        <Board
          position={position}
          fromKey={fromKey}
          fromHand={fromHand}
          glowKeys={glowKeys}
          lastKeys={lastKeys}
          onSquareClick={selectSquare}
          onHandPieceClick={selectHand}
        />
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
