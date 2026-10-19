/* Only loaded by preview.html. All database requests and form submissions are isolated. */
window.SOLNCE_PREVIEW=true;
const previewToday=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const demoGuest={name:'',stamps:5,bonusBalance:100,bonusSpins:0,vouchers:{DEMO_GIFT:{label:'Классический кофе M',type:'free_item',redeemed:false}},loyaltyHistory:{}};
const previewDb={
 '/guests/DEMO.json':demoGuest,
 '/menu.json':{farmer:{category:'pizza',name:'Крестьянская',price:750},carbonara:{category:'pizza',name:'Карбонара',price:750}},
 '/menu_overrides.json':{raforange:{seasonal:true},ppcheesecake:{name:'ПП Сникерс',sizes:{m:330}},ppbrownie:{name:'ПП Кето шоколад',sizes:{m:330}},ppenergy:{name:'Банан карамель',sizes:{m:330}}},
 '/stoplist.json':{},'/shop_stoplist.json':{1:{esptonik:true},2:{}},'/shop_photos.json':{},'/orders.json':{},
 '/ops_v3/checklist_config.json':{},'/wheel_prizes.json':null,
 '/staff/1.json':{demo:{name:'Анна',password:'preview-pass',active:true}},'/staff/2.json':{demo:{name:'Анна',password:'preview-pass',active:true}}
};
const previewNativeFetch=window.fetch.bind(window);
window.fetch=async function(input,options={}){
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.hostname.includes('firebaseio.com')){
  const method=(options.method||'GET').toUpperCase();
  if(method!=='GET'){throw Error('Запись в рабочую базу отключена в демонстрации.');}
  return new Response(JSON.stringify(previewDb[url.pathname]??null),{status:200,headers:{'Content-Type':'application/json'}});
 }
 if(url.hostname.includes('workers.dev')||url.hostname.includes('onrender.com')||url.hostname.includes('script.google'))throw Error('Внешние операции отключены в демонстрации.');
 return previewNativeFetch(input,options);
};
HTMLFormElement.prototype.submit=function(){throw Error('Отправка форм в рабочие сервисы отключена в демонстрации.');};
window.previewRequest=async function(body){
 const guest={name:'Демо-гость',stamps:demoGuest.stamps,bonusBalance:demoGuest.bonusBalance,vouchers:Object.entries(demoGuest.vouchers).filter(([,x])=>!x.redeemed).map(([id,x])=>({id,...x})),history:Object.entries(demoGuest.loyaltyHistory).map(([id,x])=>({id,...x}))};
 if(body.action==='teamOverview')return window.previewOverview;
 if(body.action==='listSchedule')return window.previewSchedule;
 if(body.action==='assignShifts')throw Error('Демонстрация: рабочие смены не назначаются.');
 if(body.action==='listPayroll')return window.previewPayroll;
 if(body.action==='listShiftOpening')return {rows:[{id:'a'.repeat(32),date:previewToday,start:'08:00',end:'21:00',name:'Анна',opened:null}]};
 if(body.action==='authorizeAdmin')return {authorized:true};
 if(body.action==='loyaltyLookup')return {guest};
 if(body.action==='redeemGift'){
  const gift=demoGuest.vouchers[body.voucherId];if(!gift||gift.redeemed)throw Error('Демо-подарок уже использован.');gift.redeemed=true;demoGuest.loyaltyHistory[body.operationId]={action:'redeemGift',label:gift.label,at:Date.now(),actor:'Анна',shopId:2};
  return {guest:{...guest,vouchers:[],history:Object.entries(demoGuest.loyaltyHistory).map(([id,x])=>({id,...x}))},operationId:body.operationId};
 }
 if(body.action==='awardStamp'){demoGuest.stamps=(demoGuest.stamps+1)%7;return {guest:{...guest,stamps:demoGuest.stamps}};}
 if(body.action==='createPickupOrder')throw Error('Демонстрация: заказ не отправлен и деньги не списывались.');
 throw Error('Демонстрация: рабочие данные не изменяются.');
};
window.previewOverview={date:previewToday,rows:[{shopId:1,revenue:28400,expense:2200,photoReports:2,issues:0,staff:[{name:'Анна',start:'08:00',end:'16:00'}],cashDifference:0,unpaidDeliveries:0},{shopId:2,revenue:20200,expense:4000,photoReports:0,issues:1,staff:[{name:'Иван',start:'16:00',end:'21:00'}],cashDifference:null,unpaidDeliveries:1}]};
window.previewSchedule={rows:[{id:'a'.repeat(32),revision:'b'.repeat(32),date:previewToday,start:'08:00',end:'16:00',name:'Анна',status:'approved'},{id:'c'.repeat(32),revision:'d'.repeat(32),date:previewToday,start:'16:00',end:'21:00',name:'',status:'open'}],staff:['Анна','Иван']};
window.previewSchedule.myRows=[{id:'a'.repeat(32),shopId:2,name:'Анна',date:previewToday,start:'08:00',end:'16:00',status:'approved'},...[20,22,25,28].map(day=>({id:'demo'+day,shopId:day===25?1:2,name:'Анна',date:previewToday.slice(0,8)+day,start:'08:00',end:'16:00',status:day===28?'pending':'approved'}))];
window.previewSchedule.teamRows=[...window.previewSchedule.myRows.filter(x=>x.status==='approved'),{id:'demo-ivan',shopId:2,name:'Иван',date:previewToday.slice(0,8)+'20',start:'16:00',end:'21:00',status:'approved'},{id:'demo-other',shopId:1,name:'Борис',date:previewToday.slice(0,8)+'20',start:'08:00',end:'20:00',status:'approved'}];
window.previewSchedule.rows.push(...[{id:'e'.repeat(32),revision:'f'.repeat(32),date:previewToday.slice(0,8)+'21',start:'08:00',end:'21:00',name:'Иван',status:'approved'},{id:'1'.repeat(32),revision:'2'.repeat(32),date:previewToday.slice(0,8)+'23',start:'08:00',end:'21:00',name:'',status:'open'}]);
window.previewPayroll={week:{start:'2026-10-12',end:'2026-10-18',payDate:'2026-10-18'},rate:4200,count:5,amount:21000,totals:[{name:'Анна',count:5,amount:21000}],awaiting:[{id:'e'.repeat(32),shopId:2,date:'2026-10-18',start:'08:00',end:'21:00',name:'Иван',revision:'f'.repeat(32)}],rows:[12,13,14,16,17].map((day,i)=>({id:String(i+1).repeat(32),shopId:i===3?1:2,date:'2026-10-'+day,start:'08:00',end:'21:00',name:'Анна',status:'worked',rate:4200,amount:4200,revision:'b'.repeat(32)}))};
window.previewSetup=function(state,team){
 const query=new URLSearchParams(location.search),role=query.get('role');state.shopId=2;
 if(query.has('fines')){const p=window.previewPayroll;p.gross=21000;p.penaltyTotal=1200;p.amount=19800;p.totals[0].amount=19800;p.penalties=[{id:'a'.repeat(32),shiftId:'1'.repeat(32),shopId:2,name:'Анна',date:'2026-10-12',amount:200,reason:'Опоздание: 7 мин.',automatic:true},{id:'b'.repeat(32),shiftId:'2'.repeat(32),shopId:2,name:'Анна',date:'2026-10-13',amount:1000,reason:'Опоздание: 20 мин.',automatic:true}];p.openings=[{id:'1'.repeat(32),shopId:2,name:'Анна',date:'2026-10-12',openedAt:Date.parse('2026-10-12T08:07:00+03:00'),lateMinutes:7}];}

 if(query.get('view')==='menu-cart')state.cart=[{uid:'demo-cap',itemId:'cap',category:'coffee',name:'Капучино',sizeId:'m',qty:1,unitPrice:300,milk:null,syrup:null,shot:false},{uid:'demo-latte',itemId:'latte',category:'coffee',name:'Латте',sizeId:'m',qty:1,unitPrice:320,milk:null,syrup:null,shot:false}];
 if(query.get('view')==='drink'){state.screen='customize';state.customizeItemId='cap';}
 if(role==='staff'){Object.assign(state,{opMode:query.get('view')==='payroll'?'payroll':query.get('view')==='schedule'?'schedule':null,screen:'staff',staffShop:2,staffName:'Анна',reportPassword:'preview-pass',todayOps:{deliveries:1,expenses:2,issues:0}});if(team){if(query.get('view')==='payroll'){team.payroll=window.previewPayroll;team.payrollDate='2026-10-18';team.payrollKey='Анна:2:2026-10-18';}team.schedule=window.previewSchedule;team.scheduleKey='Анна:2';if(query.get('view')==='schedule')team.calendarDate=previewToday.slice(0,8)+'20';}}
 if(role==='staff'&&['opening','opening-empty','stamp'].includes(query.get('view'))){state.opMode=query.get('view')==='stamp'?'stamp':'opening';if(team){team.openingIdentity='Анна:2';team.openingStatus='ready';team.openingDate=previewToday;team.openingRows=query.get('view')==='opening-empty'?[]:[{id:'a'.repeat(32),date:previewToday,start:'08:00',end:'21:00',name:'Анна',opened:null}];}}
 if(role==='owner'){Object.assign(state,{screen:'admin',adminAuthed:true,adminTab:query.get('view')==='payroll'?'payroll':query.get('view')==='approvals'?'schedule':'overview',teamShop:2,adminPinValue:'preview-owner'});if(team){team.overview=window.previewOverview;if(query.get('view')==='payroll'){team.payroll=window.previewPayroll;team.payrollDate='2026-10-18';team.payrollKey='owner:2:2026-10-18';}if(query.get('view')==='approvals'){team.schedule={staff:['Анна','Иван'],rows:Array.from({length:8},(_,i)=>({id:String(i+1).repeat(32),date:'2026-11-'+String(i+1).padStart(2,'0'),start:'08:00',end:'21:00',name:'Анна',status:'pending',revision:'b'.repeat(32),requestBatchId:'b'.repeat(32)}))};team.scheduleKey='owner:2';}}}
 if(role==='owner'&&query.get('view')==='assign'){state.adminTab='schedule';state.teamShop=Number(query.get('point'))===1?1:2;Object.assign(team,{schedule:{staff:['Анна','Борис'],rows:[],teamRows:[]},scheduleKey:'owner:'+state.teamShop,adminName:'Анна',adminMonth:'2026-11',adminDraftKey:'owner:'+state.teamShop+':Анна',adminDraft:[2,3,4,5,6,7,8,9].map((day,i)=>({shiftId:String(i+1).repeat(32),revision:'',date:'2026-11-'+String(day).padStart(2,'0')}))});}

};
