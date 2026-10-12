/* Operations only. No guest, QR, voucher or stamp writes. */
const OPS_V3_TEST_MODE = false;
const OPS_SPREADSHEET_URL='https://docs.google.com/spreadsheets/d/1vC8zXVTzKzvWPw_vOx7OKXEtJyx9zQJr-Y1Kbn-QLR4/edit';
const REPORTS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwtUCHluill1Op33aDBXnCvotAmRxBnkI8Nz0D01bAOygVMmWwMtLyDdKbRGY5Vv1TE/exec'; // One protected endpoint; test and production destinations are separate.
let opsChecklistConfig = {}, opsPhotoDrafts = {}, opsQueueBusy = false;
const OPS_STAGE_NAMES = {open:'Открытие',day:'В течение дня',close:'Закрытие'};
function opsRoot(){ return OPS_V3_TEST_MODE ? '/ops_v3_test' : '/ops_v3'; }
function opsId(){ return crypto.randomUUID().replace(/-/g,''); }
function opsDraftKey(){return [state.staffShop,state.staffName,todayKey(),state.opMode==='checklist'?state.checklistStage:state.opMode].join(':');}
function getChecklistItems(stage,shopId=state.staffShop){
  const custom=opsChecklistConfig[shopId]?.stages?.[stage];
  return Array.isArray(custom)?custom.filter(x=>x.active!==false).map(x=>[x.id,x.label,!!x.requirePhoto]):SHIFT_CHECKLISTS[stage].map(x=>[...x,false]);
}
async function loadChecklistConfig(){
  try{const r=await fetch(DB_URL+opsRoot()+'/checklist_config.json');if(!r.ok)throw Error('HTTP '+r.status);opsChecklistConfig=await r.json()||{};state.opsConfigError='';}
  catch(e){state.opsConfigError='Не удалось обновить чек-листы. Показана последняя загруженная версия.';}
  render();
}
function opsStore(name,mode,operation){
  return new Promise((resolve,reject)=>{const req=indexedDB.open(OPS_V3_TEST_MODE?'solncekofe-operations-v3':'solncekofe-operations-v3-production',1);
    req.onupgradeneeded=()=>{req.result.createObjectStore('queue',{keyPath:'reportId'});req.result.createObjectStore('drafts');};
    req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction(name,mode);let result;
      try{const r=operation(tx.objectStore(name));r.onsuccess=()=>{result=r.result;};r.onerror=()=>reject(r.error);}catch(e){db.close();reject(e);return;}
      tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=()=>{db.close();reject(tx.error||Error('Не удалось сохранить на устройстве'));};tx.onerror=()=>reject(tx.error);
    };
  });
}
function opsPhotos(key=opsDraftKey()){return opsPhotoDrafts[key]||[];}
function renderOpsPhotos(group='report',title='Фотоотчёт'){
  const key=opsDraftKey(),photos=opsPhotos().filter(x=>x.group===group);
  return `<div class="ops-photos"><b>${esc(title)}</b><div class="ops-row"><label class="ops-select">📷 Сделать фото<input type="file" accept="image/*" capture="environment" data-action="ops-photo" data-group="${esc(group)}" hidden></label><label class="ops-select">🖼 Из галереи<input type="file" accept="image/*" multiple data-action="ops-photo" data-group="${esc(group)}" hidden></label></div><div class="ops-photo-grid">${photos.map(x=>`<div><img src="${x.dataUrl}" alt="${esc(title)}"><button type="button" class="ops-cancel" data-action="ops-remove-photo" data-id="${x.id}">Убрать фото</button></div>`).join('')}</div></div>`;
}
async function restoreOpsPhotos(){
  const key=opsDraftKey();if(opsPhotoDrafts[key])return;
  try{opsPhotoDrafts[key]=await opsStore('drafts','readonly',s=>s.get(key))||[];}catch(e){showToast('Фото пока хранятся только до закрытия приложения.');opsPhotoDrafts[key]=[];}
  if(key===opsDraftKey())render();
}
async function addOpsPhotos(files,group){
  if(state.opsPhotoLoading)return;const key=opsDraftKey();state.opsPhotoLoading=true;render();
  try{
    const previous=opsPhotos(key),next=[...previous];
    if(next.length+files.length>12)throw Error('Можно прикрепить до 12 фото к одному отчёту.');
    for(const file of files){
      if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw Error('Выберите изображение размером до 20 МБ.');
      const dataUrl=await readFileAsCompressedDataURL(file,1920,0.86);
      if(dataUrl.length>2000000)throw Error('Фото слишком большое. Сделайте снимок ближе.');
      next.push({id:opsId(),group,dataUrl});
    }
    if(next.reduce((n,x)=>n+x.dataUrl.length,0)>8000000)throw Error('Общий размер фото слишком большой. Уберите лишние снимки.');
    await opsStore('drafts','readwrite',s=>s.put(next,key));opsPhotoDrafts[key]=next;
  }catch(e){showToast(e.message||'Не удалось сохранить фото.');}
  state.opsPhotoLoading=false;render();
}
async function removeOpsPhoto(id){const key=opsDraftKey(),next=opsPhotos().filter(x=>x.id!==id);try{await opsStore('drafts','readwrite',s=>s.put(next,key));opsPhotoDrafts[key]=next;render();}catch(e){showToast('Не удалось убрать фото.');}}
function renderOpsAuth(){return state.reportPassword?'':`<label class="hint">Для отправки отчёта подтвердите личный пароль<input class="text-input" type="password" autocomplete="off" placeholder="Личный пароль сотрудника" data-action="ops-report-password"></label>`;}
function renderOpsSync(){return `<div class="ops-wide"><div class="hint">${OPS_V3_TEST_MODE?'Тестовая версия · ':''}${state.opsPending||0} отчётов ожидают отправки в таблицу</div><button class="ops-cancel" data-action="ops-retry" ${opsQueueBusy?'disabled':''}>Повторить отправку</button>${state.opsSyncMessage?`<div class="hint">${esc(state.opsSyncMessage)}</div>`:''}</div>`;}
function sendOpsRequest(body,password,admin=false){
  if(!REPORTS_WEBHOOK_URL)return Promise.reject(Error('Интеграция ещё не подключена. Отчёт сохранён на устройстве.'));
  return new Promise((resolve,reject)=>{
    const nonce=opsId(),frame=document.createElement('iframe'),form=document.createElement('form');frame.name='ops-'+nonce;frame.hidden=true;form.hidden=true;form.method='POST';form.action=REPORTS_WEBHOOK_URL;form.target=frame.name;
    const field=document.createElement('input');field.type='hidden';field.name='payload';field.value=JSON.stringify({apiVersion:3,nonce,returnOrigin:location.origin,mode:OPS_V3_TEST_MODE?'test':'production',...body,auth:{password,admin}});form.appendChild(field);
    let timer;const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',listener);form.remove();frame.remove();};
    const listener=e=>{if(!/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+[.-])?script\.googleusercontent\.com)$/.test(e.origin)||e.data?.channel!=='solncekofe-ops-v3'||e.data.nonce!==nonce)return;cleanup();if(e.data.ok&&e.data.apiVersion===3)resolve(e.data);else reject(Error(e.data.error||'Таблица не подтвердила сохранение.'));};
    window.addEventListener('message',listener);timer=setTimeout(()=>{cleanup();reject(Error('Нет подтверждения Google. Отчёт остаётся в очереди.'));},60000);
    document.body.append(frame,form);try{form.submit();}catch(e){cleanup();reject(e);}
  });
}
async function adminPasswordLoginV3(){
  if(state.adminVerifying)return;
  state.adminVerifying=true;state.adminPinError='';render();
  try{const result=await sendOpsRequest({action:'authorizeAdmin'},state.adminPinValue,true);if(result.authorized!==true)throw Error('Нет подтверждения администратора.');state.adminAuthed=true;await loadAdminOrders();}
  catch(e){state.adminAuthed=false;state.adminPinError=e.message;}
  finally{state.adminVerifying=false;render();}
}
async function updateOpsPending(){try{state.opsPending=(await opsStore('queue','readonly',s=>s.getAll())).filter(x=>x.shopId===state.staffShop&&x.submittedBy===state.staffName).length;}catch(e){state.opsSyncMessage='Не удалось открыть очередь на устройстве.';}}
async function retryOpsQueue(){
  if(opsQueueBusy)return;if(!state.reportPassword){state.opsSyncMessage='Введите личный пароль в форме отчёта для повторной отправки.';render();return;}
  const identity=[state.staffShop,state.staffName].join(':'),password=state.reportPassword;opsQueueBusy=true;render();
  try{const rows=await opsStore('queue','readonly',s=>s.getAll());for(const row of rows.filter(x=>[x.shopId,x.submittedBy].join(':')===identity)){
    await sendOpsRequest({action:'submitReport',report:row},password);await opsStore('queue','readwrite',s=>s.delete(row.reportId));
  }state.opsSyncMessage='Все отчёты подтверждены Google Таблицей.';}catch(e){state.opsSyncMessage=e.message;}
  opsQueueBusy=false;await updateOpsPending();render();
}
async function enqueueOpsReport(payload){
  if(!state.staffName||![1,2].includes(state.staffShop))throw Error('Сначала войдите как сотрудник.');
  const draftKey=opsDraftKey(),photos=opsPhotos().map(x=>({...x}));
  if(state.opsPhotoLoading)throw Error('Дождитесь загрузки фото.');
  const report={...payload,reportId:opsId(),schemaVersion:3,configRevision:opsChecklistConfig[state.staffShop]?.revision||'default',shopId:state.staffShop,shopName:SHOPS.find(x=>x.id===state.staffShop).name,submittedBy:state.staffName,submittedAt:Date.now(),date:payload.date||todayKey(),photos};
  await opsStore('queue','readwrite',s=>s.put(report));
  // Clearing the draft happens only after the full report, including photos, is durable.
  try{await opsStore('drafts','readwrite',s=>s.delete(draftKey));opsPhotoDrafts[draftKey]=[];}catch(e){}
  await updateOpsPending();await retryOpsQueue();return report;
}
function opsSavedMessage(){return state.opsPending?'Отчёт сохранён на устройстве и ожидает отправки. '+(state.opsSyncMessage||''):'Отчёт и фотографии сохранены. Google Таблица подтвердила запись.';}
function renderChecklistV3(){
  const stage=state.checklistStage,items=getChecklistItems(stage),draft=readChecklistDraft(),photos=opsPhotos();
  return `<div class="ops-form" id="ops-active-form"><h3>Чек-лист смены</h3><p class="hint">${esc(SHOPS.find(s=>s.id===state.staffShop)?.name||'')} · ${todayKey()}</p>${state.opsConfigError?`<p class="hint">${esc(state.opsConfigError)}</p>`:''}<select class="ops-select" data-action="checklist-stage" aria-label="Этап смены">${Object.entries(OPS_STAGE_NAMES).map(([id,label])=>`<option value="${id}" ${id===stage?'selected':''}>${label}</option>`).join('')}</select>${items.map(([id,label,required])=>`<label class="checkline"><input type="checkbox" data-action="checklist-item" data-key="${id}" ${draft[id]===true?'checked':''}><span>${esc(label)}${required?' · фото обязательно':''}</span></label>${renderOpsPhotos(id,'Фото: '+label)}`).join('')}${renderOpsPhotos('report','Общий фотоотчёт')}<p class="hint">Выполнено ${items.filter(([id])=>draft[id]===true).length} из ${items.length}. Незавершённые пункты остаются видны в отчёте. Прикрепите хотя бы одно фото.</p>${renderOpsAuth()}<button class="ops-submit" data-action="save-checklist" ${state.checklistSaving||state.opsPhotoLoading||!items.length?'disabled':''}>${state.checklistSaving?'Сохраняем…':'Сохранить отчёт чек-листа'}</button>${state.checklistMsg?`<div class="ops-message ${state.checklistMsgOk?'ok':'bad'}">${esc(state.checklistMsg)}</div>`:''}<button class="ops-cancel" data-action="close-op">Закрыть</button></div>`;
}
async function submitChecklistV3(){
  if(state.checklistSaving)return;state.checklistSaving=true;state.checklistMsg='';render();
  try{const stage=state.checklistStage,items=getChecklistItems(stage),draft=readChecklistDraft(),photos=opsPhotos();
    if(!items.length)throw Error('Для этого этапа нет активных пунктов.');if(!photos.length)throw Error('Прикрепите фотоотчёт.');
    if(items.some(([id,,required])=>required&&!photos.some(p=>p.group===id)))throw Error('Добавьте фото к каждому обязательному пункту.');
    const checks=items.map(([id,label,requirePhoto])=>({key:id,label,requirePhoto,done:draft[id]===true}));
    await enqueueOpsReport({type:'checklist',stage,checks,completed:checks.every(x=>x.done)});state.checklistMsg=opsSavedMessage();state.checklistMsgOk=true;
  }catch(e){state.checklistMsg=e.message;state.checklistMsgOk=false;}
  state.checklistSaving=false;render();
}
function getEditableChecklist(){
  if(!state.opsConfigDraft){const saved=opsChecklistConfig[state.adminChecklistShop];state.opsConfigDraft=saved?JSON.parse(JSON.stringify(saved)):{schemaVersion:3,stages:Object.fromEntries(Object.keys(OPS_STAGE_NAMES).map(stage=>[stage,SHIFT_CHECKLISTS[stage].map(([id,label])=>({id,label,active:true,requirePhoto:false}))]))};}
  return state.opsConfigDraft;
}
function renderAdminChecklists(){
  const config=getEditableChecklist(),stage=state.adminChecklistStage,items=config.stages[stage];
  return `<div class="ops-form"><h3>Управление чек-листами</h3><p><a class="ops-cancel" href="${OPS_SPREADSHEET_URL}" target="_blank" rel="noopener">📊 Рабочая Google Таблица</a></p><p class="hint">Изменения применятся к новым отчётам. Отправленные отчёты сохраняют прежние пункты и фото.</p><select class="ops-select" data-action="admin-checklist-shop" aria-label="Кофейня">${SHOPS.map(s=>`<option value="${s.id}" ${s.id===state.adminChecklistShop?'selected':''}>${esc(s.name)}</option>`).join('')}</select><select class="ops-select" data-action="admin-checklist-stage" aria-label="Этап">${Object.entries(OPS_STAGE_NAMES).map(([id,label])=>`<option value="${id}" ${id===stage?'selected':''}>${label}</option>`).join('')}</select>${items.map((x,i)=>`<div class="ops-check-editor ${x.active===false?'archived':''}"><input class="text-input" value="${esc(x.label)}" maxlength="180" data-action="admin-checklist-label" data-id="${x.id}" aria-label="Пункт ${i+1}"><label class="checkline"><input type="checkbox" data-action="admin-checklist-photo" data-id="${x.id}" ${x.requirePhoto?'checked':''}>Фото обязательно</label><button class="ops-cancel" data-action="admin-checklist-toggle" data-id="${x.id}">${x.active===false?'Вернуть пункт':'Убрать пункт'}</button></div>`).join('')}<button class="ops-cancel" data-action="admin-checklist-add">＋ Добавить пункт</button><button class="ops-submit" data-action="admin-checklist-save" ${state.opsConfigSaving?'disabled':''}>Сохранить для этой кофейни</button>${state.opsConfigMessage?`<p class="hint">${esc(state.opsConfigMessage)}</p>`:''}</div>`;
}
async function saveAdminChecklist(){
  if(!state.adminAuthed||state.opsConfigSaving)return;const config=JSON.parse(JSON.stringify(getEditableChecklist())),shop=state.adminChecklistShop;state.opsConfigSaving=true;render();
  try{if(Object.values(config.stages).some(items=>items.length>50||items.some(x=>!x.label.trim())))throw Error('Заполните названия пунктов. Не более 50 пунктов на этап.');
    const result=await sendOpsRequest({action:'saveChecklistConfig',shopId:shop,config},state.adminPinValue,true);opsChecklistConfig[shop]={...config,revision:result.revision};state.opsConfigMessage='Чек-лист сохранён. Старые отчёты не изменены.';
  }catch(e){state.opsConfigMessage=e.message;}
  state.opsConfigSaving=false;render();
}
async function saveOperationV3(){
  if(state.opsSaving)return;const type=state.opMode,amount=Number(state.opAmount),party=(state.opParty||'').trim();
  if(!['delivery','expense','issue'].includes(type)||!party||(type!=='issue'&&(!Number.isFinite(amount)||amount<=0))){state.opMsg='Заполните поставщика / назначение и сумму.';state.opMsgOk=false;render();return;}
  state.opsSaving=true;render();try{await enqueueOpsReport({type,amount:type==='issue'?0:amount,party,goods:state.opGoods||'',note:state.opNote||'',payment:state.opPayment||'cash',status:'active'});state.opMsg=opsSavedMessage();state.opMsgOk=true;state.opAmount='';state.opParty='';state.opGoods='';state.opNote='';}catch(e){state.opMsg=e.message;state.opMsgOk=false;}state.opsSaving=false;render();
}
async function closeShiftV3(){
  if(state.opsSaving)return;const cash=Number(state.shiftCash),cashless=Number(state.shiftCashless),actual=Number(state.shiftActual),items=getChecklistItems('close');
  if(!state.shiftActual.trim()||![cash,cashless,actual].every(x=>Number.isFinite(x)&&x>=0)||cash+cashless<=0){state.shiftMsg='Введите наличные, безнал и фактическую сумму в кассе.';state.shiftMsgOk=false;render();return;}
  if(items.some(([id])=>state.shiftChecks[id]!==true)){state.shiftMsg='Отметьте выполненные пункты или сообщите о проблеме.';state.shiftMsgOk=false;render();return;}
  if(!opsPhotos().some(x=>x.group==='closing')){state.shiftMsg='Добавьте фото закрытой точки.';state.shiftMsgOk=false;render();return;}
  if(items.some(([id,,required])=>required&&!opsPhotos().some(x=>x.group===id))){state.shiftMsg='Добавьте фото к обязательным пунктам закрытия.';state.shiftMsgOk=false;render();return;}
  state.opsSaving=true;render();try{await enqueueOpsReport({type:'shift',stage:'close',cash,cashless,total:cash+cashless,actualCash:actual,openedAt:state.shiftOpenedAt,checks:items.map(([key,label,requirePhoto])=>({key,label,requirePhoto,done:state.shiftChecks[key]===true})),completed:true});state.shiftMsg=opsSavedMessage();state.shiftMsgOk=true;state.shiftCash='';state.shiftCashless='';state.shiftActual='';state.shiftChecks=emptyShiftChecks();state.shiftOpenedAt=null;}catch(e){state.shiftMsg=e.message;state.shiftMsgOk=false;}state.opsSaving=false;render();
}
function initOpsV3(){Object.assign(state,{adminChecklistShop:1,adminChecklistStage:'open',opsConfigDraft:null,opsConfigSaving:false,opsConfigMessage:'',opsConfigError:'',opsPhotoLoading:false,opsSaving:false,opsPending:0,opsSyncMessage:'',reportPassword:'',opGoods:''});loadChecklistConfig();updateOpsPending();}
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;
  if(a==='ops-remove-photo')removeOpsPhoto(el.dataset.id);else if(a==='ops-retry')retryOpsQueue();
  else if(a==='admin-checklist-add'){const list=getEditableChecklist().stages[state.adminChecklistStage];if(list.length<50)list.push({id:'custom_'+opsId(),label:'Новый пункт',active:true,requirePhoto:false});render();}
  else if(a==='admin-checklist-toggle'){const item=getEditableChecklist().stages[state.adminChecklistStage].find(x=>x.id===el.dataset.id);if(item)item.active=item.active===false;render();}
  else if(a==='admin-checklist-save')saveAdminChecklist();
  else if(a==='open-op'||a==='go-staff')queueMicrotask(()=>{restoreOpsPhotos();updateOpsPending();});
});
document.addEventListener('input',e=>{const el=e.target.closest('[data-action]');if(!el)return;if(el.dataset.action==='admin-checklist-label'){const x=getEditableChecklist().stages[state.adminChecklistStage].find(x=>x.id===el.dataset.id);if(x)x.label=el.value;}else if(el.dataset.action==='ops-report-password')state.reportPassword=el.value;else if(el.dataset.action==='set-op-goods')state.opGoods=el.value;});
document.addEventListener('change',e=>{const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;
  if(a==='ops-photo')addOpsPhotos(Array.from(el.files||[]),el.dataset.group);
  else if(a==='admin-checklist-photo'){const x=getEditableChecklist().stages[state.adminChecklistStage].find(x=>x.id===el.dataset.id);if(x)x.requirePhoto=el.checked;}
  else if(a==='admin-checklist-shop'){state.adminChecklistShop=Number(el.value);state.opsConfigDraft=null;state.opsConfigMessage='';render();}
  else if(a==='admin-checklist-stage'){state.adminChecklistStage=el.value;render();}
  else if(a==='checklist-stage')queueMicrotask(()=>restoreOpsPhotos());
});

window.addEventListener('online',()=>{if(state.reportPassword)retryOpsQueue();});
