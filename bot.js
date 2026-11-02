const TILES = ['만','통','삭'].flatMap(s => Array.from({length:9},(_,i)=>`${i+1}${s}`)).concat(['동','남','서','북','백','발','중']);
function countsOf(hand) {
  const counts = Array(34).fill(0);
  for (const tile of hand) counts[TILES.indexOf(tile)]++;
  return counts;
}
// Closed-hand distance to completion: standard hands, seven pairs and orphans.
const Majiang = require('@kobalab/majiang-core');
const shantenCache = new Map();
function shanten(counts, openMelds = 0) {
  const key = openMelds + ':' + counts.join('');
  if (shantenCache.has(key)) return shantenCache.get(key);
  const hand = [];
  counts.forEach((n,i)=>{ for(let k=0;k<n;k++) hand.push(i<27?'mps'[Math.floor(i/9)]+(i%9+1):'z'+(i-26)); });
  const shape = new Majiang.Shoupai(hand);
  // The pinned core's xiangting uses only _fulou.length, not meld tile identities.
  // These placeholders represent the already-completed groups outside counts.
  shape._fulou = Array(openMelds).fill('z111+');
  const result = Majiang.Util.xiangting(shape);
  if(shantenCache.size>=20000) shantenCache.clear();
  shantenCache.set(key,result);
  return result;
}

function chooseDiscard(hand, discards = []) {
  if (!hand.length) throw new Error('Bot hand is empty');
  const counts = countsOf(hand);
  const visible = countsOf(hand.concat(discards.map(d=>d.tile)));
  const candidates = [];
  for (let i=0;i<34;i++) if(counts[i]) {
    counts[i]--;const distance=shanten(counts);counts[i]++;
    candidates.push({i,distance});
  }
  const minimum=Math.min(...candidates.map(c=>c.distance));
  let best;
  for(const candidate of candidates.filter(c=>c.distance===minimum)) {
    const {i}=candidate;
    counts[i]--;
    let outs=0;
    for(let draw=0;draw<34;draw++) if(visible[draw]<4) {
      counts[draw]++;
      if(shanten(counts)<minimum) outs+=4-visible[draw];
      counts[draw]--;
    }
    counts[i]++;
    // On equal efficiency, release isolated honors/edge tiles before central tiles.
    const edge=i>=27?5:Math.abs(i%9-4);
    if(!best || outs>best.outs || (outs===best.outs && edge>best.edge)) best={i,outs,edge};
  }
  return TILES[best.i];
}
module.exports={chooseDiscard,shanten,countsOf,TILES};
