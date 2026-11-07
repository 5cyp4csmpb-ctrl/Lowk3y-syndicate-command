// ==UserScript==
// @name         Syndicate Command Universal
// @namespace    lowk3y-syndicate
// @version      1.1.0
// @description  Torn PDA + Tampermonkey shared war room, manual attacks, claims, assists and FF matching.
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.torn.com
// @connect      ffscouter.com
// @connect      lowk3y-torn-command-centre.phil-harvey.chatgpt.site
// @updateURL    https://raw.githubusercontent.com/5cyp4csmpb-ctrl/Lowk3y-syndicate-command/main/syndicate-universal.user.js
// @downloadURL  https://raw.githubusercontent.com/5cyp4csmpb-ctrl/Lowk3y-syndicate-command/main/syndicate-universal.user.js
// ==/UserScript==
(async () => {
'use strict';
if(document.getElementById('syndicate-universal-host'))return;
const ORIGIN='https://lowk3y-torn-command-centre.phil-harvey.chatgpt.site';
const PDA=typeof PDA_httpGet==='function'&&typeof PDA_httpPost==='function';
const bridge=typeof GM_xmlhttpRequest==='function'?GM_xmlhttpRequest:(typeof GM!=='undefined'&&GM.xmlHttpRequest?GM.xmlHttpRequest:null);
const store=typeof PDA_storage!=='undefined'?PDA_storage:null;
const prefix='syndicate-universal-';
const read=async(k,d)=>{try{if(PDA&&store)return await store.get(k,d);if(typeof GM_getValue==='function')return await GM_getValue(prefix+k,d);return JSON.parse(localStorage.getItem(prefix+k)||JSON.stringify(d));}catch{return d;}};
const write=async(k,v)=>{try{if(PDA&&store)await store.set(k,v);else if(typeof GM_setValue==='function')await GM_setValue(prefix+k,v);else localStorage.setItem(prefix+k,JSON.stringify(v));}catch{notify('Unable to save '+k);}};
const host=document.createElement('div');host.id='syndicate-universal-host';(document.body||document.documentElement).append(host);
const root=host.attachShadow({mode:'open'});
root.innerHTML=`<style>
:host{all:initial;font:14px/1.4 Arial,sans-serif;color:#eef4f7;position:fixed;left:10px;bottom:85px;z-index:2147483647}*{box-sizing:border-box}button,a,input{font:inherit}button,a{cursor:pointer}button{color:#eef4f7;background:#202c34;border:1px solid #52636f;border-radius:7px;padding:8px}#launcher{background:#d7ff3f;color:#10150a;font-weight:bold;touch-action:none;user-select:none;box-shadow:0 2px 12px #0009}#panel{position:fixed;width:min(380px,calc(100vw - 20px));max-height:calc(100dvh - 20px);overflow:auto;background:#0c1217;border:1px solid #3bd7ff;border-radius:10px;padding:12px;box-shadow:0 8px 32px #0009}h2{font-size:18px;margin:0 0 8px}input[type=text],input[type=password]{width:100%;padding:9px;background:#161f25;color:#fff;border:1px solid #61717d;border-radius:6px}label{display:block;margin:8px 0}p{margin:8px 0}.muted{color:#b3c1cb;font-size:12px}a{color:#3bd7ff}#notice{color:#d7ff3f;white-space:pre-wrap}article{border-top:1px solid #374751;padding:10px 0}article strong{display:block}article a,#assistLink{display:inline-block;background:#da3535;color:#fff;text-decoration:none;padding:9px 14px;border-radius:6px;margin:6px 4px 0 0}article small{display:block;color:#bac7d0}article small.ff{color:#d7ff3f}article a[aria-disabled=true]{background:#36404a;color:#c2cbd2}#assistBox{border:1px solid #d7ff3f;padding:8px;margin:8px 0}[hidden]{display:none!important}.row{display:flex;gap:7px;flex-wrap:wrap}.claimed{color:#3bd7ff!important}
</style>
<button id="launcher">Syndicate Command</button><section id="panel" hidden><h2>Syndicate Command · Universal</h2><p id="fresh" class="muted">Not connected</p><p id="notice" role="status"></p>
<div id="setup"><label>Torn API key<input id="apiKey" type="password" autocomplete="off" placeholder="Limited key (PC), PDA auto-detects key"></label><button id="saveKey">Save key on this device</button><p class="muted">Your key is stored locally only; it is sent to Torn for player verification and directly to FFScouter only if FF is enabled. The War Room server does not store it.</p></div>
<div id="join"><label>Personal invitation<input id="invitation" type="text" placeholder="Paste invitation link"></label><div class="row"><button id="joinBtn">Join room</button><button id="loginBtn">Reconnect</button></div></div>
<div id="live" hidden><label><input id="auto" type="checkbox"> Auto-claim my Attack taps</label><label><input id="assist" type="checkbox"> Request in-app assists on Attack taps</label><label><input id="ff" type="checkbox"> Match close and lower-stat FF targets</label>
<div id="assistBox" hidden><strong id="assistText"></strong><a id="assistLink" href="#">Open attack</a><button id="dismiss">Dismiss</button></div><p id="activity" class="muted"></p>
<form id="factionForm"><label>Enemy faction ID or link<input id="faction" type="text" placeholder="Enemy faction ID"></label><button>Load targets</button></form><p class="muted">Enemy faction is remembered on this device. Status refreshes every 20 seconds while open.</p><div id="targets"></div><div class="row"><button id="refresh">Refresh</button><button id="logout">Disconnect room</button></div></div>
<p class="muted">Drag the yellow button to reposition it.</p><button id="resetPosition">Reset button position</button></section>`;
const q=s=>root.querySelector(s);
let session='',apiKey='',autoClaim=true,assist=false,ffEnabled=false,seen=0,launcherPos=null,dragged=false;
let room=null,members=[],faction='',roomAt=0,targetsAt=0,releaseRefreshAt=0,busy=false,targetsBusy=false,ffBusy=false,ffEstimates={},ffFaction='',ffAt=0,pausedUntil=0,roomBackoff=0,warning=false,loadGeneration=0;
const notify=s=>q('#notice').textContent=s;
const clamp=(v,min,max)=>Math.min(Math.max(v,min),Math.max(min,max));
function position(p){launcherPos=p&&Number.isFinite(+p.x)&&Number.isFinite(+p.y)?{x:+p.x,y:+p.y}:null;if(!launcherPos){Object.assign(host.style,{left:'10px',top:'auto',right:'auto',bottom:'85px'});return;}const r=q('#launcher').getBoundingClientRect();launcherPos={x:clamp(launcherPos.x,4,innerWidth-Math.max(r.width,120)-4),y:clamp(launcherPos.y,4,innerHeight-Math.max(r.height,40)-4)};Object.assign(host.style,{left:launcherPos.x+'px',top:launcherPos.y+'px',right:'auto',bottom:'auto'});}
function placePanel(){const b=q('#launcher').getBoundingClientRect(),p=q('#panel'),w=Math.min(380,innerWidth-20),h=Math.min(p.scrollHeight||500,innerHeight-20);p.style.left=clamp(b.left,10,innerWidth-w-10)+'px';p.style.top=(b.top>innerHeight/2?clamp(b.top-h-8,10,innerHeight-h-10):clamp(b.bottom+8,10,innerHeight-h-10))+'px';}
setInterval(()=>{if(!host.isConnected&&document.body)document.body.append(host);},2000);
async function request(url,body){
 const headers=body?{'Content-Type':'application/json',...(url.startsWith(ORIGIN)&&session?{Authorization:'Bearer '+session}:{})}:{};
 let response;
 if(PDA){const result=await Promise.race([body?PDA_httpPost(url,headers,JSON.stringify(body)):PDA_httpGet(url,{}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Connection timed out')),12000))]);response={status:result.status,text:result.responseText};}
 else if(bridge){response=await new Promise((resolve,reject)=>{bridge({method:body?'POST':'GET',url,headers,data:body?JSON.stringify(body):undefined,timeout:12000,onload:r=>resolve({status:r.status,text:r.responseText}),onerror:()=>reject(Error('Network error')),ontimeout:()=>reject(Error('Connection timed out'))});});}
 else throw Error('Install Tampermonkey or use Torn PDA to enable cross-origin requests.');
 let data;try{data=typeof response.text==='object'?response.text:JSON.parse(String(response.text||''));}catch{throw Error('Server response could not be read');}
 if(response.status<200||response.status>=300||data.error){const e=Error(typeof data.error==='string'?data.error:data.error?.error||'Request failed');e.status=response.status;if(url.startsWith('https://api.torn.com')&&data.error?.code===5)pausedUntil=Date.now()+65000;throw e;}
 return data;
}
async function api(action,extra={}){try{return await request(ORIGIN+'/api/room',{action,...extra});}catch(e){if(e.status===401&&!['join','login'].includes(action)){session='';room=null;await write('session','');q('#join').hidden=false;q('#live').hidden=true;}throw e;}}
function apply(data){
 if(!data?.me)return;room=data;roomAt=Date.now();roomBackoff=0;q('#join').hidden=true;q('#live').hidden=false;
 q('#fresh').textContent=`${data.me.name} · ${data.active?'Connected':'War ended'} · ${(data.members||[]).length} active`;
 const events=data.events||[];q('#activity').textContent=events.slice(0,3).map(e=>`${e.member_name}: ${e.event_type} ${e.target_name||''}`).join(' · ');
 const ping=events.find(e=>e.event_type==='assist'&&String(e.member_id)!==String(data.me.id)&&Number(e.id)>seen&&e.created_at>data.server_time-90);
 seen=Math.max(seen,...events.map(e=>Number(e.id)||0));void write('seen',seen);
 if(ping){q('#assistText').textContent=`${ping.member_name} requests help with ${ping.target_name}`;q('#assistLink').href=`https://www.torn.com/loader.php?sid=attack&user2ID=${ping.target_id}`;q('#assistBox').hidden=false;q('#panel').hidden=false;notify('New assist request');}
 const serverFaction=String(data.state?.faction_id||'');
 if(/^\d+$/.test(serverFaction)&&serverFaction!==faction&&(data.me.role!=='owner'||!faction)){switchFaction(serverFaction,true);}
 render();if(data.conflict)notify(data.conflict);
}
function switchFaction(id,load=false){if(id!==faction){faction=id;members=[];targetsAt=0;ffEstimates={};ffFaction='';ffAt=0;loadGeneration++;}q('#faction').value=id;void write('lastFaction',id);render();if(load&&!q('#panel').hidden)void loadTargets();}
async function sync(){if(!session||busy||document.hidden||Date.now()<roomBackoff)return;busy=true;try{apply(await api('sync'));if(warning){warning=false;notify('');}}catch(e){roomBackoff=Date.now()+5000;if(!room||Date.now()-roomAt>15000){warning=true;notify(e.message);}}finally{busy=false;}}
async function connect(action){if(!/^[a-zA-Z0-9]{16}$/.test(apiKey)){notify('Save a valid Torn API key first.');return;}let invite=q('#invitation').value.trim();try{invite=new URLSearchParams(new URL(invite).hash.slice(1)).get('invite')||invite;}catch{}q('#joinBtn').disabled=q('#loginBtn').disabled=true;notify('Verifying identity…');try{const d=await api(action,{key:apiKey,invite});session=d.session;await write('session',session);q('#invitation').value='';notify('Connected');await sync();}catch(e){notify(e.message);}finally{q('#joinBtn').disabled=q('#loginBtn').disabled=false;}}
async function loadTargets(){
 if(!faction||targetsBusy||document.hidden||Date.now()<pausedUntil||!/^[a-zA-Z0-9]{16}$/.test(apiKey))return;
 targetsBusy=true;const requested=faction,generation=loadGeneration;
 try{const d=await request(`https://api.torn.com/v2/faction/${encodeURIComponent(requested)}/members?key=${encodeURIComponent(apiKey)}&striptags=true&comment=syndicate-universal&timestamp=${Math.floor(Date.now()/1000)}`);if(requested!==faction||generation!==loadGeneration)return;if(!Array.isArray(d.members))throw Error('Torn returned no faction members');members=d.members;targetsAt=Date.now();render();if(ffEnabled)void loadFairFight(requested);}
 catch(e){notify(e.message);}finally{targetsBusy=false;}
}
const fairFightOf=id=>{const x=ffEstimates[String(id)]?.fair_fight;return x==null||x===''||!Number.isFinite(+x)?null:+x;};
const isFfMatch=m=>{const f=fairFightOf(m.id);return f!==null&&f>=1&&f<=4.5;};
async function loadFairFight(requested=faction){if(!ffEnabled||!members.length||ffBusy||requested!==faction||(requested===ffFaction&&Date.now()-ffAt<300000))return;ffBusy=true;ffFaction=requested;ffAt=Date.now();try{const ids=members.map(m=>m.id).filter(Boolean).slice(0,205).join(','),d=await request('https://ffscouter.com/api/v1/get-stats?'+new URLSearchParams({key:apiKey,targets:ids}));if(requested!==faction)return;if(!Array.isArray(d))throw Error('FFScouter returned no estimates');ffEstimates=Object.fromEntries(d.map(x=>[String(x.player_id),x]));render();}catch(e){ffAt=Date.now()-240000;notify('FF matching unavailable: '+e.message);}finally{ffBusy=false;}}
const hospitalCountdown=until=>{const n=Math.max(0,Math.ceil(+until-Date.now()/1000));return n?`Hospital · ${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`:'Hospital timer ended · Open attack';};
const blocked=m=>{const until=+m.status?.until,ended=m.status?.state==='Hospital'&&Number.isFinite(until)&&until>0&&until<=Date.now()/1000;return(m.status?.state!=='Okay'&&!ended)||!room?.active||Date.now()-targetsAt>45000;};
function targetOrder(a,b){const rank=m=>m.status?.state==='Okay'?0:m.status?.state==='Hospital'?1:2,release=m=>+m.status?.until>0?+m.status.until:Infinity;return rank(a)-rank(b)||(rank(a)===1?release(a)-release(b):0)||(isFfMatch(a)?0:1)-(isFfMatch(b)?0:1)||Math.abs((fairFightOf(a.id)??99)-3.66)-Math.abs((fairFightOf(b.id)??99)-3.66);}
function render(){
 const list=q('#targets');list.replaceChildren();const claims=new Map((room?.claims||[]).map(c=>[String(c.target_id),c]));
 for(const m of [...members].sort(targetOrder)){if(!/^\d+$/.test(String(m.id)))continue;const row=document.createElement('article'),name=document.createElement('strong'),status=document.createElement('small');name.textContent=`${m.name} · #${m.id}`;status.textContent=m.status?.description||m.status?.state||'Unknown';row.append(name,status);
 const ff=fairFightOf(m.id);if(ff!==null){const s=document.createElement('small');s.className='ff';s.textContent=`FF ${ff.toFixed(2)}${isFfMatch(m)?ff<3?' · lower-stat match':' · close match':''}`;row.append(s);}
 if(m.status?.state==='Hospital'&&+m.status?.until>0){const s=document.createElement('small');s.dataset.hospitalUntil=String(m.status.until);s.textContent=hospitalCountdown(m.status.until);row.append(s);}
 const c=claims.get(String(m.id)),claim=c&&c.expires_at>Date.now()/1000?c:null;if(claim){const s=document.createElement('small');s.className='claimed';s.textContent='Claimed by '+claim.member_name;row.append(s);}
 const attack=document.createElement('a');attack.textContent='Attack';attack.href=`https://www.torn.com/loader.php?sid=attack&user2ID=${m.id}`;attack.dataset.targetId=String(m.id);attack.setAttribute('aria-disabled',String(blocked(m)));attack.addEventListener('click',e=>{if(blocked(m)){e.preventDefault();notify('Target unavailable or status needs refreshing');return;}if(autoClaim||assist)void api('attack',{target:{id:m.id,name:m.name},auto_claim:autoClaim,assist}).then(apply).catch(err=>notify('Torn opened, but coordination failed: '+err.message));});row.append(attack);
 if(claim&&String(claim.member_id)===String(room?.me.id)){const undo=document.createElement('button');undo.textContent='Undo claim';undo.onclick=()=>void api('release',{target:{id:m.id}}).then(apply).catch(e=>notify(e.message));row.append(undo);}list.append(row);
 }
 if(!members.length)list.textContent=faction?'No targets loaded. Refresh or check faction ID.':'Load the enemy faction to see targets.';
}
q('#launcher').onclick=()=>{if(dragged){dragged=false;return;}q('#panel').hidden=!q('#panel').hidden;if(!q('#panel').hidden){placePanel();void sync();if(faction)void loadTargets();}};
q('#launcher').addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;const x=e.clientX,y=e.clientY,start=q('#launcher').getBoundingClientRect();let moved=false;try{q('#launcher').setPointerCapture(e.pointerId);}catch{}const move=n=>{const dx=n.clientX-x,dy=n.clientY-y;if(!moved&&Math.hypot(dx,dy)<6)return;moved=true;dragged=true;position({x:start.left+dx,y:start.top+dy});if(!q('#panel').hidden)placePanel();};const end=()=>{q('#launcher').removeEventListener('pointermove',move);q('#launcher').removeEventListener('pointerup',end);q('#launcher').removeEventListener('pointercancel',end);if(moved)void write('launcherPos',launcherPos);};q('#launcher').addEventListener('pointermove',move);q('#launcher').addEventListener('pointerup',end);q('#launcher').addEventListener('pointercancel',end);});
q('#resetPosition').onclick=()=>{position(null);void write('launcherPos',null);placePanel();notify('Button position reset');};
addEventListener('resize',()=>{position(launcherPos);if(!q('#panel').hidden)placePanel();});
q('#saveKey').onclick=async()=>{const value=q('#apiKey').value.trim();if(!/^[a-zA-Z0-9]{16}$/.test(value)){notify('Enter a valid 16-character Torn API key');return;}apiKey=value;await write('apiKey',apiKey);q('#apiKey').value='';notify('API key saved locally');if(faction)void loadTargets();};
q('#joinBtn').onclick=()=>void connect('join');q('#loginBtn').onclick=()=>void connect('login');q('#dismiss').onclick=()=>q('#assistBox').hidden=true;
q('#auto').onchange=()=>{autoClaim=q('#auto').checked;void write('autoClaim',autoClaim);};
q('#assist').onchange=()=>{assist=q('#assist').checked;void write('assist',assist);};
q('#ff').onchange=()=>{ffEnabled=q('#ff').checked;ffEstimates={};ffFaction='';ffAt=0;void write('ffEnabled',ffEnabled);render();if(ffEnabled)void loadFairFight();};
q('#factionForm').onsubmit=e=>{e.preventDefault();const value=q('#faction').value.trim(),id=/^\d+$/.test(value)?value:value.match(/[?&#](?:ID|id)=(\d+)/)?.[1]||value.match(/\/factions\.php\/(\d+)/)?.[1];if(!id){notify('Enter a faction ID or link');return;}switchFaction(id);void loadTargets();if(room?.me.role==='owner')void api('faction',{faction_id:id}).then(apply).catch(err=>notify(err.message));};
q('#refresh').onclick=()=>{void sync();void loadTargets();};
q('#logout').onclick=async()=>{try{await api('logout');}catch{}session='';room=null;members=[];await write('session','');q('#join').hidden=false;q('#live').hidden=true;render();notify('Room disconnected');};
setInterval(()=>{void sync();const now=Math.floor(Date.now()/1000),due=members.some(m=>String(m.status?.state).toLowerCase()==='hospital'&&+m.status?.until<=now&&+m.status?.until>now-45);if(!q('#panel').hidden&&due&&Date.now()-releaseRefreshAt>=3000){releaseRefreshAt=Date.now();void loadTargets();}if(session&&Date.now()-roomAt>15000)q('#fresh').textContent='Room information is stale — check connection';},3000);
setInterval(()=>{if(q('#panel').hidden)return;for(const s of root.querySelectorAll('[data-hospital-until]'))s.textContent=hospitalCountdown(s.dataset.hospitalUntil);const byId=new Map(members.map(m=>[String(m.id),m]));for(const a of root.querySelectorAll('a[data-target-id]')){const m=byId.get(a.dataset.targetId);if(m)a.setAttribute('aria-disabled',String(blocked(m)));}},1000);
setInterval(()=>{if(!q('#panel').hidden)void loadTargets();},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){void sync();if(!q('#panel').hidden)void loadTargets();}});
[session,autoClaim,assist,ffEnabled,seen,launcherPos,faction,apiKey]=await Promise.all([read('session',''),read('autoClaim',true),read('assist',false),read('ffEnabled',false),read('seen',0),read('launcherPos',null),read('lastFaction',''),read('apiKey','')]);
const injected='###PDA-APIKEY###';if(PDA&&/^[a-zA-Z0-9]{16}$/.test(injected))apiKey=injected;
q('#setup').hidden=PDA&&/^[a-zA-Z0-9]{16}$/.test(apiKey);q('#auto').checked=autoClaim;q('#assist').checked=assist;q('#ff').checked=ffEnabled;position(launcherPos);if(/^\d+$/.test(String(faction))){q('#faction').value=faction;if(session)void loadTargets();}else faction='';if(session)void sync();
})().catch(e=>console.error('[Syndicate Command Universal] Startup failed',e));
