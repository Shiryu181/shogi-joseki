import "./About.css";

export interface AboutProps {
  onBack: () => void;
}

/** このアプリのソースコード置き場。 */
const SOURCE_URL = "https://github.com/Shiryu181/shogi-joseki";

/**
 * 「このアプリについて」画面。
 *
 * 目的の一つは GPL-3.0 の遵守。将棋エンジン(YaneuraOu)を GPL-3.0 で配布しているため、
 * 訪問者が見える場所に「何を使っているか・ライセンス・ソースの入手先」を示す必要がある
 * (README は開発者しか見ないので、それだけでは足りない)。
 * 本アプリ自体も GPL-3.0-or-later で公開し、ライセンスの解釈上の曖昧さを無くしている。
 */
export function About({ onBack }: AboutProps) {
  return (
    <div className="about-wrap">
      <div className="about-frame">
        <div className="abar">
          <button type="button" className="back" onClick={onBack} aria-label="戻る">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <div className="tl">JOSEKI DOJO</div>
            <h1>このアプリについて</h1>
          </div>
        </div>

        <section className="about-sec">
          <h2>定石道場</h2>
          <p>
            特定の戦法の定石を、なぞって覚え、自分で指して確かめるための学習アプリです。
            収録している手順は公開されている定跡の解説に基づき、すべての手が将棋のルール上
            成立することを機械的に検証しています。
          </p>
        </section>

        <section className="about-sec">
          <h2>ライセンス</h2>
          <p>
            本アプリは <b>GNU General Public License v3.0 以降(GPL-3.0-or-later)</b> で公開しています。
            自由に使用・改変・再配布できます。
          </p>
          <ul className="about-links">
            <li>
              <a href="/LICENSE.txt" target="_blank" rel="noreferrer">
                ライセンス全文(GPL-3.0)
              </a>
            </li>
            <li>
              <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                ソースコード(GitHub)
              </a>
            </li>
          </ul>
        </section>

        <section className="about-sec">
          <h2>使用しているソフトウェア</h2>

          <div className="about-item">
            <div className="about-item-head">
              <b>YaneuraOu(やねうら王)</b>
              <span className="about-lic gpl">GPL-3.0</span>
            </div>
            <p>
              将棋エンジン。練習モードで指した手の評価値を出したり、定石を外れた後の対局相手を
              務めます。<code>@mizarjp/yaneuraou.k-p</code> の WebAssembly ビルドを未改変で使用しています。
            </p>
            <ul className="about-links">
              <li>
                <a href="https://github.com/mizar/YaneuraOu.wasm" target="_blank" rel="noreferrer">
                  ソースコード(WebAssembly 版)
                </a>
              </li>
              <li>
                <a href="https://github.com/yaneurao/YaneuraOu" target="_blank" rel="noreferrer">
                  ソースコード(本体)
                </a>
              </li>
              <li>
                <a href="/THIRD-PARTY-yaneuraou-LICENSE.md" target="_blank" rel="noreferrer">
                  ライセンス全文
                </a>
              </li>
            </ul>
          </div>

          <div className="about-item">
            <div className="about-item-head">
              <b>tsshogi</b>
              <span className="about-lic">MIT</span>
            </div>
            <p>将棋のルール判定・局面表現(SFEN/USI)に使用しています。</p>
          </div>

          <div className="about-item">
            <div className="about-item-head">
              <b>React / Zustand</b>
              <span className="about-lic">MIT</span>
            </div>
            <p>画面の構築と状態管理に使用しています。</p>
          </div>

          <div className="about-item">
            <div className="about-item-head">
              <b>Yuji Syuku</b>
              <span className="about-lic">SIL OFL 1.1</span>
            </div>
            <p>駒の書体に使用しています。</p>
            <ul className="about-links">
              <li>
                <a href="/fonts/YujiSyuku-OFL-LICENSE.txt" target="_blank" rel="noreferrer">
                  ライセンス全文
                </a>
              </li>
            </ul>
          </div>
        </section>

        <section className="about-sec">
          <h2>定石データについて</h2>
          <p>
            手順は公開されている定跡の解説(将棋大図書館、はちみつ将棋カフェ など)に基づいて
            作成し、解説文は本アプリのために書き下ろしたものです。
            全手順は将棋のルール上成立することを検証していますが、
            <b>内容の正確性を保証するものではありません</b>。
          </p>
        </section>
      </div>
    </div>
  );
}
