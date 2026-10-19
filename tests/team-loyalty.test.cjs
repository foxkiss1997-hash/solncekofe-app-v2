const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const copy=x=>x===undefined?null:JSON.parse(JSON.stringify(x));
const source=['Operations','TeamLoyalty','Catalog','Orders'].map(x=>fs.readFileSync('apps-script/'+x+'.gs','utf8')).join('\n');
const op='a'.repeat(32),giftOp='b'.repeat(32),shiftId='c'.repeat(32);
function setup(){
 const db={staff:{1:{one:{name:'Анна',password:'pass',active:true},two:{name:'Борис',password:'other',active:true}},2:{one:{name:'Анна',password:'second',active:true}}},guests:{ABCD:{stamps:5,bonusSpins:2,bonusBalance:100,vouchers:{GIFT:{label:'Кофе',redeemed:false}}}}},writes=[];
 const get=path=>copy(path.split('/').filter(Boolean).reduce((a,k)=>a?.[k],db));
 const put=(path,value)=>{const keys=path.split('/').filter(Boolean),last=keys.pop();let target=db;for(const key of keys)target=target[key]??={};target[last]=copy(value);writes.push(path);};
 const RealDate=Date;class FixedDate extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-19T09:00:00Z']));}static now(){return new RealDate('2026-10-19T09:00:00Z').getTime();}}
 const props={getProperty:k=>({ADMIN_PASSWORD:'owner'})[k]},cache=new Map();
 const ctx=vm.createContext({console,Date:FixedDate,Utilities:{formatDate:()=> '2026-10-19'},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})}});
 vm.runInContext(source,ctx);Object.assign(ctx,{read:get,write:(path,method,value)=>{if(method==='patch'){for(const [k,v]of Object.entries(value))put(path+'/'+k,v);}else put(path,value);return value;},snapshot:path=>({value:get(path),etag:'version'}),cas:(path,value)=>put(path,value),props});
 vm.runInContext('dbRead_=read;dbRequest_=write;teamSnapshot_=snapshot;teamComparePut_=cas;',ctx);
 const run=(name,request,root='/ops_v3')=>{ctx.req=copy(request);ctx.root=root;return vm.runInContext(name+'(req,props,root)',ctx);};
 const staff={shopId:1,submittedBy:'Анна',auth:{password:'pass'}},owner={shopId:1,auth:{admin:true,password:'owner'}};
 return {ctx,db,writes,props,staff,owner,run,put,get};
}
test('gift, history and existing guest fields commit together; repeated operation is idempotent',()=>{
 const x=setup(),req={...x.staff,action:'redeemGift',guestId:'ABCD',voucherId:'GIFT',operationId:op};
 x.run('handleLoyalty_',req);x.run('handleLoyalty_',req);
 assert.equal(x.writes.length,1);assert.equal(x.db.guests.ABCD.stamps,5);assert.equal(x.db.guests.ABCD.bonusSpins,2);assert.equal(x.db.guests.ABCD.vouchers.GIFT.redeemed,true);assert.equal(x.db.guests.ABCD.loyaltyHistory[op].shopId,1);
 assert.throws(()=>x.run('handleLoyalty_',{...req,operationId:giftOp}),/уже погашен/);
});
test('wrong staff credentials and inactive staff never write a gift or balance',()=>{
 const x=setup(),req={...x.staff,action:'spendBonus',guestId:'ABCD',amount:1,reason:'Чек',operationId:op};
 assert.throws(()=>x.run('handleLoyalty_',{...req,auth:{password:'bad'}}),/Пароль/);
 x.db.staff[1].one.active=false;assert.throws(()=>x.run('handleLoyalty_',req),/Пароль/);assert.equal(x.writes.length,0);
});
test('bonus debits validate integers and funds, owner alone credits or reverses',()=>{
 const x=setup(),req={...x.staff,action:'spendBonus',guestId:'ABCD',amount:25,reason:'Чек 123',operationId:op};
 for(const amount of [-1,0,1.2,101])assert.throws(()=>x.run('handleLoyalty_',{...req,amount}));
 assert.throws(()=>x.run('handleLoyalty_',{...req,action:'creditBonus'}),/владельцу/);
 x.run('handleLoyalty_',req);assert.equal(x.db.guests.ABCD.bonusBalance,75);
 assert.throws(()=>x.run('handleLoyalty_',{...req,action:'reverseLoyalty',operationId:giftOp,originalId:op,reason:'Ошибка'}),/владельцу/);
 x.run('handleLoyalty_',{...x.owner,action:'reverseLoyalty',guestId:'ABCD',operationId:giftOp,originalId:op,reason:'Ошибка'});assert.equal(x.db.guests.ABCD.bonusBalance,100);
 assert.throws(()=>x.run('handleLoyalty_',{...x.owner,action:'reverseLoyalty',guestId:'ABCD',operationId:shiftId,originalId:op,reason:'Повтор'}),/уже отменена/);
});
test('a stale Firebase version cannot commit a second redemption',()=>{
 const x=setup();x.ctx.cas=()=>{throw Error('Данные уже изменились')};vm.runInContext('teamComparePut_=cas',x.ctx);
 assert.throws(()=>x.run('handleLoyalty_',{...x.staff,action:'redeemGift',guestId:'ABCD',voucherId:'GIFT',operationId:op}),/изменились/);assert.equal(x.db.guests.ABCD.vouchers.GIFT.redeemed,false);assert.equal(x.writes.length,0);
});
test('test loyalty operations are isolated from production guest cards',()=>{
 const x=setup();x.put('/ops_v3_test/guests/ABCD',x.db.guests.ABCD);x.writes.length=0;
 x.run('handleLoyalty_',{...x.staff,action:'redeemGift',guestId:'ABCD',voucherId:'GIFT',operationId:op},'/ops_v3_test');
 assert.equal(x.db.guests.ABCD.vouchers.GIFT.redeemed,false);assert.equal(x.db.ops_v3_test.guests.ABCD.vouchers.GIFT.redeemed,true);
});
function schedule(x,r){x.ctx.req=r;return vm.runInContext("handleSchedule_(req,'/ops_v3',props)",x.ctx);}
test('employees request, owner approves; stale edits and cross-shop overlap are refused',()=>{
 const x=setup(),request={...x.staff,action:'requestShift',shiftId,operationId:op,date:'2026-10-20',start:'08:00',end:'16:00'};
 const row=schedule(x,request).row;assert.equal(row.status,'pending');
 assert.throws(()=>schedule(x,{...x.staff,action:'approveShift',shiftId,operationId:giftOp,revision:op}),/Нет заявки/);
 schedule(x,{...x.owner,action:'approveShift',shiftId,operationId:giftOp,revision:op});
 assert.equal(x.db.ops_v3.schedule[1][shiftId].status,'approved');
 assert.throws(()=>schedule(x,{...x.owner,action:'cancelShift',shiftId,operationId:'d'.repeat(32),revision:op}),/уже изменена/);
 assert.throws(()=>schedule(x,{...x.owner,shopId:2,action:'saveShift',shiftId:'e'.repeat(32),operationId:'f'.repeat(32),date:'2026-10-20',start:'09:00',end:'15:00',name:'Анна'}),/уже есть смена/);
});
test('staff cannot edit somebody else or cancel an approved shift',()=>{
 const x=setup();schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date:'2026-10-20',start:'08:00',end:'16:00',name:'Борис'});
 for(const action of ['saveShift','cancelShift'])assert.throws(()=>schedule(x,{...x.staff,action,shiftId,operationId:giftOp,revision:op,date:'2026-10-20',start:'08:00',end:'16:00',name:'Анна'}));
});
test('schedule validates exact dates and does not return staff passwords',()=>{
 const x=setup();assert.throws(()=>schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date:'2026-02-30',start:'08:00',end:'16:00',name:'Анна'}));
 const result=schedule(x,{...x.owner,action:'listSchedule'});assert.ok(!JSON.stringify(result).includes('password'));assert.ok(!JSON.stringify(result).includes('pass'));
});
function pickup(x,extra={}){x.ctx.req={action:'createPickupOrder',orderId:op,shopId:1,guestId:'ABCD',contact:'test@example.test',guestName:'Тест',items:[{itemId:'cap',sizeId:'m',qty:1}],expectedTotal:300,...extra};return vm.runInContext('createPickupOrder_(req,props)',x.ctx);}
test('receipt order gets server price and a durable ID; retry cannot create a duplicate',()=>{
 const x=setup();const first=pickup(x),again=pickup(x);assert.equal(first.orderId,again.orderId);assert.equal(x.db.orders[op].total,300);assert.equal(x.db.orders[op].paid,false);assert.equal(Object.keys(x.db.orders).length,1);assert.equal(x.db.orders[op].notificationStatus,'pending');
});
test('receipt order refuses manipulated price, stopped item, fractional quantity and unknown options',()=>{
 for(const extra of [{expectedTotal:1},{items:[{itemId:'cap',sizeId:'m',qty:1.2}]},{items:[{itemId:'cap',sizeId:'m',qty:1,syrup:'hack'}]}]){const x=setup();assert.throws(()=>pickup(x,extra));assert.ok(!x.db.orders);}
 const x=setup();x.db.stoplist={cap:true};assert.throws(()=>pickup(x),/недоступна/);assert.ok(!x.db.orders);
});
test('current live menu overrides and syrup price are authoritative for new orders',()=>{
 const x=setup();x.db.menu_overrides={cap:{sizes:{m:350}}};const result=pickup(x,{items:[{itemId:'cap',sizeId:'m',qty:1,syrup:'syr0'}],expectedTotal:400});assert.equal(result.order.total,400);
});
test('seventh staff stamp atomically creates gift, spin and history without touching existing redeemed gifts',()=>{
 const x=setup();x.db.guests.ABCD.stamps=6;x.db.guests.ABCD.vouchers.OLD={label:'Выдан',redeemed:true};
 const req={...x.staff,action:'awardStamp',guestId:'ABCD',operationId:op};x.run('handleLoyalty_',req);x.run('handleLoyalty_',req);
 assert.equal(x.db.guests.ABCD.stamps,0);assert.equal(x.db.guests.ABCD.bonusSpins,3);assert.equal(x.db.guests.ABCD.vouchers.OLD.redeemed,true);assert.equal(Object.keys(x.db.guests.ABCD.vouchers).length,3);assert.equal(x.writes.length,1);
});
test('replacement is final after the other employee OR the owner agrees',()=>{
 for(const byOwner of [false,true]){
 const x=setup();schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date:'2026-10-20',start:'08:00',end:'16:00',name:'Анна'});
 schedule(x,{...x.staff,action:'requestSwap',targetName:'Борис',shiftId,operationId:giftOp,revision:op});
 assert.equal(x.db.ops_v3.schedule[1][shiftId].name,'Анна');
 assert.throws(()=>schedule(x,{...x.staff,action:'acceptSwap',shiftId,operationId:'d'.repeat(32),revision:giftOp}),/второй участник/);
 const actor=byOwner?x.owner:{shopId:1,submittedBy:'Борис',auth:{password:'other'}};
 schedule(x,{...actor,action:byOwner?'approveSwap':'acceptSwap',shiftId,operationId:'d'.repeat(32),revision:giftOp});
 assert.equal(x.db.ops_v3.schedule[1][shiftId].name,'Борис');assert.equal(x.db.ops_v3.schedule[1][shiftId].swap.status,'approved');
 }
});
test('owner overview prefers current operations revenue; test view never reads production revenue',()=>{
 const x=setup();x.put('/ops_v3/revenue_reports/1/2026-10-19',{cash:100,cashless:200});x.put('/revenue_reports/1/2026-10-19',{cash:1,cashless:1});x.ctx.req=x.owner;
 const data=vm.runInContext("teamOverview_(req,'/ops_v3',props)",x.ctx);assert.equal(data.rows[0].revenue,300);
 const isolated=vm.runInContext("teamOverview_(req,'/ops_v3_test',props)",x.ctx);assert.equal(isolated.rows[0].revenue,null);
});
test('partial size overrides preserve untouched sizes in the server catalog',()=>{
 const x=setup();x.db.menu_overrides={cap:{sizes:{m:350}}};assert.equal(pickup(x,{items:[{itemId:'cap',sizeId:'s',qty:1}],expectedTotal:250}).order.total,250);
});
test('receipt order checks the selected shop stock list as well as the global stop list',()=>{
 const x=setup();x.db.shop_stoplist={1:{cap:true},2:{}};assert.throws(()=>pickup(x),/недоступна/);assert.ok(!x.db.orders);assert.equal(pickup(x,{shopId:2}).order.total,300);
});

test('existing pickup payment confirmation remains idempotent and confined to the selected shop',()=>{
 const x=setup();x.put('/orders/legacy',{shopId:1,status:'new',payMethod:'При получении',paid:false});x.writes.length=0;
 const req={...x.staff,orderId:'legacy',receivedVia:'cash'};
 assert.throws(()=>x.run('confirmPickupPayment_',{...req,shopId:2}),/нельзя оплатить/);
 x.db.orders.legacy.payMethod='receipt';x.run('confirmPickupPayment_',req);const writes=x.writes.length;
 assert.equal(x.db.orders.legacy.paid,true);assert.equal(x.db.orders.legacy.paymentConfirmedBy,'Анна');
 assert.equal(x.run('confirmPickupPayment_',req).alreadyPaid,true);assert.equal(x.writes.length,writes);
});

test('a first authenticated stamp creates a new card atomically and retries do not add another stamp',()=>{
 const x=setup(),req={...x.staff,action:'awardStamp',guestId:'NEWCARD',operationId:op};
 assert.throws(()=>x.run('handleLoyalty_',{...req,auth:{password:'bad'}}),/Пароль/);
 x.run('handleLoyalty_',req);x.run('handleLoyalty_',req);
 assert.equal(x.db.guests.NEWCARD.stamps,1);assert.equal(x.db.guests.NEWCARD.bonusBalance,0);assert.equal(x.writes.length,1);
});

test('personal calendar separates own rows from the approved team schedule across shops',()=>{
 const x=setup();x.put('/ops_v3/schedule/1',{one:{name:'Анна',date:'2026-10-20',start:'08:00',end:'16:00',status:'approved'}});
 x.put('/ops_v3/schedule/2',{two:{name:'Анна',date:'2026-10-21',start:'10:00',end:'18:00',status:'pending'},other:{name:'Борис',date:'2026-10-22',start:'08:00',end:'16:00',status:'approved'},cancelled:{name:'Анна',date:'2026-10-23',start:'08:00',end:'16:00',status:'cancelled'}});
 x.writes.length=0;const result=schedule(x,{...x.staff,action:'listSchedule'});
 assert.equal(result.myRows.length,2);assert.deepEqual(Array.from(result.myRows,r=>r.shopId),[1,2]);assert.ok(result.myRows.every(r=>r.name==='Анна'));assert.equal(x.writes.length,0);
 assert.throws(()=>schedule(x,{...x.staff,auth:{password:'bad'},action:'listSchedule'}),/Пароль/);
});

test('shared team schedule exposes approved shift times without drafts or internal fields',()=>{
 const x=setup();x.put('/ops_v3/schedule/2',{approved:{name:'Борис',date:'2026-10-20',start:'12:00',end:'21:00',status:'approved',password:'private-value',history:{secret:'private-value'},internalNote:'private-value'},pending:{name:'Мария',date:'2026-10-20',start:'08:00',end:'16:00',status:'pending'},cancelled:{name:'Анна',date:'2026-10-20',start:'08:00',end:'16:00',status:'cancelled'}});
 const result=schedule(x,{...x.staff,action:'listSchedule'});
 assert.equal(result.teamRows.length,1);assert.equal(result.teamRows[0].name,'Борис');assert.equal(result.teamRows[0].shopId,2);assert.ok(!JSON.stringify(result.teamRows).includes('private-value'));assert.ok(!JSON.stringify(result.teamRows).includes('Мария'));
});

test('batch submits free and occupied slots atomically and retries survive later approval',()=>{
 const x=setup(),busy='d'.repeat(32),free='e'.repeat(32);
 schedule(x,{...x.owner,action:'saveShift',shiftId:busy,operationId:op,date:'2026-10-21',start:'08:00',end:'16:00',name:'Борис'});
 const req={...x.staff,action:'requestShifts',operationId:giftOp,items:[{shiftId:free,date:'2026-10-20',start:'08:00',end:'16:00'},{shiftId:busy,revision:op}]};
 x.writes.length=0;const result=schedule(x,req);assert.equal(result.rows.length,2);assert.equal(x.writes.length,1);
 assert.equal(x.db.ops_v3.schedule[1][free].status,'pending');assert.equal(x.db.ops_v3.schedule[1][busy].name,'Борис');
 const own=schedule(x,{...x.staff,action:'listSchedule'}).myRows;assert.equal(own.length,2);assert.ok(own.every(r=>r.status==='pending'));assert.equal(own.find(r=>r.id===busy).requestType,'transfer');
 assert.throws(()=>schedule(x,{...x.staff,action:'acceptSwap',shiftId:busy,operationId:'f'.repeat(32),revision:giftOp}),/второй участник/);
 schedule(x,{shopId:1,submittedBy:'Борис',auth:{password:'other'},action:'acceptSwap',shiftId:busy,operationId:'f'.repeat(32),revision:giftOp});
 assert.equal(x.db.ops_v3.schedule[1][busy].name,'Анна');
 const count=x.writes.length;assert.equal(schedule(x,req).replayed,true);assert.equal(x.writes.length,count);
});
test('one stale selected slot rejects the entire batch; no partial requests',()=>{
 const x=setup();x.put('/ops_v3/schedule/1/'+shiftId,{date:'2026-10-20',start:'08:00',end:'16:00',name:'Борис',status:'approved',revision:op});x.writes.length=0;
 assert.throws(()=>schedule(x,{...x.staff,action:'requestShifts',operationId:giftOp,items:[{shiftId:'e'.repeat(32),date:'2026-10-21',start:'08:00',end:'16:00'},{shiftId,revision:'wrong'}]}),/изменена/);
 assert.equal(x.writes.length,0);assert.equal(Object.keys(x.db.ops_v3.schedule[1]).length,1);
});
test('one employee occupies a point at a time; adjacent shifts allowed',()=>{
 const x=setup();schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date:'2026-10-20',start:'08:00',end:'16:00',name:'Анна'});
 const req={...x.owner,action:'saveShift',shiftId:'e'.repeat(32),operationId:giftOp,date:'2026-10-20',start:'12:00',end:'21:00',name:'Борис'};
 assert.throws(()=>schedule(x,req),/один человек/);schedule(x,{...req,start:'16:00'});
 assert.equal(Object.keys(x.db.ops_v3.schedule[1]).length,2);
});
test('a transfer can be declined and competing proposals cannot overwrite consent',()=>{
 const x=setup();schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date:'2026-10-20',start:'08:00',end:'16:00',name:'Борис'});
 schedule(x,{...x.staff,action:'requestShift',shiftId,operationId:giftOp,revision:op});
 assert.throws(()=>schedule(x,{...x.staff,action:'requestShift',shiftId,operationId:'d'.repeat(32),revision:giftOp}),/уже есть заявка/);
 schedule(x,{...x.owner,action:'rejectSwap',shiftId,operationId:'e'.repeat(32),revision:giftOp});assert.equal(x.db.ops_v3.schedule[1][shiftId].name,'Борис');
 assert.throws(()=>schedule(x,{...x.owner,action:'approveSwap',shiftId,operationId:'f'.repeat(32),revision:'e'.repeat(32)}),/Нет действующей/);
});
test('a replacement cannot put the employee in two shops at once',()=>{
 const x=setup();schedule(x,{...x.owner,shopId:2,action:'saveShift',shiftId:'e'.repeat(32),operationId:op,date:'2026-10-20',start:'08:00',end:'16:00',name:'Анна'});
 schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date:'2026-10-20',start:'08:00',end:'16:00',name:'Борис'});
 schedule(x,{...x.staff,action:'requestShift',shiftId,operationId:giftOp,revision:op});
 assert.throws(()=>schedule(x,{...x.owner,action:'approveSwap',shiftId,operationId:'f'.repeat(32),revision:giftOp}),/уже есть смена/);
 assert.equal(x.db.ops_v3.schedule[1][shiftId].name,'Борис');
});

test('overlapping selections and past dates fail without writes; test batches remain isolated',()=>{
 const x=setup(),items=[{shiftId:'d'.repeat(32),date:'2026-10-20',start:'08:00',end:'16:00'},{shiftId:'e'.repeat(32),date:'2026-10-20',start:'12:00',end:'21:00'}];
 assert.throws(()=>schedule(x,{...x.staff,action:'requestShifts',operationId:op,items}),/уже есть смена/);assert.equal(x.writes.length,0);
 assert.throws(()=>schedule(x,{...x.staff,action:'requestShifts',operationId:op,items:[{...items[0],date:'2026-10-18'}]}),/прошедшую/);
 x.ctx.req={...x.staff,action:'requestShifts',operationId:op,items:[items[0]]};vm.runInContext("handleSchedule_(req,'/ops_v3_test',props)",x.ctx);assert.ok(x.db.ops_v3_test.schedule[1]);assert.equal(x.db.ops_v3,undefined);
});

test('employee edits only their own custom pending request; approval, stale edits and ready slots stay protected',()=>{
 const x=setup();schedule(x,{...x.staff,action:'requestShift',shiftId,operationId:op,date:'2026-10-20',start:'08:00',end:'16:00'});
 const edit={...x.staff,action:'editShiftRequest',shiftId,revision:op,operationId:giftOp,date:'2026-10-21',start:'09:00',end:'18:00'};
 assert.throws(()=>schedule(x,{...edit,submittedBy:'Борис',auth:{password:'other'}}),/свою/);
 schedule(x,edit);assert.equal(x.db.ops_v3.schedule[1][shiftId].date,'2026-10-21');assert.equal(x.db.ops_v3.schedule[1][shiftId].status,'pending');
 assert.throws(()=>schedule(x,{...edit,operationId:'d'.repeat(32)}),/изменена/);
 schedule(x,{...x.owner,action:'approveShift',shiftId,operationId:'e'.repeat(32),revision:giftOp});
 assert.throws(()=>schedule(x,{...edit,operationId:'f'.repeat(32),revision:'e'.repeat(32)}),/неутверждённую/);
});
test('editing a pending request cannot collide with another slot or alter an administrator slot',()=>{
 const x=setup();schedule(x,{...x.owner,action:'saveShift',shiftId:'d'.repeat(32),operationId:op,date:'2026-10-22',start:'08:00',end:'16:00',name:'Борис'});
 schedule(x,{...x.staff,action:'requestShift',shiftId,operationId:op,date:'2026-10-20',start:'08:00',end:'16:00'});
 assert.throws(()=>schedule(x,{...x.staff,action:'editShiftRequest',shiftId,operationId:giftOp,revision:op,date:'2026-10-22',start:'09:00',end:'18:00'}),/уже есть смена/);
 schedule(x,{...x.owner,action:'saveShift',shiftId:'e'.repeat(32),operationId:op,date:'2026-10-23',start:'08:00',end:'16:00',name:''});
 schedule(x,{...x.staff,action:'requestShift',shiftId:'e'.repeat(32),operationId:giftOp,revision:op});
 assert.throws(()=>schedule(x,{...x.staff,action:'editShiftRequest',shiftId:'e'.repeat(32),operationId:'f'.repeat(32),revision:giftOp,date:'2026-10-24',start:'09:00',end:'18:00'}),/Готовую смену/);
});

test('eight selected shifts commit as one pending batch with one database write',()=>{
 const x=setup(),items=Array.from({length:8},(_,i)=>({shiftId:(i+1).toString(16).repeat(32),date:'2026-10-'+(20+i),start:'08:00',end:'21:00'}));
 const req={...x.staff,action:'requestShifts',operationId:op,items};const result=schedule(x,req);
 assert.equal(result.rows.length,8);assert.ok(result.rows.every(x=>x.status==='pending'));assert.equal(x.writes.length,1);schedule(x,req);assert.equal(x.writes.length,1);
});

test('administrator confirms eight requested shifts atomically; staff cannot review and retries do not reapply',()=>{
 const x=setup(),items=Array.from({length:8},(_,i)=>({shiftId:(i+1).toString(16).repeat(32),date:'2026-10-'+(20+i),start:'08:00',end:'21:00'}));
 schedule(x,{...x.staff,action:'requestShifts',operationId:op,items});x.writes.length=0;
 const review={...x.owner,action:'approveShifts',operationId:giftOp,items:items.map(x=>({shiftId:x.shiftId,revision:op}))};
 assert.throws(()=>schedule(x,{...review,...x.staff}),/администратору/);assert.equal(x.writes.length,0);
 assert.equal(schedule(x,review).rows.length,8);assert.equal(x.writes.length,1);assert.ok(Object.values(x.db.ops_v3.schedule[1]).every(r=>r.status==='approved'));schedule(x,review);assert.equal(x.writes.length,1);
 assert.throws(()=>schedule(x,{...review,action:'rejectShifts'}),/ID операции/);
});
test('a conflict or stale revision rejects every approval in the selection',()=>{
 for(const stale of [false,true]){
 const x=setup(),ids=['c'.repeat(32),'d'.repeat(32)];schedule(x,{...x.staff,action:'requestShifts',operationId:op,items:ids.map((shiftId,i)=>({shiftId,date:'2026-10-'+(20+i),start:'08:00',end:'16:00'}))});
 if(!stale)schedule(x,{...x.owner,action:'saveShift',shiftId:'e'.repeat(32),operationId:giftOp,date:'2026-10-21',start:'10:00',end:'21:00',name:'Борис'});
 x.writes.length=0;assert.throws(()=>schedule(x,{...x.owner,action:'approveShifts',operationId:'f'.repeat(32),items:ids.map((shiftId,i)=>({shiftId,revision:stale&&i===1?'old':op}))}),stale?/изменена/:/один человек/);
 assert.equal(x.writes.length,0);assert.ok(ids.every(id=>x.db.ops_v3.schedule[1][id].status==='pending'));
 }
});
test('rejecting a batch restores free slots and preserves the original holder of replacements',()=>{
 const x=setup(),free='d'.repeat(32),busy='e'.repeat(32),custom='f'.repeat(32);
 for(const [shiftId,date,name]of [[free,'2026-10-20',''],[busy,'2026-10-21','Борис']])schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date,start:'08:00',end:'16:00',name});
 schedule(x,{...x.staff,action:'requestShifts',operationId:giftOp,items:[{shiftId:free,revision:op},{shiftId:busy,revision:op},{shiftId:custom,date:'2026-10-22',start:'08:00',end:'16:00'}]});x.writes.length=0;
 const review={...x.owner,action:'rejectShifts',operationId:'1'.repeat(32),items:[free,busy,custom].map(shiftId=>({shiftId,revision:giftOp}))};schedule(x,review);
 assert.equal(x.writes.length,1);assert.equal(x.db.ops_v3.schedule[1][free].status,'open');assert.equal(x.db.ops_v3.schedule[1][free].name,'');assert.equal(x.db.ops_v3.schedule[1][busy].name,'Борис');assert.equal(x.db.ops_v3.schedule[1][busy].swap.status,'rejected');assert.equal(x.db.ops_v3.schedule[1][custom].status,'cancelled');
});
test('mixed new shifts and replacements are confirmed together, and review test mode never touches production',()=>{
 const x=setup(),busy='d'.repeat(32),custom='e'.repeat(32);
 schedule(x,{...x.owner,action:'saveShift',shiftId:busy,operationId:op,date:'2026-10-20',start:'08:00',end:'16:00',name:'Борис'});
 schedule(x,{...x.staff,action:'requestShifts',operationId:giftOp,items:[{shiftId:busy,revision:op},{shiftId:custom,date:'2026-10-21',start:'08:00',end:'16:00'}]});
 x.put('/ops_v3_test/schedule',x.db.ops_v3.schedule);x.writes.length=0;x.ctx.req={...x.owner,action:'approveShifts',operationId:'f'.repeat(32),items:[busy,custom].map(shiftId=>({shiftId,revision:giftOp}))};vm.runInContext("handleSchedule_(req,'/ops_v3_test',props)",x.ctx);
 assert.equal(x.db.ops_v3_test.schedule[1][busy].name,'Анна');assert.equal(x.db.ops_v3_test.schedule[1][custom].status,'approved');assert.equal(x.db.ops_v3.schedule[1][busy].name,'Борис');assert.equal(x.db.ops_v3.schedule[1][custom].status,'pending');assert.equal(x.writes.length,1);
});

function privatePay(x){
 const ledgers={},entries=[];
 x.ctx.payStore=(props,root)=>{const store=ledgers[root]||(ledgers[root]={sheet:{},current:{},operations:{}});return store;};
 x.ctx.payAppend=(store,event)=>{const e=copy(event);store.operations[e.operationId]=e;store.current[e.key]=e;entries.push(e);};
 vm.runInContext('teamPayrollStore_=payStore;teamPayrollAppend_=payAppend;',x.ctx);
 return {ledgers,entries};
}
function pastShift(x,id=shiftId,date='2026-10-18',name='Анна',shopId=1){return schedule(x,{...x.owner,shopId,action:'saveShift',shiftId:id,operationId:op,date,start:'08:00',end:'21:00',name}).row;}
function worked(x,id=shiftId,operationId=giftOp,shopId=1,revision=op){return schedule(x,{...x.owner,shopId,action:'confirmWorkedShift',shiftId:id,operationId,revision});}
test('payroll weeks run Monday to Sunday, including month and year boundaries',()=>{
 const x=setup();for(const [date,start,end]of [['2026-10-19','2026-10-19','2026-10-25'],['2026-10-25','2026-10-19','2026-10-25'],['2026-10-26','2026-10-26','2026-11-01'],['2027-01-01','2026-12-28','2027-01-03']]){
 x.ctx.anchor=date;const week=vm.runInContext('teamPayrollWeek_(anchor)',x.ctx);assert.equal(week.start,start);assert.equal(week.end,end);assert.equal(week.payDate,end);
 }
});
test('five confirmed worked shifts earn 21000 on Sunday; planned and pending shifts earn nothing',()=>{
 const x=setup(),p=privatePay(x);for(let i=0;i<5;i++){const id=String(i+1).repeat(32);pastShift(x,id,'2026-10-'+(12+i));worked(x,id,(i+6).toString(16).repeat(32));}
 pastShift(x,'f'.repeat(32),'2026-10-17');x.writes.length=0;
 const data=schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'});assert.equal(data.count,5);assert.equal(data.amount,21000);assert.equal(data.week.payDate,'2026-10-18');assert.equal(p.entries.length,5);assert.equal(x.writes.length,0);assert.equal(data.awaiting,undefined);
 assert.ok(!JSON.stringify(x.db.ops_v3.schedule).includes('4200'));
});
test('only administrator confirms completed work, ignores client amounts, and cannot count a future shift',()=>{
 const x=setup(),p=privatePay(x);pastShift(x);
 assert.throws(()=>schedule(x,{...x.staff,action:'confirmWorkedShift',shiftId,operationId:giftOp,revision:op,amount:999999}),/администратор/);
 schedule(x,{...x.owner,action:'confirmWorkedShift',shiftId,operationId:giftOp,revision:op,amount:999999,rate:1});assert.equal(p.entries[0].attendance.amount,4200);
 pastShift(x,'d'.repeat(32),'2026-10-20');assert.throws(()=>worked(x,'d'.repeat(32),'e'.repeat(32)),/не закончилась/);
 assert.throws(()=>schedule(x,{...x.staff,auth:{password:'bad'},action:'listPayroll'}),/Пароль/);assert.equal(p.entries.length,1);
});
test('weekly earnings combine own work at both points without exposing another employee payroll',()=>{
 const x=setup();privatePay(x);pastShift(x,shiftId,'2026-10-16');worked(x);pastShift(x,'d'.repeat(32),'2026-10-18','Анна',2);worked(x,'d'.repeat(32),'e'.repeat(32),2);pastShift(x,'f'.repeat(32),'2026-10-17','Борис');worked(x,'f'.repeat(32),'1'.repeat(32));
 const staff=schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'}),owner=schedule(x,{...x.owner,action:'listPayroll',date:'2026-10-18'});
 assert.equal(staff.amount,8400);assert.equal(staff.rows.length,2);assert.ok(staff.rows.every(r=>r.name==='Анна'));assert.deepEqual(Array.from(staff.rows,r=>r.shopId),[1,2]);assert.ok(!JSON.stringify(staff).includes('Борис'));assert.equal(owner.amount,12600);assert.equal(owner.totals.length,2);
});
test('worked-shift confirmation and reversal are idempotent, audited and freeze schedule changes',()=>{
 const x=setup(),p=privatePay(x);pastShift(x);worked(x);worked(x);assert.equal(p.entries.length,1);
 assert.throws(()=>worked(x,shiftId,'d'.repeat(32)),/уже учтена/);
 for(const action of ['saveShift','cancelShift','requestSwap'])assert.throws(()=>schedule(x,{...x.owner,action,shiftId,operationId:'d'.repeat(32),revision:op,date:'2026-10-18',start:'08:00',end:'21:00',name:'Борис'}),/начислена зарплата/);
 const reverse={...x.owner,action:'reverseWorkedShift',shiftId,operationId:'e'.repeat(32),revision:op,reason:'Ошибка назначения'};
 assert.throws(()=>schedule(x,{...reverse,reason:''}),/причину/);schedule(x,reverse);schedule(x,reverse);assert.equal(p.entries.length,2);assert.equal(p.entries[1].attendance.status,'reversed');
 const data=schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'});assert.equal(data.amount,0);assert.equal(data.count,0);assert.equal(data.rows[0].reason,'Ошибка назначения');
 worked(x);assert.equal(p.entries.length,2);assert.equal(schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'}).amount,0);
 assert.throws(()=>schedule(x,{...reverse,reason:'Другая причина'}),/ID операции/);
});
test('payroll rejects stale confirmations and unresolved replacements; records survive schedule deletion',()=>{
 const x=setup(),p=privatePay(x);pastShift(x);
 assert.throws(()=>worked(x,shiftId,giftOp,1,'old'),/изменена/);assert.equal(p.entries.length,0);
 x.db.ops_v3.schedule[1][shiftId].swap={from:'Анна',to:'Борис',status:'requested'};assert.throws(()=>worked(x),/замену/);delete x.db.ops_v3.schedule[1][shiftId].swap;worked(x);delete x.db.ops_v3.schedule[1][shiftId];
 assert.equal(schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'}).amount,4200);
});
test('test payroll ledger remains separate and does not write production schedules or payroll',()=>{
 const x=setup(),p=privatePay(x);pastShift(x);x.put('/ops_v3_test/schedule',x.db.ops_v3.schedule);x.writes.length=0;x.ctx.req={...x.owner,action:'confirmWorkedShift',shiftId,revision:op,operationId:giftOp};vm.runInContext("handleSchedule_(req,'/ops_v3_test',props)",x.ctx);
 assert.equal(p.entries.length,1);assert.ok(p.ledgers['/ops_v3_test'].current['1:'+shiftId]);assert.equal(Object.keys(p.ledgers['/ops_v3'].current).length,0);assert.equal(x.writes.length,0);
});
test('Moscow shift end controls same-day confirmation and the shared script lock covers payroll writes',()=>{
 const x=setup();privatePay(x);schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date:'2026-10-19',start:'08:00',end:'13:00',name:'Анна'});assert.throws(()=>worked(x),/не закончилась/);
 schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:'d'.repeat(32),revision:op,date:'2026-10-19',start:'08:00',end:'11:00',name:'Анна'});
 let locked=false;x.ctx.LockService={getScriptLock:()=>({waitLock(){locked=true;},releaseLock(){locked=false;}})};x.ctx.payAppend=(store,event)=>{assert.equal(locked,true);store.operations[event.operationId]=copy(event);store.current[event.key]=copy(event);};vm.runInContext('teamPayrollAppend_=payAppend;',x.ctx);
 x.ctx.req={...x.owner,action:'confirmWorkedShift',shiftId,operationId:giftOp,revision:'d'.repeat(32)};vm.runInContext("handleTeamRequest_(req,'/ops_v3',props)",x.ctx);assert.equal(locked,false);
});
test('private payroll storage is lazy, rejects public sharing and isolates production from tests',()=>{
 const x=setup();x.ctx.propertyMap={};x.ctx.privateProps={getProperty:k=>x.ctx.propertyMap[k]};x.ctx.created=0;x.ctx.SpreadsheetApp={create(){x.ctx.created++;throw Error('unexpected create');}};
 vm.runInContext("teamPayrollStore_(privateProps,'/ops_v3',false)",x.ctx);assert.equal(x.ctx.created,0);
 x.ctx.propertyMap.PAYROLL_SPREADSHEET_ID='prod';x.ctx.propertyMap.PAYROLL_TEST_SPREADSHEET_ID='prod';assert.throws(()=>vm.runInContext("teamPayrollStore_(privateProps,'/ops_v3_test',false)",x.ctx),/отдельная/);
 x.ctx.DriveApp={Access:{PRIVATE:'private'},getFileById:()=>({getSharingAccess:()=> 'public'})};assert.throws(()=>vm.runInContext("teamPayrollStore_(privateProps,'/ops_v3',false)",x.ctx),/закрыта/);
});

test('private spreadsheet persists append-only payroll and retries after a lost flush acknowledgement do not double-count',()=>{
 const x=setup(),properties={ADMIN_PASSWORD:'owner'},cells=[];let sheet=null,created=0,failFlush=true;
 const fakeSheet={appendRow(row){cells.push(copy(row));},setFrozenRows(){},getLastRow:()=>cells.length,getRange(row,col,height=1,width=1){return {getValue:()=>cells[row-1]?.[col-1],getValues:()=>cells.slice(row-1,row-1+height).map(x=>x.slice(col-1,col-1+width))};}};
 const book={getId:()=> 'private-payroll',getSheetByName:()=>sheet,insertSheet(){return sheet=fakeSheet;}};
 x.ctx.props={getProperty:k=>properties[k]};x.ctx.PropertiesService={getScriptProperties:()=>({setProperty:(k,v)=>{properties[k]=v;}})};
 x.ctx.SpreadsheetApp={create(){created++;return book;},openById(id){assert.equal(id,'private-payroll');return book;},flush(){if(failFlush){failFlush=false;throw Error('lost acknowledgement');}}};
 x.ctx.DriveApp={Access:{PRIVATE:'private'},getFileById:()=>({getSharingAccess:()=> 'private'})};
 pastShift(x);const empty=schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'});assert.equal(empty.amount,0);assert.equal(created,0);
 assert.throws(()=>worked(x),/lost acknowledgement/);assert.equal(created,1);assert.equal(properties.PAYROLL_SPREADSHEET_ID,'private-payroll');assert.equal(cells.length,2);
 worked(x);assert.equal(cells.length,2);assert.equal(schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'}).amount,4200);
 schedule(x,{...x.owner,action:'reverseWorkedShift',shiftId,operationId:'d'.repeat(32),revision:op,reason:'Исправление ошибки'});
 assert.equal(cells.length,3);assert.equal(cells[1][9],4200);assert.equal(cells[2][9],-4200);assert.equal(schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'}).amount,0);assert.ok(!JSON.stringify(cells).includes('password'));assert.ok(!JSON.stringify(x.db.ops_v3.schedule).includes('4200'));
 schedule(x,{...x.owner,action:'addShiftPenalty',shiftId,revision:op,operationId:'e'.repeat(32),amount:200,reason:'Ручная отметка'});assert.equal(cells[3][9],-200);assert.equal(schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'}).amount,-200);
 schedule(x,{...x.owner,action:'reverseShiftPenalty',shiftId,originalId:'e'.repeat(32),operationId:'f'.repeat(32),reason:'Отмена ошибки'});assert.equal(cells[4][9],200);assert.equal(schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-18'}).amount,0);
});

test('readiness reads nested payroll week and employee data without truncating the acknowledgement',()=>{
 const x=setup();x.ctx.html='<script>window.top.postMessage('+JSON.stringify({ok:true,week:{start:'2026-10-19',end:'2026-10-25'},rows:[{name:'Анна',amount:4200}]})+',"https://foxkiss1997-hash.github.io");</script>';
 const ack=vm.runInContext('readOpsReadinessAck_(html,"https://foxkiss1997-hash.github.io")',x.ctx);assert.equal(ack.ok,true);assert.equal(ack.week.end,'2026-10-25');assert.equal(ack.rows[0].amount,4200);
});

function attendanceSetup(start='11:55'){
 const x=setup(),p=privatePay(x);x.ctx.payAppend=(store,event)=>{const e=copy(event);store.operations[e.operationId]=e;if(!e.kind)store.current[e.key]=e;p.entries.push(e);};
 x.ctx.photoSave=()=> 'https://drive.google.com/file/d/private/view';vm.runInContext('teamPayrollAppend_=payAppend;teamAttendancePhoto_=photoSave;',x.ctx);
 schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date:'2026-10-19',start,end:'21:00',name:'Анна'});
 const begin=(extra={})=>schedule(x,{...x.staff,action:'beginShiftOpening',shiftId,operationId:giftOp,...extra});
 const finish=(extra={})=>schedule(x,{...x.staff,action:'finishShiftOpening',shiftId,sessionId:giftOp,operationId:'d'.repeat(32),photo:'camera-only',...extra});
 return {...x,p,begin,finish};
}
test('late thresholds use exact server milliseconds at 5 and 15 minutes',()=>{
 const x=setup();for(const [ms,amount]of [[-1,0],[299999,0],[300000,200],[899999,200],[900000,1000],[1200000,1000],[99999999,1000]]){x.ctx.ms=ms;assert.equal(vm.runInContext('teamLatePenalty_(ms)',x.ctx),amount);}
});
test('opening needs photo completion, freezes server button time and deducts once, with private totals',()=>{
 const x=attendanceSetup();const b=x.begin({openedAt:0,lateMinutes:0,amount:0});assert.equal(b.openedAt,Date.parse('2026-10-19T09:00:00Z'));
 let data=schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-19'});assert.equal(data.penaltyTotal,0);assert.equal(data.openings.length,0);
 x.finish();x.finish();data=schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-19'});assert.equal(data.penaltyTotal,200);assert.equal(data.amount,-200);assert.equal(data.openings[0].lateMinutes,5);assert.equal(x.p.entries.length,2);assert.equal(x.writes.length,1);
 const other=schedule(x,{...x.staff,submittedBy:'Борис',auth:{password:'other'},action:'listPayroll',date:'2026-10-19'});assert.equal(other.penalties.length,0);assert.equal(other.openings.length,0);
 assert.throws(()=>schedule(x,{...x.owner,action:'cancelShift',shiftId,operationId:'f'.repeat(32),revision:op}),/уже открыта/);
});
test('session cannot bypass photo, identity, expiry, assignment or shift date',()=>{
 const x=attendanceSetup('11:45');assert.throws(()=>x.finish(),/истекло/);assert.throws(()=>x.begin({submittedBy:'Борис',auth:{password:'other'}}),/назначенный/);assert.throws(()=>x.begin({...x.owner}),/назначенный/);
 x.begin();x.ctx.photoSave=()=>{throw Error('Нет фото')};vm.runInContext('teamAttendancePhoto_=photoSave;',x.ctx);assert.throws(()=>x.finish(),/Нет фото/);assert.equal(x.p.entries.length,1);
 x.p.ledgers['/ops_v3'].operations[giftOp].detail.expiresAt=0;assert.throws(()=>x.finish(),/истекло/);
});
test('new begin operations reuse unexpired session rather than moving arrival time',()=>{
 const x=attendanceSetup();x.begin();const b=x.begin({operationId:'e'.repeat(32)});assert.equal(b.sessionId,giftOp);assert.equal(x.p.entries.length,1);
 x.p.ledgers['/ops_v3'].operations[giftOp].detail.expiresAt=0;const c=x.begin({operationId:'f'.repeat(32)});assert.equal(c.sessionId,'f'.repeat(32));assert.equal(x.p.entries.length,2);
});
test('admin manual penalty and cancellation are reasoned, authenticated and idempotent',()=>{
 const x=attendanceSetup('11:45');x.begin();x.finish();const request={...x.owner,action:'addShiftPenalty',shiftId,revision:op,operationId:'e'.repeat(32),amount:300,reason:'Нарушение регламента'};
 assert.throws(()=>schedule(x,{...request,...x.staff}),/администратор/);assert.throws(()=>schedule(x,{...request,amount:1.5}),/целым/);assert.throws(()=>schedule(x,{...request,reason:''}),/причину/);
 schedule(x,request);schedule(x,request);let data=schedule(x,{...x.owner,action:'listPayroll',date:'2026-10-19'});assert.equal(data.penaltyTotal,1300);
 const reverse={...x.owner,action:'reverseShiftPenalty',shiftId,originalId:'d'.repeat(32),operationId:'f'.repeat(32),reason:'Сбой кассы, штраф отменён'};schedule(x,reverse);schedule(x,reverse);data=schedule(x,{...x.staff,action:'listPayroll',date:'2026-10-19'});assert.equal(data.penaltyTotal,300);assert.equal(data.penalties.find(x=>x.id==='d'.repeat(32)).reversed,true);
 assert.throws(()=>schedule(x,{...reverse,operationId:'1'.repeat(32)}),/уже отменён/);assert.equal(x.p.entries.length,4);
});
test('photo validation rejects uploads that cannot be a fresh camera JPEG before creating files',()=>{
 const x=setup();for(const photo of ['', 'data:image/png;base64,AAAA','data:image/jpeg;base64,%%%%','data:image/jpeg;base64,'+'A'.repeat(2400001)]){x.ctx.photoRequest={photo};assert.throws(()=>vm.runInContext("teamAttendancePhoto_(photoRequest,props,'/ops_v3')",x.ctx),/фото/);}
});

test('point business hours distinguish weekdays Saturday and Sunday in Moscow dates',()=>{
 const x=setup();for(const [shopId,date,start,end]of [[1,'2026-10-19','08:00','20:00'],[1,'2026-10-24','09:00','21:00'],[1,'2026-10-25','09:00','21:00'],[2,'2026-10-19','08:00','21:00'],[2,'2026-10-24','10:00','22:00'],[2,'2026-10-25','10:00','22:00']]){x.ctx.shopId=shopId;x.ctx.date=date;const h=vm.runInContext('teamBusinessHours_(shopId,date)',x.ctx);assert.equal(h.start,start);assert.equal(h.end,end);}
});
function assignment(x,extra={}){return {...x.owner,action:'assignShifts',operationId:'f'.repeat(32),name:'Анна',items:[19,20,21,22,23,24,25,26].map((d,i)=>({shiftId:(i+1).toString(16).repeat(32),revision:'',date:'2026-10-'+d,start:'00:00',end:'01:00'})),...extra};}
test('owner assigns eight days atomically as approved with authoritative hours; employee calendar sees them without approval',()=>{
 const x=setup(),request=assignment(x,{shopId:2});const result=schedule(x,request);assert.equal(result.rows.length,8);assert.equal(x.writes.length,1);assert.equal(result.rows[0].status,'approved');assert.equal(result.rows[0].start,'08:00');assert.equal(result.rows[0].end,'21:00');assert.equal(result.rows[5].start,'10:00');assert.equal(result.rows[5].end,'22:00');schedule(x,request);assert.equal(x.writes.length,1);
 const staff=schedule(x,{...x.staff,shopId:2,auth:{password:'second'},action:'listSchedule'});assert.equal(staff.myRows.length,8);assert.ok(staff.myRows.every(x=>x.status==='approved'));assert.equal(JSON.stringify(staff).includes('password'),false);
 const opening=schedule(x,{...x.staff,shopId:2,auth:{password:'second'},action:'listShiftOpening'});assert.equal(opening.rows.length,1);assert.equal(opening.rows[0].start,'08:00');
});
test('batch assignment rejects staff access, past dates, duplicate dates and inactive employees without writes',()=>{
 for(const extra of [{...setup().staff},{name:'Нет сотрудника'},{items:[{shiftId,revision:'',date:'2026-10-18'}]},{items:[{shiftId,revision:'',date:'2026-10-20'},{shiftId:op,revision:'',date:'2026-10-20'}]}]){const x=setup();assert.throws(()=>schedule(x,assignment(x,extra)));assert.equal(x.writes.length,0);}
 const x=setup();x.db.staff[1].one.active=false;assert.throws(()=>schedule(x,assignment(x)),/найден|активен/);assert.equal(x.writes.length,0);
});
test('a conflict on the last selected date preserves the whole schedule and another employee assignment',()=>{
 const x=setup();pastShift(x,'e'.repeat(32),'2026-10-26','Борис');const before=JSON.stringify(x.db.ops_v3.schedule),count=x.writes.length;assert.throws(()=>schedule(x,assignment(x)),/уже|занят/);assert.equal(x.writes.length,count);assert.equal(JSON.stringify(x.db.ops_v3.schedule),before);
});
test('cross-point overlaps, stale revisions and open-shift conflicts reject entire owner assignment',()=>{
 const x=setup();pastShift(x,'e'.repeat(32),'2026-10-26','Анна',2);let count=x.writes.length;assert.throws(()=>schedule(x,assignment(x)),/уже есть смена/);assert.equal(x.writes.length,count);
 const y=setup();pastShift(y,shiftId,'2026-10-20');count=y.writes.length;assert.throws(()=>schedule(y,assignment(y,{items:[{shiftId,revision:'',date:'2026-10-20'}]})),/изменена/);assert.equal(y.writes.length,count);
});
test('owner may assign an existing open slot; payroll lock protects opened shifts and batch retries survive an opened shift',()=>{
 const x=setup(),p=privatePay(x);schedule(x,{...x.owner,action:'saveShift',shiftId,operationId:op,date:'2026-10-24',start:'09:00',end:'21:00',name:''});const req=assignment(x,{items:[{shiftId,revision:op,date:'2026-10-24'}]});schedule(x,req);const count=x.writes.length;
 p.ledgers['/ops_v3'].operations['a'.repeat(32)]={kind:'attendance',key:'1:'+shiftId,action:'finishShiftOpening'};schedule(x,req);assert.equal(x.writes.length,count);assert.throws(()=>schedule(x,{...req,operationId:'d'.repeat(32),items:[{shiftId,revision:'f'.repeat(32),date:'2026-10-24'}]}),/уже открыта/);
});
test('owner assignment respects test root isolation',()=>{
 const x=setup();x.ctx.req=assignment(x);vm.runInContext("handleSchedule_(req,'/ops_v3_test',props)",x.ctx);assert.equal(x.db.ops_v3,undefined);assert.equal(Object.keys(x.db.ops_v3_test.schedule[1]).length,8);assert.ok(x.writes.every(x=>x.startsWith('/ops_v3_test/')));
});

test('readiness unwraps Google HTML one layer at a time without corrupting batch fingerprints or quoted names',()=>{
 const x=setup(),ack={ok:true,nonce:'a'.repeat(32),rows:[{name:'Анна "Тест"',history:{batch:JSON.stringify({name:'Анна',items:[{date:'2026-10-19'}]}),note:'C:\\report'}}]},html='<script>window.top.postMessage('+JSON.stringify(ack)+',"https://foxkiss1997-hash.github.io");</script>';
 for(const body of [html,JSON.stringify(html),JSON.stringify(JSON.stringify(html))]){x.ctx.responseBody=body;const result=vm.runInContext('readOpsReadinessAck_(responseBody,"https://foxkiss1997-hash.github.io")',x.ctx);assert.equal(result.rows[0].history.batch,ack.rows[0].history.batch);assert.equal(result.rows[0].name,ack.rows[0].name);assert.equal(result.rows[0].history.note,ack.rows[0].history.note);}
});
