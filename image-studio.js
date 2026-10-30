const IMAGE_TASK_KEY = 'hanbenyang-image-task-v1';
const IMAGE_MODELS = 'nano_banana_2';
let imageTask = null;
try { imageTask = JSON.parse(localStorage.getItem(IMAGE_TASK_KEY) || 'null'); } catch {}
let imageDraft = { prompt: '', ratio: '3:4', references: '' };
let imageConnection = { endpoint: location.protocol.startsWith('http') && ['localhost', '127.0.0.1'].includes(location.hostname) ? location.origin : '', key: '' };
let imageBusy = false, imageMessage = '', imageTimer = null, imageController = null, imageAttempt = 0;
const imageStatusNames = { submitted: '已提交', queued: '排队中', processing: '生成中', completed: '已完成', failed: '生成失败' };

function imageStudio() {
  return `${heading('为你的表达，配一张好封面','汉本养 · 抖音封面、女性日常养护与门店内容配图。')}
    <div class="image-workspace"><form id="image-form">
      <section class="form-section"><h2>画面内容</h2>
        <div class="tag-group">${['女性养护','门店日常','主理人封面'].map((s,i)=>`<button type="button" class="filter-chip" data-image-preset="${i}">${s}</button>`).join('')}</div>
        <label class="field"><span>图片描述</span><textarea class="textarea image-prompt" name="prompt" maxlength="10000" required placeholder="描述主体、场景、光线和构图，也可以写上需要出现的文字…">${esc(imageDraft.prompt)}</textarea></label>
        <label class="field"><span>画面比例</span><select class="select" name="ratio">${[['3:4','3:4 · 图文封面'],['9:16','9:16 · 竖屏封面'],['1:1','1:1 · 方形配图'],['16:9','16:9 · 横向配图'],['4:3','4:3 · 横向构图']].map(([v,t])=>`<option value="${v}" ${imageDraft.ratio===v?'selected':''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>参考图直链（可选）</span><textarea class="textarea" name="references" placeholder="https://…/product.jpg&#10;每行一张，最多 8 张" maxlength="16000">${esc(imageDraft.references)}</textarea><small>使用你有权上传的产品、门店或人物图片直链。</small></label>
      </section>
      <section class="form-section"><h2>生成服务</h2>
        <label class="field"><span>中转服务地址</span><input class="input" name="endpoint" type="url" value="${esc(imageConnection.endpoint)}" placeholder="https://你的中转服务域名" required autocomplete="off"><small>填写你部署的中转服务地址，不能填写文档页面地址。</small></label>
        <label class="field"><span>xjjuhe API Key</span><input class="input" name="apiKey" type="password" value="${esc(imageConnection.key)}" placeholder="sk-jp-…" required autocomplete="off" spellcheck="false"><small>密钥仅在当前页面会话中使用。GitHub 令牌不适用于此处。</small></label>
        <button class="button primary full-button" id="generate-image" type="submit" ${imageBusy?'disabled':''}>${icon('sparkles')}${imageBusy?'正在处理…':'生成 1 张图片'}</button>
        <p class="form-hint">Nano Banana 2 · 提交后按平台规则计费</p>
      </section>
    </form><section class="image-result-section" aria-label="生成结果">
      <div class="section-heading"><h2>生成结果</h2><span class="small muted">Nano Banana 2</span></div>
      <div class="image-result" id="image-result">${imageResult()}</div>
      <div id="image-message" class="image-message" role="status" aria-live="polite">${esc(imageMessage)}</div>
      <p class="form-hint">生成链接可能有时效，完成后请及时打开图片并保存。</p>
      <details class="image-connection-note"><summary>连接状态</summary><p>GitHub Pages 仅托管页面。中转服务需单独运行；当前尚未配置公共服务。密钥不会写入浏览器存储、备份或 GitHub 仓库。</p><a href="https://xjjuhe.site/docs/nano-banana" target="_blank" rel="noopener noreferrer">查看平台生图文档 ↗</a></details>
    </section></div>`;
}

function safeImageUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}

function imageResult() {
  if (!imageTask) return `<div class="image-placeholder">${icon('image-plus')}<h3>留一个画面给你的故事</h3><p>女性日常 · 门店场景 · 品牌表达</p><img src="assets/tea.jpg" alt="茶饮选题参考配图"><span>图库示例，非生成结果</span></div>`;
  const url = imageTask.status === 'completed' ? safeImageUrl(imageTask.url) : '';
  return `${url?`<img class="generated-image" src="${esc(url)}" alt="${esc(imageTask.prompt || 'AI 生成配图')}" id="generated-image">`:`<div class="image-task-status">${icon(imageTask.status==='failed'?'circle-alert':'image')}<strong>${esc(imageStatusNames[imageTask.status]||'查询中')}</strong><progress max="100" value="${Number(imageTask.progress)||0}"></progress><span>${Math.round(Number(imageTask.progress)||0)}%</span></div>`}
    <div class="image-result-meta"><strong>${esc(imageStatusNames[imageTask.status]||'等待查询')}</strong><p>${esc(imageTask.prompt || '')}</p><small>任务：${esc(imageTask.id)}</small></div>
    <div class="image-result-actions">${url?`<a class="button primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}打开原图并保存</a>`:''}${imageTask.status!=='completed'&&imageTask.status!=='failed'?`<button class="button" id="resume-image" ${imageBusy?'disabled':''}>${icon('refresh-cw')}继续查询</button>`:''}${imageBusy?`<button class="button" id="pause-image">${icon('pause')}暂停查询</button>`:''}</div>`;
}

function paintImageResult() {
  if (page !== 'images') return;
  const result = document.getElementById('image-result');
  if (!result) return;
  result.innerHTML = imageResult();
  document.getElementById('image-message').textContent = imageMessage;
  const generate = document.getElementById('generate-image');
  generate.disabled = imageBusy;
  generate.innerHTML = `${icon('sparkles')}${imageBusy?'正在处理…':'生成 1 张图片'}`;
  document.getElementById('resume-image')?.addEventListener('click', resumeImageTask);
  document.getElementById('pause-image')?.addEventListener('click', pauseImageTask);
  document.getElementById('generated-image')?.addEventListener('error',()=>{imageMessage='图片暂时无法加载，请打开原图检查链接是否已过期。';document.getElementById('image-message').textContent=imageMessage});
  icons();
}

function bindImageStudio() {
  const form = document.getElementById('image-form');
  form.addEventListener('input', readImageForm);
  form.addEventListener('submit', submitImageTask);
  form.querySelectorAll('[data-image-preset]').forEach(el=>el.addEventListener('click',()=>{
    const presets = [
      '为汉本养制作女性日常养护主题的抖音图文封面。一杯温热茶饮、自然光下的生活记录本与新鲜花枝，清新柔和的绿色与白色，真实静物摄影，画面干净，上方留出标题空间，不出现功效承诺或虚构产品包装。',
      '为汉本养制作门店日常主题配图。明亮整洁的女性日常养护空间，木质桌面、绿植、自然窗光，真实空间摄影，安静亲切的氛围，前景留白，不虚构真实门店标识，不添加文字。',
      '为汉本养主理人故事制作抖音封面背景。书桌上的笔记本、茶杯与一枝鲜花，自然窗光、简洁构图，白色与植物绿搭配，真实静物摄影，左上方留出人物及标题的位置，不出现人物或文字。'
    ];
    form.elements.prompt.value = presets[Number(el.dataset.imagePreset)];
    readImageForm();
  }));
  paintImageResult();
}

function readImageForm() {
  const f = document.getElementById('image-form');
  if (!f) return;
  imageDraft = { prompt: f.elements.prompt.value, ratio: f.elements.ratio.value, references: f.elements.references.value };
  imageConnection = { endpoint: f.elements.endpoint.value.trim(), key: f.elements.apiKey.value.trim() };
}

function validateImageConnection() {
  if (/^(ghp_|github_pat_)/i.test(imageConnection.key)) throw new Error('这是 GitHub 令牌，请改用 xjjuhe 控制台的 API Key。');
  if (!imageConnection.key) throw new Error('请填写 xjjuhe API Key。');
  let u;
  try { u = new URL(imageConnection.endpoint); } catch { throw new Error('请填写中转服务地址。'); }
  if (u.username || u.password || u.search || u.hash || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname)))) throw new Error('中转服务应使用 HTTPS，本机可使用 localhost 的 HTTP 地址。');
  if (u.hostname === 'xjjuhe.site') throw new Error('请填写你自己的中转服务地址，不是平台或文档网址。');
  return u.href.replace(/\/$/, '');
}

async function imageRequest(path, method='GET', body) {
  const base = validateImageConnection();
  imageController = new AbortController();
  const timeout = setTimeout(()=>imageController?.abort(), 45000);
  try {
    const r = await fetch(base + '/api/image-tasks' + path, { method, headers: { 'Authorization': 'Bearer '+imageConnection.key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: imageController.signal });
    const data = await r.json().catch(()=>({error:'中转服务没有返回有效 JSON，请确认地址。'}));
    if (!r.ok) throw new Error(typeof data.error==='string'?data.error:'生成请求失败，请稍后重试。');
    return data;
  } catch(e) {
    if (e.name === 'AbortError') throw new Error('查询已暂停或请求超时；若已有任务，请继续查询，不要重复提交。');
    if (e instanceof TypeError) throw new Error('无法连接中转服务，请确认服务已运行并允许本站访问。');
    throw e;
  } finally { clearTimeout(timeout); imageController = null; }
}

function storeImageTask() {
  try { localStorage.setItem(IMAGE_TASK_KEY, JSON.stringify(imageTask)); } catch { imageMessage = '任务无法存入浏览器，请记录任务 ID。'; }
}

async function submitImageTask(e) {
  e.preventDefault();
  if (imageBusy) return;
  readImageForm();
  try {
    validateImageConnection();
    const prompt = imageDraft.prompt.trim();
    if (!prompt || prompt.length > 10000) throw new Error('请填写 1 至 10000 字的图片描述。');
    const images = imageDraft.references.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (images.length > 8 || images.some(s=>!/^https?:\/\//.test(s))) throw new Error('参考图需为 HTTP(S) 直链，最多 8 张。');
    if (imageTask && !['completed','failed'].includes(imageTask.status)) throw new Error('已有未完成的任务，请先继续查询，避免重复计费。');
    imageBusy = true; imageMessage = '正在提交，请勿重复操作。'; paintImageResult();
    const data = await imageRequest('', 'POST', { model: IMAGE_MODELS, prompt, aspect_ratio: imageDraft.ratio, ...(images.length ? {images} : {}) });
    if (!data.id) throw new Error('服务没有返回任务 ID，请先在平台控制台确认提交结果，避免重复计费。');
    imageTask = { id: data.id, prompt, ratio: imageDraft.ratio, status: data.status, progress: data.progress || 0, url: data.url || '' };
    storeImageTask(); imageAttempt = 0;
    imageMessage = '任务已提交，正在等待生成结果。';
    await pollImageTask();
  } catch(e) { imageBusy = false; imageMessage = e.message; paintImageResult(); }
}

async function pollImageTask() {
  if (!imageBusy || !imageTask) return;
  try {
    const data = await imageRequest('/'+encodeURIComponent(imageTask.id));
    imageTask = {...imageTask,status:data.status,progress:data.progress||0,url:data.url||''};
    storeImageTask();
    if (data.status === 'completed') { imageBusy=false;imageMessage=safeImageUrl(data.url)?'图片已生成，请及时保存。':'任务已完成，但缺少有效图片链接，请在平台控制台查看。'; }
    else if (data.status === 'failed') { imageBusy=false;imageMessage=data.error||'生成失败，请检查平台控制台。'; }
    else if (++imageAttempt >= 200) { imageBusy=false;imageMessage='已暂停自动查询。稍后可继续查询同一任务。'; }
    else { imageMessage='图片生成中，每 3 秒查询一次。';imageTimer=setTimeout(pollImageTask,3000); }
  } catch(e) { imageBusy=false;imageMessage=e.message+' 已保留任务 ID，可继续查询。'; }
  paintImageResult();
}

function resumeImageTask() {
  if (imageBusy || !imageTask) return;
  readImageForm();
  try { validateImageConnection(); imageBusy=true;imageAttempt=0;paintImageResult();pollImageTask(); }
  catch(e) { imageMessage=e.message;paintImageResult(); }
}

function pauseImageTask() {
  imageBusy=false;clearTimeout(imageTimer);imageController?.abort();
  imageMessage='已暂停查询，平台生成仍会继续。可继续查询已有任务。';paintImageResult();
}
