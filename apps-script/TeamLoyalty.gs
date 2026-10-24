/* Additional server handlers. Deploy together with Operations.gs. */
function teamAdmin_(request,props){
 const password=props.getProperty('ADMIN_PASSWORD');
 if(!password||request.auth?.admin!==true||request.auth.password!==password)throw Error('Нет доступа администратора.');
}
function teamActor_(request,props){
 if(request.auth?.admin===true){teamAdmin_(request,props);return {admin:true,name:'Владелец'};}
 const r={shopId:request.shopId,submittedBy:request.submittedBy};
 if(![1,2].includes(r.shopId)||typeof r.submittedBy!=='string')throw Error('Выберите сотрудника и кофейню.');
 authorizeStaff_(r,request.auth);return {admin:false,name:r.submittedBy,shopId:r.shopId};
}
function teamId_(id){if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('Некорректный ID операции.');return id;}
function loyaltyId_(id){if(!/^[A-Z0-9_-]{4,32}$/.test(id||''))throw Error('Некорректный ID гостя.');return id;}
function teamSnapshot_(path){
 const r=UrlFetchApp.fetch(OPS_DATABASE+path+'.json',{method:'get',headers:{'X-Firebase-ETag':'true'},muteHttpExceptions:true});
 if(r.getResponseCode()!==200)throw Error('Не удалось прочитать данные.');
 const headers=r.getAllHeaders(),etag=headers.ETag||headers.Etag||headers.etag;
 if(!etag)throw Error('База не подтвердила версию данных.');
 return {value:JSON.parse(r.getContentText()),etag};
}
function teamComparePut_(path,value,etag){
 const r=UrlFetchApp.fetch(OPS_DATABASE+path+'.json',{method:'put',headers:{'if-match':etag},contentType:'application/json',payload:JSON.stringify(value),muteHttpExceptions:true});
 if(r.getResponseCode()===412)throw Error('Данные уже изменились. Обновите экран и проверьте результат перед повтором.');
 if(r.getResponseCode()<200||r.getResponseCode()>=300)throw Error('Нет подтверждения сохранения. Обновите экран перед повтором.');
}
function loyaltyPublic_(g){
 return {name:String(g.name||'Гость'),stamps:Number(g.stamps)||0,bonusBalance:Number.isSafeInteger(g.bonusBalance)&&g.bonusBalance>=0?g.bonusBalance:0,
 vouchers:Object.entries(g.vouchers||{}).filter(([,v])=>v&&!v.redeemed).map(([id,v])=>({id,label:String(v.label||'Подарок'),type:String(v.type||''),value:v.value})),
 history:Object.entries(g.loyaltyHistory||{}).map(([id,x])=>({id,...x})).sort((a,b)=>b.at-a.at).slice(0,30)};
}
function handleLoyalty_(request,props,root){
 const actor=teamActor_(request,props),guestId=loyaltyId_(request.guestId),path=(root==='/ops_v3_test'?root:'')+'/guests/'+guestId;
 if(request.action==='loyaltyLookup'){
  const g=dbRead_(path);if(!g)throw Error('Карта не найдена.');return {guest:loyaltyPublic_(g)};
 }
 const operationId=teamId_(request.operationId),snapshot=teamSnapshot_(path),g=snapshot.value||(request.action==='awardStamp'?{stamps:0,bonusSpins:0,bonusBalance:0,vouchers:{},createdAt:Date.now()}:null);
 if(!g)throw Error('Карта не найдена.');
 if(g.loyaltyHistory?.[operationId]){
  const old=g.loyaltyHistory[operationId];
  if(old.actor!==actor.name||old.shopId!==(actor.shopId||null)||old.action!==request.action)throw Error('ID операции уже использован.');
  return {guest:loyaltyPublic_(g),operationId,replayed:true};
 }
 const now=Date.now();g.loyaltyHistory=g.loyaltyHistory||{};
 const record={action:request.action,actor:actor.name,shopId:actor.shopId||null,at:now};
 if(request.action==='awardStamp'){
  const before=Number(g.stamps)||0;if(!Number.isSafeInteger(before)||before<0||before>7)throw Error('Проверьте штампы карты.');
  const rewarded=before+1>=7;g.stamps=(before+1)%7;g.lastStampAt=now;g.reminded=false;g.justRewarded=rewarded;
  if(rewarded){g.vouchers=g.vouchers||{};const id='F'+operationId.toUpperCase();g.vouchers[id]={label:'Бесплатный классический кофе (M)',type:'free_item',value:'Классический кофе (M)',wonAt:now,redeemed:false};g.bonusSpins=(Number(g.bonusSpins)||0)+1;record.voucherId=id;}
  record.stampsAfter=g.stamps;record.rewarded=rewarded;
 }else if(request.action==='redeemGift'){
  if(!/^[A-Z0-9_-]{2,40}$/.test(request.voucherId||''))throw Error('Некорректный код подарка.');
  const v=g.vouchers?.[request.voucherId];
  if(!v)throw Error('Подарок не найден.');if(v.redeemed)throw Error('Подарок уже погашен.');
  if(v.expiresAt&&v.expiresAt<now)throw Error('Срок подарка истёк.');
  Object.assign(v,{redeemed:true,redeemedAt:now,redeemedBy:actor.name,redeemedShopId:actor.shopId||null,redemptionId:operationId});
  Object.assign(record,{voucherId:request.voucherId,label:String(v.label||'Подарок')});
 }else if(request.action==='spendBonus'||request.action==='creditBonus'){
  if(request.action==='creditBonus'&&!actor.admin)throw Error('Начисление доступно владельцу.');
  const amount=request.amount,balance=g.bonusBalance===undefined?0:g.bonusBalance;
  if(!Number.isSafeInteger(balance)||balance<0)throw Error('Проверьте баланс карты.');
  if(!Number.isSafeInteger(amount)||amount<=0||amount>100000)throw Error('Введите целое число бонусов от 1 до 100000.');
  if(request.action==='spendBonus'&&amount>balance)throw Error('Недостаточно бонусов.');
  const reason=String(request.reason||'').trim();if(!reason||reason.length>240)throw Error('Укажите основание операции.');
  g.bonusBalance=balance+(request.action==='spendBonus'?-amount:amount);
  if(!Number.isSafeInteger(g.bonusBalance))throw Error('Превышен допустимый баланс.');
  Object.assign(record,{amount,reason,balanceAfter:g.bonusBalance});
 }else if(request.action==='reverseLoyalty'){
  if(!actor.admin)throw Error('Отмена доступна владельцу.');
  const original=g.loyaltyHistory[teamId_(request.originalId)],reason=String(request.reason||'').trim();
  if(!reason||reason.length>240)throw Error('Укажите причину отмены.');
  if(!original||original.reversedBy||!['redeemGift','spendBonus','creditBonus'].includes(original.action))throw Error('Операция не найдена или уже отменена.');
  if(original.action==='redeemGift'){
   const v=g.vouchers?.[original.voucherId];if(!v||v.redemptionId!==request.originalId||!v.redeemed)throw Error('Подарок уже изменён.');
   Object.assign(v,{redeemed:false,redeemedAt:null,redeemedBy:null,redeemedShopId:null,redemptionId:null});
  }else{
   const balance=g.bonusBalance;if(!Number.isSafeInteger(balance)||balance<0)throw Error('Проверьте баланс карты.');
   g.bonusBalance=balance+(original.action==='spendBonus'?original.amount:-original.amount);
   if(g.bonusBalance<0||!Number.isSafeInteger(g.bonusBalance))throw Error('Начисленные бонусы уже потрачены.');
  }
  original.reversedBy=operationId;Object.assign(record,{originalId:request.originalId,reason});
 }else throw Error('Неизвестная операция лояльности.');
 g.loyaltyHistory[operationId]=record;
 // One conditional write commits balance, voucher and history together. A competing request fails.
 teamComparePut_(path,g,snapshot.etag);return {guest:loyaltyPublic_(g),operationId};
}
function teamDate_(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Некорректная дата.');return date;
}
function teamTime_(value){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value||''))throw Error('Некорректное время.');return value;}
// Weekly shift earnings: confirmed camera opening accrues salary automatically.
const TEAM_SHIFT_RATE_=4200;
function teamPayrollWeek_(date){
 const anchor=teamDate_(date),d=new Date(anchor+'T12:00:00Z'),offset=(d.getUTCDay()+6)%7;
 d.setUTCDate(d.getUTCDate()-offset);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);
 const end=d.toISOString().slice(0,10);return {start,end,payDate:end};
}
function teamShiftEnded_(row){
 const end=new Date(row.date+'T'+row.end+':00+03:00').getTime();return Number.isFinite(end)&&end<=Date.now();
}
function teamPayrollStore_(props,root,create){
 if(!['/ops_v3','/ops_v3_test'].includes(root))throw Error('Некорректный раздел начислений.');
 const property=root==='/ops_v3'?'PAYROLL_SPREADSHEET_ID':'PAYROLL_TEST_SPREADSHEET_ID';let id=props.getProperty(property);
 if(root==='/ops_v3_test'&&id&&id===props.getProperty('PAYROLL_SPREADSHEET_ID'))throw Error('Для теста нужна отдельная зарплатная таблица.');
 if(!id&&!create)return {sheet:null,current:{},operations:{}};
 if(!id){const book=SpreadsheetApp.create(root==='/ops_v3'?'Солнцекофе — зарплата (закрыто)':'Солнцекофе — ТЕСТ зарплаты');id=book.getId();PropertiesService.getScriptProperties().setProperty(property,id);}
 if(DriveApp.getFileById(id).getSharingAccess()!==DriveApp.Access.PRIVATE)throw Error('Зарплатная таблица должна быть закрыта от публичного доступа.');
 const book=SpreadsheetApp.openById(id);let sheet=book.getSheetByName('Начисления');
 if(!sheet&&create){sheet=book.insertSheet('Начисления');sheet.appendRow(['ID операции','Точка','ID смены','Дата смены','Сотрудник','Начало','Конец','Действие','Ставка, ₽','Изменение, ₽','Подтвердил','Время','Данные']);sheet.setFrozenRows(1);}
 if(sheet&&sheet.getRange(1,13).getValue()!=='Данные')throw Error('Проверьте заголовки закрытой зарплатной таблицы.');
 const current={},operations={};if(sheet&&sheet.getLastRow()>1)for(const row of sheet.getRange(2,13,sheet.getLastRow()-1,1).getValues()){
  const event=JSON.parse(row[0]);if(event?.kind==='payment'){if(!event.operationId||!event.detail||!Number.isSafeInteger(event.detail.amount)||event.detail.amount<=0)throw Error('Повреждён журнал выплат.');operations[event.operationId]=event;continue;}
  if(event?.kind==='attendance'){if(!event.operationId||!event.detail||!Number.isSafeInteger(event.delta))throw Error('Повреждён журнал прихода.');operations[event.operationId]=event;continue;}
  if(!event||!event.operationId||!event.key||!event.attendance)throw Error('Повреждена история начислений. Проверьте закрытую таблицу.');
  if(!['worked','reversed'].includes(event.attendance.status)||!Number.isSafeInteger(event.attendance.amount)||event.attendance.amount<=0||!Number.isSafeInteger(event.attendance.rate)||event.attendance.rate<=0)throw Error('Повреждена сумма начисления. Проверьте закрытую таблицу.');
  operations[event.operationId]=event;current[event.key]=event;
 }
 return {sheet,current,operations,spreadsheetId:id};
}
function teamPayrollAppend_(store,event){
 const a=event.attendance||event.detail;store.sheet.appendRow([event.operationId,event.shopId,event.shiftId,a.date,a.name,a.start,a.end,event.action,a.rate||a.accrualRate||0,event.delta??(event.action==='confirmWorkedShift'?a.amount:-a.amount),event.actor,new Date(event.at).toISOString(),JSON.stringify(event)].map(x=>typeof x==='number'?x:sheetText_(x)));SpreadsheetApp.flush();
}
function teamPayrollUnlocked_(store,shopId,id){
 if(Object.values(store.operations).some(x=>x.kind==='attendance'&&x.action==='finishShiftOpening'&&x.key===shopId+':'+id))throw Error('Смена уже открыта. Изменение графика заблокировано.');
 if(store.current[shopId+':'+id]?.attendance.status==='worked')throw Error('По смене уже начислена зарплата. Сначала администратор должен отменить начисление с причиной.');
}
function teamPayrollAction_(request,root,props,actor){
 if(!actor.admin)throw Error('Подтверждать отработанные смены может только администратор.');
 const id=teamId_(request.shiftId),operationId=teamId_(request.operationId),shopId=request.shopId,reason=String(request.reason||'').trim(),fingerprint=JSON.stringify([request.action,shopId,id,reason]);
 let store=teamPayrollStore_(props,root,false);const prior=store.operations[operationId];
 if(prior){if(prior.actor!==actor.name||prior.fingerprint!==fingerprint)throw Error('ID операции уже использован.');return {row:{id,shopId},replayed:true};}
 const old=dbRead_(root+'/schedule/'+shopId+'/'+id),previous=teamPayrollAccruals_(store)[shopId+':'+id]?.attendance;
 if(!old||old.status!=='approved'||!old.name)throw Error('Нужна утверждённая назначенная смена.');
 if((old.revision||'')!==(request.revision||''))throw Error('Смена уже изменена. Обновите расчёт.');
 let attendance;
 if(request.action==='confirmWorkedShift'){
  if(!teamShiftEnded_(old))throw Error('Смена ещё не закончилась. Начисление доступно после её окончания.');
  if(previous?.status==='worked')throw Error('Эта смена уже учтена в зарплате.');
  if(['requested','accepted'].includes(old.swap?.status))throw Error('Сначала согласуйте или отклоните замену.');
  attendance={status:'worked',name:old.name,date:old.date,start:old.start,end:old.end,rate:TEAM_SHIFT_RATE_,amount:TEAM_SHIFT_RATE_,confirmedAt:Date.now(),confirmedBy:actor.name};
 }else{
  if(previous?.status!=='worked')throw Error('Нет начисления для отмены.');
  if(reason.length<3||reason.length>240)throw Error('Укажите причину отмены от 3 до 240 символов.');
  attendance={...previous,status:'reversed',reason,reversedAt:Date.now(),reversedBy:actor.name};
 }
 if(!store.sheet)store=teamPayrollStore_(props,root,true);
 teamPayrollAppend_(store,{operationId,key:shopId+':'+id,shopId,shiftId:id,action:request.action,actor:actor.name,at:Date.now(),fingerprint,attendance,revision:old.revision||''});return {row:{id,shopId}};
}
function teamPayroll_(request,root,props,actor,skipReport){
 const week=teamPayrollWeek_(request.date||Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd')),rows=[],awaiting=[],store=teamPayrollStore_(props,root,false),schedules={1:dbRead_(root+'/schedule/1')||{},2:dbRead_(root+'/schedule/2')||{}};
 const current=teamPayrollAccruals_(store);
 for(const event of Object.values(current)){
  const work=event.attendance;if(work.date<week.start||work.date>week.end||(!actor.admin&&work.name!==actor.name))continue;
  rows.push({id:event.shiftId,shopId:event.shopId,name:work.name,date:work.date,start:work.start,end:work.end,status:work.status,rate:work.rate,amount:work.status==='worked'?work.amount:0,originalAmount:work.amount,confirmedAt:work.confirmedAt,automatic:!!work.automatic,...(work.status==='reversed'?{reason:work.reason||''}:{}),...(actor.admin?{revision:schedules[event.shopId]?.[event.shiftId]?.revision||event.revision}:{})});
 }
 if(actor.admin)for(const shopId of [1,2])for(const [id,row]of Object.entries(schedules[shopId]))if(row.status==='approved'&&row.name&&row.date>=week.start&&row.date<=week.end&&teamShiftEnded_(row)&&!current[shopId+':'+id])awaiting.push({id,shopId,date:row.date,start:row.start,end:row.end,name:row.name,revision:row.revision||'',replacementPending:['requested','accepted'].includes(row.swap?.status)});
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.shopId-b.shopId);awaiting.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
 const attendance=teamAttendanceSummary_(store,actor,week),penaltyTotal=attendance.penalties.reduce((n,x)=>n+x.amount,0);
 const payments=teamPayrollPayments_(store,actor,week),totals=teamPayrollTotals_(rows,attendance.penalties,payments),paid=payments.reduce((n,p)=>n+p.amount,0),amount=rows.reduce((n,x)=>n+x.amount,0)-penaltyTotal;
 const penaltyShifts=actor.admin?[1,2].flatMap(shopId=>Object.entries(schedules[shopId]).filter(([,r])=>r.status==='approved'&&r.name&&r.date>=week.start&&r.date<=week.end).map(([id,r])=>({id,shopId,name:r.name,date:r.date,start:r.start,end:r.end,revision:r.revision||''}))):undefined;
 return {payrollVersion:2,...attendance,...(actor.admin?{penaltyShifts}:{}),gross:rows.reduce((n,x)=>n+x.amount,0),penaltyTotal,week,rate:TEAM_SHIFT_RATE_,count:rows.filter(x=>x.status==='worked').length,amount,paid,due:totals.reduce((n,t)=>n+t.due,0),credit:totals.reduce((n,t)=>n+t.credit,0),payments,balances:teamPayrollBalances_(store,actor),rows,...(actor.admin?{awaiting,totals,payrollReportUrl:store.spreadsheetId?'https://docs.google.com/spreadsheets/d/'+store.spreadsheetId+'/edit':null,...(!skipReport?teamPayrollSyncSafe_(store,props,root):{})}:{})};
}
function teamBusinessHours_(shopId,date){
 if(![1,2].includes(shopId))throw Error('Выберите кофейню.');
 const weekend=[0,6].includes(new Date(teamDate_(date)+'T12:00:00Z').getUTCDay());
 return shopId===2?(weekend?{start:'10:00',end:'22:00'}:{start:'08:00',end:'21:00'}):(weekend?{start:'09:00',end:'21:00'}:{start:'08:00',end:'20:00'});
}
function teamAssignShifts_(request,root,props,actor){
 if(!actor.admin)throw Error('Назначать график может только администратор.');
 const shopId=request.shopId,name=String(request.name||'').trim(),operationId=teamId_(request.operationId),items=request.items;
 if(!name||!Array.isArray(items)||!items.length||items.length>31)throw Error('Выберите сотрудника и от 1 до 31 дня.');
 const snap=teamSnapshot_(root+'/schedule'),all=snap.value||{},fingerprint=JSON.stringify(['assignShifts',shopId,name,items]),seen={},dates=new Set(),rows=[];let replay=0;
 for(const item of items){const id=teamId_(item.shiftId);if(seen[id])throw Error('Смена выбрана дважды.');seen[id]=true;
  const event=all[shopId]?.[id]?.history?.[operationId];if(event){if(event.actor!==actor.name||event.batch!==fingerprint)throw Error('ID операции уже использован.');replay++;}}
 if(replay){if(replay!==items.length)throw Error('Неполная история назначения. Обновите график.');return {rows:items.map(x=>({id:x.shiftId,...all[shopId][x.shiftId]})),replayed:true};}
 const payroll=teamPayrollStore_(props,root,false),today=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd');
 for(const item of items){
  const id=item.shiftId,date=teamDate_(item.date),old=all[shopId]?.[id];if(date<today)throw Error('Нельзя назначить прошедший день.');if(dates.has(date))throw Error('Одна дата выбрана дважды.');dates.add(date);
  teamPayrollUnlocked_(payroll,shopId,id);
  if(old&&old.status!=='cancelled'&&(old.date!==date||old.name&&old.name!==name))throw Error('День '+date+' уже занят другим сотрудником. Измените назначение отдельно.');
  if(old&&['requested','accepted'].includes(old.swap?.status))throw Error('Сначала обработайте замену на '+date+'.');
  const hours=teamBusinessHours_(shopId,date);
  for(const [otherId,x]of Object.entries(all[shopId]||{}))if(otherId!==id&&x.date===date&&['open','pending','approved'].includes(x.status)&&hours.start<x.end&&x.start<hours.end)throw Error('На '+date+' уже есть смена или заявка. Обновите график.');
  const next=teamScheduleChange_({action:'saveShift',operationId,revision:item.revision||'',date,...hours,name},actor,old,props,shopId,all,id,fingerprint);
  (all[shopId]||(all[shopId]={}))[id]=next;rows.push({id,...next});
 }
 teamComparePut_(root+'/schedule',all,snap.etag);return {rows};
}
function handleSchedule_(request,root,props){
 const actor=teamActor_(request,props),shopId=request.shopId;
 if(![1,2].includes(shopId))throw Error('Выберите кофейню.');
 if(['listShiftOpening','beginShiftOpening','finishShiftOpening','addShiftPenalty','reverseShiftPenalty'].includes(request.action))return teamAttendanceAction_(request,root,props,actor);
 if(request.action==='assignShifts')return teamAssignShifts_(request,root,props,actor);
 if(request.action==='recordPayrollPayment')return teamRecordPayrollPayment_(request,root,props,actor);
 if(request.action==='listPayroll')return teamPayroll_(request,root,props,actor);
 if(['confirmWorkedShift','reverseWorkedShift'].includes(request.action))return teamPayrollAction_(request,root,props,actor);
 if(request.action==='listSchedule'){
  const rows=dbRead_(root+'/schedule/'+shopId)||{};
  const staff=dbRead_('/staff/'+shopId)||{};
  const myRows=[],teamRows=[];
  for(const point of [1,2])for(const [id,row]of Object.entries(dbRead_(root+'/schedule/'+point)||{})){
   const publicRow={id,shopId:point,date:row.date,start:row.start,end:row.end,name:row.name,status:row.status};
   if(row.status==='approved'&&row.name)teamRows.push(publicRow);
   if(row.name===actor.name&&['approved','pending'].includes(row.status))myRows.push({...publicRow,...(row.swap?{swap:row.swap}:{})});
   else if(row.status==='approved'&&row.swap?.direction==='incoming'&&row.swap.to===actor.name&&['requested','accepted'].includes(row.swap.status))myRows.push({...publicRow,name:actor.name,status:'pending',requestType:'transfer',swap:row.swap});
  }
  return {rows:Object.entries(rows).map(([id,row])=>{const {attendance,attendanceHistory,...visible}=row;return {id,...(actor.admin?row:visible)};}).filter(x=>x.status!=='cancelled').sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)),staff:Object.values(staff).filter(x=>x.active!==false).map(x=>String(x.name)),...(actor.admin?{teamRows}:{myRows,teamRows})};
 }
 if(['approveShifts','rejectShifts'].includes(request.action)){
  if(!actor.admin)throw Error('Подтверждение графика доступно только администратору.');
  const operationId=teamId_(request.operationId),items=request.items;
  if(!Array.isArray(items)||!items.length||items.length>31)throw Error('Выберите от 1 до 31 смены.');
  const payroll=teamPayrollStore_(props,root,false);
  const snap=teamSnapshot_(root+'/schedule'),all=snap.value||{},seen={},fingerprint=JSON.stringify([request.action,items]),rows=[];
  let replay=0;
  for(const item of items){const id=teamId_(item.shiftId);teamPayrollUnlocked_(payroll,shopId,id);if(seen[id])throw Error('Смена выбрана дважды.');seen[id]=true;const event=all[shopId]?.[id]?.history?.[operationId];if(event){if(event.actor!==actor.name||event.batch!==fingerprint)throw Error('ID операции уже использован.');replay++;}}
  if(replay){if(replay!==items.length)throw Error('Неполная история подтверждения. Обновите график.');return {rows:items.map(x=>({id:x.shiftId,...all[shopId][x.shiftId]})),replayed:true};}
  for(const item of items){
   const id=item.shiftId,old=all[shopId]?.[id];
   if(!old||!(old.status==='pending'||old.status==='approved'&&['requested','accepted'].includes(old.swap?.status)))throw Error('Заявка уже обработана. Обновите график.');
   const approve=request.action==='approveShifts';
   if(approve&&old.date<Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd'))throw Error('Нельзя подтвердить прошедшую смену.');
   const action=old.status==='pending'?(approve?'approveShift':'rejectShift'):(approve?'approveSwap':'rejectSwap');
   const next=teamScheduleChange_({...item,action,operationId},actor,old,props,shopId,all,id,fingerprint);
   (all[shopId]||(all[shopId]={}))[id]=next;rows.push({id,...next});
  }
  // A conflict in any selected shift rejects the whole review, preserving every original assignment.
  teamComparePut_(root+'/schedule',all,snap.etag);return {rows};
 }
 if(request.action==='requestShifts'){
  if(actor.admin)throw Error('Используйте редактирование администратора.');
  const operationId=teamId_(request.operationId),items=request.items;
  if(!Array.isArray(items)||!items.length||items.length>31)throw Error('Выберите от 1 до 31 смены.');
  const payroll=teamPayrollStore_(props,root,false);
  const snap=teamSnapshot_(root+'/schedule'),all=snap.value||{},seen={},fingerprint=JSON.stringify(items),rows=[];
  let replay=0;
  for(const item of items){
   const id=teamId_(item.shiftId);teamPayrollUnlocked_(payroll,shopId,id);if(seen[id])throw Error('Смена выбрана дважды.');seen[id]=true;
   const old=all[shopId]?.[id],event=old?.history?.[operationId];
   if(event){if(event.actor!==actor.name||event.batch!==fingerprint)throw Error('ID операции уже использован.');replay++;}
  }
  if(replay){if(replay!==items.length)throw Error('Неполная история заявки. Обновите график.');return {rows:items.map(x=>({id:x.shiftId,...all[shopId][x.shiftId]})),replayed:true};}
  for(const item of items){
   const id=item.shiftId,old=all[shopId]?.[id];
   const next=teamScheduleChange_({...item,action:'requestShift',operationId},actor,old,props,shopId,all,id,fingerprint);
   (all[shopId]||(all[shopId]={}))[id]=next;rows.push({id,...next});
  }
  // Validate every item before the single compare-and-set: a stale item cannot leave a half-submitted selection.
  teamComparePut_(root+'/schedule',all,snap.etag);return {rows};
 }
 const id=teamId_(request.shiftId),operationId=teamId_(request.operationId),path=root+'/schedule/'+shopId+'/'+id,snap=teamSnapshot_(path),old=snap.value;
 teamPayrollUnlocked_(teamPayrollStore_(props,root,false),shopId,id);
 if(old?.lastOperationId===operationId){if(old.updatedBy!==actor.name)throw Error('ID операции уже использован.');return {row:{id,...old}};}
 const all={1:dbRead_(root+'/schedule/1')||{},2:dbRead_(root+'/schedule/2')||{}};
 const next=teamScheduleChange_(request,actor,old,props,shopId,all,id,'');
 teamComparePut_(path,next,snap.etag);return {row:{id,...next}};
}
function teamScheduleChange_(request,actor,old,props,shopId,all,id,batch){
 const operationId=teamId_(request.operationId);
 if((old?.revision||'')!==(request.revision||''))throw Error('Смена уже изменена. Обновите график.');
 let next;
 if(request.action==='requestSwap'){
  if(actor.admin||!old||old.status!=='approved'||old.name!==actor.name)throw Error('Можно предложить замену только своей утверждённой смены.');
  const target=String(request.targetName||'').trim(),staff=dbRead_('/staff/'+shopId)||{};
  if(target===actor.name||!Object.values(staff).some(x=>x.active!==false&&x.name===target))throw Error('Выберите другого сотрудника этой кофейни.');
  if(['requested','accepted'].includes(old.swap?.status))throw Error('По этой смене уже есть заявка на замену.');
  next={...old,swap:{from:actor.name,to:target,direction:'outgoing',status:'requested'}};
 }else if(request.action==='acceptSwap'||request.action==='approveSwap'){
  if(!old||!['requested','accepted'].includes(old.swap?.status)||old.name!==old.swap.from)throw Error('Нет действующей заявки на замену.');
  const approver=old.swap.direction==='incoming'?old.swap.from:old.swap.to;
  if(request.action==='approveSwap'?!actor.admin:(actor.admin||actor.name!==approver))throw Error('Подтвердить может второй участник или администратор.');
  next={...old,name:old.swap.to,swap:{...old.swap,status:'approved',approvedBy:actor.name}};
 }else if(request.action==='rejectSwap'){
  if(!old||!['requested','accepted'].includes(old.swap?.status)||(!actor.admin&&![old.swap.from,old.swap.to].includes(actor.name)))throw Error('Нет доступной заявки на замену.');
  next={...old,swap:{...old.swap,status:'rejected'}};
 }else if(request.action==='saveShift'){
  if(!actor.admin)throw Error('Редактирование доступно владельцу.');
  const date=teamDate_(request.date),start=teamTime_(request.start),end=teamTime_(request.end),name=String(request.name||'').trim();
  if(start>=end)throw Error('Окончание должно быть позже начала.');
  const staff=dbRead_('/staff/'+shopId)||{};
  if(name&&!Object.values(staff).some(x=>x.active!==false&&x.name===name))throw Error('Сотрудник не найден в этой кофейне.');
  next={date,start,end,name,status:name?'approved':'open'};
 }else if(request.action==='requestShift'){
  if(actor.admin)throw Error('Используйте редактирование владельца.');
  const day=old?.date||request.date;if(day<Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd'))throw Error('Нельзя подать заявку на прошедшую смену.');
  if(old){
   if(old.status==='approved'&&old.name!==actor.name){
    if(['requested','accepted'].includes(old.swap?.status))throw Error('По этой смене уже есть заявка на замену.');
    next={...old,swap:{from:old.name,to:actor.name,direction:'incoming',status:'requested'}};
   }else if(old.status==='open')next={...old,name:actor.name,status:'pending',requestedFromOpen:true};
   else throw Error('Смена уже занята или заявка уже отправлена.');
  }
  else{const date=teamDate_(request.date),start=teamTime_(request.start),end=teamTime_(request.end);if(start>=end)throw Error('Проверьте время.');for(const x of Object.values(all[shopId]||{}))if((['approved','open'].includes(x.status)||x.status==='pending'&&x.name===actor.name)&&x.date===date&&start<x.end&&x.start<end)throw Error('На это время уже есть смена. Выберите её в расписании.');next={date,start,end,name:actor.name,status:'pending'};}
 }else if(request.action==='editShiftRequest'){
  if(actor.admin||!old||old.name!==actor.name||old.status!=='pending'||old.requestedFromOpen)throw Error('Можно изменить только свою неутверждённую заявку на новый день. Готовую смену нужно отменить и выбрать заново.');
  const date=teamDate_(request.date),start=teamTime_(request.start),end=teamTime_(request.end);
  if(date<Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd')||start>=end)throw Error('Выберите предстоящую дату и корректное время.');
  for(const [otherId,x]of Object.entries(all[shopId]||{}))if(otherId!==id&&(['approved','open'].includes(x.status)||x.status==='pending'&&x.name===actor.name)&&x.date===date&&start<x.end&&x.start<end)throw Error('На это время уже есть смена. Выберите другое время.');
  next={...old,date,start,end,status:'pending'};
 }else if(request.action==='approveShift'){
  if(!actor.admin||!old||old.status!=='pending')throw Error('Нет заявки для утверждения.');next={...old,status:'approved'};
 }else if(request.action==='rejectShift'){
  if(!actor.admin||!old||old.status!=='pending')throw Error('Нет заявки для отклонения.');
  next=old.requestedFromOpen?{...old,name:'',status:'open',requestedFromOpen:false}:{...old,status:'cancelled'};
 }else if(request.action==='cancelShift'){
  if(!old||(!actor.admin&&(old.name!==actor.name||old.status!=='pending')))throw Error('Отменить эту смену может только владелец.');next=old.requestedFromOpen&&!actor.admin?{...old,name:'',status:'open',requestedFromOpen:false}:{...old,status:'cancelled'};
 }else throw Error('Неизвестное действие графика.');

 if(next.status==='approved'&&!Object.values(dbRead_('/staff/'+shopId)||{}).some(x=>x.active!==false&&x.name===next.name))throw Error('Назначаемый сотрудник больше не активен в этой кофейне.');
 if(next.status==='approved')for(const shop of [1,2])for(const [otherId,x]of Object.entries(all[shop]||{})){
  if(shop===shopId&&otherId===id)continue;
  if(x.status!=='approved'||x.date!==next.date||next.start>=x.end||x.start>=next.end)continue;
  if(shop===shopId)throw Error('В это время на точке уже назначен сотрудник. На смене работает один человек.');
  if(x.name===next.name)throw Error('У сотрудника уже есть смена в это время.');
 }
 return {...next,...(['requestShift','requestSwap'].includes(request.action)?{requestBatchId:operationId}:{}),revision:operationId,lastOperationId:operationId,updatedBy:actor.name,updatedAt:Date.now(),history:{...(old?.history||{}),[operationId]:{action:request.action,actor:actor.name,at:Date.now(),...(batch?{batch}:{}),previous:old?{date:old.date,start:old.start,end:old.end,name:old.name,status:old.status}:null}}};
}

function handleTeamRequest_(request,root,props){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{return /^(loyaltyLookup|awardStamp|redeemGift|spendBonus|creditBonus|reverseLoyalty)$/.test(request.action)?handleLoyalty_(request,props,root):handleSchedule_(request,root,props);}finally{lock.releaseLock();}
}
function teamOverview_(request,root,props){
 teamAdmin_(request,props);
 const date=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd'),rows=[];
 for(const shopId of [1,2]){
  const revenue=dbRead_(root+'/revenue_reports/'+shopId+'/'+date)||(root==='/ops_v3'?dbRead_('/revenue_reports/'+shopId+'/'+date):null),expenses=Object.values(dbRead_(root+'/expense_reports/'+shopId)||{}).filter(x=>x.date===date&&x.status!=='cancelled'),photos=Object.values(dbRead_(root+'/checklist_reports/'+shopId+'/'+date)||{}),operations=Object.values(dbRead_(root+'/operations/'+shopId+'/'+date)||{}),schedule=Object.values(dbRead_(root+'/schedule/'+shopId)||{}).filter(x=>x.date===date&&x.status==='approved');
  rows.push({shopId,revenue:revenue?Number(revenue.cash||0)+Number(revenue.cashless||0):null,expense:expenses.reduce((n,x)=>n+Number(x.amount||0),0),photoReports:photos.length,unpaidDeliveries:operations.filter(x=>x.type==='delivery'&&x.paymentStatus==='unpaid').length,issues:operations.filter(x=>x.type==='issue'&&x.status!=='resolved').length,staff:schedule.map(x=>({name:x.name,start:x.start,end:x.end})),cashDifference:revenue&&Number.isFinite(revenue.actualCash)?revenue.actualCash-Number(revenue.cash||0):null});
 }
 return {date,rows};
}

// Private, append-only attendance and penalty journal; never written to public Firebase.
function teamLatePenalty_(milliseconds){return milliseconds>=15*60000?1000:milliseconds>=5*60000?200:0;}
function teamAttendanceEvents_(store){return Object.values(store.operations).filter(x=>x.kind==='attendance');}
function teamAttendanceSummary_(store,actor,week){
 const all=teamAttendanceEvents_(store),visible=all.filter(x=>(actor.admin||x.detail.name===actor.name)&&x.detail.date>=week.start&&x.detail.date<=week.end),reversed=new Set(all.filter(x=>x.action==='reverseShiftPenalty').map(x=>x.originalId));
 const penalties=visible.filter(x=>['finishShiftOpening','addShiftPenalty'].includes(x.action)&&x.delta<0).map(x=>({id:x.operationId,shiftId:x.shiftId,shopId:x.shopId,...x.detail,amount:reversed.has(x.operationId)?0:-x.delta,originalAmount:-x.delta,reversed:reversed.has(x.operationId),reverseReason:all.find(e=>e.action==='reverseShiftPenalty'&&e.originalId===x.operationId)?.detail.reason||'',automatic:x.action==='finishShiftOpening'}));
 const openings=visible.filter(x=>x.action==='finishShiftOpening').map(x=>({id:x.shiftId,shopId:x.shopId,...x.detail}));
 return {penalties,openings};
}
function teamAttendancePhoto_(request,props,root){
 const data=request.photo;if(typeof data!=='string'||data.length>2400000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('Сделайте фото кассы камерой приложения.');
 const bytes=Utilities.base64Decode(data.split(',')[1]);if(bytes.length<1024||bytes[0]!==-1||bytes[1]!==-40)throw Error('Не удалось прочитать снимок кассы.');
 const folderId=props.getProperty('PHOTO_FOLDER_ID');if(!folderId)throw Error('Папка фотографий не настроена.');
 if(root==='/ops_v3_test'&&folderId===props.getProperty('PRODUCTION_PHOTO_FOLDER_ID'))throw Error('Для теста нужна отдельная папка фото.');
 const folder=DriveApp.getFolderById(folderId);if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)throw Error('Папка фото должна быть закрыта.');
 const name='opening_'+request.operationId+'.jpg',files=folder.getFilesByName(name),file=files.hasNext()?files.next():folder.createFile(Utilities.newBlob(bytes,'image/jpeg',name));
 return file.getUrl();
}
function teamAttendanceAction_(request,root,props,actor){
 let store=teamPayrollStore_(props,root,false);const all=teamAttendanceEvents_(store),shopId=request.shopId;
 if(request.action==='listShiftOpening'){
  const date=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd'),rows=Object.entries(dbRead_(root+'/schedule/'+shopId)||{}).filter(([,x])=>x.date===date&&x.status==='approved'&&(actor.admin||x.name===actor.name)).map(([id,x])=>({id,date:x.date,start:x.start,end:x.end,name:x.name,opened:all.find(e=>e.key===shopId+':'+id&&e.action==='finishShiftOpening')?.detail||null}));
  return {rows,serverAt:Date.now()};
 }
 const id=teamId_(request.shiftId),operationId=teamId_(request.operationId),key=shopId+':'+id,reason=String(request.reason||'').trim(),fingerprint=JSON.stringify([request.action,shopId,id,request.sessionId||'',request.originalId||'',request.amount??null,reason]);
 const prior=store.operations[operationId];if(prior){if(prior.actor!==actor.name||prior.fingerprint!==fingerprint)throw Error('ID операции уже использован.');return {row:{id,shopId},sessionId:prior.operationId,openedAt:prior.detail.openedAt,expiresAt:prior.detail.expiresAt,replayed:true,...(request.action!=='beginShiftOpening'?teamPayrollSyncSafe_(store,props,root):{})};}
 const row=dbRead_(root+'/schedule/'+shopId+'/'+id);if(request.action!=='reverseShiftPenalty'&&(!row||row.status!=='approved'||!row.name))throw Error('Нужна утверждённая смена.');
 const detail=row?{name:row.name,date:row.date,start:row.start,end:row.end}:{},now=Date.now();let delta=0,originalId='';
 if(['beginShiftOpening','finishShiftOpening'].includes(request.action)){
  if(actor.admin||actor.name!==row.name)throw Error('Открыть смену может назначенный сотрудник.');
  if(row.date!==Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd')||teamShiftEnded_(row))throw Error('Можно открыть только сегодняшнюю незавершённую смену.');
  if(['requested','accepted'].includes(row.swap?.status))throw Error('Сначала согласуйте замену.');
  if(all.some(x=>x.key===key&&x.action==='finishShiftOpening'))throw Error('Смена уже открыта. Обновите экран.');
  const start=new Date(row.date+'T'+row.start+':00+03:00').getTime();if(now<start-30*60000)throw Error('Открытие доступно за 30 минут до начала смены.');
  if(request.action==='beginShiftOpening'){
   const pending=all.filter(x=>x.key===key&&x.action==='beginShiftOpening'&&x.detail.expiresAt>now).pop();
   if(pending)return {row:{id,shopId},sessionId:pending.operationId,openedAt:pending.detail.openedAt,expiresAt:pending.detail.expiresAt};
   Object.assign(detail,{openedAt:now,expiresAt:now+5*60000});
  }else{
   const session=store.operations[teamId_(request.sessionId)];if(!session||session.action!=='beginShiftOpening'||session.key!==key||session.actor!==actor.name||session.detail.expiresAt<now)throw Error('Время съёмки истекло. Откройте смену заново.');
   if(session.detail.start!==row.start||session.detail.end!==row.end||session.detail.date!==row.date||session.detail.name!==row.name)throw Error('График изменился. Откройте смену заново.');
   const lateMs=Math.max(0,session.detail.openedAt-start);Object.assign(detail,{accrualRate:TEAM_SHIFT_RATE_,accrualAmount:TEAM_SHIFT_RATE_,openedAt:session.detail.openedAt,lateMinutes:Math.floor(lateMs/60000),reason:'Опоздание: '+Math.floor(lateMs/60000)+' мин.',photoUrl:teamAttendancePhoto_(request,props,root)});delta=-teamLatePenalty_(lateMs);
  }
 }else{
  if(!actor.admin)throw Error('Штрафы изменяет только администратор.');
  if(reason.length<3||reason.length>240)throw Error('Укажите причину от 3 до 240 символов.');detail.reason=reason;
  if(request.action==='addShiftPenalty'){
   if((row.revision||'')!==(request.revision||''))throw Error('График изменился. Обновите расчёт перед штрафом.');
   if(!Number.isSafeInteger(request.amount)||request.amount<1||request.amount>100000)throw Error('Введите штраф от 1 до 100000 ₽ целым числом.');delta=-request.amount;
  }else{
   originalId=teamId_(request.originalId);const original=store.operations[originalId];
   if(!original||original.kind!=='attendance'||original.key!==key||!['finishShiftOpening','addShiftPenalty'].includes(original.action)||original.delta>=0)throw Error('Штраф не найден.');
   if(all.some(x=>x.action==='reverseShiftPenalty'&&x.originalId===originalId))throw Error('Штраф уже отменён.');Object.assign(detail,{name:original.detail.name,date:original.detail.date,start:original.detail.start,end:original.detail.end,reason});delta=-original.delta;
  }
 }
 if(!store.sheet)store=teamPayrollStore_(props,root,true);
 const event={kind:'attendance',operationId,key,shopId,shiftId:id,action:request.action,actor:actor.name,at:now,fingerprint,detail,delta,originalId};teamPayrollAppend_(store,event);store.operations[operationId]=event;
 return {row:{id,shopId},sessionId:operationId,openedAt:detail.openedAt,expiresAt:detail.expiresAt,...(request.action!=='beginShiftOpening'?teamPayrollSyncSafe_(store,props,root):{})};
}
