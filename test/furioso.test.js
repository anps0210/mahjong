const {test}=require('node:test');const assert=require('node:assert/strict');const {evaluateWin,settleWins,waitYakuGuide}=require('../scoring');
const {io}=require('socket.io-client');const {createGameServer}=require('../server');
function fixture(count=4,suit='만',tsumo=false){
 const other=suit==='통'?'삭':'통',tile='9'+suit;
 const players=Array.from({length:count},()=>({name:'P',hand:[],melds:[],score:count===3?35000:25000,sanma:count===3}));
 players[1].hand=[1,2,3,4,5,6].map(n=>n+other).concat(['백','백','백','동','동','동',tile],tsumo?[tile]:[]);players[1].drawn=tsumo?tile:null;
 const discards=Array.from({length:8},(_,i)=>({seat:1,tile:(i+1)+suit}));
 return {room:{playerCount:count,players,discards,wall:['중'],interrupted:true,doraIndicators:[],uraIndicators:[],started:true,kanCount:0},ctx:{tile,from:tsumo?null:0}};
}
for(const count of [3,4])for(const suit of count===3?['통','삭']:['만','통','삭'])for(const tsumo of [false,true])test(`Furioso ${count} players ${suit} ${tsumo?'tsumo':'ron'}`,()=>{
 const {room,ctx}=fixture(count,suit,tsumo);const r=evaluateWin(room,1,ctx);
 assert.ok(r.yaku.some(y=>y.name==='Furioso-Replica'&&y.yakuman===1));assert.equal(r.special.name,'Furioso-Replica');assert.equal(r.deltas.length,count);assert.equal(r.deltas.reduce((a,b)=>a+b),0);
 assert.equal(r.yakuman,count===3&&!tsumo?2:1);assert.equal(r.points,count===3?(tsumo?24000:64000):32000);
 assert.equal(settleWins(room,[1],ctx),true);assert.equal(room.result.scores.reduce((a,b)=>a+b),count===3?105000:100000);
});
test('other suits/honors and other players do not interrupt; claimed tiles count',()=>{
 const {room,ctx}=fixture();room.discards=room.discards.flatMap((d,i)=>[{seat:0,tile:'9만'},d,{seat:1,tile:i%2?'중':'7삭'}]);room.discards[1].calledBy=2;
 assert.ok(evaluateWin(room,1,ctx).yaku.some(y=>y.name==='Furioso-Replica'));
});
test('missing, duplicate, reversed, wrong-suit sequence and wrong winning rank do not qualify',()=>{
 for(const mode of ['missing','duplicate','reverse','wrongSuit','wrongTile','extra']){
  const {room,ctx}=fixture();
  if(mode==='missing')room.discards.splice(3,1);
  if(mode==='duplicate')room.discards.splice(3,0,{seat:1,tile:'3만'});
  if(mode==='reverse')room.discards.reverse();
  if(mode==='wrongSuit')room.discards[3].tile='4삭';
  if(mode==='wrongTile')ctx.tile='8만';
  if(mode==='extra')room.discards.push({seat:1,tile:'4만'});
  assert.ok(!evaluateWin(room,1,ctx)?.yaku.some(y=>y.name==='Furioso-Replica'),mode);
 }
});
test('legal shape and furiten still required; tsumo can win despite furiten; guide includes special yaku',()=>{
 const {room,ctx}=fixture();room.discards.unshift({seat:1,tile:'9만'});assert.equal(evaluateWin(room,1,ctx),null);
 room.players[1].drawn='9만';room.players[1].hand.push('9만');assert.ok(evaluateWin(room,1,{tile:'9만'}).yaku.some(y=>y.name==='Furioso-Replica'));
 assert.ok(waitYakuGuide(room,1).guaranteed.some(y=>y.name==='Furioso-Replica'));
 room.players[1].hand[0]='남';assert.equal(evaluateWin(room,1,{tile:'9만'}),null);
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<300;i++){if(fn())return;await pause(10)}throw Error('timeout')}
const call=(s,e,d)=>new Promise((resolve,reject)=>{const cb=(err,r)=>err?reject(err):resolve(r);if(d===undefined)s.timeout(3000).emit(e,cb);else s.timeout(3000).emit(e,d,cb)});
for(const count of [3,4])test(`password test win is authoritative, one-time, and solo-bot only (${count} players)`,async t=>{
 const g=createGameServer({botDelayMs:60000});await new Promise(r=>g.server.listen(0,'127.0.0.1',r));const sockets=[];
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await g.close()});
 async function connect(){const s=io(`http://127.0.0.1:${g.server.address().port}`,{reconnection:false});sockets.push(s);s.on('room:update',r=>s.room=r);await until(()=>s.connected);return s;}
 const a=await connect();await call(a,'room:create',{playerCount:count});await call(a,'room:bots',{fill:true});await call(a,'game:start');
 assert.equal((await call(a,'game:test-furioso',{password:'wrong'})).ok,false);assert.equal(a.room.started,true);
 assert.equal((await call(a,'game:test-furioso',{password:'anps'})).ok,true);await until(()=>a.room.result?.test);assert.equal(a.room.started,false);assert.equal(a.room.result.winners[0].special.name,'Furioso-Replica');assert.equal(a.room.result.scores.reduce((a,b)=>a+b),count===3?105000:100000);
 assert.equal((await call(a,'game:test-furioso',{password:'anps'})).ok,false);
 const b=await connect(),c=await connect();const r=await call(b,'room:create',{playerCount:count});await call(c,'room:join',{code:r.code});await call(b,'room:bots',{fill:true});await call(b,'game:start');
 assert.equal((await call(c,'game:test-furioso',{password:'anps'})).ok,false);assert.equal((await call(b,'game:test-furioso',{password:'anps'})).ok,false);assert.equal(b.room.started,true);
});
