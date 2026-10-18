/* Receipt payment orders: server prices, one ID per attempt, Telegram notifications. */
function orderCatalog_(){
 const items=ORDER_BASE_ITEMS.map(x=>({...x,sizes:{...x.sizes}})),extra=dbRead_('/menu')||{},overrides=dbRead_('/menu_overrides')||{};
 for(const [id,x]of Object.entries(extra))items.push({...x,id:'x_'+id,sizes:{m:x.price}});
 return Object.fromEntries(items.map(x=>[x.id,{...x,...(overrides[x.id]||{}),sizes:{...x.sizes,...(overrides[x.id]?.sizes||{})}}]));
}
function createPickupOrder_(request,props){
 const id=teamId_(request.orderId),shopId=request.shopId;
 if(![1,2].includes(shopId)||!Array.isArray(request.items)||!request.items.length||request.items.length>30)throw Error('Проверьте состав заказа.');
 const guestId=loyaltyId_(request.guestId),contact=String(request.contact||'').trim();
 if(contact.length>160||(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)&&!/^\+?[\d ()-]{7,30}$/.test(contact)))throw Error('Укажите email или телефон для связи.');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const previous=dbRead_('/orders/'+id);
  if(previous){if(previous.clientId!==guestId)throw Error('ID заказа занят.');return {order:previous,orderId:id,replayed:true};}
  const now=Date.now(),msk=new Date(now+3*3600000),day=msk.getUTCDay(),weekend=day===0||day===6,hours=shopId===1?(weekend?[9,21]:[8,20]):(weekend?[10,22]:[8,21]);
  const currentMinute=msk.getUTCHours()*60+msk.getUTCMinutes();
  if(currentMinute<hours[0]*60||currentMinute>=hours[1]*60)throw Error('Кофейня сейчас закрыта.');
  const catalog=orderCatalog_(),stopped=dbRead_('/stoplist')||{},shopStopped=dbRead_('/shop_stoplist/'+shopId)||{},cart=[];let subtotal=0,count=0;
  for(const line of request.items){
   const item=catalog[line.itemId],size=line.sizeId;
   if(!item||stopped[line.itemId]||shopStopped[line.itemId]||!Number.isFinite(item.sizes?.[size]))throw Error('Позиция недоступна. Обновите меню.');
   if(!Number.isInteger(line.qty)||line.qty<1||line.qty>20)throw Error('Некорректное количество.');
   let price=item.sizes[size];const extra=[];
   if(['coffee','cold'].includes(item.category)){
    if(line.milk&&line.milk!=='regular'){
     if(!['almond','coconut','hazelnut','banana','lactosefree'].includes(line.milk))throw Error('Проверьте молоко.');price+=({s:60,m:80,l:90})[size];extra.push('молоко: '+line.milk);
    }
    if(line.syrup&&line.syrup!=='none'){
     if(!/^syr([0-9]|1[0-4])$/.test(line.syrup))throw Error('Проверьте сироп.');price+=50;extra.push('сироп: '+line.syrup);
    }
    if(line.shot===true){price+=70;extra.push('доп. шот');}
   }
   subtotal+=price*line.qty;count+=line.qty;cart.push({itemId:item.id,name:item.name,category:item.category,qty:line.qty,unitPrice:price,sizeId:size,options:extra});
  }
  const tip=Number(request.tip||0);if(!Number.isSafeInteger(tip)||tip<0||tip>subtotal)throw Error('Проверьте чаевые.');
  if(request.expectedTotal!==subtotal+tip)throw Error('Цены изменились. Обновите меню и проверьте заказ.');
  if(request.pickupTime){teamTime_(request.pickupTime);const [h,m]=request.pickupTime.split(':').map(Number);if(h*60+m<=currentMinute||h*60+m>=hours[1]*60)throw Error('Выберите время до закрытия кофейни.');}
  const rate=CacheService.getScriptCache(),key='pickup:'+guestId;if(rate.get(key))throw Error('Подождите минуту перед новым заказом.');
  const order={id,number:id.slice(-6).toUpperCase(),shopId,shopName:shopId===1?'Солнцекофе — Рязанский проспект':'Солнцекофе — Нагатинская',clientId:guestId,guestName:String(request.guestName||'Гость').slice(0,100),receiptContact:contact,items:cart,itemsCount:count,itemsText:cart.map(x=>'• '+x.name+' '+x.sizeId.toUpperCase()+' × '+x.qty+' — '+x.unitPrice*x.qty+' ₽'+(x.options.length?' ('+x.options.join(', ')+')':'')).join('\n'),total:subtotal+tip,tip,payMethod:'receipt',payMethodLabel:'При получении',paid:false,pickup:request.pickupTime?'к '+request.pickupTime:'как можно скорее',status:'new',createdAt:now,notificationStatus:'pending'};
  dbRequest_('/orders/'+id,'put',order);rate.put(key,'1',60);
  // A notification failure never deletes a successfully saved order.
  try{notifyPickupOrder_(order,props);order.notificationStatus='sent';}catch(e){order.notificationStatus='pending';}
  try{dbRequest_('/orders/'+id,'patch',{notificationStatus:order.notificationStatus});}catch(e){}
  return {order,orderId:id};
 }finally{lock.releaseLock();}
}
function notifyPickupOrder_(order,props){
 const token=props.getProperty('TELEGRAM_BOT_TOKEN');if(!token)throw Error('Настройте TELEGRAM_BOT_TOKEN.');
 const staff=dbRead_('/staff/'+order.shopId)||{},chat=props.getProperty('ORDER_CHAT_ID_'+order.shopId),recipients=new Set(chat?[chat]:[]);
 for(const x of Object.values(staff))if(x.active!==false&&x.tg)recipients.add(String(x.tg));
 if(!recipients.size)throw Error('Нет получателей уведомления.');
 let delivered=0;
 for(const id of recipients){
  const r=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'post',contentType:'application/json',payload:JSON.stringify({chat_id:id,text:'☀️ Новый заказ №'+order.number+'\n'+order.shopName+'\n'+order.itemsText+'\nИтого: '+order.total+' ₽ · при получении\n'+order.pickup}),muteHttpExceptions:true});
  const body=JSON.parse(r.getContentText());if(r.getResponseCode()===200&&body.ok===true)delivered++;
 }
 if(!delivered)throw Error('Telegram не подтвердил доставку.');
}
