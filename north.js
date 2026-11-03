const {isSanma}=require('./rules');
const {drawReplacement}=require('./kongs');
function canExtract(room,seat){
 const p=room.players[seat];
 return Boolean(isSanma(room)&&room.started&&!room.pendingCall&&room.turn===seat&&p?.drawn&&room.wall.length&&
  p.hand.length===14-3*(p.melds?.length||0)&&p.hand.includes('북')&&(!p.riichi||p.drawn==='북'));
}
function apply(room,seat){
 const p=room.players[seat];
 p.hand.splice(p.hand.indexOf('북'),1);
 p.nuki=(p.nuki||0)+1;
 p.banned=[];
 room.interrupted=true;
 room.players.forEach(p=>p.ippatsu=false);
 drawReplacement(room,p);
 // Kita is a bonus draw, not a kan: no kan dora or rinshan yaku.
 p.rinshan=false;p.nukiDraw=true;
}
module.exports={canExtract,apply};
