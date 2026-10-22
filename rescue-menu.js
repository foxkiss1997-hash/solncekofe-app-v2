/* Rescue offers use authenticated server writes and a separate, finite allocation. */
let rescueOffersByShop={},rescueLoadSequence=0,rescueClockOffset=0,rescueCartKey='',rescueCartFingerprint='';
function rescueNow(){return Date.now()+rescueClockOffset;}
function rescueTime(at){return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(new Date(at));}
function activeRescueOffers(){return (rescueOffersByShop[state.shopId]||[]).filter(x=>x.active&&x.available>0&&x.pickupUntil>rescueNow());}
function rescueMenuItems(){return activeRescueOffers().map(x=>({id:'rescue_'+x.id,category:'rescue',name:x.name,sizes:{m:x.price},icon:'🥐',photo:itemByBasePhoto(x.itemId),rescueOfferId:x.id,originalPrice:x.originalPrice,available:x.available,pickupUntil:x.pickupUntil}));}
function itemByBasePhoto(id){const base=ITEMS.concat(EXTRA_ITEMS).find(x=>x.id===id);return MENU_OVERRIDES[id]?.photo||base?.photo;}
async function loadRescueOffers(){
 const shopId=state.shopId,sequence=++rescueLoadSequence;
 try{const response=await fetch(PAYMENT_RELAY_URL+'/rescue-offers?shopId='+shopId,{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(!data.ok||data.shopId!==shopId||!Array.isArray(data.offers))throw Error();
  const changed=JSON.stringify(rescueOffersByShop[shopId])!==JSON.stringify(data.offers);rescueOffersByShop[shopId]=data.offers;rescueClockOffset=Number(data.serverAt)-Date.now()||0;
  if(sequence===rescueLoadSequence){state.rescueLoadError=false;if(changed&&['menu','cart','customize','checkout'].includes(state.screen))render();}
 }catch(e){if(sequence===rescueLoadSequence){rescueOffersByShop[shopId]=[];state.rescueLoadError=true;if(state.category==='rescue'&&state.screen==='menu')render();}}
}
function renderRescueBanner(inCart=false){
 const offers=activeRescueOffers(),available=offers.reduce((n,x)=>n+x.available,0),has=offers.length>0;
 if(!inCart&&state.category==='rescue')return `<p class="rescue-explanation">Выпечка и десерты со скидкой. Заберите в выбранной кофейне до времени на карточке.${state.rescueLoadError?' Не удалось загрузить предложения. Нажмите «Обновить».':''}</p><button class="rescue-refresh" data-action="rescue-refresh">Обновить предложения</button>`;
 return `<button class="rescue-banner ${has?'has-offers':''}" data-action="rescue-open"><span class="rescue-banner-mark">☀️</span><span><b>${has?'Спасите вкусняшку со скидкой':'Спаси вкусняшку'}</b><small>${has?`${available} шт. в этой кофейне · от ${money(Math.min(...offers.map(x=>x.price)))}`:'Здесь появляются выпечка и десерты со скидкой'}</small></span><span aria-hidden="true">→</span></button>`;
}
function rescueCartError(){
 for(const line of state.cart.filter(x=>x.category==='rescue')){const offer=activeRescueOffers().find(x=>'rescue_'+x.id===line.itemId),qty=state.cart.filter(x=>x.itemId===line.itemId).reduce((n,x)=>n+x.qty,0);
  if(!offer||offer.pickupUntil<=rescueNow()+5*60000||offer.available<qty||offer.price!==line.unitPrice)return 'Предложение спасения изменилось. Вернитесь в меню и обновите корзину.';
  if(!state.pickupASAP)return 'Для спасения выберите получение «Как можно скорее». Забрать нужно до '+rescueTime(offer.pickupUntil)+'.';

 }
 return '';
}
function renderRescueCartNotice(){const rows=state.cart.filter(x=>x.category==='rescue');if(!rows.length)return '';const offers=activeRescueOffers().filter(x=>rows.some(r=>r.itemId==='rescue_'+x.id));return `<p class="rescue-explanation">☀️ Спасение закреплено за выбранной кофейней. ${offers.length?'Забрать до '+rescueTime(Math.min(...offers.map(x=>x.pickupUntil)))+'.':''} Выберите «Как можно скорее». Товар резервируется при создании онлайн-оплаты.</p>`;}
function rescueCheckoutKey(){
 if(!state.cart.some(x=>x.category==='rescue'))return undefined;
 const fingerprint=JSON.stringify([state.shopId,LOYALTY_ID,state.cart,state.pickupASAP,state.scheduledTime,cartTotal(),tipAmount()]);
 if(!rescueCartKey){try{const saved=JSON.parse(localStorage.getItem('sk_rescue_checkout_v1')||'null');if(saved&&saved.fingerprint===fingerprint&&/^[a-f0-9]{32}$/.test(saved.key)){rescueCartKey=saved.key;rescueCartFingerprint=fingerprint;}}catch(e){}}
 if(fingerprint!==rescueCartFingerprint){rescueCartFingerprint=fingerprint;rescueCartKey=rescueId();try{localStorage.setItem('sk_rescue_checkout_v1',JSON.stringify({key:rescueCartKey,fingerprint}));}catch(e){}}return rescueCartKey;
}
function rescueId(){return crypto.randomUUID().replaceAll('-','');}
function rescueDraft(){
 const identity=stockIdentity();if(state.rescueIdentity!==identity){state.rescueIdentity=identity;state.rescueDraft=null;state.rescueStaffOffers=[];state.rescueStaffMessage='';state.rescueStaffBusy=false;state.rescueStaffReady=false;}
 if(!state.rescueDraft)state.rescueDraft={id:rescueId(),itemId:'',price:'',quantity:'',until:'',freshConfirmed:false,expectedRevision:0,operationId:rescueId()};return state.rescueDraft;
}
async function rescueStaffRequest(payload){return paymentJson(PAYMENT_RELAY_URL+'/rescue-operation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,shopId:state.staffShop,submittedBy:state.staffName,sessionToken:state.staffSessionToken||undefined,auth:{password:state.reportPassword}})},25000);}
async function loadStaffRescue(){
 rescueDraft();const identity=stockIdentity();state.rescueStaffLoading=true;render();
 try{await loadExtraMenu();const data=await rescueStaffRequest({action:'list'});if(identity!==stockIdentity())return;if(!data.ok||data.shopId!==state.staffShop||!Array.isArray(data.offers))throw Error(data.error||'Список не подтверждён.');state.rescueStaffOffers=data.offers;state.rescueStaffReady=true;state.rescueStaffMessage='';}
 catch(e){if(identity===stockIdentity()){state.rescueStaffReady=false;state.rescueStaffMessage=e.message||'Не удалось загрузить предложения.';}}
 finally{if(identity===stockIdentity()){state.rescueStaffLoading=false;render();}}
}
function renderStaffRescue(){
 const d=rescueDraft(),shop=SHOPS.find(x=>x.id===state.staffShop),busy=state.rescueStaffBusy,items=allItems().filter(x=>['bakery','waffles','fitness'].includes(x.category));
 return `<section class="ops-form rescue-form" id="ops-active-form"><h3>Спасение выпечки</h3><p class="ops-muted">${esc(shop?.name||'')} · предложения только этой кофейни</p><p class="hint">Выделите товар для акции и уберите это количество из обычной продажи на кассе. Добавляйте только продукцию с действующим сроком годности.</p>
 <label>Позиция<select class="ops-select" data-rescue-field="itemId" aria-label="Позиция для спасения"><option value="">Выберите из меню</option>${items.map(x=>`<option value="${esc(x.id)}" ${d.itemId===x.id?'selected':''}>${esc(x.name)} · ${money(x.sizes.m)}</option>`).join('')}</select></label>
 <label>Всего выделено, шт.<input class="text-input" type="number" min="1" max="100" step="1" data-rescue-field="quantity" value="${esc(String(d.quantity))}"></label>
 <label>Цена за порцию, ₽<input class="text-input" type="number" min="1" step="1" data-rescue-field="price" value="${esc(String(d.price))}"></label>
 <label>Забрать до (московское время)<input class="text-input" type="datetime-local" data-rescue-field="until" value="${esc(d.until)}"></label>
 <label class="rescue-confirm"><input type="checkbox" data-rescue-field="freshConfirmed" ${d.freshConfirmed?'checked':''}> Подтверждаю: товар пригоден до указанного времени, количество отложено для спасения.</label>
 <button class="ops-submit" data-action="rescue-save" ${busy||!state.rescueStaffReady?'disabled':''}>${busy?'Сохраняем…':d.expectedRevision?'Сохранить изменения':'Опубликовать предложение'}</button>
 ${d.expectedRevision?'<button class="ops-cancel" data-action="rescue-new">Новое предложение</button>':''}
 ${state.rescueStaffMessage?`<p class="ops-message" role="status">${esc(state.rescueStaffMessage)}</p>`:''}
 <h3>Предложения этой кофейни</h3><button class="ops-cancel" data-action="rescue-staff-refresh" ${busy||state.rescueStaffLoading?'disabled':''}>${state.rescueStaffLoading?'Обновляем…':'Обновить список'}</button>
 ${(state.rescueStaffOffers||[]).map(x=>`<article class="order-card"><b>${esc(x.name)}</b><p>${money(x.price)} · ${x.available} шт. доступны · ${x.reserved} шт. в оплатах / заказах</p><p class="hint">До ${rescueTime(x.pickupUntil)} · ${x.active&&x.pickupUntil>rescueNow()?'Опубликовано':'Снято или срок закончился'}</p><button class="ops-cancel" data-action="rescue-edit" data-id="${x.id}" ${busy?'disabled':''}>Редактировать</button>${x.active?`<button class="ops-cancel" data-action="rescue-close" data-id="${x.id}" ${busy?'disabled':''}>Снять с продажи</button>`:''}</article>`).join('')||'<p class="hint">Пока нет предложений. Заполните форму выше.</p>'}<button class="ops-cancel" data-action="close-op" ${busy?'disabled':''}>Закрыть</button></section>`;
}
async function saveStaffRescue(closeId){
 const d=rescueDraft();if(state.rescueStaffBusy||!state.rescueStaffReady||!hasStaffAuth())return;
 const target=closeId?(state.rescueStaffOffers||[]).find(x=>x.id===closeId):null,payload=closeId?{action:'close',id:closeId,expectedRevision:target?.revision,operationId:rescueId()}:{...d,action:'save',pickupUntil:Date.parse(d.until+':00+03:00')};
 const identity=stockIdentity();state.rescueStaffBusy=true;state.rescueStaffMessage='';render();
 try{const data=await rescueStaffRequest(payload);if(identity!==stockIdentity())return;if(!data.ok||data.shopId!==state.staffShop||data.offer?.id!==payload.id)throw Error(data.error||'Сервер не подтвердил предложение.');
  state.rescueStaffOffers=[data.offer,...state.rescueStaffOffers.filter(x=>x.id!==data.offer.id)];if(!closeId)state.rescueDraft=null;state.rescueStaffMessage=closeId?'Предложение снято. Оплаченные заказы сохранены.':'Предложение опубликовано. Гости этой кофейни увидят его в меню.';
  await loadRescueOffers();
 }catch(e){if(identity===stockIdentity())state.rescueStaffMessage=e.message||'Не удалось сохранить. Форма сохранена — повторите.';}
 finally{if(identity===stockIdentity()){state.rescueStaffBusy=false;render();}}
}
document.addEventListener('input',e=>{const key=e.target.dataset.rescueField;if(key){const d=rescueDraft();d[key]=e.target.type==='checkbox'?e.target.checked:e.target.value;d.operationId=rescueId();}});
document.addEventListener('change',e=>{const key=e.target.dataset.rescueField;if(key){const d=rescueDraft();d[key]=e.target.type==='checkbox'?e.target.checked:e.target.value;d.operationId=rescueId();}});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;
 switch(el.dataset.action){
 case 'rescue-open':state.category='rescue';state.menuSearch='';state.screen='menu';render();loadRescueOffers();break;
 case 'rescue-refresh':loadRescueOffers();break;
 case 'rescue-staff-refresh':loadStaffRescue();break;
 case 'rescue-save':saveStaffRescue();break;
 case 'rescue-close':saveStaffRescue(el.dataset.id);break;
 case 'rescue-new':if(!state.rescueStaffBusy){state.rescueDraft=null;render();}break;
 case 'rescue-edit':{if(state.rescueStaffBusy)return;const x=state.rescueStaffOffers.find(x=>x.id===el.dataset.id);if(!x)return;state.rescueDraft={id:x.id,itemId:x.itemId,price:x.price,quantity:x.quantity,until:new Date(x.pickupUntil+3*3600000).toISOString().slice(0,16),freshConfirmed:false,expectedRevision:x.revision,operationId:rescueId()};render();break;}
 }
});
setInterval(()=>{if(document.visibilityState!=='hidden'&&['menu','cart','checkout','customize'].includes(state.screen))loadRescueOffers();},15000);
