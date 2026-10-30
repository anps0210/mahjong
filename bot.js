const TILES = ['만','통','삭'].flatMap(s => Array.from({length:9},(_,i)=>`${i+1}${s}`)).concat(['동','남','서','북','백','발','중']);
function countsOf(hand) {
  const counts = Array(34).fill(0);
  for (const tile of hand) counts[TILES.indexOf(tile)]++;
  return counts;
}
// Closed-hand distance to completion: standard hands, seven pairs and orphans.
function shanten(counts, openMelds = 0) {
  let best = 8;
  function visit(start, melds, pairs, partials) {
    while (start < 34 && !counts[start]) start++;
    if (start === 34) {
      best = Math.min(best, 8 - melds*2 - Math.min(partials,4-melds) - pairs);
      return;
    }
    const n = counts[start];
    if (n >= 3) { counts[start]-=3; visit(start,melds+1,pairs,partials); counts[start]+=3; }
    const suited = start < 27 && start%9 < 7;
    if (suited && counts[start+1] && counts[start+2]) {
      counts[start]--;counts[start+1]--;counts[start+2]--;
      visit(start,melds+1,pairs,partials);
      counts[start]++;counts[start+1]++;counts[start+2]++;
    }
    if (n>=2) {
      counts[start]-=2;
      if (!pairs) visit(start,melds,1,partials);
      visit(start,melds,pairs,partials+1);
      counts[start]+=2;
    }
    for (const gap of [1,2]) {
      if (start<27 && start%9+gap<9 && counts[start+gap]) {
        counts[start]--;counts[start+gap]--;
        visit(start,melds,pairs,partials+1);
        counts[start]++;counts[start+gap]++;
      }
    }
    counts[start]--; visit(start,melds,pairs,partials); counts[start]++;
  }
  visit(0,openMelds,0,0);
  if (openMelds) return best;
  const unique = counts.filter(Boolean).length;
  const pairs = counts.filter(n=>n>=2).length;
  const orphans = [0,8,9,17,18,26,27,28,29,30,31,32,33];
  return Math.min(best,6-pairs+Math.max(0,7-unique),13-orphans.filter(i=>counts[i]).length-Number(orphans.some(i=>counts[i]>=2)));
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
