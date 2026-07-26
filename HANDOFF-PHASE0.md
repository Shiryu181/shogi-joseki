# Phase 0 着手プラン(Sonnet 5 への引き渡し)

> 目的:React + Vite + TS の土台を作り、**盤・駒・持ち駒を描画して合法手で
> 駒を動かせる**状態にする(mockup.html の盤が実データで動く土台)。
> 前提資料:[DESIGN.md](./DESIGN.md)(唯一の正)/ [mockup.html](./mockup.html)(見た目の基準)/ [ROADMAP.md](./ROADMAP.md)
>
> **進め方ルール**:各ステップに着手する前に、具体的な変更案(作るファイル・
> 主要コード方針)を提示して合意を得てからコードを書くこと。

---

## 0. 事前確認(コードを書く前に)
1. Node のバージョン確認(推奨 v20+)。
2. **ライブラリの存在と最新 API を npm で確認**してからバージョン固定:
   - `tsshogi`(局面・合法手・SFEN/USI・棋譜)
   - `shogiground`(盤 UI。chessground の将棋版)
   - `zustand`(状態管理)
   - ※ `yaneuraou.wasm`(エンジン)は **Phase 3** で導入。Phase 0 では入れない。
   - もし API/パッケージ名が想定と違えば、DESIGN.md の技術スタックを更新して合意を取る。

## 1. 雛形の作成
プロジェクト直下(このディレクトリ)にドキュメントを残したまま Vite を導入する。

```bash
cd /Users/takahashishiryuu/Desktop/tool/shogi-joseki
npm create vite@latest . -- --template react-ts   # 非空ディレクトリの警告は「続行」を選ぶ
npm install
npm install tsshogi shogiground zustand
git init && git add -A && git commit -m "chore: scaffold vite + react-ts"
```

`.gitignore` に `node_modules`, `dist` が入っていることを確認。

## 2. ディレクトリ構成(DESIGN.md §8 準拠)を用意
```
src/
  domain/      # 型定義(§3.2 JosekiCourse/JosekiNode/JosekiMove, §3.4 Strategy)と tsshogi ラッパ
  ui/          # Board(shogiground ラッパ)ほか
  store/       # zustand
  features/
    sandbox/   # Phase 0 検証用:自由に駒を動かせる画面
  styles/      # tokens.css(mockup の配色・書体トークンを移植)
  App.tsx / main.tsx
public/
  fonts/       # 駒フォント(楷書/教科書体)を後で配置
```

## 3. デザイントークンの移植
- `mockup.html` の `:root` の CSS 変数(木目パレット・ライト/ダーク・書体)を
  `src/styles/tokens.css` に移植。以降のUIはトークン経由で色を参照する。
- 駒の見た目(五角形クリップパス・木肌 `#F1D296`・縁・楷書体)も mockup を踏襲。

## 4. ドメイン層
- `domain/types.ts`:DESIGN.md §3.2 / §3.4 の型をそのまま定義。
- `domain/shogi.ts`:tsshogi の薄いラッパ。
  - 初期局面の生成、SFEN 読み書き、**合法手の生成**、指し手適用、USI↔表示(▲２六歩)変換。

## 5. Board コンポーネント(shogiground ラッパ)
- `ui/Board.tsx`:
  - shogiground を初期化し、tsshogi の現在局面を描画(盤・駒・持ち駒トレイ)。
  - tsshogi の合法手から shogiground の `dests`(移動可能マップ)を作り、
    ユーザーのドラッグ/タップ移動を受けて局面を更新。
  - 最終手ハイライト、なぞりガイド(将来)の口を用意。
- 駒は shogiground のスプライトではなく **mockup と同じ楷書体＋五角形**で描画できるよう
  CSS/テーマを当てる(shogiground はカスタムピースに対応)。

## 6. Sandbox 画面(Phase 0 の検証対象)
- `features/sandbox/Sandbox.tsx`:初期局面を表示し、**自由に合法手で駒を動かせる**。
- `App.tsx` から Sandbox を表示(ルーティングは最小でよい)。

## 7. 駒フォント
- 楷書/教科書体の**フリーフォント**を選定(ライセンスが再配布・Web埋め込み可のもの)。
  例:IPAex 明朝系ではなく、駒に合う楷書系を優先。**ライセンス条件を必ず記録**。
- `public/fonts/` に配置し `@font-face` で読み込む。見つからなければ暫定でシステム楷書。

## 8. 完了条件(Phase 0 のゴール)
- [ ] `npm run dev` で起動し、Sandbox に将棋盤・駒・持ち駒が mockup 準拠の見た目で表示される。
- [ ] 合法手だけで駒を動かせる(不正な手は弾く/持ち駒の打ちも可)。
- [ ] ライト/ダーク両テーマでトークンが効いている。
- [ ] コンソールエラーなし。ブラウザプレビューで動作確認済み。

## 9. 検証(preview ツール)
- `.claude/launch.json` に Vite サーバーを登録して preview_start → Sandbox で駒を動かして確認。
  他チャットが 8081 を使用中なら `autoPort:true` を使う(ポート固定不要)。

## 10. 次フェーズ(参考)
- Phase 1:定石データモデル + 学習モード(なぞり)で ROADMAP コース1の本線1本。
- Phase 3:yaneuraou.wasm を Web Worker で導入し逸れ手フォールバック。
