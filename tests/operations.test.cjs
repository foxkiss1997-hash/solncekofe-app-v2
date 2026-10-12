const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const html=fs.readFileSync('preorder.html','utf8'),moduleSource=fs.readFileSync('operations-v3.js','utf8'),backendSource=fs.readFileSync('apps-script/Operations.gs','utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n').split('/* ---------- INIT ---------- */')[0];
const clone=x=>JSON.parse(JSON.stringify(x));
test('real Apps Script sandbox acknowledgements arrive while spoofed hosts and mismatched nonces are ignored',async()=>{
 const f=front(),events=new Map();let payload,removed=0;
 f.context.window.addEventListener=(name,fn)=>events.set(name,fn);
 f.context.window.removeEventListener=name=>events.delete(name);
 f.context.document.createElement=tag=>({appendChild(el){payload=JSON.parse(el.value)},submit(){},remove(){removed++}});
 f.context.document.body={append(){}};
 const pending=f.context.sendOpsRequest({action:'authorizeAdmin'},'',true);
 const ack={channel:'solncekofe-ops-v3',apiVersion:3,nonce:payload.nonce,ok:true,authorized:true};
 const send=(origin,data=ack)=>events.get('message')({origin,data});
 send('https://script.googleusercontent.com.attacker.test');
 send('https://n-example-script.googleusercontent.com',{...ack,nonce:'wrong'});
 assert.equal(removed,0);
 send('https://n-dl54vw4gjdkpbnbwviyzuhoojza4nwtlpxnyhcy-0lu-script.googleusercontent.com');
 assert.equal((await pending).authorized,true);assert.equal(removed,2);
});
test('Google sandbox authentication errors reach the login form instead of timing out',async()=>{
 const f=front();let listener,payload;
 f.context.window.addEventListener=(name,fn)=>{listener=fn};
 f.context.document.createElement=tag=>({appendChild(el){payload=JSON.parse(el.value)},submit(){},remove(){}});
 f.context.document.body={append(){}};
 const pending=f.context.sendOpsRequest({action:'authorizeAdmin'},'',true);
 listener({origin:'https://n-example-0lu-script.googleusercontent.com',data:{channel:'solncekofe-ops-v3',apiVersion:3,nonce:payload.nonce,ok:false,error:'Нет доступа администратора.'}});
 await assert.rejects(pending,/Нет доступа администратора/);
});
function front(){
 const local=new Map(),listeners={};const context=vm.createContext({console,crypto,Intl,URL,URLSearchParams,setTimeout,clearTimeout,queueMicrotask,location:{origin:'https://foxkiss1997-hash.github.io'},window:{location:{search:'',href:'https://foxkiss1997-hash.github.io/preorder.html'},addEventListener(){},removeEventListener(){}},document:{addEventListener(name,fn){(listeners[name]??=[]).push(fn)},getElementById(){return {innerHTML:'',querySelector(){return null}}}},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},fetch:async()=>({ok:true,json:async()=>null})});
 vm.runInContext(moduleSource,context);vm.runInContext(inline,context);vm.runInContext("render=()=>{};showToast=()=>{};Object.assign(state,{adminChecklistShop:1,adminChecklistStage:'open',opsConfigDraft:null,staffShop:1,staffName:'Тест',reportPassword:'pass',opMode:'checklist',checklistStage:'day'});",context);
 const stores={queue:new Map(),drafts:new Map()};context.stores=stores;
 vm.runInContext("opsStore=async(name,mode,fn)=>fn({get:k=>stores[name].get(k),put:(v,k)=>stores[name].set(k||v.reportId,JSON.parse(JSON.stringify(v))),delete:k=>stores[name].delete(k),getAll:()=>Array.from(stores[name].values())});",context);
 return {context,stores,run:s=>vm.runInContext(s,context)};
}
function back(){
 const db={},writes=[],sheets={},photos=new Map();let failSheet=null,failDb=false;
 function range(sheet,row,col,height=1,width=1){return {getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>sheet.rows[row-1+i]?.[col-1+j]??'')),setValue:v=>{sheet.rows[row-1]??=[];sheet.rows[row-1][col-1]=v;},createTextFinder:id=>({matchEntireCell(){return this},findNext:()=>sheet.rows.slice(row-1,row-1+height).some(x=>x[col-1]===id)?{}:null})};}
 const book={getSheetByName:n=>sheets[n],insertSheet:n=>sheets[n]={rows:[],getMaxColumns:()=>20,getRange(...args){return range(this,...args)},getLastRow(){return this.rows.length},appendRow(row){if(failSheet===n)throw Error('Sheet unavailable');this.rows.push(clone(row));},setFrozenRows(){}}};
 const folder={getFilesByName:n=>({hasNext:()=>photos.has(n),next:()=>photos.get(n)}),createFile:b=>{const f={getUrl:()=>`https://drive.google.com/file/d/${b.name}/view`};photos.set(b.name,f);return f;}};
 const context=vm.createContext({console,Utilities:{formatDate:()=> '12:00:00',getUuid:()=>crypto.randomUUID(),base64Decode:s=>Buffer.from(s,'base64'),newBlob:(bytes,mime,name)=>({bytes,mime,name})},DriveApp:{getFolderById:()=>folder},SpreadsheetApp:{openById:()=>book,flush(){}},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 vm.runInContext(backendSource,context);
 context.read=path=>clone(db[path]??null);context.write=(path,method,data)=>{if(failDb)throw Error('HTTP 403');writes.push({path,method,data:clone(data)});if(method==='put')db[path]=clone(data);else for(const [k,v]of Object.entries(data)){const p=path+'/'+k;if(/\/syncStatus$/.test(p)){db[p.replace(/\/syncStatus$/,'')].syncStatus=v;}else db[p]=clone(v);}return clone(data);};
 vm.runInContext('dbRead_=read;dbRequest_=write;',context);
 return {context,db,writes,sheets,photos,book,run:s=>vm.runInContext(s,context),failSheet:n=>{failSheet=n},failDb:v=>{failDb=v},props:{getProperty:k=>({SPREADSHEET_ID:'test-sheet',PHOTO_FOLDER_ID:'private-folder'})[k]}};
}
function report(overrides={}){return {reportId:'a'.repeat(32),schemaVersion:3,shopId:1,date:'2026-10-10',type:'delivery',submittedBy:'Тест',submittedAt:Date.now(),party:'Тест поставщика',goods:'Кофе',amount:500,payment:'cash',photos:[{id:'b'.repeat(32),group:'report',dataUrl:'data:image/jpeg;base64,/9j/AA=='}],...overrides};}
test('staff login validates the selected shop even when another shop has the same password',async()=>{
 const f=front(),calls=[];f.run("state.staffShop=2;state.staffName=null;state.staffPinValue='pass';loadStaffOrders=()=>{};loadTodayOps=()=>{};loadChecklistConfig=()=>{};");
 f.context.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>({employee:{name:'Сотрудник второй точки',password:'pass',active:true}})}};
 await f.context.staffPasswordLogin();assert.equal(f.run('state.staffShop'),2);assert.equal(f.run('state.staffName'),'Сотрудник второй точки');assert.equal(calls.length,1);assert.match(calls[0],/staff\/2\.json$/);
});
test('staff login refuses inactive accounts and requires an explicit shop',async()=>{
 const f=front();f.run("state.staffName=null;state.staffShop=null;state.staffPinValue='pass'");let calls=0;
 f.context.fetch=async()=>{calls++;return {ok:true,json:async()=>({employee:{name:'Тест',password:'pass',active:false}})}};
 await f.context.staffPasswordLogin();assert.equal(calls,0);f.run('state.staffShop=1');await f.context.staffPasswordLogin();assert.equal(f.run('state.staffName'),null);
});
test('changing shops clears authentication but preserves queued reports and saved photos',()=>{
 const f=front();f.run("state.opMode=null;opsPhotoDrafts[opsDraftKey()]=[{id:'saved'}]");f.stores.queue.set('saved',{reportId:'saved',shopId:1,submittedBy:'Тест'});
 assert.equal(f.context.selectStaffShop(2),true);assert.equal(f.run('state.staffShop'),2);assert.equal(f.run('state.staffName'),null);assert.equal(f.run('state.reportPassword'),'');assert.equal(f.stores.queue.size,1);assert.equal(f.run('Object.values(opsPhotoDrafts)[0][0].id'),'saved');
 f.run("state.staffName='Тест';state.opMode='delivery'");assert.equal(f.context.selectStaffShop(1),false);assert.equal(f.run('state.staffShop'),2);
});
test('a previous shop order response cannot populate the new shop screen',async()=>{
 const f=front();let finish;f.context.fetch=()=>new Promise(resolve=>{finish=resolve});const pending=f.context.loadStaffOrders(true);f.run('state.opMode=null');f.context.selectStaffShop(2);
 finish({ok:true,json:async()=>({order:{shopId:1,status:'new'}})});await pending;assert.equal(f.run('state.staffOrders.length'),0);
});
test('revenue form labels its shop and submits one immutable report with photos after double tap',async()=>{
 const f=front();f.run("state.staffShop=2;state.opMode='revenue';state.reportCash='100';state.reportCashless='200';opsPhotoDrafts[opsDraftKey()]=[{id:'photo',group:'report',dataUrl:'photo'}];sendOpsRequest=async()=>{throw Error('offline')}");
 assert.match(f.run('renderStaffOpForm()'),/Нагатинская/);await Promise.all([f.context.submitRevenueReport(),f.context.submitRevenueReport()]);assert.equal(f.stores.queue.size,1);const saved=[...f.stores.queue.values()][0];assert.equal(saved.shopId,2);assert.equal(saved.total,300);assert.equal(saved.photos.length,1);
});
test('complete browser scripts parse and render staff/admin/checklist without initialization requests',()=>{const f=front();assert.match(f.run('renderStaff()'),/Фотоотчёт|фотоотчёт/);assert.match(f.run('renderAdminChecklists()'),/Убрать пункт/);assert.equal(f.run("getChecklistItems('day').length"),7);assert.match(f.run('renderChecklistV3()'),/полить цветы/);});
test('draft checks and photos are isolated by shop, staff, date and stage',()=>{const f=front();f.run("saveChecklistDraft({hall:true});opsPhotoDrafts[opsDraftKey()]=[{id:'x'}];state.staffShop=2;");assert.equal(f.run('readChecklistDraft().hall'),undefined);assert.equal(f.run('opsPhotos().length'),0);f.run("state.staffShop=1;state.staffName='Другой';");assert.equal(f.run('readChecklistDraft().hall'),undefined);});
test('archiving and editing future templates do not mutate queued report snapshots',async()=>{const f=front();f.run("opsChecklistConfig[1]={revision:'r1',stages:{day:[{id:'x',label:'Старое',active:true,requirePhoto:true}]}};sendOpsRequest=async()=>{throw Error('offline')};");await f.run("enqueueOpsReport({type:'checklist',checks:[{key:'x',label:'Старое',done:true}],stage:'day'})");f.run("opsChecklistConfig[1].stages.day[0].label='Новое';opsChecklistConfig[1].stages.day[0].active=false;");assert.equal(f.stores.queue.values().next().value.checks[0].label,'Старое');assert.equal(f.run("getChecklistItems('day').length"),0);});
test('failed Google acknowledgement keeps complete report/photos queued; retry removes it once',async()=>{const f=front();f.run("opsPhotoDrafts[opsDraftKey()]=[{id:'p',group:'report',dataUrl:'photo'}];sendOpsRequest=async()=>{throw Error('timeout')};");await f.run("enqueueOpsReport({type:'delivery',amount:100,party:'Кофе'})");assert.equal(f.stores.queue.size,1);assert.equal(f.stores.queue.values().next().value.photos[0].dataUrl,'photo');assert.equal(f.stores.queue.values().next().value.auth,undefined);f.run('sendOpsRequest=async()=>({ok:true})');await f.run('retryOpsQueue()');await f.run('retryOpsQueue()');assert.equal(f.stores.queue.size,0);});
test('durable queue failure does not clear photos or falsely show success',async()=>{const f=front();f.run("opsPhotoDrafts[opsDraftKey()]=[{id:'p',dataUrl:'photo'}];opsStore=async()=>{throw Error('QuotaExceeded')};");await assert.rejects(f.run("enqueueOpsReport({type:'checklist'})"),/QuotaExceeded/);assert.equal(f.run('opsPhotos().length'),1);});
test('pending reports of another employee/shop are not sent with current credentials',async()=>{const f=front();f.stores.queue.set('foreign',{reportId:'foreign',shopId:2,submittedBy:'Тест'});let calls=0;f.context.track=()=>{calls++;return {ok:true}};f.run('sendOpsRequest=track');await f.run('retryOpsQueue()');assert.equal(calls,0);assert.equal(f.stores.queue.size,1);});
test('server rejects negative/nonfinite totals, extra-large/duplicate photos and unknown report type',()=>{const b=back();for(const r of [report({type:'revenue',cash:-1,cashless:2}),report({amount:Infinity}),report({type:'guests'}),report({photos:Array(13).fill(report().photos[0])}),report({photos:[report().photos[0],report().photos[0]]})])assert.throws(()=>b.context.validateReport_(r));});
test('server canonicalizes totals/shop name and does not persist supplied credentials',()=>{const b=back();const r=b.context.validateReport_(report({type:'revenue',cash:10,cashless:20,total:999,shopName:'Fake',auth:{password:'secret'}}));assert.equal(r.total,30);assert.equal(r.shopName,'Рязанский проспект');assert.equal(r.auth,undefined);});
test('checklist requires photos and canonical template prevents bypass of required item photo',()=>{const b=back();const checks=[{key:'x',label:'Фото задачи',done:true,requirePhoto:true}],r=report({type:'checklist',stage:'day',checks,configRevision:'c'.repeat(32)});assert.throws(()=>b.context.validateReport_(r),/Фотоотчёт/);r.photos[0].group='x';const valid=b.context.validateReport_(r);b.db['/ops_v3_test/checklist_config/1']={revision:'c'.repeat(32),stages:{day:[{id:'x',label:'Фото задачи',requirePhoto:true,active:true}]}};assert.doesNotThrow(()=>b.context.authorizeChecklist_(valid,'/ops_v3_test'));valid.checks[0].requirePhoto=false;assert.throws(()=>b.context.authorizeChecklist_(valid,'/ops_v3_test'),/Версия/);});
test('private photos and delivery sheet are idempotent after retries; no loyalty paths touched',()=>{const b=back(),r=b.context.validateReport_(report());b.context.saveReport_(r,'/ops_v3_test',b.props);b.context.saveReport_(r,'/ops_v3_test',b.props);assert.equal(b.photos.size,1);assert.equal(b.sheets['Поставки'].rows.length,2);assert.ok(b.writes.every(w=>w.path.startsWith('/ops_v3_test')));assert.ok(!JSON.stringify(b.writes).includes('data:image'));assert.ok(!b.writes.some(w=>/guests|pid_map|voucher|stamps/.test(w.path)));});
test('partial sheet failure resumes frozen report without duplicate rows or photos',()=>{const b=back();const r=report({type:'shift',cash:100,cashless:50,total:150,actualCash:100,stage:'close',checks:[{key:'hall',label:'Зал',done:true}],photos:[{...report().photos[0],group:'closing'}]});b.failSheet('Смены');assert.throws(()=>b.context.saveReport_(r,'/ops_v3_test',b.props),/unavailable/);assert.equal(b.sheets['Выручка'].rows.length,2);b.failSheet(null);r.cash=999;b.context.saveReport_(r,'/ops_v3_test',b.props);assert.equal(b.sheets['Выручка'].rows.length,2);assert.equal(b.sheets['Выручка'].rows[1][4],100);assert.equal(b.photos.size,1);assert.equal(b.sheets['Смены'].rows.length,2);});
test('database failure is visible and sheet formula injection stays literal',()=>{const b=back();b.failDb(true);assert.throws(()=>b.context.saveReport_(report(),'/ops_v3_test',b.props),/403/);assert.equal(b.sheets['Поставки'],undefined);assert.equal(b.context.sheetText_('=IMPORTXML("secret")'),'\'=IMPORTXML("secret")');});
test('wrong employee password is rejected and test mode cannot write production spreadsheet',()=>{const b=back();b.db['/staff/1']={x:{name:'Тест',password:'right',active:true}};assert.throws(()=>b.context.authorizeStaff_(report(),{password:'wrong'}),/Пароль/);assert.doesNotThrow(()=>b.context.authorizeStaff_(report(),{password:'right'}));const props={getProperty:k=>k==='SPREADSHEET_ID'?'1vC8zXVTzKzvWPw_vOx7OKXEtJyx9zQJr-Y1Kbn-QLR4':'folder'};assert.throws(()=>b.context.saveReport_(report(),'/ops_v3_test',props),/копия/);});

test('administrator login requires positive server acknowledgement and never trusts a local PIN comparison',async()=>{
 const f=front();
 vm.runInContext("state.adminPinValue='test';state.adminAuthed=false;loadAdminOrders=async()=>{};sendOpsRequest=async()=>{throw Error('Нет доступа администратора.')}",f.context);
 await f.context.adminPasswordLoginV3();assert.equal(f.run('state.adminAuthed'),false);assert.equal(f.run('state.adminVerifying'),false);
 vm.runInContext('sendOpsRequest=async()=>({authorized:false})',f.context);await f.context.adminPasswordLoginV3();assert.equal(f.run('state.adminAuthed'),false);
 vm.runInContext('sendOpsRequest=async()=>({authorized:true})',f.context);await f.context.adminPasswordLoginV3();assert.equal(f.run('state.adminAuthed'),true);
});

test('production is explicitly enabled, confined to the main origin and isolated from test destinations',()=>{
 const b=back(),values={MODE:'test',SPREADSHEET_ID:'test-book',PHOTO_FOLDER_ID:'test-folder',PRODUCTION_SPREADSHEET_ID:'1vC8zXVTzKzvWPw_vOx7OKXEtJyx9zQJr-Y1Kbn-QLR4',PRODUCTION_PHOTO_FOLDER_ID:'private-working-folder'};
 const props={getProperty:k=>values[k]};const request={mode:'production',returnOrigin:'https://foxkiss1997-hash.github.io'};
 assert.throws(()=>b.context.selectOpsDestination_(request,props),/ещё не подключена/);
 values.PRODUCTION_ENABLED='true';
 assert.throws(()=>b.context.selectOpsDestination_({...request,returnOrigin:'https://solncekofe-staff-test-oct10.tursunovhaki.chatgpt.site'},props),/ещё не подключена/);
 const prod=b.context.selectOpsDestination_(request,props),testOnly=b.context.selectOpsDestination_({mode:'test'},props);
 assert.equal(prod.root,'/ops_v3');assert.equal(prod.props.getProperty('SPREADSHEET_ID'),values.PRODUCTION_SPREADSHEET_ID);
 assert.equal(testOnly.root,'/ops_v3_test');assert.equal(testOnly.props.getProperty('SPREADSHEET_ID'),'test-book');
 const r=b.context.validateReport_(report({type:'revenue',cash:350,cashless:500}));
 assert.equal(b.context.saveReport_(r,prod.root,prod.props).status,'synced');
 assert(b.writes.every(x=>x.path==='/ops_v3'||x.path.startsWith('/ops_v3/')));assert.equal(b.sheets['Выручка'].rows[1][6],850);
});
