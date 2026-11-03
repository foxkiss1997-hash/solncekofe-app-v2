/* Private event records. Public responses expose counts, never Telegram IDs or guest lists. */
function gamesGuest_(raw,props){
 const token=props.getProperty('TELEGRAM_BOT_TOKEN');
 if(!token)throw Error('Запись пока не подключена. Обратитесь в кофейню.');
 if(typeof raw!=='string'||raw.length>12000)throw Error('Откройте приложение заново в Telegram.');
 const data={};raw.split('&').forEach(pair=>{const i=pair.indexOf('=');if(i<0)return;const k=decodeURIComponent(pair.slice(0,i)),v=decodeURIComponent(pair.slice(i+1).replace(/\+/g,' '));if(Object.prototype.hasOwnProperty.call(data,k))throw Error('Некорректный вход Telegram.');data[k]=v;});
 const hash=data.hash;delete data.hash;
 if(!/^[a-f0-9]{64}$/.test(hash||'')||!/^\d+$/.test(data.auth_date||''))throw Error('Откройте приложение в Telegram для записи.');
 const age=Date.now()/1000-Number(data.auth_date);if(age< -60||age>86400)throw Error('Вход устарел. Закройте и откройте приложение в Telegram.');
 const bytes=s=>Utilities.newBlob(s).getBytes();
 const secret=Utilities.computeHmacSha256Signature(bytes(token),bytes('WebAppData'));
 const expected=Utilities.computeHmacSha256Signature(bytes(Object.keys(data).sort().map(k=>k+'='+data[k]).join('\n')),secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
 let mismatch=0;for(let i=0;i<64;i++)mismatch|=expected.charCodeAt(i)^hash.charCodeAt(i);
 if(mismatch)throw Error('Вход Telegram не подтверждён.');
 const user=JSON.parse(data.user||'{}');if(!Number.isSafeInteger(user.id)||user.id<=0)throw Error('Пользователь Telegram не подтверждён.');
 return {id:String(user.id),name:String(user.first_name||'Гость').slice(0,80)};
}
function gamesKey_(root,shop){return (root==='/ops_v3_test'?'GAMES_TEST_':'GAMES_')+shop;}
function gamesPublic_(event,guest,admin){
 const people=event.people||{},count=Object.keys(people).length;
 return {id:event.id,title:event.title,description:event.description,startAt:event.startAt,capacity:event.capacity,shopId:event.shopId,status:event.status,revision:event.revision,count,available:Math.max(0,event.capacity-count),joined:!!(guest&&people[guest.id]),...(admin?{participants:Object.values(people).map(p=>({name:p.name,joinedAt:p.joinedAt}))}:{})};
}
function handleGames_(r,root,props){
 if(![1,2].includes(r.shopId))throw Error('Выберите кофейню.');
 const admin=r.auth?.admin===true;if(admin)teamAdmin_(r,props);
 let guest=null;if(!admin&&r.initData)guest=gamesGuest_(r.initData,props);
 if(['gamesSave','gamesClose'].includes(r.action)&&!admin)throw Error('Встречами управляет владелец.');
 if(['gamesJoin','gamesLeave'].includes(r.action)&&!guest)throw Error('Откройте приложение в Telegram для записи.');
 const store=PropertiesService.getScriptProperties(),key=gamesKey_(root,r.shopId),lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  let events=JSON.parse(store.getProperty(key)||'{}');const now=Date.now();
  const list=()=>({gamesVersion:1,shopId:r.shopId,events:Object.values(events).filter(e=>admin||e.status==='open'&&e.startAt>now).sort((a,b)=>a.startAt-b.startAt).map(e=>gamesPublic_(e,guest,admin))});
  if(r.action==='gamesList')return list();
  const id=teamId_(r.id),old=events[id];
  if(r.action==='gamesSave'){
   const title=String(r.title||'').trim(),description=String(r.description||'').trim(),startAt=r.startAt,capacity=r.capacity;
   if(!title||title.length>80||description.length>400||!Number.isSafeInteger(startAt)||startAt<=now||startAt>now+180*86400000||!Number.isInteger(capacity)||capacity<2||capacity>20)throw Error('Укажите название, будущую дату и от 2 до 20 мест.');
   if(old&&old.revision!==r.expectedRevision||!old&&r.expectedRevision!==0)throw Error('Встреча изменилась. Обновите список.');
   if(old&&Object.keys(old.people||{}).length>capacity)throw Error('Мест меньше, чем записавшихся гостей.');
   // Keep at most 12 upcoming/recent meetings per point; no private guest data in Firebase.
   if(!old&&Object.values(events).filter(e=>e.startAt>now-7*86400000).length>=12)throw Error('Доступно до 12 встреч. Дождитесь завершения старых.');
   events=Object.fromEntries(Object.entries(events).filter(([,e])=>e.startAt>now-7*86400000));
   events[id]={id,title,description,startAt,capacity,shopId:r.shopId,status:old?.status||'open',revision:(old?.revision||0)+1,people:old?.people||{}};
  }else{
   if(!old)throw Error('Встреча не найдена.');
   if(r.action==='gamesClose'){if(old.revision!==r.expectedRevision)throw Error('Встреча изменилась. Обновите список.');old.status='cancelled';old.revision++;}
   else if(r.action==='gamesJoin'){
    if(old.status!=='open'||old.startAt<=now)throw Error('Запись на встречу закрыта.');
    old.people=old.people||{};
    if(!old.people[guest.id]){if(Object.keys(old.people).length>=old.capacity)throw Error('Все места заняты. Выберите другую встречу.');old.people[guest.id]={name:guest.name,joinedAt:now};old.revision++;}
   }else if(r.action==='gamesLeave'){if(old.people?.[guest.id]){delete old.people[guest.id];old.revision++;}}
   else throw Error('Неизвестное действие игр.');
  }
  const json=JSON.stringify(events);if(Utilities.newBlob(json).getBytes().length>8500)throw Error('Слишком много встреч. Обратитесь к владельцу.');
  store.setProperty(key,json);return {...list(),saved:true};
 }finally{lock.releaseLock();}
}
