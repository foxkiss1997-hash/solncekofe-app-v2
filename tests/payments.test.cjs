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
test('online checkout saves a reusable link, prevents double taps and does not navigate the WebView',async()=>{
 const f=app();try{let finish,calls=0;f.w.fetch=(url)=>url.includes('create-payment')?(calls++,new Promise(r=>finish=r)):Promise.resolve(reply(null));
 const first=f.w.placeOrder();await f.w.placeOrder();assert.equal(calls,1);finish(reply({ok:true,orderId:'ORDER_1',paymentUrl:f.pending.paymentUrl}));await first;
 assert.equal(f.run('state.screen'),'payment');assert.equal(f.run('readPendingPayment().paymentUrl'),f.pending.paymentUrl);assert.match(f.w.location.href,/preorder.html/);
 await f.w.placeOrder();assert.equal(calls,1);
 }finally{f.close()}
});
test('HTTP and non-JSON failures retain cart and show a useful checkout error',async()=>{
 const f=app();try{f.w.fetch=async()=>reply({error:'Терминал не настроен'},false,502);await f.w.placeOrder();assert.match(f.run('state.checkoutError'),/Терминал/);assert.equal(f.run('state.cart.length'),1);
 f.w.fetch=async()=>({ok:true,json:async()=>{throw Error('html')}});await f.w.placeOrder();assert.match(f.run('state.checkoutError'),/некорректный ответ/);assert.equal(f.run('state.payingNow'),false);
 }finally{f.close()}
});
test('request timeout aborts fetch instead of hanging indefinitely',async()=>{
 const f=app();try{f.w.fetch=(url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(Object.assign(Error('timeout'),{name:'AbortError'}))));await assert.rejects(f.w.paymentJson('https://example.org',{},5),{name:'AbortError'});}finally{f.close()}
});
test('unsafe or incomplete payment links are rejected',async()=>{
 const f=app();try{for(const url of ['javascript:alert(1)','http://example.org','https://user:pass@example.org'])assert.equal(f.w.safePaymentUrl(url),'');
 f.w.fetch=async()=>reply({ok:true,paymentUrl:f.pending.paymentUrl});await f.w.placeOrder();assert.match(f.run('state.checkoutError'),/неполную/);assert.equal(f.w.readPendingPayment(),null);
 }finally{f.close()}
});
test('Telegram opens the saved payment link from a separate user click',()=>{
 const f=app();try{f.save();let opened;f.w.Telegram={WebApp:{openLink:url=>opened=url}};f.w.openPendingPayment();assert.equal(opened,f.pending.paymentUrl);}finally{f.close()}
});
test('normal reopen and failed bank return preserve and resume the same payment',()=>{
 const f=app();try{f.save();assert.equal(f.w.checkPaymentReturn(),true);assert.equal(f.run('state.screen'),'payment');f.w.history.replaceState({},'','?failed=1');assert.equal(f.w.checkPaymentReturn(),true);assert.ok(f.w.readPendingPayment());assert.equal(f.run('state.screen'),'payment');}finally{f.close()}
});
test('temporary order-read failure keeps polling; only paid=true finishes the payment',async()=>{
 const f=app();try{f.save();f.run("state.screen='payment';paymentConfirmTimer=setInterval(()=>{},3000)");let mode='fail';
 f.w.fetch=async url=>{if(url.includes('order_lookup'))return reply('FIREBASE_ID');if(mode==='fail')throw Error('offline');return reply({paid:mode==='paid',shopId:1,status:'new',number:'123',createdAt:Date.now()})};
 await f.w.pollPaymentConfirmation('ORDER_1',Date.now()+10000);assert.equal(f.timers.size,1);assert.ok(f.w.readPendingPayment());
 mode='unpaid';await f.w.pollPaymentConfirmation('ORDER_1',Date.now()+10000);assert.ok(f.w.readPendingPayment());assert.equal(f.run('state.order'),null);
 mode='paid';await f.w.pollPaymentConfirmation('ORDER_1',Date.now()+10000);assert.equal(f.w.readPendingPayment(),null);assert.equal(f.run('state.screen'),'status');assert.equal(f.run('state.cart.length'),0);assert.equal(f.timers.size,0);
 }finally{f.close()}
});
test('poll timeout retains recovery information and manual recheck starts polling again',async()=>{
 const f=app();try{f.save();f.run("state.screen='payment'");await f.w.pollPaymentConfirmation('ORDER_1',Date.now()-1);assert.ok(f.w.readPendingPayment());assert.match(f.run('state.paymentMessage'),/сохранены/);f.w.startPaymentConfirmation('ORDER_1',true);assert.equal(f.timers.size,1);}finally{f.close()}
});
test('overlapping checks issue one request and never accept a different shop',async()=>{
 const f=app();try{f.save();let finish,calls=0;f.w.fetch=()=>{calls++;return new Promise(r=>finish=r)};const a=f.w.pollPaymentConfirmation('ORDER_1',Date.now()+10000);await f.w.pollPaymentConfirmation('ORDER_1',Date.now()+10000);assert.equal(calls,1);finish(reply(null));await a;
 f.w.fetch=async url=>reply(url.includes('order_lookup')?'DB_ID':{paid:true,shopId:2});await f.w.pollPaymentConfirmation('ORDER_1',Date.now()+10000);assert.ok(f.w.readPendingPayment());assert.equal(f.run('state.order'),null);
 }finally{f.close()}
});

test('new cart additions survive confirmation of the earlier order',async()=>{
 const f=app();try{f.save();f.run("state.cart.push({uid:'new',unitPrice:100,qty:1})");f.w.fetch=async url=>reply(url.includes('order_lookup')?'DB_ID':{paid:true,shopId:1,status:'new'});await f.w.pollPaymentConfirmation('ORDER_1',Date.now()+10000);assert.equal(f.run('state.cart.length'),2);assert.equal(f.w.readPendingPayment(),null);}finally{f.close()}
});
test('storage quota failure keeps the returned bank link in memory for this session',async()=>{
 const f=app();try{Object.defineProperty(Object.getPrototypeOf(f.w.localStorage),'setItem',{value(){throw Error('quota')}});f.w.fetch=async url=>reply(url.includes('create-payment')?{ok:true,orderId:'ORDER_1',paymentUrl:f.pending.paymentUrl}:null);await f.w.placeOrder();assert.equal(f.run('state.screen'),'payment');assert.equal(f.w.readPendingPayment().paymentUrl,f.pending.paymentUrl);}finally{f.close()}
});
