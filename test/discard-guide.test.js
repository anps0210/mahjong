const {test}=require('node:test');const assert=require('node:assert/strict');
const {discardGuide}=require('../discard-guide');
function fixture(){return {started:true,turn:0,roundWind:0,wall:Array(30).fill('1万'),discards:[],players:Array.from({length:4},(_,i)=>({hand:i?[]:['1만','2만','3만','4만','5만','6만','7통','8통','9통','2삭','3삭','5통','5통','중'],drawn:i?null:'중',melds:[],score:25000}))};}
test('discard preview finds a new tenpai, ordinary yaku and unseen counts without mutating state',()=>{
 const r=fixture(),before=JSON.stringify(r),g=discardGuide(r,0),c=g.find(x=>x.tile==='중');assert.ok(c);assert.deepEqual(c.details,[{tile:'1삭',remaining:4},{tile:'4삭',remaining:4}]);assert.ok(c.yaku.totals.every(t=>t.tsumo.han>=1));assert.equal(c.yaku.afterDraw,false);assert.equal(JSON.stringify(r),before);assert.equal(discardGuide(r,0),g);
 r.discards.push({seat:1,tile:'4삭'});assert.equal(discardGuide(r,0).find(x=>x.tile==='중').details[1].remaining,3);
});
test('discard itself counts as visible and can create furiten; illegal choices excluded',()=>{
 const r=fixture();r.players[0].hand[13]='4삭';r.players[0].drawn='4삭';const c=discardGuide(r,0).find(x=>x.tile==='4삭');assert.equal(c.furiten,true);assert.equal(c.details.find(x=>x.tile==='4삭').remaining,3);
 r.players[0].banned=['4삭'];assert.ok(!discardGuide(r,0).some(x=>x.tile==='4삭'));r.turn=1;assert.deepEqual(discardGuide(r,0),[]);r.turn=0;r.players[0].riichi=true;assert.deepEqual(discardGuide(r,0),[]);
});
test('open hands receive candidates even when riichi is unavailable',()=>{
 const r=fixture();r.players[0].hand.splice(0,3);r.players[0].melds=[{type:'chi',tiles:['1만','2만','3만'],called:'1만',from:3}];assert.ok(discardGuide(r,0).some(x=>x.tile==='중'));
});
