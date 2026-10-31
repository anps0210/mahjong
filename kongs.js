const {waits}=require('./scoring');
function options(room,seat){
 const p=room.players[seat];
 if(!room.started||room.pendingCall||room.turn!==seat||!p.drawn||!room.wall.length||room.kanCount>=4)return [];
 const out=[];
 for(const tile of new Set(p.hand)){
  if(p.hand.filter(t=>t===tile).length===4){
   if(p.riichi){
    if(tile!==p.drawn)continue;
    const before={...p,hand:p.hand.slice(0,-1)};
    const after={...p,hand:p.hand.filter(t=>t!==tile),melds:p.melds.concat({type:'ankan',tiles:Array(4).fill(tile)})};
    if(JSON.stringify(waits(before))!==JSON.stringify(waits(after)))continue;
   }
   out.push({id:'ankan:'+tile,type:'ankan',tile});
  }
  if(!p.riichi && p.melds.some(m=>m.type==='pon'&&m.tiles[0]===tile))out.push({id:'kakan:'+tile,type:'kakan',tile});
 }
 return out;
}
function replacement(room,p){p.drawn=room.deadWall.shift();p.hand.push(p.drawn);room.deadWall.push(room.wall.pop());room.kanCount++;p.rinshan=true;p.temporaryFuriten=false;}
function apply(room,seat,option){
 const p=room.players[seat];
 if(option.type==='ankan'){
  p.hand=p.hand.filter(t=>t!==option.tile);p.melds.push({type:'ankan',tiles:Array(4).fill(option.tile),from:seat,called:option.tile});
 }else{
  p.hand.splice(p.hand.indexOf(option.tile),1);const m=p.melds.find(m=>m.type==='pon'&&m.tiles[0]===option.tile);m.type='kakan';m.tiles.push(option.tile);
 }
 p.banned=[];room.interrupted=true;room.players.forEach(p=>p.ippatsu=false);replacement(room,p);
}
module.exports={options,apply,replacement};
