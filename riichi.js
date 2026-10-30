const {shanten,countsOf,TILES}=require('./bot');
function riichiDiscards(room,seat){
 const p=room.players[seat];
 if(!room.started || room.pendingCall || room.turn!==seat || p.riichi || p.melds?.length || p.hand.length!==14 || (p.score??25000)<1000 || room.wall.length<4) return [];
 const counts=countsOf(p.hand), choices=[];
 for(let i=0;i<34;i++)if(counts[i]){
  counts[i]--;
  if(shanten(counts)===0){
   // A nominal shape requiring a fifth copy is not a legal wait.
   const hasWait=TILES.some((_,j)=>{
    if(counts[j]>=4)return false;
    counts[j]++;const complete=shanten(counts)===-1;counts[j]--;return complete;
   });
   if(hasWait) choices.push(TILES[i]);
  }
  counts[i]++;
 }
 return choices;
}
function declareRiichi(room,seat,tile){
 if(!riichiDiscards(room,seat).includes(tile))return false;
 const p=room.players[seat];
 p.riichi=true;p.score-=1000;room.riichiPot=(room.riichiPot||0)+1;
 return true;
}
function handShanten(p){
 if(!p.hand.length)return null;
 return shanten(countsOf(p.hand),p.melds?.length||0);
}
module.exports={riichiDiscards,declareRiichi,handShanten};
