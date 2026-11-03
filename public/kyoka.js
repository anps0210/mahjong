// Result ids make reconnects and duplicate snapshots idempotent.
let kyokaActive=null;
const kyokaSeen=new Set();
try { JSON.parse(sessionStorage.getItem('mahjong.kyokaSeen')||'[]').forEach(id=>kyokaSeen.add(id)); } catch {}
function finishKyoka(){
 if(!kyokaActive)return;
 const {node,timer,resultId}=kyokaActive;
 clearTimeout(timer);node.remove();kyokaActive=null;
 document.querySelector('main').inert=false;
 if(roomState?.result?.id===resultId)renderResult(roomState);
 controls();
}
function startKyoka(room){
 const winner=room.result?.winners?.find(w=>w.special?.name==='경화수월');
 if(!winner||!room.result.id)return false;
 if(kyokaActive?.resultId===room.result.id)return true;
 if(kyokaSeen.has(room.result.id))return false;
 finishKyoka();
 kyokaSeen.add(room.result.id);
 try { sessionStorage.setItem('mahjong.kyokaSeen',JSON.stringify([...kyokaSeen].slice(-20))); } catch {}
 const node=document.createElement('div');
 node.className='kyoka-scene';node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.setAttribute('aria-label','경화수월 역만 연출');
 const apparent=winner.special.discardedSuit==='통'?'삭수':'통수';
 const lines=['그런가...',`${apparent} 일색으로 보였는가...`,'깨져라,','경화수월.'];
 node.innerHTML=lines.map((line,i)=>`<p class="kyoka-line ${i===3?'final':''}" style="--delay:${i*1.7}s">${line}</p>`).join('')+
 '<img class="kyoka-image" src="/effects/kyoka-suigetsu.jpg" alt="경화수월 화료 이미지">'+
 '<svg class="kyoka-cracks" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><path d="M510 290L452 232 415 164 300 0M510 290L575 230 635 205 720 105 780 0M510 290L624 315 713 275 850 300 1000 245M510 290L548 395 610 440 650 600M510 290L438 365 400 460 300 600M510 290L355 304 240 350 0 310M510 290L476 190 510 100 480 0M510 290L675 425 820 460 1000 600M452 232L365 240 355 304M575 230L585 125 510 100M624 315L645 370 548 395M438 365L330 430 240 350M713 275L750 190 850 170M400 460L500 490 610 440M415 164L280 150 195 45M675 425L700 520 650 600M355 304L310 275 190 240 0 150"/></svg>'+
 '<div class="kyoka-flash" aria-hidden="true"></div><button class="kyoka-skip" type="button">연출 건너뛰기</button>';
 node.querySelector('img').onerror=e=>{e.currentTarget.hidden=true;};
 document.body.append(node);
 document.querySelector('main').inert=true;
 kyokaActive={node,resultId:room.result.id,timer:setTimeout(finishKyoka,8800)};
 node.querySelector('button').onclick=finishKyoka;
 node.querySelector('button').focus({preventScroll:true});
 node.addEventListener('keydown',e=>{if(e.key==='Escape')finishKyoka();});
 return true;
}
