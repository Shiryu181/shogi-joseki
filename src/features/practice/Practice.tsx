import { useEffect, useMemo } from "react";
import { Color, Square, parseUSIMove } from "../../domain/shogi";
import { primaryBranch, usePracticeStore } from "../../store/practiceStore";
import type { OffScriptOutcome } from "../../store/practiceStore";
import type { JosekiCourse } from "../../domain/types";
import { Board } from "../../ui/Board";
import type { GhostPiece, HandHighlight, PromotionChoice } from "../../ui/Board";
import { SENTE_VIEW_BASIS_NOTE, describeSenteViewScore, formatSenteViewScore } from "../../engine/scoreView";
import "./Practice.css";

/** off-script終局時のタイトル文言(断定を避けつつ、何が起きたかは明確にする)。 */
function offScriptEndedTitle(outcome: OffScriptOutcome, myColor: Color): string {
  switch (outcome.type) {
    case "checkmate":
      return outcome.loser === myColor ? "詰まされました" : "相手を詰ませました";
    case "engineResign":
      return "エンジンが投了しました";
    case "engineWin":
      return "エンジン側の勝利条件が成立しました";
    case "engineError":
      return "対局を続けられませんでした";
  }
}

function offScriptEndedDetail(outcome: OffScriptOutcome, myColor: Color): string {
  const back = "「定石の局面に戻る」から練習を再開できます。";
  switch (outcome.type) {
    case "checkmate":
      return outcome.loser === myColor
        ? `合法手が無くなりました。${back}`
        : `相手の合法手が無くなりました。${back}`;
    case "engineResign":
      return `エンジンがこれ以上の対局を続けないと判断しました。${back}`;
    case "engineWin":
      return `エンジン側の勝利条件(入玉宣言など)が成立したと判断されました。${back}`;
    case "engineError":
      return `${outcome.message ?? "エンジンの応答に問題が発生しました。"} ${back}`;
  }
}

export interface PracticeProps {
  /** 表示するコース。切り替え時は都度渡し直す。 */
  course: JosekiCourse;
}

/**
 * 練習モード(実戦)画面。DESIGN.md §4.2 / §5.4 準拠。
 * 自分の手番だけ盤を自由に操作でき(合法手なら何でも指せる)、相手の手番は
 * コースの台本を少し間を置いて自動で指す。判定は「収録済みの定石手と一致するか」
 * だけで行い(エンジンなし)、不一致は評価的な断定をせず正解手を提示する。
 */
export function Practice({ course }: PracticeProps) {
  const storeCourse = usePracticeStore((s) => s.course);
  const currentNode = usePracticeStore((s) => s.currentNode);
  const position = usePracticeStore((s) => s.position);
  const moveDests = usePracticeStore((s) => s.moveDests);
  const dropDests = usePracticeStore((s) => s.dropDests);
  const selected = usePracticeStore((s) => s.selected);
  const status = usePracticeStore((s) => s.status);
  const moveIndex = usePracticeStore((s) => s.moveIndex);
  const totalMoves = usePracticeStore((s) => s.totalMoves);
  const correctCount = usePracticeStore((s) => s.correctCount);
  const mistakeCount = usePracticeStore((s) => s.mistakeCount);
  const wrongAttempt = usePracticeStore((s) => s.wrongAttempt);
  const lastMove = usePracticeStore((s) => s.lastMove);
  const hintOn = usePracticeStore((s) => s.hintOn);
  const engineStatus = usePracticeStore((s) => s.engineStatus);
  const engineComparisonStatus = usePracticeStore((s) => s.engineComparisonStatus);
  const engineComparison = usePracticeStore((s) => s.engineComparison);
  const offScript = usePracticeStore((s) => s.offScript);
  const selectSquare = usePracticeStore((s) => s.selectSquare);
  const selectHand = usePracticeStore((s) => s.selectHand);
  const toggleHint = usePracticeStore((s) => s.toggleHint);
  const retry = usePracticeStore((s) => s.retry);
  const restart = usePracticeStore((s) => s.restart);
  const loadCourse = usePracticeStore((s) => s.loadCourse);
  const ensureEngineLoaded = usePracticeStore((s) => s.ensureEngineLoaded);
  const continueOffScript = usePracticeStore((s) => s.continueOffScript);
  const choosePromotion = usePracticeStore((s) => s.choosePromotion);
  const returnToScript = usePracticeStore((s) => s.returnToScript);

  // 表示すべきコースがストアの現在のコースと違う(画面切替など)場合は読み込み直す。
  useEffect(() => {
    if (storeCourse.id !== course.id) {
      loadCourse(course);
    }
  }, [course, storeCourse.id, loadCourse]);

  // エンジンの遅延ロード: 練習画面に入ったときに一度だけ要求する(学習/Sandboxでは
  // 呼ばれないため、そちらではロードされない)。既にロード済み/失敗確定なら
  // ensureEngineLoaded 内部で何もしない。エンジンが無くても練習モードは
  // 台本判定でそのまま動く(グレースフルデグレード)。
  useEffect(() => {
    ensureEngineLoaded();
  }, [ensureEngineLoaded]);

  const myColor = course.mySide === "sente" ? Color.BLACK : Color.WHITE;

  // 自分の駒を選択中はその合法手先を光らせる(sandboxStore と同じ挙動)。
  const selectedGlowKeys = useMemo(() => {
    if (!selected) return undefined;
    const dests =
      selected.kind === "board" ? (moveDests.get(selected.square.usi) ?? []) : (dropDests.get(selected.pieceType) ?? []);
    return new Set(dests.map((s) => s.usi));
  }, [selected, moveDests, dropDests]);

  // ヒント: 何も選択していない自分の手番でだけ、次の定石手の from/to を光らせる。
  // off-script中は台本の「次の手」が存在しないため出さない。
  const hintGuide = !offScript && hintOn && status === "userTurn" && !selected ? primaryBranch(currentNode) : null;
  const hintParsed = hintGuide ? parseUSIMove(hintGuide.usi) : null;
  const hintFromKey = hintParsed && hintParsed.from instanceof Square ? hintParsed.from.usi : null;
  const hintFromHand: HandHighlight | null =
    hintParsed && !(hintParsed.from instanceof Square) ? { type: hintParsed.from, color: position.color } : null;
  const hintGlowKeys = hintParsed ? new Set([hintParsed.to.usi]) : undefined;
  let hintGhost: GhostPiece | null = null;
  if (hintParsed) {
    const movingType = hintParsed.from instanceof Square ? position.board.at(hintParsed.from)?.type : hintParsed.from;
    if (movingType) hintGhost = { key: hintParsed.to.usi, color: position.color, type: movingType };
  }

  const fromKey = selected?.kind === "board" ? selected.square.usi : hintFromKey;
  const fromHand: HandHighlight | null = selected?.kind === "hand" ? { type: selected.pieceType, color: myColor } : hintFromHand;
  const glowKeys = selectedGlowKeys ?? hintGlowKeys;
  const ghost = selected ? null : hintGhost;

  const lastKeys = useMemo(() => {
    if (!lastMove) return undefined;
    const parsed = parseUSIMove(lastMove.usi);
    if (!parsed) return undefined;
    const keys = new Set<string>([parsed.to.usi]);
    if (parsed.from instanceof Square) keys.add(parsed.from.usi);
    return keys;
  }, [lastMove]);

  // 成/不成の選択待ち(off-script)。移動元にまだ駒がある局面から駒種を読む。
  const promotionChoice: PromotionChoice | null = useMemo(() => {
    const pending = offScript?.pendingPromotion;
    if (!pending) return null;
    const pieceType = pending.from instanceof Square ? position.board.at(pending.from)?.type : pending.from;
    if (!pieceType) return null;
    return { pieceType, color: position.color };
  }, [offScript, position]);

  // ストアがまだこのコースを読み込み切っていない場合は描画をスキップする(Learn と同様)。
  if (storeCourse.id !== course.id) return null;

  const displayMoveNumber = Math.min(moveIndex + 1, totalMoves);
  const turnMark = position.color === Color.BLACK ? "▲" : "△";
  const opponentDeviated = lastMove?.by === "opponent" && lastMove.kind === "deviation";

  function handleSquareClick(square: Square) {
    selectSquare(square);
  }

  return (
    <div className="practice-wrap">
      <div className="practice-frame">
        <div className="practice-head">
          <div className="tl">JOSEKI DOJO ・ 練習(実戦)</div>
          <h1>{course.title}</h1>
        </div>

        <div className="binfo">
          {offScript ? (
            <>
              <span className="badge b-line">定石を外れています</span>
              {offScript.status === "userTurn" && <span className="badge b-turn">{turnMark} あなたの手番</span>}
              {offScript.status === "engineThinking" && (
                <span className="badge b-turn waiting">相手(エンジン)の手番</span>
              )}
              {offScript.status === "ended" && <span className="badge b-goal">対局終了</span>}
              <span className="badge b-prog">オフスクリプト {offScript.moveCount} 手</span>
            </>
          ) : status === "goal" ? (
            <span className="badge b-goal">達成</span>
          ) : (
            <>
              <span className={`badge b-turn${status === "opponentTurn" ? " waiting" : ""}`}>
                {turnMark} {status === "userTurn" ? "あなたの手番" : "相手の手番"}
              </span>
              {opponentDeviated && <span className="badge b-line">相手が定石を外した</span>}
              <span className="badge b-prog">
                {displayMoveNumber} / {totalMoves} 手
              </span>
              <span className="badge b-good">正解 {correctCount}</span>
              <span className="badge b-bad">ミス {mistakeCount}</span>
            </>
          )}
          {engineStatus === "loading" && <span className="badge b-engine loading">エンジン準備中…</span>}
          {engineStatus === "ready" && <span className="badge b-engine on">エンジン準備完了</span>}
          {engineStatus === "unavailable" && <span className="badge b-engine off">エンジン利用不可</span>}
        </div>

        <Board
          position={position}
          fromKey={fromKey}
          fromHand={fromHand}
          glowKeys={glowKeys}
          lastKeys={lastKeys}
          ghost={ghost}
          onSquareClick={handleSquareClick}
          onHandPieceClick={(type, color) => selectHand(type, color)}
          clickableHandColor={
            (offScript ? offScript.status === "userTurn" : status === "userTurn") ? myColor : "none"
          }
          promotionChoice={promotionChoice}
          onPromotionChoice={choosePromotion}
        />

        {!offScript && status === "opponentTurn" && <div className="waitpill">相手が指しています…</div>}
        {offScript?.status === "engineThinking" && <div className="waitpill">エンジンが考えています…</div>}
        {hintGuide && <div className="hintpill">光っているマスへ動かすと定石の手になります</div>}

        {offScript ? (
          <div className="feedback-area">
            {offScript.status === "ended" && offScript.outcome && (
              <div className="goal-banner offscript-ended">
                <b>{offScriptEndedTitle(offScript.outcome, myColor)}</b>
                <p>{offScriptEndedDetail(offScript.outcome, myColor)}</p>
              </div>
            )}
            {offScript.lastFeedback && (
              <div className="explain">
                <div className="mvnow">
                  <span className="no">あなたが指した手</span>
                  <span className="mv">{offScript.lastFeedback.displayText}</span>
                </div>
                <div className="engine-panel">
                  <div className="engine-panel-title">
                    エンジン評価(先手視点・{(offScript.lastFeedback.thinkMs / 1000).toFixed(1)}秒思考)
                  </div>
                  <div className="engine-basis">{SENTE_VIEW_BASIS_NOTE}</div>
                  <div className="engine-row">
                    <span className="engine-label">この手の後の評価値</span>
                    <span className="engine-score">{formatSenteViewScore(offScript.lastFeedback)}</span>
                  </div>
                  <div className="engine-caveat">{describeSenteViewScore(offScript.lastFeedback)}</div>
                </div>
              </div>
            )}
          </div>
        ) : status === "goal" ? (
          <div className="goal-banner">
            <b>理想陣形に到達しました</b>
            <p>{course.goalFormation}</p>
            <div className="goal-stats">
              <span>
                手数 {totalMoves} ・ 正解 {correctCount} ・ ミス {mistakeCount}
              </span>
            </div>
          </div>
        ) : (
          <div className="feedback-area">
            {wrongAttempt ? (
              <div className="explain">
                <div className="mvnow">
                  <span className="no">あなたが指した手</span>
                  <span className="mv">{wrongAttempt.attemptedText}</span>
                </div>
                <div className="fb wrong">
                  <span className="ic">✕</span>
                  <div>
                    <b>定石(このコース)の手ではありません</b>
                  </div>
                </div>
                <div className="fb right">
                  <span className="ic">✓</span>
                  <div>
                    <b>この局面の定石手は {wrongAttempt.correctText} です</b>
                    {wrongAttempt.correctNote && <span className="s">{wrongAttempt.correctNote}</span>}
                  </div>
                </div>

                {engineComparisonStatus === "thinking" && (
                  <div className="engine-panel engine-thinking">エンジンが確認中…</div>
                )}
                {engineComparisonStatus === "error" && (
                  <div className="engine-panel engine-note">エンジンの評価を取得できませんでした</div>
                )}
                {engineComparisonStatus === "done" && engineComparison && (
                  <div className="engine-panel">
                    <div className="engine-panel-title">
                      エンジン評価(先手視点・各{(engineComparison.thinkMs / 1000).toFixed(1)}秒思考)
                    </div>
                    <div className="engine-basis">{SENTE_VIEW_BASIS_NOTE}</div>
                    <div className="engine-row">
                      <span className="engine-label">あなたの手 {engineComparison.yourMove.displayText}</span>
                      <span className="engine-score">{formatSenteViewScore(engineComparison.yourMove)}</span>
                    </div>
                    <div className="engine-row">
                      <span className="engine-label">定石手 {engineComparison.josekiMove.displayText}</span>
                      <span className="engine-score">{formatSenteViewScore(engineComparison.josekiMove)}</span>
                    </div>
                    <div className="engine-caveat">
                      エンジンによる目安の評価値です。数値差が小さい場合は誤差の範囲のことがあります。
                    </div>
                  </div>
                )}

                <div className="offscript-cta">
                  <button
                    type="button"
                    className="continue-btn"
                    onClick={continueOffScript}
                    disabled={engineStatus !== "ready"}
                  >
                    このまま指し続ける
                  </button>
                  {engineStatus !== "ready" && (
                    <p className="offscript-cta-note">
                      {engineStatus === "unavailable"
                        ? "この環境ではエンジンが使えないため、このまま指し続けることはできません。"
                        : "エンジン準備中のため、もう少しお待ちください。"}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              lastMove?.by === "user" && (
                <div key={moveIndex} className="correct-flash">
                  <span className="ic">✓</span>
                  <span>正解です({lastMove.displayText})</span>
                </div>
              )
            )}
          </div>
        )}

        <div className="practice-navrow">
          <button
            type="button"
            onClick={toggleHint}
            disabled={!!offScript || status !== "userTurn"}
            aria-pressed={hintOn}
          >
            💡 ヒント
          </button>
          {offScript ? (
            <button type="button" className="primary" onClick={returnToScript}>
              定石の局面に戻る
            </button>
          ) : (
            <button type="button" onClick={retry} disabled={!wrongAttempt}>
              もう一度
            </button>
          )}
          <button type="button" className="primary" onClick={restart}>
            ⟲ 最初からやり直す
          </button>
        </div>
        {offScript && <div className="offscript-hint-note">定石を外れているためヒントはありません</div>}
      </div>
    </div>
  );
}
