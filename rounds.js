const {randomUUID}=require('crypto');
const {playerCount,initialScore}=require('./rules');
function label(room){return `${['동','남','서','북'][room.roundWind||0]}${room.handNumber||1}국 ${room.honba||0}본장`;}
function finish(room){
 if(room.started||!room.result||!room.matchActive||room.result.round)return;
 const r=room.result,n=playerCount(room);
 const winners=r.type==='win'?r.winners.map(w=>w.seat):(r.nagashi||[]);
 const win=winners.length>0;
 const repeat=win?winners.includes(0):r.reason!=='패산 소진'||(r.tenpai||[]).includes(0);
 const next={roundWind:room.roundWind||0,handNumber:room.handNumber||1,honba:win?(repeat?(room.honba||0)+1:0):(room.honba||0)+1,rotate:!repeat};
 if(!repeat&&++next.handNumber>n){next.handNumber=1;next.roundWind++;}
 r.id ||= randomUUID();
 r.round=label(room);r.repeat=repeat;
 const bankrupt=room.players.some(p=>p.score<0),ended=bankrupt||next.roundWind>=1;
 if(ended){
  room.matchActive=false;room.matchEnded=true;room.nextRound=null;
  // Award any unclaimed riichi deposits to the leader; initial seat breaks ties.
  const ranked=room.players.map((p,seat)=>({p,seat})).sort((a,b)=>b.p.score-a.p.score||a.p.matchOrder-b.p.matchOrder);
  const award=(room.riichiPot||0)*1000;
  if(award){const top=ranked[0];top.p.score+=award;r.deltas[top.seat]+=award;r.scores[top.seat]+=award;r.finalPot=award;room.riichiPot=0;}
  r.matchEnded=true;r.endReason=bankrupt?'토비 (0점 미만)':'동풍전 종료';
  r.ranking=ranked.map(({p},i)=>({rank:i+1,name:p.name,score:p.score}));
 }else{room.nextRound=next;r.nextRound=label(next);}
 const rows=room.players.map((p,seat)=>({seat,name:p.name,order:p.matchOrder??seat,before:r.scores[seat]-r.deltas[seat],score:r.scores[seat],delta:r.deltas[seat]}));
 const before=[...rows].sort((a,b)=>b.before-a.before||a.order-b.order);
 r.standings=[...rows].sort((a,b)=>b.score-a.score||a.order-b.order).map((p,i)=>({...p,rank:i+1,previousRank:before.findIndex(x=>x.seat===p.seat)+1}));
}

function prepare(room){
 if(room.matchActive&&room.nextRound){const next=room.nextRound;if(next.rotate)room.players.push(room.players.shift());Object.assign(room,{roundWind:next.roundWind,handNumber:next.handNumber,honba:next.honba,nextRound:null});}
 else{room.roundWind=0;room.handNumber=1;room.honba=0;room.riichiPot=0;room.matchActive=true;room.matchEnded=false;room.nextRound=null;room.players.forEach((p,i)=>{p.score=initialScore(room);p.matchOrder=i;});}
}
module.exports={finish,prepare,label};
