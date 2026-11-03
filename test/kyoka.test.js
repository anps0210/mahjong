const {test}=require('node:test');const assert=require('node:assert/strict');
const {evaluateWin,settleWins}=require('../scoring');
function fixture(suit='삭'){
 const other=suit==='삭'?'통':'삭';
 const players=Array.from({length:3},()=>({hand:[],melds:[],score:35000,sanma:true}));
 players[1].hand=[4,5,6,7,8,9].map(n=>n+other).concat([1,2,5,5].map(n=>n+suit));
 players[1].melds=[{type:'pon',tiles:['1만','1만','1만'],called:'1만',from:0}];
 const discards=[4,4,4,4,6,6,6,8,8,8].map(n=>({seat:1,tile:n+suit}));
 return {room:{playerCount:3,players,wall:['중'],discards,doraIndicators:[],uraIndicators:[],kanCount:0,interrupted:true,started:true},ctx:{tile:'3'+suit,from:2}};
}
for(const suit of ['삭','통'])test(`경화수월: ten own ${suit} discards and same-suit ron supplies a yakuman without other yaku`,()=>{
 const {room,ctx}=fixture(suit);const r=evaluateWin(room,1,ctx);
 assert.equal(r.yakuman,1);assert.equal(r.points,32000);assert.equal(r.special.discardedSuit,suit);
 assert.equal(r.special.apparentSuit,suit==='삭'?'통수':'삭수');assert.deepEqual(r.yaku.map(y=>y.name),['경화수월']);
 assert.equal(settleWins(room,[1],ctx),true);assert.ok(room.result.id);assert.equal(room.result.scores.reduce((a,b)=>a+b),105000);
});
test('nine discards, other players’ discards, wrong suit, and four-player play cannot qualify',()=>{
 for(const mode of ['nine','other','wrong','four']){
  const {room,ctx}=fixture();
  if(mode==='nine')room.discards.pop();if(mode==='other')room.discards[0].seat=0;
  if(mode==='wrong')room.discards.forEach(d=>d.tile=d.tile.replace('삭','통'));
  if(mode==='four'){room.playerCount=4;room.players.push({hand:[],melds:[],score:25000});}
  assert.equal(evaluateWin(room,1,ctx),null,mode);
 }
});
test('tsumo and furiten cannot activate the ron-only yakuman',()=>{
 const {room,ctx}=fixture();room.players[1].hand.push(ctx.tile);room.players[1].drawn=ctx.tile;
 const tsumo=evaluateWin(room,1,{tile:ctx.tile});assert.ok(!tsumo?.special);
 room.players[1].hand.pop();room.players[1].drawn=null;
 room.discards.push({seat:1,tile:ctx.tile});assert.equal(evaluateWin(room,1,ctx),null);
 room.discards.pop();room.players[1].temporaryFuriten=true;assert.equal(evaluateWin(room,1,ctx),null);
});
test('called-away discards still count and dealer receives 48000',()=>{
 const {room,ctx}=fixture();room.players[0]=room.players[1];room.players[1]={hand:[],melds:[],score:35000};
 room.discards.forEach(d=>{d.seat=0;d.calledBy=2});room.players[0].melds[0].from=1;
 assert.equal(evaluateWin(room,0,ctx).points,48000);
});
