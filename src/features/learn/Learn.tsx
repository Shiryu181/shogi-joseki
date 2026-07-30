import { useEffect, useMemo } from "react";
import { Color, Square, moveFromUSI, parseUSIMove } from "../../domain/shogi";
import { useLearnStore, branchMove } from "../../store/learnStore";
import type { JosekiCourse, JosekiNode } from "../../domain/types";
import { Board } from "../../ui/Board";
import type { GhostPiece, HandHighlight } from "../../ui/Board";
import { CommentPanel } from "../../ui/CommentPanel";
import { BranchNav } from "../../ui/BranchNav";
import "./Learn.css";

export interface LearnProps {
  /** 表示するコース。切り替え時は都度渡し直す(本物のコース ⇔ 分岐ナビ動作確認用デモ)。 */
  course: JosekiCourse;
}

/**
 * 学習モード(なぞり)画面。DESIGN.md §5.3 準拠。
 * 本線を1手ずつ、なぞりガイド(from強調+dest glow+ghost駒)で提示し、
 * 光っている升をクリックするか「なぞって次へ」ボタンで進める。
 * 分岐(本線/変化/逸れ手)がある局面では BranchNav で切替可能。
 */
export function Learn({ course }: LearnProps) {
  const storeCourse = useLearnStore((s) => s.course);
  const currentNode = useLearnStore((s) => s.currentNode);
  const nodeHistory = useLearnStore((s) => s.nodeHistory);
  const selectedBranchIndex = useLearnStore((s) => s.selectedBranchIndex);
  const position = useLearnStore((s) => s.position);
  const attemptSquare = useLearnStore((s) => s.attemptSquare);
  const advance = useLearnStore((s) => s.advance);
  const chooseBranch = useLearnStore((s) => s.chooseBranch);
  const goBack = useLearnStore((s) => s.goBack);
  const goToStart = useLearnStore((s) => s.goToStart);
  const loadCourse = useLearnStore((s) => s.loadCourse);

  // 表示すべきコースがストアの現在のコースと違う(画面切替など)場合は読み込み直す。
  useEffect(() => {
    if (storeCourse.id !== course.id) {
      loadCourse(course);
    }
  }, [course, storeCourse.id, loadCourse]);

  const guide = branchMove(currentNode, selectedBranchIndex);
  const isGoal = !guide;
  const moveNumber = nodeHistory.length + 1;
  const totalMoves = useMemo(() => countMoves(course.root), [course]);

  const parsed = guide ? parseUSIMove(guide.usi) : null;
  const moveInfo = guide ? moveFromUSI(position, guide.usi) : null;

  const fromKey = parsed && parsed.from instanceof Square ? parsed.from.usi : null;
  const fromHand: HandHighlight | null =
    parsed && !(parsed.from instanceof Square) ? { type: parsed.from, color: position.color } : null;
  const glowKeys = parsed ? new Set([parsed.to.usi]) : undefined;

  let ghost: GhostPiece | null = null;
  if (parsed) {
    const movingType = parsed.from instanceof Square ? position.board.at(parsed.from)?.type : parsed.from;
    if (movingType) {
      ghost = { key: parsed.to.usi, color: position.color, type: movingType };
    }
  }

  function handleSquareClick(square: Square) {
    attemptSquare(square);
  }

  function handleHandPieceClick() {
    // なぞりモードでは持ち駒トレイのクリックでは進めない(移動先マスのクリックのみ受理)。
  }

  // ストアがまだこのコースを読み込み切っていない(切替直後の1レンダー)場合は
  // currentNode が別コースのものである可能性があるため、描画をスキップする。
  if (storeCourse.id !== course.id) return null;

  return (
    <div className="learn-wrap">
      <div className="learn-frame">
        <div className="learn-head">
          <div className="tl">JOSEKI DOJO ・ 学習(なぞり)</div>
          <h1>{course.title}</h1>
        </div>
        <div className="binfo" style={{ margin: "0 14px 8px" }}>
          <span className={`badge b-turn${position.color === Color.WHITE ? " gote" : ""}`}>
            {position.color === Color.BLACK ? "▲ 先手番" : "△ 後手番"}
          </span>
          <span className="badge b-prog">
            {Math.min(moveNumber, totalMoves)} / {totalMoves} 手
          </span>
        </div>
        <Board
          position={position}
          fromKey={fromKey}
          fromHand={fromHand}
          glowKeys={glowKeys}
          ghost={ghost}
          onSquareClick={handleSquareClick}
          onHandPieceClick={handleHandPieceClick}
          clickableHandColor="none"
        />
        {!isGoal && <div className="guidepill">光っているマスへ動かして次の手をなぞる</div>}
        <CommentPanel
          isGoal={isGoal}
          moveNumber={isGoal ? undefined : moveNumber}
          moveText={moveInfo?.displayText}
          note={guide?.note}
          comment={currentNode.comment}
          kind={guide?.kind}
          punishNote={guide?.punishNote}
        />
        <BranchNav branches={currentNode.branches} activeIndex={selectedBranchIndex} onSelect={chooseBranch} />
        <div className="learn-navrow">
          <button type="button" onClick={goToStart} disabled={nodeHistory.length === 0} aria-label="最初へ">
            ⏮
          </button>
          <button type="button" onClick={goBack} disabled={nodeHistory.length === 0} aria-label="1手戻る">
            ◀
          </button>
          <button type="button" className="primary" onClick={advance} disabled={isGoal}>
            なぞって次へ ▶
          </button>
        </div>
      </div>
    </div>
  );
}

function countMoves(node: JosekiNode): number {
  let count = 0;
  let current = node;
  while (current.branches.length > 0) {
    count++;
    const child = current.branches[0].child;
    if (!child) break;
    current = child;
  }
  return count;
}
