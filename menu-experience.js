/* Device preferences contain only product IDs/configuration; no customer records. */
let menuFavorites=new Set(),shopStopLists={},menuLastCart=[];
function menuIcon(name,cls=''){return `<img class="ui-icon ${cls}" src="assets/icons/${name}.svg" width="22" height="22" alt="" aria-hidden="true">`;}
function initMenuPreferences(){
 try{const ids=JSON.parse(localStorage.getItem('sk_favorites_v1')||'[]');if(Array.isArray(ids))menuFavorites=new Set(ids.filter(x=>typeof x==='string'));}catch(e){}
 try{const items=JSON.parse(localStorage.getItem('sk_last_cart_v1')||'[]');if(Array.isArray(items))menuLastCart=items.slice(0,20);}catch(e){}
 try{const name=localStorage.getItem('sk_guest_name_v1');if(name){state.guestName=name;state.guestDisplayName=name;}}catch(e){}
}
function itemStopped(id,shop=state.shopId){const local=shopStopLists[shop]?.[id];return local===true||(local!==false&&STOP_LIST.has(id));}
async function loadShopAvailability(){
 try{const res=await fetch(DB_URL+'/shop_stoplist.json');if(!res.ok)throw Error();shopStopLists=await res.json()||{};}catch(e){/* Keep the last known availability. Server checks again at checkout. */}
}
function menuItemsForView(){
 const query=String(state.menuSearch||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim(),category=state.category;
 let items=allItems();if(category!=='rescue')items=items.filter(x=>x.category!=='rescue');
 if(query)items=items.filter(x=>x.name.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(query));
 else if(category==='favorites')items=items.filter(x=>menuFavorites.has(x.id));
 else if(category==='rescue')items=items.filter(x=>x.category==='rescue');
 else if(category==='autumn')items=items.filter(x=>x.category==='autumn'||x.seasonal===true);
 else if(category==='seasonal')items=items.filter(x=>x.seasonal===true);
 else if(category==='popular')items=items.filter(x=>x.category==='coffee');
 else items=items.filter(x=>x.category===category);
 return items;
}
function renderMenuCard(item){
 const pending=menuPricePending(item),stopped=itemStopped(item.id)||(item.category==='rescue'&&item.available<1),unavailable=stopped||pending,favorite=menuFavorites.has(item.id),price=Math.min(...Object.values(item.sizes));
 return `<article class="product-card ${stopped?'is-stopped':''}" data-key="product-${esc(item.id)}"><button class="product-photo" data-action="open-customize" data-item="${esc(item.id)}" aria-label="Выбрать ${esc(item.name)}" ${unavailable?'disabled':''}>${itemThumbHTML(item)}</button><button class="favorite-button ${favorite?'selected':''}" data-action="menu-favorite" data-item="${esc(item.id)}" aria-label="${favorite?'Убрать из избранного':'В избранное'}: ${esc(item.name)}" aria-pressed="${favorite}">${menuIcon(favorite?'heart-fill':'heart')}</button><div class="product-info"><button class="product-title" data-action="open-customize" data-item="${esc(item.id)}" ${unavailable?'disabled':''}>${esc(item.name)}</button>${item.category==='rescue'?`<small class="rescue-card-info">Вместо ${money(item.originalPrice)} · ${item.available} шт.<br>Забрать до ${rescueTime(item.pickupUntil)}</small>`:''}<span class="product-price">${pending?'Цена уточняется':stopped?'Нет в наличии':(item.weightGrams?item.weightGrams+' г · ':'')+(Object.keys(item.sizes).length>1?'от ':'')+money(price)}</span><button class="product-add" data-action="open-customize" data-item="${esc(item.id)}" aria-label="Добавить: ${esc(item.name)}" ${unavailable?'disabled':''}>${menuIcon('plus')}</button></div></article>`;
}
function renderMenuEmptyState(){
 const sections={bakery:['Выпечка','Ассортимент этой кофейни скоро появится здесь.'],waffles:['Вафли-сэндвичи','Скоро добавим начинки и цены.'],autumn:['Осеннее меню','Готовим осеннюю подборку напитков.'],rescue:['Спаси вкусняшку ☀️','Здесь будут предложения на оставшуюся выпечку и десерты. Сейчас доступных предложений нет.'],favorites:['Здесь будут ваши любимые','Нажмите на сердечко у напитка.']};
 const [title,note]=!state.menuSearch?.trim()&&sections[state.category]||['Ничего не нашли','Попробуйте другое название или категорию.'];
 return `<div class="menu-empty"><h2>${esc(title)}</h2><p>${esc(note)}</p></div>`;
}
function renderGlassMenu(){
 const items=menuItemsForView(),tabs=[{id:'coffee',label:'Классические напитки',icon:'coffee'},{id:'cold',label:'Холодные',icon:'snowflake'},{id:'tea',label:'Чай',icon:'tea-bag'},...CATEGORIES.filter(x=>!['coffee','cold','tea'].includes(x.id)&&(x.id!=='desserts'||allItems().some(item=>item.category==='desserts'))).map(x=>({...x,icon:x.id==='autumn'?'leaf':'fork-knife'})),{id:'rescue',label:'Спаси вкусняшку',icon:'heart'},{id:'favorites',label:'Избранное',icon:'heart'}];
 return `<div class="screen menu-screen"><header class="menu-header"><div class="brand-row"><div class="brand-mark"><div class="badge">${sunMark()}</div><span class="wordmark">Солнцекофе</span></div><label class="menu-location"><select data-action="menu-shop" aria-label="Кофейня">${SHOPS.map(s=>`<option value="${s.id}" ${s.id===state.shopId?'selected':''}>${esc(s.name.replace('Солнцекофе — ',''))}</option>`).join('')}</select></label><button class="cart-icon-button" data-action="go-cart" aria-label="Открыть корзину">${menuIcon('shopping-bag-open')}${cartCount()?`<span class="menu-count">${cartCount()}</span>`:''}</button></div><h1>Что приготовим?</h1><label class="menu-search">${menuIcon('magnifying-glass')}<input type="search" data-action="menu-search" value="${esc(state.menuSearch||'')}" placeholder="Найти напиток или десерт" aria-label="Поиск по меню" autocomplete="off"></label></header><nav class="menu-categories ${state.menuAllCategories?'is-expanded':''}" aria-label="Категории меню">${tabs.filter(t=>state.menuAllCategories||['coffee','bakery','desserts','autumn','rescue',state.category].includes(t.id)).map(t=>`<button class="category-chip ${state.category===t.id?'active':''}" data-action="set-category" data-cat="${t.id}" aria-pressed="${state.category===t.id}">${menuIcon(t.icon)}${esc(t.label)}</button>`).join('')}<button class="category-chip category-toggle" data-action="menu-all-categories" aria-expanded="${!!state.menuAllCategories}">${state.menuAllCategories?'Свернуть':'Все категории'}</button></nav>${typeof renderRescueBanner==='function'?renderRescueBanner():''}${state.order&&!['done','cancelled'].includes(state.order.status)?`<button class="active-order-banner menu-order-link" data-action="back-to-status">Заказ №${esc(String(state.order.number))} · посмотреть статус</button>`:''}${menuLastCart.length?`<button class="repeat-order-button" data-action="menu-repeat">${menuIcon('arrow-counter-clockwise')}Добавить прошлый заказ${menuIcon('arrow-right')}</button>`:''}<main class="product-grid" aria-live="polite">${items.length?items.map(renderMenuCard).join(''):renderMenuEmptyState()}</main><p class="menu-photo-note">Изображения — иллюстрации подачи</p><div class="menu-dock">${cartCount()?`<button class="menu-cart-strip" data-action="go-cart">${menuIcon('shopping-bag-open')}<span>В корзине ${cartCount()} ${pluralPos(cartCount())}</span><b>${money(cartTotal())}</b>${menuIcon('arrow-right')}</button>`:''}${tabBarHTML('menu')}</div></div>`;
}
function renderGlassCustomize(){
 const item=itemById(state.customizeItemId),opts=state.customizeOpts;
 if(!item)return `<div class="screen"><div class="section"><h2>Позиция больше недоступна</h2><button class="btn-primary" data-action="back-to-menu">К меню</button></div></div>`;
 const price=calcUnitPrice(item,opts),stopped=itemStopped(item.id)||menuPricePending(item),custom=customizable(item.category),sizes=SIZE_ORDER.filter(x=>item.sizes[x]!=null),photo=itemThumbHTML(item);
 return `<div class="screen customize-screen"><header class="topbar"><button class="iconbtn" data-action="back-to-menu" aria-label="Назад в меню">${menuIcon('arrow-left')}</button><h2>${esc(item.name)}</h2><button class="favorite-button detail-favorite ${menuFavorites.has(item.id)?'selected':''}" data-action="menu-favorite" data-item="${esc(item.id)}" aria-pressed="${menuFavorites.has(item.id)}" aria-label="В избранное: ${esc(item.name)}">${menuIcon(menuFavorites.has(item.id)?'heart-fill':'heart')}</button></header><div class="drink-hero">${photo}</div><div class="drink-details"><h1>${esc(item.name)}</h1>${item.category==='rescue'?`<p class="rescue-explanation">Вместо ${money(item.originalPrice)} · осталось ${item.available} шт. Забрать до ${rescueTime(item.pickupUntil)}.</p>`:''}${item.id==='cap'?'<p class="drink-description">Эспрессо и нежная молочная пена</p>':''}<section class="drink-option"><h2>${['bakery','waffles','rescue','pizza','fitness','desserts'].includes(item.category)?'Порция':'Размер'}</h2><div class="size-options">${sizes.map(size=>`<button class="choice-chip ${opts.size===size?'selected':''}" data-action="set-opt" data-field="size" data-val="${size}" aria-pressed="${opts.size===size}">${['bakery','waffles','rescue','pizza','fitness','desserts'].includes(item.category)?(item.weightGrams?item.weightGrams+' г':'1 порция'):SIZE_META[size].label} · ${money(item.sizes[size])}</button>`).join('')}</div></section>${custom?`<section class="drink-option"><h2>Молоко</h2><label class="sr-only" for="milk-choice">Молоко для напитка</label><select id="milk-choice" class="glass-select" data-action="menu-milk">${MILKS.map(m=>`<option value="${m.id}" ${opts.milk===m.id?'selected':''}>${esc(m.label)}${m.priceBySize[opts.size]?' · +'+m.priceBySize[opts.size]+' ₽':''}</option>`).join('')}</select></section><section class="drink-option"><h2>Сироп</h2><label class="sr-only" for="syrup-choice">Сироп для напитка</label><select id="syrup-choice" class="glass-select" data-action="menu-syrup">${SYRUPS.map(s=>`<option value="${s.id}" ${opts.syrup===s.id?'selected':''}>${esc(s.label)}${s.delta?' · +'+s.delta+' ₽':''}</option>`).join('')}</select></section><label class="shot-option">${menuIcon('coffee')}<span>Доп. шот <small>+${EXTRA_SHOT_PRICE} ₽</small></span><input type="checkbox" data-action="menu-shot" ${opts.shot?'checked':''} aria-label="Дополнительный шот"></label>`:''}${stopped?'<p class="pin-error">Нет в наличии в выбранной кофейне</p>':''}<p class="menu-photo-note">Изображение подачи для примера</p></div><div class="customize-dock"><div class="quantity-control"><button data-action="cust-qty" data-delta="-1" aria-label="Уменьшить количество" ${opts.qty<=1?'disabled':''}>${menuIcon('minus')}</button><span aria-live="polite">${opts.qty}</span><button data-action="cust-qty" data-delta="1" aria-label="Увеличить количество">${menuIcon('plus')}</button></div><button class="btn-primary" data-action="add-customized" ${stopped?'disabled':''}>Добавить · ${money(price*opts.qty)}</button></div></div>`;
}
function rememberLastCart(order){
 const lines=order?.cartSnapshot;if(!Array.isArray(lines)||!lines.length)return;
 menuLastCart=lines.slice(0,20).map(x=>({itemId:x.itemId,sizeId:x.sizeId,qty:x.qty,milk:x.milk?.id||'regular',syrup:x.syrup?.id||'none',shot:!!x.shot}));
 try{localStorage.setItem('sk_last_cart_v1',JSON.stringify(menuLastCart));}catch(e){}
}
function repeatLastCart(){
 const added=[],missing=[];
 for(const line of menuLastCart){
  const item=itemById(line.itemId);
  if(!item||menuPricePending(item)||itemStopped(item.id)||!item.sizes[line.sizeId]||!Number.isInteger(line.qty)||line.qty<1||line.qty>20){missing.push(item?.name||'Позиция');continue;}
  const milk=MILKS.find(x=>x.id===line.milk),syrup=SYRUPS.find(x=>x.id===line.syrup);if(customizable(item.category)&&(!milk||!syrup)){missing.push(item.name);continue;}
  const opts={size:line.sizeId,milk:line.milk,syrup:line.syrup,shot:!!line.shot};
  added.push({uid:'l'+uidCounter++,itemId:item.id,category:item.category,name:item.name,icon:item.icon,sizeId:line.sizeId,qty:line.qty,unitPrice:calcUnitPrice(item,opts),milk:customizable(item.category)?milk:null,syrup:customizable(item.category)?syrup:null,shot:customizable(item.category)&&!!line.shot});
 }
 if(missing.length){showToast('Не удалось повторить: '+missing.join(', ')+'. Выберите замену в меню.');return;}
 state.cart.push(...added);state.screen='cart';render();showToast('Добавлено по текущим ценам. Проверьте корзину.');
}
function renderGlassProfile(){
 return `<div class="screen"><header class="topbar"><button class="iconbtn" data-action="back-to-menu" aria-label="Назад">${menuIcon('arrow-left')}</button><h2>Профиль</h2></header><div class="section"><div class="profile-glass"><h1>Привет${state.guestDisplayName?', '+esc(state.guestDisplayName):''}!</h1><p class="hint">Карта ${esc(LOYALTY_ID||'загружается')}</p><label>Как вас позвать?<input class="text-input" data-action="set-guest-name" value="${esc(state.guestName)}" maxlength="100" autocomplete="given-name"></label><button class="btn-primary" data-action="menu-save-profile">Сохранить имя</button><p class="hint">Имя сохраняется на этом устройстве и подставляется в заказ.</p><button class="ops-cancel" data-action="menu-open-favorites">${menuIcon('heart')} Избранные напитки</button></div><div class="profile-glass"><h2>Команда Солнцекофе</h2><button class="ops-cancel" data-action="go-staff">Кабинет сотрудника</button><button class="ops-cancel" data-action="go-admin">Кабинет владельца</button></div></div>${tabBarHTML('profile')}</div>`;
}
document.addEventListener('input',e=>{if(e.target.dataset.action==='menu-search'){state.menuSearch=e.target.value;render();}});
document.addEventListener('change',e=>{
 const a=e.target.dataset.action;
 if(a==='menu-shop'){state.shopId=Number(e.target.value);render();if(typeof loadRescueOffers==='function')loadRescueOffers();}
 else if(a==='menu-milk'){state.customizeOpts.milk=e.target.value;render();}
 else if(a==='menu-syrup'){state.customizeOpts.syrup=e.target.value;render();}
 else if(a==='menu-shot'){state.customizeOpts.shot=e.target.checked;render();}
});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;
 if(a==='menu-all-categories'){state.menuAllCategories=!state.menuAllCategories;render();}
 else if(a==='menu-favorite'){
  const id=el.dataset.item;if(menuFavorites.has(id))menuFavorites.delete(id);else menuFavorites.add(id);
  try{localStorage.setItem('sk_favorites_v1',JSON.stringify([...menuFavorites]));}catch(e){showToast('Избранное не удалось сохранить на устройстве.');}render();
 }else if(a==='menu-repeat')repeatLastCart();
 else if(a==='tab-go-profile'){state.screen='profile';render();}
 else if(a==='menu-open-favorites'){state.category='favorites';state.menuSearch='';state.screen='menu';render();}
 else if(a==='menu-save-profile'){state.guestDisplayName=String(state.guestName||'').trim().slice(0,100);try{localStorage.setItem('sk_guest_name_v1',state.guestDisplayName);showToast('Имя сохранено.');}catch(e){showToast('Не удалось сохранить имя.');}render();}
});
function renderMenuPairing(){
 if(typeof activeRescueOffers==='function'&&activeRescueOffers().length&&!state.cart.some(x=>x.category==='rescue'))return `<section class="section"><h2>Спасти вкусняшку к заказу?</h2>${renderRescueBanner(true)}</section>`;
 if(!state.cart.some(x=>['coffee','cold','signature'].includes(x.category)))return '';
 const item=allItems().find(x=>x.category==='fitness'&&!itemStopped(x.id)&&!state.cart.some(l=>l.itemId===x.id));
 if(!item)return '';
 return `<section class="section pairing-section"><h2>К напитку</h2><button class="pairing-card" data-action="menu-pairing" data-item="${esc(item.id)}"><span class="pairing-photo">${itemThumbHTML(item)}</span><span><b>${esc(item.name)}</b><small>${money(Math.min(...Object.values(item.sizes)))}</small></span>${menuIcon('plus')}</button></section>`;
}
async function setMenuAvailability(id){
 if(!state.adminAuthed||state.adminStockChanging)return;
 const shop=Number(state.adminStockShop||0),global=STOP_LIST.has(id),stopped=shop?itemStopped(id,shop):global;
 state.adminStockChanging=true;
 try{
  const patch=shop?{['shop_stoplist/'+shop+'/'+id]:stopped?(global?false:null):true}:{['stoplist/'+id]:stopped?null:true,['shop_stoplist/1/'+id]:null,['shop_stoplist/2/'+id]:null};
  const response=await fetch(DB_URL+'/.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});if(!response.ok)throw Error('Нет подтверждения сохранения.');
  if(shop){shopStopLists[shop]??={};if(stopped&&global)shopStopLists[shop][id]=false;else if(stopped)delete shopStopLists[shop][id];else shopStopLists[shop][id]=true;}
  else{if(stopped)STOP_LIST.delete(id);else STOP_LIST.add(id);for(const point of [1,2])if(shopStopLists[point])delete shopStopLists[point][id];}
 }catch(e){showToast(e.message||'Не удалось изменить наличие.');}finally{state.adminStockChanging=false;render();}
}

async function toggleMenuSeasonal(id){
 if(!state.adminAuthed||state.adminStockChanging)return;const item=itemById(id);if(!item)return;
 state.adminStockChanging=true;
 try{const seasonal=!item.seasonal,res=await fetch(DB_URL+'/menu_overrides/'+id+'.json',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({seasonal})});if(!res.ok)throw Error('Нет подтверждения сохранения.');MENU_OVERRIDES[id]={...(MENU_OVERRIDES[id]||{}),seasonal};}
 catch(e){showToast(e.message||'Не удалось сохранить сезонную подборку.');}finally{state.adminStockChanging=false;render();}
}
document.addEventListener('change',e=>{if(e.target.dataset.action==='menu-admin-stock-shop'){state.adminStockShop=Number(e.target.value);render();}});
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;
 if(el.dataset.action==='menu-seasonal')toggleMenuSeasonal(el.dataset.id);
 else if(el.dataset.action==='menu-pairing'){openCustomize(el.dataset.item);state.customizeReturnScreen='cart';}
});

/* Staff stock controls are scoped to the authenticated employee's coffee shop. */
let availabilityRefreshPromise=null,availabilityRefreshTimer=null;
function stockIdentity(){return JSON.stringify([state.staffShop,state.staffName,state.staffSessionToken||state.reportPassword]);}
async function refreshMenuAvailability(repaint=true){
 if(!availabilityRefreshPromise)availabilityRefreshPromise=(async()=>{
  try{
   const responses=await Promise.all([fetch(DB_URL+'/stoplist.json'),fetch(DB_URL+'/shop_stoplist.json')]);
   if(responses.some(r=>!r.ok))throw Error('Наличие не загружено.');
   const [global,local]=await Promise.all(responses.map(r=>r.json())),nextGlobal=new Set(Object.keys(global||{}).filter(id=>global[id]));
   const changed=JSON.stringify([...STOP_LIST].sort())!==JSON.stringify([...nextGlobal].sort())||JSON.stringify(shopStopLists)!==JSON.stringify(local||{});
   STOP_LIST=nextGlobal;shopStopLists=local||{};return {ok:true,changed};
  }catch(e){return {ok:false,changed:false};}finally{availabilityRefreshPromise=null;}
 })();
 const result=await availabilityRefreshPromise;
 if(result.changed&&repaint&&(['menu','customize','cart','checkout'].includes(state.screen)||state.screen==='staff'&&state.opMode==='stock'))render();
 return result.ok;
}
function startMenuAvailabilityUpdates(){
 if(availabilityRefreshTimer)return;
 availabilityRefreshTimer=setInterval(()=>{if(document.visibilityState!=='hidden'&&(['menu','customize','cart','checkout'].includes(state.screen)||state.screen==='staff'&&state.opMode==='stock'))refreshMenuAvailability();},10000);
}
async function loadStaffStock(){
 const identity=stockIdentity();if(state.staffStockIdentity!==identity){state.staffStockBusy=null;state.staffStockRequest=null;}state.staffStockIdentity=identity;state.staffStockOk=false;state.staffStockLoading=true;state.staffStockReady=false;state.staffStockMessage='';render();
 await loadExtraMenu();
 const loaded=await refreshMenuAvailability(false);
 if(identity!==stockIdentity())return;
 state.staffStockLoading=false;state.staffStockReady=loaded;
 if(!loaded)state.staffStockMessage='Не удалось обновить наличие. Нажмите «Обновить», прежде чем менять стоп-лист.';
 render();
}
function renderStaffStock(){
 const shop=SHOPS.find(x=>x.id===state.staffShop),ready=state.staffStockReady&&state.staffStockIdentity===stockIdentity();
 const query=String(state.staffStockSearch||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim(),category=state.staffStockCategory||'all';
 const items=allItems().filter(x=>(category==='all'||category==='stopped'&&itemStopped(x.id,state.staffShop)||x.category===category)&&(!query||x.name.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(query)));
 return `<div class="ops-form" id="ops-active-form"><h3>Стоп-лист меню</h3><p class="ops-muted">${esc(shop?.name||'Выберите точку')} · изменения действуют только здесь.</p>
 <p class="hint">Поставьте позицию в стоп, когда она закончилась. Когда снова появилась — верните в продажу.</p>
 <label class="hint">Поиск<input class="text-input" aria-label="Поиск в стоп-листе" placeholder="Название напитка или блюда" value="${esc(state.staffStockSearch||'')}" data-action="staff-stock-search"></label>
 <label class="hint">Показать<select class="ops-select" aria-label="Категория стоп-листа" data-action="staff-stock-category"><option value="all" ${category==='all'?'selected':''}>Всё меню</option><option value="stopped" ${category==='stopped'?'selected':''}>Только стоп-лист</option>${CATEGORIES.filter(c=>allItems().some(x=>x.category===c.id)).map(c=>`<option value="${esc(c.id)}" ${category===c.id?'selected':''}>${esc(c.label)}</option>`).join('')}</select></label>
 <button class="ops-cancel" data-action="staff-stock-refresh" ${state.staffStockLoading||state.staffStockBusy?'disabled':''}>${state.staffStockLoading?'Обновляем…':'Обновить'}</button>
 ${state.staffStockMessage?`<p class="ops-message ${state.staffStockOk?'ok':'bad'}" role="status">${esc(state.staffStockMessage)}</p>`:''}
 ${!ready?`<p class="ops-muted">${state.staffStockLoading?'Загружаем наличие…':'Наличие ещё не подтверждено. Обновите список.'}</p>`:''}
 ${items.map(item=>{const global=STOP_LIST.has(item.id),stopped=itemStopped(item.id,state.staffShop);return `<div class="order-card staff-stock-item"><div class="staff-stock-photo">${itemThumbHTML(item)}</div><div><b>${esc(item.name)}</b><p class="hint">${!ready?'Проверяем наличие':stopped?(global?'В стоп-листе · можно вернуть на этой точке':'В стоп-листе этой точки'):'В продаже на этой точке'}</p>${global&&!stopped?`<p class="hint">Возвращено только на этой точке. Другие кофейни не изменены.</p>`:''}<button class="${stopped?'ops-submit':'ops-cancel'}" data-action="staff-stock-toggle" data-id="${esc(item.id)}" ${!ready||state.staffStockBusy?'disabled':''}>${state.staffStockBusy===item.id?'Сохраняем…':stopped?'Вернуть в продажу':'В стоп-лист'}</button></div></div>`;}).join('')||'<p class="ops-muted">Ничего не найдено.</p>'}
 <button class="ops-cancel" data-action="close-op">Закрыть</button></div>`;
}
async function staffSetAvailability(id){
 const identity=stockIdentity(),shopId=state.staffShop;
 if(state.screen!=='staff'||!state.staffName||!hasStaffAuth()||![1,2].includes(shopId)||!state.staffStockReady||state.staffStockIdentity!==identity||state.staffStockBusy||!itemById(id))return;
 const expectedStopped=itemStopped(id,shopId),stopped=!expectedStopped;
 const request={};state.staffStockRequest=request;state.staffStockBusy=id;state.staffStockMessage='';render();
 try{
  const data=await paymentJson(PAYMENT_RELAY_URL+'/set-menu-availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shopId,submittedBy:state.staffName,auth:{password:state.reportPassword},sessionToken:state.staffSessionToken||undefined,itemId:id,stopped,expectedStopped})},20000);
  if(!data||data.ok!==true||data.shopId!==shopId||data.itemId!==id||data.stopped!==stopped)throw Error(data?.error||'Сервер не подтвердил изменение.');
  shopStopLists[shopId]??={};if(stopped)shopStopLists[shopId][id]=true;else if(data.globalStopped)shopStopLists[shopId][id]=false;else delete shopStopLists[shopId][id];
  if(data.globalStopped)STOP_LIST.add(id);
  if(identity===stockIdentity()&&state.staffStockRequest===request){state.staffStockOk=true;state.staffStockMessage=stopped?'Позиция добавлена в стоп-лист этой точки.':'Позиция возвращена в продажу.';}
 }catch(e){if(identity===stockIdentity()&&state.staffStockRequest===request){state.staffStockOk=false;state.staffStockMessage=e.message||'Не удалось сохранить изменение.';await refreshMenuAvailability(false);}}
 finally{if(state.staffStockRequest===request){state.staffStockBusy=null;state.staffStockRequest=null;}if(identity===stockIdentity())render();}
}
document.addEventListener('input',e=>{if(e.target.dataset.action==='staff-stock-search'){state.staffStockSearch=e.target.value;render();}});
document.addEventListener('change',e=>{if(e.target.dataset.action==='staff-stock-category'){state.staffStockCategory=e.target.value;render();}});
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;if(el.dataset.action==='staff-stock-toggle')staffSetAvailability(el.dataset.id);else if(el.dataset.action==='staff-stock-refresh')loadStaffStock();});
