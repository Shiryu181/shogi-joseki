import { Screen, TopBar } from "../../ui/DojoParts";
import "./About.css";

export interface AboutProps {
  onBack: () => void;
}

/** このアプリのソースコード置き場。 */
const SOURCE_URL = "https://github.com/Shiryu181/shogi-joseki";

/** 外部リンクの行。行全体(44px以上)が押せて、末尾に「›」が付く。 */
function LinkRow({ href, children }: { href: string; children: string }) {
  return (
    <a className="link-row" href={href} target="_blank" rel="noreferrer">
      <span>{children}</span>
    </a>
  );
}

/**
 * 「このアプリについて」画面(モック 25)。
 *
 * 目的の一つは GPL-3.0 の遵守。将棋エンジン(YaneuraOu)を GPL-3.0 で配布しているため、
 * 訪問者が見える場所に「何を使っているか・ライセンス・ソースの入手先」を示す必要がある
 * (README は開発者しか見ないので、それだけでは足りない)。
 * 本アプリ自体も GPL-3.0-or-later で公開し、ライセンスの解釈上の曖昧さを無くしている。
 */
export function About({ onBack }: AboutProps) {
  return (
    <Screen className="about-screen">
      <TopBar backLabel="戻る" onBack={onBack} title="このアプリについて" />
      <div className="dojo-panel about">
        <h3>定跡道場</h3>
        <p>戦法の定跡を、ねらいを確かめながら一手ずつ指して覚えるための学習アプリです。すべての手を自分で指す問題として出し、迷ったときは「ねらい」のヒントを見られます。正解した問題も日をおいて復習に出てきて、章ごとの認定試験で定着を確かめます。</p>
        <p>駒組みは公開されている定跡の解説に基づき、駒がぶつかった後の手順は将棋エンジンで確かめています。すべての手が将棋のルール上成立することも機械的に検証していますが、<b>内容の正確性を保証するものではありません</b>。</p>

        <h3>ライセンス</h3>
        <p>本アプリは GNU General Public License v3.0 以降(GPL-3.0-or-later)で公開しています。自由に使用・改変・再配布できます。</p>
        <LinkRow href="/LICENSE.txt">ライセンス全文(GPL-3.0)</LinkRow>
        <LinkRow href={SOURCE_URL}>本アプリのソースコード</LinkRow>

        <h3>使用しているソフトウェア</h3>
        <p><b>YaneuraOu(やねうら王)</b> GPL-3.0 ― 将棋エンジン。定跡の検証のほか、「この手を指すとどうなる？」の評価にも使っています(<code>@mizarjp/yaneuraou.k-p</code> の WebAssembly ビルドを未改変で使用)。</p>
        <LinkRow href="https://github.com/mizar/YaneuraOu.wasm">YaneuraOu WebAssembly 版のソースコード</LinkRow>
        <LinkRow href="https://github.com/yaneurao/YaneuraOu">YaneuraOu 本体のソースコード</LinkRow>
        <LinkRow href="/THIRD-PARTY-yaneuraou-LICENSE.md">YaneuraOu のライセンス全文</LinkRow>
        <p><b>tsshogi</b> MIT ― 将棋のルール判定・局面の表現。</p>
        <p><b>React / Zustand</b> MIT ― 画面の構築と状態管理。</p>
        <p><b>Yuji Syuku</b> SIL OFL 1.1 ― 駒の書体。</p>
        <LinkRow href="/fonts/YujiSyuku-OFL-LICENSE.txt">Yuji Syuku のライセンス全文</LinkRow>
      </div>
    </Screen>
  );
}
