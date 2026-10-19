import { create } from 'qrcode';
export function qrDataURL(text){
 const {modules}=create(text,{errorCorrectionLevel:'M'}),size=modules.size,margin=4;
 let path='';
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(modules.get(y,x))path+=`M${x+margin} ${y+margin}h1v1h-1z`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size+margin*2} ${size+margin*2}" width="300" height="300" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size+margin*2}v${size+margin*2}H0z"/><path fill="#171717" d="${path}"/></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
