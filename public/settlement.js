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
 const r=room.result;if(!r?.id||!r.standings?.length||settlement?.id===r.id||settlementSeen.has(r.id))return;
 closeSettlement();
 const node=document.createElement('section');node.className='settlement-scene';node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.setAttribute('aria-label','대국 결산');
 settlement={id:r.id,node,frame:0,timer:0,stage:'detail'};
 document.body.append(node);document.body.classList.add('settling');document.querySelector('main').inert=true;
 const title=r.type==='win'?'화료':r.nagashi?.length?'유국만관':'유국';
 node.innerHTML=`<header class="settlement-heading"><span>${escapeHtml(r.round||room.roundLabel||'')}</span><h1>${title}</h1><span>${room.playerCount||4}인 마작</span></header><div class="settlement-detail">${details}</div><footer class="settlement-footer"><span>화료 내역을 확인해 주세요</span><button type="button">점수 변동 확인 →</button></footer>`;
 node.querySelector('button').onclick=()=>showSettlementScores(room);
 node.querySelector('button').focus();
}
function showSettlementScores(room){
 const scene=settlement;if(!scene)return;
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
  if(r.matchEnded)showFinalSettlement(room);else finishSettlement(r.id);
 };
 node.querySelector('button').focus();
}
function showFinalSettlement(room){
 const scene=settlement;if(!scene)return;scene.stage='final';
 const r=room.result,rows=r.standings,winner=rows[0];
 scene.node.innerHTML=`<header class="settlement-heading"><span>${escapeHtml(r.endReason||'남장 종료')}</span><h1>대국 종료</h1><span>FINAL RESULT</span></header><div class="settlement-final"><div class="settlement-champion"><span>1st</span><h2>${escapeHtml(winner.name)}</h2><strong>${winner.score.toLocaleString()}<small> 점</small></strong><p>최종 1위</p></div><ol class="final-standings">${rows.map(p=>`<li class="${p.rank===1?'rank-first':''} ${p.seat===mySeat?'is-me':''}"><b>${p.rank}</b><div><strong>${escapeHtml(p.name)}${p.seat===mySeat?' · 나':''}</strong><small>${p.previousRank===p.rank?'순위 유지':`${p.previousRank}위 → ${p.rank}위`}</small></div><span>${p.score.toLocaleString()}<small>점</small></span></li>`).join('')}</ol></div><footer class="settlement-footer"><span>${r.finalPot?`남은 공탁 ${r.finalPot.toLocaleString()}점은 1위에게 지급되었습니다.`:'대국이 종료되었습니다.'}</span><button type="button">대기실로</button></footer>`;
 scene.node.querySelector('button').onclick=()=>finishSettlement(r.id);scene.node.querySelector('button').focus();
}
function finishSettlement(id){
 settlementSeen.add(id);try {sessionStorage.setItem('mahjong.settlementSeen',JSON.stringify([...settlementSeen].slice(-30)));}catch{}
 closeSettlement();document.getElementById('start').focus();
}
