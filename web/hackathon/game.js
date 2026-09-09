import {Room} from './room.js';
import {transcript} from './transcript.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rounds=()=>match?.round_limit||5;
const colors=['#c6f46b','#a899fa','#ffad83','#82d5ed','#f4b5d1','#eed376','#91d9be','#b6c8f6'];
let config,people=[],match=null,selected='p0',action='research',mode='demo',busy=false,theme='Build a useful AI-enabled product that solves a real problem.',direction='',replay=null,inspecting=false,judges=[],connection=null,addingPerson=false,generation=0,stopping=false,personVersion=0,personJob=null,personTimer=null;
const room=new Room($('#room'),id=>{selected=id;inspecting=id!=='p0';render()});
const avatar=(p)=>`<span class="avatar" style="--avatar:${p.color||'#dbdfcc'}">${esc(p.name.split(' ').map(x=>x[0]).slice(0,2).join(''))}</span>`;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,6500)}
async function api(path,body,timeoutMs=0){
  const controller=new AbortController(),timer=timeoutMs?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{let r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});let data=await r.json();if(!r.ok){const error=Error(typeof data.detail==='string'?data.detail:(data.detail?.message||'Please check the form and try again.'));error.status=r.status;throw error;}return data}
  catch(e){if(e.name==='AbortError')throw Error('The server is taking too long to respond.');throw e}
  finally{clearTimeout(timer)}
}

function roster(){return (match?.people||people).map((p,i)=>({...p,id:p.id||`p${i}`,color:p.color||colors[i],action:p.action||'idle'}))}
function setBusy(value,text='The room is thinking…'){busy=value;room.busy=value;$('#busy-banner').hidden=!value;$('#busy-text').textContent=text;render()}
function render(){if(!match)localStorage.setItem('astra-house-roster',JSON.stringify({people,judges}));let ps=roster();room.selected=selected;room.judgeCount=(match?.judges||judges).length;room.winners=match?.status==='finished'&&replay===null?(match.leaderboard||[]).filter(p=>p.rank===1).map(p=>p.id):[];$('#mode-label').textContent=match?(match.mode==='demo'?'DEMO · SCRIPTED':`${esc(config.model)} · LIVE`):'SANDBOX';$('#round-label').textContent=match?(replay!==null?`REPLAY · ROUND ${replay}`:match.status==='finished'?'HACKATHON COMPLETE':match.status==='judging'?'THE PANEL IS JUDGING':`ROUND ${String(match.round+1).padStart(2,'0')} / ${rounds()}`):'LOBBY OPEN';$('#round-dots').innerHTML=Array.from({length:rounds()},(_,i)=>`<i class="round-dot ${i<(match?.round||0)?'done':i===(match?.round||0)&&match?'active':''}"></i>`).join('');$('#occupancy').textContent=`${String(ps.length).padStart(2,'0')} BUILDERS · ${String((match?.judges||judges).length).padStart(2,'0')} JUDGERS`;$('#builder-count').textContent=String(ps.length).padStart(2,'0');$('#add-agent').hidden=!!match;$('#add-judge').hidden=!!match;$('#new-game').disabled=stopping||(!match&&busy);$('#new-game').textContent=stopping?'Stopping…':match?'Stop & restart ↺':'Reset lobby ↺';
  $('#builders').innerHTML=ps.map((p,i)=>`<div class="builder ${selected===p.id?'selected':''}"><button class="quiet builder-select" data-person="${p.id}" style="padding:0;width:100%;text-align:left"><div class="builder-top">${avatar(p)}<div style="min-width:0"><div class="builder-name">${esc(p.name)} ${i===0?'<span class="you">YOU</span>':''}</div><div class="builder-role">${esc(p.role)}</div></div></div><div class="builder-status">${p.submission?'✓ Submitted':busy?'● Thinking':p.action==='idle'?'● Ready to build':p.action}</div></button>${!match?`<button class="quiet remove-agent" data-remove="${i}" aria-label="Remove ${esc(p.name)}">×</button>`:''}</div>`).join('');
  document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{selected=b.dataset.person;inspecting=selected!=='p0';render()});document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{people.splice(+b.dataset.remove,1);inspecting=false;selected='p0';room.set(roster());render()});
  let events=match?.events||[];$('#feed').innerHTML=events.length?[...events].reverse().slice(0,24).map(e=>{let p=ps.find(p=>p.id===e.actor);return `<div class="feed-item">${avatar(p)}<div><strong>${esc(p.name)}</strong><p>${esc(e.text)}</p></div><span class="feed-round">R${e.round}</span></div>`}).join(''):'<div class="empty-feed">The laptops are open. The coffee is ready. Your first idea starts the conversation.</div>';
  $('#judges').innerHTML=(match?.judges||judges).map((j,i)=>`<div class="judge-wrap"><button class="judge" data-judge="${j.id}">${avatar({...j,color:colors[i%8]})}<div><strong>${esc(j.name)}</strong><small>${esc(j.role)}</small></div></button>${!match?`<button class="quiet remove-judge" data-remove-judge="${j.id}" aria-label="Remove ${esc(j.name)}">×</button>`:''}</div>`).join('');document.querySelectorAll('[data-judge]').forEach(b=>b.onclick=()=>showJudge(b.dataset.judge));document.querySelectorAll('[data-remove-judge]').forEach(b=>b.onclick=()=>{judges=judges.filter(j=>j.id!==b.dataset.removeJudge);render()});

  renderRoundRecap();renderTranscript();
  $('#subtitle').textContent=match?match.theme:'Bring your curiosity. Build alongside AI minds. Make your five rounds count.';
  if(inspecting)renderPerson(ps.find(p=>p.id===selected)||ps[0]);else if(!match)renderLobby();else if(match.status==='finished')renderResults();else if(match.status==='judging')renderJudging();else renderActions();
}
function renderLobby(){$('#sidebar').innerHTML=`<div class="panel-head"><span class="step-label">YOUR NEXT GREAT IDEA STARTS HERE</span><h2>Make yourself at home.</h2><p>One room. Five rounds. A house full of independent minds.</p></div><div class="panel-body"><label>The challenge<textarea id="theme" rows="3" maxlength="300">${esc(theme)}</textarea></label><div class="mode-options"><button id="demo" class="${mode==='demo'?'chosen':''}">Demo sandbox</button><button id="astra" class="${mode==='astra'?'chosen':''}" ${!config.astra_available?'disabled title="Configure server credentials to enable Astra"':''}>Fast model live</button></div><p class="small muted">${mode==='demo'?'Explore a complete game with scripted participants and sample judging. No model calls.':`Each builder thinks independently with ${esc(config.model)}. A four-person game uses about 25 model calls.`}</p><div class="connection-status" role="status">${esc(connection?.message||'Each model request has a 30-second limit. Check connectivity before live play.')}<button id="check-connection" class="secondary" ${busy?'disabled':''}>Check model connection</button></div><button id="start" class="primary" ${busy||people.length<2||judges.length<1||mode==='astra'&&!connection?.connected?'disabled':''}>${busy?'Opening the doors…':'Enter the hackathon ↗'}</button><p class="panel-note">${people.length<2||!judges.length?'Add at least two builders and one judger to start.':'You control the first builder. Rivals act on their own.'}</p></div><div class="project-summary"><h3>How to make your five rounds count</h3><p>Research an idea. Build something useful. Test your assumptions. Submit before the final bell.</p></div>`;$('#theme').oninput=e=>theme=e.target.value;$('#demo').onclick=()=>{mode='demo';render()};$('#astra').onclick=()=>{mode='astra';render();checkConnection()};$('#start').onclick=start;$('#check-connection').onclick=checkConnection}
async function start(){try{setBusy(true,'Opening the house…');match=await api('/api/matches',{theme,mode,personas:people,judges:judges.map(j=>({id:j.id,profile_id:j.profile_id||null}))});localStorage.setItem('astra-house-match',match.id);selected='p0';room.set(roster());}catch(e){toast(e.message)}finally{setBusy(false)}}
const actionInfo={research:['⌕','Find your angle'],build:['⚒','Make it tangible'],test:['◇','Challenge the idea'],pitch:['↗','Tell the story'],submit:['✓','Lock your project']};
function renderActions(){let p=match.people[0];if(!p.legal.includes(action))action='research';$('#sidebar').innerHTML=`<div class="panel-head"><span class="step-label">YOUR MOVE · ROUND ${match.round+1}</span><h2>What will you build?</h2><p>One action. Then the whole room moves.</p></div><div class="panel-body"><div class="action-grid">${Object.entries(actionInfo).map(([a,[icon,desc]])=>`<button class="action ${action===a?'chosen':''}" data-action="${a}" ${busy||!p.legal.includes(a)?'disabled':''}><b>${icon}</b>${a[0].toUpperCase()+a.slice(1)}<span>${desc}</span></button>`).join('')}</div><label>A little direction <span class="muted">(optional)</span><textarea id="direction" maxlength="500" rows="3" placeholder="e.g. Help people learn a language in five minutes a day…">${esc(direction)}</textarea></label>${match.failure?`<div class="warning">${esc(match.failure.message)}<br><small>Affected: ${esc(match.failure.details?.map(d=>`${d.participant}: ${d.message}`).join(' · ')||(match.failure.participants||[]).join(', '))}</small></div>`:''}${match.round===rounds()-1&&!p.submission?'<p class="warning">Last round. Submit now to be eligible for judging.</p>':''}<button id="play" class="primary" ${busy?'disabled':''}>${busy?'Everyone is thinking…':`Confirm ${action} →`}</button><p class="panel-note">${rounds()-match.round} actions left · ${p.submission?`Latest submission: round ${p.submission.round}`:'No submission yet'}</p></div><div class="project-summary"><h3>Your project <span class="muted">/ ${p.artifacts.length} artifacts</span></h3><p>${esc(p.goal)}</p><button class="secondary" id="inspect">Open project & memory ↗</button></div>`;document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{action=b.dataset.action;render()});$('#direction').oninput=e=>direction=e.target.value;$('#play').onclick=play;$('#inspect').onclick=()=>{selected='p0';inspecting=true;render()}}
async function play(){if(busy)return;const version=generation,mid=match.id;try{setBusy(true);const result=await api(`/api/matches/${mid}/round`,{expected_round:match.round,action,instruction:direction,receipt:crypto.randomUUID()});if(version!==generation)return;match=result;direction='';room.set(roster(),true);if(match.status==='judging'){setBusy(false);await judging();return}}catch(e){if(version!==generation)return;toast(e.message);try{const result=await api(`/api/matches/${mid}`);if(version===generation)match=result}catch{}}finally{if(version===generation)setBusy(false)}}

function renderPerson(p){$('#sidebar').innerHTML=`<div class="panel-head"><button id="back" class="quiet">← Back to ${match?'game':'lobby'}</button><div style="display:flex;gap:12px;align-items:center;margin-top:12px">${avatar(p)}<h2>${esc(p.name)}</h2></div><p>${esc(p.role)} · Simulated persona</p></div><div class="panel-body panel-scroll"><p>${esc(p.bio)}</p>${p.source?`<a class="source-link" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Public profile source ↗</a>`:''}${contextMemoryPanel(p)}${p.profile_backup?`<details class="artifact"><summary>Preset game profile backup</summary><p>${esc(p.profile_backup.background)}</p><p>${esc(p.profile_backup.simulated_behavior)}</p><p>${esc(p.profile_backup.basis)}</p><p>${esc(p.profile_backup.limitations)}</p>${p.profile_backup.sources.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener">Profile source ↗</a>`).join(' · ')}</details>`:''}${match?playerStatePanel(p):''}${p.artifacts?`<h3>Project artifacts</h3>${p.artifacts.length?p.artifacts.map(a=>`<details class="artifact"><summary><span class="eyebrow">R${a.round} · ${a.type}</span><br>${esc(a.title)}</summary><p>${esc(a.content)}</p><span class="small muted">${esc(a.id)} · ${a.evidence_ids.length} references</span></details>`).reverse().join(''):'<p class="small muted">Your first research action begins the project.</p>'}<h3>Game memories</h3>${p.memories.length?'':'<p class="small muted">No game memories yet. Each completed round adds an experience.</p>'}${p.memories.map(m=>`<details class="artifact"><summary>Round ${m.round}</summary><p>${esc(m.content)}</p></details>`).join('')}`:'<p class="small muted">Private research and project memory unlock after the finale.</p>'}</div>`;$('#back').onclick=()=>{selected='p0';inspecting=false;render()}}
function renderJudging(){$('#sidebar').innerHTML=`<div class="panel-head"><span class="step-label">THE FINAL BELL</span><h2>Your judgers are reviewing.</h2><p>Your submissions are frozen. The panel is reviewing the evidence.</p></div><div class="panel-body"><p>${match.cards.length} of ${match.judges.length} scorecards completed.</p><button id="judge-now" class="primary" ${busy?'disabled':''}>${busy?'Judges are reviewing…':'Continue judging →'}</button></div>`;$('#judge-now').onclick=judging}
async function judging(){const version=generation,mid=match.id;try{setBusy(true,'The judgers are reviewing submissions…');const result=await api(`/api/matches/${mid}/judge`,{});if(version!==generation)return;match=result;room.set(roster(),true)}catch(e){if(version!==generation)return;toast(e.message);try{const result=await api(`/api/matches/${mid}`);if(version===generation)match=result}catch{}}finally{if(version===generation)setBusy(false)}}

function renderResults(){let board=match.leaderboard||[],winners=board.filter(p=>p.rank===1);$('#sidebar').innerHTML=`<div class="panel-head"><span class="step-label">${match.mode==='demo'?'DEMO SCOREBOARD':'THE RESULTS ARE IN'}</span><h2>${winners.length?'A little idea. A big win.':'Until the next hackathon.'}</h2><p>${winners.length?`🏆 ${winners.map(p=>esc(p.name)).join(' & ')} ${winners.length>1?'share the win':'takes the trophy'}.`:'No projects were submitted.'}</p></div><div class="panel-body">${board.map(p=>`<div class="score-row"><span class="muted">${String(p.rank).padStart(2,'0')}</span>${avatar(p)}<div><strong>${esc(p.name)}</strong><br><small>${p.id==='p0'?'YOUR PROJECT':'SUBMITTED PROJECT'}</small></div><b>${p.score.toFixed(1)}</b></div>`).join('')}${match.people.filter(p=>!p.submission).map(p=>`<p class="small muted">${esc(p.name)} · Did not submit</p>`).join('')}<p class="small muted">Select a judge below to inspect their scores and evidence.</p><button class="secondary" id="my-results">Explore your project & memories ↗</button></div><div class="replay-controls"><label>Replay the room <span id="replay-label">${replay===null?'Finale':`Round ${replay}`}</span><input id="replay" type="range" min="0" max="${rounds()}" value="${replay??rounds()}"></label><button id="return-finale" class="quiet">Return to finale →</button></div>`;$('#my-results').onclick=()=>{selected='p0';inspecting=true;render()};$('#replay').onchange=async e=>{try{replay=+e.target.value;match=await api(`/api/matches/${match.id}?replay_round=${replay}`);room.set(roster());render()}catch(e){toast(e.message)}};$('#return-finale').onclick=async()=>{replay=null;match=await api(`/api/matches/${match.id}`);room.set(roster());render()}}
function showJudge(id){let j=(match?.judges||judges).find(j=>j.id===id),card=match?.cards.find(c=>c.judge_id===id);$('#sidebar').innerHTML=`<div class="panel-head"><button class="quiet" id="back">← Back to game</button><h2>${esc(j.name)}</h2><p>${esc(j.role)}</p></div><div class="panel-body panel-scroll">${contextMemoryPanel(j)}<span class="eyebrow">FICTIONAL JUDGING PREFERENCE</span><p>${esc(j.taste)}</p>${j.inference_basis?`<p class="small muted">${esc(j.inference_basis)}</p>`:""}<a class="source-link" href="${esc(j.source)}" target="_blank" rel="noopener noreferrer">Public professional source ↗</a>${card?card.scores.map(s=>{let p=match.people.find(p=>p.id===s.project_id);return `<div class="artifact"><strong>${esc(p.name)}</strong><div class="score-breakdown">${[['technical','Technical'],['originality','Originality'],['ai_centrality','AI centrality'],['taste','Taste']].map(([k,l])=>`<div>${l}<b>${s[k].toFixed(1)}</b></div>`).join('')}</div><p>${esc(s.verdict)}</p><div class="small muted">Evidence: ${s.evidence_ids.map(esc).join(', ')}</div></div>`}).join(''):'<p class="small muted">Scorecards are revealed after the final round.</p>'}</div>`;$('#back').onclick=render}
function openPerson(kind='builder'){
  if(match)return;
  if(kind==='builder'&&people.length>=8)return toast('The house has eight desks.');
  if(kind==='judge'&&judges.length>=8)return toast('The house has eight judger seats.');
  $('#import-activity').hidden=true;$('#close-persona').textContent='✕';$('#persona-form').reset();$('#add-person-submit').hidden=false;$('#add-person-submit').textContent='Add Person ↗';$('#persona-form').elements.kind.value=kind;

  $('#person-result').innerHTML='';
  $('#person-progress').textContent='Astra will search public sources, verify identity, and generate this person.';
  $('#persona-dialog').showModal();
}
$('#add-agent').onclick=()=>openPerson('builder');$('#add-judge').onclick=()=>openPerson('judge');
function finishPersonWait(){
  clearInterval(personTimer);personTimer=null;addingPerson=false;
  $('#import-activity').hidden=true;$('#add-person-submit').disabled=false;
  $('#close-persona').disabled=false;$('#close-persona').textContent='✕';
  $('#persona-form').elements.url.disabled=false;$('#persona-form').elements.kind.disabled=false;
}
async function cancelPerson(){
  const job=personJob;personVersion++;personJob=null;
  localStorage.removeItem('astra-house-import');finishPersonWait();$('#persona-dialog').close();
  if(job){try{await api(`/api/people/jobs/${job}/cancel`,{},10000)}catch{toast('Could not reach the server to cancel. The import will time out automatically.')}}
}
$('#close-persona').onclick=()=>addingPerson?cancelPerson():$('#persona-dialog').close();
$('#persona-dialog').addEventListener('cancel',e=>{if(addingPerson){e.preventDefault();cancelPerson()}});
function expirePerson(version){
  if(version!==personVersion||!addingPerson)return;
  const job=personJob;personVersion++;personJob=null;
  localStorage.removeItem('astra-house-import');finishPersonWait();
  $('#person-progress').textContent='The 30-second research limit was reached. No person was added. Please retry.';
  $('#add-person-submit').textContent='Retry Add Person ↗';
  if(job)api(`/api/people/jobs/${job}/cancel`,{},5000).catch(()=>{});
}
function personWait(started){
  addingPerson=true;$('#import-activity').hidden=false;$('#add-person-submit').disabled=true;
  $('#close-persona').disabled=false;$('#close-persona').textContent='Cancel';
  $('#persona-form').elements.url.disabled=true;$('#persona-form').elements.kind.disabled=true;
  const version=personVersion;
  const tick=()=>{const remaining=Math.max(0,Math.ceil((started+30000-Date.now())/1000));$('#import-elapsed').textContent=`${remaining}s remaining`;if(remaining===0)expirePerson(version)};
  clearInterval(personTimer);personTimer=setInterval(tick,200);tick();
}
function contextMemoryPanel(person){
  const memory=person.context_memory||[
    {title:'Professional background',kind:'background',content:person.bio},
    {title:'Simulated personality',kind:'inference',content:person.trait},
    {title:'Simulated judging taste',kind:'inference',content:person.taste},
  ].filter(m=>m.content);
  return `<section class="context-memory"><h3>Context memory <span class="muted">${memory.length} entries</span></h3><p class="small muted">Public professional background and simulation inferences used to guide this person. Game experiences are stored separately.</p>${memory.map(m=>`<details class="artifact" open><summary>${esc(m.title)} <span class="eyebrow">${m.kind==='inference'?'INFERRED':'BACKGROUND'}</span></summary><p>${esc(m.content)}</p>${m.evidence_basis?`<p class="small muted">Based on: ${esc(m.evidence_basis)}</p>`:''}</details>`).join('')}<p class="small muted">${person.generated_at?`Created ${esc(new Date(person.generated_at).toLocaleString())}. `:''}${person.memories?`${person.memories.length} game memories recorded.`:'Game memories start when this person participates.'}</p></section>`;
}
function showImportedPerson(person,kind){
  if(kind==='builder')people.push(person);else judges.push({...person,id:`j-${crypto.randomUUID()}`});
  localStorage.setItem('astra-house-roster',JSON.stringify({people,judges}));
  room.set(roster());render();
  $('#person-result').innerHTML=`<h3>${esc(person.name)} joined as a ${kind}.</h3>${contextMemoryPanel(person)}<p class="small">${person.sources.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(new URL(u).hostname)} ↗</a>`).join(' · ')}</p>`;
  $('#person-progress').textContent=(person.cache_hit?'Using successful research from the last hour. ':'')+(person.uncertainty||'Created from public professional sources.');
  $('#add-person-submit').hidden=true;
}
async function followImport(jobId,kind,version,started){
  personJob=jobId;const deadline=started+30000;
  while(version===personVersion){
    if(Date.now()>=deadline){api(`/api/people/jobs/${jobId}/cancel`,{},10000).catch(()=>{});throw Error('Import timed out. No person was added to the roster. Please retry.')}
    let job;
    try{job=await api(`/api/people/jobs/${jobId}`,undefined,10000)}
    catch(error){if(version!==personVersion)return;if(error.status>=400&&error.status<500)throw error;$('#person-progress').textContent='Connection interrupted; reconnecting to the import…';await new Promise(r=>setTimeout(r,1500));continue}
    if(version!==personVersion)return;if(Date.now()>=deadline){expirePerson(version);return}
    $('#import-stage').textContent=job.status==='retrying'?'Retrying':job.status==='queued'?'Queued':job.status==='verifying'?'Verifying sources':'Researching';
    $('#person-progress').textContent=job.message;
    if(job.status==='completed'){showImportedPerson(job.person,kind);return}
    if(job.status==='failed'||job.status==='cancelled')throw Error(job.message);
    await new Promise(r=>setTimeout(r,1500));
  }
}
$('#persona-form').onsubmit=async e=>{
  e.preventDefault();if(addingPerson)return;
  const form=e.target,kind=form.elements.kind.value,url=form.elements.url.value;
  if(kind==='builder'&&people.length>=8)return toast('The house has eight desks.');
  if(kind==='judge'&&judges.length>=8)return toast('The house has eight judger seats.');
  const version=++personVersion,started=Date.now();personWait(started);$('#import-stage').textContent='Starting';
  $('#person-progress').textContent='Starting public-profile research. You can cancel at any time.';
  try{
    const response=await api('/api/people',{url,kind},10000);
    if(version!==personVersion){if(response.job_id)api(`/api/people/jobs/${response.job_id}/cancel`,{},10000).catch(()=>{});return}
    if(response.job_id){localStorage.setItem('astra-house-import',JSON.stringify({id:response.job_id,kind,url,started}));await followImport(response.job_id,kind,version,started)}
    else if(Date.now()-started<30000)showImportedPerson(response,kind);else expirePerson(version);
  }catch(error){if(version===personVersion){$('#person-progress').textContent=error.message;$('#add-person-submit').textContent='Retry Add Person ↗'}}
  finally{if(version===personVersion){personJob=null;localStorage.removeItem('astra-house-import');finishPersonWait()}}
};
async function restoreImport(){
  const raw=localStorage.getItem('astra-house-import');if(!raw||match)return;
  let pending;try{pending=JSON.parse(raw)}catch{localStorage.removeItem('astra-house-import');return}
  if($('#welcome-dialog').open)$('#welcome-dialog').close();openPerson(pending.kind);
  $('#persona-form').elements.url.value=pending.url;const version=++personVersion;personWait(pending.started);
  try{await followImport(pending.id,pending.kind,version,pending.started)}
  catch(e){if(version===personVersion)$('#person-progress').textContent=e.message}
  finally{if(version===personVersion){personJob=null;localStorage.removeItem('astra-house-import');finishPersonWait()}}
}

async function checkConnection(){
  if(busy)return;
  setBusy(true,'Checking the live Astra connection…');
  try{connection=await api('/api/connectivity',{});if(!connection.connected)toast(connection.message)}
  catch(e){connection={connected:false,message:e.message};toast(e.message)}
  finally{setBusy(false)}
}
$('#how-to-play').onclick=()=>$('#welcome-dialog').showModal();
$('#enter-room').onclick=()=>{$('#welcome-dialog').close();localStorage.setItem('astra-house-intro','seen')};
function resetLobby(preserve=true){
  const sourcePeople=preserve&&match?match.people:config.seeds;
  people=sourcePeople.map(p=>Object.fromEntries(['name','role','bio','source','sources','trait','taste','inference_basis','context_memory','generated_at','profile_id','profile_backup'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])));
  judges=structuredClone(preserve&&match?match.judges:config.judges);
  match=null;replay=null;inspecting=false;selected='p0';action='research';direction='';busy=false;room.busy=false;
  localStorage.removeItem('astra-house-match');localStorage.setItem('astra-house-roster',JSON.stringify({people,judges}));$('#busy-banner').hidden=true;room.skip();room.set(roster());render();
}
$('#new-game').onclick=async()=>{
  if(stopping)return;
  if(!match){generation++;resetLobby(false);return}
  stopping=true;generation++;render();
  try{await api(`/api/matches/${match.id}/stop`,{});resetLobby(true);toast('Game stopped. Edit your roster and start again from round one.')}
  catch(e){toast(e.message);busy=false;room.busy=false;$('#busy-banner').hidden=true}
  finally{stopping=false;render()}
};
$('#zoom-in').onclick=()=>room.zoom=Math.min(2,room.zoom+.15);$('#zoom-out').onclick=()=>room.zoom=Math.max(.7,room.zoom-.15);$('#fit').onclick=()=>room.fit();$('#skip').onclick=()=>room.skip();$('#motion').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;room.reduced=$('#motion').checked;$('#motion').onchange=e=>{room.reduced=e.target.checked;room.skip()};
async function boot(){try{config=await api('/api/config');people=structuredClone(config.seeds);judges=structuredClone(config.judges);try{const saved=JSON.parse(localStorage.getItem('astra-house-roster'));if(saved){people=saved.people.map(p=>({...p,profile_backup:p.profile_backup||config.seeds.find(s=>s.name===p.name)?.profile_backup}));judges=saved.judges}}catch{}let mid=localStorage.getItem('astra-house-match');if(mid){try{match=await api(`/api/matches/${mid}`)}catch{localStorage.removeItem('astra-house-match')}}if(match?.status==='stopped')resetLobby(true);room.set(roster());render();if(!localStorage.getItem('astra-house-intro')&&!match)$('#welcome-dialog').showModal();restoreImport()}catch(e){toast(`Could not connect to the game server: ${e.message}`)}}boot();


function renderRoundRecap(round = replay ?? match?.round ?? 0) {
  $('#round-recap').hidden=!match;if(!match)return;
  const count=match.round;
  $('#recap-round').innerHTML=Array.from({length:Math.max(1,count)},(_,i)=>`<option value="${count?i+1:0}" ${(count?i+1:0)===round?'selected':''}>${count?i+1:'Not started'}</option>`).join('');
  $('#recap-round').onchange=e=>renderRoundRecap(+e.target.value);
  $('#recap-status').textContent=busy&&match.status==='playing'?`Round ${match.round+1} is processing. Completed actions appear when everyone finishes.`:round?`Round ${round} — each builder's action and public outcome.`:'Choose your first move to begin. Everyone in the room is shown below.';
  $('#round-actions').innerHTML=roster().map(p=>{
    const event=match.events.find(e=>e.actor===p.id&&e.round===round);
    return `<article class="round-action">${avatar(p)}<div><strong>${esc(p.name)}</strong><span class="pill">${esc(event?.action||'Ready')}</span><p>${esc(event?.text||'Waiting for the first round.')}</p>${event?`<details open><summary>Why this action</summary><p>${esc(event.decision_summary||'No decision explanation was recorded for this older turn.')}</p></details><details><summary>Work produced</summary><strong>${esc(event.title||'Public update')}</strong><p>${esc(event.content||event.text)}</p><p class="small muted">Evidence: ${esc(event.evidence_ids?.join(', ')||'No artifact references')}</p></details>${event.state?turnStatePanel(event.state):'<p class="small muted">State snapshot unavailable for this older turn.</p>'}`:''}<button class="secondary" data-inspect-state="${p.id}">Inspect current state & memory ↗</button></div></article>`;
  }).join('');
  document.querySelectorAll('[data-inspect-state]').forEach(b=>b.onclick=()=>{selected=b.dataset.inspectState;inspecting=true;render()});
}
function turnStatePanel(state){return `<div class="turn-state"><h3>State after this turn</h3><p>${esc(state.goal)}</p><p>${state.artifact_count} artifacts · ${state.memory_count} memories · ${state.submission_round?`Submitted R${state.submission_round}`:'Not submitted'}</p><p class="small">Next available actions: ${esc(state.legal_actions.join(', '))}</p></div>`}
function playerStatePanel(p){
 const failure=match.failure?.details?.find(d=>d.participant===p.name);
 const status=failure?failure.message:busy?'Round is processing; showing last saved state.':match.status==='finished'?'Finished':p.submission?'Submitted; can continue developing':'Building';
 return `<section class="player-state"><h3>Player state · Round ${match.round}</h3><p role="status">${esc(status)}</p><p><strong>Goal:</strong> ${esc(p.goal)}</p><p>Last action: ${esc(p.action)} · ${p.artifacts?.length||0} artifacts · ${p.memories?.length||0} game memories</p><p>Submission: ${p.submission?`Round ${p.submission.round}`:'Not submitted'}</p><p>Available actions: ${esc(p.legal?.join(', ')||'None')}</p><h3>Turn history</h3>${match.events.filter(e=>e.actor===p.id).map(e=>`<details class="artifact"><summary>Round ${e.round} · ${esc(e.action)}</summary><p>${esc(e.decision_summary||'No decision explanation was recorded for this older turn.')}</p><p>${esc(e.content||e.text)}</p>${e.state?turnStatePanel(e.state):''}</details>`).join('')||'<p>No completed turns yet.</p>'}</section>`;
}
let transcriptMatchId=null,transcriptLoading=null;
async function renderTranscript(){
  const visible=match?.status==='finished';$('#transcript-section').hidden=!visible;if(!visible){transcriptMatchId=null;return}
  const id=match.id;if(transcriptMatchId===id||transcriptLoading===id)return;
  transcriptLoading=id;$('#transcript-content').textContent='';$('#download-transcript').disabled=true;$('#transcript-status').textContent='Preparing the complete transcript…';
  try {
    const full=await api(`/api/matches/${id}`);
    if(match?.id!==id||match.status!=='finished')return;
    const text=transcript(full);$('#transcript-content').textContent=text;$('#deck-links').innerHTML=full.people.filter(p=>p.submission?.deck_url).map(p=>`<p><a href="${esc(p.submission.deck_url)}" target="_blank" rel="noopener">${esc(p.name)} — open deck & app demo ↗</a></p>`).join('');transcriptMatchId=id;
    $('#transcript-status').textContent='Final scores, scoring explanations, every judger’s rationale, and all five rounds.';
    $('#download-transcript').disabled=false;
    $('#download-transcript').onclick=()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`astra-house-${id}-transcript.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  }catch(error){$('#transcript-status').textContent=`Transcript could not load: ${error.message}. Return to the finale to retry.`}
  finally{if(transcriptLoading===id)transcriptLoading=null}
}

// Presentation shortcuts never submit an action or advance a round.
function toggleFocus(){const focused=document.body.classList.toggle('focus-room');$('#focus-room').setAttribute('aria-pressed',String(focused));$('#focus-room').textContent=focused?'Exit focus ⛶':'Focus room ⛶';room.fit()}
$('#focus-room').onclick=toggleFocus;
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;if(e.key.toLowerCase()==='f'){e.preventDefault();toggleFocus()}if(e.key==='Escape'&&document.body.classList.contains('focus-room'))toggleFocus();const choices=Object.keys(actionInfo),choice=choices[Number(e.key)-1];if(choice&&match?.status==='playing'&&!busy&&!inspecting&&match.people[0].legal.includes(choice)){action=choice;render();document.querySelector(`[data-action="${choice}"]`)?.focus()}});
$('#motion').addEventListener('change',e=>document.body.classList.toggle('reduce-motion',e.target.checked));
