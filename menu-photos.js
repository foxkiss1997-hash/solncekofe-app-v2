/* Generated serving illustrations; uploaded product photographs take precedence. */
const MENU_PHOTO_CELLS={
 esp:[0,0],amer:[0,1],flat:[0,2],cap:[0,3],latte:[0,4],raf:[0,5],icelatte:[0,6],icecap:[0,6],esptonik:[0,7],bumble:[0,8],earlgrey:[0,9],blackthyme:[0,9],buckwheat:[0,9],puer:[0,9],wildpeach:[0,9],strawberrypeach:[0,9],maplepecan:[0,9],matcha:[0,10],matchacurrant:[0,10],cacao:[0,11],
 pizzamargherita:[1,0],pizzapepperoni:[1,1],pizzafunghi:[1,2],cherrybumble:[1,5],matchaps:[1,6],greenjasmine:[1,7],tieguanyin:[1,7],puerorange:[1,8],mangochamomile:[1,9],mangoraspberry:[1,10],fresh:[1,11],
 raforange:[2,0],rafcheese:[2,1],rafhalva:[2,2],rafpanacotta:[2,3],rafbanana:[2,4],rafraspcoco:[2,5],rafsnickers:[2,6],rafbirdmilk:[0,5],caramelmacchiato:[2,7],raspberrycacao:[2,8],cherryamericano:[0,1]
};
function menuPhotoHTML(item){
 if(!item)return '';
 let cell=MENU_PHOTO_CELLS[item.id];
 if(item.name==='Карбонара')cell=[1,3];
 else if(item.name==='Крестьянская')cell=[1,4];
 else if(item.name==='ПП Сникерс')cell=[2,9];
 else if(item.name==='ПП Кето шоколад')cell=[2,10];
 else if(item.name==='Банан карамель')cell=[2,11];
 if(!cell)return '';
 const source=['drinks','food-tea','signature'][cell[0]],column=cell[1]%4,row=Math.floor(cell[1]/4);
 return `<img class="menu-thumb" src="assets/menu/${source}-${cell[1]}.webp" width="362" height="362" alt="Иллюстрация: ${esc(item.name)}" loading="lazy" decoding="async">`;
}
