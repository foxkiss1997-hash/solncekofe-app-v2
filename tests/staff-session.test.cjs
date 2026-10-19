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

const token='a'.repeat(64),openedAt=Date.parse('2026-10-19T10:23:00Z');
function setup(f){f.run("state.screen='staff';state.staffShop=1;state.staffName=null;state.staffPinValue='pass';loadStaffOrders=()=>{};loadTodayOps=()=>{};loadChecklistConfig=()=>{};updateOpsPending=()=>{};");}
function session(f){f.w.saveStaffSession({shopId:1,name:'Анна',token,expiresAt:Date.now()+100000});}
function opened(f){return {ok:true,serverAt:Date.now(),rows:[{id:'c'.repeat(32),date:f.w.todayKey(),name:'Анна',start:'08:00',end:'20:00',opened:{openedAt,lateMinutes:0}}]};}
test('reopening restores authenticated identity and original server shift time without opening a shift',async()=>{
 const f=app();try{setup(f);session(f);const actions=[];f.w.fetch=async(url,opts)=>{const b=JSON.parse(opts.body);actions.push(b.action||b.request.action);return reply(b.action==='restore'?{ok:true,shopId:1,name:'Анна',expiresAt:Date.now()+100000}:opened(f))};await f.w.enterStaffCabinet();assert.equal(f.run('state.staffName'),'Анна');assert.equal(f.run('state.shiftOpenedAt'),openedAt);assert.equal(f.run('state.reportPassword'),'');assert.deepEqual(actions,['restore','listShiftOpening']);assert.doesNotMatch(f.w.renderStaff(),/📷 Открыть смену/);assert.match(f.w.renderStaff(),/Смена открыта · посмотреть/);assert.doesNotMatch(f.w.localStorage.getItem('sk_staff_session'),/password|pass/);}finally{f.close()}
});
test('a saved name without a server token does not authenticate or pretend the shift is open',async()=>{
 const f=app();try{setup(f);f.w.localStorage.setItem('sk_staff_session',JSON.stringify({shopId:1,name:'Анна'}));let calls=0;f.w.fetch=async()=>{calls++;return reply(null)};await f.w.enterStaffCabinet();assert.equal(f.run('state.staffName'),null);assert.equal(f.run('state.shiftOpenedAt'),null);assert.equal(calls,0);}finally{f.close()}
});
test('network errors preserve saved sign-in and expose retry without fake login',async()=>{
 const f=app();try{setup(f);session(f);f.w.fetch=async()=>reply({error:'Сервис временно недоступен'},false,503);await f.w.enterStaffCabinet();assert.equal(f.run('state.staffName'),null);assert.ok(f.w.loadStaffSession());assert.match(f.w.renderStaff(),/Повторить проверку/);}finally{f.close()}
});
test('revoked login clears the saved session and requests password again',async()=>{
 const f=app();try{setup(f);session(f);f.w.fetch=async()=>reply({error:'Доступ изменился. Введите личный пароль.'},false,401);await f.w.enterStaffCabinet();assert.equal(f.w.loadStaffSession(),null);assert.equal(f.run('state.staffName'),null);assert.match(f.w.renderStaff(),/Вход сотрудника/);}finally{f.close()}
});
test('simultaneous restore clicks share a single request chain',async()=>{
 const f=app();try{setup(f);session(f);let count=0;f.w.fetch=async(url,opts)=>{count++;return reply(JSON.parse(opts.body).action==='restore'?{ok:true,name:'Анна',shopId:1,expiresAt:Date.now()+100000}:opened(f))};await Promise.all([f.w.enterStaffCabinet(),f.w.enterStaffCabinet()]);assert.equal(count,2);}finally{f.close()}
});
test('no assigned shift or failed status read does not offer a new opening',async()=>{
 const f=app();try{setup(f);f.run("state.staffName='Анна';state.reportPassword='pass'");f.w.sendOpsRequest=async()=>({rows:[],serverAt:Date.now()});await f.w.refreshStaffShiftStatus();assert.equal(f.run('state.shiftStatus'),'none');assert.match(f.w.renderStaffShiftAction(),/Посмотреть мой график/);assert.doesNotMatch(f.w.renderStaffShiftAction(),/Открыть смену/);f.w.sendOpsRequest=async()=>{throw Error('offline')};await f.w.refreshStaffShiftStatus();assert.equal(f.run('state.shiftStatus'),'error');assert.match(f.w.renderStaffShiftAction(),/Обновить статус/);}finally{f.close()}
});
test('an already opened shift cannot start the camera or send another begin operation',async()=>{
 const f=app();try{setup(f);f.run("Object.assign(state,{staffName:'Анна',reportPassword:'pass',opMode:'opening'});teamUI.openingIdentity=teamIdentity();teamUI.openingDate=todayKey();teamUI.openingStatus='ready';teamUI.openingRows=[{id:'c'.repeat(32),opened:{openedAt:123}}]");const actions=[];f.w.sendOpsRequest=async b=>{actions.push(b.action);return opened(f)};await f.w.openShiftCamera('c'.repeat(32));assert.deepEqual(actions,['listShiftOpening']);assert.equal(f.w.document.querySelector('.shift-camera'),null);}finally{f.close()}
});
test('logout removes the session, revokes its token and clears attendance display',async()=>{
 const f=app();try{setup(f);session(f);f.run("state.staffSessionToken='a'.repeat(64);state.shiftOpenedAt=123");let body;f.w.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return reply({ok:true})};f.w.clearStaffSession();await Promise.resolve();assert.equal(f.w.loadStaffSession(),null);assert.equal(f.run('state.shiftOpenedAt'),null);assert.equal(body.action,'logout');assert.equal(body.token,token);}finally{f.close()}
});

test('refreshing an unchanged open shift does not repaint the button or interrupt a click',async()=>{const f=app();try{setup(f);f.run("state.staffName='Анна';state.reportPassword='pass'");f.w.sendOpsRequest=async()=>opened(f);await f.w.refreshStaffShiftStatus();f.run('state.renderCalls=0;render=()=>state.renderCalls++');await f.w.refreshStaffShiftStatus();assert.equal(f.run('state.renderCalls'),0);assert.equal(f.run('state.shiftOpenedAt'),openedAt);}finally{f.close()}});
