const { randomUUID } = require('crypto');
const { evaluateWin } = require('./scoring');
const { replacement } = require('./kongs');
function optionsFor(hand, tile, seat, from, canKan) {
  const options=[];
  const count=hand.filter(t=>t===tile).length;
  if(count>=2) options.push({type:'pon',consume:[tile,tile],banned:[tile]});
  if(count>=3 && canKan) options.push({type:'kan',consume:[tile,tile,tile],banned:[]});
  const n=Number(tile[0]), suit=tile.slice(-1);
  if(seat===(from+1)%4 && n && ['만','통','삭'].includes(suit)) {
    for(let start=n-2;start<=n;start++) {
      if(start<1 || start>7) continue;
      const consume=[start,start+1,start+2].filter(v=>v!==n).map(v=>`${v}${suit}`);
      if(!consume.every(t=>hand.includes(t))) continue;
      const banned=[tile];
      if(n===start && start+3<=9) banned.push(`${start+3}${suit}`);
      if(n===start+2 && start-1>=1) banned.push(`${start-1}${suit}`);
      options.push({type:'chi',consume,banned});
    }
  }
  return options.filter(o=>{
    if(o.type==='kan') return true;
    const remaining=hand.slice();
    o.consume.forEach(t=>remaining.splice(remaining.indexOf(t),1));
    return remaining.some(t=>!o.banned.includes(t));
  }).map((o,index)=>({...o,id:String(index)}));
}
function openWindow(room, from, tile) {

  const offers={};
  room.players.forEach((p,seat)=>{
    if(seat===from) return;
    const choices= !p.riichi && room.wall.length ? optionsFor(p.hand,tile,seat,from,(room.kanCount||0)<4 && room.deadWall.length>0) : [];
    if(evaluateWin(room,seat,{tile,from})) choices.unshift({id:"ron",type:"ron",consume:[],banned:[]});
    if(choices.length) offers[seat]=choices;
  });
  if(!Object.keys(offers).length) return null;
  return {id:randomUUID(),from,tile,index:room.discards.length-1,offers,responses:{}};
}
function winner(window) {
  return Object.entries(window.responses).filter(([,choice])=>choice!==null).map(([seat,id])=>({seat:Number(seat),option:window.offers[seat].find(o=>o.id===id)})).sort((a,b)=>
    ({ron:0,pon:1,kan:1,chi:2}[a.option.type])-({ron:0,pon:1,kan:1,chi:2}[b.option.type]) || (a.seat-window.from+4)%4-(b.seat-window.from+4)%4
  )[0] || null;
}
function applyCall(room, window, choice) {
  const {seat,option}=choice;
  const p=room.players[seat];
  option.consume.forEach(tile=>p.hand.splice(p.hand.indexOf(tile),1));
  p.melds.push({type:option.type,tiles:option.consume.concat(window.tile).sort(),called:window.tile,from:window.from});
  room.discards[window.index].calledBy=seat;
  p.banned=option.banned;
  p.drawn=null;
  p.rinshan=false;
  room.interrupted=true;
  room.players.forEach(player=>player.ippatsu=false);
  room.turn=seat;
  if(option.type==='kan') {
    replacement(room,p);
  }
}
module.exports={optionsFor,openWindow,winner,applyCall};
