/**
 * 1局面ごとに探索の記憶(置換表)を消して、同じ局面を測り直したら同じ結果になるようにする部品。
 * 理由: usinewgame を送るだけでは やねうら王 は置換表を消さず、前の局面の探索が次の測定に混ざる
 * (2026-11-10 の試しで、同じ局面を測り直すと最善の順位が入れ替わった)。
 * 方法: USI_Hash を一度変えて isready を送ると置換表が作り直されて空になる。続けて元の値に戻して isready。
 * 使い方: await clearSearchMemory(eng, wait)   eng は createUsi() の返り値、wait(pred) は述語に合う行を待つ Promise を返す関数。
 */
async function clearSearchMemory(eng, wait) {
  const hash = Number(process.env.YO_HASH || 256);
  for (const mb of [hash + 1, hash]) {
    eng.send(`setoption name USI_Hash value ${mb}`);
    const p = wait((l) => l === "readyok");
    eng.send("isready");
    await p;
  }
  eng.send("usinewgame");
}
module.exports = { clearSearchMemory };
