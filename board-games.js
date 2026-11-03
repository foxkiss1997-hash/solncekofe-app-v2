/* Meeting data is confirmed by the server; no optimistic or browser-only bookings. */
const gamesUI={shop:1,events:[],busy:false,loaded:false,error:'',message:'',draft:null,request:0};
function gamesAdmin(){return state.screen==='admin'&&state.adminAuthed&&state.adminTab==='games';}
function gamesDraft(){return gamesUI.draft||(gamesUI.draft={id:opsId(),title:'',description:'',start:'',capacity:6,expectedRevision:0});}
function renderGamesBanner(){return `<button class="games-banner" data-action="games-open"><b>🎲 Играем вместе</b><span>Настольные игры, кофе и хорошая компания</span><small>Выбрать встречу →</small></button>`;}
function gamesTransport(payload){
 const initData=window.Telegram?.WebApp?.initData||'';
 return sendOpsRequest({...payload,initData},gamesAdmin()?state.adminPinValue:'',gamesAdmin());
}
async function gamesLoad(){
 if(gamesUI.busy)return;
 const request=++gamesUI.request,shop=gamesUI.shop,admin=gamesAdmin();gamesUI.busy=true;gamesUI.error='';gamesUI.loaded=false;gamesUI.events=[];render();
 try{const r=await gamesTransport({action:'gamesList',shopId:shop});if(request!==gamesUI.request||shop!==gamesUI.shop||admin!==gamesAdmin())return;if(r.gamesVersion!==1||r.shopId!==shop||!Array.isArray(r.events))throw Error('Раздел игр ещё подключается.');gamesUI.events=r.events;gamesUI.loaded=true;}
 catch(e){if(request===gamesUI.request)gamesUI.error=/Неизвестное действие|Нет подтверждения Google/.test(e.message)?'Раздел игр ещё подключается. Запись пока недоступна.':e.message;}
 finally{if(request===gamesUI.request){gamesUI.busy=false;render();}}
}
async function gamesMutate(action,id){
 if(gamesUI.busy||!gamesUI.loaded)return;
 if(['gamesJoin','gamesLeave'].includes(action)&&!window.Telegram?.WebApp?.initData){gamesUI.error='Для записи откройте приложение в Telegram через @SolntseCard_bot.';render();return;}
 const d=gamesDraft(),event=gamesUI.events.find(e=>e.id===id),shop=gamesUI.shop,admin=gamesAdmin();
 const payload=action==='gamesSave'?{id:d.id,title:d.title,description:d.description,startAt:Date.parse(d.start+':00+03:00'),capacity:Number(d.capacity),expectedRevision:d.expectedRevision}:{id,expectedRevision:event?.revision};
 if(action==='gamesSave'&&(!d.title.trim()||!Number.isFinite(payload.startAt)||payload.startAt<=Date.now()||!Number.isInteger(payload.capacity)||payload.capacity<2||payload.capacity>20)){gamesUI.error='Укажите название, будущую дату и от 2 до 20 мест.';render();return;}
 gamesUI.busy=true;gamesUI.error='';gamesUI.message='';render();
 try{const r=await gamesTransport({...payload,action,shopId:shop});if(shop!==gamesUI.shop||admin!==gamesAdmin())return;if(r.gamesVersion!==1||r.shopId!==shop||!r.saved||!Array.isArray(r.events))throw Error('Нет подтверждения сервера. Обновите список перед повтором.');gamesUI.events=r.events;if(action==='gamesSave')gamesUI.draft=null;gamesUI.message=action==='gamesJoin'?'Вы записаны. Ждём вас в кофейне!':action==='gamesLeave'?'Участие отменено. Место освободилось.':action==='gamesClose'?'Встреча отменена.':'Встреча сохранена.';}
 catch(e){gamesUI.loaded=false;gamesUI.error=e.message+' Обновите список, чтобы проверить результат.';}
 finally{gamesUI.busy=false;render();}
}
function renderGamesContent(admin=false){
 const busy=gamesUI.busy,disabled=busy?'disabled':'',d=gamesDraft();
 return `<section class="games-content"><p class="hint">Можно прийти одному или с друзьями. Каждый участник записывается за себя.</p><label>Кофейня<select class="ops-select" data-games-field="shop" ${disabled}>${SHOPS.map(s=>`<option value="${s.id}" ${gamesUI.shop===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><button class="ops-cancel" data-action="games-refresh" ${disabled}>${busy?'Загружаем…':'Обновить встречи'}</button>${gamesUI.error?`<p role="alert" class="ops-message bad">${esc(gamesUI.error)}</p>`:''}${gamesUI.message?`<p role="status">${esc(gamesUI.message)}</p>`:''}
 ${admin?`<form class="ops-form" data-games-form><h3>${d.expectedRevision?'Редактирование встречи':'Новая встреча'}</h3><label>Игра / название<input class="text-input" data-games-field="title" maxlength="80" value="${esc(d.title)}" ${disabled}></label><label>Дата и время (Москва)<input class="text-input" type="datetime-local" data-games-field="start" value="${esc(d.start)}" ${disabled}></label><label>Всего мест<input class="text-input" type="number" min="2" max="20" data-games-field="capacity" value="${esc(String(d.capacity))}" ${disabled}></label><label>Условия, стоимость, правила для новичков<textarea class="text-input" data-games-field="description" maxlength="400" ${disabled}>${esc(d.description)}</textarea></label><button type="button" class="ops-submit" data-action="games-save" ${busy||!gamesUI.loaded?'disabled':''}>Сохранить встречу</button>${d.expectedRevision?'<button type="button" class="ops-cancel" data-action="games-new">Новая встреча</button>':''}</form>`:''}
 ${gamesUI.loaded&&!gamesUI.events.length?'<div class="profile-glass"><h2>Скоро соберёмся за игрой</h2><p>Расписание этой кофейни ещё не опубликовано. Загляните позже.</p></div>':''}
 ${gamesUI.events.map(e=>`<article class="profile-glass games-event"><h2>${esc(e.title)}</h2><p>${esc(new Date(e.startAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'long',timeStyle:'short'}))} · Москва</p><p class="hint">${esc(SHOPS.find(s=>s.id===e.shopId)?.name||'')}</p><p style="white-space:pre-wrap">${esc(e.description)}</p><b>${e.status==='cancelled'?'Встреча отменена':e.startAt<=Date.now()?'Встреча началась':e.joined?'Вы участвуете':e.available?'Свободно мест: '+e.available+' из '+e.capacity:'Все места заняты'}</b>${admin?`<p>Записалось: ${e.count}</p><ul>${(e.participants||[]).map(p=>`<li>${esc(p.name)}</li>`).join('')}</ul><button class="ops-cancel" data-action="games-edit" data-id="${esc(e.id)}" ${disabled}>Редактировать</button>${e.status==='open'?`<button class="ops-cancel" data-action="games-close" data-id="${esc(e.id)}" ${disabled}>Отменить встречу</button>`:''}`:e.joined?`<button class="ops-cancel" data-action="games-leave" data-id="${esc(e.id)}" ${disabled}>Отменить участие</button>`:e.status==='open'&&e.startAt>Date.now()?`<button class="ops-submit" data-action="games-join" data-id="${esc(e.id)}" ${busy||!e.available?'disabled':''}>Участвовать</button>`:''}</article>`).join('')}</section>`;
}
function renderBoardGames(){return `<div class="screen"><header class="topbar"><button class="iconbtn" data-action="back-to-menu" aria-label="К меню">←</button><h2>Играем вместе</h2></header>${renderGamesContent()}${tabBarHTML('games')}</div>`;}
document.addEventListener('submit',e=>{if(e.target.matches('[data-games-form]')){e.preventDefault();gamesMutate('gamesSave');}});
document.addEventListener('input',e=>{const f=e.target.dataset.gamesField;if(f&&f!=='shop')gamesDraft()[f]=e.target.value;});
document.addEventListener('change',e=>{if(e.target.dataset.gamesField==='shop'){gamesUI.shop=Number(e.target.value);gamesUI.draft=null;gamesUI.message='';gamesLoad();}});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;
 if(a==='games-open'||a==='tab-go-games'){state.screen='games';gamesUI.shop=state.shopId;gamesUI.message='';gamesLoad();}
 else if(a==='admin-set-tab'&&el.dataset.tab==='games'){gamesUI.message='';queueMicrotask(()=>gamesLoad());}
 else if(a==='games-refresh')gamesLoad();
 else if(a==='games-save')gamesMutate('gamesSave');
 else if(a==='games-join')gamesMutate('gamesJoin',el.dataset.id);
 else if(a==='games-leave')gamesMutate('gamesLeave',el.dataset.id);
 else if(a==='games-close'){if(confirm('Отменить встречу для всех участников?'))gamesMutate('gamesClose',el.dataset.id);}
 else if(a==='games-new'&&!gamesUI.busy){gamesUI.draft=null;render();}
 else if(a==='games-edit'&&!gamesUI.busy){const x=gamesUI.events.find(e=>e.id===el.dataset.id);if(x){gamesUI.draft={id:x.id,title:x.title,description:x.description,capacity:x.capacity,expectedRevision:x.revision,start:new Date(x.startAt+3*3600000).toISOString().slice(0,16)};render();}}
});
