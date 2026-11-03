const {test}=require('node:test');
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createGameServer}=require('../server');
const {TILES}=require('../bot');
const {allowedTile}=require('../rules');
const north=require('../north');
const kongs=require('../kongs');
const {openWindow}=require('../calls');
const {evaluateWin,settleWins,endDraw,waitDetails,waits,waitYakuGuide}=require('../scoring');
const {riichiDiscards}=require('../riichi');
const tiles=s=>[...s.matchAll(/([mpsz])(\d+)/g)].flatMap(([,s,ns])=>[...ns].map(n=>TILES[s==='z'?26+Number(n):'mps'.indexOf(s)*9+Number(n)-1]));
function fixture(str='p123456789s23455',seat=1,tsumo=true){
 const hand=tiles(str),tile=hand.at(-1);if(!tsumo)hand.pop();
 const players=Array.from({length:3},()=>({hand:[],melds:[],score:35000,connected:true,sanma:true,nuki:0}));
 Object.assign(players[seat],{hand,drawn:tsumo?tile:null});
 return {room:{playerCount:3,players,started:true,turn:seat,wall:Array(20).fill('1통'),deadWall:tiles('p1234p56789s12345'),discards:[],interrupted:true,kanCount:0,doraIndicators:[],uraIndicators:[]},seat,ctx:{tile,from:tsumo?null:0}};
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<400;i++){if(fn())return;await pause(10)}throw Error('state timeout')}
const call=(s,e,d)=>new Promise((resolve,reject)=>{const cb=(err,r)=>err?reject(err):resolve(r);if(d===undefined)s.timeout(3000).emit(e,cb);else s.timeout(3000).emit(e,d,cb)});
function deck(hands=[],draw='北'){
 const stock=TILES.filter(t=>allowedTile(t,true)).flatMap(t=>Array(4).fill(t));
 const take=t=>{const i=stock.indexOf(t);assert.ok(i>=0,t);return stock.splice(i,1)[0]};
 const hs=[0,1,2].map(i=>tiles(hands[i]||''));hs.flat().forEach(take);
 draw=draw==='北'?'북':draw;take(draw);
 for(const h of hs)while(h.length<13)h.push(stock.shift());
 return [...stock.splice(0,14),...hs.flat(),...stock,draw];
}
async function setup(t,{dealWall,bots=false}={}){
 const game=createGameServer({dealWall,botDelayMs:20});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
 const sockets=[],sessions=[],url=`http://127.0.0.1:${game.server.address().port}`;
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await game.close()});
 async function connect(){const s=io(url,{reconnection:false});sockets.push(s);s.on('game:private',v=>s.state=v);s.on('room:update',v=>s.room=v);await until(()=>s.connected);return s;}
 const p=[];p.push(await connect());sessions.push(await call(p[0],'room:create',{playerCount:3}));
 if(bots)await call(p[0],'room:bots',{fill:true});
 else for(let i=1;i<3;i++){p.push(await connect());sessions.push(await call(p[i],'room:join',{code:sessions[0].code}));}
 return {p,sessions,connect,url};
}
async function skip(p){for(const s of p){const c=s.state.call;if(c?.options.length&&!c.answered)await call(s,'game:call',{id:c.id,choice:null});}}
test('sanma creates a 108-tile wall, reserves 14, seats only three and wraps turns',async t=>{
 const {p,connect}=await setup(t);const extra=await connect();
 assert.equal((await call(extra,'room:join',{code:p[0].room.code})).ok,false);
 assert.equal((await call(p[0],'game:start')).ok,true);await until(()=>p.every(s=>s.state.hand.length>=13));
 assert.equal(p[0].room.wallCount,54);assert.equal(p[0].room.players.length,3);
 assert.ok(p[0].room.players.every(p=>p.score===35000));
 assert.ok(p.flatMap(s=>s.state.hand).every(t=>allowedTile(t,true)));
 for(let seat=0;seat<3;seat++){
  await until(()=>p.every(s=>s.state.turn===seat&&!s.state.waiting));await call(p[seat],'game:discard',{tile:p[seat].state.drawn});
  await until(()=>p.every(s=>s.state.discards.length===seat+1));await skip(p);
  await until(()=>p[0].state.turn===(seat+1)%3&&!p[0].state.waiting);
 }
 assert.equal(p[0].state.hand.length,14);
});
test('north extraction is public, preserves hand size and reconnect snapshot, and rejects wrong turn',async t=>{
 const {p,sessions,connect}=await setup(t,{dealWall:()=>deck()});await call(p[0],'game:start');await until(()=>p[0].state.canNuki);
 const before=p[0].state.wallCount,dora=p[0].room.doraIndicators;
 assert.equal((await call(p[1],'game:nuki')).ok,false);
 assert.equal((await call(p[0],'game:nuki')).ok,true);await until(()=>p.every(s=>s.state.nuki[0]===1));
 assert.equal(p[0].state.hand.length,14);assert.equal(p[0].state.wallCount,before-1);assert.deepEqual(p[0].room.doraIndicators,dora);
 assert.equal(p[0].state.melds[0].length,0);assert.equal(p[0].state.discards.length,0);
 p[0].disconnect();await until(()=>p[1].room.paused);const fresh=await connect();await call(fresh,'room:resume',sessions[0]);await until(()=>fresh.state?.nuki[0]===1);
 assert.deepEqual(fresh.state.hand,p[0].state.hand);assert.equal(fresh.room.playerCount,3);
});
test('north can be kept/discarded, and kokushi may rob extraction',async t=>{
 const {p}=await setup(t,{dealWall:()=>deck(['','m119p19s19z123567',''])});await call(p[0],'game:start');await until(()=>p[0].state.canNuki);
 await call(p[0],'game:nuki');await until(()=>p[1].state.call?.options.some(o=>o.type==='ron'));
 assert.equal(p[0].state.nuki[0],0);await call(p[1],'game:call',{id:p[1].state.call.id,choice:'ron'});await until(()=>p[0].room.result);
 assert.ok(p[0].room.result.winners[0].yaku.some(y=>y.name.startsWith('국사무쌍')));
 assert.equal(p[0].room.result.scores.reduce((a,b)=>a+b),105000);
});
test('bots fill only two seats and extract North on their own turn',async t=>{
 const {p}=await setup(t,{bots:true,dealWall:()=>deck(['p123456s123z5551','p147s258z1234m19z5',''],'중')});
 await until(()=>p[0].room.players.length===3);assert.equal(p[0].room.players.filter(p=>p.bot).length,2);
 await call(p[0],'game:start');await until(()=>p[0].state.drawn);await call(p[0],'game:discard',{tile:'중'});
 await until(()=>p[0].room.players[1].nuki>0);
});
test('sanma never offers chi but still offers pon/kan',()=>{
 const f=fixture();f.room.players[1].hand=tiles('p1233789s123z555');f.room.discards=[{tile:'3통',seat:0}];
 const w=openWindow(f.room,0,'3통');assert.ok(w.offers[1].some(o=>o.type==='pon'));assert.ok(w.offers[1].every(o=>o.type!=='chi'));
});
test('north extraction restrictions, riichi, ippatsu and indicator preservation across >4 replacements',()=>{
 const {room,seat}=fixture('p123456789s123z44');const p=room.players[seat];
 assert.equal(north.canExtract(room,seat),true);p.riichi=true;p.drawn='1통';assert.equal(north.canExtract(room,seat),false);p.drawn='북';assert.equal(north.canExtract(room,seat),true);
 room.wall=[];assert.equal(north.canExtract(room,seat),false);room.wall=Array(20).fill('북');
 p.ippatsu=true;const indicators=room.deadWall.slice(4);north.apply(room,seat);
 assert.equal(p.riichi,true);assert.equal(p.ippatsu,false);assert.equal(room.kanCount,0);assert.equal(p.rinshan,false);assert.equal(room.interrupted,true);
 for(let i=0;i<7;i++)kongs.drawReplacement(room,p);
 assert.deepEqual(room.deadWall.slice(4),indicators);assert.equal(room.deadWall.length,14);
 room.playerCount=4;assert.equal(north.canExtract(room,seat),false);
});
test('nuki adds han before limit calculation, including indicator and ura bonus',()=>{
 const f=fixture();const before=evaluateWin(f.room,f.seat,f.ctx);f.room.players[1].nuki=2;
 const after=evaluateWin(f.room,f.seat,f.ctx);assert.equal(after.han,before.han+2);assert.ok(after.points>before.points);assert.equal(after.yaku.find(y=>y.name==='빼기도라').han,2);
 f.room.doraIndicators=['서'];f.room.uraIndicators=['서'];f.room.players[1].riichi=true;
 const r=evaluateWin(f.room,f.seat,f.ctx);assert.equal(r.yaku.filter(y=>y.name==='도라').reduce((n,y)=>n+y.han,0),2);assert.equal(r.yaku.find(y=>y.name==='우라도라').han,2);
 const guide=waitYakuGuide(f.room,1);assert.ok([...guide.guaranteed,...guide.possible].some(y=>y.name==='빼기도라'));
});
test('nuki alone is no yaku; yakuman ignores nuki bonus',()=>{
 const f=fixture('p123456789s23455',1,false);f.room.players[1].hand=tiles('p456789s2345');f.room.players[1].melds=[{type:'pon',tiles:tiles('m111'),called:'1만',from:0}];f.room.players[1].nuki=2;
 assert.equal(evaluateWin(f.room,1,f.ctx),null);
 const y=fixture('m119p19s19z1234567',1,false);y.room.players[1].nuki=1;
 const result=evaluateWin(y.room,1,y.ctx);assert.ok(result.yakuman);assert.ok(!result.yaku.some(y=>y.name==='빼기도라'));
});
test('1-man indicator wraps to 9-man; 9-man wraps to 1-man',()=>{
 for(const [indicator,tile] of [['1만','9'],['9만','1']]){
  const f=fixture(`m${tile}${tile}${tile}p123456s23455`);f.room.doraIndicators=[indicator];
  assert.equal(evaluateWin(f.room,1,f.ctx).yaku.find(y=>y.name==='도라').han,3);
 }
});
test('sanma tsumo loss: dealer mangan 4000 each, child mangan 4000/2000; ron conserved',()=>{
 for(const seat of [0,1,2])for(const tsumo of [false,true]){
  const f=fixture('p123456789s23455',seat,tsumo);if(!tsumo)f.ctx.from=(seat+1)%3;
  f.room.players[seat].riichi=true;f.room.players[seat].nuki=tsumo?1:2; // 5 han, mangan
  const r=evaluateWin(f.room,seat,f.ctx);assert.equal(r.deltas.length,3);assert.equal(r.deltas.reduce((a,b)=>a+b),0);
  assert.equal(r.points,tsumo?(seat===0?8000:6000):(seat===0?12000:8000));
  assert.equal(settleWins(f.room,[seat],f.ctx),true);assert.equal(f.room.players.reduce((n,p)=>n+p.score,0),105000);
 }
});
test('exhaustive draw transfers 2000 points, and nuki reduces visible North copies',()=>{
 const f=fixture('p123456789s23455',1,false);f.room.players[0].hand=tiles('m19p147s258z12345');f.room.players[2].hand=tiles('m19p147s258z12345');endDraw(f.room);
 assert.deepEqual(f.room.result.deltas,[-1000,2000,-1000]);
 const g=fixture('p123456789s111z44',1,false);g.room.players[0].nuki=2;
 assert.equal(waitDetails(g.room,1).find(d=>d.tile==='북').remaining,1);
 g.room.players[1].nuki=3;assert.ok(!waits(g.room.players[1]).includes('북'));
});
test('sanma riichi uses three remaining tiles and does not allow removed man waits',()=>{
 const f=fixture('p123456789s23455');f.room.players[1].score=35000;f.room.wall=Array(3).fill('1통');
 assert.ok(riichiDiscards(f.room,1).length);f.room.wall.pop();assert.equal(riichiDiscards(f.room,1).length,0);
 const p={hand:tiles('m13p123456s123z55'),melds:[],sanma:true};assert.deepEqual(waits(p),[]);
});
test('double ron pays both winners in sanma and awards the riichi pot only once',()=>{
 const f=fixture('p123456789s23455',0,false),{room}=f;
 room.players[1]={...room.players[0],hand:room.players[0].hand.slice()};room.players[2].hand=[];
 room.riichiPot=2;room.players[2].score-=2000;
 assert.equal(settleWins(room,[0,1],{tile:'5삭',from:2}),true);
 assert.equal(room.result.winners.length,2);assert.equal(room.result.pot,2000);
 assert.equal(room.result.scores.reduce((a,b)=>a+b),105000);
 assert.equal(room.result.deltas.length,3);
});
test('sanma honba excludes the absent seat, and nagashi mangan pays only two opponents',()=>{
 const f=fixture('p123456789s23455',1,true);f.room.honba=2;
 const r=evaluateWin(f.room,1,f.ctx);assert.equal(r.deltas.reduce((a,b)=>a+b),0);assert.equal(r.deltas[1],r.points+400);
 const g=fixture();g.room.discards=[{tile:'1만',seat:0},{tile:'2통',seat:1},{tile:'3삭',seat:2}];endDraw(g.room);
 assert.deepEqual(g.room.result.deltas,[8000,-4000,-4000]);
});
