const {test}=require('node:test');
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createGameServer}=require('../server');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+6000;while(!fn()){if(Date.now()>end)throw Error('Timed out');await pause(5);}}
function call(s,event,data){return new Promise((resolve,reject)=>{const ack=(e,r)=>e?reject(e):resolve(r);data===undefined?s.timeout(3000).emit(event,ack):s.timeout(3000).emit(event,data,ack);});}
test('online augment drafts pause play, stay private, survive reconnect and resume at 6/12 draws',async t=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const sockets=[];t.after(async()=>{sockets.forEach(s=>s.disconnect());await game.close();});
 async function connect(){const s=io(`http://127.0.0.1:${game.server.address().port}`,{reconnection:false});sockets.push(s);s.on('game:private',v=>{s.state=v;if(v.call?.options.length&&!v.call.answered)s.emit('game:call',{id:v.call.id,choice:null});});s.on('room:update',r=>s.room=r);await until(()=>s.connected);return s;}
 const players=[],sessions=[];
 for(let i=0;i<4;i++){const s=await connect();players.push(s);sessions.push(await call(s,i?'room:join':'room:create',{code:sessions[0]?.code,mode:'augment',playerCount:4}));assert.equal(sessions[i].ok,true);}
 assert.equal((await call(players[0],'game:start')).ok,true);await until(()=>players.every(s=>s.state?.augment.draft&&s.room?.augmentDraft));
 assert.equal(players[0].room.mode,'augment');assert.equal(players[0].room.paused,true);assert.ok(!JSON.stringify(players[0].room).includes('offers'));
 const before=structuredClone(players[0].state);assert.equal((await call(players[0],'game:discard',{tile:before.drawn})).ok,false);assert.equal((await call(players[0],'game:tsumo')).ok,false);assert.equal((await call(players[0],'game:kan',{id:'ankan:東'})).ok,false);
 players[0].disconnect();players[0]=await connect();assert.equal((await call(players[0],'room:resume',sessions[0])).ok,true);await until(()=>players[0].state?.augment.draft);assert.deepEqual(players[0].state.augment,before.augment);
 const stages=[];
 async function chooseAll(){await until(()=>players.every(s=>s.state?.augment.draft));const stage=players[0].state.augment.draft.stage;stages.push(stage);for(const s of players){const d=s.state.augment.draft;assert.equal(d.stage,stage);assert.equal((await call(s,'game:augment-select',{id:d.id,card:d.offers[0].id})).ok,true);assert.equal((await call(s,'game:augment-select',{id:d.id,card:d.offers[0].id})).ok,false);}await until(()=>players.every(s=>!s.state.augment.draft&&!s.room.augmentDraft));}
 await chooseAll();
 for(let n=0;n<47;n++){
  await until(()=>players.every(s=>!s.state.waiting&&s.state.discards.length===n));
  const turn=players[0].state.turn,s=players[turn];assert.equal((await call(s,'game:discard',{tile:s.state.drawn})).ok,true);
  await until(()=>players.every(s=>!s.state.waiting&&s.state.discards.length===n+1));
  if(players[0].state.augment.draft)await chooseAll();
 }
 assert.deepEqual(stages,[0,6,12]);assert.ok(players.every(s=>s.state.augment.cards.length===3));assert.ok(players.every(s=>s.state.augment.draws===12));
});
