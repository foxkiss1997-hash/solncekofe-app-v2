const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function app(){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://foxkiss1997-hash.github.io/solncekofe-app-v2/preorder.html?lid=DEMO',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,c=dom.getInternalVMContext();w.fetch=async()=>reply(null);w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.AbortController=AbortController;
 const timers=new Map();let n=0;w.setInterval=fn=>{timers.set(++n,fn);return n};w.clearInterval=id=>timers.delete(id);
 const run=s=>vm.runInContext(s,c);
 for(const p of ['operations-v3.js','stable-ui.js','team-loyalty.js','menu-photos.js','menu-experience.js'])run(fs.readFileSync(p,'utf8'));
 run([...fs.readFileSync('preorder.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n').split('/* ---------- INIT ---------- */')[0]);
 run("render=()=>{};shopStatus=()=>({open:true});itemStopped=()=>false;state.screen='checkout';state.receiptContact='test@example.org';state.cart=[{uid:'one',itemId:'cap',category:'coffee',name:'Капучино',unitPrice:300,qty:1,sizeId:'m'}];");
 timers.clear();
 const pending={orderId:'ORDER_1',number:'123',paymentUrl:'https://securepayments.tinkoff.ru/demo',shop:{id:1,name:'Рязанский проспект'},cartSnapshot:JSON.parse(run('JSON.stringify(state.cart)')),total:300};
 const save=()=>w.localStorage.setItem('sk_pending_payment',JSON.stringify(pending));
 return {w,run,timers,pending,save,close:()=>dom.window.close()};
}
const reply=(data,ok=true,status=200)=>({ok,status,json:async()=>data});

function order(f,status='accepted'){f.run("Object.assign(state,{screen:'status',order:{firebaseId:'ORDER',number:'766',status:"+JSON.stringify(status)+",shop:{id:1,name:'Точка',addr:'Адрес'},shopId:1,pickupLabel:'Скоро',prepMinutes:6,acceptedAt:Date.now()-60000}})");}
test('a ready order renders readiness immediately after reload, with no six-minute countdown',()=>{
 const f=app();try{order(f,'done');f.w.document.getElementById('app').innerHTML=f.w.renderStatus();f.w.initStatusTicker();assert.match(f.w.document.body.textContent,/Готово к выдаче/);assert.equal(f.w.document.getElementById('etaNum'),null);assert.ok(f.w.document.getElementById('readyBlock').classList.contains('show'));assert.equal(f.w.document.querySelectorAll('.station.done').length,3);assert.equal(f.run('statusTimer'),null);}finally{f.close()}
});
test('elapsed preparation estimate never announces readiness without staff confirmation',()=>{
 const f=app();try{order(f);f.run('state.order.acceptedAt=Date.now()-20*60000');f.w.document.getElementById('app').innerHTML=f.w.renderStatus();f.w.initStatusTicker();assert.equal(f.w.document.getElementById('etaNum').textContent,'Готовим');assert.equal(f.w.document.getElementById('readyBlock').classList.contains('show'),false);assert.equal(f.w.document.getElementById('st2').classList.contains('done'),false);assert.match(f.w.document.getElementById('etaLabel').textContent,/ещё немного/);}finally{f.close()}
});
test('normal accepted order counts down from acceptance and starts no countdown while new',()=>{
 const f=app();try{order(f);f.w.document.getElementById('app').innerHTML=f.w.renderStatus();f.w.initStatusTicker();assert.match(f.w.document.getElementById('etaNum').textContent,/5/);order(f,'new');f.w.document.getElementById('app').innerHTML=f.w.renderStatus();f.w.initStatusTicker();assert.equal(f.run('statusTimer'),null);assert.equal(f.w.document.getElementById('etaNum'),null);}finally{f.close()}
});
test('guest polling applies completion metadata and re-renders as ready',async()=>{
 const f=app();try{order(f);f.w.fetch=async()=>reply({status:'done',completedBy:'Анна',completedAt:123,prepMinutes:6});await f.w.pollOrderStatus();assert.equal(f.run('state.order.status'),'done');assert.equal(f.run('state.order.completedBy'),'Анна');assert.equal(f.run('state.order.completedAt'),123);assert.match(f.w.renderStatus(),/Готово к выдаче/);}finally{f.close()}
});
test('late response for another order cannot overwrite the current order',async()=>{
 const f=app();try{order(f);let finish;f.w.fetch=()=>new Promise(r=>finish=r);const p=f.w.pollOrderStatus();f.run("state.order.firebaseId='OTHER'");finish(reply({status:'done'}));await p;assert.equal(f.run('state.order.status'),'accepted');}finally{f.close()}
});
test('a second tap cannot submit readiness twice and an acknowledged save preserves other fields',async()=>{
 const f=app();try{f.run("state.staffShop=1;state.staffName='Анна';loadStaffOrders=async()=>{}");let finish,writes=0;f.w.fetch=async(url,options={})=>{if(options.method==='PUT'){writes++;const o=JSON.parse(options.body);assert.equal(o.status,'done');assert.equal(o.paid,true);return reply(o)}return new Promise(r=>finish=r)};
 const p=f.w.markOrderDone('ORDER');await f.w.markOrderDone('ORDER');finish({...reply({shopId:1,status:'accepted',paid:true}),headers:{get:()=> '"v1"'}});await p;assert.equal(writes,1);assert.equal(f.run('state.orderActionError'),'');}finally{f.close()}
});
test('failed or conflicting readiness save stays an error instead of a false success',async()=>{
 const f=app();try{f.run("state.staffShop=1;state.staffName='Анна';loadStaffOrders=async()=>{}");f.w.fetch=async(url,options={})=>options.method==='PUT'?reply(null,false,412):{...reply({shopId:1,status:'accepted'}),headers:{get:()=> '"v1"'}};await f.w.markOrderDone('ORDER');assert.match(f.run('state.orderActionError'),/другом устройстве/);assert.equal(f.run('state.orderActionBusy'),null);}finally{f.close()}
});
test('accept cannot regress a ready order or reset its acceptance timestamp',async()=>{
 const f=app();try{f.run("state.staffShop=1;state.staffName='Анна';loadStaffOrders=async()=>{}");let writes=0;f.w.fetch=async(url,options={})=>{if(options.method)writes++;return {...reply({shopId:1,status:'done',acceptedAt:1}),headers:{get:()=> '"v1"'}}};await f.w.acceptOrder('ORDER');assert.equal(writes,0);assert.match(f.run('state.orderActionError'),/уже изменился/);}finally{f.close()}
});
