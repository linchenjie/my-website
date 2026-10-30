import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const ROOT=fileURLToPath(new URL('.',import.meta.url));
const MODEL='nano_banana_2';
const RATIOS=new Set(['1:1','9:16','16:9','3:4','4:3','3:2','2:3','5:4','4:5','21:9','auto']);
const STATUS=new Set(['submitted','queued','processing','completed','failed']);
const MAX_BODY=32000;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.txt':'text/plain; charset=utf-8'};
const allowedFiles=new Set(['index.html','app.js','image-studio.js','styles.css','assets/lucide.js','assets/tea.jpg','assets/store.jpg','assets/woman.jpg','assets/LUCIDE-LICENSE.txt']);

function respond(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function keyFrom(req){const h=req.headers.authorization||'';if(!/^Bearer \S{8,300}$/.test(h)||/^Bearer (ghp_|github_pat_)/i.test(h))return '';return h.slice(7)}
function normalizedTask(data){
  const id=String(data.id||data.task_id||'');
  if(!/^[a-zA-Z0-9_-]{1,200}$/.test(id))throw new Error('invalid_task');
  const status=STATUS.has(data.status)?data.status:'submitted';
  let url='';try{const u=new URL(data.url);if(u.protocol==='https:')url=u.href}catch{}
  return {id,status,progress:Math.min(100,Math.max(0,Number(data.progress)||0)),url,...(status==='failed'?{error:'平台生成失败，请使用任务 ID 在控制台查看原因。'}:{})};
}

export function createHandler({upstreamFetch=fetch,allowedOrigins=['https://linchenjie.github.io'],port=8787}={}){
  const localOrigins=[`http://localhost:${port}`,`http://127.0.0.1:${port}`];
  return async function(req,res){
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    const origin=req.headers.origin;
    if(origin){
      if(![...allowedOrigins,...localOrigins].includes(origin)){respond(res,403,{error:'此来源未获允许，请从部署的网站访问。'});return}
      res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    }
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/api/health'){respond(res,200,{ok:true,model:MODEL});return}
    if(path.startsWith('/api/')){
      const match=path.match(/^\/api\/image-tasks(?:\/([a-zA-Z0-9_-]{1,200}))?$/);
      if(!match){respond(res,404,{error:'接口不存在。'});return}
      const key=keyFrom(req);
      if(!key){respond(res,401,{error:'请填写 xjjuhe API Key，不要使用 GitHub 令牌。'});return}
      if((req.method!=='POST'||match[1])&&(req.method!=='GET'||!match[1])){respond(res,405,{error:'请求方法不受支持。'});return}
      let body;
      if(req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json')){respond(res,415,{error:'需要 JSON 请求。'});return}
        try{
          const chunks=[];let size=0;
          for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY){respond(res,413,{error:'描述或参考链接太长。'});return}chunks.push(chunk)}
          const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.trim().length>10000||data.model!==MODEL||!RATIOS.has(data.aspect_ratio))throw Error();
          if(data.images!==undefined&&(!Array.isArray(data.images)||data.images.length>8||data.images.some(s=>{try{const u=new URL(s);return !['http:','https:'].includes(u.protocol)||!!u.username||!!u.password}catch{return true}})))throw Error();
          body={model:MODEL,prompt:data.prompt.trim(),aspect_ratio:data.aspect_ratio,...(data.images?.length?{images:data.images}:{})};
        }catch{respond(res,400,{error:'请检查图片描述、比例及参考图链接。'});return}
      }
      try{
        const upstream=await upstreamFetch('https://xjjuhe.site/v1/videos'+(match[1]?'/'+encodeURIComponent(match[1]):''),{method:req.method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(40000),redirect:'error'});
        if(!upstream.ok){const messages={400:'参数无效，请检查参考图及描述。',401:'API Key 无效，请在 xjjuhe 控制台重新检查。',403:'平台拒绝访问，请检查权限、余额或 IP 白名单。',404:'任务或模型不存在，请检查账号权限。',429:'平台请求过于频繁，请稍后继续查询。'};respond(res,upstream.status>=400&&upstream.status<=599?upstream.status:502,{error:messages[upstream.status]||'平台暂时不可用，请稍后查看已有任务。'});return}
        const task=normalizedTask(await upstream.json());respond(res,200,task);
      }catch{respond(res,502,{error:'平台响应异常或超时。提交结果可能已产生，请先到平台确认，避免重复计费。'})}
      return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){respond(res,405,{error:'请求方法不受支持。'});return}
    const file=path==='/'?'index.html':path.slice(1);
    if(!allowedFiles.has(file)){respond(res,404,{error:'文件不存在。'});return}
    const target=resolve(ROOT,file);
    if(!target.startsWith(ROOT.endsWith(sep)?ROOT:ROOT+sep)){respond(res,404,{error:'文件不存在。'});return}
    try{const data=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data)}catch{respond(res,404,{error:'文件不存在。'})}
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
  const allowedOrigins=(process.env.ALLOWED_ORIGINS||'https://linchenjie.github.io').split(',').map(s=>s.trim());
  http.createServer(createHandler({port,allowedOrigins})).listen(port,host,()=>console.log(`Hanbenyang studio: http://${host}:${port}`));
}
