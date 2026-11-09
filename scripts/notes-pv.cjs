// 局面ごとにネイティブのエンジンで MultiPV 5・500万ノードを読み、上位5手と読み筋(8手)を出す(解説の直しで理由を確かめる用。読むだけ)。
// 使い方: node scripts/notes-pv.cjs cases.json out.json   cases: [{id, sfen, move}]
// sente は先手から見た評価値。エンジンは1つだけ動かす。3位以下は探索の深さが浅いことがあり、順位と値は目安。
process.env.ENGINE="native";
const fs=require("fs");
const { Position, parseUSIMove, formatMove } = require("tsshogi");
const { createUsi } = require("./lib/usi-engine.cjs");
(async()=>{
  const cases=JSON.parse(fs.readFileSync(process.argv[2]));
  const eng=await createUsi(); let waiter=null; eng.setHandler(l=>{if(waiter)waiter(l)});
  const wait=(pred)=>new Promise(res=>{waiter=l=>{if(pred(l)){waiter=null;res(l)}}});
  let p=wait(l=>l==="usiok"); eng.send("usi"); await p;
  for(const c of eng.initOptions())eng.send(c);
  p=wait(l=>l==="readyok"); eng.send("isready"); await p;
  const out=[];
  for(const c of cases){
    const best={};
    eng.send("usinewgame"); eng.send("setoption name MultiPV value 5"); eng.send(`position sfen ${c.sfen}`);
    const done=new Promise(res=>{waiter=l=>{
      if(l.startsWith("info ")&&l.includes(" pv ")&&l.includes(" score ")){const t=l.split(/\s+/);const mi=t.indexOf("multipv"),si=t.indexOf("score"),pi=t.indexOf("pv"),di=t.indexOf("depth");
        const cp=t[si+1]==="cp"?Number(t[si+2]):(Number(t[si+2])>0?30000:-30000);best[t[mi+1]]={cp,pv:t.slice(pi+1,pi+9),d:t[di+1]};}
      if(l.startsWith("bestmove")){waiter=null;res();}}});
    eng.send("go nodes 5000000"); await done;
    const base=new Position(); base.resetBySFEN(c.sfen); const me=base.color;
    const fmt=(us)=>{const q=base.clone();const o=[];for(const u of us){const x=parseUSIMove(u);if(!x)break;let m=q.createMove(x.from,x.to);if(!m)break;if(x.promote)m=m.withPromote();o.push(formatMove(q,m));if(!q.doMove(m))break;}return o.join(" ");};
    const res=Object.keys(best).sort((a,b)=>a-b).map(k=>({rank:k,usi:best[k].pv[0],sente:me==="black"?best[k].cp:-best[k].cp,d:best[k].d,pv:fmt(best[k].pv)}));
    out.push({id:c.id,move:c.move,res}); console.error("done",c.id);
    fs.writeFileSync(process.argv[3],JSON.stringify(out,null,1));
  }
  eng.close(); setTimeout(()=>process.exit(0),700);
})();
