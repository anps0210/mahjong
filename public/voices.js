const VOICE_NAMES={milk:'미루쿠', '03':'언니', '02':'소년', '01':'소녀'};
const VOICE_ACTIONS=['chii','pon','kan','reach','ron','tsumo'];
let selectedVoice='milk',voicesEnabled=true,voiceFiles=null,voiceContext=null,voiceGeneration=0;
let voiceQueue=Promise.resolve(),voiceSource=null;
const voiceBuffers=new Map(),heardVoices=new Set();
try {selectedVoice=localStorage.getItem('mahjong.voice')||'milk';voicesEnabled=localStorage.getItem('mahjong.voicesEnabled')!=='false';}catch{}
if(!VOICE_NAMES[selectedVoice])selectedVoice='milk';
const voiceSelect=document.getElementById('voiceCharacter');
voiceSelect.innerHTML=Object.entries(VOICE_NAMES).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');voiceSelect.value=selectedVoice;
function voiceStatus(text){document.getElementById('voicePackStatus').textContent=text;}
function updateVoiceToggle(){const b=document.getElementById('voiceToggle');b.textContent=voicesEnabled?'음성 켜짐':'음성 꺼짐';b.setAttribute('aria-pressed',String(voicesEnabled));}
updateVoiceToggle();
function stopVoices(){voiceGeneration++;try{voiceSource?.stop();}catch{}voiceSource=null;voiceQueue=Promise.resolve();}
async function unlockVoices(){
 const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
 voiceContext ||= new Audio();
 if(voiceContext.state==='suspended')try{await voiceContext.resume();}catch{}
}
document.addEventListener('pointerdown',unlockVoices,{passive:true});document.addEventListener('keydown',unlockVoices);
async function voiceStore(value){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('mahjong-local-voices',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('packs');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   const db=request.result,tx=db.transaction('packs',value?'readwrite':'readonly');
   const r=value?tx.objectStore('packs').put(value,'booth01'):tx.objectStore('packs').get('booth01');
   tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onerror=()=>{db.close();reject(tx.error);};
  };
 });
}
voiceStore().then(files=>{if(files&&!voiceFiles){voiceFiles=files;voiceStatus('음성팩 준비됨 · 이 브라우저에 저장됨');}}).catch(()=>{});
document.getElementById('voicePackFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>25*1024*1024)throw Error('25MB 이하 ZIP을 선택해 주세요.');
  voiceStatus('음성팩을 확인하고 있어요…');
  const pattern=/voice_(milk|01|02|03)_(chii|pon|kan|reach|ron|tsumo)\.wav$/;
  const unpacked=fflate.unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:f=>pattern.test(f.name)&&f.originalSize<2*1024*1024});
  const files={};
  for(const [name,bytes]of Object.entries(unpacked)){const m=name.match(pattern);if(m){const key=m[1]+'/'+m[2];if(files[key])throw Error('중복 음성이 있는 ZIP입니다.');files[key]=bytes;}}
  if(Object.keys(files).length!==24)throw Error('4캐릭터 × 6대사가 포함된 원본 음성팩 ZIP을 선택해 주세요.');
  stopVoices();voiceFiles=files;voiceBuffers.clear();await unlockVoices();
  try{await voiceStore(files);voiceStatus('음성팩 준비됨 · 이 브라우저에 저장됨');}catch{voiceStatus('음성팩 준비됨 · 저장 공간 제한으로 다음 접속 시 다시 불러와 주세요.');}
 }catch(error){voiceStatus(error.message||'음성팩을 읽지 못했어요.');}finally{e.target.value='';}
};
function playCharacterVoice(event){
 if(!VOICE_NAMES[event.voice]||!VOICE_ACTIONS.includes(event.action))return;
 if(event.id){if(heardVoices.has(event.id))return;heardVoices.add(event.id);if(heardVoices.size>200)heardVoices.delete(heardVoices.values().next().value);}
 if(!voicesEnabled||!voiceFiles||voiceContext?.state!=='running')return;
 const generation=voiceGeneration,key=event.voice+'/'+event.action;
 voiceQueue=voiceQueue.catch(()=>{}).then(async()=>{
  if(generation!==voiceGeneration||!voicesEnabled)return;
  let buffer=voiceBuffers.get(key);
  if(!buffer){const bytes=voiceFiles[key];if(!bytes)return;buffer=await voiceContext.decodeAudioData(bytes.slice().buffer);voiceBuffers.set(key,buffer);}
  if(generation!==voiceGeneration||!voicesEnabled)return;
  const source=voiceContext.createBufferSource(),gain=voiceContext.createGain();
  source.buffer=buffer;gain.gain.value=.85;source.connect(gain);gain.connect(voiceContext.destination);voiceSource=source;
  await new Promise(resolve=>{source.onended=()=>{source.disconnect();gain.disconnect();if(voiceSource===source)voiceSource=null;resolve();};source.start();});
 }).catch(()=>voiceStatus('음성을 재생하지 못했어요. 음성팩을 다시 불러와 주세요.'));
}
voiceSelect.onchange=()=>{
 const previous=selectedVoice,next=voiceSelect.value;
 if(roomState){request('room:voice',{voice:next},res=>{if(!res?.ok){voiceSelect.value=previous;voiceStatus(res?.error||'변경하지 못했어요.');return;}saveVoice(next);});}
 else saveVoice(next);
};
function saveVoice(voice){selectedVoice=voice;voiceSelect.value=voice;try{localStorage.setItem('mahjong.voice',voice);}catch{}}
document.getElementById('voicePreview').onclick=async()=>{
 await unlockVoices();if(!voiceFiles){voiceStatus('먼저 BOOTH 음성팩 ZIP을 불러와 주세요.');return;}playCharacterVoice({voice:selectedVoice,action:'reach'});
};
document.getElementById('voiceToggle').onclick=()=>{
 voicesEnabled=!voicesEnabled;if(!voicesEnabled)stopVoices();updateVoiceToggle();try{localStorage.setItem('mahjong.voicesEnabled',String(voicesEnabled));}catch{}
};
