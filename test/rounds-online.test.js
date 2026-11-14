const {test}=require('node:test');const assert=require('node:assert/strict');const {io}=require('socket.io-client');const {createGameServer}=require('../server');
const wait=async fn=>{const end=Date.now()+6000;while(!fn()){if(Date.now()>end)throw Error('timeout');await new Promise(r=>setTimeout(r,5));}};
const call=(s,e,d)=>new Promise((r,j)=>{const cb=(err,res)=>err?j(err):r(res);d===undefined?s.timeout(3000).emit(e,cb):s.timeout(3000).emit(e,d,cb);});
test('two actual rounds preserve players/scores, rotate winds and restore inter-round state',async t=>{
 const hand=['1만','3만','5만','7만','9만','1통','3통','5통','7통','9통','1삭','3삭','5삭'];
 const game=createGameServer({dealWall:()=>[...Array(14).fill('백'),...hand,...hand,...hand,...hand,'2삭','4삭','6삭','8삭']});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const all=[];t.after(async()=>{all.forEach(s=>s.disconnect());await game.close();});
 async function connect(){const s=io(`http://127.0.0.1:${game.server.address().port}`,{reconnection:false});all.push(s);s.on('game:private',v=>{s.state=v;if(v.call?.options.length&&!v.call.answered)s.emit('game:call',{id:v.call.id,choice:null});});s.on('room:update',v=>s.room=v);await wait(()=>s.connected);return s;}
 const p=[],sessions=[];for(let i=0;i<4;i++){p.push(await connect());sessions.push(await call(p[i],i?'room:join':'room:create',{name:`P${i}`,code:sessions[0]?.code}));}
 for(let round=0;round<2;round++){
  assert.equal((await call(p[0],'game:start')).ok,true);await wait(()=>p.every(s=>s.room?.started));assert.equal(p[round].state.mySeat,0);assert.match(p[0].room.roundLabel,new RegExp(`동${round+1}국 ${round}본장`));
  for(let n=0;n<4;n++){await wait(()=>p.every(s=>!s.state.waiting&&s.state.discards.length===n));const actor=p.find(s=>s.state.mySeat===s.state.turn);assert.equal((await call(actor,'game:discard',{tile:actor.state.drawn})).ok,true);}
  await wait(()=>p.every(s=>!s.room.started&&s.room.result));assert.equal(p[0].room.matchActive,true);assert.equal((await call(p[0],'room:bots',{fill:false})).ok,false);
  const late=await connect();assert.equal((await call(late,'room:join',{code:sessions[0].code})).ok,false);late.disconnect();
  const before=p[1].room.result;p[1].disconnect();p[1]=await connect();assert.equal((await call(p[1],'room:resume',sessions[1])).ok,true);await wait(()=>p[1].room?.result);assert.deepEqual(p[1].room.result,before);assert.ok(p[1].room.players.every(x=>x.score===25000));
 }
 const id=p[0].room.result.id;
 assert.equal((await call(p[0],'game:settlement-done',{id:'stale'})).ok,false);
 assert.equal((await call(p[0],'game:settlement-done',{id})).ok,true);
 await new Promise(r=>setTimeout(r,100));assert.equal(p[0].room.started,false);
 for(const socket of p.slice(1))assert.equal((await call(socket,'game:settlement-done',{id})).ok,true);
 await wait(()=>p.every(s=>s.room.started));assert.equal(p[0].room.roundLabel,'동3국 2본장');
 assert.equal((await call(p[0],'game:settlement-done',{id})).ok,false);

 assert.equal((await call(p[0],'room:leave-finished')).ok,false);
 for(let hand=3;hand<=4;hand++){
  for(let n=0;n<4;n++){await wait(()=>p.every(s=>!s.state.waiting&&s.state.discards.length===n));const actor=p.find(s=>s.state.mySeat===s.state.turn);assert.equal((await call(actor,'game:discard',{tile:actor.state.drawn})).ok,true);}
  await wait(()=>p.every(s=>!s.room.started&&s.room.result));
  if(hand===3){for(const socket of p)await call(socket,'game:settlement-done',{id:p[0].room.result.id});await wait(()=>p.every(s=>s.room.started));}
 }
 const final=p[1].room.result;assert.equal(final.matchEnded,true);assert.equal(final.endReason,'동풍전 종료');assert.equal(final.nextRound,undefined);
 assert.equal((await call(p[0],'room:leave-finished')).ok,true);await wait(()=>!p[1].room.players.find(x=>x.name==='P0').connected);assert.deepEqual(p[1].room.result,final);
 const fresh=await connect();assert.equal((await call(fresh,'room:resume',sessions[0])).ok,false);
 assert.equal((await call(p[0],'room:create',{name:'새 방'})).ok,true);

});
