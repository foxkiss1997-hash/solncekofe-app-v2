// Salary comes from the durable, camera-confirmed opening event. Manual corrections win.
function teamPayrollAccruals_(store){
 const current={...store.current};
 for(const event of teamAttendanceEvents_(store)){
  if(event.action!=='finishShiftOpening'||current[event.key])continue;
  const d=event.detail,rate=d.accrualRate||TEAM_SHIFT_RATE_;
  current[event.key]={...event,kind:undefined,attendance:{name:d.name,date:d.date,start:d.start,end:d.end,status:'worked',rate,amount:d.accrualAmount||rate,confirmedAt:event.at,confirmedBy:event.actor,automatic:true}};
 }
 return current;
}
function teamPayrollPayments_(store,actor,week){
 return Object.values(store.operations).filter(e=>e.kind==='payment'&&(actor.admin||e.detail.name===actor.name)&&(!week||(e.detail.weekStart===week.start&&e.detail.weekEnd===week.end))).map(e=>({id:e.operationId,...e.detail,at:e.at,actor:e.actor})).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
}
function teamPayrollTotals_(rows,penalties,payments){
 const totals={},person=name=>totals[name]||(totals[name]={name,count:0,gross:0,penalties:0,paid:0});
 for(const row of rows)if(row.status==='worked'){const t=person(row.name);t.count++;t.gross+=row.amount;}
 for(const p of penalties)if(!p.reversed)person(p.name).penalties+=p.amount;
 for(const p of payments)person(p.name).paid+=p.amount;
 return Object.values(totals).map(t=>({...t,amount:t.gross-t.penalties,balance:t.gross-t.penalties-t.paid,due:Math.max(0,t.gross-t.penalties-t.paid),credit:Math.max(0,t.paid-t.gross+t.penalties),status:t.paid>0?(t.paid>=t.gross-t.penalties?'paid':'partial'):'unpaid'})).sort((a,b)=>a.name.localeCompare(b.name));
}
function teamPayrollBalances_(store,actor){
 const rows=Object.values(teamPayrollAccruals_(store)).map(e=>e.attendance),attendance=teamAttendanceSummary_(store,actor,{start:'0000-01-01',end:'9999-12-31'});
 return teamPayrollTotals_(rows.filter(x=>actor.admin||x.name===actor.name),attendance.penalties,teamPayrollPayments_(store,actor));
}
function teamRecordPayrollPayment_(request,root,props,actor){
 if(!actor.admin)throw Error('Отмечать выплаты может только администратор.');
 const operationId=teamId_(request.operationId),name=String(request.name||'').trim(),week=teamPayrollWeek_(request.date),note=String(request.note||'').trim(),mode=request.paymentMode;
 if(!name||name.length>120||note.length>240||!['full','partial'].includes(mode))throw Error('Проверьте сотрудника и вид выплаты.');
 if(!Number.isSafeInteger(request.expectedDue)||request.expectedDue<=0)throw Error('Нет положительного остатка к выплате. Обновите расчёт.');
 const fingerprint=JSON.stringify([name,week.start,mode,request.amount??null,request.expectedDue,note]);
 let store=teamPayrollStore_(props,root,false);const prior=store.operations[operationId];
 if(prior){if(prior.kind!=='payment'||prior.actor!==actor.name||prior.fingerprint!==fingerprint)throw Error('ID операции уже использован.');return {payment:{id:operationId,...prior.detail},replayed:true,...teamPayrollSyncSafe_(store,props,root)};}
 const payroll=teamPayroll_(request,root,props,actor,true),total=payroll.totals.find(x=>x.name===name);
 if(!total||total.due!==request.expectedDue)throw Error('Остаток изменился. Обновите расчёт перед выплатой.');
 const amount=mode==='full'?total.due:request.amount;
 if(!Number.isSafeInteger(amount)||amount<=0||amount>total.due)throw Error('Введите сумму от 1 ₽ до остатка к выплате, целым числом.');
 const now=Date.now(),detail={name,date:Utilities.formatDate(new Date(now),'Europe/Moscow','yyyy-MM-dd'),weekStart:week.start,weekEnd:week.end,amount,paidBefore:total.paid,dueBefore:total.due,dueAfter:total.due-amount,gross:total.gross,penalties:total.penalties,status:amount===total.due?'paid':'partial',note};
 if(!store.sheet)store=teamPayrollStore_(props,root,true);
 const event={kind:'payment',operationId,key:'payment:'+operationId,shopId:0,shiftId:'',action:'recordPayrollPayment',actor:actor.name,at:now,fingerprint,detail,delta:-amount};
 teamPayrollAppend_(store,event);store.operations[operationId]=event;
 return {payment:{id:operationId,...detail},...teamPayrollSyncSafe_(store,props,root)};
}
function teamPayrollSyncSafe_(store,props,root){
 try{return {reportSynced:teamPayrollReport_(store,props,root)};}catch(e){return {reportSynced:false,reportError:'Выплата сохранена в журнале. Обновите расчёт, чтобы повторить обновление отчёта.'};}
}
function teamPayrollReport_(store,props,root){
 const id=props.getProperty(root==='/ops_v3'?'PAYROLL_SPREADSHEET_ID':'PAYROLL_TEST_SPREADSHEET_ID');if(!id||!store.sheet)return false;
 if(DriveApp.getFileById(id).getSharingAccess()!==DriveApp.Access.PRIVATE)throw Error('Зарплатный отчёт должен быть закрыт.');
 const book=SpreadsheetApp.openById(id),actor={admin:true},current=teamPayrollAccruals_(store),payments=teamPayrollPayments_(store,actor),attendance=teamAttendanceSummary_(store,actor,{start:'0000-01-01',end:'9999-12-31'});
 const put=(name,headers,rows)=>{let sheet=book.getSheetByName(name);if(!sheet){sheet=book.insertSheet(name);sheet.appendRow(headers);sheet.setFrozenRows(1);}else if(sheet.getRange(1,1).getValue()!==headers[0])throw Error('Проверьте структуру листа '+name);
  const values=[headers,...rows].map(row=>row.map(x=>typeof x==='number'?x:sheetText_(x)));
  sheet.getRange(1,1,values.length,headers.length).setValues(values);
  if(sheet.getLastRow()>values.length)sheet.getRange(values.length+1,1,sheet.getLastRow()-values.length,headers.length).clearContent();
 };
 put('Выплаты',['ID выплаты','Когда оплачено (Москва)','Сотрудник','Неделя с','Неделя по','Переведено, ₽','Было выплачено, ₽','Долг до, ₽','Остаток после, ₽','Статус','Кто отметил','Комментарий'],payments.map(p=>[p.id,Utilities.formatDate(new Date(p.at),'Europe/Moscow','yyyy-MM-dd HH:mm:ss'),p.name,p.weekStart,p.weekEnd,p.amount,p.paidBefore,p.dueBefore,p.dueAfter,p.status==='paid'?'Оплачено':'Оплачено частично',p.actor,p.note||'']));
 put('Смены и начисления',['Ключ смены','Дата смены','Сотрудник','Точка','Начало','Конец','Начислено, ₽','Статус','Способ начисления'],Object.entries(current).sort((a,b)=>a[1].attendance.date.localeCompare(b[1].attendance.date)).map(([key,e])=>{const a=e.attendance;return [key,a.date,a.name,e.shopId,a.start,a.end,a.status==='worked'?a.amount:0,a.status==='worked'?'Начислено':'Отменено',a.automatic?'Автоматически при открытии':'Администратор'];}));
 const weeks=new Set([...Object.values(current).map(e=>teamPayrollWeek_(e.attendance.date).start),...attendance.penalties.map(p=>teamPayrollWeek_(p.date).start),...payments.map(p=>p.weekStart)]),summary=[];
 for(const start of [...weeks].sort()){const week=teamPayrollWeek_(start),rows=Object.values(current).map(e=>e.attendance).filter(a=>a.date>=week.start&&a.date<=week.end),fines=attendance.penalties.filter(p=>p.date>=week.start&&p.date<=week.end),paid=payments.filter(p=>p.weekStart===start);
  for(const t of teamPayrollTotals_(rows,fines,paid))summary.push([week.start,week.end,t.name,t.count,t.gross,t.penalties,t.amount,t.paid,t.due,t.credit,t.status==='paid'?'Оплачено':t.status==='partial'?'Оплачено частично':'Не оплачено']);
 }
 put('Зарплата по неделям',['Неделя с','Неделя по','Сотрудник','Смены','Начислено, ₽','Штрафы, ₽','Итого заработано, ₽','Оплачено, ₽','Остаток, ₽','Переплата, ₽','Статус'],summary);
 SpreadsheetApp.flush();return true;
}

// Owner-run release verification: derives real reports; never records a synthetic payout.
function verifyPayrollRelease(){
 const original=PropertiesService.getScriptProperties(),selected=selectOpsDestination_({mode:'production',returnOrigin:OPS_ALLOWED_ORIGINS[0]},original),date=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd');
 const result=handleTeamRequest_({action:'listPayroll',shopId:1,date,auth:{admin:true,password:original.getProperty('ADMIN_PASSWORD')}},selected.root,selected.props);
 if(result.payrollVersion!==2||result.reportSynced!==true)throw Error('Не подтверждено обновление зарплатного отчёта.');
 console.log(JSON.stringify({payrollVersion:result.payrollVersion,automaticAccrual:true,rows:result.rows.length,payments:result.payments.length,reportSynced:result.reportSynced,payrollReportUrl:result.payrollReportUrl,syntheticPayments:0}));
}
function verifyPayrollEndpointRelease(){
 const p=PropertiesService.getScriptProperties(),nonce=Utilities.getUuid().replace(/-/g,''),endpoint='https://script.google.com/macros/s/AKfycbwtUCHluill1Op33aDBXnCvotAmRxBnkI8Nz0D01bAOygVMmWwMtLyDdKbRGY5Vv1TE/exec';
 const payload={apiVersion:3,nonce,mode:'production',returnOrigin:OPS_ALLOWED_ORIGINS[0],action:'listPayroll',shopId:1,date:Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd'),auth:{admin:true,password:p.getProperty('ADMIN_PASSWORD')}};
 const html=UrlFetchApp.fetch(endpoint,{method:'post',payload:{payload:JSON.stringify(payload)},muteHttpExceptions:true}).getContentText(),ack=readOpsReadinessAck_(html,OPS_ALLOWED_ORIGINS[0]);
 if(ack.nonce!==nonce||!ack.ok||ack.payrollVersion!==2||ack.reportSynced!==true)throw Error('Рабочий endpoint зарплаты ещё не обновлён или отчёт не синхронизирован.');
 console.log(JSON.stringify({liveEndpoint:true,payrollVersion:ack.payrollVersion,reportSynced:true,payrollReportUrl:ack.payrollReportUrl,syntheticPayments:0}));
}
