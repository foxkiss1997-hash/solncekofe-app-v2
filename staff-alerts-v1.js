/* Alerts inside the open staff app; Telegram delivery is handled by the bot server. */
let staffAlertAudio=null,staffAlertEnabled=false,staffAlertLastSound=0;
const staffAlertSeen=new Map();
function pendingStaffOrders(orders,shopId){return orders.filter(o=>o.shopId===shopId&&o.status==='new');}
function staffAlertKey(){return 'sk_order_alerts:'+state.staffShop+':'+state.staffName;}
function observeStaffOrders(orders){
  const pending=pendingStaffOrders(orders,state.staffShop),key=staffAlertKey();
  let seen=staffAlertSeen.get(key);
  if(!seen){try{seen=new Set(JSON.parse(localStorage.getItem(key)||'[]'));}catch(e){seen=new Set();}staffAlertSeen.set(key,seen);}
  const fresh=pending.filter(o=>!seen.has(o.id));
  if(fresh.length){fresh.forEach(o=>seen.add(o.id));try{localStorage.setItem(key,JSON.stringify([...seen].slice(-200)));}catch(e){}showToast('Новый заказ: '+fresh.map(o=>'№'+o.number).join(', '));}
  if(pending.length&&staffAlertEnabled&&(fresh.length||Date.now()-staffAlertLastSound>=30000))playStaffOrderSignal();
  return fresh;
}
function playStaffOrderSignal(){
  if(!staffAlertEnabled||staffAlertAudio?.state!=='running')return false;
  try{
    const now=staffAlertAudio.currentTime;
    [0,.24,.48].forEach(offset=>{const osc=staffAlertAudio.createOscillator(),gain=staffAlertAudio.createGain();osc.frequency.value=880;gain.gain.setValueAtTime(0,now+offset);gain.gain.linearRampToValueAtTime(.16,now+offset+.02);gain.gain.linearRampToValueAtTime(0,now+offset+.18);osc.connect(gain);gain.connect(staffAlertAudio.destination);osc.start(now+offset);osc.stop(now+offset+.2);});
    staffAlertLastSound=Date.now();
    try{if(window.Telegram?.WebApp?.HapticFeedback)window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');else if(typeof navigator!=='undefined')navigator.vibrate?.([180,100,180]);}catch(e){}
    return true;
  }catch(e){staffAlertEnabled=false;return false;}
}
async function enableStaffOrderSignal(){
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Звук недоступен в этом браузере.');if(!staffAlertAudio)staffAlertAudio=new Audio();await staffAlertAudio.resume();staffAlertEnabled=staffAlertAudio.state==='running';if(!staffAlertEnabled)throw Error('Нажмите проверку звука ещё раз.');playStaffOrderSignal();showToast('Проверочный сигнал. Убедитесь, что он слышен.');}
  catch(e){staffAlertEnabled=false;showToast(e.message||'Не удалось включить звук.');}render();
}
function renderStaffOrderAlerts(){
  const count=pendingStaffOrders(state.staffOrders||[],state.staffShop).length,enabled=staffAlertEnabled&&staffAlertAudio?.state==='running';
  return `<div class="ops-form" role="status" aria-live="polite"><h3>${count?'🔔 Ждут принятия: '+count:'Уведомления о заказах'}</h3><p class="hint">${state.staffOrdersError?esc(state.staffOrdersError):state.staffOrdersCheckedAt?'Заказы проверены в '+new Date(state.staffOrdersCheckedAt).toLocaleTimeString('ru-RU'):'Проверяем заказы…'}</p><button class="ops-submit" data-action="staff-enable-sound">${enabled?'Проверить сигнал':'Включить звук заказов'}</button><p class="hint">Сигнал работает, пока открыт экран сотрудника. Для сообщений при закрытом приложении нужен Telegram-бот.</p></div>`;
}
