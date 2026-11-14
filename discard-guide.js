const {waits,waitDetails,waitYakuGuide,isFuriten}=require('./scoring');
const {isSanma}=require('./rules');
const cache=new WeakMap();
// Only public information and the owner's hand enter this preview/cache.
function discardGuide(room,seat){
 const p=room.players[seat];
 if(!room.started||room.pendingCall||room.turn!==seat||p.riichi||p.hand.length!==14-3*(p.melds||[]).length)return [];
 const key=JSON.stringify([seat,room.roundWind,room.playerCount,room.mode,room.wall.length,room.discards,room.doraIndicators,room.kanCount,room.players.map(x=>[x.melds,x.nuki]),p.hand,p.banned,p.score,p.temporaryFuriten,p.riichiFuriten]);
 if(cache.get(p)?.key===key)return cache.get(p).value;
 const value=[];
 for(const tile of new Set(p.hand)){
  if(p.banned?.includes(tile))continue;
  const hand=p.hand.slice();hand.splice(hand.indexOf(tile),1);
  const player={...p,hand,drawn:null,sanma:isSanma(room)};
  if(!waits(player).length)continue;
  const preview={...room,players:room.players.map((x,i)=>i===seat?player:x),discards:[...room.discards,{seat,tile}]};
  value.push({tile,details:waitDetails(preview,seat),yaku:waitYakuGuide(preview,seat),furiten:isFuriten(preview,seat)});
 }
 cache.set(p,{key,value});return value;
}
module.exports={discardGuide};
