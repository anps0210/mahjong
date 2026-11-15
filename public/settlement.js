// One lightweight scene per server result; repeated room snapshots never restart it.
let settlement=null;
const settlementSeen=new Set();
try { JSON.parse(sessionStorage.getItem('mahjong.settlementSeen')||'[]').forEach(id=>settlementSeen.add(id)); } catch {}
function closeSettlement(){
 if(!settlement)return;
 cancelAnimationFrame(settlement.frame);clearTimeout(settlement.timer);
 settlement.node.remove();settlement=null;
 document.body.classList.remove('settling');
 document.querySelector('main').inert=false;
 if(roomState&&!roomState.started)show('lobby');
}
function openSettlement(room,details){
 const r=room.result;
 if(r?.nextRound&&settlementSeen.has(r.id)){socket.emit('game:settlement-done',{id:r.id});return;}
 if(!r?.id||!r.standings?.length||settlement?.id===r.id||settlementSeen.has(r.id))return;
 closeSettlement();
 const node=document.createElement('section');node.className='settlement-scene';node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.setAttribute('aria-label','대국 결산');
 settlement={id:r.id,node,frame:0,timer:0,stage:'detail'};
 document.body.append(node);document.body.classList.add('settling');document.querySelector('main').inert=true;
 const title=r.type==='win'?'화료':r.nagashi?.length?'유국만관':'유국';
 node.innerHTML=`<header class="settlement-heading"><span>${escapeHtml(r.round||room.roundLabel||'')}</span><h1>${title}</h1><span>${room.playerCount||4}인 마작</span></header><div class="settlement-detail">${details}</div><footer class="settlement-footer"><span>화료 내역을 확인해 주세요</span><button type="button">점수 변동 확인 →</button></footer>`;
 node.querySelector('button').onclick=()=>showSettlementScores(room);
 node.querySelector('button').focus();
 settlement.timer=setTimeout(()=>{if(settlement?.id===r.id&&settlement.stage==='detail')showSettlementScores(room);},5500*Math.max(1,r.winners?.length||0));
}
function showSettlementScores(room){
 const scene=settlement;if(!scene)return;
 clearTimeout(scene.timer);
 const r=room.result,rows=r.standings,node=scene.node;scene.stage='scores';
 node.innerHTML=`<header class="settlement-heading"><span>${escapeHtml(r.round||'')}</span><h1>점수 정산</h1><span>${r.matchEnded?'대국 종료':r.repeat?'친 연장':'친 교대'}</span></header><div class="settlement-ranking" style="--players:${rows.length}">${rows.map(p=>`<article class="settlement-row ${p.seat===mySeat?'is-me':''}" data-seat="${p.seat}" style="--rank:${p.previousRank-1}"><span class="settlement-rank">${p.previousRank}</span><div class="settlement-name"><strong>${escapeHtml(p.name)}</strong><small>${p.seat===mySeat?'나 · ':''}<span class="rank-movement">${p.previousRank}위 → ${p.rank}위</span></small></div><div class="settlement-points"><b>${p.before.toLocaleString()}</b><span class="${p.delta>=0?'positive':'negative'}">${p.delta>0?'+':''}${p.delta.toLocaleString()}</span></div></article>`).join('')}</div><footer class="settlement-footer"><span>${r.matchEnded?'최종 순위를 확인해 주세요':escapeHtml(r.nextRound||'국 종료')}</span><button type="button">${r.matchEnded?'최종 순위 →':'확인'}</button></footer>`;
 const elements=rows.map(p=>({p,el:node.querySelector(`[data-seat="${p.seat}"]`)}));
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 let start=null;
 function tick(now){
  if(settlement!==scene)return;
  start??=now;const t=reduced?1:Math.min(1,(now-start)/1200),ease=1-(1-t)**3;
  for(const {p,el} of elements)el.querySelector('.settlement-points b').textContent=Math.round(p.before+p.delta*ease).toLocaleString();
  if(t<1)scene.frame=requestAnimationFrame(tick);
  else for(const {p,el} of elements){el.style.setProperty('--rank',p.rank-1);el.querySelector('.settlement-rank').textContent=p.rank;el.classList.toggle('rank-first',p.rank===1);}
 }
 scene.frame=requestAnimationFrame(tick);
 node.querySelector('button').onclick=()=>{
  cancelAnimationFrame(scene.frame);
  if(r.matchEnded)showFinalSettlement(room);else awaitNextRound(r.id);
 };
 if(!r.matchEnded){node.querySelector('button').textContent='자동 진행';node.querySelector('button').disabled=true;}
 node.querySelector('button').focus();
 scene.timer=setTimeout(()=>{if(settlement!==scene)return;if(r.matchEnded)showFinalSettlement(room);else awaitNextRound(r.id);},3000);
}
function showFinalSettlement(room){
 const scene=settlement;if(!scene)return;clearTimeout(scene.timer);cancelAnimationFrame(scene.frame);scene.stage='final';
 const r=room.result,rows=r.standings,winner=rows[0];
 scene.node.innerHTML=`<header class="settlement-heading"><span>${escapeHtml(r.endReason||'동풍전 종료')}</span><h1>대국 종료</h1><span>FINAL RESULT</span></header><div class="settlement-final"><div class="settlement-champion"><span>1st</span><h2>${escapeHtml(winner.name)}</h2><strong>${winner.score.toLocaleString()}<small> 점</small></strong><p>최종 1위</p></div><ol class="final-standings">${rows.map(p=>`<li class="${p.rank===1?'rank-first':''} ${p.seat===mySeat?'is-me':''}"><b>${p.rank}</b><div><strong>${escapeHtml(p.name)}${p.seat===mySeat?' · 나':''}</strong><small>${p.previousRank===p.rank?'순위 유지':`${p.previousRank}위 → ${p.rank}위`}</small></div><span>${p.score.toLocaleString()}<small>점</small></span></li>`).join('')}</ol></div><footer class="settlement-footer"><span>${r.finalPot?`남은 공탁 ${r.finalPot.toLocaleString()}점은 1위에게 지급되었습니다.`:'대국이 종료되었습니다.'}</span><button type="button">메인 화면으로</button></footer>`;
 scene.node.querySelector('button').onclick=()=>returnToMain(r.id);scene.node.querySelector('button').focus();
}
function finishSettlement(id){
 settlementSeen.add(id);try {sessionStorage.setItem('mahjong.settlementSeen',JSON.stringify([...settlementSeen].slice(-30)));}catch{}
 closeSettlement();document.getElementById('start').focus();
}

let winIntro=null;
const winIntroSeen=new Set();
try { JSON.parse(sessionStorage.getItem('mahjong.winIntroSeen')||'[]').forEach(id=>winIntroSeen.add(id)); } catch {}
function closeWinIntro(){
 if(!winIntro)return;
 winIntro.timers.forEach(clearTimeout);winIntro.node.remove();winIntro=null;
}
function startWinIntro(room){
 const r=room.result;
 if(!r?.id||r.type!=='win'||!r.winners?.length)return false;
 if(winIntro?.id===r.id)return true;
 if(winIntroSeen.has(r.id)||settlementSeen.has(r.id))return false;
 closeWinIntro();winIntroSeen.add(r.id);
 try {sessionStorage.setItem('mahjong.winIntroSeen',JSON.stringify([...winIntroSeen].slice(-30)));}catch{}
 const node=document.createElement('div');node.className='win-intro';document.body.append(node);
 winIntro={id:r.id,node,timers:[]};const scene=winIntro;
 const reveals=r.winners.map(w=>{
  const position=seatLayout().find(p=>p.seat===w.seat)?.position||'bottom';
  const selector=w.seat===mySeat?'#hand button':`.opponent-hand[data-seat="${w.seat}"] .tile-back`;
  const slots=[...document.querySelectorAll(selector)].map(el=>({rect:el.getBoundingClientRect(),drawn:el.matches('.drawn,.drawn-back')}));
  const tiles=[...w.hand];const i=tiles.lastIndexOf(w.tile);if(i>=0)tiles.splice(i,1);
  tiles.sort((a,b)=>tileOrder(a)-tileOrder(b));
  const drawnSlot=slots.findIndex(s=>s.drawn);
  if(w.method==='tsumo')tiles.splice(drawnSlot>=0?drawnSlot:tiles.length,0,w.tile);
  const group=document.createElement('div');group.className='table-win-reveal';group.dataset.seat=w.seat;
  const faces=tiles.map((tile,i)=>{
   const slot=slots[i];if(!slot)return null;
   const face=document.createElement('div');face.className=`flat-winning-tile flat-${position}`;
   const rect=slot.rect,side=position==='left'||position==='right',width=side?rect.height/1.7:rect.width;
   face.style.cssText=`left:${rect.left+rect.width/2}px;top:${rect.top+rect.height/2}px;width:${width}px;--flat-angle:${position==='left'?90:position==='right'?-90:position==='top'?180:0}deg`;
   face.innerHTML=tileFace(tile);face.hidden=true;group.append(face);return face;
  });
  node.append(group);
  const mask=document.createElement('style');node.append(mask);
  const root=w.seat===mySeat?'#hand':`.opponent-hand[data-seat="${w.seat}"]`;
  const reveal=()=>{mask.textContent=`${root}{visibility:hidden!important}`;faces.forEach(f=>{if(f)f.hidden=false;});};
  showDeclaration({id:`${r.id}-${w.seat}-win`,seat:w.seat,action:w.method,name:r.names?.[w.seat]||room.players[w.seat]?.name});
  const target=w.method==='ron'?document.querySelector('.river .tile.latest'):document.querySelector(w.seat===mySeat?'#hand button.drawn':`${root} .drawn-back`);
  const rect=target?.getBoundingClientRect();
  return {w,faces,drawnSlot,root,mask,reveal,rect};
 });
 // Declaration first, then strike the actual discarded/drawn tile. No duplicate floating tile.
 scene.timers.push(setTimeout(()=>{
  if(winIntro!==scene)return;
  document.querySelectorAll(".declaration-ron,.declaration-tsumo").forEach(el=>el.remove());
  for(const v of reveals){
   if(v.w.method==='tsumo'){
    const index=v.drawnSlot>=0?v.drawnSlot:v.faces.length-1;
    if(v.faces[index])v.faces[index].hidden=false;
    v.mask.textContent=`${v.root} .drawn-back,${v.root} button.drawn{visibility:hidden!important}`;
   }
   const rect=v.rect;if(!rect?.width)continue;
   const flash=document.createElement('div');flash.className='winning-strike';flash.style.left=(rect.left+rect.width/2)+'px';flash.style.top=(rect.top+rect.height/2)+'px';
   flash.innerHTML='<svg viewBox="0 0 100 220" aria-hidden="true"><path d="M65 0L35 70 60 65 28 130 52 120 45 205"/><path d="M35 70L12 85 22 120M28 130L77 150 90 183"/></svg>';
   node.append(flash);
  }
 },2000));
 scene.timers.push(setTimeout(()=>{
  if(winIntro!==scene)return;
  document.querySelectorAll('.declaration-ron,.declaration-tsumo').forEach(el=>el.remove());
  reveals.forEach(v=>v.reveal());
 },2600));
 scene.timers.push(setTimeout(()=>{
  if(winIntro!==scene)return;
  closeWinIntro();if(roomState?.result?.id===r.id)renderResult(roomState);controls();
 },4600));
 return true;
}

function awaitNextRound(id){
 if(!settlement||settlement.id!==id)return;
 clearTimeout(settlement.timer);cancelAnimationFrame(settlement.frame);settlement.stage='waiting';
 settlement.node.querySelector('.settlement-footer').innerHTML='<span>다른 참가자의 정산이 끝나면 다음 국이 자동으로 시작됩니다.</span>';
 socket.emit('game:settlement-done',{id});
}
function showNextRound(event){
 if(!settlement||settlement.id!==event.id)return;
 settlement.node.innerHTML=`<div class="next-round-title"><small>다음 대국</small><h1>${escapeHtml(event.label)}</h1></div>`;
}
function settlementDetails(room){
 const r=room.result;
 if(!r.winners?.length)return `<div class="clean-draw"><h2>${r.nagashi?.length?'유국만관':'유국'}</h2><p>${escapeHtml(r.reason||'')}</p><p>텐파이: ${(r.tenpai||[]).map(i=>escapeHtml(r.names?.[i]||room.players[i]?.name||'')).join(' · ')||'없음'}</p></div>`;
 return r.winners.map(w=>{
  const limit=w.yakuman?`${w.yakuman>1?w.yakuman+'배 ':''}역만`:w.han>=13?'헤아림 역만':w.han>=11?'삼배만':w.han>=8?'배만':w.han>=6?'하네만':w.han>=5||(w.han===4&&w.fu>=40)||(w.han===3&&w.fu>=70)?'만관':'화료';
  return `<article class="clean-win winner-result"><div class="win-owner"><strong>${escapeHtml(r.names?.[w.seat]||room.players[w.seat]?.name||'')}</strong><span>${w.method==='ron'?'론':'쯔모'}</span></div><div class="winning-hand">${[...w.hand].sort((a,b)=>tileOrder(a)-tileOrder(b)).map(t=>tileFace(t)).join('')}${w.melds.map(m=>`<span class="result-meld">${m.tiles.map(t=>tileFace(t)).join('')}</span>`).join('')}</div><div class="result-indicators">${(r.doraIndicators||[]).length?`도라 ${(r.doraIndicators||[]).map(t=>tileFace(t)).join('')}`:''}${r.uraIndicators?.length?`<span>우라도라</span>${r.uraIndicators.map(t=>tileFace(t)).join('')}`:''}</div><div class="win-breakdown"><ul class="clean-yaku">${w.yaku.map(y=>`<li><span>${escapeHtml(y.name)}</span><b>${y.yakuman?`${y.yakuman}배 역만`:`${y.han}판`}</b></li>`).join('')}</ul><div class="win-total"><strong>${limit}</strong><p>${w.yakuman?'역만':`${w.fu}부 · ${w.han}판`}</p><b>${w.points.toLocaleString()}<small>점</small></b></div></div></article>`;
 }).join('');
}

function returnToMain(id){
 const button=settlement?.node.querySelector('button');if(button)button.disabled=true;
 socket.timeout(5000).emit('room:leave-finished',(error,res)=>{
  if(error||!res?.ok){if(button){button.disabled=false;button.textContent='다시 시도 · 메인 화면으로';}return;}
  saveSession(null);roomState=null;roomCode=null;myHand=[];mySeat=-1;lastDiscards=[];augmentState={cards:[],draft:null};
  closeWinIntro();closeSettlement();show('home');renderAugments();controls();
  $('homeError').textContent='';$('create').focus();
 });
}
