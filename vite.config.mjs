import {defineConfig} from 'vite';
export default defineConfig({plugins:[{name:'preview-entry',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url==='/'||req.url.startsWith('/?'))req.url='/preview.html'+req.url.slice(1);next();});}}],server:{host:'0.0.0.0',allowedHosts:['terminal.local']}});
