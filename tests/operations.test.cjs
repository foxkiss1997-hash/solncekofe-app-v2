const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const html=fs.readFileSync('preorder.html','utf8'),moduleSource=fs.readFileSync('operations-v3.js','utf8'),backendSource=fs.readFileSync('apps-script/Operations.gs','utf8'),paymentSource=fs.readFileSync('payments-v4.js','utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n').split('/* ---------- INIT ---------- */')[0];
const clone=x=>JSON.parse(JSON.stringify(x));
function front(){
 const local=new Map(),listeners={};const context=vm.createContext({console,crypto,Intl,URL,URLSearchParams,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},confirm:()=>true,queueMicrotask,location:{origin:'https://foxkiss1997-hash.github.io'},window:{location:{search:'',href:'https://foxkiss1997-hash.github.io/preorder.html'},addEventListener(){},removeEventListener(){}},document:{addEventListener(name,fn){(listeners[name]??=[]).push(fn)},getElementById(){return {innerHTML:'',querySelector(){return null}}}},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},fetch:async()=>({ok:true,json:async()=>null})});
 vm.runInContext(moduleSource,context);vm.runInContext(paymentSource,context);vm.runInContext(inline,context);vm.runInContext("render=()=>{};showToast=()=>{};Object.assign(state,{adminChecklistShop:1,adminChecklistStage:'open',opsConfigDraft:null,staffShop:1,staffName:'Тест',reportPassword:'pass',opMode:'checklist',checklistStage:'day'});",context);
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

function checkout(f){f.run("shopStatus=()=>({open:true});state.cart=[{id:'espresso',name:'Эспрессо',category:'coffee',sizeId:'m',qty:1,unitPrice:150}];state.shopId=1;state.payMethod='pickup';state.screen='checkout';state.receiptContact='';");}
test('pickup sends an unpaid order, clears cart only after acknowledgement and never awards stamps',async()=>{
 const f=front();checkout(f);let body;
 f.context.fetch=async(url,options)=>{assert(url.endsWith('/order'));body=JSON.parse(options.body);return {ok:true,json:async()=>({orderId:'-pickup-test'})};};
 await f.context.placeOrder();assert.equal(body.payMethod,'При получении');assert.equal(body.paid,false);assert.equal(f.run('state.order.paid'),false);assert.equal(f.run('state.cart.length'),0);assert.equal(f.run('state.order.firebaseId'),'-pickup-test');
 assert.equal(f.run('readPendingPickup()'),null);
});
test('uncertain pickup acknowledgement preserves cart and retry checks the existing order without resubmitting',async()=>{
 const f=front();checkout(f);let sends=0;
 f.context.fetch=async()=>{sends++;throw Error('Network lost');};await f.context.placeOrder();assert.equal(f.run('state.cart.length'),1);assert(f.run('readPendingPickup()'));assert.equal(f.run('state.order'),null);
 f.context.fetch=async url=>{assert(url.includes('limitToLast=50'));return {ok:true,json:async()=>({})};};await f.context.placeOrder();assert.equal(sends,1);assert.equal(f.run('state.cart.length'),1);
 const pending=f.run('readPendingPickup()');f.context.fetch=async()=>({ok:true,json:async()=>({'-recovered':{clientId:pending.clientId,shopId:1,number:pending.number,payMethod:'При получении',createdAt:pending.placedAt,status:'new'}})});
 await f.context.placeOrder();assert.equal(f.run('state.order.firebaseId'),'-recovered');assert.equal(f.run('state.order.paid'),false);
});
test('double tap on pickup starts one submission',async()=>{
 const f=front();checkout(f);let resolve,calls=0;f.context.fetch=()=>{calls++;return new Promise(r=>resolve=r);};
 const first=f.context.placeOrder();await f.context.placeOrder();assert.equal(calls,1);resolve({ok:true,json:async()=>({orderId:'-once'})});await first;
});
test('payment links reject unsafe protocols and expose no paid state before bank confirmation',async()=>{
 const f=front();checkout(f);f.run("state.payMethod='link';state.receiptContact='test@example.invalid';watchCheckoutLink=()=>{};");let calls=0;
 f.context.fetch=async url=>{assert(url.endsWith('/create-payment'));calls++;return {ok:true,json:async()=>({ok:true,orderId:'bank-test',paymentUrl:'https://securepay.tinkoff.ru/test'})};};
 await f.context.placeOrder();assert.equal(f.run('state.order'),null);assert.equal(f.run('state.cart.length'),1);assert.match(f.context.renderCheckoutPaymentLink(),/Заказ ещё не оплачен/);await f.context.placeOrder();assert.equal(calls,1);
 for(const u of ['javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.equal(f.context.safePaymentUrl(u),'');
 f.run('state.checkoutPaymentLink=null');f.context.restorePendingCheckout();assert.equal(f.run('state.checkoutPaymentLink.orderId'),'bank-test');
 f.context.fetch=async url=>({ok:true,json:async()=>url.includes('order_lookup')?'-bank-order':{paid:false,shopId:1}});await f.context.checkCheckoutLinkPayment();assert.equal(f.run('state.order'),null);
 f.context.fetch=async url=>({ok:true,json:async()=>url.includes('order_lookup')?'-bank-order':{paid:true,shopId:1,status:'new',createdAt:Date.now()}});await f.context.checkCheckoutLinkPayment();assert.equal(f.run('state.order.paid'),true);assert.equal(f.run('state.cart.length'),0);
});
test('pickup confirmation is confined to its shop and unpaid pickup orders, and never writes loyalty or reports',()=>{
 const b=back(),req={orderId:'-cash-order',shopId:1,submittedBy:'Тест',receivedVia:'cash'};b.db['/orders/-cash-order']={shopId:1,payMethod:'При получении',status:'new',paid:false};
 assert.throws(()=>b.context.confirmPickupPayment_({...req,shopId:2}),/нельзя/);assert.throws(()=>b.context.confirmPickupPayment_({...req,receivedVia:'other'}),/Некорректное/);
 const ack=b.context.confirmPickupPayment_(req);assert.equal(ack.paid,true);assert.equal(b.writes.length,1);assert.equal(b.writes[0].path,'/orders/-cash-order');assert.equal(b.writes[0].data.paymentReceivedVia,'cash');
 b.db['/orders/-cash-order'].paid=true;assert.equal(b.context.confirmPickupPayment_(req).alreadyPaid,true);assert.equal(b.writes.length,1);
 b.db['/orders/-cash-order']={shopId:1,payMethod:'Картой онлайн',paid:false};assert.throws(()=>b.context.confirmPickupPayment_(req),/нельзя/);
});
test('payment confirmation endpoint rejects an unauthenticated employee before touching an order',()=>{
 const b=back();b.context.PropertiesService={getScriptProperties:()=>({getProperty:k=>({PRODUCTION_ENABLED:'true',PRODUCTION_SPREADSHEET_ID:'1vC8zXVTzKzvWPw_vOx7OKXEtJyx9zQJr-Y1Kbn-QLR4',PRODUCTION_PHOTO_FOLDER_ID:'private'})[k]})};
 b.context.HtmlService={XFrameOptionsMode:{ALLOWALL:'allow'},createHtmlOutput:text=>({text,setXFrameOptionsMode(){return this;}})};
 const result=b.context.doPost({parameter:{payload:JSON.stringify({apiVersion:3,nonce:'a'.repeat(32),mode:'production',returnOrigin:'https://foxkiss1997-hash.github.io',action:'confirmPickupPayment',shopId:1,submittedBy:'Тест',orderId:'-cash-order',receivedVia:'cash',auth:{password:'wrong'}})}});
 assert.match(result.text,/"ok":false/);assert.equal(b.writes.length,0);
});
