/* Pickup payments never count as paid until a staff member confirms receipt. */
function safePaymentUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch(e){return '';}
}
function readPendingPickup(){try{return JSON.parse(localStorage.getItem('sk_pending_pickup')||'null');}catch(e){return null;}}
let checkoutLinkTimer=null;
async function checkCheckoutLinkPayment(){
  const p=state.checkoutPaymentLink;if(!p){clearInterval(checkoutLinkTimer);checkoutLinkTimer=null;return;}
  try{
    const lookup=await fetch(DB_URL+'/order_lookup/'+encodeURIComponent(p.orderId)+'.json');if(!lookup.ok)return;
    const id=await lookup.json();if(!/^[-a-zA-Z0-9_]{1,100}$/.test(id||''))return;
    const res=await fetch(DB_URL+'/orders/'+id+'.json');if(!res.ok)return;const order=await res.json();
    if(order?.paid!==true||state.checkoutPaymentLink?.orderId!==p.orderId)return;
    state.order={...order,firebaseId:id,shop:SHOPS.find(s=>s.id===order.shopId)||{name:order.shopName,addr:order.shopAddr},pickupLabel:order.pickup,placedAt:order.createdAt};
    saveOrderToStorage();state.checkoutPaymentLink=null;localStorage.removeItem('sk_pending_payment');state.cart=[];state.screen='status';render();
  }catch(e){/* Keep the link and unpaid state until the server can be checked. */}
}
function watchCheckoutLink(){if(!checkoutLinkTimer)checkoutLinkTimer=setInterval(checkCheckoutLinkPayment,5000);checkCheckoutLinkPayment();}
function restorePendingCheckout(){
  let p;try{p=JSON.parse(localStorage.getItem('sk_pending_payment')||'null');}catch(e){}
  if(p&&safePaymentUrl(p.paymentUrl)&&!state.order){state.payMethod='link';state.checkoutPaymentLink=p;state.cart=p.cartSnapshot||[];state.shopId=p.shop.id;state.screen='checkout';watchCheckoutLink();return;}
  const cash=readPendingPickup();if(cash&&!state.order){state.cart=cash.cartSnapshot||[];state.shopId=cash.shop.id;state.payMethod='pickup';state.screen='checkout';state.checkoutError='Проверьте отправку заказа №'+cash.number+'.';}
}
function finishPickupOrder(order,result){
  state.order={...order,firebaseId:result.orderId,status:result.status||'new',prepMinutes:result.prepMinutes||order.prepMinutes,paid:result.paid===true};
  saveOrderToStorage();localStorage.removeItem('sk_pending_pickup');
  state.cart=[];state.tipPercent=0;state.tipCustom='';state.screen='status';render();
}
async function placePickupOrder(){
  if(state.payingNow)return;
  state.payingNow=true;state.checkoutError='';render();
  try{
    const pending=readPendingPickup();
    if(pending){
      // A lost response must not create another order or notify the shop twice.
      const res=await fetch(DB_URL+'/orders.json?orderBy=%22%24key%22&limitToLast=50');
      if(!res.ok)throw Error('Не удалось проверить предыдущую отправку.');
      const orders=await res.json()||{},match=Object.entries(orders).find(([id,o])=>o.clientId===pending.clientId&&o.shopId===pending.shop.id&&String(o.number)===String(pending.number)&&o.payMethod==='При получении'&&o.createdAt>=pending.placedAt-60000);
      if(!match)throw Error('Предыдущая отправка пока не подтверждена. Уточните у кофейни заказ №'+pending.number+' перед повторным оформлением.');
      finishPickupOrder(pending,{...match[1],orderId:match[0]});return;
    }
    const shop=SHOPS.find(s=>s.id===state.shopId),cartSnapshot=state.cart.map(x=>({...x}));
    const order={number:String(Math.floor(Math.random()*900)+100),shop,cartSnapshot,itemsCount:cartCount(),total:cartTotal()+tipAmount(),tip:tipAmount(),guestName:state.guestName||'без имени',receiptContact:state.receiptContact||'',payMethodLabel:'При получении',payMethod:'При получении',paymentMode:'pickup',paid:false,paymentStatus:'unpaid',pickupText:state.pickupASAP?'как можно скорее':'к '+state.scheduledTime,pickupLabel:state.pickupASAP?'Скоро':state.scheduledTime,clientId:LOYALTY_ID||TELEGRAM_ID||CLIENT_ID,placedAt:Date.now(),prepMinutes:prepMinutesForCart(),flower:FLOWER_STAFF[Math.floor(Math.random()*FLOWER_STAFF.length)]};
    // Preserve the exact submitted cart until a server acknowledgement arrives.
    localStorage.setItem('sk_pending_pickup',JSON.stringify(order));
    const result=await submitOrderToStaff(order);
    if(!result||!/^[-a-zA-Z0-9_]{1,100}$/.test(result.orderId||''))throw Error('Сотрудники пока не подтвердили получение заказа. Нажмите «Проверить отправку» перед повторным оформлением.');
    finishPickupOrder(order,{...result,paid:false});
  }catch(e){state.checkoutError=e.message||'Отправка не подтверждена. Корзина сохранена.';}
  finally{state.payingNow=false;render();}
}
function pickupPaymentControls(o){
  if(o.payMethod!=='При получении'||o.paid===true||o.status==='cancelled')return '';
  const id=esc(o.id),via=state.pickupPaymentVia?.[o.id]||'cash',busy=state.pickupPaymentBusy===o.id;
  return `<div class="order-meta" style="color:var(--coral-deep);font-weight:700">Не оплачен · принять оплату на кассе</div><select class="ops-select" data-action="pickup-payment-via" data-id="${id}" ${busy?'disabled':''}><option value="cash" ${via==='cash'?'selected':''}>Наличные на кассе</option><option value="card" ${via==='card'?'selected':''}>Карта на терминале</option><option value="sbp" ${via==='sbp'?'selected':''}>СБП на кассе</option></select>${state.reportPassword?'':`<label class="hint">Для отметки оплаты подтвердите личный пароль<input class="text-input" type="password" autocomplete="off" placeholder="Личный пароль сотрудника" data-action="ops-report-password"></label>`}<button class="btn-ghost rippleable" data-action="pickup-payment-confirm" data-id="${id}" ${busy?'disabled':''}>${busy?'Подтверждаем…':'Подтвердить получение денег'}</button>`;
}
async function confirmPickupPayment(id){
  if(state.pickupPaymentBusy)return;
  if(!state.reportPassword){showToast('Подтвердите личный пароль сотрудника для отметки оплаты.');return;}
  if(!confirm('Деньги за этот заказ уже получены на кассе?'))return;
  state.pickupPaymentBusy=id;render();
  try{
    const ack=await sendOpsRequest({action:'confirmPickupPayment',orderId:id,shopId:state.staffShop,submittedBy:state.staffName,receivedVia:state.pickupPaymentVia?.[id]||'cash'},state.reportPassword);
    if(ack.paid!==true||ack.orderId!==id)throw Error('Оплата не подтверждена.');
    showToast('Получение денег подтверждено.');await loadStaffOrders(true);
  }catch(e){showToast(e.message||'Оплата не подтверждена.');}
  finally{state.pickupPaymentBusy=null;render();}
}
function renderCheckoutPaymentLink(){
  const p=state.checkoutPaymentLink,url=safePaymentUrl(p?.paymentUrl);if(!url)return '';
  return `<div class="section"><div class="order-card"><b>Ссылка на оплату готова</b><p class="order-meta">Заказ №${esc(p.number)} · ${money(p.total)}. Откройте страницу банка или скопируйте ссылку. Заказ ещё не оплачен.</p><a class="btn-primary" href="${esc(url)}" data-action="open-payment-link" target="_blank" rel="noopener noreferrer"><span>Открыть оплату</span><span>↗</span></a><button class="btn-ghost rippleable" data-action="copy-payment-link">Скопировать ссылку</button></div></div>`;
}
async function copyCheckoutPaymentLink(){
  const url=safePaymentUrl(state.checkoutPaymentLink?.paymentUrl);if(!url)return;
  try{await navigator.clipboard.writeText(url);showToast('Ссылка скопирована.');}catch(e){showToast('Откройте оплату и скопируйте адрес страницы банка.');}
}
