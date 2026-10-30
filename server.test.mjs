import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHandler} from './server.mjs';

async function fixture(t,upstreamFetch){
  const server=http.createServer(createHandler({upstreamFetch}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));
  return 'http://127.0.0.1:'+server.address().port;
}
const headers={Authorization:'Bearer sk-jp-test-placeholder','Content-Type':'application/json',Origin:'https://linchenjie.github.io'};
const body={model:'nano_banana_2',prompt:'汉本养封面',aspect_ratio:'3:4',images:['https://example.com/product.jpg']};

test('submits documented async image payload and normalizes the task',async t=>{
  const url=await fixture(t,async(url,options)=>{
    assert.equal(url,'https://xjjuhe.site/v1/videos');assert.deepEqual(JSON.parse(options.body),body);
    assert.equal(options.headers.Authorization,headers.Authorization);
    return Response.json({id:'task_123',status:'queued',progress:0,secret:'not-to-return'});
  });
  const r=await fetch(url+'/api/image-tasks',{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),headers.Origin);
  assert.deepEqual(await r.json(),{id:'task_123',status:'queued',progress:0,url:''});
});
test('polls the same task and returns an HTTPS image result',async t=>{
  const url=await fixture(t,async url=>{assert.equal(url,'https://xjjuhe.site/v1/videos/task_123');return Response.json({id:'task_123',status:'completed',progress:100,url:'https://example.com/result.png'})});
  const r=await fetch(url+'/api/image-tasks/task_123',{headers});
  assert.equal((await r.json()).url,'https://example.com/result.png');
});
test('rejects GitHub credentials, invalid parameters and other origins without contacting provider',async t=>{
  const url=await fixture(t,()=>{throw Error('must not call')});
  assert.equal((await fetch(url+'/api/image-tasks',{method:'POST',headers:{...headers,Authorization:'Bearer ghp_not-a-provider-key'},body:JSON.stringify(body)})).status,401);
  assert.equal((await fetch(url+'/api/image-tasks',{method:'POST',headers,body:JSON.stringify({...body,prompt:' '})})).status,400);
  assert.equal((await fetch(url+'/api/image-tasks',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:JSON.stringify(body)})).status,403);
  assert.equal((await fetch(url+'/server.mjs')).status,404);
});
test('redacts upstream errors and handles HTTP 200 task failure',async t=>{
  const url=await fixture(t,async url=>url.endsWith('task_failed')?Response.json({id:'task_failed',status:'failed',error:'sensitive'}):Response.json({error:'secret'}, {status:401}));
  const r=await fetch(url+'/api/image-tasks/task_123',{headers});assert.equal(r.status,401);assert.ok(!(await r.text()).includes('secret'));
  const failed=await fetch(url+'/api/image-tasks/task_failed',{headers});assert.equal((await failed.json()).status,'failed');
});
