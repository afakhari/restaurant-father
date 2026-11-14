import {searchKey,parseTomanInput,parseCountInput} from './iran-locale.js';
const app=document.querySelector('#app'),toastElement=document.querySelector('#toast');
const fmt=new Intl.NumberFormat('fa-IR');
const state={me:null,data:null,view:'hall',branchId:null,tableId:null,cashTableId:null,cat:'همه',search:'',draft:[],roundKey:null,aiPreview:null,aiRevision:0,aiRequest:null,aiLoading:false,aiWarning:'',discountDraft:null,payMethod:'pos',busy:false,lastUpdate:null,poll:null,mobileStage:'tables',aiText:'',features:{aiEnabled:false},connection:'loading',pendingRefresh:false};
const labels={manager:'مدیر',waiter:'پیشخدمت',kitchen:'آشپزخانه',cashier:'صندوق‌دار',queued:'در صف',preparing:'در حال آماده‌سازی',ready:'آماده تحویل',served:'تحویل‌شده',cancelled:'لغوشده',cash:'نقدی',pos:'کارت‌خوان',card_to_card:'کارت‌به‌کارت'};
const e=(s)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const toman=(v)=>`${fmt.format(Number(v)||0)} تومان`;
const date=(v)=>new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(v));
const since=(v)=>`${fmt.format(Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/60000)))} دقیقه`;
const can=(...roles)=>roles.includes(state.me?.role);
const localDemo=()=>['localhost','127.0.0.1'].includes(location.hostname);
const activeSessions=()=>state.data?.sessions.filter(s=>!s.closed_at)??[];
const sessionFor=(tableId)=>activeSessions().find(s=>s.table_id===tableId)??null;
const roundsFor=(sessionId)=>state.data?.rounds.filter(x=>x.session_id===sessionId).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))??[];
const itemsFor=(sessionId)=>{const ids=new Set(roundsFor(sessionId).map(r=>r.id));return state.data?.items.filter(x=>ids.has(x.round_id))??[];};
const subtotal=(items)=>items.filter(i=>i.status!=='cancelled').reduce((sum,i)=>sum+i.quantity*i.unit_price_toman,0);
const readyCount=(tableId)=>{const s=sessionFor(tableId);return s?itemsFor(s.id).filter(x=>x.status==='ready').length:0;};
const selectedBranch=()=>state.data?.branches.find(b=>b.id===state.branchId);
const currentTables=()=>state.data?.tables.filter(t=>t.branch_id===state.branchId)??[];
function notify(message,error=false){toastElement.textContent=message;toastElement.className=`toast ${error?'error':''}`;toastElement.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>toastElement.hidden=true,4200);}
async function api(url,options={}){const headers={'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{})};const response=await fetch(url,{credentials:'same-origin',...options,headers:{...headers,...options.headers}});let data;try{data=await response.json()}catch{throw Error('پاسخ نامعتبر از سرور دریافت شد.')}if(!response.ok){const error=Error(data.error?.message??'درخواست انجام نشد.');error.status=response.status;error.code=data.error?.code;throw error;}return data;}
function updateConnection(status){
 if(state.connection===status)return;
 state.connection=status;
 const node=document.querySelector('#sync-status');
 if(node){node.dataset.status=status;node.textContent=status==='offline'?'ارتباط قطع است':status==='loading'?'در حال همگام‌سازی…':'اطلاعات به‌روز است';}
}
function clearOrderDraft(){state.aiRequest?.controller?.abort();state.aiRequest=null;state.aiRevision++;state.aiLoading=false;state.aiWarning='';state.draft=[];state.roundKey=null;state.aiPreview=null;state.aiText='';}
function resetWorkspace(){
 clearOrderDraft();state.discountDraft=null;state.data=null;state.branchId=null;state.tableId=null;state.cashTableId=null;
 state.cat='همه';state.search='';state.payMethod='pos';state.mobileStage='tables';
 state.pendingRefresh=false;state.lastUpdate=null;state.features={aiEnabled:false};
}
function confirmDiscard(){return !(state.draft.length||state.aiText.trim()||state.aiPreview)||window.confirm('این میز توضیح یا پیش‌نویس ثبت‌نشده دارد. با خروج از آن، متن و پیشنهاد حذف می‌شود. ادامه می‌دهید؟');}
function keepViewportRender(){render();}
async function run(action,{success='عملیات ثبت شد.'}={}){
 if(state.busy)return;
 state.busy=true;app.classList.add('app-busy');
 let actionSucceeded=false;
 try{await action();actionSucceeded=true;await refresh(true);if(success)notify(success);}
 catch(err){
  if(!err.status)updateConnection('offline');
  if(actionSucceeded){notify('عملیات روی سرور انجام شد، اما دریافت وضعیت جدید ممکن نشد. پس از اتصال، اطلاعات را دوباره بررسی کنید.',true);}
  else {notify(err.message,true);if(err.status===401){clearInterval(state.poll);state.me=null;resetWorkspace();render();}else if(err.status===409){if(err.code==='IDEMPOTENCY_CONFLICT'){state.roundKey=null;notify('یک درخواست قبلاً با محتوای متفاوت ثبت شده است؛ وضعیت میز را مرور و پس از اطمینان، سفارش جدید را ثبت کنید.',true);}await refresh(true).catch(()=>{});}}
 }
 finally{state.busy=false;app.classList.remove('app-busy');}
}
async function refresh(force=false){if(!state.me)return;if(!force&&document.hidden)return;const previousData=state.data,previous=JSON.stringify(state.data);let data;try{data=await api('/api/shift');updateConnection('ok');}catch(err){updateConnection('offline');throw err;}state.data=data;state.lastUpdate=new Date();if(!state.branchId||!data.branches.some(b=>b.id===state.branchId)){const busyBranch=data.branches.find(b=>data.sessions.some(session=>!session.closed_at&&session.branch_id===b.id));state.branchId=busyBranch?.id??data.branches[0]?.id??null;}if(!state.tableId||!data.tables.some(t=>t.id===state.tableId&&t.branch_id===state.branchId))state.tableId=currentTables()[0]?.id??null;if(!state.cashTableId||!data.tables.some(t=>t.id===state.cashTableId&&t.branch_id===state.branchId)||(previousData?.sessions.some(x=>x.table_id===state.cashTableId&&!x.closed_at)&&!sessionFor(state.cashTableId)))state.cashTableId=currentTables().find(t=>sessionFor(t.id))?.id??currentTables()[0]?.id??null;if(force||previous!==JSON.stringify(data)){if(!force&&(document.activeElement?.matches('input,textarea,select')||document.querySelector('#action-dialog[open]'))){state.pendingRefresh=true;return;}state.pendingRefresh=false;keepViewportRender();}}
function nav(){const links=[['hall','◧ سالن',can('waiter','manager')],['kitchen','♨ آشپزخانه',can('kitchen','manager')],['cashier','▣ صندوق',can('cashier','manager')],['activity','◷ رویدادهای شیفت',can('manager')]];return links.filter(x=>x[2]).map(([id,label])=>`<button class="nav-btn ${state.view===id?'active':''}" data-action="nav" data-id="${id}" aria-current="${state.view===id?'page':'false'}">${label}</button>`).join('');}
function header(){return `<div class="shell ${state.draft.length&&state.view==='hall'?'has-draft':''}"><header class="topbar"><div class="brand"><span class="brand-icon">ش</span><span><strong>شیفت‌یار</strong><small>از ثبت سفارش تا تحویل</small></span></div><div class="top-actions"><span id="sync-status" class="sync-status" data-status="${state.connection}" role="status">${state.connection==='offline'?'ارتباط قطع است':state.connection==='loading'?'در حال همگام‌سازی…':'اطلاعات به‌روز است'}</span><span class="top-pill"><b>${e(state.data?.restaurant?.name)}</b> · ${e(state.me.name)}</span><span class="top-pill">${e(labels[state.me.role])}</span><select id="branch-select" class="branch-select" aria-label="انتخاب شعبه">${state.data?.branches.map(b=>`<option value="${b.id}" ${b.id===state.branchId?'selected':''}>${e(b.name)}</option>`).join('')}</select><button class="ghost-btn" data-action="logout">خروج</button></div></header><nav class="main-nav" aria-label="بخش‌های محصول">${nav()}</nav>`;}
function footer(){return `<footer class="footer"><span>شیفت‌یار · نسخه آزمایشی مدیریت سفارش رستوران · مبالغ به تومان</span><span>داده‌ها هر ۵ ثانیه تازه می‌شوند؛ پرداخت بانکی در این نسخه انجام نمی‌شود.</span></footer></div>`;}
function title(overline,head,description,right=''){return `<div class="view-title"><div><p class="eyebrow">${e(overline)}</p><h1>${e(head)}</h1><p>${e(description)}</p></div>${right}</div>`;}
function statusBadge(s){return `<span class="pill ${e(s)}">${e(labels[s]??s)}</span>`;}
function tableCard(t){const s=sessionFor(t.id),r=readyCount(t.id),active=!!s,selected=state.tableId===t.id;return `<button class="table-tile ${selected?'selected':''}" data-action="table" data-id="${t.id}" aria-pressed="${selected}"><div class="table-top"><strong>میز ${fmt.format(t.number)}</strong>${r?`<span class="attention-dot">${fmt.format(r)} آماده</span>`:`<span class="pill ${active?'queued':''}">${active?'مشغول':'آزاد'}</span>`}</div><div class="table-bottom"><span class="amount">${active?toman(subtotal(itemsFor(s.id))-s.discount_toman):'آماده سفارش'}</span><small>${active?since(s.opened_at):`${fmt.format(t.seats)} نفره`}</small></div></button>`;}
function menuItemsMarkup(){const q=searchKey(state.search);const listed=state.data.menu.filter(x=>(state.cat==='همه'||x.category===state.cat)&&(!q||searchKey(x.name+' '+x.category+' '+x.description).includes(q)));return listed.map(m=>`<div class="menu-item"><div><strong>${e(m.name)}</strong><p>${e(m.description)}</p><span class="price">${toman(m.price_toman)}</span></div><button class="add" data-action="add" data-id="${m.id}" ${m.available?'':'disabled'} aria-label="افزودن ${e(m.name)}">${m.available?'+':'ناموجود'}</button></div>`).join('')||`<p class="blank">غذایی با این مشخصات پیدا نشد.</p>`;}

function syncMenuFilter(){
 const menu=document.querySelector('.menu-list');if(!menu)return;
 menu.innerHTML=menuItemsMarkup();menu.scrollTop=0;
 for(const chip of document.querySelectorAll('.cat-chip')){
  const selected=chip.dataset.id===state.cat;
  chip.classList.toggle('active',selected);chip.setAttribute('aria-pressed',String(selected));
 }
}
function menuList(){const categories=['همه',...new Set(state.data.menu.map(x=>x.category))];return `<div class="panel-head"><div><h2>منوی سفارش‌گیری</h2><small>قیمت‌ها از منوی همین رستوران</small></div><span class="pill">${fmt.format(state.data.menu.filter(x=>x.available).length)} غذا</span></div><div class="panel-body"><input id="menu-search" class="field menu-search" placeholder="جست‌وجوی غذا یا نوشیدنی…" value="${e(state.search)}" aria-label="جست‌وجوی منو"><div class="menu-cats" role="group" aria-label="دسته‌بندی منو">${categories.map(x=>`<button class="cat-chip ${state.cat===x?'active':''}" data-action="cat" data-id="${e(x)}" aria-pressed="${state.cat===x}">${e(x)}</button>`).join('')}</div><div class="menu-list">${menuItemsMarkup()}</div></div>`;}
function draftPanel(){const t=state.data.tables.find(x=>x.id===state.tableId),s=t?sessionFor(t.id):null;const rounds=s?roundsFor(s.id):[];const items=s?itemsFor(s.id):[];return `<div class="panel-head"><div><h2>میز ${t?fmt.format(t.number):'…'} · سفارش جاری</h2><small>${s?`${fmt.format(rounds.length)} نوبت سفارش`:'هنوز سفارشی ثبت نشده است'}</small></div>${s?`<span class="pill">باز</span>`:''}</div><div class="panel-body"><h3 class="section-title">پیش‌نویس نوبت جدید</h3>${state.draft.map((d,i)=>{const m=state.data.menu.find(x=>x.id===d.menuItemId);return `<div class="draft-line"><div class="draft-line-header"><strong>${e(m?.name??'غذا')}</strong><span class="price">${toman(d.qty*(m?.price_toman??0))}</span></div><div class="qty-row"><button class="qty-btn" data-action="qty" data-id="${i}" data-dir="-1" aria-label="کاهش تعداد">−</button><b>${fmt.format(d.qty)}</b><button class="qty-btn" data-action="qty" data-id="${i}" data-dir="1" ${d.qty>=20?'disabled title="سقف هر ردیف ۲۰ عدد است"':''} aria-label="افزایش تعداد">+</button><button class="ghost-btn" data-action="remove-draft" data-id="${i}">حذف</button>${d.qty>1?`<button class="ghost-btn split-note" data-action="split-note" data-id="${i}" title="اگر یکی از این غذاها یادداشت متفاوت دارد">تفکیک برای یادداشت متفاوت</button>`:``}</div><input class="field note-field" data-draft-note="${i}" value="${e(d.note)}" maxlength="240" placeholder="یادداشت همین قلم، مثلاً بدون پیاز"></div>`;}).join('')||'<p class="blank" style="padding:15px 0">از منو غذا اضافه کنید.</p>'}<div class="ticket-summary"><span>مجموع نوبت جدید</span><span>${toman(state.draft.reduce((v,x)=>v+x.qty*(state.data.menu.find(m=>m.id===x.menuItemId)?.price_toman??0),0))}</span></div><button class="btn full" data-action="submit-round" ${state.draft.length?'':'disabled'}>ثبت نوبت و ارسال به آشپزخانه ↗</button>${can('waiter','manager')?aiPanel():''}<div class="divider"></div><h3 class="section-title">اقلام ثبت‌شده ${items.length?`(${fmt.format(items.length)})`:''}</h3>${rounds.map((r,i)=>`<div class="round-sep">نوبت ${fmt.format(i+1)} · ${date(r.created_at)}</div>${items.filter(x=>x.round_id===r.id).map(x=>`<div class="current-item"><div class="current-item-top"><strong>${fmt.format(x.quantity)} × ${e(x.name_snapshot)}</strong>${statusBadge(x.status)}</div>${x.note?`<p class="detail">یادداشت: ${e(x.note)}</p>`:''}<div class="actions">${x.status==='ready'?`<button class="btn sm secondary" data-action="transition" data-id="${x.id}" data-from="ready" data-to="served">✓ تحویل به مشتری</button>`:''}${(x.status==='queued'||(can('manager')&&['preparing','ready'].includes(x.status)))?`<button class="btn sm danger" data-action="cancel" data-id="${x.id}" data-from="${x.status}">${x.status==='queued'?'لغو قلم':'لغو با تأیید مدیر'}</button>`:''}</div></div>`).join('')}`).join('')||'<p class="blank">سابقه سفارشی برای این میز نیست.</p>'}</div>`;}

function aiMenuOptions(selected){
 const items=state.data.menu.filter(m=>m.available);
 return '<option value="">انتخاب غذا از منو</option>'+items.map(m=>'<option value="'+e(m.id)+'" '+(m.id===selected?'selected':'')+'>'+e(m.name)+'</option>').join('');
}
function aiValidContext(){
 const p=state.aiPreview;if(!p)return false;
 const c=p.context;
 return !!state.me&&c.tableId===state.tableId&&c.branchId===state.branchId&&c.sessionId===(sessionFor(state.tableId)?.id??null)&&c.sourceRevision===state.aiRevision;
}
function aiReviewLine(line,i){
 const item=state.data.menu.find(m=>m.id===line.menuItemId);
 return '<div class="ai-review-line">'+
 '<div class="ai-line-head"><b>قلم پیشنهادی '+fmt.format(i+1)+'</b><button type="button" class="ghost-btn" data-action="ai-remove" data-id="'+i+'">حذف</button></div>'+
 (line.sourceText?'<p class="ai-evidence">از توضیح: «'+e(line.sourceText)+'»</p>':'')+
 '<label class="label" for="ai-item-'+i+'">غذا یا نوشیدنی</label>'+
 '<select id="ai-item-'+i+'" class="field" data-ai-menu="'+i+'">'+aiMenuOptions(line.menuItemId)+'</select>'+
 '<div class="ai-edit-grid"><label class="label">تعداد<input class="field" data-ai-qty="'+i+'" inputmode="numeric" maxlength="2" value="'+e(line.quantity)+'" aria-label="تعداد قلم '+fmt.format(i+1)+'"></label>'+
 '<label class="label">توضیح ویژه همان قلم<input class="field" data-ai-note="'+i+'" maxlength="240" value="'+e(line.note)+'" placeholder="مثلاً بدون شکر"></label></div>'+
 '<div class="ai-line-bottom"><span class="price">'+(item?toman(item.price_toman*Number(parseCountInput(line.quantity)||0)):'ابتدا غذا را انتخاب کنید')+'</span>'+
 (parseCountInput(line.quantity)>1?'<button type="button" class="ghost-btn" data-action="ai-split" data-id="'+i+'">تفکیک برای توضیح متفاوت</button>':'')+'</div>'+
 (!item||!item.available?'<p class="ai-error">این غذا موجود نیست؛ یک گزینه معتبر انتخاب کنید.</p>':'')+
 '</div>';
}
function aiUnresolvedLine(u,i){
 const reason={unmatched:'در منو پیدا نشد یا مبهم است',unknown_menu_item:'شناسه پیشنهادی در منوی این رستوران نیست',invalid_quantity:'تعداد نامعتبر است',invalid_note:'توضیح بیش از حد مجاز است',invalid_item:'قلم پیشنهادی نامعتبر است',ambiguous_unit_note:'توضیح به واحد مشخصی نسبت داده نشده',extra_text:'بخشی از متن به‌روشنی قابل تبدیل نبود',too_many_lines:'سقف ۱۲ ردیف در یک نوبت رعایت نشده'}[u.reason]||'نیازمند بررسی است';
 return '<div class="ai-unresolved-item"><p><strong>«'+e(u.text)+'»</strong><span class="ai-reason"> '+e(reason)+'</span></p>'+
 '<div class="ai-unresolved-controls"><select class="field" data-ai-resolve="'+i+'" aria-label="تعیین غذای عبارت '+fmt.format(i+1)+'">'+aiMenuOptions('')+'</select>'+
 '<button class="ghost-btn" type="button" data-action="ai-dismiss" data-id="'+i+'">کنار گذاشتن</button></div></div>';
}
function aiPanel(){
 const p=state.aiPreview,active=state.features.aiEnabled,valid=aiValidContext();
 const table=state.data.tables.find(t=>t.id===state.tableId);
 return '<section class="ai-box" aria-label="تبدیل توضیح سفارش به پیشنهاد">'+
 '<div class="ai-header"><div><h3>ثبت سریع با توضیح سفارش</h3><p>سفارش مشتری را همان‌طور که می‌گوید بنویسید؛ نتیجه قابل اصلاح است.</p></div><span class="ai-mode">'+(active?'مدل زبانی':'تطبیق ساده با منو')+'</span></div>'+
 '<p class="ai-target">میز '+fmt.format(table?.number??0)+' · '+e(selectedBranch()?.name??'')+'</p>'+
 '<label for="ai-note" class="label">توضیح سفارش مشتری</label>'+
 '<textarea class="field ai-textarea" id="ai-note" maxlength="800" placeholder="مثلاً: سه تا لاته، یکی بدون شکر، دوتا معمولی و یک چیزکیک">'+e(state.aiText)+'</textarea>'+
 '<p class="ai-helper">اطلاعات تماس یا کارت مشتری را ننویسید. هیچ پیشنهادی بدون تأیید شما ثبت نمی‌شود.</p>'+
 '<div class="ai-actions"><button type="button" class="btn warm sm" data-action="ai-parse" '+(state.aiLoading?'disabled':'')+'>'+(state.aiLoading?'در حال بررسی سفارش…':active?'تحلیل با دستیار':'ساخت پیشنهاد از منو')+'</button>'+
 (state.aiText||p?'<button type="button" class="ghost-btn" data-action="ai-clear">پاک کردن توضیح</button>':'')+'</div>'+
 (!active?'<p class="ai-helper">در این محیط مدل AI متصل نیست. تطبیق محدود و قانون‌محور است؛ برای عبارت‌های مبهم، انتخاب دستی لازم است.</p>':'')+
 (state.aiWarning?'<p class="ai-error" role="alert">'+e(state.aiWarning)+'</p>':'')+
 '<div aria-live="polite" role="status" class="ai-status">'+(state.aiLoading?'در حال تهیه پیشنهاد برای همین میز…':p? 'پیشنهاد آماده بازبینی است. تا ثبت نهایی چیزی به آشپزخانه ارسال نمی‌شود.':'')+'</div>'+
 (p?'<section class="ai-preview" aria-label="پیشنهاد قابل ویرایش"><div class="ai-preview-title"><h4>پیشنهاد قابل ویرایش</h4><span>'+fmt.format(p.items.length)+' ردیف</span></div>'+
 (!valid?'<p class="ai-error">توضیح یا نشست میز تغییر کرده است. دوباره تحلیل کنید.</p>':'')+
 p.items.map(aiReviewLine).join('')+
 (p.unresolved.length?'<div class="ai-unresolved"><h4>'+fmt.format(p.unresolved.length)+' عبارت نیازمند تعیین تکلیف</h4><p>برای هر مورد، غذای درست را انتخاب یا صریحاً کنار بگذارید.</p>'+
 p.unresolved.map(aiUnresolvedLine).join('')+'</div>':'')+
 '<div class="ai-review-actions"><button type="button" class="btn secondary sm" data-action="ai-add-line" '+(p.items.length>=12?'disabled':'')+'>افزودن ردیف</button>'+
 '<button type="button" class="btn sm" data-action="ai-apply" '+(!valid||p.unresolved.length||!p.items.length?'disabled':'')+'>افزودن اقلام تأییدشده به پیش‌نویس</button></div>'+
 '<p class="ai-helper">این مرحله فقط پیش‌نویس را تغییر می‌دهد. ارسال به آشپزخانه با دکمه ثبت نوبت انجام می‌شود.</p></section>':'')+
 '</section>';
}
async function analyzeOrder(){
 const text=state.aiText.trim();
 if(text.length<4||text.length>800){state.aiWarning='توضیح سفارش باید بین ۴ تا ۸۰۰ نویسه باشد.';render();document.querySelector('#ai-note')?.focus();return;}
 if(!state.tableId||!state.me)return;
 state.aiRequest?.controller?.abort();
 const controller=new AbortController(),requestId=crypto.randomUUID(),revision=++state.aiRevision;
 const tableId=state.tableId,branchId=state.branchId,sessionId=sessionFor(tableId)?.id??null,actorId=state.me.id;
 const request={controller,requestId,revision,tableId,branchId,sessionId,actorId};
 state.aiRequest=request;state.aiLoading=true;state.aiPreview=null;state.aiWarning='';render();
 try{
  const response=await api('/api/ai/order-suggestions',{method:'POST',signal:controller.signal,body:JSON.stringify({note:text,tableId,expectedSessionId:sessionId,clientRequestId:requestId,sourceRevision:revision})});
  if(state.aiRequest!==request||state.aiRevision!==revision||state.tableId!==tableId||state.branchId!==branchId||state.me?.id!==actorId||state.aiText.trim()!==text||sessionFor(tableId)?.id!==sessionId||response.clientRequestId!==requestId)return;
  state.aiPreview=response;
  if(response.unresolved?.length)state.aiWarning='بخشی از سفارش روشن نیست؛ پیش از افزودن، موارد مشخص‌شده را بررسی کنید.';
 }catch(err){
  if(state.aiRequest!==request||err.name==='AbortError')return;
  state.aiWarning=err.message||'تحلیل سفارش انجام نشد؛ متن شما حفظ شده است.';
 }finally{
  if(state.aiRequest===request){state.aiRequest=null;state.aiLoading=false;render();}
 }
}
function applyAI(){
 const p=state.aiPreview;if(!p||!aiValidContext()){notify('این پیشنهاد متعلق به وضعیت فعلی میز نیست؛ دوباره تحلیل کنید.',true);return;}
 if(p.unresolved.length){notify('ابتدا برای عبارت‌های مبهم تصمیم بگیرید.',true);return;}
 if(!p.items.length){notify('هیچ قلمی برای افزودن وجود ندارد.',true);return;}
 const next=state.draft.map(x=>({...x}));
 for(const line of p.items){
  const menu=state.data.menu.find(m=>m.id===line.menuItemId&&m.available);
  const quantity=parseCountInput(line.quantity);
  if(!menu){notify('یک غذا از منو حذف یا ناموجود شده است. پیشنهاد را اصلاح کنید.',true);return;}
  if(!quantity||typeof line.note!=='string'||line.note.length>240){notify('تعداد یا توضیح یکی از اقلام معتبر نیست.',true);return;}
  if(Number(menu.price_toman)!==Number(line.priceToman)){
   line.priceToman=Number(menu.price_toman);state.aiWarning='قیمت منو تغییر کرده است. قیمت جدید را بررسی و دوباره تأیید کنید.';render();return;
  }
  const same=next.find(x=>x.menuItemId===menu.id&&x.note===line.note&&x.expectedPriceToman===Number(menu.price_toman)&&x.qty+quantity<=20);
  if(same)same.qty+=quantity;
  else next.push({menuItemId:menu.id,qty:quantity,note:line.note,expectedPriceToman:Number(menu.price_toman)});
 }
 if(next.length>12){notify('سقف هر نوبت ۱۲ ردیف است؛ اقلام را در چند نوبت ثبت کنید.',true);return;}
 state.draft=next;state.roundKey=null;state.aiPreview=null;state.aiText='';state.aiWarning='';activateHallStage('order');
 notify('اقلام به پیش‌نویس اضافه شدند. برای ارسال، نوبت را جداگانه ثبت کنید.');
}
function hall(){const branch=selectedBranch(),quantity=state.draft.reduce((n,x)=>n+x.qty,0),total=state.draft.reduce((n,x)=>n+x.qty*(state.data.menu.find(m=>m.id===x.menuItemId)?.price_toman??0),0),ready=currentTables().reduce((n,t)=>n+readyCount(t.id),0);return `${title('عملیات سالن','سفارش‌گیری میزها',`شعبه ${branch?.name??''} · سفارش چندمرحله‌ای بدون گم‌شدن اقلام`,ready?`<span class="ready-headline">${fmt.format(ready)} قلم آماده تحویل</span>`:'')}<nav class="hall-steps" aria-label="مراحل سفارش‌گیری">${[['tables','۱ · میزها'],['menu','۲ · منو'],['order','۳ · سفارش']].map(([id,label])=>`<button class="hall-step ${state.mobileStage===id?'active':''}" data-action="hall-step" data-id="${id}" aria-current="${state.mobileStage===id?'step':'false'}">${label}${id==='order'&&quantity?` <span class="step-count">${fmt.format(quantity)}</span>`:''}</button>`).join('')}</nav><div class="hall-layout" data-mobile-stage="${state.mobileStage}"><section class="card hall-tables"><div class="panel-head"><div><h2>میزهای سالن</h2><small>یک میز را برای ثبت یا تحویل انتخاب کنید</small></div><span class="pill">${fmt.format(currentTables().length)} میز</span></div><div class="panel-body"><div class="tables-grid">${currentTables().map(tableCard).join('')}</div><div class="chip-explain"><span>● آزاد / مشغول</span><span>● آماده تحویل</span></div></div></section><section class="card hall-menu">${menuList()}</section><section class="card hall-order">${draftPanel()}</section></div>${quantity?`<div class="mobile-draft-bar" role="region" aria-label="پیش‌نویس سفارش"><div><strong>${fmt.format(quantity)} قلم در پیش‌نویس</strong><span>${toman(total)}</span></div><button class="btn" data-action="hall-step" data-id="${state.mobileStage==='order'?'menu':'order'}">${state.mobileStage==='order'?'بازگشت به منو':'بازبینی سفارش'}</button></div>`:''}`;}
function allKitchenItems(){const valid=new Set(currentTables().map(x=>x.id));const sessions=activeSessions().filter(x=>valid.has(x.table_id));return sessions.flatMap(s=>itemsFor(s.id).map(i=>({item:i,session:s,table:state.data.tables.find(t=>t.id===s.table_id)})));}
function kdsTicket(row){const x=row.item,minutes=(Date.now()-new Date(x.updated_at).getTime())/60000;const urgent=minutes>12&&x.status!=='ready';return `<article class="kds-ticket ${urgent?'urgent':''}"><div class="kds-ticket-head"><div><strong>میز ${fmt.format(row.table?.number??0)}</strong> <small>· ${e(labels[x.status])}</small></div><span class="pill ${urgent?'alert':'queued'}">${since(x.updated_at)}</span></div><div class="kds-ticket-body"><strong>${fmt.format(x.quantity)} × ${e(x.name_snapshot)}</strong><p>${e(state.data.menu.find(m=>m.id===x.menu_item_id)?.category??'سفارش')}</p>${x.note?`<div class="kds-note">⚠ ${e(x.note)}</div>`:''}${x.status==='queued'?`<button class="btn kds-action" data-action="transition" data-id="${x.id}" data-from="queued" data-to="preparing">شروع آماده‌سازی</button>`:x.status==='preparing'?`<button class="btn warm kds-action" data-action="transition" data-id="${x.id}" data-from="preparing" data-to="ready">✓ آماده شد · اطلاع به سالن</button>`:`<div class="okay-box">آماده است؛ منتظر تحویل پیشخدمت</div>`}</div></article>`;}
function kitchen(){const items=allKitchenItems().filter(x=>['queued','preparing','ready'].includes(x.item.status));const columns=[['queued','سفارش‌های جدید'],['preparing','در حال آماده‌سازی'],['ready','آماده تحویل']];const count=(s)=>items.filter(x=>x.item.status===s).length;return `${title('نمایشگر آشپزخانه','صف پخت و تحویل',`شعبه ${selectedBranch()?.name??''} · وضعیت هر قلم به‌صورت مستقل ثبت می‌شود` ,`<div class="kds-stats"><span class="metric"><b>${fmt.format(count('queued'))}</b>جدید</span><span class="metric"><b>${fmt.format(count('preparing'))}</b>در پخت</span><span class="metric"><b>${fmt.format(count('ready'))}</b>آماده</span></div>`)}<div class="kitchen-layout">${columns.map(([key,label])=>`<section class="kds-column"><div class="kds-column-head"><h2>${label}</h2><span class="count">${fmt.format(count(key))}</span></div><div class="kds-list">${items.filter(x=>x.item.status===key).sort((a,b)=>new Date(a.item.updated_at)-new Date(b.item.updated_at)).map(kdsTicket).join('')||'<div class="kds-empty">در این مرحله سفارشی وجود ندارد.</div>'}</div></section>`).join('')}</div>`;}
function cashier(){const tables=currentTables(),selected=tables.find(t=>t.id===state.cashTableId),s=selected?sessionFor(selected.id):null,items=s?itemsFor(s.id):[],sub=subtotal(items),total=Math.max(0,sub-(s?.discount_toman??0)),unsent=items.filter(x=>!['served','cancelled'].includes(x.status)),canPay=!!s&&items.length>0&&unsent.length===0&&items.some(x=>x.status==='served');const allCancelled=items.length>0&&items.every(x=>x.status==='cancelled');const voidable=can('manager')&&allCancelled;const closed=state.data.sessions.filter(x=>x.closed_at&&tables.some(t=>t.id===x.table_id)).slice(0,6);return `${title('صندوق و تسویه','حساب جاری میزها','مبالغ بر اساس تمام نوبت‌های سفارش محاسبه می‌شوند؛ پرداخت فقط به‌صورت داخلی ثبت می‌شود')}
<div class="cashier-layout"><section class="card"><div class="panel-head"><div><h2>میزهای دارای حساب</h2><small>برای مشاهده فاکتور، میز را انتخاب کنید</small></div><span class="pill">${fmt.format(tables.filter(t=>sessionFor(t.id)).length)} باز</span></div><div class="panel-body">${tables.filter(t=>sessionFor(t.id)).map(t=>{const se=sessionFor(t.id);return `<button data-action="cash-table" data-id="${t.id}" class="cash-table ${state.cashTableId===t.id?'selected':''}" aria-pressed="${state.cashTableId===t.id}"><div><strong>میز ${fmt.format(t.number)}</strong><small>${fmt.format(roundsFor(se.id).length)} نوبت · ${since(se.opened_at)}</small></div><b>${toman(subtotal(itemsFor(se.id))-se.discount_toman)}</b></button>`;}).join('')||'<p class="blank">اکنون میز منتظر تسویه وجود ندارد.</p>'}<div class="divider"></div><h3 class="section-title">تسویه‌های اخیر</h3>${closed.map(se=>{const t=tables.find(x=>x.id===se.table_id);return `<div class="history-line"><div><b>میز ${fmt.format(t?.number??0)}</b><br><small>${date(se.closed_at)}</small></div><span>${se.paid_at?toman(se.paid_amount_toman):'بسته‌شده بدون دریافت'}</span></div>`}).join('')||'<p class="dim tiny">هنوز فاکتور بسته‌شده‌ای ثبت نشده است.</p>'}</div></section>
<section class="card cash-bill"><div class="panel-head"><div><h2>صورتحساب میز ${selected?fmt.format(selected.number):'…'}</h2><small>${s?`${fmt.format(roundsFor(s.id).length)} نوبت سفارش · نسخه ${fmt.format(s.version)}`:'میزی با حساب باز انتخاب کنید'}</small></div>${s?`<span class="pill">باز</span>`:''}</div><div class="panel-body">${s?`${items.map(x=>`<div class="bill-row"><div><b>${fmt.format(x.quantity)} × ${e(x.name_snapshot)}</b><div style="margin-top:5px">${statusBadge(x.status)} ${x.note?`<span class="tiny dim">${e(x.note)}</span>`:''}</div></div><span style="${x.status==='cancelled'?'text-decoration:line-through;color:#a5a5a5':''}">${toman(x.quantity*x.unit_price_toman)}</span></div>`).join('')}
<div class="bill-breakdown"><span>جمع اقلام غیرلغوشده</span><b>${toman(sub)}</b></div><div class="bill-breakdown"><span>تخفیف ثبت‌شده</span><b>− ${toman(s.discount_toman)}</b></div><div class="divider"></div><div class="bill-total"><span>مبلغ قابل پرداخت</span><strong>${toman(total)}</strong></div>
<div class="pay-controls"><div><label class="label" for="discount-input">تخفیف (تومان)</label><input id="discount-input" class="field" type="text" inputmode="numeric" autocomplete="off" placeholder="مثلاً ۵۰٬۰۰۰" value="${e(state.discountDraft?.sessionId===s.id?state.discountDraft.value:fmt.format(s.discount_toman))}" aria-describedby="discount-hint"><small class="help-text" id="discount-hint" role="status">${state.discountDraft?.sessionId===s.id?'مبلغ واردشده هنوز ثبت نشده است؛ برای اعمال، دکمه ثبت تخفیف را بزنید.':'مبلغ به تومان؛ رقم‌های فارسی و انگلیسی پذیرفته می‌شوند.'}</small></div><button class="btn secondary" data-action="discount">ثبت تخفیف</button></div><div class="divider"></div><label class="label">روش دریافت وجه</label><div class="pay-methods">${['pos','cash','card_to_card'].map(m=>`<button data-action="pay-method" data-id="${m}" class="pay-option ${state.payMethod===m?'active':''}" aria-pressed="${state.payMethod===m}">${labels[m]}</button>`).join('')}</div>${allCancelled?`<div class="warn-box">همه اقلام لغو شده‌اند. ${can('manager')?'برای آزادکردن میز بدون دریافت وجه، دلیل را ثبت کنید.':'برای آزادکردن میز بدون دریافت وجه، از مدیر درخواست کنید.'}</div>`:unsent.length?`<div class="warn-box">${fmt.format(unsent.length)} قلم هنوز تحویل نشده است. تا تکمیل تحویل، تسویه عادی مجاز نیست.</div>`:`<div class="okay-box">تمام اقلام غیرلغوشده تحویل شده‌اند؛ تسویه امکان‌پذیر است.</div>`}<button class="btn full" data-action="checkout" ${canPay?'':'disabled'}>ثبت دریافت وجه و آزادکردن میز</button>${voidable?`<button class="btn full secondary" data-action="void-session">بستن میز کاملاً لغوشده، بدون دریافت وجه</button>`:``}<p class="tiny dim" style="margin-top:9px">این ثبت به معنای تأیید دریافت وجه توسط صندوق‌دار است و به بانک متصل نیست.</p>`:'<p class="blank">میزی با حساب باز انتخاب کنید تا جزئیات آن نمایش داده شود.</p>'}</div></section></div>`;}
function activity(){const eventLabels={'round.created':'ثبت نوبت جدید','item.transition':'تغییر وضعیت غذا','bill.discount':'ثبت تخفیف','session.checked_out':'تسویه و بستن میز','session.voided':'بستن میز لغوشده بدون دریافت وجه'};return `${title('تاریخچه عملیات','رویدادهای شیفت','تغییرات کلیدی همراه با زمان و نشست میز ثبت می‌شوند')}<section class="card activity-layout"><div class="panel-head"><h2>آخرین رخدادها</h2><span class="pill">${fmt.format(state.data.events.length)} رویداد</span></div><div class="panel-body">${state.data.events.map(x=>`<div class="event-item"><div><strong>${e(eventLabels[x.event_type]??x.event_type)}</strong><br><small>شناسه نشست: ${e(x.session_id.slice(0,8))}…</small></div><small>${date(x.created_at)}</small></div>`).join('')||'<p class="blank">رویدادی ثبت نشده است.</p>'}</div></section>`;}
function loginScreen(){return `<main id="main-content" class="login-page"><section class="login-story"><div class="brand"><span class="brand-icon">ش</span><span><strong>شیفت‌یار</strong><small>مدیریت زنده رستوران ایرانی</small></span></div><h1>هر سفارش،<br><em>در جریان یک شیفت.</em></h1><p>از ثبت سفارش میز تا آماده‌سازی، تحویل غذا و تسویه. یک جریان مشترک برای سالن، آشپزخانه و صندوق.</p><div class="login-flow"><span>۱ · سفارش سالن</span><span>۲ · آماده‌سازی</span><span>۳ · تحویل</span><span>۴ · تسویه</span></div></section><section class="login-card"><p class="eyebrow">ورود کارکنان</p><h2>به شیفت خوش آمدید</h2><p>یکی از حساب‌های نمایشی را انتخاب کنید یا اطلاعات ورود خود را بنویسید.</p><form id="login-form"><label><span class="label">ایمیل</span><input class="field" id="email" type="email" autocomplete="username" required placeholder="waiter@narenj.demo"></label><label><span class="label">رمز عبور</span><input class="field" id="password" type="password" autocomplete="current-password" required placeholder="رمز عبور"></label><button class="btn full" id="login-submit" type="submit">ورود به پنل شیفت</button></form><p style="font-size:11px;font-weight:bold;color:var(--ink);margin:22px 0 6px">حساب‌های نمونه (داده غیرواقعی)</p><div class="demo-accounts">${[['waiter@narenj.demo','پیشخدمت','کافه نارنج'],['kitchen@narenj.demo','آشپزخانه','کافه نارنج'],['cashier@narenj.demo','صندوق‌دار','کافه نارنج'],['manager@narenj.demo','مدیر','کافه نارنج'],['manager@darband.demo','مدیر دربند','رستوران مستقل']].map(([email,role,restaurant])=>`<button class="demo-option" type="button" data-action="demo" data-email="${email}"><b>${role}</b><small>${restaurant}</small></button>`).join('')}</div>${localDemo()?`<div class="login-tip">رمز پیش‌فرض محیط Docker: <code dir="ltr">Demo-Shift-1405!</code>. این رمز فقط برای اجرای محلی است.</div>`:`<div class="login-tip">برای دریافت رمز ورود دموی عمومی، از اطلاعات حساب‌های ارائه‌شده به ارزیاب استفاده کنید.</div>`}</section></main>`;}
function takeRenderSnapshot(){
 const active=document.activeElement;
 let selector=null,selection=null;
 if(active&&app.contains(active)){
  if(active.id)selector='#'+CSS.escape(active.id);
  else if(active.hasAttribute('data-draft-note'))selector='[data-draft-note="'+CSS.escape(active.dataset.draftNote)+'"]';
  else if(active.hasAttribute('data-ai-qty'))selector='[data-ai-qty="'+CSS.escape(active.dataset.aiQty)+'"]';
  else if(active.hasAttribute('data-ai-note'))selector='[data-ai-note="'+CSS.escape(active.dataset.aiNote)+'"]';
  else if(active.hasAttribute('data-action')){
   selector='[data-action="'+CSS.escape(active.dataset.action)+'"]';
   if(active.hasAttribute('data-id'))selector+='[data-id="'+CSS.escape(active.dataset.id)+'"]';
   if(active.hasAttribute('data-to'))selector+='[data-to="'+CSS.escape(active.dataset.to)+'"]';
   if(active.hasAttribute('data-dir'))selector+='[data-dir="'+CSS.escape(active.dataset.dir)+'"]';
  }
  if(active.matches('input:not([type="number"]),textarea')){
   try{selection=[active.selectionStart,active.selectionEnd,active.selectionDirection];}catch{}
  }
 }
 return {selector,selection,navScroll:document.querySelector('.main-nav')?.scrollLeft??0,categoryScroll:document.querySelector('.menu-cats')?.scrollLeft??0};
}
function restoreRenderSnapshot(s){
 const nav=document.querySelector('.main-nav');if(nav)nav.scrollLeft=s.navScroll;
 const categories=document.querySelector('.menu-cats');if(categories)categories.scrollLeft=s.categoryScroll;
 if(!s.selector)return;
 const el=document.querySelector(s.selector);
 if(!el||!el.getClientRects().length||el.disabled)return;
 el.focus({preventScroll:true});
 if(s.selection&&typeof el.setSelectionRange==='function'){try{el.setSelectionRange(...s.selection);}catch{}}
}
function activateHallStage(stage){
 if(!['tables','menu','order'].includes(stage))return;
 state.mobileStage=stage;render();
 if(!window.matchMedia('(max-width:1000px)').matches)return;
 const steps=document.querySelector('.hall-steps');if(!steps)return;
 const top=Math.max(0,window.scrollY+steps.getBoundingClientRect().top-8);
 if(Math.abs(window.scrollY-top)>12)window.scrollTo({top,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}

function render(){const snapshot=takeRenderSnapshot();const priorMenuScroll=document.querySelector('.menu-list')?.scrollTop??0,priorY=window.scrollY;if(!state.me){app.innerHTML=loginScreen();return;}if(!state.data){app.innerHTML='<main class="loading-screen"><div class="loading-ring"></div><p>در حال دریافت اطلاعات رستوران…</p></main>';return;}if(!can('manager','waiter')&&state.view==='hall')state.view=can('kitchen')?'kitchen':'cashier';if(!can('manager','cashier')&&state.view==='cashier')state.view=can('kitchen')?'kitchen':'hall';if(!can('manager','kitchen')&&state.view==='kitchen')state.view=can('waiter')?'hall':'cashier';if(!can('manager')&&state.view==='activity')state.view='hall';app.innerHTML=header()+`<main id="main-content" tabindex="-1">${state.view==='hall'?hall():state.view==='kitchen'?kitchen():state.view==='cashier'?cashier():activity()}</main>`+footer()+`<dialog id="action-dialog" class="action-dialog" aria-labelledby="dialog-title" aria-describedby="dialog-details"><form id="action-form"><div class="dialog-kicker">تأیید عملیات</div><h2 id="dialog-title"></h2><p id="dialog-details"></p><label id="reason-wrap"><span class="label">دلیل لغو</span><textarea id="dialog-reason" class="field" required minlength="3" maxlength="200" placeholder="دلیل کوتاه و روشن وارد کنید"></textarea></label><div class="dialog-actions"><button type="button" class="btn secondary" data-action="dialog-close">انصراف</button><button type="submit" id="dialog-confirm" class="btn">تأیید</button></div></form></dialog>`;
 const menu=document.querySelector('.menu-list');if(menu)menu.scrollTop=priorMenuScroll;
 if(window.scrollY!==priorY)window.scrollTo({top:priorY,behavior:'instant'});
 restoreRenderSnapshot(snapshot);
}
let pendingAction=null;
function showActionDialog(type,itemId=null){
 const dlg=document.querySelector('#action-dialog');if(!dlg)return;
 const reason=dlg.querySelector('#reason-wrap'),title=dlg.querySelector('#dialog-title'),details=dlg.querySelector('#dialog-details'),confirm=dlg.querySelector('#dialog-confirm');
 pendingAction={type,itemId,expectedStatus:type==='cancel'?document.querySelector(`[data-action=\"cancel\"][data-id=\"${itemId}\"]`)?.dataset.from:null};reason.hidden=type==='checkout';reason.querySelector('.label').textContent=type==='void'?'دلیل بستن میز':'دلیل لغو';const reasonInput=dlg.querySelector('#dialog-reason');reasonInput.disabled=type==='checkout';reasonInput.required=type!=='checkout';reasonInput.value='';
 if(type==='cancel'){
  title.textContent='لغو قلم سفارش';details.textContent=can('manager')?'لغو این قلم با اختیار مدیر انجام می‌شود. علت لغو در سابقه شیفت ثبت خواهد شد.':'لغو فقط برای غذای در صف مجاز است. دلیل لغو در سابقه شیفت ثبت می‌شود.';
  confirm.textContent='ثبت لغو';confirm.className='btn danger';dlg.querySelector('#dialog-reason').value='';
 }else if(type==='void'){
  title.textContent='بستن میز لغوشده';details.textContent='همه اقلام این میز لغو شده‌اند. هیچ مبلغی دریافت یا ثبت نمی‌شود؛ دلیل بسته‌شدن در سوابق مدیریتی باقی می‌ماند.';
  confirm.textContent='ثبت دلیل و آزادکردن میز';confirm.className='btn danger';
 }else{
  const session=sessionFor(state.cashTableId),amount=session?subtotal(itemsFor(session.id))-session.discount_toman:0;
  title.textContent='تأیید دریافت وجه';details.textContent=`آیا مبلغ ${toman(amount)} با روش ${labels[state.payMethod]} از مشتری دریافت شده است؟ این برنامه به بانک متصل نیست.`;
  confirm.textContent='وجه دریافت شد؛ بستن میز';confirm.className='btn';
 }
 dlg.showModal();
}
async function onClick(event){const btn=event.target.closest('[data-action]');if(!btn)return;const action=btn.dataset.action,id=btn.dataset.id;if(state.busy){notify('عملیات قبلی هنوز در حال ثبت است.');return;}
 if(action==='demo'){document.querySelector('#email').value=btn.dataset.email;if(localDemo()){document.querySelector('#password').value='Demo-Shift-1405!';notify('حساب نمایشی آماده است؛ برای ورود دکمه ورود به پنل را بزنید.');}else{document.querySelector('#password').focus();notify('حساب انتخاب شد. رمز ورود ارائه‌شده به ارزیاب را وارد کنید.');}return;}
 if(action==='dialog-close'){document.querySelector('#action-dialog')?.close();pendingAction=null;return;}
 if(action==='logout'){if(!confirmDiscard())return;try{await api('/api/auth/logout',{method:'POST',body:'{}'});}catch(err){if(err.status!==401){notify('خروج از حساب روی سرور تأیید نشد. اتصال را بررسی و دوباره تلاش کنید.',true);return;}}state.me=null;clearInterval(state.poll);resetWorkspace();render();return;}
 if(action==='nav'){if(id===state.view)return;if(state.view==='hall'){if(!confirmDiscard())return;clearOrderDraft();}const oldY=window.scrollY;state.view=id;render();if(oldY>180){const main=document.querySelector('#main-content');main?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}return;}
 if(action==='table'){if(id!==state.tableId){if(!confirmDiscard())return;clearOrderDraft();}state.tableId=id;activateHallStage('menu');return;}
 if(action==='cash-table'){state.cashTableId=id;render();if(window.matchMedia('(max-width:850px)').matches){document.querySelector('.cash-bill')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}return;}
 if(action==='hall-step'){activateHallStage(id);return;}
 if(action==='cat'){state.cat=id;syncMenuFilter();return;}
 if(action==='add'){const entry=state.draft.find(x=>x.menuItemId===id&&!x.note.trim()&&x.qty<20);if(entry)entry.qty++;else if(state.draft.length<12)state.draft.push({menuItemId:id,qty:1,note:''});else{notify('در هر نوبت حداکثر ۱۲ ردیف سفارش مجاز است؛ ابتدا نوبت فعلی را ثبت کنید.',true);return;}render();return;}
 if(action==='qty'){const x=state.draft[Number(id)];if(x){x.qty+=Number(btn.dataset.dir);if(x.qty<1)state.draft.splice(Number(id),1);else x.qty=Math.min(20,x.qty);}render();return;}
 if(action==='remove-draft'){state.draft.splice(Number(id),1);render();return;}
 if(action==='split-note'){const i=Number(id),line=state.draft[i];if(!line||line.qty<2)return;if(state.draft.length>=12){notify('برای تفکیک، ابتدا بخشی از سفارش را ثبت کنید؛ سقف هر نوبت ۱۲ ردیف است.',true);return;}line.qty--;state.draft.splice(i+1,0,{menuItemId:line.menuItemId,qty:1,note:''});render();const input=document.querySelector(`[data-draft-note=\"${i+1}\"]`);input?.focus();notify('یک قلم جدا شد؛ یادداشت مخصوص آن را وارد کنید.');return;}
 if(action==='submit-round'){const items=state.draft.map(x=>({menuItemId:x.menuItemId,quantity:x.qty,note:x.note}));const session=sessionFor(state.tableId);state.roundKey??=crypto.randomUUID();const key=state.roundKey;await run(async()=>{await api('/api/rounds',{method:'POST',body:JSON.stringify({tableId:state.tableId,expectedSessionId:session?.id??null,idempotencyKey:key,items})});state.draft=[];state.roundKey=null;state.aiPreview=null;state.aiText='';state.mobileStage='order';},{success:'نوبت سفارش ثبت شد و در آشپزخانه قابل مشاهده است.'});return;}
 if(action==='transition'){await run(()=>api(`/api/items/${id}/transition`,{method:'POST',body:JSON.stringify({to:btn.dataset.to,expectedStatus:btn.dataset.from})}),{success:btn.dataset.to==='ready'?'غذا آماده است؛ پیشخدمت مطلع می‌شود.':btn.dataset.to==='served'?'تحویل غذا به مشتری ثبت شد.':'مرحله آماده‌سازی تغییر کرد.'});return;}
 if(action==='cancel'){showActionDialog('cancel',id);return;}
 if(action==='pay-method'){state.payMethod=id;for(const option of document.querySelectorAll('.pay-option')){const selected=option.dataset.id===id;option.classList.toggle('active',selected);option.setAttribute('aria-pressed',String(selected));}return;}
 if(action==='discount'){const session=sessionFor(state.cashTableId);const amount=parseTomanInput(document.querySelector('#discount-input')?.value);if(!session)return;if(amount===null){notify('مبلغ تخفیف را با رقم‌های فارسی یا انگلیسی، بدون اعشار وارد کنید.',true);document.querySelector('#discount-input')?.focus();return;}await run(async()=>{await api(`/api/sessions/${session.id}/discount`,{method:'POST',body:JSON.stringify({amountToman:amount,expectedVersion:session.version})});state.discountDraft=null;},{success:'تخفیف روی صورتحساب ثبت شد.'});return;}
 if(action==='checkout'){const session=sessionFor(state.cashTableId);if(!session)return;showActionDialog('checkout');return;}
 if(action==='void-session'){if(!can('manager'))return;const session=sessionFor(state.cashTableId);if(!session)return;showActionDialog('void');return;}
 if(action==='ai-parse'){const note=state.aiText || (document.querySelector('#ai-note')?.value??'');await run(async()=>{state.aiPreview=await api('/api/ai/parse',{method:'POST',body:JSON.stringify({note})});},{success:'پیشنهاد آماده است. پیش از افزودن آن را بررسی کنید.'});return;}
 if(action==='ai-apply'){const proposals=state.aiPreview?.items??[];const quantities=proposals.map(x=>parseCountInput(x.quantity));if(quantities.some(n=>n===null)){notify('تعداد اقلام پیشنهادی باید بین ۱ تا ۲۰ و به‌صورت عدد فارسی یا انگلیسی باشد.',true);return;}const next=state.draft.map(d=>({...d}));for(const [i,x] of proposals.entries()){const q=quantities[i];const original=next.find(d=>d.menuItemId===x.menuItemId&&d.note===x.note&&d.qty+q<=20);if(original)original.qty+=q;else next.push({menuItemId:x.menuItemId,qty:q,note:x.note});}if(next.length>12){notify('در هر نوبت حداکثر ۱۲ ردیف سفارش مجاز است. نخست نوبت فعلی را ثبت کنید.',true);return;}state.draft=next;state.aiPreview=null;activateHallStage('order');notify('اقلام تأییدشده به پیش‌نویس اضافه شدند.');return;}
}
async function onSubmit(ev){
 if(ev.target.id==='action-form'){
  ev.preventDefault();const selected=pendingAction,dlg=document.querySelector('#action-dialog');if(!selected||!dlg)return;
  if(selected.type==='cancel'||selected.type==='void'){
   const reason=dlg.querySelector('#dialog-reason').value.trim();if(reason.length<3){notify('دلیل ثبت‌شده حداقل باید سه کاراکتر باشد.',true);return;}
   dlg.close();pendingAction=null;
   if(selected.type==='void'){const session=sessionFor(state.cashTableId);if(!session)return;await run(()=>api(`/api/sessions/${session.id}/void`,{method:'POST',body:JSON.stringify({expectedVersion:session.version,reason})}),{success:'میز لغوشده بدون ثبت وجه آزاد شد.'});}
   else await run(()=>api(`/api/items/${selected.itemId}/transition`,{method:'POST',body:JSON.stringify({to:'cancelled',expectedStatus:selected.expectedStatus??'queued',reason})}),{success:'لغو قلم با دلیل ثبت شد.'});
  }else{
   const session=sessionFor(state.cashTableId);dlg.close();pendingAction=null;if(!session)return;
   await run(()=>api(`/api/sessions/${session.id}/checkout`,{method:'POST',body:JSON.stringify({method:state.payMethod,expectedVersion:session.version})}),{success:'تسویه ثبت شد و میز آزاد است.'});
  }
  return;
 }
 if(ev.target.id!=='login-form')return;ev.preventDefault();const btn=document.querySelector('#login-submit');btn.disabled=true;try{const result=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:document.querySelector('#email').value,password:document.querySelector('#password').value})});resetWorkspace();state.me=result.me;state.features=result.features??{aiEnabled:false};state.view=can('waiter','manager')?'hall':can('kitchen')?'kitchen':'cashier';render();await refresh(true);clearInterval(state.poll);state.poll=setInterval(()=>refresh().catch(()=>notify('اتصال به سرور برقرار نیست.',true)),5000);}catch(err){notify(err.message,true);}finally{if(btn.isConnected)btn.disabled=false;}}
app.addEventListener('click',onClick);app.addEventListener('submit',onSubmit);
app.addEventListener('input',(ev)=>{const t=ev.target;if(t.id==='ai-note')state.aiText=t.value;if(t.id==='discount-input'){const session=sessionFor(state.cashTableId);if(session)state.discountDraft={sessionId:session.id,value:t.value};const hint=document.querySelector('#discount-hint');if(hint)hint.textContent='مبلغ واردشده هنوز ثبت نشده است؛ برای اعمال، دکمه ثبت تخفیف را بزنید.';}if(t.id==='menu-search'){state.search=t.value;syncMenuFilter();}if(t.dataset.draftNote!==undefined){const x=state.draft[Number(t.dataset.draftNote)];if(x)x.note=t.value;}if(t.dataset.aiQty!==undefined&&state.aiPreview){const i=Number(t.dataset.aiQty);state.aiPreview.items[i].quantity=t.value;}if(t.dataset.aiNote!==undefined&&state.aiPreview){const i=Number(t.dataset.aiNote);state.aiPreview.items[i].note=t.value;}});
app.addEventListener('focusout',()=>{if(!state.pendingRefresh)return;setTimeout(()=>{if(state.pendingRefresh&&!document.activeElement?.matches('input,textarea,select')&&!document.querySelector('#action-dialog[open]')){state.pendingRefresh=false;keepViewportRender();}},150);});
app.addEventListener('change',(ev)=>{if(ev.target.id==='branch-select'){if(!confirmDiscard()){ev.target.value=state.branchId;return;}state.branchId=ev.target.value;state.tableId=null;state.cashTableId=null;clearOrderDraft();state.discountDraft=null;state.search='';state.cat='همه';state.mobileStage='tables';render();}});
async function boot(){try{const result=await api('/api/me');state.me=result.me;state.features=result.features??{aiEnabled:false};state.view=can('waiter','manager')?'hall':can('kitchen')?'kitchen':'cashier';await refresh(true);state.poll=setInterval(()=>refresh().catch(()=>{}),5000);}catch{state.me=null;resetWorkspace();render();}}
window.addEventListener('beforeunload',event=>{if(state.draft.length){event.preventDefault();event.returnValue='';}});
boot();
