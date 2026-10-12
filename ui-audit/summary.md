# UI 監査サマリー
390x844 @2x / ライト・ダーク / 38状態 / 実行 247s。詳細は metrics.json、文言は strings.json。
基準: 文字コントラスト(出現途中の半透明文字は除外) 4.5 未満(大きい文字は 3 未満)、タップ領域 44px 未満、隣り合う操作の間隔 8px 未満、300ms 超のアニメーション。
盤の升(81個)と持ち駒は「盤」として1行にまとめて数える。

## 状態ごとの指摘(指摘のあるものだけ)
- **04 about** L: 間隔<8px:3 | D: 間隔<8px:3
- **05 settings-fresh** L: 間隔<8px:2 | D: 間隔<8px:2
- **06 strategy** L: 間隔<8px:8 | D: 間隔<8px:8
- **07 strategy-sheet** L: 間隔<8px:10 | D: 間隔<8px:10
- **14 learn-trymove** L: 間隔<8px:7 | D: 間隔<8px:7
- **37 settings** L: 間隔<8px:2 | D: 間隔<8px:2
- **38 settings-confirm** L: 間隔<8px:2 | D: 間隔<8px:2
- 指摘なし: home-first, home-due, home-nodue, chapter, chapter-exam, learn-opponent-auto, learn-your-turn, learn-wrong-1, learn-wrong-2, learn-accepted, learn-correct, learn-correct-expanded, learn-demo, learn-deviation, learn-chapter-complete, learn-sente-first-question, learn-chapter-intro, learn-all-done, home-alldone, review-question, review-hint, review-wrong-1, review-wrong-2, review-accepted, review-correct, review-end, exam-list, exam-question, exam-result-pass, exam-list-after, exam-result-fail

## 用語チェック(禁止語・算用数字の章番号)
- 違反なし

## 色の一覧(状態をまたいだ使用要素数。上位)
- light: 文字色10種 / 背景色12種 / 罫線色10種
  - text: #2a1f14×863 #2b2013×831 #f6ecd2×188 #54452f×132 #25593f×20 #a8281c×17 #8f1f15×5 #3f2c1e×4 #22385a×4 #2a1f1473×1
  - bg: #cba85e×836 #f3deaa×836 #3f2c1e×120 #efe3c6×101 #f8f0da×37 #cdbf94×29 #a8281c38×25 #e7c787×21 #22385a×19 #e6d6ad×12
  - border: #000000×3402 #7a5428×3028 #cbb987×408 #f6ecd2×152 #3f2c1e×128 #5a3d1d×84 #cdbf94×73 #a8833a×39 #a8281c×16 #22385a×4
- dark: 文字色10種 / 背景色12種 / 罫線色8種
  - text: #efe6d3×1030 #241a0d×831 #bcb09a×132 #f6ecd2×20 #6fbf95×20 #eb8a7c×17 #caa55e×8 #8f1f15×5 #efe6d373×1 #1e150d×1
  - bg: #8a6c38×836 #d9bc80×836 #2e271d×101 #1e150d×92 #3a3226×49 #4a4030×29 #bcb09a×28 #a8281c38×25 #c9a461×21 #34588f×19
  - border: #000000×3402 #4a3216×3028 #4a4030×481 #efe6d3×152 #8a7e66×128 #8a6c38×84 #caa55e×43 #eb8a7c×16

## 字の大きさ(px×テキスト数、全状態の合計)
- 10.5×4 12×378 12.5×1 13×115 14×155 14.5×1 15×283 16×83 17×30 18×91 19×13 20×28 20.55×820 22×44 32×4 40×12 48×3
- 太さ: 400×740 500×111 600×907 700×302 900×5

## 低コントラストの組み合わせ(文字色/背景色/サイズ。多い順)
- light: 0組 / 計0件
- dark: 0組 / 計0件

## 小さいタップ領域(<44px。ラベル別、全状態で1つにまとめる)
- 1種
  - 「盤:board-cell」38.8x38.8 button.cell 枠/面あり (21状態)

## 先頭ゼロの数字・数字の書き方
- 先頭ゼロの数字: なし
- 書き方(#=数字、前後1〜2字つき): #×233  1#×13  △#四歩×13  ▲#四歩×11   #×8   # /×7  6#×6  ▲#六歩×6   #手目×6  と#問×6   #章 ×4   #章×4  は#筋か×4   #/1×4  △#二香×4  △#二金×4  ▲#一飛×4  3#×3  △#八角×3  △#二飛×3   #/3×2  2#×2

## 300ms を超えるアニメーション・トランジション
- なし

## 撮れなかった状態
- なし
