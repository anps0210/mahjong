const {test}=require('node:test');
const assert=require('node:assert/strict');
const {io}=require('socket.io-client');
const {createGameServer}=require('../server');
const {riichiDiscards,declareRiichi,handShanten}=require('../riichi');
const {openWindow}=require('../calls');
const hand=['1만','2만','3만','4만','5만','6만','2통','3통','4통','5삭','6삭','동','동','백'];
function room(){return {started:true,turn:0,wall:Array(20).fill('1통'),players:[{hand:hand.slice(),melds:[],score:25000}]};}
test('riichi validates closed tenpai, remaining wall and points without mutating invalid requests',()=>{
 const r=room();assert.ok(riichiDiscards(r,0).includes('백'));assert.ok(!riichiDiscards(r,0).includes('1만'));
 assert.equal(declareRiichi(r,0,'1만'),false);assert.equal(r.players[0].score,25000);
 for(const change of [r=>r.players[0].melds=[{}],r=>r.players[0].score=999,r=>r.wall.length=3,r=>r.pendingCall={},r=>r.turn=1,r=>r.started=false]){const x=room();change(x);assert.deepEqual(riichiDiscards(x,0),[])}
 assert.equal(declareRiichi(r,0,'백'),true);assert.equal(r.players[0].score,24000);assert.equal(r.riichiPot,1);
 assert.equal(declareRiichi(r,0,'백'),false);assert.equal(r.riichiPot,1);
 const exact=room();exact.players[0].score=1000;assert.equal(declareRiichi(exact,0,'백'),true);assert.equal(exact.players[0].score,0);
});
test('shanten includes open melds and special closed hands, leaving caller data intact',()=>{
 const p={hand:hand.slice(0,13),melds:[]};assert.equal(handShanten(p),0);assert.deepEqual(p.hand,hand.slice(0,13));
 assert.equal(handShanten({hand:['4만','5만','6만','2통','3통','4통','5삭','6삭','동','동'],melds:[{}]}),0);
 assert.equal(handShanten({hand:['4만','5만','6만','2통','3통','4통','4삭','5삭','6삭','동','동'],melds:[{}]}),-1);
 assert.equal(handShanten({hand:['1만','1만','3만','3만','5만','5만','2통','2통','7통','7통','동','동','백'],melds:[]}),0);
 assert.equal(handShanten({hand:['1만','9만','1통','9통','1삭','9삭','동','남','서','북','백','발','중'],melds:[]}),0);
});
test('declared players cannot receive chi/pon/kan offers',()=>{
 const r={wall:['1통'],deadWall:Array(14).fill('白'),discards:[{tile:'3만',seat:0}],players:[{hand:[]},{hand:['1만','2만','3만','3만','3만','동'],riichi:true}]};
 assert.equal(openWindow(r,0,'3만'),null);
});
const wait=async(fn)=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('timeout')};
const call=(s,e,d)=>new Promise((resolve,reject)=>{const cb=(err,r)=>err?reject(err):resolve(r);if(d===undefined)s.timeout(2000).emit(e,cb);else s.timeout(2000).emit(e,d,cb)});
function wall(){
 const stock=['동','남','서','북','백','발','중',...['만','통','삭'].flatMap(s=>Array.from({length:9},(_,i)=>`${i+1}${s}`))].flatMap(t=>Array(4).fill(t));
 for(const t of hand)stock.splice(stock.indexOf(t),1);
 const dead=stock.splice(0,14),others=stock.splice(0,39);
 return [...dead,...hand.slice(0,13),...others,...stock,'백'];
}
async function setup(t){
 const g=createGameServer({dealWall:wall});await new Promise(r=>g.server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${g.server.address().port}`;const sockets=[];const sessions=[];
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await g.close()});
 async function connect(){const s=io(url,{reconnection:false});sockets.push(s);s.on('room:update',r=>s.room=r);s.on('game:private',r=>{s.state=r;if(r.call?.options.length&&!r.call.answered)s.emit('game:call',{id:r.call.id,choice:null})});await wait(()=>s.connected);return s}
 const p=[];for(let i=0;i<4;i++){p.push(await connect());sessions.push(await call(p[i],i?'room:join':'room:create',{name:'R'+i,code:sessions[0]?.code}))}
 await call(p[0],'game:start');await wait(()=>p.every(s=>s.state?.hand.length>=13));return {p,sessions,connect,url};
}
test('declaration is atomic, forces drawn discard, survives reconnect and preserves deposits across rounds',async t=>{
 const {p,sessions,connect}=await setup(t);
 assert.equal(p[0].state.shanten,0);assert.ok(p[0].state.riichiDiscards.includes('백'));
 assert.equal((await call(p[1],'game:discard',{tile:p[1].state.hand[0],riichi:true})).ok,false);
 assert.equal((await call(p[0],'game:discard',{tile:'1만',riichi:true})).ok,false);
 assert.equal((await call(p[0],'game:discard',{tile:'백',riichi:true})).ok,true);
 await wait(()=>p.every(s=>s.state.discards.length===1&&!s.state.waiting));
 assert.equal(p[0].state.riichi,true);assert.equal(p[0].state.discards[0].riichi,true);assert.equal(p[0].room.players[0].score,24000);
 assert.equal(p[0].room.riichiPot,1);assert.equal('shanten' in p[1].room.players[0],false);
 p[0].disconnect();const fresh=await connect();await call(fresh,'room:resume',sessions[0]);await wait(()=>fresh.state?.riichi);p[0]=fresh;
 for(let i=1;i<4;i++){await wait(()=>p[i].state.turn===i&&!p[i].state.waiting);const count=p[i].state.discards.length;assert.equal((await call(p[i],'game:discard',{tile:p[i].state.hand[0]})).ok,true);await wait(()=>p.every(s=>s.state.discards.length>count&&!s.state.waiting))}
 assert.equal(p[0].state.turn,0);const old=p[0].state.hand.find(t=>t!==p[0].state.drawn);
 assert.equal((await call(p[0],'game:discard',{tile:old})).ok,false);
 assert.equal((await call(p[0],'game:discard',{tile:p[0].state.drawn,riichi:true})).ok,false);
 assert.equal((await call(p[0],'game:discard',{tile:p[0].state.drawn})).ok,true);
 while(p[0].room.started){await wait(()=>p.every(s=>!s.state.waiting));if(!p[0].room.started)break;const current=p[p[0].state.turn];const count=current.state.discards.length;const tile=current.state.riichi?current.state.drawn:current.state.hand[0];assert.equal((await call(current,'game:discard',{tile})).ok,true);await wait(()=>p.every(s=>s.state.discards.length>count&&!s.state.waiting))}
 const settledScore=p[0].room.players[0].score;
 const host=p.find(s=>s.room.players[s.state.mySeat].host);
 await call(host,'game:start');await wait(()=>p[0].state.discards.length===0);
 assert.equal(p[0].state.riichi,false);assert.equal(p[0].room.players[0].score,settledScore);assert.equal(p[0].room.riichiPot,1);
});
test('page toggles persistent shanten display and offers only legal riichi discards',async t=>{
 const {JSDOM}=require('jsdom');const {p,sessions,url}=await setup(t);
 const page=await JSDOM.fromURL(url,{resources:'usable',runScripts:'dangerously',beforeParse(w){w.sessionStorage.setItem('mahjong.session.v1',JSON.stringify(sessions[0]))}});
 t.after(()=>{page.window.eval('socket.disconnect()');page.window.close()});const d=page.window.document;
 await wait(()=>d.getElementById('shantenValue')?.textContent.includes('0샹텐'));
 d.getElementById('showShanten').click();assert.ok(d.getElementById('shantenValue').classList.contains('hidden'));assert.equal(page.window.localStorage.getItem('mahjong.showShanten'),'false');
 d.getElementById('showShanten').click();assert.equal(d.getElementById('shantenValue').classList.contains('hidden'),false);
 assert.equal(d.getElementById('riichiButton').disabled,false);d.getElementById('riichiButton').click();
 assert.ok(d.querySelectorAll('.riichi-candidate').length>0);
 assert.equal(d.querySelector('[aria-label="1만 버리기"]').disabled,true);
 d.getElementById('riichiButton').click();assert.equal(d.querySelectorAll('.riichi-candidate').length,0);
 d.getElementById('riichiButton').click();d.querySelector('[aria-label="백 버리기"]').click();
 assert.ok(d.querySelector('[aria-label="백 버리기"]').classList.contains("selected-tile"));
 assert.equal(p[1].room.players[0].riichi,false);
 d.querySelector('[aria-label="백 버리기"]').click();
 await wait(()=>d.getElementById('riichiButton').textContent.includes('완료'));
 assert.ok(d.querySelector('.riichi-discard'));assert.ok(d.getElementById('riichiPot').textContent.includes('1000'));
 assert.ok(p[1].room.players[0].riichi);
});
