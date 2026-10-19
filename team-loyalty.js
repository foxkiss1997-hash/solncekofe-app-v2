/* Team features use the authenticated Apps Script endpoint, never direct client writes. */
const teamUI={busy:false,message:'',guestId:'',guest:null,selected:'',amount:'',reason:'',lookupKey:'',schedule:null,scheduleKey:'',date:'',start:'08:00',end:'21:00',name:'',editing:null,pending:new Map()};
function teamIsAdmin(){return state.screen==='admin'&&state.adminAuthed;}
function teamShop(){return teamIsAdmin()?Number(state.teamShop||1):state.staffShop;}
function teamIdentity(){return [teamIsAdmin()?'owner':state.staffName,teamShop()].join(':');}
function teamRequest(body){return sendOpsRequest({shopId:teamShop(),submittedBy:state.staffName,...body},teamIsAdmin()?state.adminPinValue:state.reportPassword,teamIsAdmin());}
function teamOperation(body){
 const key=JSON.stringify([teamIdentity(),body]);
 if(!teamUI.pending.has(key))teamUI.pending.set(key,opsId());
 return {...body,operationId:teamUI.pending.get(key)};
}
function parseLoyaltyQr(raw){
 const text=String(raw||'').trim().replace(/^solncekofe:/i,'');
 const match=text.match(/^([A-Z0-9_-]{4,32})(?::gift:([A-Z0-9_-]{2,40}))?$/i);
 if(!match)throw Error('Это не QR-код карты или подарка Солнцекофе.');
 return {guestId:match[1].toUpperCase(),voucherId:match[2]?.toUpperCase()||''};
}
function parseGuestQr(raw){return parseLoyaltyQr(raw).guestId;}

function teamScan(){
 const tg=window.Telegram?.WebApp;
 if(typeof tg?.showScanQrPopup!=='function'){teamUI.message='Откройте мини-приложение в Telegram для сканирования или введите ID вручную.';render();return;}
 try{tg.showScanQrPopup({text:'Карта гостя: просмотр подарков и бонусов'},text=>{
  try{const qr=parseLoyaltyQr(text);teamUI.guestId=qr.guestId;teamUI.guest=null;teamUI.selected='';teamLookup(qr.voucherId);}catch(e){teamUI.message=e.message;render();}
  tg.closeScanQrPopup();return true;
 });}catch(e){teamUI.message='Не удалось открыть камеру. Введите ID вручную.';render();}
}
async function teamLookup(voucherId=''){
 if(teamUI.busy)return;
 let guestId;try{guestId=parseGuestQr(teamUI.guestId);}catch(e){teamUI.message=e.message;render();return;}
 teamUI.guestId=guestId;teamUI.busy=true;teamUI.message='';teamUI.guest=null;teamUI.selected='';
 const identity=teamIdentity();render();
 try{const result=await teamRequest({action:'loyaltyLookup',guestId});if(identity!==teamIdentity()||guestId!==teamUI.guestId)return;teamUI.guest=result.guest;teamUI.lookupKey=identity+':'+guestId;if(voucherId){if(result.guest.vouchers.some(v=>v.id===voucherId))teamUI.selected=voucherId;else teamUI.message='Этот подарок уже погашен, недоступен или истёк. Обновите карту гостя.';}}
 catch(e){teamUI.message=e.message;}finally{teamUI.busy=false;render();}
}
async function teamMutate(action,extra={}){
 if(teamUI.busy)return;
 if(!teamUI.guest||teamUI.lookupKey!==teamIdentity()+':'+teamUI.guestId){teamUI.message='Сначала обновите карту гостя.';render();return;}
 const body=teamOperation({action,guestId:teamUI.guestId,...extra}),identity=teamIdentity(),guestId=teamUI.guestId;
 teamUI.busy=true;teamUI.message='';render();
 try{const result=await teamRequest(body);if(identity!==teamIdentity()||guestId!==teamUI.guestId)return;
  teamUI.guest=result.guest;teamUI.selected='';teamUI.amount='';teamUI.reason='';teamUI.message=action==='redeemGift'?'Подарок выдан и погашен. Повторно использовать его нельзя.':'Операция подтверждена сервером. История обновлена.';
  for(const [key,id]of teamUI.pending)if(id===body.operationId)teamUI.pending.delete(key);
  // Another intentional operation needs a fresh lookup.
  teamUI.lookupKey=identity+':'+guestId;
 }catch(e){teamUI.message=e.message+' Перед повтором обновите карту и проверьте историю.';teamUI.lookupKey='';}
 finally{teamUI.busy=false;render();}
}
function renderTeamLoyalty(){
 const valid=teamUI.lookupKey===teamIdentity()+':'+teamUI.guestId,g=valid?teamUI.guest:null;
 const selected=g?.vouchers.find(x=>x.id===teamUI.selected),admin=teamIsAdmin(),disabled=teamUI.busy?'disabled':'';
 return `<div class="ops-form" id="ops-active-form"><h3>Подарки и бонусы</h3><p class="hint">Сканирование только открывает карту. Выдача требует отдельного подтверждения.</p><button class="ops-cancel" data-action="team-scan" ${disabled}>📷 Сканировать QR гостя</button><label class="hint">ID карты<input class="text-input" data-action="team-guest-id" value="${esc(teamUI.guestId)}" autocomplete="off" ${disabled}></label><button class="ops-submit" data-action="team-lookup" ${disabled}>${teamUI.busy?'Проверяем…':'Открыть / обновить карту'}</button>
 ${g?`<h3 style="margin-top:16px">${esc(g.name)}</h3><p>Штампы: ${g.stamps} · Бонусы: <b>${g.bonusBalance}</b></p><p class="hint">Бонусы ведутся отдельно от штампов и прокруток. Автоматический кешбэк пока не настроен.</p>${g.vouchers.length?g.vouchers.map(v=>`<div class="loyalty-row"><b>${esc(v.label)}</b><span class="hint">${esc(v.id)}</span><button class="ops-cancel" data-action="team-select-gift" data-id="${esc(v.id)}" ${disabled}>Выбрать подарок</button></div>`).join(''):'<p class="hint">Доступных подарков нет.</p>'}
 ${selected?`<div class="ops-message"><b>Выдать «${esc(selected.label)}» гостю ${esc(teamUI.guestId)}?</b><p class="hint">Точка: ${esc(SHOPS.find(x=>x.id===teamShop())?.name||'Владелец')}</p><button class="ops-submit" data-action="team-confirm-gift" ${disabled}>Подтвердить выдачу подарка</button></div>`:''}
 <label class="hint">Количество бонусов<input class="text-input" type="number" min="1" step="1" data-action="team-amount" value="${esc(teamUI.amount)}" ${disabled}></label><label class="hint">Основание / номер чека<input class="text-input" data-action="team-reason" maxlength="240" value="${esc(teamUI.reason)}" ${disabled}></label><button class="ops-cancel" data-action="team-spend-preview" ${disabled}>Проверить списание бонусов</button>${admin?`<button class="ops-cancel" data-action="team-credit-preview" ${disabled}>Начислить бонусы</button>`:''}
 ${teamUI.selected==='spendBonus'||teamUI.selected==='creditBonus'?`<div class="ops-message"><b>${teamUI.selected==='spendBonus'?'Списать':'Начислить'} ${esc(teamUI.amount)} бонусов по карте ${esc(teamUI.guestId)}?</b><p>${esc(teamUI.reason)}</p><button class="ops-submit" data-action="team-confirm-bonus" ${disabled}>Подтвердить операцию</button></div>`:''}
 <h3 style="margin-top:18px">История операций</h3>${g.history.length?g.history.map(x=>`<div class="loyalty-row"><b>${esc(({awardStamp:'Начисление штампа',redeemGift:'Выдача подарка',spendBonus:'Списание бонусов',creditBonus:'Начисление бонусов',reverseLoyalty:'Отмена операции'})[x.action]||x.action)}</b><span>${esc(x.label||x.reason||'')} ${x.amount||''}</span><span class="hint">${new Date(x.at).toLocaleString('ru-RU')} · ${esc(x.actor)} · ${x.shopId?'точка '+x.shopId:'владелец'}${x.reversedBy?' · отменено':''}</span>${admin&&!x.reversedBy&&['redeemGift','spendBonus','creditBonus'].includes(x.action)?`<button class="ops-cancel" data-action="team-reverse-preview" data-id="${x.id}" ${disabled}>Отменить с указанием причины</button>`:''}</div>`).join(''):'<p class="hint">История пока пуста.</p>'}
 ${teamUI.selected.startsWith('reverse:')?`<p class="hint">Введите причину в поле «Основание» выше.</p><button class="ops-submit" data-action="team-confirm-reverse" ${disabled}>Подтвердить отмену операции</button>`:''}`:''}
 ${teamUI.message?`<p class="ops-message" role="status">${esc(teamUI.message)}</p>`:''}${!admin?'<button class="ops-cancel" data-action="close-op">Закрыть</button>':''}</div>`;
}
async function teamLoadSchedule(){
 if(teamUI.busy)return;teamUI.busy=true;teamUI.message='';const key=teamIdentity();render();
 try{const data=await teamRequest({action:'listSchedule'});if(key===teamIdentity()){if(teamUI.selectionKey!==key)loadShiftSelection();teamUI.schedule=data;teamUI.scheduleKey=key;applyShiftHours();}}
 catch(e){teamUI.message=e.message;}finally{teamUI.busy=false;render();}
}
async function teamSaveSchedule(action,row){
 if(teamUI.busy)return;
 const body=teamOperation({action,shiftId:row?.id||teamUI.editing?.id||(teamUI.newShiftId||(teamUI.newShiftId=opsId())),revision:row?.revision||teamUI.editing?.revision||'',date:teamUI.date||todayKey(),start:teamUI.start,end:teamUI.end,name:teamUI.name,targetName:teamUI.swapName||''});
 teamUI.busy=true;teamUI.message='';const identity=teamIdentity();render();
 try{const result=await teamRequest(body);if(identity!==teamIdentity())return;
  const data=teamUI.schedule||(teamUI.schedule={rows:[],staff:[]});data.rows=data.rows.filter(x=>x.id!==result.row.id);if(result.row.status!=='cancelled')data.rows.push(result.row);
  if(data.myRows){data.myRows=data.myRows.filter(x=>!(x.id===result.row.id&&x.shopId===teamShop()));if(result.row.name===state.staffName&&['approved','pending'].includes(result.row.status))data.myRows.push({...result.row,shopId:teamShop()});}
  if(data.teamRows){data.teamRows=data.teamRows.filter(x=>!(x.id===result.row.id&&x.shopId===teamShop()));if(result.row.status==='approved')data.teamRows.push({...result.row,shopId:teamShop()});}
  teamUI.scheduleKey=identity;teamUI.editing=null;teamUI.newShiftId=null;for(const [key,id]of teamUI.pending)if(id===body.operationId)teamUI.pending.delete(key);teamUI.message='График сохранён.';
 }catch(e){teamUI.message=e.message;}finally{teamUI.busy=false;render();}
}
function personalScheduleRows(data){
 return (data.myRows||data.rows.map(x=>({...x,shopId:teamShop()}))).filter(x=>x.name===state.staffName&&['approved','pending'].includes(x.status));
}
function scheduleDayState(rows,date){
 const day=rows.filter(x=>x.date===date);return day.some(x=>x.status==='approved')?'work':day.some(x=>x.status==='pending')?'pending':'off';
}
function scheduleDateLabel(date){return new Date(date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long',timeZone:'UTC'});}
function scheduleTeamRows(data){return (data.teamRows||data.rows.map(x=>({...x,shopId:teamShop()}))).filter(x=>x.status==='approved'&&x.name);}
function renderDayTeam(data,date){
 const rows=scheduleTeamRows(data).filter(x=>x.date===date).sort((a,b)=>a.start.localeCompare(b.start)||a.name.localeCompare(b.name));
 return `<section class="day-team" aria-label="Кто работает в этот день"><h4>Кто работает в этот день</h4>${rows.length?SHOPS.filter(shop=>rows.some(x=>x.shopId===shop.id)).map(shop=>`<div class="day-team-shop"><b>${esc(shop.name)}</b>${rows.filter(x=>x.shopId===shop.id).map(x=>`<div class="day-team-person"><span>${esc(x.name)}${x.name===state.staffName?' · вы':''}</span><span>${esc(x.start)}–${esc(x.end)}</span></div>`).join('')}</div>`).join(''):'<p>Утверждённых смен на этот день пока нет.</p>'}</section>`;
}
function renderPersonalSchedule(data){
 const rows=personalScheduleRows(data),today=todayKey(),month=teamUI.calendarMonth||today.slice(0,7),selected=teamUI.calendarDate||today;
 const [year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(year,m,0)).getUTCDate();
 const dayRows=rows.filter(x=>x.date===selected).sort((a,b)=>a.start.localeCompare(b.start)),status=scheduleDayState(rows,selected),clock=new Date().toLocaleTimeString('sv-SE',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hour12:false}),upcoming=rows.filter(x=>x.status==='approved'&&(x.date>today||(x.date===today&&x.end>clock))).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start))[0];
 const shop=row=>esc(SHOPS.find(x=>x.id===row.shopId)?.name||'Кофейня');
 return `<section class="personal-schedule" aria-label="Мой график"><h3>Мой график</h3><p class="hint">${esc(state.staffName)} · обе кофейни</p><div class="next-shift">${upcoming?`Ближайшая смена: <b>${esc(scheduleDateLabel(upcoming.date))}</b><span>${esc(upcoming.start)}–${esc(upcoming.end)} · ${shop(upcoming)}</span>`:'Предстоящих утверждённых смен пока нет.'}</div>
 <button class="ops-cancel" data-action="team-calendar-multi">${teamUI.multiDates?'Завершить выбор дней':'Выбрать несколько дней'}</button>${teamUI.multiDates?`<p class="hint">Отметьте нужные дни: выбрано ${(teamUI.selectedDates||[]).length}. Затем добавьте их в общий выбор ниже.</p>`:''}<div class="schedule-month"><button class="ops-cancel" data-action="team-calendar-prev" aria-label="Предыдущий месяц">‹</button><b>${first.toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).replace(' г.','')}</b><button class="ops-cancel" data-action="team-calendar-next" aria-label="Следующий месяц">›</button></div><div class="schedule-legend"><span class="work">Работа</span><span class="pending">Заявка</span><span>Нет смены</span></div><div class="schedule-calendar">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<span class="weekday">${x}</span>`).join('')}${'<span aria-hidden="true"></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),kind=scheduleDayState(rows,date),label=kind==='work'?'Работа':kind==='pending'?'Заявка':'Нет смены';return `<button class="calendar-day ${kind} ${date===selected?'selected':''} ${(teamUI.selectedDates||[]).includes(date)?'multi-selected':''} ${date===today?'today':''}" data-action="team-calendar-day" data-date="${date}" aria-pressed="${teamUI.multiDates?(teamUI.selectedDates||[]).includes(date):date===selected}" aria-label="${esc(scheduleDateLabel(date))}: ${label}"><b>${i+1}</b><span>${kind==='work'?'Смена':kind==='pending'?'Заявка':'—'}</span></button>`;}).join('')}</div>
 <div class="schedule-day-detail" aria-live="polite"><h4>${esc(scheduleDateLabel(selected))}</h4>${dayRows.length?dayRows.map(row=>`<div class="my-shift-detail"><b>${row.status==='approved'?'На работу':'Заявка — ещё не утверждена'}</b><span>${esc(row.start)}–${esc(row.end)} · ${shop(row)}</span>${row.swap&&['requested','accepted'].includes(row.swap.status)?'<small>Замена ещё не утверждена. Действует исходная смена.</small>':''}</div>`).join(''):'<b>Выходить по графику не требуется: смена не назначена.</b>'}${status==='pending'?'<p class="hint">Дождитесь согласования. Заявка ещё не является рабочей сменой.</p>':''}</div>${renderDayTeam(data,selected)}<p class="hint">Показаны назначенные смены. Владелец может дополнить график — обновляйте его перед выходом.</p></section>`;
}
function moveScheduleMonth(delta){
 const [year,month]=(teamUI.calendarMonth||todayKey().slice(0,7)).split('-').map(Number),next=new Date(Date.UTC(year,month-1+delta,1));
 teamUI.calendarMonth=next.toISOString().slice(0,7);teamUI.calendarDate=teamUI.calendarMonth+'-01';render();
}
function shiftDraftKey(){return 'sk_shift_draft_v1:'+teamIdentity();}
function loadShiftSelection(){
 teamUI.selectionKey=teamIdentity();teamUI.selectionEditing=null;teamUI.selectedDates=[];teamUI.multiDates=false;
 try{const saved=JSON.parse(localStorage.getItem(shiftDraftKey())||'[]');teamUI.shiftSelection=Array.isArray(saved)?saved.filter(x=>/^[a-f0-9]{32}$/.test(x.shiftId)&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&/^\d{2}:\d{2}$/.test(x.start)&&/^\d{2}:\d{2}$/.test(x.end)).slice(0,31):[];}catch(e){teamUI.shiftSelection=[];}
}
function shiftSelection(){if(teamUI.selectionKey!==teamIdentity())loadShiftSelection();return teamUI.shiftSelection||(teamUI.shiftSelection=[]);}
function saveShiftSelection(showMessage=false){
 try{localStorage.setItem(shiftDraftKey(),JSON.stringify(shiftSelection()));if(showMessage)teamUI.message='Выбор сохранён на этом устройстве. Его можно изменить перед отправкой.';return true;}
 catch(e){teamUI.message='Не удалось сохранить выбор на устройстве. Разрешите сохранение данных.';return false;}
}
function toggleShiftSelection(row){
 const items=shiftSelection(),at=items.findIndex(x=>x.shiftId===row.id);
 if(at>=0)items.splice(at,1);else if(items.length<31)items.push({shiftId:row.id,revision:row.revision||'',date:row.date,start:row.start,end:row.end,label:row.name?'Замена: '+row.name:'Свободная смена'});
 else teamUI.message='Можно выбрать до 31 смены.';saveShiftSelection();render();
}
function addShiftSelection(){
 const date=teamUI.date||teamUI.calendarDate||todayKey(),start=teamUI.start,end=teamUI.end,editing=teamUI.selectionEditing;
 if(date<todayKey()||start>=end){teamUI.message='Выберите предстоящую дату и корректное время.';render();return;}
 const existing=teamUI.schedule.rows.find(x=>x.date===date&&start<x.end&&x.start<end&&['open','approved'].includes(x.status));
 if(existing){teamUI.message='На это время уже есть смена. Выберите её в расписании ниже.';render();return;}
 if(shiftSelection().some(x=>x.shiftId!==editing&&x.date===date&&start<x.end&&x.start<end)){teamUI.message='Это время уже выбрано.';render();return;}
 if(editing){const item=shiftSelection().find(x=>x.shiftId===editing);if(!item||item.revision)return;Object.assign(item,{date,start,end});teamUI.selectionEditing=null;saveShiftSelection();render();}
 else toggleShiftSelection({id:opsId(),date,start,end,name:''});
}
function addCalendarSelection(){
 const dates=[...(teamUI.selectedDates||[])].sort(),items=shiftSelection(),newItems=[],start=teamUI.start,end=teamUI.end;
 if(!dates.length||start>=end){teamUI.message='Отметьте дни и проверьте время смены.';render();return;}
 for(const date of dates){
  const {start,end}=shiftBusinessHours(teamShop(),date);
  if(date<todayKey()){teamUI.message='Выберите предстоящие дни.';render();return;}
  const rows=teamUI.schedule.rows.filter(x=>x.date===date&&['approved','open'].includes(x.status)),available=rows.filter(x=>x.status==='open'||x.name!==state.staffName),matching=available.filter(x=>x.start===start&&x.end===end);
  const row=matching.length===1?matching[0]:available.length===1?available[0]:null;
  if(rows.length&&!row){teamUI.message='На '+date+' ваша смена уже назначена либо есть несколько вариантов. Выберите нужные часы в расписании.';render();return;}
  if(row&&['requested','accepted'].includes(row.swap?.status)){teamUI.message='На '+date+' уже есть заявка на замену.';render();return;}
  const item=row?{shiftId:row.id,revision:row.revision||'',date,start:row.start,end:row.end,label:row.name?'Замена: '+row.name:'Свободная смена'}:{shiftId:opsId(),revision:'',date,start,end,label:'Новая смена'};
  if(items.some(x=>x.shiftId===item.shiftId||x.date===date&&x.start<item.end&&item.start<x.end))continue;
  newItems.push(item);
 }
 if(items.length+newItems.length>31){teamUI.message='Можно выбрать до 31 смены.';render();return;}
 items.push(...newItems);teamUI.selectedDates=[];teamUI.multiDates=false;saveShiftSelection();teamUI.message='В общий выбор добавлено смен: '+newItems.length+'. Отправьте весь список одной кнопкой.';render();
}
function editShiftSelection(id){
 const item=shiftSelection().find(x=>x.shiftId===id);if(!item)return;
 if(item.revision){teamUI.message='Часы готовой смены задаёт администратор. Уберите её из выбора и выберите другую смену.';render();return;}
 Object.assign(teamUI,{selectionEditing:id,editing:null,date:item.date,start:item.start,end:item.end});render();
}
async function teamSubmitSelection(){
 if(teamUI.busy||!shiftSelection().length||teamUI.selectionEditing)return;
 const identity=teamIdentity(),items=shiftSelection().map(({label,...x})=>x),body=teamOperation({action:'requestShifts',items});
 teamUI.busy=true;teamUI.message='';render();
 try{
  await teamRequest(body);if(identity!==teamIdentity())return;
  teamUI.shiftSelection=[];saveShiftSelection();teamUI.selectionEditing=null;for(const [key,id]of teamUI.pending)if(id===body.operationId)teamUI.pending.delete(key);
  teamUI.message='Заявки отправлены: '+items.length+'. До согласования действуют прежние назначения.';
  try{const data=await teamRequest({action:'listSchedule'});if(identity===teamIdentity()){teamUI.schedule=data;teamUI.scheduleKey=identity;}}catch(e){teamUI.message+=' Обновите график для проверки статуса.';}
 }catch(e){teamUI.message=e.message+' Выбор сохранён. Обновите график перед повтором.';}
 finally{teamUI.busy=false;render();}
}
function scheduleApprovalGroups(data){
 const groups=new Map();
 for(const row of data.rows){
  if(row.date<todayKey()||!(row.status==='pending'||row.status==='approved'&&['requested','accepted'].includes(row.swap?.status)))continue;
  const latest=Object.entries(row.history||{}).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).find(([,event])=>['requestShift','requestSwap'].includes(event.action)),batch=row.requestBatchId||(latest?.[1].batch?latest[0]:row.id),name=row.status==='pending'?row.name:row.swap.to,key=batch+':'+name;
  if(!groups.has(key))groups.set(key,{id:key,name,rows:[]});groups.get(key).rows.push(row);
 }
 return [...groups.values()].map(g=>({...g,rows:g.rows.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start))}));
}
function renderScheduleApprovals(data){
 const groups=scheduleApprovalGroups(data),count=groups.reduce((n,g)=>n+g.rows.length,0),disabled=teamUI.busy?'disabled':'';
 return `<section class="schedule-approvals" aria-label="Подтверждение графика"><h3>Подтверждение графика <span class="status-badge">${count}</span></h3><p class="hint">${esc(SHOPS.find(x=>x.id===teamShop())?.name||'')} · заявки сгруппированы по отправке сотрудника.</p>${groups.length?groups.map(g=>`<article class="approval-card"><h4>${esc(g.name)} · ${g.rows.length} смен</h4>${g.rows.map(row=>`<div class="approval-slot"><b>${esc(row.date)} · ${esc(row.start)}–${esc(row.end)}</b><small>${row.status==='pending'?'Заявка на смену':`Замена: ${esc(row.swap.from)} → ${esc(row.swap.to)}`}</small></div>`).join('')}<div class="schedule-actions"><button class="ops-submit" data-action="team-review-preview" data-decision="approveShifts" data-group="${esc(g.id)}" ${disabled}>Подтвердить все (${g.rows.length})</button><button class="ops-cancel" data-action="team-review-preview" data-decision="rejectShifts" data-group="${esc(g.id)}" ${disabled}>Отклонить все (${g.rows.length})</button></div></article>`).join(''):'<p class="hint">Новых заявок на график нет.</p>'}${teamUI.review&&teamUI.review.identity===teamIdentity()?`<div class="ops-message" role="status"><b>${teamUI.review.action==='approveShifts'?'Подтвердить':'Отклонить'} ${teamUI.review.items.length} смен для ${esc(teamUI.review.name)}?</b><p class="hint">${teamUI.review.action==='approveShifts'?'После подтверждения назначения появятся в графике сотрудников.':'Текущие утверждённые назначения сохранятся.'}</p><button class="ops-submit" data-action="team-review-confirm" ${disabled}>${teamUI.review.action==='approveShifts'?'Да, подтвердить график':'Да, отклонить заявки'}</button><button class="ops-cancel" data-action="team-review-cancel" ${disabled}>Назад к проверке</button></div>`:''}</section>`;
}
function prepareScheduleReview(groupId,action){
 if(!teamIsAdmin()||!['approveShifts','rejectShifts'].includes(action))return;
 const group=scheduleApprovalGroups(teamUI.schedule||{rows:[]}).find(g=>g.id===groupId);if(!group)return;
 teamUI.review={identity:teamIdentity(),action,name:group.name,items:group.rows.map(x=>({shiftId:x.id,revision:x.revision||''}))};teamUI.message='';render();
}
async function submitScheduleReview(){
 const review=teamUI.review;if(teamUI.busy||!teamIsAdmin()||review?.identity!==teamIdentity())return;
 const body=teamOperation({action:review.action,items:review.items}),identity=teamIdentity();teamUI.busy=true;teamUI.message='';render();
 try{
  const result=await teamRequest(body);if(identity!==teamIdentity())return;
  if(!Array.isArray(result.rows)||result.rows.length!==review.items.length)throw Error('Сервер не подтвердил весь список. Обновите график.');
  for(const row of result.rows){teamUI.schedule.rows=teamUI.schedule.rows.filter(x=>x.id!==row.id);if(row.status!=='cancelled')teamUI.schedule.rows.push(row);}
  for(const [key,id]of teamUI.pending)if(id===body.operationId)teamUI.pending.delete(key);
  teamUI.review=null;teamUI.message=(review.action==='approveShifts'?'График подтверждён. Смен: ':'Заявки отклонены. Смен: ')+result.rows.length+'.';
 }catch(e){teamUI.message=e.message+' Решение не подтверждено на этом экране.';}
 finally{teamUI.busy=false;render();}
}
function shiftBusinessHours(shopId,date){
 const weekend=[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay());
 return Number(shopId)===2?(weekend?{start:'10:00',end:'22:00'}:{start:'08:00',end:'21:00'}):(weekend?{start:'09:00',end:'21:00'}:{start:'08:00',end:'20:00'});
}
function applyShiftHours(){if(!teamUI.editing)Object.assign(teamUI,shiftBusinessHours(teamShop(),teamUI.date||teamUI.calendarDate||todayKey()));}
function adminShiftDraft(){
 const key=teamIdentity()+':'+(teamUI.adminName||'');if(teamUI.adminDraftKey!==key){teamUI.adminDraftKey=key;teamUI.adminDraft=[];teamUI.adminConfirm=false;}
 return teamUI.adminDraft;
}
function adminDaySlot(data,date){
 const hours=shiftBusinessHours(teamShop(),date),rows=data.rows.filter(x=>x.date===date&&['open','pending','approved'].includes(x.status)&&hours.start<x.end&&x.start<hours.end),row=rows.length===1?rows[0]:null;
 const elsewhere=(data.teamRows||[]).find(x=>x.shopId!==teamShop()&&x.name===teamUI.adminName&&x.date===date&&x.status==='approved'&&hours.start<x.end&&x.start<hours.end);
 const other=rows.find(x=>x.name&&x.name!==teamUI.adminName),assigned=row?.status==='approved'&&row.name===teamUI.adminName;
 const blocked=!!(rows.length>1||other||elsewhere||['requested','accepted'].includes(row?.swap?.status));
 return {row,assigned,blocked,label:elsewhere?'Другая точка':other?other.name:rows.length>1?'Несколько смен':['requested','accepted'].includes(row?.swap?.status)?'Замена':assigned?'Назначена':row?.status==='pending'?'Заявка':'Свободно',...hours};
}
function toggleAdminShiftDate(date){
 if(!teamIsAdmin()||teamUI.busy||!teamUI.adminName||teamUI.scheduleKey!==teamIdentity())return;
 const items=adminShiftDraft(),index=items.findIndex(x=>x.date===date);teamUI.adminConfirm=false;
 if(index>=0)items.splice(index,1);
 else{const slot=adminDaySlot(teamUI.schedule,date);if(date<todayKey()||slot.blocked||slot.assigned)return;if(items.length>=31){teamUI.message='Можно назначить до 31 смены за один раз.';render();return;}items.push({date,shiftId:slot.row?.id||opsId(),revision:slot.row?.revision||''});}
 teamUI.message='';render();
}
function moveAdminMonth(delta){const [y,m]=(teamUI.adminMonth||todayKey().slice(0,7)).split('-').map(Number);teamUI.adminMonth=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);teamUI.adminConfirm=false;render();}
function renderAdminCalendar(data){
 const items=adminShiftDraft(),disabled=teamUI.busy?'disabled':'',month=teamUI.adminMonth||todayKey().slice(0,7),[year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(year,m,0)).getUTCDate(),name=teamUI.adminName||'';
 const weekdays=shiftBusinessHours(teamShop(),'2026-10-19'),weekends=shiftBusinessHours(teamShop(),'2026-10-24');
 return `<section class="personal-schedule admin-calendar" aria-label="Календарь назначения смен"><h3>Назначить график сотруднику</h3><label class="hint">Сотрудник для графика<select class="ops-select" data-action="team-admin-name" ${disabled}><option value="">Выберите сотрудника</option>${data.staff.map(x=>`<option value="${esc(x)}" ${name===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label><p class="hint">Будни: ${weekdays.start}–${weekdays.end} · Сб–Вс: ${weekends.start}–${weekends.end}.</p><div class="schedule-month"><button class="ops-cancel" data-action="team-admin-prev" aria-label="Предыдущий месяц назначения" ${disabled}>‹</button><b>${first.toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).replace(' г.','')}</b><button class="ops-cancel" data-action="team-admin-next" aria-label="Следующий месяц назначения" ${disabled}>›</button></div><p class="hint">${name?'Отметьте нужные дни.':'Сначала выберите сотрудника, затем отметьте дни.'} Занятые дни недоступны. Готовую смену можно изменить ниже.</p><div class="schedule-calendar">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<span class="weekday">${x}</span>`).join('')}${'<span aria-hidden="true"></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),slot=adminDaySlot(data,date),selected=items.some(x=>x.date===date),blocked=date<todayKey()||!name||slot.blocked||slot.assigned;return `<button class="calendar-day ${slot.assigned?'work':slot.blocked?'unavailable':'off'} ${selected?'multi-selected':''}" data-action="team-admin-day" data-date="${date}" aria-pressed="${selected}" aria-label="${esc(scheduleDateLabel(date))}: ${esc(slot.label)} · ${slot.start}–${slot.end}" title="${esc(slot.label)} · ${slot.start}–${slot.end}" ${disabled||blocked?'disabled':''}><b>${i+1}</b><span>${esc(slot.label)}</span></button>`;}).join('')}</div><section class="shift-selection" aria-label="Назначаемые смены"><h4>Выбрано смен: ${items.length}</h4>${[...items].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>{const h=shiftBusinessHours(teamShop(),x.date);return `<div><span>${esc(scheduleDateLabel(x.date))}<small>${h.start}–${h.end}</small></span><button class="ops-cancel" data-action="team-admin-remove" data-date="${x.date}" aria-label="Убрать назначение ${x.date}" ${disabled}>×</button></div>`;}).join('')||'<p class="hint">Выберите дни в календаре. До подтверждения график сотрудника не меняется.</p>'}<button class="ops-submit" data-action="team-admin-review" ${disabled||!items.length||!name?'disabled':''}>Подтвердить график (${items.length})</button>${teamUI.adminConfirm?`<div class="ops-message"><b>Назначить ${items.length} смен сотруднику ${esc(name)}?</b><p>${esc(SHOPS.find(x=>x.id===teamShop())?.name||'')} · даты и часы указаны выше. Смены сразу станут утверждёнными и появятся в календаре сотрудника.</p><button class="ops-submit" data-action="team-admin-submit" ${disabled}>Да, назначить смены</button><button class="ops-cancel" data-action="team-admin-back" ${disabled}>Вернуться к выбору</button></div>`:''}</section></section>`;
}
async function submitAdminShifts(){
 if(teamUI.busy||!teamIsAdmin()||!teamUI.adminConfirm||!adminShiftDraft().length)return;
 const identity=teamIdentity(),name=teamUI.adminName,items=adminShiftDraft().map(x=>({...x})),body=teamOperation({action:'assignShifts',shopId:teamShop(),name,items});teamUI.busy=true;teamUI.message='';render();
 try{const result=await teamRequest(body);if(identity!==teamIdentity()||name!==teamUI.adminName)return;
  if(!Array.isArray(result.rows)||result.rows.length!==items.length||items.some(x=>!result.rows.some(r=>r.id===x.shiftId&&r.name===name&&r.status==='approved')))throw Error('Сервер не подтвердил весь график. Обновите расписание перед повтором.');
  const data=teamUI.schedule;for(const row of result.rows){data.rows=data.rows.filter(x=>x.id!==row.id);data.rows.push(row);data.teamRows=(data.teamRows||[]).filter(x=>!(x.shopId===teamShop()&&x.id===row.id));data.teamRows.push({...row,shopId:teamShop()});}
  teamUI.adminDraft=[];teamUI.adminConfirm=false;for(const [key,id]of teamUI.pending)if(id===body.operationId)teamUI.pending.delete(key);teamUI.message='Назначено смен: '+result.rows.length+'. График '+name+' обновлён; дополнительное согласование не требуется.';
 }catch(e){teamUI.message=e.message+' Выбранные дни сохранены на экране. При конфликте весь пакет остаётся без изменений.';}finally{teamUI.busy=false;render();}
}
function renderTeamSchedule(){
 const admin=teamIsAdmin(),data=teamUI.scheduleKey===teamIdentity()?teamUI.schedule:null,disabled=teamUI.busy?'disabled':'',labels={open:'Свободна',pending:'Ждёт администратора',approved:'Утверждена'},selection=shiftSelection();
 return `<div class="ops-form" id="ops-active-form"><h3>График команды</h3><p class="hint">На смене — один сотрудник. ${admin?'Назначайте смены и согласовывайте заявки.':'Выберите несколько смен. Свободные согласует администратор; замену — назначенный сотрудник или администратор.'}</p>${admin?`<label class="hint">Кофейня<select class="ops-select" data-action="team-shop" ${disabled}>${SHOPS.map(x=>`<option value="${x.id}" ${teamShop()===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`:''}<button class="ops-cancel" data-action="team-schedule-refresh" ${disabled}>${teamUI.busy?'Загружаем…':'Обновить график'}</button>
 ${data?`${admin?renderAdminCalendar(data)+renderScheduleApprovals(data):renderPersonalSchedule(data)}<h3>${admin?'Назначить смену':'Выбрать смены'}</h3><label class="hint">Дата<input class="text-input" type="date" data-action="team-date" value="${esc(teamUI.date||teamUI.calendarDate||todayKey())}" ${disabled}></label><div class="ops-row"><label class="hint">Начало<input class="text-input" type="time" data-action="team-start" value="${teamUI.start}" ${disabled}></label><label class="hint">Конец<input class="text-input" type="time" data-action="team-end" value="${teamUI.end}" ${disabled}></label></div>${admin?`<label class="hint">Сотрудник<select class="ops-select" data-action="team-name" ${disabled}><option value="">Открытая смена</option>${data.staff.map(x=>`<option ${teamUI.name===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label><button class="ops-submit" data-action="team-schedule-save" ${disabled}>${teamUI.editing?'Сохранить изменения':'Добавить смену'}</button>`:`${teamUI.editing?`<p class="hint">Изменение заявки: до утверждения она остаётся заявкой.</p><button class="ops-submit" data-action="team-schedule-save" ${disabled}>Сохранить изменения заявки</button>`:`<button class="ops-cancel" data-action="team-selection-add" ${disabled}>${teamUI.selectionEditing?'Сохранить изменение в выборе':'Добавить дату в выбор'}</button>${teamUI.selectionEditing?'<button class="ops-cancel" data-action="team-selection-edit-cancel">Отменить изменение</button>':''}`}${(teamUI.selectedDates||[]).length?`<button class="ops-submit" data-action="team-calendar-add" ${disabled}>Добавить выбранные дни (${teamUI.selectedDates.length})</button>`:''}<section class="shift-selection" aria-label="Выбранные смены"><h4>Выбрано смен: ${selection.length}</h4>${selection.map(x=>`<div><span>${esc(x.date)} · ${esc(x.start)}–${esc(x.end)}<small>${esc(x.label)}</small></span>${!x.revision?`<button class="ops-cancel" data-action="team-selection-edit" data-id="${x.shiftId}" ${disabled}>Изменить</button>`:''}<button class="ops-cancel" aria-label="Убрать смену ${esc(x.date)} ${esc(x.start)}" data-action="team-selection-remove" data-id="${x.shiftId}" ${disabled}>×</button></div>`).join('')||'<p class="hint">Добавьте даты или отметьте смены в расписании ниже.</p>'}<p class="hint">Черновик сохраняется на этом устройстве. До отправки его можно редактировать.</p><button class="ops-cancel" data-action="team-selection-save" ${disabled}>Сохранить выбор</button><button class="ops-submit" data-action="team-selection-submit" ${disabled||!selection.length||teamUI.selectionEditing?'disabled':''}>Отправить на согласование (${selection.length})</button></section>`}${teamUI.editing?'<button class="ops-cancel" data-action="team-edit-cancel">Отменить редактирование</button>':''}${!admin?`<label class="hint">Кому предложить свою смену<select class="ops-select" data-action="team-swap-name"><option value="">Выберите сотрудника</option>${data.staff.filter(x=>x!==state.staffName).map(x=>`<option ${teamUI.swapName===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`:''}<h3 style="margin-top:20px">Расписание</h3>${data.rows.filter(x=>x.date>=todayKey()).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)).map(row=>{
 const active=['requested','accepted'].includes(row.swap?.status),canConfirm=active&&(row.swap.direction==='incoming'?row.swap.from:row.swap.to)===state.staffName,chosen=selection.some(x=>x.shiftId===row.id);
 return `<div class="schedule-row ${chosen?'chosen':''}"><b>${esc(row.date)} · ${esc(row.start)}–${esc(row.end)}</b><span>${esc(row.name||'Свободная смена')}</span><span class="status-badge">${labels[row.status]||esc(row.status)}</span>${row.swap?`<span class="hint">Замена: ${esc(row.swap.from)} → ${esc(row.swap.to)} · ${esc(({requested:'на согласовании',accepted:'на согласовании',approved:'согласована',rejected:'отклонена / отменена'})[row.swap.status]||'')}</span>`:''}<div class="schedule-actions">${!admin&&row.name===state.staffName&&row.status==='approved'&&!active?`<button class="ops-cancel" data-action="team-shift-swap" data-id="${row.id}" ${disabled}>Предложить замену</button>`:''}${!admin&&canConfirm?`<button class="ops-submit" data-action="team-shift-accept-swap" data-id="${row.id}" ${disabled}>Согласовать замену</button>`:''}${admin&&active?`<button class="ops-submit" data-action="team-shift-approve-swap" data-id="${row.id}" ${disabled}>Согласовать замену</button>`:''}${active&&(admin||[row.swap.from,row.swap.to].includes(state.staffName))?`<button class="ops-cancel" data-action="team-shift-reject-swap" data-id="${row.id}" ${disabled}>Отклонить / отменить заявку</button>`:''}${admin?`<button class="ops-cancel" data-action="team-shift-edit" data-id="${row.id}" ${disabled}>Изменить</button>${row.status==='pending'?`<button class="ops-submit" data-action="team-shift-approve" data-id="${row.id}" ${disabled}>Утвердить</button><button class="ops-cancel" data-action="team-shift-reject" data-id="${row.id}" ${disabled}>Отклонить заявку</button>`:''}`:!active&&(row.status==='open'||row.status==='approved'&&row.name!==state.staffName)?`<button class="ops-cancel" data-action="team-shift-select" data-id="${row.id}" aria-pressed="${chosen}" ${disabled}>${chosen?'Убрать из выбора':row.status==='open'?'Выбрать смену':'Хочу взять эту смену'}</button>`:''}${!admin&&row.name===state.staffName&&row.status==='pending'&&!row.requestedFromOpen?`<button class="ops-cancel" data-action="team-shift-edit" data-id="${row.id}" ${disabled}>Изменить заявку</button>`:''}${admin||(row.name===state.staffName&&row.status==='pending')?`<button class="ops-cancel" data-action="team-shift-cancel" data-id="${row.id}" ${disabled}>Отменить смену</button>`:''}</div></div>`;}).join('')||'<p class="hint">Предстоящих смен пока нет.</p>'}`:'<p class="hint">Нажмите «Обновить график». Нужен личный пароль сотрудника.</p>'}${teamUI.message?`<p class="ops-message" role="status">${esc(teamUI.message)}</p>`:''}${!admin?'<button class="ops-cancel" data-action="close-op">Закрыть</button>':''}</div>`;
}
document.addEventListener('input',e=>{
 const fields={'team-guest-id':'guestId','team-amount':'amount','team-reason':'reason','team-date':'date','team-start':'start','team-end':'end','team-name':'name'},a=e.target.dataset.action;
 if(fields[a]){teamUI[fields[a]]=e.target.value;if(a==='team-guest-id'){teamUI.guest=null;teamUI.lookupKey='';teamUI.selected='';}}
});
document.addEventListener('change',e=>{
 const a=e.target.dataset.action;
 if(a==='team-admin-name'){teamUI.adminName=e.target.value;adminShiftDraft();teamUI.message='';render();}
 if(a==='team-date'){applyShiftHours();render();}
 if(a==='team-name')teamUI.name=e.target.value;
 if(a==='team-swap-name')teamUI.swapName=e.target.value;
 if(a==='team-shop'){teamUI.review=null;state.teamShop=Number(e.target.value);teamUI.editing=null;teamUI.name='';teamUI.adminName='';adminShiftDraft();applyShiftHours();teamLoadSchedule();}
});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;
 if(a.startsWith('team-')&&teamUI.busy)return;
 if(a==='team-scan')teamScan();
 else if(a==='team-lookup')teamLookup();
 else if(a==='team-select-gift'){teamUI.selected=el.dataset.id;render();}
 else if(a==='team-confirm-gift')teamMutate('redeemGift',{voucherId:teamUI.selected});
 else if(a==='team-spend-preview'||a==='team-credit-preview'){
  if(!Number.isSafeInteger(Number(teamUI.amount))||Number(teamUI.amount)<=0||!teamUI.reason.trim()){teamUI.message='Введите целое число бонусов и основание.';}else{teamUI.selected=a==='team-spend-preview'?'spendBonus':'creditBonus';teamUI.message='';}render();
 }else if(a==='team-confirm-bonus')teamMutate(teamUI.selected,{amount:Number(teamUI.amount),reason:teamUI.reason});
 else if(a==='team-reverse-preview'){teamUI.selected='reverse:'+el.dataset.id;teamUI.message='Введите причину отмены и подтвердите.';render();}
 else if(a==='team-confirm-reverse')teamMutate('reverseLoyalty',{originalId:teamUI.selected.slice(8),reason:teamUI.reason});
 else if(a==='team-admin-day'||a==='team-admin-remove')toggleAdminShiftDate(el.dataset.date);
 else if(a==='team-admin-prev')moveAdminMonth(-1);
 else if(a==='team-admin-next')moveAdminMonth(1);
 else if(a==='team-admin-review'){teamUI.adminConfirm=true;render();}
 else if(a==='team-admin-back'){teamUI.adminConfirm=false;render();}
 else if(a==='team-admin-submit')submitAdminShifts();
 else if(a==='team-calendar-prev')moveScheduleMonth(-1);
 else if(a==='team-calendar-next')moveScheduleMonth(1);
 else if(a==='team-calendar-multi'){teamUI.multiDates=!teamUI.multiDates;render();}
 else if(a==='team-calendar-add')addCalendarSelection();
 else if(a==='team-calendar-day'){teamUI.calendarDate=el.dataset.date;if(teamUI.multiDates){const dates=teamUI.selectedDates||(teamUI.selectedDates=[]),at=dates.indexOf(el.dataset.date);if(at>=0)dates.splice(at,1);else dates.push(el.dataset.date);}else{teamUI.date=el.dataset.date;applyShiftHours();}render();}
 else if(a==='team-selection-add')addShiftSelection();
 else if(a==='team-selection-save'){saveShiftSelection(true);render();}
 else if(a==='team-selection-edit')editShiftSelection(el.dataset.id);
 else if(a==='team-selection-edit-cancel'){teamUI.selectionEditing=null;render();}
 else if(a==='team-selection-submit')teamSubmitSelection();
 else if(a==='team-selection-remove'){teamUI.shiftSelection=shiftSelection().filter(x=>x.shiftId!==el.dataset.id);if(teamUI.selectionEditing===el.dataset.id)teamUI.selectionEditing=null;saveShiftSelection();render();}
 else if(a==='team-review-preview')prepareScheduleReview(el.dataset.group,el.dataset.decision);
 else if(a==='team-review-confirm')submitScheduleReview();
 else if(a==='team-review-cancel'){teamUI.review=null;render();}
 else if(a==='team-schedule-refresh'){teamUI.review=null;teamLoadSchedule();}
 else if(a==='team-schedule-save')teamSaveSchedule(teamIsAdmin()?'saveShift':teamUI.editing?'editShiftRequest':'requestShift');
 else if(a==='team-edit-cancel'){teamUI.editing=null;teamUI.name='';render();}
 else if(a.startsWith('team-shift-')){
  const row=teamUI.schedule?.rows.find(x=>x.id===el.dataset.id);if(!row)return;
  if(a==='team-shift-select')toggleShiftSelection(row);
  else if(a==='team-shift-edit'){Object.assign(teamUI,{selectionEditing:null,editing:row,date:row.date,start:row.start,end:row.end,name:row.name});render();}
  else teamSaveSchedule({'team-shift-swap':'requestSwap','team-shift-accept-swap':'acceptSwap','team-shift-approve-swap':'approveSwap','team-shift-reject-swap':'rejectSwap','team-shift-claim':'requestShift','team-shift-approve':'approveShift','team-shift-reject':'rejectShift','team-shift-cancel':'cancelShift'}[a],row);
 }
});
async function placePickupOrder(){
 if(state.payingNow)return;
 if(!LOYALTY_ID){state.checkoutError='Дождитесь загрузки карты гостя.';render();return;}
 const items=state.cart.map(x=>({itemId:x.itemId,qty:x.qty,sizeId:x.sizeId,milk:x.milk?.id||'regular',syrup:x.syrup?.id||'none',shot:!!x.shot}));
 const body={action:'createPickupOrder',shopId:state.shopId,guestId:LOYALTY_ID,guestName:state.guestName,contact:state.receiptContact,items,tip:tipAmount(),expectedTotal:cartTotal()+tipAmount(),pickupTime:state.pickupASAP?'':state.scheduledTime};
 const fingerprint=JSON.stringify(body);
 let pending;try{pending=JSON.parse(localStorage.getItem('sk_pending_pickup')||'null');}catch(e){}
 if(!pending||pending.fingerprint!==fingerprint){pending={fingerprint,orderId:opsId()};try{localStorage.setItem('sk_pending_pickup',JSON.stringify(pending));}catch(e){state.checkoutError='Разрешите сохранение на устройстве, чтобы избежать повторного заказа.';render();return;}}
 state.payingNow=true;render();
 try{
  const result=await sendOpsRequest({...body,orderId:pending.orderId},'',false);
  if(!result.order||result.orderId!==pending.orderId)throw Error('Нет подтверждения заказа.');
  const o=result.order;state.order={...o,firebaseId:result.orderId,shop:SHOPS.find(s=>s.id===o.shopId),cartSnapshot:state.cart.slice(),placedAt:o.createdAt,pickupLabel:o.pickup};
  saveOrderToStorage();state.cart=[];state.screen='status';localStorage.removeItem('sk_pending_pickup');
 }catch(e){state.checkoutError=e.message+' Заказ не подтверждён на этом экране. Повторная отправка использует тот же номер.';}
 finally{state.payingNow=false;render();}
}
function payrollKey(){return teamIdentity()+':'+(teamUI.payrollDate||todayKey());}
async function loadTeamPayroll(){
 if(teamUI.busy)return;const key=payrollKey();teamUI.busy=true;teamUI.message='';teamUI.payrollReview=null;render();
 try{const data=await teamRequest({action:'listPayroll',date:teamUI.payrollDate||todayKey()});if(key===payrollKey()){teamUI.payroll=data;teamUI.payrollKey=key;}}
 catch(e){teamUI.message=e.message;}finally{teamUI.busy=false;render();}
}
function movePayrollWeek(delta){
 if(teamUI.busy)return;const date=teamUI.payrollKey===payrollKey()?teamUI.payroll.week.start:teamUI.payrollDate||todayKey(),d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta*7);teamUI.payrollDate=d.toISOString().slice(0,10);loadTeamPayroll();
}
function payrollShortDate(date){return new Date(date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});}
function preparePayrollReview(action,id,shopId){
 if(!teamIsAdmin()||!['confirmWorkedShift','reverseWorkedShift'].includes(action)||teamUI.payrollKey!==payrollKey())return;
 const data=teamUI.payroll,rows=action==='confirmWorkedShift'?data.awaiting:data.rows,row=rows.find(x=>x.id===id&&x.shopId===Number(shopId));if(!row)return;
 teamUI.payrollReason='';teamUI.payrollReview={identity:teamIdentity(),action,row:{...row}};teamUI.message='';render();
}
async function submitPayrollReview(){
 const review=teamUI.payrollReview;if(teamUI.busy||!teamIsAdmin()||review?.identity!==teamIdentity())return;
 const reason=String(teamUI.payrollReason||'').trim();if(review.action==='reverseWorkedShift'&&reason.length<3){teamUI.message='Укажите причину отмены начисления.';render();return;}
 const body=teamOperation({action:review.action,shiftId:review.row.id,revision:review.row.revision,shopId:review.row.shopId,...(review.action==='reverseWorkedShift'?{reason}:{})}),identity=teamIdentity(),key=payrollKey();teamUI.busy=true;teamUI.message='';render();
 try{
  const result=await teamRequest(body);if(identity!==teamIdentity())return;if(!result.row||result.row.id!==review.row.id)throw Error('Нет подтверждения учёта смены.');
  for(const [pendingKey,id]of teamUI.pending)if(id===body.operationId)teamUI.pending.delete(pendingKey);
  teamUI.payrollReview=null;teamUI.payroll=null;teamUI.message='Учёт смены обновлён.';
  try{const data=await teamRequest({action:'listPayroll',date:teamUI.payrollDate||todayKey()});if(key===payrollKey()){teamUI.payroll=data;teamUI.payrollKey=key;}}catch(e){teamUI.message+=' Обновите расчёт для проверки итоговой суммы.';}
 }catch(e){teamUI.message=e.message+' Обновите расчёт перед повтором.';}
 finally{teamUI.busy=false;render();}
}
function renderTeamPayroll(){
 const admin=teamIsAdmin(),data=teamUI.payrollKey===payrollKey()?teamUI.payroll:null,disabled=teamUI.busy?'disabled':'',review=teamUI.payrollReview?.identity===teamIdentity()?teamUI.payrollReview:null;
 const point=row=>esc(SHOPS.find(x=>x.id===row.shopId)?.name||'Кофейня');
 return `<div class="ops-form payroll-form" id="ops-active-form"><h3>${admin?'Зарплата команды':'Моя зарплата'}</h3><p class="hint">${admin?'Обе кофейни':esc(state.staffName)+' · обе кофейни'} · 4 200 ₽ за отработанную смену.</p><div class="payroll-period"><button class="ops-cancel" data-action="team-payroll-prev" aria-label="Предыдущая неделя" ${disabled}>‹</button><b>${data?`${payrollShortDate(data.week.start)} — ${payrollShortDate(data.week.end)}`:'Расчёт за неделю'}</b><button class="ops-cancel" data-action="team-payroll-next" aria-label="Следующая неделя" ${disabled}>›</button></div><button class="ops-cancel" data-action="team-payroll-load" ${disabled}>${teamUI.busy?'Обновляем…':'Обновить расчёт'}</button>
 ${data?`<section class="payroll-total" aria-label="Начислено за неделю"><span>Начислено за неделю</span><strong>${money(data.amount)}</strong><span>Смены: ${money(data.gross??data.amount)} · штрафы: ${money(data.penaltyTotal||0)}</span><span>Отработано смен: ${data.count}</span><b>День выплаты — воскресенье, ${payrollShortDate(data.week.payDate)}</b></section><p class="hint">Период: понедельник — воскресенье. В расчёте только смены, отмеченные администратором как отработанные. Сумма показывает начисления; выплату проводит администратор.</p>${admin?`<h4>По сотрудникам</h4>${data.totals.map(x=>`<div class="payroll-person"><b>${esc(x.name)}</b><span>${x.count} смен · ${money(x.amount)}</span></div>`).join('')||'<p class="hint">Подтверждённых начислений за эту неделю пока нет.</p>'}<h4>Подтвердить отработанные смены</h4>${data.awaiting.map(row=>`<div class="payroll-row"><b>${esc(row.name)} · ${payrollShortDate(row.date)}</b><span>${esc(row.start)}–${esc(row.end)} · ${point(row)}</span>${row.replacementPending?'<p class="hint">Сначала обработайте заявку на замену в графике.</p>':`<button class="ops-submit" data-action="team-payroll-worked" data-id="${row.id}" data-shop="${row.shopId}" ${disabled}>Смена отработана · +4 200 ₽</button>`}</div>`).join('')||'<p class="hint">Закончившихся смен без подтверждения за эту неделю нет.</p>'}`:''}${renderPayrollAttendance(data,admin,disabled)}<h4>Начисления по сменам</h4>${data.rows.map(row=>`<div class="payroll-row"><b>${admin?esc(row.name)+' · ':''}${payrollShortDate(row.date)} · ${money(row.amount)}</b><span>${esc(row.start)}–${esc(row.end)} · ${point(row)}</span><small>${row.status==='worked'?'Отработана · '+money(row.rate)+' за смену':'Начисление отменено: '+esc(row.reason||'исправление')}</small>${admin&&row.status==='worked'?`<button class="ops-cancel" data-action="team-payroll-reverse" data-id="${row.id}" data-shop="${row.shopId}" ${disabled}>Отменить начисление с причиной</button>`:''}</div>`).join('')||'<p class="hint">Начислений за эту неделю пока нет.</p>'}`:'<p class="hint">Нажмите «Обновить расчёт», чтобы загрузить начисления.</p>'}
 ${review?`<section class="ops-message payroll-confirm" aria-label="Подтверждение учёта смены"><b>${review.action==='confirmWorkedShift'?'Подтвердить отработанную смену и начислить 4 200 ₽?':'Отменить начисление за смену?'}</b><p>${esc(review.row.name)} · ${payrollShortDate(review.row.date)} · ${point(review.row)}</p>${review.action==='reverseWorkedShift'?`<label class="hint">Причина отмены<input class="text-input" data-action="team-payroll-reason" maxlength="240" value="${esc(teamUI.payrollReason||'')}" ${disabled}></label>`:''}<button class="ops-submit" data-action="team-payroll-confirm" ${disabled}>${review.action==='confirmWorkedShift'?'Да, смена отработана':'Подтвердить отмену начисления'}</button><button class="ops-cancel" data-action="team-payroll-cancel" ${disabled}>Назад</button></section>`:''}${teamUI.message?`<p class="ops-message" role="status">${esc(teamUI.message)}</p>`:''}${!admin?'<button class="ops-cancel" data-action="close-op">Закрыть</button>':''}</div>`;
}
document.addEventListener('input',e=>{if(e.target.dataset.action==='team-payroll-reason')teamUI.payrollReason=e.target.value;});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el||teamUI.busy)return;
 const action=el.dataset.action;
 if(action==='team-payroll-load')loadTeamPayroll();
 else if(action==='team-payroll-prev')movePayrollWeek(-1);
 else if(action==='team-payroll-next')movePayrollWeek(1);
 else if(action==='team-payroll-worked')preparePayrollReview('confirmWorkedShift',el.dataset.id,el.dataset.shop);
 else if(action==='team-payroll-reverse')preparePayrollReview('reverseWorkedShift',el.dataset.id,el.dataset.shop);
 else if(action==='team-payroll-confirm')submitPayrollReview();
 else if(action==='team-payroll-cancel'){teamUI.payrollReview=null;render();}
});
async function loadTeamOverview(){
 if(teamUI.busy)return;teamUI.busy=true;teamUI.message='';render();
 try{const result=await teamRequest({action:'teamOverview'});if(teamIsAdmin())teamUI.overview=result;}
 catch(e){teamUI.message=e.message;}finally{teamUI.busy=false;render();}
}
function renderTeamOverview(){
 const data=teamUI.overview;
 return `<div class="ops-form"><h3>Обзор дня</h3><p class="hint">${data?esc(data.date):'Данные ещё не загружены'}</p><button class="ops-cancel" data-action="team-overview-refresh" ${teamUI.busy?'disabled':''}>Обновить показатели</button>${data?data.rows.map(x=>`<div class="schedule-row"><h3>${esc(SHOPS.find(s=>s.id===x.shopId)?.name)}</h3><div>Выручка: <b>${x.revenue===null?'Отчёт не сдан':money(x.revenue)}</b></div><div>Внесённые расходы: ${money(x.expense)}</div><div>Неоплаченных поставок: ${x.unpaidDeliveries||0}</div><div>Фотоотчётов: ${x.photoReports} · Проблем: ${x.issues}</div>${x.cashDifference!==null?`<div>Расхождение кассы: ${money(x.cashDifference)}</div>`:''}<div class="hint">${x.staff.length?x.staff.map(s=>esc(s.name)+' '+esc(s.start)+'–'+esc(s.end)).join('<br>'):'На сегодня нет утверждённых смен'}</div></div>`).join(''):''}<p class="hint">Выручка появляется после отчёта сотрудника. Расходы показаны по внесённым операциям; это не расчёт чистой прибыли.</p>${teamUI.message?`<p role="status">${esc(teamUI.message)}</p>`:''}<a class="ops-cancel" href="${OPS_SPREADSHEET_URL}" target="_blank" rel="noopener">Открыть Google Таблицу</a></div>`;
}
document.addEventListener('click',e=>{if(e.target.closest('[data-action="team-overview-refresh"]'))loadTeamOverview();});
async function teamAwardStamp(){
 if(teamUI.busy)return;
 let guestId;try{guestId=parseGuestQr(state.chargeIdValue);}catch(e){state.chargeMsg=e.message;state.chargeMsgOk=false;render();return;}
 const body=teamOperation({action:'awardStamp',guestId}),identity=teamIdentity();teamUI.busy=true;state.chargeMsg='Проверяем…';render();
 try{const result=await teamRequest(body);if(identity!==teamIdentity())return;
  for(const [key,id]of teamUI.pending)if(id===body.operationId)teamUI.pending.delete(key);
  state.chargeMsg='Штамп подтверждён. На карте '+result.guest.stamps+' из 7. Подарки доступны по QR карты.';state.chargeMsgOk=true;state.chargeIdValue='';
 }catch(e){state.chargeMsg=e.message;state.chargeMsgOk=false;}finally{teamUI.busy=false;render();}
}
function renderOperationDetails(delivery){
 return delivery?`<label class="hint">Оплата поставки<select class="ops-select" data-action="team-delivery-paid"><option value="paid" ${state.opPaymentStatus!=='unpaid'?'selected':''}>Оплачено</option><option value="unpaid" ${state.opPaymentStatus==='unpaid'?'selected':''}>Не оплачено</option></select></label>`:`<label class="hint">Категория расхода<select class="ops-select" data-action="team-expense-category">${['Продукты','Упаковка','Хозтовары','Ремонт','Прочее'].map(x=>`<option ${(state.opCategory||'Прочее')===x?'selected':''}>${x}</option>`).join('')}</select></label>`;
}
function renderTeamInstructions(){return `<div class="ops-form" id="ops-active-form"><h3>Моя смена: быстрые шаги</h3><ol><li>Выберите свою кофейню и войдите с личным паролем.</li><li>Перед работой заполните чек-лист открытия.</li><li>Поставки и расходы вносите отдельно, прикрепляйте накладную или чек.</li><li>Для подарка откройте «Подарки и бонусы», отсканируйте карту, выберите подарок и подтвердите выдачу.</li><li>В графике подавайте заявки на дни. Утверждение и окончательное подтверждение замены делает владелец.</li><li>При закрытии внесите наличные, безналичные и фактический остаток кассы, затем добавьте фотографии.</li></ol><p class="hint">Если Google не подтвердил отчёт, он остаётся в очереди на вашем устройстве. Не очищайте данные приложения; нажмите «Повторить отправку» при появлении интернета.</p><button class="ops-cancel" data-action="close-op">Закрыть</button></div>`;}
document.addEventListener('change',e=>{
 if(e.target.dataset.action==='team-delivery-paid')state.opPaymentStatus=e.target.value;
 if(e.target.dataset.action==='team-expense-category')state.opCategory=e.target.value;
});
document.addEventListener('click',e=>{
 if(!e.target.closest('[data-action="team-cleanliness-template"]'))return;
 const draft=getEditableChecklist(),items=draft.stages.day;
 for(const [id,label]of [['equipment','Чистота кофемашины'],['bar','Чистота барной стойки'],['display','Чистота и состояние витрины'],['hall','Чистота общих зон'],['toilet','Чистота туалета']]){
  const existing=items.find(x=>x.id===id);if(existing)Object.assign(existing,{label,active:true,requirePhoto:true});else items.push({id,label,active:true,requirePhoto:true});
 }
 state.adminChecklistStage='day';state.opsConfigMessage='Добавлены 5 обязательных фотографий. Нажмите «Сохранить для этой кофейни».';render();
});
async function fetchFinancialReports(type){
 const [legacy,current]=await Promise.all([fetch(DB_URL+'/'+type+'.json'),fetch(DB_URL+opsRoot()+'/'+type+'.json')]);
 if(!legacy.ok||!current.ok)throw Error('Не удалось обновить финансовые отчёты.');
 const a=await legacy.json()||{},b=await current.json()||{},merged={...a};
 for(const shop of Object.keys(b))merged[shop]={...(a[shop]||{}),...(b[shop]||{})};
 return {ok:true,json:async()=>merged};
}

// Camera-only shift opening. No file input or gallery fallback.
let shiftCamera=null;
function stopShiftCamera(){if(shiftCamera){shiftCamera.stream?.getTracks().forEach(t=>t.stop());shiftCamera.overlay?.remove();shiftCamera=null;}}
async function loadShiftOpening(){
 if(teamUI.busy)return;stopShiftCamera();const identity=teamIdentity();teamUI.busy=true;teamUI.openingRows=null;teamUI.openingIdentity=identity;teamUI.openingStatus='loading';teamUI.openingError='';teamUI.message='';render();
 try{const data=await teamRequest({action:'listShiftOpening'});if(identity===teamIdentity()){
  if(!Array.isArray(data.rows))throw Error('Сервер не вернул список смен. Повторите загрузку.');
  teamUI.openingRows=data.rows;teamUI.openingDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(data.serverAt||Date.now()));teamUI.openingStatus='ready';applyConfirmedShiftStatus(data);
 }}catch(e){if(identity===teamIdentity()){teamUI.openingError=e.message;teamUI.openingStatus='error';state.shiftStatus='error';}}finally{teamUI.busy=false;render();}
}
async function startAvailableShift(){
 if(teamUI.busy)return;
 await loadShiftOpening();if(state.opMode!=='opening'||teamUI.openingIdentity!==teamIdentity()||teamUI.openingStatus!=='ready')return;
 const available=teamUI.openingRows.filter(r=>!r.opened);
 if(available.length===1)return openShiftCamera(available[0].id);
 teamUI.message=available.length?'Выберите нужную смену ниже.':teamUI.openingRows.length?'Смена уже открыта. Повторная отметка не требуется.':'На сегодня нет вашей утверждённой смены в выбранной кофейне. Откройте «Мой график» и отправьте смену на согласование администратору.';render();
}
function renderShiftOpening(){
 const same=teamUI.openingIdentity===teamIdentity(),rows=same?teamUI.openingRows:null,status=same?teamUI.openingStatus:'idle',disabled=teamUI.busy?'disabled':'',shop=SHOPS.find(x=>x.id===teamShop());
 const context=`${esc(state.staffName)} · ${esc(shop?.name||'Выбранная кофейня')}${same&&teamUI.openingDate?' · '+payrollShortDate(teamUI.openingDate):''}`;
 const empty=Array.isArray(rows)&&rows.length===0;
 return `<div class="ops-form" id="ops-active-form"><h3>${rows?.length&&rows.every(r=>r.opened)?'Смена уже открыта':'Открыть смену'}</h3><p class="hint">${context}</p>${rows?.length&&rows.every(r=>r.opened)?'<p class="hint">Смена уже открыта. Время и фото сохранены на сервере. Повторное открытие не требуется.</p>':`<p class="hint">Сфотографируйте кассу с открытой сменой. Время фиксирует сервер при нажатии; на съёмку — 5 минут. До подтверждения сервера смена не открыта.</p><p class="hint">Опоздание: менее 5 минут — 0 ₽; с 5 минут — 200 ₽; с 15 минут — 1 000 ₽.</p>`}
 ${!rows?.length?`<button class="ops-submit" data-action="shift-opening-start" ${disabled}>${status==='loading'?'Загружаем смены…':'Открыть смену · сделать фото кассы'}</button>`:''}
 ${status==='loading'?'<p class="hint" role="status">Проверяем ваш график. Дождитесь ответа сервера.</p>':status==='error'?`<p class="ops-message bad" role="alert">Не удалось загрузить смены: ${esc(teamUI.openingError||'Повторите попытку.')} Открытие пока не подтверждено.</p>`:empty?'<p class="hint">На сегодня нет вашей утверждённой смены в этой кофейне. Выберите смену в графике и дождитесь согласования. Если смена уже согласована, проверьте выбранную точку и обновите список.</p>':!rows?'<p class="hint">Нажмите кнопку, чтобы проверить график и открыть камеру для вашей смены.</p>':''}
 ${rows?.map(r=>`<div class="payroll-row"><b>${esc(r.start)}–${esc(r.end)}</b>${r.opened?`<span>Смена открыта · ${new Date(r.opened.openedAt).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'})}</span><span>Опоздание: ${r.opened.lateMinutes} мин.</span>`:`<button class="ops-submit" data-action="shift-camera-open" data-id="${r.id}" ${disabled}>Открыть смену · сделать фото кассы</button>`}</div>`).join('')||''}
 ${empty?`<button class="ops-cancel" data-action="open-op" data-mode="schedule" ${disabled}>Мой график · выбрать смену</button>`:''}<button class="ops-cancel" data-action="shift-opening-refresh" ${disabled}>Обновить список смен</button>${teamUI.message?`<p class="ops-message" role="status">${esc(teamUI.message)}</p>`:''}<button class="ops-cancel" data-action="close-op">Закрыть</button></div>`;
}
async function openShiftCamera(id){
 if(teamUI.busy||teamIsAdmin())return;
 if(teamUI.openingIdentity!==teamIdentity()||teamUI.openingDate!==todayKey()||teamUI.openingStatus!=='ready'||!teamUI.openingRows?.some(r=>r.id===id&&!r.opened)){await loadShiftOpening();return;}
 stopShiftCamera();const identity=teamIdentity();teamUI.busy=true;teamUI.message='';render();let stream;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Камера недоступна. Откройте приложение в браузере с разрешением камеры или обратитесь к администратору.');
  // A new button attempt gets a fresh ID; retries after a lost response reuse this attempt.
  const body={action:'beginShiftOpening',shiftId:id,operationId:opsId()},session=await teamRequest(body);
  if(identity!==teamIdentity()||state.opMode!=='opening'){teamUI.busy=false;return;}
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960}},audio:false});
  if(identity!==teamIdentity()||state.opMode!=='opening'){stream.getTracks().forEach(t=>t.stop());teamUI.busy=false;return;}
  const overlay=document.createElement('section');overlay.className='shift-camera';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Фото кассы');overlay.innerHTML='<h3>Касса с открытой сменой</h3><p>Сфотографируйте экран кассы. Выбор из галереи отключён.</p><video autoplay playsinline muted></video><p role="status"></p><button class="ops-submit">Сделать фото и открыть смену</button><button class="ops-cancel">Отмена</button>';document.body.append(overlay);
  const video=overlay.querySelector('video');video.srcObject=stream;shiftCamera={overlay,stream,identity};await video.play();
  overlay.querySelector('.ops-cancel').onclick=()=>{stopShiftCamera();teamUI.busy=false;render();};
  const submit=overlay.querySelector('.ops-submit');let photo=null,request=null;
  submit.onclick=async()=>{
   if(!shiftCamera||shiftCamera.identity!==teamIdentity())return;
   if(Date.now()>session.expiresAt+60000){stopShiftCamera();teamUI.busy=false;teamUI.pending.delete(JSON.stringify([identity,body]));teamUI.message='Время съёмки истекло. Нажмите «Открыть смену» заново.';render();return;}
   submit.disabled=true;
   try{
    if(!photo){if(video.readyState<2||!video.videoWidth)throw Error('Камера ещё запускается. Повторите снимок.');const canvas=document.createElement('canvas'),scale=Math.min(1,1280/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);photo=canvas.toDataURL('image/jpeg',0.8);request={action:'finishShiftOpening',shiftId:id,sessionId:session.sessionId,operationId:opsId(),photo};stream.getTracks().forEach(t=>t.stop());}
    overlay.querySelector('[role="status"]').textContent='Сохраняем отметку и фото…';
    const result=await teamRequest(request);if(result.row?.id!==id)throw Error('Сервер не подтвердил открытие.');
    stopShiftCamera();teamUI.busy=false;teamUI.pending.delete(JSON.stringify([identity,{action:'beginShiftOpening',shiftId:id}]));await loadShiftOpening();teamUI.message='Смена открыта. Время и фото сохранены.';render();
   }catch(e){overlay.querySelector('[role="status"]').textContent=e.message+' Смена пока не подтверждена. Повторите отправку; повторного штрафа не будет.';submit.textContent=photo?'Повторить отправку':'Сделать фото';submit.disabled=false;}
  };
 }catch(e){stream?.getTracks().forEach(t=>t.stop());stopShiftCamera();teamUI.message=e.name==='NotAllowedError'?'Разрешите доступ к камере. Если съёмка недоступна, сообщите администратору.':e.message;teamUI.busy=false;render();}
}
function renderPayrollAttendance(data,admin,disabled){
 const opening=(data.openings||[]).map(x=>`<div class="payroll-row"><b>${esc(x.name)} · ${payrollShortDate(x.date)}</b><span>Открыта в ${new Date(x.openedAt).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'})} · опоздание ${x.lateMinutes} мин.</span>${admin&&/^https:\/\/drive.google.com\//.test(x.photoUrl||'')?`<a class="ops-cancel" href="${esc(x.photoUrl)}" target="_blank" rel="noopener">Фото кассы · доступ владельца</a>`:''}</div>`).join('');
 const penalties=(data.penalties||[]).map(x=>`<div class="payroll-row"><b>${esc(x.name)} · ${payrollShortDate(x.date)} · ${money(x.amount)}</b><span>${x.automatic?'Автоматически':'Администратор'} · ${esc(x.reason)}${x.reversed?' · отменён: '+esc(x.reverseReason||'исправление'):''}</span>${admin&&!x.reversed?`<button class="ops-cancel" data-action="penalty-reverse" data-id="${x.id}" ${disabled}>Отменить штраф с причиной</button>`:''}</div>`).join('');
 return `<h4>Открытия смен</h4>${opening||'<p class="hint">Отметок открытия пока нет.</p>'}<h4>Штрафы</h4>${penalties||'<p class="hint">Штрафов за неделю нет.</p>'}${admin?`<label class="hint">Смена для ручного штрафа<select class="ops-select" id="penalty-shift">${(data.penaltyShifts||[...(data.awaiting||[]),...data.rows.filter(x=>x.status==='worked')]).map(x=>`<option value="${x.shopId}:${x.id}">${esc(x.name)} · ${x.date} · точка ${x.shopId}</option>`).join('')}</select></label><label class="hint">Сумма, ₽<input class="text-input" type="number" min="1" max="100000" inputmode="numeric" id="penalty-amount"></label><label class="hint">Причина<input class="text-input" maxlength="240" id="penalty-reason"></label><button class="ops-cancel" data-action="penalty-add" ${disabled}>Добавить штраф</button>`:''}`;
}
async function submitShiftPenalty(originalId){
 if(!teamIsAdmin()||teamUI.busy)return;const data=teamUI.payrollKey===payrollKey()?teamUI.payroll:null;if(!data)return;
 const fine=originalId?(data.penalties||[]).find(x=>x.id===originalId):null;
 let body;
 if(fine){const reason=window.prompt('Причина отмены штрафа (от 3 символов)');if(reason===null)return;body={action:'reverseShiftPenalty',shiftId:fine.shiftId,shopId:fine.shopId,originalId,reason};}
 else{const value=document.getElementById('penalty-shift')?.value||'',[shopId,shiftId]=value.split(':');body={action:'addShiftPenalty',shopId:Number(shopId),shiftId,amount:Number(document.getElementById('penalty-amount')?.value),reason:document.getElementById('penalty-reason')?.value||''};}
 if(!fine){const shift=(data.penaltyShifts||[...(data.awaiting||[]),...data.rows]).find(x=>x.id===body.shiftId&&x.shopId===body.shopId);body.revision=shift?.revision||'';}
 if(body.reason.trim().length<3||(!fine&&(!Number.isSafeInteger(body.amount)||body.amount<1))){teamUI.message='Укажите смену, целую сумму и причину от 3 символов.';render();return;}
 if(!window.confirm(`${fine?'Отменить штраф':'Добавить штраф '+money(body.amount)}?\n${body.reason}`))return;
 teamUI.busy=true;teamUI.message='';render();
 try{await teamRequest(teamOperation(body));teamUI.payroll=null;teamUI.busy=false;await loadTeamPayroll();teamUI.message='Журнал штрафов обновлён.';}catch(e){teamUI.message=e.message;}finally{teamUI.busy=false;render();}
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;
 if(a==='shift-opening-start')startAvailableShift();else if(a==='shift-opening-refresh')loadShiftOpening();else if(a==='shift-camera-open')openShiftCamera(el.dataset.id);else if(a==='penalty-add')submitShiftPenalty();else if(a==='penalty-reverse')submitShiftPenalty(el.dataset.id);
 if(['close-op','staff-logout','staff-change-name'].includes(a))stopShiftCamera();
});
window.addEventListener('pagehide',stopShiftCamera);

// Refresh only an employee's visible calendar; preserve focus, selection and drafts.
let staffCalendarRefreshing=false;
if(typeof window.setInterval==='function')window.setInterval(async()=>{
 if(staffCalendarRefreshing||teamUI.busy||document.visibilityState==='hidden'||state.screen!=='staff'||state.opMode!=='schedule'||!state.staffName||!hasStaffAuth())return;
 const identity=teamIdentity();staffCalendarRefreshing=true;
 try{const data=await teamRequest({action:'listSchedule'});if(identity===teamIdentity()&&state.screen==='staff'&&state.opMode==='schedule'&&!teamUI.busy&&JSON.stringify(data)!==JSON.stringify(teamUI.schedule)){teamUI.schedule=data;teamUI.scheduleKey=identity;render();}}catch(e){}finally{staffCalendarRefreshing=false;}
},15000);


// Guest state is read from one snapshot so stamps and gifts stay in sync.
let guestLoyaltyRefresh=null,guestLoyaltyTimer=null;
async function refreshGuestLoyalty(){
 if(!LOYALTY_ID)return false;
 if(guestLoyaltyRefresh)return guestLoyaltyRefresh;
 const id=LOYALTY_ID;
 guestLoyaltyRefresh=(async()=>{
  try{
   const g=await paymentJson(DB_URL+'/guests/'+encodeURIComponent(id)+'.json',{},15000)||{};
   if(id!==LOYALTY_ID)return false;
   const snapshot=JSON.stringify([Number(g.stamps)||0,Number(g.bonusSpins)||0,g.vouchers||{},g.name||'']);
   const changed=state.loyaltySnapshot!==snapshot||!!state.loyaltySyncError;
   state.loyalty=Number(g.stamps)||0;state.wheelBonusSpins=Number(g.bonusSpins)||0;state.wheelCanSpin=state.wheelBonusSpins>0;
   state.myVouchers=Object.entries(g.vouchers||{}).filter(([,v])=>v&&typeof v==='object').map(([id,v])=>({...v,id}));
   state.loyaltySnapshot=snapshot;state.loyaltyLoaded=true;state.loyaltySyncError='';
   if(g.name&&!state.guestDisplayName){state.guestDisplayName=g.name;if(!state.guestName)state.guestName=g.name;}
   if(g.contact&&!state.receiptContact)state.receiptContact=g.contact;
   if(changed&&['card','menu','status','orders'].includes(state.screen))render();
   return true;
  }catch(e){
   if(id===LOYALTY_ID){const message='Не удалось обновить карту. Сохранён последний баланс. Попробуйте ещё раз.';const changed=state.loyaltySyncError!==message;state.loyaltySyncError=message;if(changed&&state.screen==='card')render();}
   return false;
  }finally{guestLoyaltyRefresh=null;}
 })();return guestLoyaltyRefresh;
}
function startLoyaltyUpdates(){
 if(guestLoyaltyTimer)return;
 guestLoyaltyTimer=setInterval(()=>{if(!document.hidden&&['menu','card','status','orders'].includes(state.screen))refreshGuestLoyalty();},10000);
 window.addEventListener('focus',()=>{if(['menu','card','status','orders'].includes(state.screen))refreshGuestLoyalty();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&['menu','card','status','orders'].includes(state.screen))refreshGuestLoyalty();});
}
function availableGuestGifts(){return (state.myVouchers||[]).filter(v=>!v.redeemed&&(!v.expiresAt||v.expiresAt>Date.now()));}
function loyaltyProgressNote(){
 if(!state.loyaltyLoaded)return 'Обновляем карту…';
 const count=availableGuestGifts().length;
 return (count?'Подарков к получению: '+count+'. ':'')+'До следующего подарка: '+Math.max(0,7-state.loyalty)+' штампов. 1 классический кофе = 1 штамп после онлайн-оплаты.';
}
async function selectGuestGift(id){
 if(!await refreshGuestLoyalty())return;
 if(!availableGuestGifts().some(v=>v.id===id)){showToast('Подарок уже получен или недоступен. Карта обновлена.');return;}
 state.guestGiftId=id;state.guestGiftStep='details';render();
}
function renderGuestGiftFlow(){
 if(!state.guestGiftId)return '';
 const gift=(state.myVouchers||[]).find(v=>v.id===state.guestGiftId),redeemed=gift?.redeemed,expired=gift?.expiresAt&&gift.expiresAt<=Date.now();
 const qr=state.guestGiftStep==='qr'&&!redeemed&&!expired&&gift;
 const data='solncekofe:'+LOYALTY_ID+':gift:'+state.guestGiftId;
 const src=loyaltyQrData(data);
 return `<div class="gift-flow-backdrop"><section class="gift-flow" role="dialog" aria-modal="true" aria-label="Получение подарка"><p class="eyebrow">${redeemed?'Подарок получен':qr?'Шаг 2 из 2 · Покажите бариста':'Шаг 1 из 2 · Ваш подарок'}</p><h2>${esc(gift?.label||'Подарок недоступен')}</h2>${redeemed?'<p role="status">Выдача подтверждена сотрудником. Приятного аппетита!</p>':!gift||expired?'<p>Этот подарок больше недоступен. Выберите другой в своей карте.</p>':qr?`<div class="qr-wrap"><img src="${src}" width="240" height="240" alt="QR-код выбранного подарка" data-qr-payload="${esc(data)}"></div><p class="gift-code">${esc(gift.id)}</p><p>Бариста сканирует QR, проверяет подарок и подтверждает выдачу. До подтверждения подарок остаётся на карте.</p><p class="hint" role="status">Ожидает подтверждения сотрудника</p><button class="ops-cancel" data-action="guest-refresh-loyalty">Проверить получение</button>`:'<p>Подойдите к бариста и покажите QR подарка. Сотрудник подтвердит выдачу — только тогда подарок спишется с карты.</p><button class="ops-submit" data-action="guest-show-gift-qr">Я у кассы — показать QR</button>'}<button class="ops-cancel" data-action="guest-close-gift">${redeemed?'Готово':'Вернуться к карте'}</button></section></div>`;
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;
 if(el.dataset.action==='guest-select-gift')selectGuestGift(el.dataset.id);
 else if(el.dataset.action==='guest-show-gift-qr'){if(availableGuestGifts().some(v=>v.id===state.guestGiftId)){state.guestGiftStep='qr';render();refreshGuestLoyalty();}}
 else if(el.dataset.action==='guest-close-gift'){state.guestGiftId='';state.guestGiftStep='';render();}
 else if(el.dataset.action==='guest-refresh-loyalty')refreshGuestLoyalty();
});

function loyaltyQrData(text){return window.SolnceQR?window.SolnceQR.qrDataURL(text):'';}


// Persistent sign-in and attendance are separate: login never opens a shift.
function hasStaffAuth(){return !!(state.staffSessionToken||state.reportPassword);}
async function staffSessionOperation(request){
 const token=state.staffSessionToken;
 let result;try{result=await paymentJson(PAYMENT_RELAY_URL+'/staff-operation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,request})},60000);}catch(e){if(e.status===401&&state.staffSessionToken===token){clearStaffSession();state.staffName=null;state.staffPinError=e.message;render();}throw e;}
 if(result.ok!==true)throw Error(result.error||'Нет подтверждения сохранения.');return result;
}
function applyStaffSession(session){
 Object.assign(state,{staffShop:session.shopId,staffName:session.name,staffSessionToken:session.token,staffSessionExpiresAt:session.expiresAt,reportPassword:'',staffPinValue:'',staffPinError:'',staffRestoreError:'',shiftOpenedAt:null,shiftStatus:'loading',shiftStatusDate:'',opMode:null,screen:'staff'});
}
async function loginPersistentStaff(){
 if(state.staffListLoading||state.staffRestoring)return;
 const shopId=state.staffShop,password=String(state.staffPinValue||'').trim();
 if(![1,2].includes(shopId)||!password){state.staffPinError='Выберите кофейню и введите личный пароль.';render();return;}
 const generation=state.staffSessionGeneration||0;state.staffListLoading=true;state.staffPinError='';render();
 try{
  const result=await paymentJson(PAYMENT_RELAY_URL+'/staff-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',shopId,password,telegramId:TELEGRAM_ID||undefined})},60000);
  if(generation!==(state.staffSessionGeneration||0)||state.staffShop!==shopId)return;
  if(result.ok!==true||!result.token||result.shopId!==shopId)throw Error(result.error||'Вход не подтверждён.');
  applyStaffSession(result);saveStaffSession(result);loadChecklistConfig();updateOpsPending();loadStaffOrders();loadTodayOps();await refreshStaffShiftStatus();
 }catch(e){state.staffPinError=e.message;}finally{state.staffListLoading=false;render();}
}
let staffRestorePromise=null,staffShiftRefreshPromise=null;
async function enterStaffCabinet(){
 state.screen='staff';state.staffRestoreError='';
 const saved=loadStaffSession();
 if(!saved){if(!state.staffSessionToken&&!state.reportPassword)state.staffName=null;render();if(state.staffName)refreshStaffShiftStatus();return false;}
 if(staffRestorePromise)return staffRestorePromise;
 const generation=state.staffSessionGeneration||0;state.staffRestoring=true;render();
 staffRestorePromise=(async()=>{
  try{
   const result=await paymentJson(PAYMENT_RELAY_URL+'/staff-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'restore',token:saved.token})},60000);
   if(generation!==(state.staffSessionGeneration||0))return false;
   if(result.ok!==true||result.shopId!==saved.shopId||result.name!==saved.name)throw Error(result.error||'Сохранённый вход не подтверждён.');
   applyStaffSession({...result,token:saved.token});state.staffRestoring=false;render();loadChecklistConfig();updateOpsPending();loadStaffOrders();loadTodayOps();await refreshStaffShiftStatus();return true;
  }catch(e){
   if(generation!==(state.staffSessionGeneration||0))return false;
   state.staffName=null;state.staffSessionToken='';state.shiftOpenedAt=null;
   if(e.status===401||/Вход истёк|Доступ изменился|Войдите под личным/.test(e.message)){try{localStorage.removeItem('sk_staff_session');}catch(_){}state.staffPinError=e.message;state.staffShop=saved.shopId;}
   else state.staffRestoreError=e.message;
   return false;
  }finally{if(generation===(state.staffSessionGeneration||0)){state.staffRestoring=false;render();}staffRestorePromise=null;}
 })();return staffRestorePromise;
}
function applyConfirmedShiftStatus(data){
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(data.serverAt||Date.now()));
 const rows=data.rows.filter(r=>r.name===state.staffName||!r.name),opened=rows.filter(r=>r.opened&&Number.isFinite(Number(r.opened.openedAt)));
 state.shiftOpenedAt=opened.length?Math.min(...opened.map(r=>Number(r.opened.openedAt))):null;
 state.shiftStatus=opened.length?'opened':rows.length?'available':'none';state.shiftStatusDate=date;
}
async function refreshStaffShiftStatus(){
 if(state.screen!=='staff'||!state.staffName||!hasStaffAuth()||teamUI.busy)return;
 if(staffShiftRefreshPromise)return staffShiftRefreshPromise;
 const identity=teamIdentity();state.shiftStatus='loading';render();
 staffShiftRefreshPromise=(async()=>{
  try{const data=await teamRequest({action:'listShiftOpening'});if(identity!==teamIdentity())return;
   if(!Array.isArray(data.rows))throw Error('Нет подтверждения графика.');applyConfirmedShiftStatus(data);
   teamUI.openingRows=data.rows;teamUI.openingIdentity=identity;teamUI.openingDate=state.shiftStatusDate;teamUI.openingStatus='ready';teamUI.openingError='';
  }catch(e){if(identity===teamIdentity()){state.shiftStatus='error';teamUI.openingStatus='error';teamUI.openingError=e.message;}}
  finally{staffShiftRefreshPromise=null;if(identity===teamIdentity())render();}
 })();return staffShiftRefreshPromise;
}
function staffShiftLabel(){
 const current=state.shiftStatusDate===todayKey();
 if(state.shiftStatus==='loading')return 'Проверяем смену…';
 if(state.shiftStatus==='error')return 'Статус смены не обновлён';
 if(current&&state.shiftOpenedAt)return 'Смена открыта · '+new Date(state.shiftOpenedAt).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
 if(current&&state.shiftStatus==='none')return 'На сегодня смена не назначена';
 return 'Смена ещё не открыта';
}
function renderStaffShiftAction(){
 if(state.opMode==='opening')return '';
 if(state.shiftStatus==='loading')return '<button class="ops-cancel" disabled>Проверяем смену…</button>';
 if(state.shiftStatusDate===todayKey()&&state.shiftOpenedAt)return '<button class="ops-cancel" data-action="open-op" data-mode="opening">✓ Смена открыта · посмотреть</button>';
 if(state.shiftStatus==='error')return '<button class="ops-cancel" data-action="staff-shift-retry">Обновить статус смены</button>';
 if(state.shiftStatusDate===todayKey()&&state.shiftStatus==='none')return '<button class="ops-cancel" data-action="open-op" data-mode="schedule">Посмотреть мой график</button>';
 return '<button class="ops-submit" data-action="open-op" data-mode="opening">📷 Открыть смену</button>';
}
document.addEventListener('click',e=>{
 const a=e.target.closest('[data-action]')?.dataset.action;
 if(a==='staff-session-retry')enterStaffCabinet();
 else if(a==='staff-session-reset'){clearStaffSession();state.staffRestoreError='';state.staffRestoring=false;state.staffName=null;state.staffPinValue='';render();}
 else if(a==='staff-shift-retry')refreshStaffShiftStatus();
});
window.addEventListener('focus',()=>{if(state.screen==='staff'&&state.staffName)refreshStaffShiftStatus();});
function startStaffSessionUpdates(){setInterval(()=>{if(state.screen==='staff'&&state.staffName&&!document.hidden&&state.shiftStatusDate!==todayKey())refreshStaffShiftStatus();},60000);}
