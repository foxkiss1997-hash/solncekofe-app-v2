import {build} from 'vite';
import {readFileSync,writeFileSync} from 'node:fs';
await build({configFile:false,build:{lib:{entry:'scripts/loyalty-qr-entry.js',name:'SolnceQR',formats:['iife'],fileName:()=> 'loyalty-qr.js'},outDir:'assets',emptyOutDir:false,minify:true}});
writeFileSync('assets/loyalty-qr.LICENSE.txt',readFileSync('node_modules/qrcode/license','utf8')+'\n\nDijkstraJS dependency:\n'+readFileSync('node_modules/dijkstrajs/LICENSE.md','utf8'));
