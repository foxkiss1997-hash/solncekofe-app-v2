const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function app(){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://foxkiss1997-hash.github.io/solncekofe-app-v2/preorder.html?lid=DEMO',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,c=dom.getInternalVMContext();w.fetch=async()=>reply(null);w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.AbortController=AbortController;
 const timers=new Map();let n=0;w.setInterval=fn=>{timers.set(++n,fn);return n};w.clearInterval=id=>timers.delete(id);
 const run=s=>vm.runInContext(s,c);
 for(const p of ['operations-v3.js','stable-ui.js','team-loyalty.js','menu-photos.js','menu-experience.js'])run(fs.readFileSync(p,'utf8'));
 run([...fs.readFileSync('preorder.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n').split('/* ---------- INIT ---------- */')[0]);
 run("render=()=>{};shopStatus=()=>({open:true});state.screen='checkout';state.receiptContact='test@example.org';state.cart=[{uid:'one',itemId:'cap',category:'coffee',name:'Капучино',unitPrice:300,qty:1,sizeId:'m'}];");
 timers.clear();
 const pending={orderId:'ORDER_1',number:'123',paymentUrl:'https://securepayments.tinkoff.ru/demo',shop:{id:1,name:'Рязанский проспект'},cartSnapshot:JSON.parse(run('JSON.stringify(state.cart)')),total:300};
 const save=()=>w.localStorage.setItem('sk_pending_payment',JSON.stringify(pending));
 return {w,run,timers,pending,save,close:()=>dom.window.close()};
}
const reply=(data,ok=true,status=200)=>({ok,status,json:async()=>data});

function staff(f){f.run("Object.assign(state,{screen:'staff',opMode:'stock',staffShop:2,staffName:'Анна',reportPassword:'pass',staffStockReady:true});state.staffStockIdentity=stockIdentity();shopStopLists={1:{cap:true},2:{}};");}
test('staff have a visible stop-list entry and controls for their own shop',()=>{
 const f=app();try{staff(f);assert.match(f.w.renderStaff(),/Стоп-лист меню/);const s=f.w.renderStaffStock();assert.match(s,/Нагатинская/);assert.match(s,/В стоп-лист/);assert.doesNotMatch(s,/menu-admin-stock-shop/);}finally{f.close()}
});
test('stopping and restoring an item sends authenticated explicit intent and preserves the other shop',async()=>{
 const f=app();try{staff(f);let payload;f.w.fetch=async(url,options)=>{payload=JSON.parse(options.body);return reply({ok:true,shopId:2,itemId:'cap',stopped:payload.stopped})};await f.w.staffSetAvailability('cap');assert.equal(payload.shopId,2);assert.equal(payload.auth.password,'pass');assert.equal(payload.stopped,true);assert.equal(f.run('itemStopped("cap",2)'),true);assert.equal(f.run('itemStopped("cap",1)'),true);await f.w.staffSetAvailability('cap');assert.equal(payload.expectedStopped,true);assert.equal(payload.stopped,false);assert.equal(f.run('itemStopped("cap",2)'),false);assert.equal(f.run('itemStopped("cap",1)'),true);}finally{f.close()}
});
test('failed saves retain availability and show an error; no optimistic success',async()=>{
 const f=app();try{staff(f);f.w.fetch=async()=>reply({error:'Нет доступа'},false,403);await f.w.staffSetAvailability('cap');assert.equal(f.run('itemStopped("cap",2)'),false);assert.match(f.run('state.staffStockMessage'),/Нет доступа/);assert.equal(f.run('state.staffStockOk'),false);}finally{f.close()}
});
test('an employee cannot remove a global stop and unauthenticated guests cannot submit changes',async()=>{
 const f=app();try{staff(f);f.run("STOP_LIST.add('cap')");let calls=0;f.w.fetch=async()=>{calls++;return reply(null)};await f.w.staffSetAvailability('cap');assert.equal(calls,0);assert.match(f.w.renderStaffStock(),/Стоп администратора/);f.run("STOP_LIST.clear();state.screen='menu'");await f.w.staffSetAvailability('cap');assert.equal(calls,0);}finally{f.close()}
});
test('double taps submit one request and an identity change never updates the new shop',async()=>{
 const f=app();try{staff(f);let finish,calls=0;f.w.fetch=()=>{calls++;return new Promise(r=>finish=r)};const p=f.w.staffSetAvailability('cap');await f.w.staffSetAvailability('cap');assert.equal(calls,1);f.run("state.staffShop=1;state.staffName='Борис';state.staffStockMessage='Новый вход'");finish(reply({ok:true,shopId:2,itemId:'cap',stopped:true}));await p;assert.equal(f.run('state.staffStockMessage'),'Новый вход');assert.equal(f.run('shopStopLists[2].cap'),true);}finally{f.close()}
});
test('search, category and only-stopped filters narrow the staff menu',()=>{
 const f=app();try{staff(f);f.run("state.staffStockSearch='Капучино'");assert.match(f.w.renderStaffStock(),/Капучино/);assert.doesNotMatch(f.w.renderStaffStock(),/<b>Латте<\/b>/);f.run("state.staffStockSearch='';state.staffStockCategory='stopped';shopStopLists[2]={cap:true}");const s=f.w.renderStaffStock();assert.match(s,/<b>Капучино<\/b>/);assert.doesNotMatch(s,/<b>Латте<\/b>/);}finally{f.close()}
});
test('guest menu refresh updates availability without losing cart items; checkout is disabled for stopped items',async()=>{
 const f=app();try{f.w.fetch=async url=>reply(url.includes('shop_stoplist')?{1:{cap:true}}:{});await f.w.refreshMenuAvailability();assert.equal(f.run('itemStopped("cap",1)'),true);assert.equal(f.run('state.cart.length'),1);assert.match(f.w.renderCheckout(),/стоп-листе/);assert.match(f.w.renderCheckout(),/data-action="pay" disabled/);assert.match(f.w.renderCart(),/data-action="go-checkout" disabled/);}finally{f.close()}
});
test('failed stock refresh preserves the last known availability and concurrent reads share a request',async()=>{
 const f=app();try{f.run('shopStopLists={1:{cap:true}}');let calls=0;f.w.fetch=async()=>{calls++;return reply(null,false,503)};await Promise.all([f.w.refreshMenuAvailability(),f.w.refreshMenuAvailability()]);assert.equal(calls,2);assert.equal(f.run('itemStopped("cap",1)'),true);}finally{f.close()}
});
