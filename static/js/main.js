const $=id=>document.getElementById(id);
const session=sessionStorage.getItem('studioSession')||crypto.randomUUID();sessionStorage.setItem('studioSession',session);
let selectedModel='';
async function loadModels(){
  const select=$('modelSelect'),previous=select.value||selectedModel;
  select.disabled=true;$('refreshModels').disabled=true;$('modelError').textContent='';
  select.replaceChildren(new Option('Loading ready models…',''));
  try{
    const res=await fetch('/api/models',{cache:'no-store'});
    const data=await res.json();
    if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);
    select.replaceChildren(...data.models.map(m=>new Option(m.id,m.id)));
    const ids=data.models.map(m=>m.id);
    selectedModel=ids.includes(previous)?previous:ids[0];
    select.value=selectedModel;
    select.disabled=false;
  }catch(err){
    selectedModel='';
    select.replaceChildren(new Option('No ready models',''));
    $('modelError').textContent=err.message;
  }finally{$('refreshModels').disabled=false;}
}
$('modelSelect').addEventListener('change',e=>{selectedModel=e.target.value;});
$('refreshModels').addEventListener('click',loadModels);
loadModels();
const commandHistory=[];let historyIndex=0,terminalBusy=false,chatBusy=false;
async function post(path,body){const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);return data;}
function terminalLine(tag,message,error=false){const row=document.createElement('div');row.className='entry'+(error?' error':'');const prefix=document.createElement('span');prefix.className='tag';prefix.textContent=tag+' ';const body=document.createElement('span');body.textContent=message;row.append(prefix,body);$('terminalOutput').append(row);$('terminalOutput').scrollTop=$('terminalOutput').scrollHeight;}
function chatBubble(role,message){const row=document.createElement('div');row.className='chat-message '+role;const label=document.createElement('div');label.className='speaker';label.textContent=role==='user'?'You':'AI';const body=document.createElement('div');body.textContent=message;row.append(label,body);$('chatOutput').append(row);$('chatOutput').scrollTop=$('chatOutput').scrollHeight;}
$('terminalForm').addEventListener('submit',async e=>{e.preventDefault();const input=$('terminalInput'),value=input.value.trim();if(!value||terminalBusy)return;terminalBusy=true;input.value='';commandHistory.push(value);historyIndex=commandHistory.length;terminalLine('❯',value);$('terminalStatus').textContent='● Running';try{const result=await post('/api/command',{session,command:value});if(result.clear)$('terminalOutput').replaceChildren();else terminalLine('SYS ›',result.output);}catch(err){terminalLine('ERROR ›',err.message,true);}finally{terminalBusy=false;$('terminalStatus').textContent='● Ready';input.focus();}});
$('terminalInput').addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();historyIndex=Math.max(0,Math.min(commandHistory.length,historyIndex+(e.key==='ArrowUp'?-1:1)));e.target.value=commandHistory[historyIndex]||'';}});
$('chatForm').addEventListener('submit',async e=>{e.preventDefault();const input=$('chatInput'),value=input.value.trim();if(!value||chatBusy)return;if(!selectedModel){$('modelError').textContent='No ready model selected. Refresh the model list.';return;}chatBusy=true;input.value='';chatBubble('user',value);$('chatStatus').textContent='● Thinking';try{const result=await post('/api/chat',{session,message:value,model:selectedModel});chatBubble('assistant',result.reply);}catch(err){chatBubble('assistant','Error: '+err.message);}finally{chatBusy=false;$('chatStatus').textContent='● Ready';input.focus();}});
$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chatForm').requestSubmit();}});
function show(title,content){$('modalTitle').textContent=title;$('modalContent').textContent=content;$('modal').showModal();}
$('historyBtn').onclick=async()=>{try{const res=await fetch('/api/history?session='+encodeURIComponent(session));if(!res.ok)throw Error('History unavailable');const items=await res.json();show('AI Chat History',items.map(m=>`${m.role.toUpperCase()} (${m.time}):\n${m.content}`).join('\n\n')||'No saved messages yet.');}catch(e){show('Error',e.message);}};
$('settingsBtn').onclick=async()=>{try{const res=await fetch('/api/settings');if(!res.ok)throw Error('Settings unavailable');show('Settings',JSON.stringify(await res.json(),null,2));}catch(e){show('Error',e.message);}};
$('clearTerminal').onclick=()=>{$('terminalOutput').replaceChildren();$('terminalInput').focus();};
$('clearChat').onclick=()=>{$('chatOutput').replaceChildren();$('chatInput').focus();};
$('closeModal').onclick=()=>$('modal').close();

/* The supervised agent is separate from ordinary chat and terminal. */
let pendingAgent=null,agentBusy=false;
function renderAgent(data){
  $('agentState').textContent=data.status||'unknown';
  const events=(data.events||[]).map(e=>`${e.tool}: ${e.result}`).join('\n\n');
  $('agentActivity').textContent=[events,data.result||''].filter(Boolean).join('\n\n');
  pendingAgent=data.pending||null;
  $('agentApproval').hidden=!pendingAgent;
  if(pendingAgent){
    $('agentReason').textContent=pendingAgent.tool+': '+(pendingAgent.reason||'Review this action');
    $('agentPreview').textContent=pendingAgent.preview||'No preview';
  }
  $('agentStart').disabled=agentBusy||data.status==='approval';
}
$('agentForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(agentBusy)return;
  const goal=$('agentGoal').value.trim();
  if(!goal)return;
  if(!selectedModel){$('agentActivity').textContent='Select a ready model first.';return;}
  agentBusy=true;$('agentStart').disabled=true;$('agentState').textContent='Working';
  $('agentActivity').textContent='Planning and using permitted tools…';
  $('agentApproval').hidden=true;
  try{renderAgent(await post('/api/agent/start',{session,goal,model:selectedModel}));}
  catch(err){$('agentState').textContent='Error';$('agentActivity').textContent=err.message;}
  finally{agentBusy=false;if(!pendingAgent)$('agentStart').disabled=false;}
});
async function decideAgent(approve){
  if(agentBusy||!pendingAgent)return;
  const id=pendingAgent.id;
  agentBusy=true;$('agentApprove').disabled=true;$('agentReject').disabled=true;
  $('agentState').textContent=approve?'Executing approved action':'Rejecting action';
  try{renderAgent(await post('/api/agent/decision',{session,id,approve}));}
  catch(err){$('agentState').textContent='Error';$('agentActivity').textContent=err.message;}
  finally{agentBusy=false;$('agentApprove').disabled=false;$('agentReject').disabled=false;$('agentStart').disabled=!!pendingAgent;}
}
$('agentApprove').addEventListener('click',()=>decideAgent(true));
$('agentReject').addEventListener('click',()=>decideAgent(false));
fetch('/api/agent/status?session='+encodeURIComponent(session))
 .then(r=>r.ok?r.json():Promise.reject(Error('Agent status unavailable')))
 .then(renderAgent).catch(err=>{$('agentActivity').textContent=err.message;});
