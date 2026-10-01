const factory = require("@mizarjp/yaneuraou.k-p");
const { Position, parseUSIMove, formatMove } = require("tsshogi");
(async () => {
  const CAP=[]; const orig=console.log; const hook=()=>{console.log=(...a)=>CAP.push(a.join(" "));}; const unhook=()=>{console.log=orig;};
  hook(); const mod=await factory({}); unhook(); const send=c=>mod.postMessage(c);
  const w=(p,ms)=>new Promise((res,rej)=>{const t0=Date.now();const t=setInterval(()=>{const h=CAP.find(p);if(h){clearInterval(t);res(h);}else if(Date.now()-t0>ms){clearInterval(t);rej(new Error("timeout"));}},30);});
  hook(); send("usi"); await w(l=>l==="usiok",30000); send("isready"); await w(l=>l==="readyok",60000); unhook();
  const sfen=process.argv[2]; const cands=process.argv.slice(3);
  async function ev(s){ CAP.length=0; hook(); send("setoption name MultiPV value 1"); send(`position sfen ${s}`); send("go movetime 2500"); await w(l=>l.startsWith("bestmove"),50000);
    const inf=CAP.filter(l=>l.startsWith("info ")&&l.includes(" score ")&&l.includes(" pv ")).pop(); unhook();
    const t=inf.split(/\s+/); const si=t.indexOf("score"), pi=t.indexOf("pv");
    return { cp: t[si+1]==="cp"?Number(t[si+2]):(Number(t[si+2])>0?30000:-30000), pv: t.slice(pi+1,pi+7) }; }
  const fmt=(s,us)=>{const p=new Position();p.resetBySFEN(s);const o=[];for(const u of us){const q=parseUSIMove(u);if(!q)break;let mv=p.createMove(q.from,q.to);if(!mv)break;if(q.promote)mv=mv.withPromote();o.push(formatMove(p,mv));if(!p.doMove(mv))break;}return o.join(" ");};
  const base=new Position(); base.resetBySFEN(sfen);
  const me=base.color;
  const b0=await ev(sfen); console.log(`基準(この局面): ${me==="black"?"":"-"}${me==="black"?b0.cp:-b0.cp} 最善 ${fmt(sfen,b0.pv)}`);
  for (const c of cands) {
    const p=base.clone(); const q=parseUSIMove(c); if(!q){console.log(c,"不正"); continue;}
    let mv=p.createMove(q.from,q.to); if(mv&&q.promote)mv=mv.withPromote();
    if(!mv||!p.isValidMove(mv)){console.log(c,"非合法"); continue;}
    const text=formatMove(base,mv); p.doMove(mv);
    const r=await ev(p.sfen);
    const mine = -r.cp; // 相手番の評価を自分視点へ
    console.log(`${text.padEnd(9)} ${String(mine).padStart(6)}  相手最善: ${fmt(p.sfen,r.pv)}`);
  }
  process.exit(0);
})();
