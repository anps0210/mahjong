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
 const winner=room.result?.winners?.find(w=>w.special?.name==='Furioso-Replica')||room.result?.winners?.find(w=>w.special?.name==='경화수월');
 const furioso=winner?.special?.name==='Furioso-Replica';
 if(!winner||!room.result.id)return false;
 if(kyokaActive?.resultId===room.result.id)return true;
 if(kyokaSeen.has(room.result.id))return false;
 finishKyoka();
 kyokaSeen.add(room.result.id);
 try { sessionStorage.setItem('mahjong.kyokaSeen',JSON.stringify([...kyokaSeen].slice(-20))); } catch {}
 const node=document.createElement('div');
 node.className='kyoka-scene'+(furioso?' furioso-scene':'');node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.setAttribute('aria-label',furioso?'Furioso-Replica 역만 연출':'경화수월 역만 연출');
 const apparent=winner.special.discardedSuit==='통'?'삭수':'통수';
 const lines=furioso?['딸...','알고 있지?','예측은...','의미 없다는 걸.']:['그런가...',`${apparent} 일색으로 보였는가...`,'깨져라,','경화수월.'];
 node.innerHTML=lines.map((line,i)=>`<p class="kyoka-line ${i===3?'final':''}" style="--delay:${i*1.7}s">${line}</p>`).join('')+
 '<img class="kyoka-image" src="/effects/kyoka-suigetsu.jpg" alt="경화수월 화료 이미지">'+
 '<svg class="kyoka-cracks" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><path d="M510 290L452 232 415 164 300 0M510 290L575 230 635 205 720 105 780 0M510 290L624 315 713 275 850 300 1000 245M510 290L548 395 610 440 650 600M510 290L438 365 400 460 300 600M510 290L355 304 240 350 0 310M510 290L476 190 510 100 480 0M510 290L675 425 820 460 1000 600M452 232L365 240 355 304M575 230L585 125 510 100M624 315L645 370 548 395M438 365L330 430 240 350M713 275L750 190 850 170M400 460L500 490 610 440M415 164L280 150 195 45M675 425L700 520 650 600M355 304L310 275 190 240 0 150"/></svg>'+
 '<div class="kyoka-flash" aria-hidden="true"></div><button class="kyoka-skip" type="button">연출 건너뛰기</button>';
 if(furioso){node.querySelectorAll('.kyoka-image,.kyoka-cracks,.kyoka-flash').forEach(e=>e.remove());node.insertAdjacentHTML('beforeend',furiosoSlashes());}
 else node.querySelector('img').onerror=e=>{e.currentTarget.hidden=true;};
 document.body.append(node);
 document.querySelector('main').inert=true;
 kyokaActive={node,resultId:room.result.id,timer:setTimeout(finishKyoka,furioso?16500:8800)};
 node.querySelector('button').onclick=finishKyoka;
 node.querySelector('button').focus({preventScroll:true});
 node.addEventListener('keydown',e=>{if(e.key==='Escape')finishKyoka();});
 return true;
}

function furiosoSlashes(){
 // Quadratic paths also locate the petals along the actual slash, rather than across the screen at random.
 const cuts=[
  {at:6.8,p:[80,80,470,330,960,540]},
  {at:6.98,p:[950,45,490,340,70,550]},
  {at:7.16,p:[-70,350,490,190,1090,275]},
  {at:7.34,p:[340,-70,530,280,670,690]},
  {at:8.0,p:[-100,620,490,220,1100,-40],kind:'heavy'},
  {at:8.8,p:[370,-80,490,290,630,680]},
  {at:8.98,p:[650,-80,530,290,390,680]},
  {at:11.2,p:[1140,-100,470,300,-120,690],kind:'finisher'}
 ];
 const colors=['#c6f7ff','#168dff','#164ba6'];
 const slashes=cuts.map(({at,p,kind=''})=>{
  const d=`M${p[0]} ${p[1]} Q${p[2]} ${p[3]} ${p[4]} ${p[5]}`;
  const count=kind==='finisher'?32:kind==='heavy'?22:14;
  const petals=Array.from({length:count},(_,i)=>{
   const t=(i+1)/(count+1),u=1-t;
   const x=u*u*p[0]+2*u*t*p[2]+t*t*p[4],y=u*u*p[1]+2*u*t*p[3]+t*t*p[5];
   const dx=((i*47)%137-68)*(kind==='finisher'?2:1),dy=30+(i*31)%100;
   return `<g transform="translate(${x} ${y})"><path class="furioso-petal" d="M0 -8 C9 -6 9 4 0 9 C-5 4 -6 -3 0 -8Z" fill="${colors[i%3]}" style="--petal-delay:${at+.06+t*.04}s;--petal-life:${kind==='finisher'?1.9:.85}s;--dx:${dx}px;--dy:${dy}px;--spin:${i%2?240:-210}deg;--size:${.6+(i%4)*.22}"/></g>`;
  }).join('');
  return `<g class="furioso-impact ${kind}" style="--cut-delay:${at}s"><g class="furioso-cut ${kind}"><path class="slash-glow" pathLength="100" d="${d}"/><path class="slash-edge" pathLength="100" d="${d}"/></g></g>${petals}`;
 }).join('');
 return '<svg class="furioso-cuts" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">'+slashes+
 '<g class="furioso-cross"><path class="cross-halo" d="M365 130L685 530M300 330L700 270"/><path class="cross-core" d="M365 130L685 530M300 330L700 270"/><circle cx="500" cy="300" r="8" fill="#fff"/></g></svg><p class="furioso-complete"><em>[비프음]</em> 대행 완료.</p>';
}
