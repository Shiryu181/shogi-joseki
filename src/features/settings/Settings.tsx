import { useState } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import type { Theme } from "../../store/settingsStore";
import { useProgressStore, CORRECT_STREAK } from "../../store/progressStore";
import { useExamStore } from "../../store/examStore";
import { passedChapterCount } from "../../domain/courseProgress";
import { Screen, TopBar } from "../../ui/DojoParts";
import "./Settings.css";

export interface SettingsProps {
  onBack: () => void;
  onAbout: () => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "auto", label: "端末に合わせる" },
  { value: "light", label: "明るい" },
  { value: "dark", label: "暗い" },
];

/** 設定。テーマの切り替え、学習の記録の数、記録を消す操作。 */
export function Settings({ onBack, onAbout }: SettingsProps) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const items = useProgressStore((s) => s.items);
  const resetProgress = useProgressStore((s) => s.reset);
  const results = useExamStore((s) => s.results);
  // 消す操作は取り消せないので、必ず一度確認を挟む。
  const [confirming, setConfirming] = useState(false);

  const solved = Object.keys(items).length;
  const correct = Object.values(items).filter((i) => i.streak >= CORRECT_STREAK).length;
  const passed = passedChapterCount(results);

  return (
    <Screen className="set-screen">
      <TopBar backLabel="戻る" onBack={onBack} title="設定" />
      <div className="dojo-body">
        <h2 className="fuda">テーマ</h2>
        <ul className="dojo-panel set-radios" role="radiogroup" aria-label="テーマ">
          {THEMES.map((t) => (
            <li key={t.value}>
              <button
                type="button"
                role="radio"
                aria-checked={theme === t.value}
                className={`set-radio${theme === t.value ? " is-on" : ""}`}
                onClick={() => setTheme(t.value)}
              >
                <span>{t.label}</span>
                {theme === t.value && <b aria-hidden="true">✓</b>}
              </button>
            </li>
          ))}
        </ul>

        <h2 className="fuda set-fuda">学習の記録</h2>
        <div className="dojo-panel set-stats">
          <div><span className="set-n">{solved}</span><span className="set-l">解いた問題</span></div>
          <div><span className="set-n">{correct}</span><span className="set-l">正解した問題</span></div>
          <div><span className="set-n">{passed}</span><span className="set-l">合格した章</span></div>
        </div>

        <button type="button" className="btn-secondary full set-about" onClick={onAbout}>このアプリについて</button>
        <button type="button" className="btn-secondary full set-danger" onClick={() => setConfirming(true)}>
          学習の記録を消す
        </button>
      </div>

      {confirming && (
        <div className="dj-modal-layer">
          <div className="dj-modal-scrim" onClick={() => setConfirming(false)} aria-hidden="true" />
          <div className="dojo-panel dj-modal" role="alertdialog" aria-modal="true" aria-labelledby="set-del-t">
            <h2 id="set-del-t">学習の記録を消しますか</h2>
            <p>{solved}問の記録がすべて無くなります。消すと元に戻せません。</p>
            <div className="dj-modal__row">
              <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>やめる</button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => { resetProgress(); setConfirming(false); }}
              >
                消す
              </button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
