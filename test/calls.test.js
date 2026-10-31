const {test}=require('node:test');
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createGameServer}=require('../server');
const {optionsFor,openWindow,winner,applyCall}=require('../calls');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<300;i++){if(fn())return;await pause(10)}throw Error('state timeout')}
function wall(){
 const types=['동','남','서','북','백','발','중',...['만','통','삭'].flatMap(s=>Array.from({length:9},(_,i)=>`${i+1}${s}`))];
 const stock=types.flatMap(t=>Array(4).fill(t));
 const hands=[['3만'],['1만','2만','4만','5만'],['3만','3만','3만'],[]];
 for(const h of hands)for(const t of h)stock.splice(stock.indexOf(t),1);
 for(const h of hands)while(h.length<13)h.push(stock.shift());
 return [...stock.splice(0,14),...hands.flat(),...stock];
}
const call=(s,e,d)=>new Promise((resolve,reject)=>{const cb=(err,r)=>err?reject(err):resolve(r);if(d===undefined)s.timeout(2000).emit(e,cb);else s.timeout(2000).emit(e,d,cb)});
async function setup(t){
 const game=createGameServer({dealWall:wall});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
 const sockets=[];const sessions=[];
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await game.close()});
 async function connect(){const s=io(`http://127.0.0.1:${game.server.address().port}`,{reconnection:false});sockets.push(s);s.on('game:private',v=>s.state=v);s.on('room:update',v=>s.room=v);await until(()=>s.connected);return s}
 const players=[];
 for(let i=0;i<4;i++){const s=await connect();players.push(s);sessions.push(await call(s,i?'room:join':'room:create',{code:sessions[0]?.code,name:`P${i}`}));}
 await call(players[0],'game:start');await until(()=>players.every(s=>s.state?.hand.length>=13));
 await call(players[0],'game:discard',{tile:'3만'});await until(()=>players.every(s=>s.state?.waiting));
 return {players,sessions,connect,url:`http://127.0.0.1:${game.server.address().port}`};
}
async function answer(s,type){const c=s.state.call;const choice=type?c.options.find(o=>o.type===type).id:null;return call(s,'game:call',{id:c.id,choice})}
test('chi only from left, all sequence options; no honor chi; kuikae restriction',()=>{
 assert.equal(optionsFor(['1만','2만','4만','5만','동'],'3만',1,0,true).filter(o=>o.type==='chi').length,3);
 assert.equal(optionsFor(['1만','2만','동'],'3만',2,0,true).length,0);
 assert.equal(optionsFor(['동','남','서'],'북',1,0,true).length,0);
 assert.equal(optionsFor(['3만','3만','3만','동'],'3만',2,0,false).some(o=>o.type==='kan'),false);
 const chi=optionsFor(['1만','2만','4만','동'],'3만',1,0,true).find(o=>o.consume.includes('4만'));
 assert.ok(chi.banned.includes('3만'));
});
test('pon takes precedence over chi regardless of response arrival; stale/forged requests rejected',async t=>{
 const {players:p}=await setup(t);const id=p[1].state.call.id;
 assert.equal((await call(p[3],'game:call',{id,choice:'0'})).ok,false);
 assert.equal((await call(p[1],'game:call',{id,choice:'forged'})).ok,false);
 const before=p[1].state.hand.slice();
 assert.equal((await answer(p[1],'chi')).ok,true);
 assert.equal((await call(p[0],'game:discard',{tile:p[0].state.hand[0]})).ok,false);
 assert.equal((await answer(p[2],'pon')).ok,true);
 await until(()=>!p[2].state.waiting);
 assert.equal(p[2].state.turn,2);assert.equal(p[2].state.hand.length,11);
 assert.deepEqual(p[1].state.hand,before);
 assert.equal(p[2].state.melds[2][0].type,'pon');
 assert.equal(p[2].state.discards[0].calledBy,2);
 assert.equal((await call(p[1],'game:call',{id,choice:null})).ok,false);
 assert.equal((await call(p[2],'game:discard',{tile:'3만'})).ok,false);
 const legal=p[2].state.hand.find(t=>t!=='3만');
 assert.equal((await call(p[2],'game:discard',{tile:legal})).ok,true);
});
test('daiminkan draws from dead wall, reserves live tile and preserves 14 dead tiles',async t=>{
 const {players:p}=await setup(t);const before=p[2].state.wallCount;
 await answer(p[1],null);await answer(p[2],'kan');await until(()=>!p[2].state.waiting);
 assert.equal(p[2].state.melds[2][0].tiles.length,4);
 assert.equal(p[2].state.hand.length,11);assert.equal(p[2].state.wallCount,before-1);
 assert.ok(p[2].state.drawn);
 const room={players:[{hand:[],melds:[]},{hand:['3만','3만','3만',...Array(10).fill('동')],melds:[]}],discards:[{tile:'3만'}],wall:['1통','2통'],deadWall:Array(14).fill('백'),kanCount:0};
 applyCall(room,{index:0,tile:'3만',from:0},{seat:1,option:{type:'kan',consume:Array(3).fill('3만'),banned:[]}});
 assert.equal(room.deadWall.length,14);assert.equal(room.wall.length,1);assert.equal(room.kanCount,1);
});
test('chi consumes chosen two tiles without drawing; next legal discard is accepted',async t=>{
 const {players:p}=await setup(t);const before=p[1].state.wallCount;
 await answer(p[2],null);await answer(p[1],'chi');await until(()=>!p[1].state.waiting);
 assert.equal(p[1].state.turn,1);assert.equal(p[1].state.hand.length,11);assert.equal(p[1].state.drawn,null);
 assert.equal(p[1].state.wallCount,before);
 assert.equal(p[1].state.melds[1][0].type,'chi');
 const tile=p[1].state.hand.find(t=>!p[1].state.banned.includes(t));
 assert.equal((await call(p[1],'game:discard',{tile})).ok,true);
});
test('pending call survives reconnect; all skips draw exactly once',async t=>{
 const {players:p,sessions,connect}=await setup(t);const before=p[1].state;const id=before.call.id;
 p[1].disconnect();await until(()=>p[2].room.paused);
 assert.equal((await answer(p[2],'pon')).ok,false);
 const fresh=await connect();await call(fresh,'room:resume',sessions[1]);await until(()=>fresh.state?.call);
 assert.equal(fresh.state.call.id,id);assert.deepEqual(fresh.state.call.options,before.call.options);
 await answer(fresh,null);await answer(p[2],null);await until(()=>!fresh.state.waiting);
 assert.equal(fresh.state.turn,1);assert.equal(fresh.state.hand.length,14);
 assert.equal(fresh.state.wallCount,before.wallCount-1);
 assert.equal((await call(fresh,'game:call',{id,choice:null})).ok,false);
});
test('no calls on last discard, and equal priorities follow turn distance',()=>{
 assert.equal(openWindow({wall:[]},0,'3만'),null);
 assert.equal(winner({from:0,offers:{1:[{id:'0',type:'pon'}],3:[{id:'0',type:'kan'}]},responses:{3:'0',1:'0'}}).seat,1);
});

test('page highlights callable discard, offers each chi, and displays claimed meld after click',async t=>{
 const {JSDOM}=require('jsdom');
 const {players:p,sessions,url}=await setup(t);
 p[1].disconnect();await until(()=>p[2].room.paused);
 const page=await JSDOM.fromURL(url,{resources:'usable',runScripts:'dangerously',beforeParse(w){w.sessionStorage.setItem('mahjong.session.v1',JSON.stringify(sessions[1]));}});
 t.after(()=>{page.window.eval('socket.disconnect()');page.window.close()});
 const doc=page.window.document;
 await until(()=>doc.querySelectorAll('#callPanel [data-choice]').length===4);
 assert.equal(doc.querySelectorAll('.river .callable').length,1);
 assert.equal(doc.querySelectorAll('#callPanel .call-preview').length,3);
 assert.ok([...doc.querySelectorAll('#hand button')].every(b=>b.disabled));
 await answer(p[2],null);
 doc.querySelector('#callPanel button[data-choice="0"]').click();
 await until(()=>doc.querySelectorAll('#melds .meld-group').length===1);
 assert.equal(doc.querySelectorAll('#hand button').length,11);
 assert.equal(doc.querySelectorAll('.river .callable').length,0);
 assert.equal(doc.querySelectorAll('.river .claimed').length,1);
 assert.ok(doc.getElementById('callPanel').classList.contains('hidden'));
 const legal=doc.querySelector('#hand button:not(:disabled)');assert.ok(legal);legal.click();legal.click();
 await until(()=>p[0].state.discards.length===2);
});
