const {isSanma,playerCount,allowedTile}=require('./rules');
const sanmaHule=require('./vendor/sanma-hule').hule;
const Majiang = require('@kobalab/majiang-core');
const {TILES,countsOf}=require('./bot');
const RULE=Majiang.rule({'赤牌':{m:0,p:0,s:0},'カンドラ後乗せ':false,'最大同時和了数':2});
const NAMES={
 '立直':'리치','ダブル立直':'더블리치','一発':'일발','門前清自摸和':'멘젠쯔모','平和':'핑후','断幺九':'탕야오','一盃口':'이페코',
 '海底摸月':'해저로월','河底撈魚':'하저로어','嶺上開花':'영상개화','槍槓':'창깡','七対子':'치또이츠','三色同順':'삼색동순','一気通貫':'일기통관',
 '混全帯幺九':'찬타','対々和':'또이또이','三暗刻':'삼암각','三槓子':'삼깡즈','三色同刻':'삼색동각','混老頭':'혼노두','小三元':'소삼원','混一色':'혼일색',
 '純全帯幺九':'준찬타','二盃口':'량페코','清一色':'청일색','国士無双':'국사무쌍','国士無双十三面':'국사무쌍 13면대기',
 '四暗刻':'사암각','四暗刻単騎':'사암각 단기','大三元':'대삼원','小四喜':'소사희','大四喜':'대사희','字一色':'자일색','緑一色':'녹일색',
 '清老頭':'청노두','九蓮宝燈':'구련보등','純正九蓮宝燈':'순정구련보등','四槓子':'사깡즈','天和':'천화','地和':'지화',
 '抜きドラ':'빼기도라','ドラ':'도라','裏ドラ':'우라도라','赤ドラ':'적도라','翻牌 白':'역패 백','翻牌 發':'역패 발','翻牌 中':'역패 중',
 '場風 東':'장풍 동','場風 南':'장풍 남','場風 西':'장풍 서','場風 北':'장풍 북',
 '自風 東':'자풍 동','自風 南':'자풍 남','自風 西':'자풍 서','自風 北':'자풍 북'
};
function code(tile){const i=TILES.indexOf(tile);if(i<0)throw Error('Unknown tile');return i<27?'mps'[Math.floor(i/9)]+(i%9+1):'z'+(i-26);}
function direction(seat,from){return ['','+','=','-'][(from-seat+4)%4];}
function meldCode(m,seat){
 const tiles=m.tiles.map(code),s=tiles[0][0],digits=tiles.map(t=>t[1]);
 if(m.type==='ankan')return s+digits.join('');
 const d=direction(seat,m.from),called=code(m.called)[1];
 if(m.type==='chi') {let marked=false;return s+digits.sort().map(n=>{if(!marked&&n===called){marked=true;return n+d}return n}).join('');}
 if(m.type==='kakan')return s+digits.slice(0,3).join('')+d+digits[3];
 return s+digits.join('')+d;
}
function shape(hand,melds,seat){return Majiang.Shoupai.fromString(hand.map(code).join('')+(melds.length?','+melds.map(m=>meldCode(m,seat)).join(','):''));}
function waits(player){
 const melds=player.melds||[];if(player.hand.length!==13-melds.length*3)return [];
 const hand=shape(player.hand,melds.map(m=>({...m,from:3})),0);
 if(Majiang.Util.xiangting(hand)!==0)return [];
 const all=countsOf(player.hand.concat(melds.flatMap(m=>m.tiles),Array(player.nuki||0).fill('북')));
 const candidates=new Set(Majiang.Util.tingpai(hand));
 return TILES.filter((t,i)=>allowedTile(t,player.sanma)&&all[i]<4&&candidates.has(code(t)));
}
function isFuriten(room,seat){const p=room.players[seat];if(p.temporaryFuriten||p.riichiFuriten)return true;const winning=waits(p);return room.discards.some(d=>d.seat===seat&&winning.includes(d.tile));}
function indicators(room){return (room.doraIndicators||[]).slice(0,1+(room.kanCount||0));}
// Core's 1-man indicator points to 2-man; sanma wraps directly to 9-man.
function indicatorCode(room,tile){return isSanma(room)&&tile==='1만'?'m8':code(tile);}
function scoreHand(room,p,hand,ron,param){
 if(!isSanma(room))return Majiang.Util.hule(hand,ron,param);
 const nuki=p.nuki||0;
 param.extraBonuses=[];
 if(nuki){
  param.extraBonuses.push({name:'抜きドラ',fanshu:nuki});
  // Extracted Norths also count as ordinary/ura dora when West is shown.
  const dora=param.baopai.filter(t=>t==='z3').length*nuki;
  const ura=(param.fubaopai||[]).filter(t=>t==='z3').length*nuki;
  if(dora)param.extraBonuses.push({name:'ドラ',fanshu:dora});
  if(ura)param.extraBonuses.push({name:'裏ドラ',fanshu:ura});
 }
 return sanmaHule(hand,ron,param);
}
function evaluateWin(room,seat,{tile,from=null,robKan=false,robAnkan=false}={}){
 const p=room.players[seat],melds=p.melds||[],tsumo=from===null;
 if(!tile || (tsumo?!p.drawn:p.hand.length!==13-melds.length*3))return null;
 if(!tsumo && isFuriten(room,seat))return null;
 const hand=p.hand.slice();
 if(tsumo){const i=hand.lastIndexOf(tile);if(i<0)return null;hand.splice(i,1);hand.push(tile);}
 const total=countsOf(hand.concat(melds.flatMap(m=>m.tiles),tsumo?[]:[tile],Array(p.nuki||0).fill('북')));if(total.some(n=>n>4))return null;
 if(Majiang.Util.xiangting(shape(tsumo?hand:hand.concat(tile),melds,seat))!==-1)return null;
 const first=tsumo&&!room.interrupted&&!room.discards.some(d=>d.seat===seat);
 const param=Majiang.Util.hule_param({rule:RULE,zhuangfeng:room.roundWind||0,menfeng:seat,
  lizhi:p.riichi?(p.doubleRiichi?2:1):0,yifa:Boolean(p.riichi&&p.ippatsu),
  qianggang:robKan&&!robAnkan,lingshang:tsumo&&Boolean(p.rinshan),
  haidi:!room.wall.length&&!robKan&&!(tsumo?(p.rinshan||p.nukiDraw):room.lastDiscardRinshan)?(tsumo?1:2):0,
  tianhu:first?(seat===0&&room.discards.length===0?1:seat!==0?2:0):0,
  baopai:indicators(room).map(t=>indicatorCode(room,t)),fubaopai:p.riichi?(room.uraIndicators||[]).slice(0,1+(room.kanCount||0)).map(t=>indicatorCode(room,t)):[],
  changbang:room.honba||0,lizhibang:0});
 const result=scoreHand(room,p,shape(hand,melds,seat),tsumo?null:code(tile)+direction(seat,from),param);
 if(!result?.hupai?.length || !result.defen)return null;
 if(robAnkan&&!result.hupai.some(y=>y.name.startsWith('国士無双')))return null;
 return {seat,from,tile,method:tsumo?'tsumo':'ron',hand:tsumo?hand:hand.concat(tile),melds,
  yaku:result.hupai.map(y=>({name:NAMES[y.name]||y.name,han:typeof y.fanshu==='number'?y.fanshu:null,yakuman:typeof y.fanshu==='string'?y.fanshu.length:0})),
  han:result.fanshu||0,fu:result.fu||0,yakuman:result.damanguan||0,points:result.defen,deltas:result.fenpei};
}
function settleWins(room,seats,context={}){
 const results=seats.map(seat=>evaluateWin(room,seat,context));if(results.some(r=>!r))return false;
 // A declaration discarded into ron never establishes riichi or its deposit.
 const last=room.discards.at(-1);
 if(context.from!==null && context.from!==undefined && !context.robKan && last?.riichi){const p=room.players[context.from];p.score+=1000;p.riichi=false;room.riichiPot--;}
 const deltas=Array(playerCount(room)).fill(0);results.forEach(r=>r.deltas.forEach((v,i)=>deltas[i]+=v));
 const pot=(room.riichiPot||0)*1000;deltas[seats[0]]+=pot;
 room.players.forEach((p,i)=>p.score+=deltas[i]);room.riichiPot=0;
 room.started=false;room.pendingCall=null;room.result={type:'win',winners:results,deltas,names:room.players.map(p=>p.name),scores:room.players.map(p=>p.score),pot,doraIndicators:indicators(room),uraIndicators:results.some(r=>room.players[r.seat].riichi)?(room.uraIndicators||[]).slice(0,1+room.kanCount):[]};
 room.message=results.map(r=>`${room.players[r.seat].name} ${r.method==='ron'?'론':'쯔모'} · ${r.points.toLocaleString()}점`).join(' / ');
 return true;
}
function endDraw(room,reason='패산 소진'){
 const deltas=Array(playerCount(room)).fill(0);let nagashi=[];let tenpai=[];
 if(reason==='패산 소진'){
  nagashi=room.players.map((p,i)=>i).filter(i=>{
   const discards=room.discards.filter(d=>d.seat===i);
   return !room.players[i].melds.length&&discards.length&&discards.every(d=>d.calledBy===undefined&&(/^[19]/.test(d.tile)||d.tile.length===1));
  });
  if(nagashi.length){for(const seat of nagashi)for(let i=0;i<playerCount(room);i++)if(i!==seat){const pay=seat===0||i===0?4000:2000;deltas[i]-=pay;deltas[seat]+=pay;}}
  else {tenpai=room.players.map((p,i)=>waits(p).length?i:-1).filter(i=>i>=0);if(tenpai.length&&tenpai.length<playerCount(room))room.players.forEach((p,i)=>deltas[i]=tenpai.includes(i)?(isSanma(room)?2000:3000)/tenpai.length:-(isSanma(room)?2000:3000)/(playerCount(room)-tenpai.length));}
 }
 room.players.forEach((p,i)=>p.score+=deltas[i]);room.started=false;room.pendingCall=null;
 room.result={type:'draw',reason,nagashi,tenpai,deltas,names:room.players.map(p=>p.name),scores:room.players.map(p=>p.score),winners:[]};
 room.message=nagashi.length?'유국 · 유국만관 정산':`유국 · ${reason}`;
}
module.exports={evaluateWin,settleWins,endDraw,isFuriten,waits,indicators,code,shape,NAMES,RULE};

// Unknown copies, not the hidden live-wall count. Claimed discards are in melds.
function waitDetails(room,seat){
 const player=room.players[seat];
 const visible=player.hand.concat(room.discards.filter(d=>d.calledBy===undefined).map(d=>d.tile),room.players.flatMap(p=>(p.melds||[]).flatMap(m=>m.tiles)),indicators(room),room.players.flatMap(p=>Array(p.nuki||0).fill('북')));
 const counts=countsOf(visible);
 return waits({...waitingPlayer(player),sanma:isSanma(room)}).map(tile=>({tile,remaining:Math.max(0,4-counts[TILES.indexOf(tile)])}));
}
module.exports.waitDetails=waitDetails;

// Compare every current wait under ordinary ron/tsumo; never inspect hidden tiles.
function waitYakuGuide(room,seat){
 const p=waitingPlayer(room.players[seat]),tiles=waits({...p,sanma:isSanma(room)}),scenarios=[];
 for(const tile of tiles)for(const tsumo of [false,true]){
  const param=Majiang.Util.hule_param({rule:RULE,zhuangfeng:room.roundWind||0,menfeng:seat,lizhi:p.riichi?(p.doubleRiichi?2:1):0,baopai:[],fubaopai:[]});
  const result=scoreHand(room,p,shape(tsumo?p.hand.concat(tile):p.hand,p.melds||[],seat),tsumo?null:code(tile)+direction(seat,(seat+1)%playerCount(room)),param);
  const yaku=(result?.hupai||[]).map(y=>({name:NAMES[y.name]||y.name,han:typeof y.fanshu==='number'?y.fanshu:0,yakuman:typeof y.fanshu==='string'?y.fanshu.length:0}));
  scenarios.push({tile,method:tsumo?'쯔모':'론',yaku,han:result?.fanshu||0,yakuman:result?.damanguan||0});
 }
 const guaranteed=[],possible=[];
 for(const name of new Set(scenarios.flatMap(s=>s.yaku.map(y=>y.name)))){
  const matches=scenarios.map(s=>s.yaku.find(y=>y.name===name));
  const found=matches.filter(Boolean),entry={...found[0],han:Math.min(...found.map(y=>y.han)),yakuman:Math.min(...found.map(y=>y.yakuman))};
  if(matches.every(Boolean))guaranteed.push(entry);
  else possible.push({...entry,condition:scenarios.filter((s,i)=>matches[i]).map(s=>`${s.tile} ${s.method}`).join(' / ')});
 }
 if(tiles.length&&scenarios.some(s=>!s.yakuman)&&p.riichi&&p.ippatsu)possible.push({name:'일발',han:1,yakuman:0,condition:'일발 유효 기간에 울기 없이 화료'});
 if(tiles.length&&scenarios.some(s=>!s.yakuman)&&!p.riichi&&!(p.melds||[]).some(m=>m.type!=='ankan')&&p.score>=1000&&room.wall.length>=(isSanma(room)?3:4))possible.push({name:'리치',han:1,yakuman:0,condition:'현재 대기를 유지하며 리치 선언'});
 return {afterDraw:p!==room.players[seat],guaranteed,possible,totals:tiles.map(tile=>({tile,ron:scenarios.find(s=>s.tile===tile&&s.method==='론'),tsumo:scenarios.find(s=>s.tile===tile&&s.method==='쯔모')}))};
}
module.exports.waitYakuGuide=waitYakuGuide;

function waitingPlayer(player){
 if(player.drawn&&player.hand.length===14-3*(player.melds||[]).length){
  const hand=player.hand.slice(),i=hand.lastIndexOf(player.drawn);
  if(i>=0){hand.splice(i,1);return {...player,hand};}
 }
 return player;
}
