const {test}=require('node:test');
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createGameServer}=require('../server');
const {TILES}=require('../bot');
const kongs=require('../kongs');
function tiles(s){return [...s.matchAll(/([mpsz])(\d+)/g)].flatMap(([,s,ns])=>[...ns].map(n=>TILES[s==='z'?26+Number(n):'mps'.indexOf(s)*9+Number(n)-1]));}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<300;i++){if(fn())return;await pause(10)}throw Error('state timeout');}
const call=(s,e,d)=>new Promise((resolve,reject)=>{const cb=(err,v)=>err?reject(err):resolve(v);d===undefined?s.timeout(3000).emit(e,cb):s.timeout(3000).emit(e,d,cb)});
function wall(hands,draw,rinshan){
 const stock=TILES.flatMap(t=>Array(4).fill(t));
 const take=t=>{const i=stock.indexOf(t);assert.ok(i>=0,'physical tile stock: '+t);stock.splice(i,1);return t};
 hands=hands.map(h=>tiles(h).map(take));draw=take(tiles(draw)[0]);
 const dead=rinshan?[take(tiles(rinshan)[0])]:[];
 for(const h of hands)while(h.length<13)h.push(stock.shift());
 while(dead.length<14)dead.push(stock.shift());
 return [...dead,...hands.flat(),...stock,draw];
}
async function setup(t,hands,draw,rinshan){
 const deck=wall(hands,draw,rinshan),game=createGameServer({dealWall:()=>deck.slice()});
 await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${game.server.address().port}`,sockets=[],sessions=[];
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await game.close()});
 async function connect(){const s=io(url,{reconnection:false});sockets.push(s);s.on('game:private',v=>s.state=v);s.on('room:update',v=>s.room=v);await until(()=>s.connected);return s;}
 const p=[];for(let i=0;i<4;i++){p.push(await connect());sessions.push(await call(p[i],i?'room:join':'room:create',{code:sessions[0]?.code,name:`P${i}`}));}
 await call(p[0],'game:start');await until(()=>p.every(s=>s.state?.hand.length>=13));
 return {p,sessions,connect,url};
}
async function respond(p,choices){for(let i=0;i<4;i++){const c=p[i].state.call;if(c?.options.length&&!c.answered){const type=choices[i];await call(p[i],'game:call',{id:c.id,choice:type?c.options.find(o=>o.type===type).id:null});}}}
test('real tsumo request settles once, rejects wrong seat, restores result on reconnect and renders it',async t=>{
 const {p,sessions,connect,url}=await setup(t,['m123456p55789s23','','',''],'s4');
 assert.equal(p[0].state.canTsumo,true);
 assert.equal((await call(p[1],'game:tsumo')).ok,false);
 assert.equal((await call(p[0],'game:tsumo')).ok,true);
 await until(()=>p.every(s=>s.room.result));
 assert.ok(p[0].room.result.winners[0].yaku.some(y=>y.name==='천화'));
 const scores=p[0].room.result.scores;assert.equal(scores.reduce((a,b)=>a+b),100000);
 assert.equal((await call(p[0],'game:tsumo')).ok,false);
 p[0].disconnect();const fresh=await connect();await call(fresh,'room:resume',sessions[0]);await until(()=>fresh.room?.result);assert.deepEqual(fresh.room.result.scores,scores);
 const {JSDOM}=require('jsdom');fresh.disconnect();
 const page=await JSDOM.fromURL(url,{resources:'usable',runScripts:'dangerously',beforeParse(w){w.sessionStorage.setItem('mahjong.session.v1',JSON.stringify(sessions[0]));}});
 t.after(()=>{page.window.eval('socket.disconnect()');page.window.close()});
 await until(()=>page.window.document.querySelector('#roundResult').textContent.includes('천화'));
 assert.match(page.window.document.querySelector('#roundResult').textContent,/쯔모/);
});
test('ron beats an already chosen pon, closes hand and rejects stale win response',async t=>{
 const {p}=await setup(t,['s4','m123456p55789s23','s44',''],'z7');
 assert.equal((await call(p[0],'game:discard',{tile:'4삭'})).ok,true);
 await until(()=>p.every(s=>s.state.waiting));
 const c=p[2].state.call;await call(p[2],'game:call',{id:c.id,choice:c.options.find(o=>o.type==='pon').id});
 await respond(p,{1:'ron'});await until(()=>p[0].room.result);
 assert.equal(p[0].room.result.winners.length,1);assert.equal(p[0].room.result.winners[0].seat,1);
 assert.equal(p[0].room.result.winners[0].method,'ron');assert.equal(p[0].room.players[2].melds.length,0);
 assert.equal((await call(p[1],'game:call',{id:c.id,choice:'ron'})).ok,false);
});
test('two simultaneous ron winners are both paid and total score is conserved',async t=>{
 const {p}=await setup(t,['s4','m123456p55789s23','m123456p55789s23',''],'z7');
 await call(p[0],'game:discard',{tile:'4삭'});await until(()=>p.every(s=>s.state.waiting));
 await respond(p,{1:'ron',2:'ron'});await until(()=>p[0].room.result);
 assert.deepEqual(p[0].room.result.winners.map(w=>w.seat),[1,2]);
 assert.equal(p[0].room.result.scores.reduce((a,b)=>a+b),100000);
});
test('concealed kan reveals extra dora, draws rinshan and can win through the socket',async t=>{
 const {p}=await setup(t,['m1111p123s123z555','','',''],'z2','z2');
 assert.ok(p[0].state.kanOptions.some(o=>o.id==='ankan:1만'));
 assert.equal((await call(p[1],'game:kan',{id:'ankan:1만'})).ok,false);
 assert.equal((await call(p[0],'game:kan',{id:'ankan:1만'})).ok,true);
 await until(()=>p[0].state.melds[0].length===1);
 assert.equal(p[0].room.doraIndicators.length,2);assert.equal(p[0].state.hand.length,11);
 assert.equal(p[0].state.canTsumo,true);await call(p[0],'game:tsumo');await until(()=>p[0].room.result);
 assert.ok(p[0].room.result.winners[0].yaku.some(y=>y.name==='영상개화'));
 assert.ok(!p[0].room.result.winners[0].yaku.some(y=>y.name==='천화'));
});
test('added kan extends original pon, consumes one tile and cancels ippatsu',()=>{
 const p={hand:tiles('m1p123s123z55522'),melds:[{type:'pon',tiles:tiles('m111'),called:'1만',from:3}],drawn:'1만',ippatsu:true};
 const room={started:true,turn:0,players:[p],wall:['1삭','2삭'],deadWall:Array(14).fill('백'),kanCount:0};
 const o=kongs.options(room,0).find(o=>o.type==='kakan');assert.ok(o);kongs.apply(room,0,o);
 assert.equal(p.melds[0].type,'kakan');assert.equal(p.melds[0].from,3);assert.equal(p.melds[0].tiles.length,4);assert.equal(p.ippatsu,false);assert.equal(p.rinshan,true);assert.equal(room.deadWall.length,14);
});
