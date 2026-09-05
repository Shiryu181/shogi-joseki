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
  /** 戻るボタン(§5.2 対抗形選択、または開発メニュー)の遷移先。 */
  onBack: () => void;
}

/**
 * 学習モード(なぞり)画面。DESIGN.md §5.3 準拠。
 * 本線を1手ずつ、なぞりガイド(from強調+dest glow+ghost駒)で提示し、
 * 光っている升をクリックするか「なぞって次へ」ボタンで進める。
 * 分岐(本線/変化/逸れ手)がある局面では BranchNav で切替可能。
 */
export function Learn({ course, onBack }: LearnProps) {
  const storeCourse = useLearnStore((s) => s.course);
  const currentNode = useLearnStore((s) => s.currentNode);
  const nodeHistory = useLearnStore((s) => s.nodeHistory);
  const selectedBranchIndex = useLearnStore((s) => s.selectedBranchIndex);
  const position = useLearnStore((s) => s.position);
  const autoAdvanceOpponent = useLearnStore((s) => s.autoAdvanceOpponent);
  const pendingAck = useLearnStore((s) => s.pendingAck);
  const attemptSquare = useLearnStore((s) => s.attemptSquare);
  const advance = useLearnStore((s) => s.advance);
  const chooseBranch = useLearnStore((s) => s.chooseBranch);
  const goBack = useLearnStore((s) => s.goBack);
  const goToStart = useLearnStore((s) => s.goToStart);
  const loadCourse = useLearnStore((s) => s.loadCourse);
  const setAutoAdvanceOpponent = useLearnStore((s) => s.setAutoAdvanceOpponent);
  const pauseAutoAdvance = useLearnStore((s) => s.pauseAutoAdvance);
  const resumeAutoAdvance = useLearnStore((s) => s.resumeAutoAdvance);

  // 表示すべきコースがストアの現在のコースと違う(画面切替など)場合は読み込み直す。
  useEffect(() => {
    if (storeCourse.id !== course.id) {
      loadCourse(course);
    }
  }, [course, storeCourse.id, loadCourse]);

  // マウント中だけ相手の手の自動進行タイマーを有効にする。他画面へ移動した(アンマウントされた)
  // 間は裏で手が進み続けないよう、離脱時に必ず保留中のタイマーを破棄する。
  useEffect(() => {
    resumeAutoAdvance();
    return () => pauseAutoAdvance();
  }, [resumeAutoAdvance, pauseAutoAdvance]);

  const guide = branchMove(currentNode, selectedBranchIndex);
  const isGoal = !guide;
  const moveNumber = nodeHistory.length + 1;
  const totalMoves = useMemo(() => countMoves(course.root), [course]);

  // 確認待ち中(相手の手を自動で指した直後)は、解説を読むことに集中してもらうため
  // 次の自分の手のガイドは出さない。「次へ」を押すと通常の表示に戻る。
  const parsed = guide && !pendingAck ? parseUSIMove(guide.usi) : null;
  const moveInfo = guide && !pendingAck ? moveFromUSI(position, guide.usi) : null;

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

  const myColor = course.mySide === "sente" ? Color.BLACK : Color.WHITE;
  const isOpponentTurn = !isGoal && position.color !== myColor;
  const showWaitPill = isOpponentTurn && autoAdvanceOpponent && !pendingAck;

  return (
    <div className="learn-wrap">
      <div className="learn-frame">
        <div className="abar">
          <button type="button" className="back" onClick={onBack} aria-label="戻る">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="learn-head">
            <div className="tl">JOSEKI DOJO ・ 学習(なぞり)</div>
            <h1>{course.title}</h1>
          </div>
        </div>
        <div className="binfo" style={{ margin: "0 14px 8px" }}>
          <span className={`badge b-turn${position.color === Color.WHITE ? " gote" : ""}`}>
            {position.color === Color.BLACK ? "▲ 先手番" : "△ 後手番"}
          </span>
          <span className="badge b-prog">
            {Math.min(pendingAck ? pendingAck.moveNumber : moveNumber, totalMoves)} / {totalMoves} 手
          </span>
          <button
            type="button"
            className={`badge toggle-auto${autoAdvanceOpponent ? "" : " off"}`}
            onClick={() => setAutoAdvanceOpponent(!autoAdvanceOpponent)}
            aria-pressed={!autoAdvanceOpponent}
          >
            {autoAdvanceOpponent ? "相手の手:自動" : "相手の手も自分でなぞる"}
          </button>
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
          // 後手番のコースでは盤を後手側から見た向きにする(自分の駒が手前を向く)
          flipped={course.mySide === "gote"}
        />
        {showWaitPill && <div className="waitpill">相手が指しています…</div>}
        {pendingAck && <div className="ackpill">相手が指しました。解説を読んで「次へ」</div>}
        {!isGoal && !showWaitPill && !pendingAck && (
          <div className="guidepill">光っているマスへ動かして次の手をなぞる</div>
        )}
        {pendingAck ? (
          <CommentPanel
            isGoal={false}
            moveNumber={pendingAck.moveNumber}
            moveText={pendingAck.moveText}
            note={pendingAck.note}
            comment={pendingAck.comment}
            kind={pendingAck.kind}
            punishNote={pendingAck.punishNote}
          />
        ) : (
          <CommentPanel
            isGoal={isGoal}
            moveNumber={isGoal ? undefined : moveNumber}
            moveText={moveInfo?.displayText}
            note={guide?.note}
            comment={currentNode.comment}
            kind={guide?.kind}
            punishNote={guide?.punishNote}
            goalLabel={course.goalLabel}
          />
        )}
        {!pendingAck && (
          <BranchNav branches={currentNode.branches} activeIndex={selectedBranchIndex} onSelect={chooseBranch} />
        )}
        <div className="learn-navrow">
          <button type="button" onClick={goToStart} disabled={nodeHistory.length === 0} aria-label="最初へ">
            ⏮
          </button>
          <button type="button" onClick={goBack} disabled={nodeHistory.length === 0} aria-label="1手戻る">
            ◀
          </button>
          <button type="button" className="primary" onClick={advance} disabled={isGoal && !pendingAck}>
            {pendingAck ? "次へ ▶" : "なぞって次へ ▶"}
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
    // 逸れ手の枝を数に含めないよう、本線だけを辿る。
    const main = current.branches.find((b) => b.kind === "main") ?? current.branches[0];
    const child = main.child;
    if (!child) break;
    current = child;
  }
  return count;
}
