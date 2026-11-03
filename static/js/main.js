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

/* Workbench navigation and read-only code explorer */
const workbench=document.querySelector('.workbench');
const activityButtons=[...document.querySelectorAll('[data-view]')];
const modeButtons=[...document.querySelectorAll('[data-mode]')];
function setMode(mode){
  document.querySelector('#chatMode').hidden=mode!=='chat';
  document.querySelector('#agentMode').hidden=mode!=='agent';
  modeButtons.forEach(btn=>{const active=btn.dataset.mode===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));});
}
modeButtons.forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.mode)));
function showView(view){
  workbench.classList.remove('show-explorer','show-chat','show-agent','show-terminal');
  workbench.classList.add('show-'+view);
  activityButtons.forEach(btn=>{const on=btn.dataset.view===view;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));});
  if(view==='agent'||view==='chat')setMode(view);
  if(view==='terminal'){$('terminalPanel').classList.remove('collapsed');$('terminalBody').hidden=false;$('toggleTerminal').setAttribute('aria-expanded','true');$('terminalInput').focus();}
  if(view==='explorer')loadExplorer();
}
activityButtons.forEach(btn=>btn.addEventListener('click',()=>{
  const view=btn.dataset.view;
  if(window.matchMedia('(min-width:851px)').matches){
    if(view==='explorer'){workbench.classList.toggle('sidebar-closed');if(!workbench.classList.contains('sidebar-closed'))loadExplorer();}
    else if(view==='terminal'){$('terminalInput').focus();$('terminalPanel').classList.remove('collapsed');$('terminalBody').hidden=false;}
    else{workbench.classList.remove('assistant-closed');setMode(view);}
  }else showView(view);
  activityButtons.forEach(b=>{const active=b===btn;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}));
document.querySelectorAll('[data-quick]').forEach(btn=>btn.addEventListener('click',()=>{
  const view=btn.dataset.quick;
  if(window.matchMedia('(max-width:850px)').matches)showView(view);
  else if(view==='terminal'){$('terminalPanel').classList.remove('collapsed');$('terminalBody').hidden=false;$('terminalInput').focus();}
  else{workbench.classList.remove('assistant-closed');setMode(view);(view==='agent'?$('agentGoal'):$('chatInput')).focus();}
}));
$('toggleTerminal').onclick=()=>{
  const collapsed=$('terminalPanel').classList.toggle('collapsed');
  $('terminalBody').hidden=collapsed;$('toggleTerminal').setAttribute('aria-expanded',String(!collapsed));
  $('toggleTerminal').textContent=collapsed?'⌃':'⌄';
};
$('toggleAssistant').onclick=()=>{
  if(window.matchMedia('(max-width:850px)').matches)showView('explorer');
  else workbench.classList.toggle('assistant-closed');
};
$('activitySettings').onclick=()=> $('settingsBtn').click();

let openFile=null;
function setEditorTab(which){
  $('welcomeView').hidden=which!=='welcome';
  $('codeView').hidden=which!=='file';
  const showFile=which==='file'&&Boolean(openFile);
  $('fileTab').classList.toggle('selected',showFile);$('fileTab').setAttribute('aria-selected',String(showFile));
  $('welcomeTab').classList.toggle('selected',!showFile);$('welcomeTab').setAttribute('aria-selected',String(!showFile));
  $('breadcrumbs').textContent=showFile?'AI Chat Interface › '+openFile:'AI Chat Interface › Welcome';
}
$('welcomeTab').addEventListener('click',()=>setEditorTab('welcome'));
$('fileTab').addEventListener('click',()=>{if(openFile)setEditorTab('file');});
async function getWorkspace(endpoint,path){
  const res=await fetch(endpoint+'?path='+encodeURIComponent(path),{cache:'no-store'});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'Workspace request failed');
  return data;
}
async function openWorkspaceFile(path,row){
  try{
    const data=await getWorkspace('/api/workspace/read',path);
    openFile=path;
    $('fileTab').hidden=false;
    $('fileTabName').textContent=path.split('/').pop();
    $('fileContents').textContent=data.content;
    const lines=data.content.split('\n').length;
    $('lineNumbers').textContent=Array.from({length:lines},(_,i)=>String(i+1)).join('\n');
    setEditorTab('file');
    document.querySelectorAll('.file-entry.active').forEach(e=>e.classList.remove('active'));
    row.classList.add('active');
    if(window.matchMedia('(max-width:850px)').matches)showView('editor');
  }catch(err){show('File unavailable',err.message);}
}
async function drawFolder(container,path,depth=0){
  const data=await getWorkspace('/api/workspace/list',path);
  if(path==='.')$('workspaceName').textContent=(data.workspace||'WORKSPACE').toUpperCase();
  const entries=data.entries||[];
  if(!entries.length){const empty=document.createElement('div');empty.className='empty-tree';empty.textContent='(empty)';container.append(empty);}
  for(const entry of entries){
    const full=path==='.'?entry.name:path+'/'+entry.name;
    const button=document.createElement('button');button.type='button';button.className='file-entry';
    button.style.paddingLeft=(12+depth*14)+'px';
    button.setAttribute('role','treeitem');
    const icon=document.createElement('span');icon.className='file-icon '+(entry.directory?'folder':'file');icon.textContent=entry.directory?'▸':'◇';
    const label=document.createElement('span');label.textContent=entry.name+(entry.directory?'/':'');
    button.append(icon,label);container.append(button);
    if(entry.directory){
      button.setAttribute('aria-expanded','false');
      const children=document.createElement('div');children.className='file-nested';children.hidden=true;container.append(children);
      button.addEventListener('click',async()=>{
        const expand=button.getAttribute('aria-expanded')!=='true';
        button.setAttribute('aria-expanded',String(expand));children.hidden=!expand;icon.textContent=expand?'▾':'▸';
        if(expand&&!children.dataset.loaded){
          children.textContent='Loading…';
          try{children.replaceChildren();await drawFolder(children,full,depth+1);children.dataset.loaded='yes';}
          catch(err){children.textContent='Unable to open: '+err.message;}
        }
      });
    }else button.addEventListener('click',()=>openWorkspaceFile(full,button));
  }
}
let explorerBusy=false;
async function loadExplorer(){
  if(explorerBusy)return;
  explorerBusy=true;
  $('fileTree').textContent='Loading workspace…';
  try{$('fileTree').replaceChildren();await drawFolder($('fileTree'),'.');}
  catch(err){$('fileTree').textContent='Explorer unavailable: '+err.message;}
  finally{explorerBusy=false;}
}
$('refreshFiles').addEventListener('click',loadExplorer);
loadExplorer();
$('modelSelect').addEventListener('change',()=>{$('statusModel').textContent=$('modelSelect').value||'FreeLLMAPI';});
const originalRefresh=$('refreshModels').onclick;
const modelObserver=new MutationObserver(()=>{
  $('statusModel').textContent=selectedModel||'FreeLLMAPI';
});
modelObserver.observe($('modelSelect'),{childList:true});
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
    e.preventDefault();
    if(window.matchMedia('(max-width:850px)').matches)showView('chat');
    else setMode('chat');
    $('chatInput').focus();
  }
});
