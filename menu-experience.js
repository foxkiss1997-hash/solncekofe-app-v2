/* Device preferences contain only product IDs/configuration; no customer records. */
let menuFavorites=new Set(),shopStopLists={},menuLastCart=[];
function menuIcon(name,cls=''){return `<img class="ui-icon ${cls}" src="assets/icons/${name}.svg" width="22" height="22" alt="" aria-hidden="true">`;}
function initMenuPreferences(){
 try{const ids=JSON.parse(localStorage.getItem('sk_favorites_v1')||'[]');if(Array.isArray(ids))menuFavorites=new Set(ids.filter(x=>typeof x==='string'));}catch(e){}
 try{const items=JSON.parse(localStorage.getItem('sk_last_cart_v1')||'[]');if(Array.isArray(items))menuLastCart=items.slice(0,20);}catch(e){}
 try{const name=localStorage.getItem('sk_guest_name_v1');if(name){state.guestName=name;state.guestDisplayName=name;}}catch(e){}
}
function itemStopped(id,shop=state.shopId){return STOP_LIST.has(id)||shopStopLists[shop]?.[id]===true;}
async function loadShopAvailability(){
 try{const res=await fetch(DB_URL+'/shop_stoplist.json');if(!res.ok)throw Error();shopStopLists=await res.json()||{};}catch(e){/* Keep the last known availability. Server checks again at checkout. */}
}
function menuItemsForView(){
 const query=String(state.menuSearch||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim(),category=state.category;
 let items=allItems();
 if(query)items=items.filter(x=>x.name.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(query));
 else if(category==='favorites')items=items.filter(x=>menuFavorites.has(x.id));
 else if(category==='seasonal')items=items.filter(x=>x.seasonal===true);
 else if(category==='popular'){const ids=['cap','latte','bumble','raf'];items=ids.map(id=>items.find(x=>x.id===id)).filter(Boolean);}
 else items=items.filter(x=>x.category===category);
 return items;
}
function renderMenuCard(item){
 const stopped=itemStopped(item.id),favorite=menuFavorites.has(item.id),price=Math.min(...Object.values(item.sizes));
 return `<article class="product-card ${stopped?'is-stopped':''}" data-key="product-${esc(item.id)}"><button class="product-photo" data-action="open-customize" data-item="${esc(item.id)}" aria-label="Выбрать ${esc(item.name)}" ${stopped?'disabled':''}>${itemThumbHTML(item)}</button><button class="favorite-button ${favorite?'selected':''}" data-action="menu-favorite" data-item="${esc(item.id)}" aria-label="${favorite?'Убрать из избранного':'В избранное'}: ${esc(item.name)}" aria-pressed="${favorite}">${menuIcon(favorite?'heart-fill':'heart')}</button><div class="product-info"><button class="product-title" data-action="open-customize" data-item="${esc(item.id)}" ${stopped?'disabled':''}>${esc(item.name)}</button><span class="product-price">${stopped?'Нет в наличии':(Object.keys(item.sizes).length>1?'от ':'')+money(price)}</span><button class="product-add" data-action="open-customize" data-item="${esc(item.id)}" aria-label="Добавить: ${esc(item.name)}" ${stopped?'disabled':''}>${menuIcon('plus')}</button></div></article>`;
}
function renderGlassMenu(){
 const items=menuItemsForView(),tabs=[{id:'popular',label:'Популярное',icon:'sparkle'},{id:'coffee',label:'Кофе',icon:'coffee'},{id:'cold',label:'Холодные',icon:'snowflake'},{id:'tea',label:'Чай',icon:'tea-bag'},...CATEGORIES.filter(x=>!['coffee','cold','tea'].includes(x.id)).map(x=>({...x,icon:'fork-knife'})),...(allItems().some(x=>x.seasonal)?[{id:'seasonal',label:'Сезонное',icon:'leaf'}]:[]),{id:'favorites',label:'Избранное',icon:'heart'}];
 return `<div class="screen menu-screen"><header class="menu-header"><div class="brand-row"><div class="brand-mark"><div class="badge">${sunMark()}</div><span class="wordmark">Солнцекофе</span></div><label class="menu-location"><select data-action="menu-shop" aria-label="Кофейня">${SHOPS.map(s=>`<option value="${s.id}" ${s.id===state.shopId?'selected':''}>${esc(s.name.replace('Солнцекофе — ',''))}</option>`).join('')}</select></label><button class="cart-icon-button" data-action="go-cart" aria-label="Открыть корзину">${menuIcon('shopping-bag-open')}${cartCount()?`<span class="menu-count">${cartCount()}</span>`:''}</button></div><h1>Что приготовим?</h1><label class="menu-search">${menuIcon('magnifying-glass')}<input type="search" data-action="menu-search" value="${esc(state.menuSearch||'')}" placeholder="Найти напиток или десерт" aria-label="Поиск по меню" autocomplete="off"></label></header><nav class="menu-categories" aria-label="Категории меню">${tabs.map(t=>`<button class="category-chip ${state.category===t.id?'active':''}" data-action="set-category" data-cat="${t.id}" aria-pressed="${state.category===t.id}">${menuIcon(t.icon)}${esc(t.label)}</button>`).join('')}</nav>${state.order&&!['done','cancelled'].includes(state.order.status)?`<button class="active-order-banner menu-order-link" data-action="back-to-status">Заказ №${esc(String(state.order.number))} · посмотреть статус</button>`:''}${menuLastCart.length?`<button class="repeat-order-button" data-action="menu-repeat">${menuIcon('arrow-counter-clockwise')}Добавить прошлый заказ${menuIcon('arrow-right')}</button>`:''}<main class="product-grid" aria-live="polite">${items.length?items.map(renderMenuCard).join(''):`<div class="menu-empty"><h2>${state.category==='favorites'?'Здесь будут ваши любимые':'Ничего не нашли'}</h2><p>${state.category==='favorites'?'Нажмите на сердечко у напитка.':'Попробуйте другое название или категорию.'}</p></div>`}</main><p class="menu-photo-note">Изображения — иллюстрации подачи</p><div class="menu-dock">${cartCount()?`<button class="menu-cart-strip" data-action="go-cart">${menuIcon('shopping-bag-open')}<span>В корзине ${cartCount()} ${pluralPos(cartCount())}</span><b>${money(cartTotal())}</b>${menuIcon('arrow-right')}</button>`:''}${tabBarHTML('menu')}</div></div>`;
}
function renderGlassCustomize(){
 const item=itemById(state.customizeItemId),opts=state.customizeOpts;
 if(!item)return `<div class="screen"><div class="section"><h2>Позиция больше недоступна</h2><button class="btn-primary" data-action="back-to-menu">К меню</button></div></div>`;
 const price=calcUnitPrice(item,opts),stopped=itemStopped(item.id),custom=customizable(item.category),sizes=SIZE_ORDER.filter(x=>item.sizes[x]!=null),photo=itemThumbHTML(item);
 return `<div class="screen customize-screen"><header class="topbar"><button class="iconbtn" data-action="back-to-menu" aria-label="Назад в меню">${menuIcon('arrow-left')}</button><h2>${esc(item.name)}</h2><button class="favorite-button detail-favorite ${menuFavorites.has(item.id)?'selected':''}" data-action="menu-favorite" data-item="${esc(item.id)}" aria-pressed="${menuFavorites.has(item.id)}" aria-label="В избранное: ${esc(item.name)}">${menuIcon(menuFavorites.has(item.id)?'heart-fill':'heart')}</button></header><div class="drink-hero">${photo}</div><div class="drink-details"><h1>${esc(item.name)}</h1>${item.id==='cap'?'<p class="drink-description">Эспрессо и нежная молочная пена</p>':''}<section class="drink-option"><h2>Размер</h2><div class="size-options">${sizes.map(size=>`<button class="choice-chip ${opts.size===size?'selected':''}" data-action="set-opt" data-field="size" data-val="${size}" aria-pressed="${opts.size===size}">${SIZE_META[size].label} · ${money(item.sizes[size])}</button>`).join('')}</div></section>${custom?`<section class="drink-option"><h2>Молоко</h2><label class="sr-only" for="milk-choice">Молоко для напитка</label><select id="milk-choice" class="glass-select" data-action="menu-milk">${MILKS.map(m=>`<option value="${m.id}" ${opts.milk===m.id?'selected':''}>${esc(m.label)}${m.priceBySize[opts.size]?' · +'+m.priceBySize[opts.size]+' ₽':''}</option>`).join('')}</select></section><section class="drink-option"><h2>Сироп</h2><label class="sr-only" for="syrup-choice">Сироп для напитка</label><select id="syrup-choice" class="glass-select" data-action="menu-syrup">${SYRUPS.map(s=>`<option value="${s.id}" ${opts.syrup===s.id?'selected':''}>${esc(s.label)}${s.delta?' · +'+s.delta+' ₽':''}</option>`).join('')}</select></section><label class="shot-option">${menuIcon('coffee')}<span>Доп. шот <small>+${EXTRA_SHOT_PRICE} ₽</small></span><input type="checkbox" data-action="menu-shot" ${opts.shot?'checked':''} aria-label="Дополнительный шот"></label>`:''}${stopped?'<p class="pin-error">Нет в наличии в выбранной кофейне</p>':''}<p class="menu-photo-note">Изображение подачи для примера</p></div><div class="customize-dock"><div class="quantity-control"><button data-action="cust-qty" data-delta="-1" aria-label="Уменьшить количество" ${opts.qty<=1?'disabled':''}>${menuIcon('minus')}</button><span aria-live="polite">${opts.qty}</span><button data-action="cust-qty" data-delta="1" aria-label="Увеличить количество">${menuIcon('plus')}</button></div><button class="btn-primary" data-action="add-customized" ${stopped?'disabled':''}>Добавить · ${money(price*opts.qty)}</button></div></div>`;
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
  if(!item||itemStopped(item.id)||!item.sizes[line.sizeId]||!Number.isInteger(line.qty)||line.qty<1||line.qty>20){missing.push(item?.name||'Позиция');continue;}
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
 if(a==='menu-shop'){state.shopId=Number(e.target.value);render();}
 else if(a==='menu-milk'){state.customizeOpts.milk=e.target.value;render();}
 else if(a==='menu-syrup'){state.customizeOpts.syrup=e.target.value;render();}
 else if(a==='menu-shot'){state.customizeOpts.shot=e.target.checked;render();}
});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;
 if(a==='menu-favorite'){
  const id=el.dataset.item;if(menuFavorites.has(id))menuFavorites.delete(id);else menuFavorites.add(id);
  try{localStorage.setItem('sk_favorites_v1',JSON.stringify([...menuFavorites]));}catch(e){showToast('Избранное не удалось сохранить на устройстве.');}render();
 }else if(a==='menu-repeat')repeatLastCart();
 else if(a==='tab-go-profile'){state.screen='profile';render();}
 else if(a==='menu-open-favorites'){state.category='favorites';state.menuSearch='';state.screen='menu';render();}
 else if(a==='menu-save-profile'){state.guestDisplayName=String(state.guestName||'').trim().slice(0,100);try{localStorage.setItem('sk_guest_name_v1',state.guestDisplayName);showToast('Имя сохранено.');}catch(e){showToast('Не удалось сохранить имя.');}render();}
});
function renderMenuPairing(){
 if(!state.cart.some(x=>['coffee','cold','signature'].includes(x.category)))return '';
 const item=allItems().find(x=>x.category==='fitness'&&!itemStopped(x.id)&&!state.cart.some(l=>l.itemId===x.id));
 if(!item)return '';
 return `<section class="section pairing-section"><h2>К напитку</h2><button class="pairing-card" data-action="menu-pairing" data-item="${esc(item.id)}"><span class="pairing-photo">${itemThumbHTML(item)}</span><span><b>${esc(item.name)}</b><small>${money(Math.min(...Object.values(item.sizes)))}</small></span>${menuIcon('plus')}</button></section>`;
}
async function setMenuAvailability(id){
 if(!state.adminAuthed||state.adminStockChanging)return;
 const shop=Number(state.adminStockShop||0),global=STOP_LIST.has(id),stopped=shop?!!shopStopLists[shop]?.[id]:global;
 if(shop&&global){showToast('Позиция скрыта для обеих точек. Сначала включите её в режиме «Обе точки».');return;}
 state.adminStockChanging=true;
 try{const response=await fetch(DB_URL+(shop?'/shop_stoplist/'+shop:'/stoplist')+'/'+id+'.json',{method:stopped?'DELETE':'PUT',headers:{'Content-Type':'application/json'},...(stopped?{}:{body:'true'})});if(!response.ok)throw Error('Нет подтверждения сохранения.');
  if(shop){shopStopLists[shop]??={};if(stopped)delete shopStopLists[shop][id];else shopStopLists[shop][id]=true;}else{if(stopped)STOP_LIST.delete(id);else STOP_LIST.add(id);}
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
