const fs=require('fs');
let html=fs.readFileSync('preorder.html','utf8');
html=html.replace('<head>','<head><script src="preview-fixtures.js?v=calendar2"></script>');
html=html.replace('<script src="https://telegram.org/js/telegram-web-app.js"></script>','');
html=html.replace('/* ---------- INIT ---------- */',`/* ---------- INIT ---------- */
if(window.SOLNCE_PREVIEW){sendOpsRequest=window.previewRequest;window.previewSetup(state,typeof teamUI!=='undefined'?teamUI:null);}
`);
html=html.replace('const operationsEntry = new URLSearchParams(location.search).get(\'screen\');',"const operationsEntry = new URLSearchParams(location.search).get('screen');");
html=html.replace("if(operationsEntry==='card')state.screen='card';","if(operationsEntry==='card')state.screen='card';\nif(window.SOLNCE_PREVIEW&&new URLSearchParams(location.search).get('role')==='owner'){state.screen='admin';state.adminAuthed=true;state.adminTab='overview';}");
// / is a preview, production redirect remains untouched.
fs.writeFileSync('preview.html',html);
console.log('Isolated preview generated');

const review=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Солнцекофе — проверка дизайна</title><style>body{margin:0;background:#f2eee6;font-family:system-ui;color:#30291f}header{padding:12px 20px;display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:13px}main{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;padding:10px}iframe{width:390px;height:844px;border:0;background:#fff;border-radius:22px;box-shadow:0 5px 30px #3d281b10}a{color:#66501e}</style></head><body><header><span>Солнцекофе · проверка на телефоне · демоданные</span><span><a href="?width=320">320</a> · <a href="?width=390">390</a> · <a href="?width=440">440</a></span></header><main><iframe title="Меню" src="preview.html?lid=DEMO&view=menu-cart&revision=glass2"></iframe><iframe title="Настройка напитка" src="preview.html?lid=DEMO&view=drink&revision=glass2"></iframe></main><script>const width=Number(new URLSearchParams(location.search).get('width'));if([320,390,440].includes(width))for(const frame of document.querySelectorAll('iframe'))frame.style.width=width+'px';</script></body></html>`;
fs.writeFileSync('design-review.html',review);
