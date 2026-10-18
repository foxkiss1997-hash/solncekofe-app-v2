/* Base catalog snapshot. Database overrides remain authoritative. */
const ORDER_BASE_ITEMS = [
  // Классика
  {id:'esp', category:'coffee', name:'Эспрессо', sizes:{s:190}, hit:true, icon:'☕'},
  {id:'amer', category:'coffee', name:'Американо', sizes:{s:220,m:270}, icon:'☕'},
  {id:'flat', category:'coffee', name:'Флэт уайт', sizes:{s:300,m:350}, hit:true, icon:'☕'},
  {id:'cap', category:'coffee', name:'Капучино', sizes:{s:250,m:300,l:340}, hit:true, icon:'☕'},
  {id:'latte', category:'coffee', name:'Латте', sizes:{m:320,l:360}, icon:'☕'},
  {id:'raf', category:'coffee', name:'Раф', sizes:{m:360,l:400}, hit:true, icon:'☕'},

  // Холодные напитки
  {id:'esptonik', category:'cold', name:'Эспрессо тоник', sizes:{m:320,l:370}, icon:'🧊'},
  {id:'icelatte', category:'cold', name:'Айс латте', sizes:{m:320,l:370}, icon:'🧊'},
  {id:'icecap', category:'cold', name:'Айс капучино', sizes:{m:320,l:370}, icon:'🧊'},
  {id:'matchaps', category:'cold', name:'Матча персик-кокос', sizes:{m:320,l:370}, hit:true, icon:'🍑'},
  {id:'bumble', category:'cold', name:'Бамбл', sizes:{m:400,l:450}, icon:'🧊'},
  {id:'cherrybumble', category:'cold', name:'Вишнёвый бамбл', sizes:{m:320,l:370}, icon:'🍒'},

  // Чай листовой
  {id:'earlgrey', category:'tea', name:'Эрл Грей', sizes:{m:220,l:250}, icon:'🍵'},
  {id:'blackthyme', category:'tea', name:'Чёрный с чабрецом', sizes:{m:220,l:250}, icon:'🍵'},
  {id:'greenjasmine', category:'tea', name:'Зелёный с жасмином', sizes:{m:220,l:250}, icon:'🍵'},
  {id:'buckwheat', category:'tea', name:'Гречишный', sizes:{m:220,l:250}, icon:'🍵'},
  {id:'tieguanyin', category:'tea', name:'Те гуань инь', sizes:{m:220,l:250}, icon:'🍵'},
  {id:'puer', category:'tea', name:'Пуэр', sizes:{m:220,l:250}, icon:'🍵'},
  {id:'wildpeach', category:'tea', name:'Дикий персик', sizes:{m:220,l:250}, icon:'🍵'},
  {id:'strawberrypeach', category:'tea', name:'Земляника персик', sizes:{m:220,l:250}, icon:'🍵'},

  // Не кофе
  {id:'cacao', category:'notcoffee', name:'Какао', sizes:{s:250,m:300,l:350}, hit:true, icon:'🍫'},
  {id:'matcha', category:'notcoffee', name:'Матча', sizes:{s:290,m:340,l:420}, hit:true, icon:'🍵'},
  {id:'matchacurrant', category:'notcoffee', name:'Матча смородина', sizes:{s:330,m:360,l:390}, icon:'🍵'},
  {id:'puerorange', category:'notcoffee', name:'Пуэр апельсин', sizes:{m:310,l:450}, icon:'🍊'},
  {id:'mangochamomile', category:'notcoffee', name:'Манго ромашка', sizes:{m:310,l:450}, icon:'🥭'},
  {id:'mangoraspberry', category:'notcoffee', name:'Манго малина', sizes:{m:310,l:450}, hit:true, icon:'🥭'},
  {id:'maplepecan', category:'notcoffee', name:'Кленовый пекан', sizes:{m:310,l:450}, icon:'🍁'},
  {id:'fresh', category:'notcoffee', name:'Фрэш', sizes:{s:400,m:450,l:500}, hit:true, icon:'🍹'},

  // Авторские — Рафы
  {id:'raforange', category:'signature', name:'Раф апельсин', sizes:{m:380,l:420}, hit:true, icon:'🍊'},
  {id:'rafcheese', category:'signature', name:'Раф сырный', sizes:{m:380,l:420}, icon:'☕'},
  {id:'rafhalva', category:'signature', name:'Раф халва', sizes:{m:380,l:420}, icon:'☕'},
  {id:'rafpanacotta', category:'signature', name:'Раф Пана котта с вишней', sizes:{m:380,l:420}, hit:true, icon:'🍒'},
  {id:'rafbanana', category:'signature', name:'Раф банановое мороженое', sizes:{m:380,l:420}, icon:'🍌'},
  {id:'rafraspcoco', category:'signature', name:'Раф малина кокос', sizes:{m:380,l:420}, hit:true, icon:'🍓'},
  {id:'rafsnickers', category:'signature', name:'Раф Сникерс', sizes:{m:380,l:420}, hit:true, icon:'🥜'},
  {id:'rafbirdmilk', category:'signature', name:'Раф птичье молоко', sizes:{m:380,l:420}, icon:'☕'},
  // Авторские — Другие напитки
  {id:'caramelmacchiato', category:'signature', name:'Карамель маккиато', sizes:{m:380,l:420}, icon:'☕'},
  {id:'cherryamericano', category:'signature', name:'Вишнёвый американо', sizes:{m:380,l:420}, icon:'🍒'},
  {id:'raspberrycacao', category:'signature', name:'Малиновое какао', sizes:{m:380,l:420}, icon:'🍫'},

  // Пицца
  {id:'pizzamargherita', category:'pizza', name:'Маргарита', sizes:{m:750}, hit:true, icon:'🍕'},
  {id:'pizzapepperoni', category:'pizza', name:'Пепперони', sizes:{m:750}, hit:true, icon:'🍕'},
  {id:'pizzafunghi', category:'pizza', name:'4 сыра', sizes:{m:750}, icon:'🍕'},

  // ПП десерты
  {id:'ppcheesecake', category:'fitness', name:'ПП Сникерс', sizes:{m:330}, hit:true, icon:'🍰'},
  {id:'ppbrownie', category:'fitness', name:'ПП Кето шоколад', sizes:{m:330}, icon:'🍫'},
  {id:'ppenergy', category:'fitness', name:'Банан карамель', sizes:{m:330}, icon:'🥥'},
];
