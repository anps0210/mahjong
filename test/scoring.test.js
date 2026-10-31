const {test}=require('node:test');const assert=require('node:assert/strict');
const {evaluateWin,settleWins,isFuriten,endDraw,waits}=require('../scoring');
const {TILES}=require('../bot');
function tiles(s){const a=[];for(const group of s.match(/[mpsz]\d+/g)||[]){const suit=group[0];for(const n of group.slice(1))a.push(TILES[suit==='z'?26+Number(n):'mps'.indexOf(suit)*9+Number(n)-1]);}return a;}
function fixture(str,opts={}){
 const seat=opts.seat??1;const win=tiles(opts.win||str.slice(-2))[0]||tiles(str).at(-1);
 const hand=tiles(str);if(!opts.tsumo)hand.splice(hand.lastIndexOf(win),1);else {hand.splice(hand.lastIndexOf(win),1);hand.push(win)}
 const players=Array.from({length:4},()=>({hand:[],melds:[],score:25000}));
 players[seat]={hand,melds:(opts.melds||[]).map(m=>({...m,tiles:tiles(m.tiles),called:tiles(m.called)[0]})),score:opts.score??25000,drawn:opts.tsumo?win:null,riichi:!!opts.riichi,doubleRiichi:!!opts.double,ippatsu:!!opts.ippatsu,rinshan:!!opts.rinshan};
 const room={players,started:true,turn:seat,wall:opts.last?[]:Array(20).fill('1만'),discards:opts.discards||[],interrupted:opts.first?false:true,kanCount:opts.kanCount||0,riichiPot:opts.pot||0,roundWind:opts.roundWind||0,doraIndicators:tiles(opts.dora||''),uraIndicators:tiles(opts.ura||'')};
 const ctx={tile:win,from:opts.tsumo?null:opts.from??0,robKan:!!opts.robKan,robAnkan:!!opts.robAnkan};
 return {room,seat,ctx};
}
const cases=[
 ['리치','m123456p55789s234',{win:'s4',riichi:true}],
 ['더블리치','m123456p55789s234',{win:'s4',riichi:true,double:true}],
 ['일발','m123456p55789s234',{win:'s4',riichi:true,ippatsu:true}],
 ['멘젠쯔모','m123456p55789s234',{win:'s4',tsumo:true}],
 ['핑후','m123456p55789s234',{win:'s4'}],
 ['탕야오','m234678p34566s234',{win:'s4'}],
 ['이페코','m123123p45677s789',{win:'s9'}],
 ['삼색동순','m123789p12355s123',{win:'m9'}],
 ['일기통관','m123456789p234s55',{win:'p4'}],
 ['찬타','m123789p111s99z555',{win:'m3'}],
 ['치또이츠','m1122p3344s5566z11',{win:'z1'}],
 ['또이또이','m111333p555s777z22',{win:'m3'}],
 ['삼암각','m111333p555s777z22',{win:'m3'}],
 ['삼색동각','m222678p22255s222',{win:'m8'}],
 ['혼노두','m111999p111z22255',{win:'m9'}],
 ['소삼원','m123p444z55666777',{win:'m3'}],
 ['혼일색','m123456789z11122',{win:'m9'}],
 ['준찬타','m123789p111s78999',{win:'m3'}],
 ['량페코','m112233p445566s77',{win:'s7'}],
 ['청일색','m12345678922555',{win:'m9'}],
 ['역패 백','m123456p55s789z555',{win:'m3'}],
 ['역패 발','m123456p55s789z666',{win:'m3'}],
 ['역패 중','m123456p55s789z777',{win:'m3'}],
 ['장풍 동','m123456p55s789z111',{win:'m3'}],
 ['자풍 남','m123456p55s789z222',{win:'m3'}],
 ['해저로월','m123456p55789s234',{win:'s4',tsumo:true,last:true}],
 ['하저로어','m123456p55789s234',{win:'s4',last:true}],
 ['영상개화','m123456p55789s234',{win:'s4',tsumo:true,rinshan:true,last:true}],
 ['창깡','m123456p55789s234',{win:'s4',robKan:true}],
 ['천화','m123456p55789s234',{win:'s4',tsumo:true,first:true,seat:0}],
 ['지화','m123456p55789s234',{win:'s4',tsumo:true,first:true}],
 ['국사무쌍','m119p19s19z1234567',{win:'m9'}],
 ['국사무쌍 13면대기','m119p19s19z1234567',{win:'m1'}],
 ['사암각','m111333p555s777z22',{win:'m3',tsumo:true}],
 ['사암각 단기','m111333p555s777z22',{win:'z2'}],
 ['대삼원','m123p55z555666777',{win:'m3'}],
 ['소사희','m111z11222333444',{win:'m1'}],
 ['대사희','m11z111222333444',{win:'z1'}],
 ['자일색','z11122233355566',{win:'z1'}],
 ['녹일색','s22233344466688',{win:'s2'}],
 ['청노두','m111999p11199s999',{win:'m1'}],
 ['구련보등','m11123456789995',{win:'m1'}],
 ['순정구련보등','m11123456789995',{win:'m5'}],
 ['삼깡즈','m456z55',{win:'m6',melds:[{type:'kan',tiles:'m2222',called:'m2',from:0},{type:'kan',tiles:'p3333',called:'p3',from:2},{type:'kan',tiles:'s4444',called:'s4',from:3}]}],
 ['사깡즈','z66',{win:'z6',melds:[{type:'kan',tiles:'m2222',called:'m2',from:0},{type:'kan',tiles:'p3333',called:'p3',from:2},{type:'ankan',tiles:'s4444',called:'s4',from:1},{type:'kan',tiles:'z5555',called:'z5',from:3}]}]
];
for(const [name,str,opts] of cases)test('standard yaku: '+name,()=>{const {room,seat,ctx}=fixture(str,opts);const r=evaluateWin(room,seat,ctx);assert.ok(r?.yaku.some(y=>y.name===name),JSON.stringify(r));});
test('pinfu tsumo is 20 fu, closed ron is 30 fu, chiitoitsu is 25 fu',()=>{
 for(const [str,opts,fu] of [['m123456p55789s234',{win:'s4',tsumo:true},20],['m123456p55789s234',{win:'s4'},30],['m1122p3344s5566z11',{win:'z1'},25]]){const f=fixture(str,opts);assert.equal(evaluateWin(f.room,f.seat,f.ctx).fu,fu);}
});
test('dora alone does not allow ron; open tanyao and reduced open sanshoku work',()=>{
 const f=fixture('m456p789s11234',{win:'s4',dora:'s3',melds:[{type:'chi',tiles:'m123',called:'m1',from:0}]});assert.equal(evaluateWin(f.room,f.seat,f.ctx),null);
 const o=fixture('m678p34566s234',{win:'s4',melds:[{type:'chi',tiles:'m234',called:'m2',from:0}]});assert.ok(evaluateWin(o.room,o.seat,o.ctx).yaku.some(y=>y.name==='탕야오'));
 const s=fixture('m789p12355s123',{win:'m9',melds:[{type:'chi',tiles:'m123',called:'m1',from:0}]});assert.equal(evaluateWin(s.room,s.seat,s.ctx).yaku.find(y=>y.name==='삼색동순').han,1);
});
test('dora/ura are bonuses; ura requires riichi, rinshan does not combine with haitei',()=>{
 for(const riichi of [false,true]){const f=fixture('m123456p55789s234',{win:'s4',tsumo:true,riichi,dora:'p4',ura:'m9'});const r=evaluateWin(f.room,f.seat,f.ctx);assert.equal(r.yaku.find(y=>y.name==='도라').han,2);assert.equal(r.yaku.some(y=>y.name==='우라도라'),riichi);}
 const f=fixture('m123456p55789s234',{win:'s4',tsumo:true,rinshan:true,last:true});assert.ok(!evaluateWin(f.room,f.seat,f.ctx).yaku.some(y=>y.name==='해저로월'));
});
test('discard furiten blocks every wait, temporary/riichi furiten block ron, tsumo still allowed',()=>{
 const f=fixture('m123456p55789s234',{win:'s4',riichi:true});f.room.discards=[{seat:1,tile:'1삭'}];assert.ok(waits(f.room.players[1]).includes('1삭'));assert.equal(isFuriten(f.room,1),true);assert.equal(evaluateWin(f.room,1,f.ctx),null);
 for(const flag of ['temporaryFuriten','riichiFuriten']){const a=fixture('m123456p55789s234',{win:'s4',riichi:true});a.room.players[1][flag]=true;assert.equal(evaluateWin(a.room,1,a.ctx),null);a.room.players[1].hand.push(a.ctx.tile);a.room.players[1].drawn=a.ctx.tile;assert.ok(evaluateWin(a.room,1,{tile:a.ctx.tile}));}
});
test('settlement conserves player points plus deposits and rejects an invalid win',()=>{
 const f=fixture('m123456p55789s234',{win:'s4',riichi:true,pot:2});assert.equal(settleWins(f.room,[1],f.ctx),true);assert.equal(f.room.players.reduce((a,p)=>a+p.score,0),102000);assert.equal(f.room.started,false);assert.equal(f.room.riichiPot,0);assert.ok(f.room.result.winners[0].points>0);
 const bad=fixture('m123456p55789s235',{win:'s5'});assert.equal(settleWins(bad.room,[1],bad.ctx),false);assert.equal(bad.room.players[1].score,25000);
});
test('nagashi mangan and tenpai draw settlement',()=>{
 const f=fixture('m123456p55789s234',{win:'s4'});f.room.discards=[{seat:0,tile:'1만'},{seat:1,tile:'3만'},{seat:2,tile:'4만'},{seat:3,tile:'6만'}];endDraw(f.room);assert.deepEqual(f.room.result.nagashi,[0]);assert.deepEqual(f.room.result.deltas,[12000,-4000,-4000,-4000]);
 const g=fixture('m123456p55789s234',{win:'s4'});g.room.discards=[{seat:0,tile:'4만'}];endDraw(g.room);assert.deepEqual(g.room.result.deltas,[-1000,3000,-1000,-1000]);
});
module.exports={fixture,tiles};
test('pao splits daisangen ron between discarder and liable third-dragon caller',()=>{
 const f=fixture('m123p55',{win:'p5',from:0,melds:[{type:'pon',tiles:'z555',called:'z5',from:2},{type:'pon',tiles:'z666',called:'z6',from:2},{type:'pon',tiles:'z777',called:'z7',from:3}]});
 assert.deepEqual(evaluateWin(f.room,f.seat,f.ctx).deltas,[-16000,32000,0,-16000]);
});
test('only kokushi may rob a concealed kan; riichi declaration deposit is refunded on ron',()=>{
 const ordinary=fixture('m123456p55789s234',{win:'s4',robKan:true,robAnkan:true});assert.equal(evaluateWin(ordinary.room,ordinary.seat,ordinary.ctx),null);
 const kokushi=fixture('m119p19s19z1234567',{win:'m9',robKan:true,robAnkan:true});assert.ok(evaluateWin(kokushi.room,kokushi.seat,kokushi.ctx));
 const f=fixture('m123456p55789s234',{win:'s4',pot:1});f.room.players[0].score=24000;f.room.players[0].riichi=true;f.room.discards=[{seat:0,tile:'4삭',riichi:true}];
 assert.ok(settleWins(f.room,[1],f.ctx));assert.equal(f.room.result.pot,0);assert.equal(f.room.players.reduce((n,p)=>n+p.score,0),100000);assert.equal(f.room.players[0].riichi,false);
});
