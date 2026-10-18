/* Local browser fixtures only: never sends test orders or guest writes to production. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.startsWith('http://127.0.0.1:8765/'))return route.continue();
  if(url.includes('firebaseio.com')){
   const pathname=new URL(url).pathname;let data=null;
   if(pathname==='/guests/ABCD.json')data={stamps:5,name:'Гость'};
   else if(pathname==='/menu_overrides.json')data={ppcheesecake:{name:'ПП Сникерс',sizes:{m:330}},pizzamargherita:{sizes:{m:750}}};
   else if(pathname==='/menu.json')data={farmer:{name:'Крестьянская',category:'pizza',price:750}};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  }
  return route.fulfill({contentType:url.includes('.js')?'application/javascript':'text/plain',body:''});
 });
 await page.goto('http://127.0.0.1:8765/index.html?id=ABCD');await page.waitForURL('**/preorder.html?id=ABCD&screen=card');await page.waitForFunction(()=>LOYALTY_ID==='ABCD');
 assert.equal(await page.evaluate(()=>state.loyalty),5);
 await page.evaluate(()=>{state.screen='menu';render()});
 assert.equal(await page.locator('.menu-thumb').count(),6);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 fs.mkdirSync('test-output',{recursive:true});await page.screenshot({path:'test-output/menu.png',fullPage:true});
 await page.evaluate(()=>{Object.assign(state,{screen:'staff',staffShop:1,staffName:'Анна',reportPassword:'pass',opMode:'expense',todayOps:{}});render();});
 const input=page.locator('[data-action="set-op-party"]');await input.fill('Молоко для смены');await input.focus();
 await page.evaluate(()=>{window.savedInput=document.activeElement;window.scrollTo(0,700);window.savedScroll=scrollY;render();render();});
 assert.equal(await page.evaluate(()=>document.activeElement===window.savedInput),true);
 assert.equal(await input.inputValue(),'Молоко для смены');assert.ok(Math.abs(await page.evaluate(()=>scrollY-window.savedScroll))<2);
 console.log('PASS: legacy card, photo menu, mobile width, input node/focus/value and scroll preservation');
 await page.evaluate(()=>{state.opMode='reward';Object.assign(teamUI,{guestId:'ABCD',guest:null,busy:false});window.calls=[];teamRequest=async body=>{window.calls.push(body);await new Promise(r=>setTimeout(r,15));return {guest:{name:'Гость',stamps:5,bonusBalance:100,vouchers:body.action==='redeemGift'?[]:[{id:'GIFT',label:'Бесплатный кофе'}],history:[]}};};render();});
 await page.locator('[data-action="team-lookup"]').click();await page.waitForFunction(()=>teamUI.guest!==null);
 assert.equal(await page.evaluate(()=>window.calls.filter(x=>x.action==='redeemGift').length),0);
 await page.locator('[data-action="team-select-gift"]').click();assert.equal(await page.evaluate(()=>window.calls.filter(x=>x.action==='redeemGift').length),0);
 await page.locator('[data-action="team-confirm-gift"]').click();await page.waitForFunction(()=>!teamUI.busy);
 assert.equal(await page.evaluate(()=>window.calls.filter(x=>x.action==='redeemGift').length),1);
 assert.equal(await page.locator('[data-action="team-confirm-gift"]').count(),0);
 console.log('PASS: QR lookup and selection never debit; explicit confirmation debits once');
 await page.evaluate(()=>{state.opMode='schedule';Object.assign(teamUI,{scheduleKey:'Анна:1',schedule:{rows:[{id:'c'.repeat(32),revision:'a'.repeat(32),date:'2099-10-20',start:'08:00',end:'16:00',name:'',status:'open'}],staff:[]},message:''});render();});
 assert.equal(await page.locator('[data-action="team-shift-claim"]').count(),1);assert.equal(await page.locator('[data-action="team-shift-approve"]').count(),0);
 await page.screenshot({path:'test-output/staff.png',fullPage:true});
 await page.evaluate(()=>{Object.assign(state,{screen:'admin',adminAuthed:true,adminTab:'overview'});teamUI.overview={date:'2026-10-19',rows:[{shopId:1,revenue:28400,expense:2200,photoReports:1,issues:0,staff:[{name:'Анна',start:'08:00',end:'16:00'}],cashDifference:0},{shopId:2,revenue:null,expense:0,photoReports:0,issues:1,staff:[],cashDifference:null}]};render();});
 assert.equal(await page.getByText('Отчёт не сдан',{exact:true}).count(),1);await page.screenshot({path:'test-output/owner.png',fullPage:true});
 await page.evaluate(()=>{state.adminTab='schedule';teamUI.scheduleKey='owner:1';teamUI.schedule={rows:[{id:'c'.repeat(32),revision:'a'.repeat(32),date:'2099-10-20',start:'08:00',end:'16:00',name:'Анна',status:'pending'}],staff:['Анна']};render();});
 assert.equal(await page.locator('[data-action="team-shift-approve"]').count(),1);
 await page.evaluate(()=>{state.screen='checkout';state.payMethod='receipt';state.cart=[{uid:'x',itemId:'cap',category:'coffee',name:'Капучино',sizeId:'m',qty:1,unitPrice:300}];render();});
 assert.equal(await page.locator('[data-pay="receipt"]').count(),1);assert.equal(await page.locator('[data-pay="link"]').count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: staff/owner permissions, overview, payment choices, no runtime errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
