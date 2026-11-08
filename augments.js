const {randomUUID,randomInt}=require('crypto');
const CARDS=['A','P'].flatMap(prefix=>Array.from({length:100},(_,i)=>({id:prefix+String(i+1).padStart(3,'0'),type:prefix==='A'?'active':'passive',description:'카드 설명'})));
const BY_ID=new Map(CARDS.map(c=>[c.id,c]));
function enabled(room){return room.mode==='augment'&&room.playerCount===4;}
function draw(room,player){if(enabled(room))player.augmentDraws=(player.augmentDraws||0)+1;}
function begin(room,stage){
 const draft={id:randomUUID(),stage,offers:[],chosen:{}};
 room.players.forEach((p,seat)=>{
  const pool=CARDS.filter(c=>!p.augments.includes(c.id)).map(c=>c.id);
  draft.offers[seat]=Array.from({length:3},()=>pool.splice(randomInt(pool.length),1)[0]);
  if(p.bot){const id=draft.offers[seat][randomInt(3)];draft.chosen[seat]=id;p.augments.push(id);}
 });
 room.augmentDraft=draft;
}
function init(room){
 room.augmentDraft=null;room.augmentStage=0;
 room.players.forEach(p=>{p.augments=[];p.augmentDraws=0;});
}
function maybeOpen(room){
 if(!enabled(room)||!room.started||room.pendingCall||room.augmentDraft)return;
 const stage=[0,6,12][room.augmentStage];
 if(stage!==undefined&&room.players.every(p=>p.augmentDraws>=stage)){room.augmentStage++;begin(room,stage);}
}
function choose(room,seat,id,card){
 const d=room.augmentDraft;
 if(!room.started||!d||d.id!==id||!d.offers[seat]||Object.hasOwn(d.chosen,seat)||!d.offers[seat].includes(card))return false;
 d.chosen[seat]=card;room.players[seat].augments.push(card);
 if(room.players.every((_,i)=>Object.hasOwn(d.chosen,i)))room.augmentDraft=null;
 return true;
}
function privateView(room,seat){
 const d=room.augmentDraft;
 return {cards:(room.players[seat].augments||[]).map(id=>BY_ID.get(id)),draws:room.players[seat].augmentDraws||0,draft:room.started&&d?{id:d.id,stage:d.stage,chosen:d.chosen[seat]||null,offers:d.offers[seat].map(id=>BY_ID.get(id))}:null};
}
function publicView(room){const d=room.started&&room.augmentDraft;return d?{stage:d.stage,selected:room.players.map((_,i)=>Object.hasOwn(d.chosen,i))}:null;}
module.exports={CARDS,enabled,draw,init,maybeOpen,choose,privateView,publicView};
