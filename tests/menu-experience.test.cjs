const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function app(){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/preorder.html?lid=DEMO',runScripts:'outside-only',pretendToBeVisual:true}),context=dom.getInternalVMContext();
 dom.window.fetch=async()=>{throw Error('Unexpected network request')};
 for(const path of ['operations-v3.js','stable-ui.js','team-loyalty.js','menu-photos.js','menu-experience.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context);
 const source=[...fs.readFileSync('preorder.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n').split('/* ---------- INIT ---------- */')[0];vm.runInContext(source,context);
 vm.runInContext('var messages=[];showToast=m=>messages.push(m);render=()=>{};',context);
 return {dom,run:s=>vm.runInContext(s,context),context};
}
test('menu search crosses categories, handles ё and returns an explicit empty state',()=>{
 const x=app();try{x.run("state.category='coffee';state.menuSearch='латте';");assert.equal(x.run('menuItemsForView().length'),2);x.run("state.menuSearch='ЛАТТЕ';");assert.equal(x.run('menuItemsForView().length'),2);x.run("state.menuSearch='то чего нет';");assert.match(x.run('renderGlassMenu()'),/Ничего не нашли/);}finally{x.dom.window.close();}
});
test('favourites survive a new page context and do not add products to the basket',()=>{
 const x=app();try{
  x.run("menuFavorites.add('cap');localStorage.setItem('sk_favorites_v1',JSON.stringify([...menuFavorites]));menuFavorites.clear();initMenuPreferences();state.category='favorites';");
  assert.equal(x.run('menuItemsForView()[0].id'),'cap');assert.equal(x.run('state.cart.length'),0);
  assert.match(x.run("renderMenuCard(itemById('cap'))"),/aria-pressed="true"/);
 }finally{x.dom.window.close();}
});
test('availability is specific to the selected coffee shop and globally stopped products stay unavailable',()=>{
 const x=app();try{x.run("shopStopLists={1:{cap:true},2:{}};state.shopId=1;");assert.equal(x.run("itemStopped('cap')"),true);x.run('state.shopId=2');assert.equal(x.run("itemStopped('cap')"),false);x.run("STOP_LIST.add('cap')");assert.equal(x.run("itemStopped('cap')"),true);}finally{x.dom.window.close();}
});
test('repeat order uses current prices, preserves options and never places an order',()=>{
 const x=app();try{
  x.run("menuLastCart=[{itemId:'cap',sizeId:'m',qty:2,milk:'coconut',syrup:'syr2',shot:true}];MENU_OVERRIDES.cap={sizes:{m:350}};repeatLastCart();");
  assert.equal(x.run('state.cart.length'),1);assert.equal(x.run('state.cart[0].unitPrice'),550);assert.equal(x.run('state.cart[0].qty'),2);assert.equal(x.run('state.cart[0].milk.id'),'coconut');assert.equal(x.run('state.screen'),'cart');assert.equal(x.run('state.order'),null);
 }finally{x.dom.window.close();}
});
test('repeat order is all or nothing when an item is stopped; seasonal section uses configured flags',()=>{
 const x=app();try{x.run("menuLastCart=[{itemId:'cap',sizeId:'m',qty:1,milk:'regular',syrup:'none'},{itemId:'latte',sizeId:'m',qty:1,milk:'regular',syrup:'none'}];STOP_LIST.add('latte');repeatLastCart();");assert.equal(x.run('state.cart.length'),0);x.run("MENU_OVERRIDES.raf={seasonal:true};state.category='seasonal';");assert.equal(x.run('menuItemsForView().length'),1);assert.equal(x.run('menuItemsForView()[0].id'),'raf');}finally{x.dom.window.close();}
});
