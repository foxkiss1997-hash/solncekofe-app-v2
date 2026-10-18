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
 const operationId=teamId_(request.operationId),snapshot=teamSnapshot_(path),g=snapshot.value;
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
function handleSchedule_(request,root,props){
 const actor=teamActor_(request,props),shopId=request.shopId;
 if(![1,2].includes(shopId))throw Error('Выберите кофейню.');
 if(request.action==='listSchedule'){
  const rows=dbRead_(root+'/schedule/'+shopId)||{};
  const staff=dbRead_('/staff/'+shopId)||{};
  return {rows:Object.entries(rows).map(([id,row])=>({id,...row})).filter(x=>x.status!=='cancelled').sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)),staff:Object.values(staff).filter(x=>x.active!==false).map(x=>String(x.name))};
 }
 const id=teamId_(request.shiftId),operationId=teamId_(request.operationId),path=root+'/schedule/'+shopId+'/'+id,snap=teamSnapshot_(path),old=snap.value;
 if(old?.lastOperationId===operationId){if(old.updatedBy!==actor.name)throw Error('ID операции уже использован.');return {row:{id,...old}};}
 if((old?.revision||'')!==(request.revision||''))throw Error('Смена уже изменена. Обновите график.');
 let next;
 if(request.action==='requestSwap'){
  if(actor.admin||!old||old.status!=='approved'||old.name!==actor.name)throw Error('Можно предложить замену только своей утверждённой смены.');
  const target=String(request.targetName||'').trim(),staff=dbRead_('/staff/'+shopId)||{};
  if(target===actor.name||!Object.values(staff).some(x=>x.active!==false&&x.name===target))throw Error('Выберите другого сотрудника этой кофейни.');
  next={...old,swap:{from:actor.name,to:target,status:'requested'}};
 }else if(request.action==='acceptSwap'){
  if(actor.admin||!old||old.swap?.status!=='requested'||old.swap.to!==actor.name)throw Error('Это предложение адресовано другому сотруднику.');
  next={...old,swap:{...old.swap,status:'accepted'}};
 }else if(request.action==='approveSwap'){
  if(!actor.admin||!old||old.swap?.status!=='accepted')throw Error('Сначала второй сотрудник должен принять замену.');
  next={...old,name:old.swap.to,swap:{...old.swap,status:'approved'}};
 }else if(request.action==='saveShift'){
  if(!actor.admin)throw Error('Редактирование доступно владельцу.');
  const date=teamDate_(request.date),start=teamTime_(request.start),end=teamTime_(request.end),name=String(request.name||'').trim();
  if(start>=end)throw Error('Окончание должно быть позже начала.');
  const staff=dbRead_('/staff/'+shopId)||{};
  if(name&&!Object.values(staff).some(x=>x.active!==false&&x.name===name))throw Error('Сотрудник не найден в этой кофейне.');
  next={date,start,end,name,status:name?'approved':'open'};
 }else if(request.action==='requestShift'){
  if(actor.admin)throw Error('Используйте редактирование владельца.');
  if(old){if(old.status!=='open')throw Error('Смена уже занята.');next={...old,name:actor.name,status:'pending'};}
  else{const date=teamDate_(request.date),start=teamTime_(request.start),end=teamTime_(request.end);if(start>=end)throw Error('Проверьте время.');next={date,start,end,name:actor.name,status:'pending'};}
 }else if(request.action==='approveShift'){
  if(!actor.admin||!old||old.status!=='pending')throw Error('Нет заявки для утверждения.');next={...old,status:'approved'};
 }else if(request.action==='cancelShift'){
  if(!old||(!actor.admin&&(old.name!==actor.name||old.status!=='pending')))throw Error('Отменить эту смену может только владелец.');next={...old,status:'cancelled'};
 }else throw Error('Неизвестное действие графика.');
 if(next.status==='approved'){
  // Script lock in the dispatcher serializes approvals across both coffee shops.
  for(const shop of [1,2])for(const [otherId,x]of Object.entries(dbRead_(root+'/schedule/'+shop)||{})){
   if(shop===shopId&&otherId===id)continue;
   if(x.status==='approved'&&x.name===next.name&&x.date===next.date&&next.start<x.end&&x.start<next.end)throw Error('У сотрудника уже есть смена в это время.');
  }
 }
 next={...next,revision:operationId,lastOperationId:operationId,updatedBy:actor.name,updatedAt:Date.now(),history:{...(old?.history||{}),[operationId]:{action:request.action,actor:actor.name,at:Date.now(),previous:old?{date:old.date,start:old.start,end:old.end,name:old.name,status:old.status}:null}}};
 teamComparePut_(path,next,snap.etag);return {row:{id,...next}};
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
