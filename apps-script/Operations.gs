/* Separate deployment. Configure Script Properties before running.
 * MODE=test; SPREADSHEET_ID=test copy; PHOTO_FOLDER_ID=private test folder;
 * ADMIN_PASSWORD=existing administrator credential. No secrets in this file.
 * Production is opt-in and must not be selected before the test workflow passes.
 */
const OPS_DATABASE = 'https://solncekofe-fdcad-default-rtdb.firebaseio.com';
const OPS_ALLOWED_ORIGINS = ['https://foxkiss1997-hash.github.io'];
function doPost(e){
  let request={},answer;
  try{
    request=JSON.parse(e.parameter.payload||'{}');
    if(request.apiVersion!==3||!OPS_ALLOWED_ORIGINS.includes(request.returnOrigin)||!/^[a-f0-9]{32}$/.test(request.nonce||''))throw Error('Некорректный запрос.');
    const props=PropertiesService.getScriptProperties(),mode=props.getProperty('MODE');
    if(!['test','production'].includes(mode)||request.mode!==mode)throw Error('Режим приложения и интеграции не совпадает.');
    const root=mode==='test'?'/ops_v3_test':'';
    if(request.action==='saveChecklistConfig'){
      const password=props.getProperty('ADMIN_PASSWORD');
      if(!password||!request.auth?.admin||request.auth.password!==password)throw Error('Нет доступа администратора.');
      answer=saveChecklistConfig_(request,root);
    }else if(request.action==='submitReport'){
      const report=validateReport_(request.report);authorizeStaff_(report,request.auth);authorizeChecklist_(report,root);
      answer=saveReport_(report,root,props);
    }else throw Error('Неизвестное действие.');
    answer={...answer,ok:true};
  }catch(err){answer={ok:false,error:String(err.message||err).slice(0,240)};}
  const message=JSON.stringify({channel:'solncekofe-ops-v3',apiVersion:3,nonce:request.nonce||'',...answer}).replace(/</g,'\\u003c');
  const target=OPS_ALLOWED_ORIGINS.includes(request.returnOrigin)?request.returnOrigin:OPS_ALLOWED_ORIGINS[0];
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>Обработка отчёта завершена.</p><script>window.top.postMessage('+message+','+JSON.stringify(target)+');</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function dbRead_(path){return dbRequest_(path,'get');}
function dbRequest_(path,method,data){
  const response=UrlFetchApp.fetch(OPS_DATABASE+(path||'/')+'.json',{method,contentType:'application/json',...(data===undefined?{}:{payload:JSON.stringify(data)}),muteHttpExceptions:true});
  if(response.getResponseCode()<200||response.getResponseCode()>=300)throw Error('База не подтвердила сохранение ('+response.getResponseCode()+').');
  return JSON.parse(response.getContentText());
}
function authorizeStaff_(r,auth){
  if(!auth||typeof auth.password!=='string'||!auth.password)throw Error('Подтвердите личный пароль сотрудника.');
  const staff=dbRead_('/staff/'+r.shopId)||{};
  if(!Object.values(staff).some(x=>x.active!==false&&x.name===r.submittedBy&&x.password===auth.password))throw Error('Пароль не подходит для этой кофейни и сотрудника.');
}
function validateReport_(r){
  if(!r||!/^[a-f0-9]{32}$/.test(r.reportId||'')||![1,2].includes(r.shopId)||!['checklist','shift','revenue','delivery','expense','issue'].includes(r.type))throw Error('Некорректный отчёт.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')||isNaN(Date.parse(r.date+'T12:00:00Z')))throw Error('Некорректная дата.');
  r.shopName=r.shopId===1?'Рязанский проспект':'Нагатинская';
  if(typeof r.submittedBy!=='string'||!r.submittedBy.trim()||r.submittedBy.length>100)throw Error('Укажите сотрудника.');
  r.submittedAt=Number.isFinite(r.submittedAt)?r.submittedAt:Date.now();
  ['party','goods','note'].forEach(k=>{r[k]=String(r[k]||'').slice(0,1000);});
  if(['shift','revenue'].includes(r.type)){
    if(![r.cash,r.cashless].every(x=>Number.isFinite(x)&&x>=0)||r.cash+r.cashless<=0)throw Error('Некорректная выручка.');
    r.total=r.cash+r.cashless;
    if(r.type==='shift'&&(!Number.isFinite(r.actualCash)||r.actualCash<0))throw Error('Укажите факт в кассе.');
  }
  if(['delivery','expense'].includes(r.type)&&(!Number.isFinite(r.amount)||r.amount<=0||!r.party.trim()))throw Error('Укажите сумму и назначение.');
  if(r.type==='issue'&&!r.party.trim())throw Error('Опишите проблему.');
  if(!Array.isArray(r.photos)||r.photos.length>12)throw Error('Допускается до 12 фото.');
  let size=0;const ids=new Set();
  r.photos=r.photos.map(p=>{
    if(!/^[a-f0-9]{32}$/.test(p.id||'')||ids.has(p.id)||typeof p.group!=='string'||p.group.length>80||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.dataUrl||'')||p.dataUrl.length>2000000)throw Error('Некорректное фото.');
    ids.add(p.id);size+=p.dataUrl.length;return {id:p.id,group:p.group,dataUrl:p.dataUrl};
  });
  if(size>8000000)throw Error('Слишком большой фотоотчёт.');
  if(['checklist','shift'].includes(r.type)){
    if(!['open','day','close'].includes(r.stage)||!Array.isArray(r.checks)||!r.checks.length||r.checks.length>50)throw Error('Чек-лист пуст или некорректен.');
    const keys=new Set();r.checks=r.checks.map(x=>{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(x.key||'')||keys.has(x.key)||typeof x.label!=='string'||!x.label.trim()||x.label.length>180)throw Error('Некорректный пункт.');keys.add(x.key);return {key:x.key,label:x.label,done:x.done===true,requirePhoto:x.requirePhoto===true};});
    if(!r.photos.length||r.checks.some(x=>x.requirePhoto&&!r.photos.some(p=>p.group===x.key)))throw Error('Фотоотчёт неполный.');
    r.completed=r.checks.every(x=>x.done);
    if(r.type==='shift'&&(!r.completed||r.stage!=='close'||!r.photos.some(p=>p.group==='closing')))throw Error('Проверьте закрытие и фото точки.');
  }
  const clean={};['reportId','schemaVersion','shopId','shopName','submittedBy','submittedAt','date','type','stage','configRevision','cash','cashless','total','actualCash','openedAt','amount','party','goods','note','payment','status','checks','completed','photos'].forEach(k=>{if(r[k]!==undefined)clean[k]=r[k];});return clean;
}
function saveChecklistConfig_(request,root){
  if(![1,2].includes(request.shopId)||!request.config?.stages)throw Error('Некорректная кофейня.');
  const stages={};
  ['open','day','close'].forEach(stage=>{
    const items=request.config.stages[stage];if(!Array.isArray(items)||items.length>50)throw Error('До 50 пунктов на этап.');
    const keys=new Set();stages[stage]=items.map(x=>{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(x.id||'')||keys.has(x.id)||typeof x.label!=='string'||!x.label.trim()||x.label.length>180)throw Error('Заполните названия пунктов.');keys.add(x.id);return {id:x.id,label:x.label.trim(),active:x.active!==false,requirePhoto:x.requirePhoto===true};});
  });
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{const previous=dbRead_(root+'/checklist_config/'+request.shopId),revision=Utilities.getUuid().replace(/-/g,'');
    const config={schemaVersion:3,stages,revision,updatedAt:Date.now()};
    const changes={};changes['checklist_config/'+request.shopId]=config;
    if(previous)changes['checklist_config_history/'+request.shopId+'/'+(previous.revision||'default')]=previous;
    dbRequest_(root,'patch',changes);return {revision};
  }finally{lock.releaseLock();}
}
function privatePhotos_(r,folder){
  return r.photos.map(p=>{
    const name=r.reportId+'_'+p.id+'.jpg',existing=folder.getFilesByName(name);
    const file=existing.hasNext()?existing.next():folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.dataUrl.split(',')[1]),'image/jpeg',name));
    // Inherit only the folder's existing access. No public sharing is enabled.
    return {id:p.id,group:p.group,url:file.getUrl()};
  });
}
function sheetText_(value){const s=String(value??'');return /^[=+\-@]/.test(s)?"'"+s:s;}
function appendOnce_(book,name,headers,values,id){
  let sheet=book.getSheetByName(name);if(!sheet)sheet=book.insertSheet(name);
  const width=headers.length;
  if(sheet.getMaxColumns()<width)sheet.insertColumnsAfter(sheet.getMaxColumns(),width-sheet.getMaxColumns());
  const first=sheet.getRange(1,1,1,width).getValues()[0];
  // Never replace existing header names or data: missing headers are additive.
  headers.forEach((h,i)=>{if(!first[i])sheet.getRange(1,i+1).setValue(h);else if(first[i]!==h)throw Error('Проверьте столбец '+(i+1)+' листа '+name+'.');});
  if(sheet.getLastRow()>1){const found=sheet.getRange(2,width,sheet.getLastRow()-1,1).createTextFinder(id).matchEntireCell(true).findNext();if(found)return;}
  sheet.appendRow(values.map(x=>typeof x==='number'?x:sheetText_(x)));sheet.setFrozenRows(1);
}
function reportRows_(r){
  const time=Utilities.formatDate(new Date(r.submittedAt),'Europe/Moscow','HH:mm:ss'),who=[r.date,time,r.shopName,r.submittedBy];
  const links=r.photos.map(p=>p.url).join('\n'),checkText=(r.checks||[]).map(x=>(x.done?'✓ ':'☐ ')+x.label).join('\n');
  const checks=r.checks||[],done=key=>{const x=checks.find(c=>c.key===key);return x?(x.done?'Да':'Нет'):'';};
  const rows=[];
  if(['shift','revenue'].includes(r.type))rows.push(['Выручка',['Дата','Время','Точка','Сотрудник','Наличные','Безналичные','Итого','Расхождение','ID смены','Фото отчёта','Комментарий','ID отчёта'],[...who,r.cash,r.cashless,r.total,Number.isFinite(r.actualCash)?r.actualCash-r.cash:'',r.type==='shift'?r.reportId:'',links,r.note,r.reportId]]);
  if(r.type==='delivery')rows.push(['Поставки',['Дата','Время','Точка','Сотрудник','Поставщик','Что привезли','Сумма','Способ оплаты','Накладная/фото','Комментарий','ID','ID отчёта'],[...who,r.party,r.goods,r.amount,r.payment,links,r.note,r.reportId,r.reportId]]);
  if(r.type==='expense')rows.push(['Расходы',['Дата','Время','Точка','Сотрудник','Категория','Описание','Сумма','Источник оплаты','Чек/фото','Комментарий','ID','ID отчёта'],[...who,'Расход',r.party,r.amount,r.payment,links,r.note,r.reportId,r.reportId]]);
  if(r.type==='issue')rows.push(['Проблемы',['Дата','Время','Точка','Сотрудник','Проблема','Срочность','Фото','Статус','Решено','Комментарий','ID','ID отчёта'],[...who,r.party,'Обычная',links,'active','Нет',r.note,r.reportId,r.reportId]]);
  if(['checklist','shift'].includes(r.type))rows.push(['Чек-листы',['Дата','Время','Точка','Сотрудник','Бар','Оборудование','Зал','Холодильники/продукты','Расходники','Комментарий','Фото закрытия','ID смены','Этап','Пункты и отметки','Фото по пунктам','ID отчёта'],[...who,done('bar'),done('equipment'),done('hall'),done('fridges'),done('supplies'),r.note,r.photos.filter(p=>p.group==='closing'||p.group==='report').map(p=>p.url).join('\n'),r.type==='shift'?r.reportId:'',r.stage,checkText,r.photos.map(p=>((checks.find(c=>c.key===p.group)?.label)||p.group)+': '+p.url).join('\n'),r.reportId]]);
  if(r.type==='shift')rows.push(['Смены',['Дата','Точка','Сотрудник','Начало','Закрытие','Наличные','Безналичные','Факт в кассе','Расхождение','Статус','ID смены','Фото закрытия','Фото выручки','ID отчёта'],[r.date,r.shopName,r.submittedBy,r.openedAt?Utilities.formatDate(new Date(r.openedAt),'Europe/Moscow','HH:mm:ss'):'',time,r.cash,r.cashless,r.actualCash,r.actualCash-r.cash,'closed',r.reportId,r.photos.filter(p=>p.group==='closing').map(p=>p.url).join('\n'),r.photos.filter(p=>p.group==='revenue').map(p=>p.url).join('\n'),r.reportId]]);
  return rows;
}
function saveReport_(incoming,root,props){
  const sheetId=props.getProperty('SPREADSHEET_ID'),folderId=props.getProperty('PHOTO_FOLDER_ID');
  if(!sheetId||!folderId)throw Error('Администратор ещё не подключил таблицу и папку фото.');
  if(root&&sheetId==='1vC8zXVTzKzvWPw_vOx7OKXEtJyx9zQJr-Y1Kbn-QLR4')throw Error('Для теста нужна копия таблицы.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const path=root+'/report_submissions/'+incoming.reportId,existing=dbRead_(path);
    if(existing&&(existing.shopId!==incoming.shopId||existing.submittedBy!==incoming.submittedBy))throw Error('ID отчёта занят.');
    if(existing?.syncStatus==='synced')return {reportId:incoming.reportId,status:'synced'};
    const r=existing||{...incoming,photos:privatePhotos_(incoming,DriveApp.getFolderById(folderId)),syncStatus:'pending'};
    // Durable canonical report first; retries use its frozen labels, values and private URLs.
    if(!existing)dbRequest_(path,'put',r);
    const book=SpreadsheetApp.openById(sheetId);reportRows_(r).forEach(([name,headers,values])=>appendOnce_(book,name,headers,values,r.reportId));
    SpreadsheetApp.flush();
    const changes={};changes['report_submissions/'+r.reportId+'/syncStatus']='synced';changes['report_submissions/'+r.reportId+'/syncedAt']=Date.now();
    if(['delivery','expense','issue'].includes(r.type))changes['operations/'+r.shopId+'/'+r.date+'/'+r.reportId]=r;
    if(r.type==='expense')changes['expense_reports/'+r.shopId+'/'+r.reportId]={...r,supplier:r.party};
    if(['checklist','shift'].includes(r.type))changes['checklist_reports/'+r.shopId+'/'+r.date+'/'+r.reportId]=r;
    if(r.type==='shift')changes['shifts/'+r.shopId+'/'+r.date+'/'+r.reportId]={...r,staff:r.submittedBy,status:'closed',checklist:Object.fromEntries(r.checks.map(x=>[x.key,x.done])),closingPhoto:r.photos.find(x=>x.group==='closing')?.url||''};
    if(['shift','revenue'].includes(r.type)){
      const previous=dbRead_(root+'/revenue_reports/'+r.shopId+'/'+r.date);if(previous)changes['revenue_report_history/'+r.shopId+'/'+r.date+'/'+r.reportId]=previous;
      changes['revenue_reports/'+r.shopId+'/'+r.date]=r;
    }
    dbRequest_(root,'patch',changes);return {reportId:r.reportId,status:'synced'};
  }finally{lock.releaseLock();}
}

const OPS_DEFAULT_CHECKLISTS = {
 open:[['entrance','Проверить вход и чистоту зала'],['light','Включить свет и рабочее оборудование'],['fridges','Проверить температуру холодильников'],['products','Проверить сроки годности и маркировку'],['equipment','Проверить кофемашину и кофемолку'],['supplies','Пополнить кофе, молоко и расходники'],['display','Подготовить витрину и ценники'],['cashdesk','Проверить кассу и терминал']],
 day:[['hall','Убрать столы и зал'],['bar','Протереть стойку и инвентарь'],['products','Проверить маркировку и сроки'],['supplies','Пополнить расходники'],['trash','Убрать мусор'],['flowers','Проверить влажность грунта; полить цветы по графику при необходимости'],['reports','Записать поставки и расходы']],
 close:[['bar','Убрать стойку и рабочие поверхности'],['equipment','Почистить кофемашину и инвентарь; проверить отключение по инструкции'],['hall','Убрать зал'],['fridges','Проверить холодильники: оставить включёнными, проверить продукты'],['supplies','Проверить расходники'],['trash','Вынести мусор'],['products','Проверить хранение и маркировку продуктов'],['flowers','Проверить цветы и график полива'],['reports','Записать выручку, поставки и расходы'],['security','Проверить свет, двери и закрытие помещения']]
};

function authorizeChecklist_(r,root){
  if(!['checklist','shift'].includes(r.type))return;
  const revision=r.configRevision||'default';if(revision!=='default'&&!/^[a-f0-9]{32}$/.test(revision))throw Error('Некорректная версия чек-листа.');let config;
  if(revision==='default')config={stages:Object.fromEntries(Object.entries(OPS_DEFAULT_CHECKLISTS).map(([stage,items])=>[stage,items.map(([id,label])=>({id,label,active:true,requirePhoto:false}))]))};
  else {const current=dbRead_(root+'/checklist_config/'+r.shopId);config=current?.revision===revision?current:dbRead_(root+'/checklist_config_history/'+r.shopId+'/'+revision);}
  const items=config?.stages?.[r.stage]?.filter(x=>x.active!==false);
  if(!items||items.length!==r.checks.length||items.some(x=>!r.checks.some(c=>c.key===x.id&&c.label===x.label&&c.requirePhoto===!!x.requirePhoto)))throw Error('Версия чек-листа не подтверждена. Обновите чек-лист.');
}

// Owner-run smoke test: synthetic records and a small generated JPEG, test destinations only.
// Does not deploy the web app, change main or read/write guests, pid_map or stamps.
function runIntegrationSmokeTest(){
 const props=PropertiesService.getScriptProperties();
 props.setProperties({MODE:'test',SPREADSHEET_ID:'1HBtoURCZBjqcbrBjNvV3LwNYM9IEL8w-Ku6GN6wRTcw',PHOTO_FOLDER_ID:'1JZIRY6WpJLq25Si3L0X2WOqVFB2D_bRD'});
 const root='/ops_v3_test',date=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd');
 const photo='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0uiiivyc+hP/Z';
 const checks=OPS_DEFAULT_CHECKLISTS.day.map(([key,label])=>({key,label,done:true,requirePhoto:false}));
 const closing=OPS_DEFAULT_CHECKLISTS.close.map(([key,label])=>({key,label,done:true,requirePhoto:false}));
 const sample=(type,extra)=>({reportId:Utilities.getUuid().replace(/-/g,''),schemaVersion:3,configRevision:'default',shopId:1,date,type,submittedBy:'ТЕСТ — не рабочий отчёт',submittedAt:Date.now(),photos:[{id:Utilities.getUuid().replace(/-/g,''),group:type==='shift'?'closing':'report',dataUrl:photo}],...extra});
 const reports=[1,2].flatMap(shopId=>[
  sample('delivery',{shopId,party:'ТЕСТ поставщика',goods:'ТЕСТ накладной',amount:1,payment:'cash'}),
  sample('checklist',{shopId,stage:'day',checks}),
  sample('shift',{shopId,stage:'close',checks:closing,cash:1,cashless:1,actualCash:1,openedAt:Date.now()})
 ]);
 reports.filter(r=>r.type==='shift').forEach(r=>r.photos.push({id:Utilities.getUuid().replace(/-/g,''),group:'revenue',dataUrl:photo}));
 const results=reports.map(r=>{const valid=validateReport_(r);authorizeChecklist_(valid,root);const first=saveReport_(valid,root,props);const retry=saveReport_(valid,root,props);return {first,retry};});
 console.log(JSON.stringify({testOnly:true,spreadsheetId:props.getProperty('SPREADSHEET_ID'),results}));
 return results;
}
