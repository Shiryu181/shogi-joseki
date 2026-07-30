import type { JosekiMove } from "../domain/types";
import "./CommentPanel.css";

export interface CommentPanelProps {
  /** 末端(理想陣形)に到達しているか */
  isGoal: boolean;
  /** 手数(第n手)。isGoal のときは無視。 */
  moveNumber?: number;
  /** ▲２六歩 のような表示テキスト。isGoal のときは無視。 */
  moveText?: string;
  /** JosekiMove.note。末尾の "[要検証(DB照合範囲外)]" は自動的にバッジへ変換して取り除く。 */
  note?: string;
  /** JosekiNode.comment(現局面の解説)。 */
  comment?: string;
  /** 選択中の手の種別。deviation のときは専用の見せ方にする。 */
  kind?: JosekiMove["kind"];
  /** JosekiMove.punishNote(逸れ手の咎め方の要点)。kind:"deviation" のときのみ使う。 */
  punishNote?: string;
}

const VERIFY_TAG = /\s*\[要検証[^\]]*\]/g;

function splitNote(note: string | undefined): { text: string; flagged: boolean } {
  if (!note) return { text: "", flagged: false };
  const flagged = VERIFY_TAG.test(note);
  VERIFY_TAG.lastIndex = 0; // test() で lastIndex が進むのをリセット(グローバル正規表現の使い回し対策)
  const text = note.replace(VERIFY_TAG, "").trim();
  return { text, flagged };
}

/**
 * 学習モードの解説カード。現在の手・解説文・(要検証なら)控えめなバッジを表示する。
 * kind:"deviation" のときは「この手は定石を外れています」+ 咎め方の要点を専用の見せ方で表示する。
 */
export function CommentPanel({ isGoal, moveNumber, moveText, note, comment, kind, punishNote }: CommentPanelProps) {
  if (isGoal) {
    return (
      <div className="explain">
        <div className="mvnow">
          <span className="mv">理想陣形に到達しました</span>
        </div>
        {comment && <p>{comment}</p>}
      </div>
    );
  }

  const { text: noteText, flagged } = splitNote(note);
  const isDeviation = kind === "deviation";

  return (
    <div className="explain">
      <div className="mvnow">
        {moveNumber != null && <span className="no">第{moveNumber}手</span>}
        <span className="mv">{moveText}</span>
        {isDeviation && <span className="dev-badge">逸れ手</span>}
        {flagged && (
          <span className="verify-badge" title="やねうら王定跡DBの照合範囲外のため、一般的な定跡知識に基づく手です">
            要検証
          </span>
        )}
      </div>

      {isDeviation ? (
        <div className="deviation-callout">
          <b>この手は定石を外れています</b>
          {noteText && <p>{noteText}</p>}
          {punishNote && (
            <div className="punish">
              <b>咎め方</b>
              <span>{punishNote}</span>
            </div>
          )}
        </div>
      ) : (
        noteText && <p>{noteText}</p>
      )}

      {comment && (
        <div className="aim">
          <b>局面</b>
          <span>{comment}</span>
        </div>
      )}
    </div>
  );
}
