const {test}=require('node:test');const assert=require('node:assert/strict');const {io}=require('socket.io-client');const {createGameServer}=require('../server');const {TILES}=require('../bot');
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<300;i++){if(fn())return;await pause(10)}throw Error('state timeout')}
const call=(s,e,d)=>new Promise((resolve,reject)=>{const cb=(err,r)=>err?reject(err):resolve(r);if(d===undefined)s.timeout(3000).emit(e,cb);else s.timeout(3000).emit(e,d,cb)});
function wall(){const stock=TILES.flatMap(t=>Array(4).fill(t));const hand=['1만','2만','3만','4만','5만','6만','5통','5통','7통','8통','9통','2삭','3삭'];const draw='4삭';for(const t of [...hand,draw])stock.splice(stock.indexOf(t),1);return [...stock.splice(0,14),...hand,...stock.splice(0,39),...stock,draw];}
test('character selection belongs to each player, persists on resume and voices only successful actions',async t=>{
 const game=createGameServer({dealWall:wall});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const sockets=[];
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await game.close()});
 async function connect(){const s=io(`http://127.0.0.1:${game.server.address().port}`,{reconnection:false});sockets.push(s);s.voices=[];s.on('room:update',r=>s.room=r);s.on('game:private',r=>s.state=r);s.on('game:voice',v=>s.voices.push(v));await until(()=>s.connected);return s;}
 const a=await connect(),b=await connect();const session=await call(a,'room:create',{voice:'02'});await call(b,'room:join',{code:session.code,voice:'01'});
 assert.equal((await call(a,'room:voice',{voice:'03',seat:1})).ok,true);await until(()=>b.room.players[0].voice==='03');assert.equal(b.room.players[1].voice,'01');
 assert.equal((await call(a,'room:voice',{voice:'../bad'})).ok,false);await call(a,'room:bots',{fill:true});
 a.disconnect();const fresh=await connect();await call(fresh,'room:resume',session);await until(()=>fresh.state?.voice==='03');assert.equal(fresh.voices.length,0);
 assert.equal((await call(b,'game:start')).ok,true);await until(()=>fresh.state.canTsumo);
 assert.equal((await call(fresh,'room:voice',{voice:'milk'})).ok,false);assert.equal((await call(b,'game:tsumo')).ok,false);assert.equal((await call(fresh,'game:kan',{id:'invalid'})).ok,false);assert.equal(fresh.voices.length,0);
 assert.equal((await call(fresh,'game:tsumo')).ok,true);await until(()=>b.voices.length===1);assert.equal(b.voices[0].voice,'03');assert.equal(b.voices[0].action,'tsumo');assert.equal(b.voices[0].seat,0);assert.ok(b.voices[0].id);
 await call(fresh,'game:tsumo');assert.equal(fresh.voices.length,1);
 fresh.disconnect();const resumed=await connect();await call(resumed,'room:resume',session);await until(()=>resumed.room?.result);assert.equal(resumed.voices.length,0);
});
