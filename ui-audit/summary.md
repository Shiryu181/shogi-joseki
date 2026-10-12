# UI 監査サマリー
390x844 @2x / ライト・ダーク / 36状態 / 実行 236s。詳細は metrics.json、文言は strings.json。
基準: 文字コントラスト(出現途中の半透明文字は除外) 4.5 未満(大きい文字は 3 未満)、タップ領域 44px 未満、隣り合う操作の間隔 8px 未満、300ms 超のアニメーション。
盤の升(81個)と持ち駒は「盤」として1行にまとめて数える。

## 状態ごとの指摘(指摘のあるものだけ)
- **04 about** L: 小さい操作7(戻る/ライセンス全文(GP/ソースコード(Git) | D: 小さい操作7(戻る/ライセンス全文(GP/ソースコード(Git)
- **05 settings-fresh** L: 小さい操作1(◀ 戻る) 間隔<8px:2 | D: 小さい操作1(◀ 戻る) 間隔<8px:2
- **06 strategy** L: 間隔<8px:8 | D: 間隔<8px:8
- **07 strategy-sheet** L: 間隔<8px:10 | D: 間隔<8px:10
- **14 learn-trymove** L: 間隔<8px:7 | D: 間隔<8px:7
- **25 review-question** L: 小さい操作1(◀ 戻る) | D: 小さい操作1(◀ 戻る)
- **26 review-wrong** L: 小さい操作1(◀ 戻る) | D: 小さい操作1(◀ 戻る)
- **27 review-accepted** L: 小さい操作1(◀ 戻る) | D: 小さい操作1(◀ 戻る)
- **28 review-correct** L: 小さい操作1(◀ 戻る) | D: 小さい操作1(◀ 戻る)
- **29 review-result** L: 小さい操作1(◀ 戻る) | D: 小さい操作1(◀ 戻る)
- **31 exam-question** L: 小さい操作1(◀ やめる) | D: 小さい操作1(◀ やめる)
- **35 settings** L: 小さい操作1(◀ 戻る) 間隔<8px:2 | D: 小さい操作1(◀ 戻る) 間隔<8px:2
- **36 settings-confirm** L: 小さい操作1(◀ 戻る) 間隔<8px:2 | D: 小さい操作1(◀ 戻る) 間隔<8px:2
- 指摘なし: home-first, home-due, home-nodue, chapter, chapter-exam, learn-opponent-auto, learn-your-turn, learn-wrong-1, learn-wrong-2, learn-accepted, learn-correct, learn-correct-expanded, learn-demo, learn-deviation, learn-chapter-complete, learn-sente-first-question, learn-chapter-intro, learn-all-done, home-alldone, exam-list, exam-result-pass, exam-list-after, exam-result-fail

## 色の一覧(状態をまたいだ使用要素数。上位)
- light: 文字色14種 / 背景色13種 / 罫線色12種
  - text: #2b2013×751 #2a1f14×721 #54452f×268 #f6ecd2×129 #3f2c1e×17 #6b4f14×13 #a8281c×9 #25593f×5 #8f1f15×5 #6b4f1455×2
  - bg: #cba85e×756 #f3deaa×756 #efe3c6×101 #3f2c1e×89 #f8f0da×33 #a8281c38×25 #cdbf94×21 #e7c787×19 #22385a×15 #e9dcb2×15
  - border: #000000×3078 #7a5428×2758 #cbb987×456 #3f2c1e×108 #f6ecd2×96 #cdbf94×76 #5a3d1d×56 #a8833a×25 #a8281c×12 #6b4f14×4
- dark: 文字色13種 / 背景色13種 / 罫線色9種
  - text: #efe6d3×834 #241a0d×751 #bcb09a×268 #caa55e×21 #f6ecd2×16 #e7c892×10 #eb8a7c×9 #6fbf95×5 #8f1f15×5 #caa55e55×2
  - bg: #8a6c38×756 #d9bc80×756 #2e271d×101 #1e150d×69 #3a3226×42 #a8281c38×25 #4a4030×21 #bcb09a×20 #c9a461×19 #34588f×15
  - border: #000000×3078 #4a3216×2758 #4a4030×532 #8a7e66×108 #efe6d3×96 #8a6c38×56 #caa55e×33 #eb8a7c×12 #6fbf95×4

## 字の大きさ(px×テキスト数、全状態の合計)
- 10×99 10.5×20 11×34 11.5×8 12×260 12.5×14 13×146 13.5×37 14×125 14.5×1 15×190 16×76 17×20 18×76 19×7 20×35 20.26×196 20.55×540 22×30 26×4 30×1 32×4 42×2 48×1
- 太さ: 400×744 500×75 600×885 700×220 900×2

## 低コントラストの組み合わせ(文字色/背景色/サイズ。多い順)
- light: 0組 / 計0件
- dark: 0組 / 計0件

## 小さいタップ領域(<44px。ラベル別、全状態で1つにまとめる)
- 10種
  - 「盤:board-cell」38.8x38.8 button.cell 枠/面あり (19状態)
  - 「◀ 戻る」47.3x32 button.back **枠も面も無い** (8状態)
  - 「盤:hand-piece」34x36 button.handpiece **枠も面も無い** (2状態)
  - 「戻る」34x34 button.back 枠/面あり (1状態)
  - 「ライセンス全文(GPL-3.0)」142.8x13 a **枠も面も無い** (1状態)
  - 「ソースコード(GitHub)」125.4x13 a **枠も面も無い** (1状態)
  - 「ソースコード(WebAssembly」186.9x13 a **枠も面も無い** (1状態)
  - 「ソースコード(本体)」107.5x13 a **枠も面も無い** (1状態)
  - 「ライセンス全文」86.3x13 a **枠も面も無い** (1状態)
  - 「◀ やめる」60.3x32 button.back **枠も面も無い** (1状態)

## 先頭ゼロの数字・数字の書き方
- 先頭ゼロの数字: なし
- 書き方(#=数字、前後1〜2字つき): #×202  1#×17  ▲#四歩×10  2#×9  [全角]☖#四歩×8  ▲#六歩×7  △#四歩×7  6#×6   #手目×6  と#問×6   #章 ×4   #章×4  3#×4  は#筋か×4   #/1×4  ▲#一飛×4  △#二香×3  [全角]☖#二飛×3   #/3×2  −#)×2  ▲#五歩×2  △#二金×2

## 300ms を超えるアニメーション・トランジション
- animation span.points-pop points-rise 1100ms ×1 (3状態)

## 撮れなかった状態
- なし
