const {test}=require('node:test');
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createGameServer}=require('../server');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<300;i++){if(fn())return;await pause(10)}throw Error('state timeout')}
const call=(s,e,d)=>new Promise((resolve,reject)=>{const cb=(err,r)=>err?reject(err):resolve(r);if(d===undefined)s.timeout(3000).emit(e,cb);else s.timeout(3000).emit(e,d,cb)});
for(const count of [3,4])test(`${count} players: public hand counts track draws and discards without revealing tiles`,async t=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const p=[];
 t.after(async()=>{p.forEach(s=>s.disconnect());await game.close()});
 let code;
 for(let i=0;i<count;i++){
  const s=io(`http://127.0.0.1:${game.server.address().port}`,{reconnection:false});p.push(s);s.on('room:update',r=>s.room=r);s.on('game:private',r=>s.state=r);await until(()=>s.connected);
  const r=await call(s,i?'room:join':'room:create',{code,playerCount:count});code=r.code;
 }
 await call(p[0],'game:start');await until(()=>p.every(s=>s.room.started));
 assert.deepEqual(p[0].room.players.map(p=>p.handCount),[14,...Array(count-1).fill(13)]);
 assert.deepEqual(p[0].room.players.map(p=>p.hasDrawn),[true,...Array(count-1).fill(false)]);
 for(const player of p[1].room.players){assert.equal('hand' in player,false);assert.equal('drawn' in player,false);assert.equal('token' in player,false);}
 await call(p[0],'game:discard',{tile:p[0].state.drawn});await until(()=>p.every(s=>s.state.discards.length===1));
 for(const s of p){const c=s.state.call;if(c?.options.length&&!c.answered)await call(s,'game:call',{id:c.id,choice:null});}
 await until(()=>p.every(s=>s.room.turn===1&&!s.room.waiting));
 assert.deepEqual(p[0].room.players.map(p=>p.handCount),[13,14,...Array(count-2).fill(13)]);
 assert.deepEqual(p[0].room.players.map(p=>p.hasDrawn),[false,true,...Array(count-2).fill(false)]);
});
