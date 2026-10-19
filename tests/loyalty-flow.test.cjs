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

const gift={label:'Классический кофе M',type:'free_item',redeemed:false};
function card(f){f.run("LOYALTY_ID='DEMO';state.screen='card'");}
test('one snapshot refresh synchronizes stamps, gifts and spins without writing guest data',async()=>{
 const f=app();try{card(f);let calls=[];f.w.fetch=async(url,opts)=>{calls.push([url,opts]);return reply({stamps:0,bonusSpins:1,vouchers:{FREE:gift}})};await f.w.refreshGuestLoyalty();assert.equal(f.run('state.loyalty'),0);assert.equal(f.run('state.wheelBonusSpins'),1);assert.equal(f.run('availableGuestGifts().length'),1);assert.equal(calls.length,1);assert.equal(calls[0][1].method,undefined);assert.match(f.w.renderCard(),/Подарков к получению: 1/);assert.match(f.w.renderCard(),/Получить подарок/);}finally{f.close()}
});
test('selecting and opening a gift QR never redeems or writes the gift',async()=>{
 const f=app();try{card(f);let calls=0;f.w.fetch=async(url,opts)=>{assert.equal(opts.method,undefined);calls++;return reply({stamps:0,vouchers:{FREE:gift}})};await f.w.selectGuestGift('FREE');assert.equal(f.run('state.guestGiftStep'),'details');assert.match(f.w.renderGuestGiftFlow(),/Шаг 1 из 2/);f.w.document.body.innerHTML='<button data-action="guest-show-gift-qr">QR</button>';f.w.document.querySelector('button').click();await Promise.resolve();assert.equal(f.run('state.guestGiftStep'),'qr');const html=f.w.renderGuestGiftFlow();assert.match(html,/solncekofe:DEMO:gift:FREE/);assert.match(html,/Ожидает подтверждения/);assert.equal(f.run('state.myVouchers[0].redeemed'),false);assert.ok(calls>=1);}finally{f.close()}
});
test('server-confirmed redemption changes the guest dialog to received and cannot reopen QR',async()=>{
 const f=app();try{card(f);f.run("state.guestGiftId='FREE';state.guestGiftStep='qr'");f.w.fetch=async()=>reply({stamps:0,vouchers:{FREE:{...gift,redeemed:true}}});await f.w.refreshGuestLoyalty();assert.equal(f.run('availableGuestGifts().length'),0);assert.match(f.w.renderGuestGiftFlow(),/Подарок получен/);assert.doesNotMatch(f.w.renderGuestGiftFlow(),/img src/);await f.w.selectGuestGift('FREE');assert.equal(f.run('state.myVouchers[0].redeemed'),true);}finally{f.close()}
});
test('failed refresh preserves balances and prevents selecting a stale gift',async()=>{
 const f=app();try{card(f);f.run("state.loyalty=5;state.myVouchers=[{id:'FREE',label:'Кофе'}]");f.w.fetch=async()=>reply(null,false,503);await f.w.selectGuestGift('FREE');assert.equal(f.run('state.loyalty'),5);assert.equal(f.run('state.myVouchers.length'),1);assert.ok(!f.run('state.guestGiftId'));assert.match(f.run('state.loyaltySyncError'),/последний баланс/);}finally{f.close()}
});
test('unchanged snapshots do not rerender; concurrent refreshes share one request',async()=>{
 const f=app();try{card(f);f.run('state.renderCalls=0;render=()=>state.renderCalls++');let calls=0;f.w.fetch=async()=>{calls++;return reply({stamps:3})};await Promise.all([f.w.refreshGuestLoyalty(),f.w.refreshGuestLoyalty()]);assert.equal(calls,1);await f.w.refreshGuestLoyalty();assert.equal(f.run('state.renderCalls'),1);}finally{f.close()}
});
test('gift QR selects exactly the requested gift for staff; scanning alone never redeems it',async()=>{
 const f=app();try{f.run("Object.assign(state,{screen:'staff',staffName:'Анна',staffShop:2});teamUI.guestId='DEMO';state.scanCalls=[];sendOpsRequest=async body=>{state.scanCalls.push(body);return {guest:{name:'Гость',stamps:0,bonusBalance:0,vouchers:[{id:'FREE',label:'Кофе'}],history:[]}}}");assert.deepEqual(JSON.parse(JSON.stringify(f.w.parseLoyaltyQr('solncekofe:DEMO:gift:FREE'))),{guestId:'DEMO',voucherId:'FREE'});assert.equal(f.w.parseGuestQr('solncekofe:DEMO'),'DEMO');await f.w.teamLookup('FREE');assert.equal(f.run('teamUI.selected'),'FREE');assert.equal(f.run('state.scanCalls.length'),1);assert.equal(f.run('state.scanCalls[0].action'),'loyaltyLookup');assert.match(f.w.renderTeamLoyalty(),/Подтвердить выдачу подарка/);}finally{f.close()}
});
test('expired and redeemed gifts are not offered; invalid QR is rejected',()=>{
 const f=app();try{card(f);f.run("state.myVouchers=[{id:'OLD',expiresAt:1},{id:'USED',redeemed:true},{id:'FREE',label:'Кофе'}]");assert.equal(f.run('availableGuestGifts().length'),1);assert.throws(()=>f.w.parseLoyaltyQr('https://example.org/DEMO'));assert.throws(()=>f.w.parseLoyaltyQr('solncekofe:DEMO:gift:../../'));
 }finally{f.close()}
});

test('QR generator is bundled locally and works without external image service',()=>{
 const f=app();try{f.run(fs.readFileSync('assets/loyalty-qr.js','utf8'));const url=f.w.loyaltyQrData('solncekofe:DEMO:gift:FREE');assert.match(url,/^data:image\/svg\+xml/);const svg=decodeURIComponent(url.split(',').slice(1).join(','));assert.match(svg,/<svg/);assert.match(svg,/shape-rendering="crispEdges"/);assert.match(svg,/M4 4h1v1h-1z/);assert.ok(svg.length>3000);assert.doesNotMatch(fs.readFileSync('preorder.html','utf8'),/api.qrserver/);}finally{f.close()}
});
