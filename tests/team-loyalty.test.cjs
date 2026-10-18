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
