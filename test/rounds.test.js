const {test}=require('node:test');const assert=require('node:assert/strict');const r=require('../rounds');
function room(n=4){const room={playerCount:n,players:Array.from({length:n},(_,i)=>({id:String(i),name:`P${i}`}))};r.prepare(room);return room;}
function end(room,{win=[],tenpai=[],reason='패산 소진'}={}){room.started=false;room.result={type:win.length?'win':'draw',winners:win.map(seat=>({seat})),tenpai,reason,deltas:room.players.map(()=>0),scores:room.players.map(p=>p.score)};r.finish(room);}
test('dealer win repeats with honba, other win rotates player identity and preserves points',()=>{const a=room();a.players[0].score+=1000;end(a,{win:[0]});assert.equal(a.result.nextRound,'동1국 1본장');r.prepare(a);assert.equal(a.players[0].id,'0');assert.equal(a.players[0].score,26000);end(a,{win:[1]});assert.equal(a.result.nextRound,'동2국 0본장');r.prepare(a);assert.equal(a.players[0].id,'1');assert.equal(a.players[3].score,26000);});
test('exhaustive draw increments honba and carries deposits, dealer tenpai repeats, abortive draw repeats',()=>{const a=room();a.riichiPot=2;end(a,{tenpai:[]});assert.equal(a.result.nextRound,'동2국 1본장');r.prepare(a);assert.equal(a.riichiPot,2);end(a,{tenpai:[0]});assert.equal(a.result.nextRound,'동2국 2본장');r.prepare(a);end(a,{reason:'삼가화 (3인 론)'});assert.equal(a.result.nextRound,'동2국 3본장');});
for(const n of [3,4])test(`${n} players rotate through East only, finish and reset a new match`,()=>{const a=room(n);for(let i=0;i<n;i++){assert.equal(a.roundWind,0);assert.equal(a.handNumber,i%n+1);end(a,{win:[1]});if(i<n-1)r.prepare(a);}assert.equal(a.matchEnded,true);assert.equal(a.matchActive,false);assert.equal(a.result.ranking.length,n);r.prepare(a);assert.equal(a.handNumber,1);assert.equal(a.roundWind,0);assert.equal(a.honba,0);assert.ok(a.players.every(p=>p.score===(n===3?35000:25000)));});
test('negative score ends match once and final riichi pot is awarded once',()=>{const a=room();a.players[1].score=-100;a.riichiPot=2;end(a,{win:[0]});assert.equal(a.matchEnded,true);assert.equal(a.players[0].score,27000);r.finish(a);assert.equal(a.players[0].score,27000);assert.equal(a.riichiPot,0);});
test('nagashi mangan includes honba and takes carried riichi deposits',()=>{const a=room();a.honba=2;a.riichiPot=1;a.players.forEach(p=>{p.hand=[];p.melds=[];});a.discards=[{seat:0,tile:'東'.replace('東','동')},{seat:1,tile:'2만'},{seat:2,tile:'3만'},{seat:3,tile:'4만'}];require('../scoring').endDraw(a);assert.deepEqual(a.result.deltas,[13600,-4200,-4200,-4200]);assert.equal(a.riichiPot,0);r.finish(a);assert.equal(a.result.nextRound,'동1국 3본장');});

test('settlement standings preserve old scores and break ties by initial seat',()=>{
 const room={started:false,matchActive:true,roundWind:0,handNumber:1,honba:0,players:[{name:'A',score:20000,matchOrder:1},{name:'B',score:30000,matchOrder:0},{name:'C',score:25000,matchOrder:2},{name:'D',score:25000,matchOrder:3}],result:{type:'win',winners:[{seat:1}],scores:[20000,30000,25000,25000],deltas:[-5000,5000,0,0]}};
 require('../rounds').finish(room);
 assert.ok(room.result.id);assert.deepEqual(room.result.standings.map(p=>p.seat),[1,2,3,0]);
 assert.deepEqual(room.result.standings.map(p=>p.previousRank),[1,3,4,2]);
 assert.ok(room.result.standings.every(p=>p.before===25000));
 const id=room.result.id;require('../rounds').finish(room);assert.equal(room.result.id,id);
});

for(const n of [3,4])test(`${n} player final East hand repeats until dealer passes`,()=>{
 const a=room(n);a.handNumber=n;
 end(a,{win:[0]});assert.equal(a.matchEnded,false);assert.equal(a.nextRound.handNumber,n);r.prepare(a);
 end(a,{tenpai:[0]});assert.equal(a.matchEnded,false);assert.equal(a.nextRound.honba,2);r.prepare(a);
 end(a,{reason:'四風連打'});assert.equal(a.matchEnded,false);r.prepare(a);
 end(a,{win:[1]});assert.equal(a.matchEnded,true);assert.equal(a.nextRound,null);assert.equal(a.result.endReason,'동풍전 종료');
});
