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
function parseGuestQr(raw){
 let text=String(raw||'').trim();
 if(/^solncekofe:/i.test(text))text=text.slice(11);
 if(!/^[A-Z0-9_-]{4,32}$/i.test(text))throw Error('Это не QR-код карты Солнцекофе.');
 return text.toUpperCase();
}
function teamScan(){
 const tg=window.Telegram?.WebApp;
 if(typeof tg?.showScanQrPopup!=='function'){teamUI.message='Откройте мини-приложение в Telegram для сканирования или введите ID вручную.';render();return;}
 try{tg.showScanQrPopup({text:'Карта гостя: просмотр подарков и бонусов'},text=>{
  try{teamUI.guestId=parseGuestQr(text);teamUI.guest=null;teamUI.selected='';teamLookup();}catch(e){teamUI.message=e.message;render();}
  tg.closeScanQrPopup();return true;
 });}catch(e){teamUI.message='Не удалось открыть камеру. Введите ID вручную.';render();}
}
async function teamLookup(){
 if(teamUI.busy)return;
 let guestId;try{guestId=parseGuestQr(teamUI.guestId);}catch(e){teamUI.message=e.message;render();return;}
 teamUI.guestId=guestId;teamUI.busy=true;teamUI.message='';teamUI.guest=null;teamUI.selected='';
 const identity=teamIdentity();render();
 try{const result=await teamRequest({action:'loyaltyLookup',guestId});if(identity!==teamIdentity()||guestId!==teamUI.guestId)return;teamUI.guest=result.guest;teamUI.lookupKey=identity+':'+guestId;}
 catch(e){teamUI.message=e.message;}finally{teamUI.busy=false;render();}
}
async function teamMutate(action,extra={}){
 if(teamUI.busy)return;
 if(!teamUI.guest||teamUI.lookupKey!==teamIdentity()+':'+teamUI.guestId){teamUI.message='Сначала обновите карту гостя.';render();return;}
 const body=teamOperation({action,guestId:teamUI.guestId,...extra}),identity=teamIdentity(),guestId=teamUI.guestId;
 teamUI.busy=true;teamUI.message='';render();
 try{const result=await teamRequest(body);if(identity!==teamIdentity()||guestId!==teamUI.guestId)return;
  teamUI.guest=result.guest;teamUI.selected='';teamUI.amount='';teamUI.reason='';teamUI.message='Операция подтверждена сервером. История обновлена.';
  for(const [key,id]of teamUI.pending)if(id===body.operationId)teamUI.pending.delete(key);
  // Another intentional operation needs a fresh lookup.
  teamUI.lookupKey='';
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
 try{const data=await teamRequest({action:'listSchedule'});if(key===teamIdentity()){if(teamUI.scheduleKey!==key)teamUI.shiftSelection=[];teamUI.schedule=data;teamUI.scheduleKey=key;}}
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
 <div class="schedule-month"><button class="ops-cancel" data-action="team-calendar-prev" aria-label="Предыдущий месяц">‹</button><b>${first.toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).replace(' г.','')}</b><button class="ops-cancel" data-action="team-calendar-next" aria-label="Следующий месяц">›</button></div><div class="schedule-legend"><span class="work">Работа</span><span class="pending">Заявка</span><span>Нет смены</span></div><div class="schedule-calendar">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<span class="weekday">${x}</span>`).join('')}${'<span aria-hidden="true"></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),kind=scheduleDayState(rows,date),label=kind==='work'?'Работа':kind==='pending'?'Заявка':'Нет смены';return `<button class="calendar-day ${kind} ${date===selected?'selected':''} ${date===today?'today':''}" data-action="team-calendar-day" data-date="${date}" aria-pressed="${date===selected}" aria-label="${esc(scheduleDateLabel(date))}: ${label}"><b>${i+1}</b><span>${kind==='work'?'Смена':kind==='pending'?'Заявка':'—'}</span></button>`;}).join('')}</div>
 <div class="schedule-day-detail" aria-live="polite"><h4>${esc(scheduleDateLabel(selected))}</h4>${dayRows.length?dayRows.map(row=>`<div class="my-shift-detail"><b>${row.status==='approved'?'На работу':'Заявка — ещё не утверждена'}</b><span>${esc(row.start)}–${esc(row.end)} · ${shop(row)}</span>${row.swap&&['requested','accepted'].includes(row.swap.status)?'<small>Замена ещё не утверждена. Действует исходная смена.</small>':''}</div>`).join(''):'<b>Выходить по графику не требуется: смена не назначена.</b>'}${status==='pending'?'<p class="hint">Дождитесь утверждения владельца. Заявка ещё не является рабочей сменой.</p>':''}</div>${renderDayTeam(data,selected)}<p class="hint">Показаны назначенные смены. Владелец может дополнить график — обновляйте его перед выходом.</p></section>`;
}
function moveScheduleMonth(delta){
 const [year,month]=(teamUI.calendarMonth||todayKey().slice(0,7)).split('-').map(Number),next=new Date(Date.UTC(year,month-1+delta,1));
 teamUI.calendarMonth=next.toISOString().slice(0,7);teamUI.calendarDate=teamUI.calendarMonth+'-01';render();
}
function shiftSelection(){return teamUI.shiftSelection||(teamUI.shiftSelection=[]);}
function toggleShiftSelection(row){
 const items=shiftSelection(),at=items.findIndex(x=>x.shiftId===row.id);
 if(at>=0)items.splice(at,1);else if(items.length<31)items.push({shiftId:row.id,revision:row.revision||'',date:row.date,start:row.start,end:row.end,label:row.name?'Замена: '+row.name:'Свободная смена'});
 else teamUI.message='Можно выбрать до 31 смены.';render();
}
function addShiftSelection(){
 const date=teamUI.date||teamUI.calendarDate||todayKey(),start=teamUI.start,end=teamUI.end;
 if(date<todayKey()||start>=end){teamUI.message='Выберите предстоящую дату и корректное время.';render();return;}
 const existing=teamUI.schedule.rows.find(x=>x.date===date&&start<x.end&&x.start<end&&['open','approved'].includes(x.status));
 if(existing){teamUI.message='На это время уже есть смена. Выберите её в расписании ниже.';render();return;}
 if(shiftSelection().some(x=>x.date===date&&start<x.end&&x.start<end)){teamUI.message='Это время уже выбрано.';render();return;}
 toggleShiftSelection({id:opsId(),date,start,end,name:''});
}
async function teamSubmitSelection(){
 if(teamUI.busy||!shiftSelection().length)return;
 const identity=teamIdentity(),items=shiftSelection().map(({label,...x})=>x),body=teamOperation({action:'requestShifts',items});
 teamUI.busy=true;teamUI.message='';render();
 try{
  await teamRequest(body);if(identity!==teamIdentity())return;
  teamUI.shiftSelection=[];for(const [key,id]of teamUI.pending)if(id===body.operationId)teamUI.pending.delete(key);
  teamUI.message='Заявки отправлены: '+items.length+'. До согласования действуют прежние назначения.';
  try{const data=await teamRequest({action:'listSchedule'});if(identity===teamIdentity()){teamUI.schedule=data;teamUI.scheduleKey=identity;}}catch(e){teamUI.message+=' Обновите график для проверки статуса.';}
 }catch(e){teamUI.message=e.message+' Выбор сохранён. Обновите график перед повтором.';}
 finally{teamUI.busy=false;render();}
}
function renderTeamSchedule(){
 const admin=teamIsAdmin(),data=teamUI.scheduleKey===teamIdentity()?teamUI.schedule:null,disabled=teamUI.busy?'disabled':'',labels={open:'Свободна',pending:'Ждёт администратора',approved:'Утверждена'},selection=shiftSelection();
 return `<div class="ops-form" id="ops-active-form"><h3>График команды</h3><p class="hint">На смене — один сотрудник. ${admin?'Назначайте смены и согласовывайте заявки.':'Выберите несколько смен. Свободные согласует администратор; замену — назначенный сотрудник или администратор.'}</p>${admin?`<label class="hint">Кофейня<select class="ops-select" data-action="team-shop" ${disabled}>${SHOPS.map(x=>`<option value="${x.id}" ${teamShop()===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`:''}<button class="ops-cancel" data-action="team-schedule-refresh" ${disabled}>${teamUI.busy?'Загружаем…':'Обновить график'}</button>
 ${data?`${!admin?renderPersonalSchedule(data):''}<h3>${admin?'Назначить смену':'Выбрать смены'}</h3><label class="hint">Дата<input class="text-input" type="date" data-action="team-date" value="${esc(teamUI.date||teamUI.calendarDate||todayKey())}" ${disabled}></label><div class="ops-row"><label class="hint">Начало<input class="text-input" type="time" data-action="team-start" value="${teamUI.start}" ${disabled}></label><label class="hint">Конец<input class="text-input" type="time" data-action="team-end" value="${teamUI.end}" ${disabled}></label></div>${admin?`<label class="hint">Сотрудник<select class="ops-select" data-action="team-name" ${disabled}><option value="">Открытая смена</option>${data.staff.map(x=>`<option ${teamUI.name===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label><button class="ops-submit" data-action="team-schedule-save" ${disabled}>${teamUI.editing?'Сохранить изменения':'Добавить смену'}</button>`:`<button class="ops-cancel" data-action="team-selection-add" ${disabled}>Добавить дату в выбор</button><section class="shift-selection" aria-label="Выбранные смены"><h4>Выбрано смен: ${selection.length}</h4>${selection.map(x=>`<div><span>${esc(x.date)} · ${esc(x.start)}–${esc(x.end)}<small>${esc(x.label)}</small></span><button class="ops-cancel" aria-label="Убрать смену ${esc(x.date)} ${esc(x.start)}" data-action="team-selection-remove" data-id="${x.shiftId}" ${disabled}>×</button></div>`).join('')||'<p class="hint">Добавьте даты или отметьте смены в расписании ниже.</p>'}<button class="ops-submit" data-action="team-selection-submit" ${disabled||!selection.length?'disabled':''}>Отправить на согласование (${selection.length})</button></section>`}${teamUI.editing?'<button class="ops-cancel" data-action="team-edit-cancel">Отменить редактирование</button>':''}${!admin?`<label class="hint">Кому предложить свою смену<select class="ops-select" data-action="team-swap-name"><option value="">Выберите сотрудника</option>${data.staff.filter(x=>x!==state.staffName).map(x=>`<option ${teamUI.swapName===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`:''}<h3 style="margin-top:20px">Расписание</h3>${data.rows.filter(x=>x.date>=todayKey()).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)).map(row=>{
 const active=['requested','accepted'].includes(row.swap?.status),canConfirm=active&&(row.swap.direction==='incoming'?row.swap.from:row.swap.to)===state.staffName,chosen=selection.some(x=>x.shiftId===row.id);
 return `<div class="schedule-row ${chosen?'chosen':''}"><b>${esc(row.date)} · ${esc(row.start)}–${esc(row.end)}</b><span>${esc(row.name||'Свободная смена')}</span><span class="status-badge">${labels[row.status]||esc(row.status)}</span>${row.swap?`<span class="hint">Замена: ${esc(row.swap.from)} → ${esc(row.swap.to)} · ${esc(({requested:'на согласовании',accepted:'на согласовании',approved:'согласована',rejected:'отклонена / отменена'})[row.swap.status]||'')}</span>`:''}<div class="schedule-actions">${!admin&&row.name===state.staffName&&row.status==='approved'&&!active?`<button class="ops-cancel" data-action="team-shift-swap" data-id="${row.id}" ${disabled}>Предложить замену</button>`:''}${!admin&&canConfirm?`<button class="ops-submit" data-action="team-shift-accept-swap" data-id="${row.id}" ${disabled}>Согласовать замену</button>`:''}${admin&&active?`<button class="ops-submit" data-action="team-shift-approve-swap" data-id="${row.id}" ${disabled}>Согласовать замену</button>`:''}${active&&(admin||[row.swap.from,row.swap.to].includes(state.staffName))?`<button class="ops-cancel" data-action="team-shift-reject-swap" data-id="${row.id}" ${disabled}>Отклонить / отменить заявку</button>`:''}${admin?`<button class="ops-cancel" data-action="team-shift-edit" data-id="${row.id}" ${disabled}>Изменить</button>${row.status==='pending'?`<button class="ops-submit" data-action="team-shift-approve" data-id="${row.id}" ${disabled}>Утвердить</button>`:''}`:!active&&(row.status==='open'||row.status==='approved'&&row.name!==state.staffName)?`<button class="ops-cancel" data-action="team-shift-select" data-id="${row.id}" aria-pressed="${chosen}" ${disabled}>${chosen?'Убрать из выбора':row.status==='open'?'Выбрать смену':'Хочу взять эту смену'}</button>`:''}${admin||(row.name===state.staffName&&row.status==='pending')?`<button class="ops-cancel" data-action="team-shift-cancel" data-id="${row.id}" ${disabled}>Отменить смену</button>`:''}</div></div>`;}).join('')||'<p class="hint">Предстоящих смен пока нет.</p>'}`:'<p class="hint">Нажмите «Обновить график». Нужен личный пароль сотрудника.</p>'}${teamUI.message?`<p class="ops-message" role="status">${esc(teamUI.message)}</p>`:''}${!admin?'<button class="ops-cancel" data-action="close-op">Закрыть</button>':''}</div>`;
}
document.addEventListener('input',e=>{
 const fields={'team-guest-id':'guestId','team-amount':'amount','team-reason':'reason','team-date':'date','team-start':'start','team-end':'end','team-name':'name'},a=e.target.dataset.action;
 if(fields[a]){teamUI[fields[a]]=e.target.value;if(a==='team-guest-id'){teamUI.guest=null;teamUI.lookupKey='';teamUI.selected='';}}
});
document.addEventListener('change',e=>{
 const a=e.target.dataset.action;
 if(a==='team-name')teamUI.name=e.target.value;
 if(a==='team-swap-name')teamUI.swapName=e.target.value;
 if(a==='team-shop'){state.teamShop=Number(e.target.value);teamUI.editing=null;teamUI.name='';teamLoadSchedule();}
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
 else if(a==='team-calendar-prev')moveScheduleMonth(-1);
 else if(a==='team-calendar-next')moveScheduleMonth(1);
 else if(a==='team-calendar-day'){teamUI.calendarDate=el.dataset.date;teamUI.date=el.dataset.date;render();}
 else if(a==='team-selection-add')addShiftSelection();
 else if(a==='team-selection-submit')teamSubmitSelection();
 else if(a==='team-selection-remove'){teamUI.shiftSelection=shiftSelection().filter(x=>x.shiftId!==el.dataset.id);render();}
 else if(a==='team-schedule-refresh')teamLoadSchedule();
 else if(a==='team-schedule-save')teamSaveSchedule(teamIsAdmin()?'saveShift':'requestShift');
 else if(a==='team-edit-cancel'){teamUI.editing=null;teamUI.name='';render();}
 else if(a.startsWith('team-shift-')){
  const row=teamUI.schedule?.rows.find(x=>x.id===el.dataset.id);if(!row)return;
  if(a==='team-shift-select')toggleShiftSelection(row);
  else if(a==='team-shift-edit'){Object.assign(teamUI,{editing:row,date:row.date,start:row.start,end:row.end,name:row.name});render();}
  else teamSaveSchedule({'team-shift-swap':'requestSwap','team-shift-accept-swap':'acceptSwap','team-shift-approve-swap':'approveSwap','team-shift-reject-swap':'rejectSwap','team-shift-claim':'requestShift','team-shift-approve':'approveShift','team-shift-cancel':'cancelShift'}[a],row);
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
