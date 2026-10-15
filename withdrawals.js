// Authenticated management aggregates are kept in memory only.
const withdrawalViews=new Map();
let withdrawalViewSequence=0;
const withdrawalOrigin='https://awesome-office.vercel.app';
function withdrawalTeacherKey(value){
 const clean=String(value||'').normalize('NFKC').trim().replace(/^T\.\s*/i,'');
 const english=clean.match(/^([A-Za-z][A-Za-z .'-]*?)\s+[가-힣]/);
 return (english?english[1]:clean).replace(/\s+/g,' ').toLocaleLowerCase('en');
}
function validWithdrawalRows(rows){
 if(!Array.isArray(rows)||rows.length>5000)return false;
 return rows.every(r=>r&&/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)&&['gongneung','junggye'].includes(r.campus)&&typeof r.teacher==='string'&&r.teacher.length<=160&&Number.isSafeInteger(r.withdrawals)&&r.withdrawals>=0&&(r.opening===null||Number.isSafeInteger(r.opening)&&r.opening>=0)&&(r.rate===null||Number.isFinite(r.rate)&&r.rate>=0&&r.opening>0&&Math.abs(r.rate-r.withdrawals/r.opening*100)<0.000001)&&typeof r.status==='string'&&r.status.length<=300);
}
function withdrawalAverage(rows){
 const verified=rows.filter(r=>r.rate!==null&&r.opening>0);
 const opening=verified.reduce((n,r)=>n+r.opening,0),withdrawals=verified.reduce((n,r)=>n+r.withdrawals,0);
 return {rate:opening>0?withdrawals/opening*100:null,opening,withdrawals,verified:verified.length,pending:rows.length-verified.length};
}
function withdrawalPercent(value){return value===null?'확인 필요':value.toFixed(1)+'%'}
function disposeWithdrawalView(id){const v=withdrawalViews.get(id);if(v?.chart)v.chart.destroy();if(v?.timer)window.clearTimeout(v.timer);withdrawalViews.delete(id)}
function armWithdrawalExpiry(id,ms=180000){const v=withdrawalViews.get(id);if(!v)return;if(v.timer)window.clearTimeout(v.timer);v.timer=window.setTimeout(()=>{if(!withdrawalViews.has(id))return;v.rows=[];v.state='error';renderNativeWithdrawal(id)},ms)}
function withdrawalWidgetHtml(name=''){
 const context=name?'profile':'overview';
 for(const [id,v] of withdrawalViews)if(v.context===context)disposeWithdrawalView(id);
 const names=[...new Set([...data.teachers,...data.exited].map(t=>t.name).filter(Boolean))];
 const ambiguous=name&&names.filter(n=>withdrawalTeacherKey(n)===withdrawalTeacherKey(name)).length>1;
 const url=new URL(withdrawalOrigin+'/teacher-retention/');
 if(name&&!ambiguous)url.searchParams.set('teacher',name);
 const detailUrl=url.href;url.searchParams.set('view','hr');
 const id=++withdrawalViewSequence;
 withdrawalViews.set(id,{id,context,name,ambiguous,state:'loading',rows:[],month:'',campus:'all',teacher:'',detailUrl,updated:'',chart:null,timer:null});
 armWithdrawalExpiry(id,20000);
 return `<section class="card auto-withdrawal-widget" id="aw-${id}">
  <div class="aw-heading"><div class="card-title">자동 퇴원율 <span class="aw-badge">원장 연동</span></div><a class="aw-detail" href="${candidateEscape(detailUrl)}" target="_blank" rel="noopener noreferrer">학생·사유 상세 ↗</a></div>
  <div class="aw-content" aria-live="polite"><p class="aw-note" role="status">경영 원장을 확인하고 있어요…</p></div>
  <div class="aw-connection"><button class="btn btn-sm" onclick="toggleWithdrawalLogin(${id})">경영 계정 연결</button><a href="${candidateEscape(detailUrl)}" target="_blank" rel="noopener noreferrer">새 창에서 연결 ↗</a></div>
  <iframe class="aw-frame" data-withdrawal-view="${id}" title="경영 계정 연결" src="${candidateEscape(url.href)}" loading="eager" referrerpolicy="no-referrer" hidden></iframe>
 </section>`;
}
function renderAutoWithdrawal(){const host=document.getElementById('auto-withdrawal-overview');if(host&&!host.querySelector('iframe'))host.innerHTML=withdrawalWidgetHtml()}
function toggleWithdrawalLogin(id){const root=document.getElementById('aw-'+id),frame=root?.querySelector('.aw-frame');if(frame){frame.hidden=!frame.hidden;if(!frame.hidden)frame.focus()}}
function retryWithdrawalConnection(id){const root=document.getElementById('aw-'+id),frame=root?.querySelector('.aw-frame'),v=withdrawalViews.get(id);if(!v||!frame)return;v.rows=[];v.state='loading';renderNativeWithdrawal(id);frame.src=frame.src;armWithdrawalExpiry(id,20000)}
function setWithdrawalFilter(id,key,value){const v=withdrawalViews.get(id);if(!v||!['month','campus','teacher'].includes(key))return;v[key]=String(value);renderNativeWithdrawal(id)}
function withdrawalBar(row){
 const rate=withdrawalPercent(row.rate),width=row.rate===null?0:Math.min(100,row.rate);
 return `<div class="aw-history-row"><div class="aw-row-top"><span>${candidateEscape(row.month)} <small>${row.campus==='gongneung'?'공릉':'중계'}</small></span><strong class="${row.rate===null?'aw-pending':''}">${rate}</strong></div><div class="aw-bar"><i style="width:${width}%"></i></div><p class="aw-note">퇴원 ${row.withdrawals}명 · 월초 ${row.opening===null?'미확인':row.opening+'명'}${row.rate===null?' · '+candidateEscape(row.status):''}</p></div>`;
}
function renderNativeWithdrawal(id){
 const v=withdrawalViews.get(id),root=document.getElementById('aw-'+id),host=root?.querySelector('.aw-content');if(!v||!host)return;
 if(v.chart){v.chart.destroy();v.chart=null}
 const connection=root.querySelector('.aw-connection'),frame=root.querySelector('.aw-frame');
 if(v.state!=='ready'){
  const message=v.state==='auth-required'||v.state==='cleared'?'기존 경영 계정을 연결하면 퇴원율이 여기에 표시됩니다.':v.state==='error'?'경영 자료 연결을 확인해 주세요.':'경영 원장을 확인하고 있어요…';
  host.innerHTML=`<p class="aw-note" role="status">${message}</p>${v.state==='error'?`<button class="btn btn-sm" onclick="retryWithdrawalConnection(${id})">다시 연결</button>`:''}`;
  connection.hidden=false;return;
 }
 connection.hidden=true;frame.hidden=true;
 const rows=v.rows.filter(r=>r.month>='2026-01'&&(!v.name||v.ambiguous||withdrawalTeacherKey(r.teacher)===withdrawalTeacherKey(v.name))&&(v.campus==='all'||r.campus===v.campus)&&(!v.teacher||withdrawalTeacherKey(r.teacher)===withdrawalTeacherKey(v.teacher)));
 const months=[...new Set(v.rows.filter(r=>r.month>='2026-01').map(r=>r.month))].sort().reverse();
 if(!months.includes(v.month))v.month=months[0]||'';
 const monthly=rows.filter(r=>r.month===v.month),summary=withdrawalAverage(monthly),average=withdrawalAverage(rows);
 const teachers=[...new Map(v.rows.filter(r=>r.month>='2026-01').map(r=>[withdrawalTeacherKey(r.teacher),r.teacher])).values()].sort();
 const controls=`<div class="aw-filters"><label>기준 월<select onchange="setWithdrawalFilter(${id},'month',this.value)">${months.length?months.map(m=>`<option value="${m}"${m===v.month?' selected':''}>${m}</option>`).join(''):'<option>자료 없음</option>'}</select></label><label>캠퍼스<select onchange="setWithdrawalFilter(${id},'campus',this.value)"><option value="all"${v.campus==='all'?' selected':''}>전체</option><option value="gongneung"${v.campus==='gongneung'?' selected':''}>공릉</option><option value="junggye"${v.campus==='junggye'?' selected':''}>중계</option></select></label>${!v.name||v.ambiguous?`<label>퇴원 당시 담임<select onchange="setWithdrawalFilter(${id},'teacher',this.value)"><option value="">전체 교사</option>${teachers.map(t=>`<option value="${candidateEscape(t)}"${t===v.teacher?' selected':''}>${candidateEscape(t)}</option>`).join('')}</select></label>`:''}</div>`;
 const coverage=`확인된 집계 ${summary.verified}개${summary.pending?' · 확인 필요 '+summary.pending+'개':''}`;
 const cards=`<div class="aw-summary"><div><span>${v.month||'최근 월'} ${v.name||v.teacher?'퇴원율':'확인된 교사 퇴원율'}</span><strong>${withdrawalPercent(summary.rate)}</strong><small>${coverage}</small></div><div><span>확인된 기간 퇴원율</span><strong>${withdrawalPercent(average.rate)}</strong><small>${average.verified}개 집계 기준${average.pending?' · '+average.pending+'개 확인 필요':''}</small></div></div>`;
 const chartMonths=[...new Set(rows.map(r=>r.month))].sort();
 const chart=`<div class="aw-trend"><h4>월별 퇴원율 추이</h4><div class="aw-chart"><canvas id="aw-chart-${id}" role="img" aria-label="인원이 확인된 교사별 월별 퇴원율 추이"></canvas></div><p class="aw-note">월초 인원이 확인된 집계만 반영 · 퇴원 합계 ÷ 월초 담당 인원 합계 · 미확인 월은 빈칸</p></div>`;
 const teacherCards=monthly.length?`<div class="aw-teacher-grid">${monthly.map(r=>`<div class="aw-teacher"><div class="aw-row-top"><span>${candidateEscape(r.teacher)} <small>${r.campus==='gongneung'?'공릉':'중계'}</small></span><strong class="${r.rate===null?'aw-pending':''}">${withdrawalPercent(r.rate)}</strong></div><div class="aw-bar"><i style="width:${r.rate===null?0:Math.min(100,r.rate)}%"></i></div><p class="aw-note">퇴원 ${r.withdrawals}명 · 월초 ${r.opening===null?'미확인':r.opening+'명'}</p>${r.rate===null?`<p class="aw-pending-note">${candidateEscape(r.status)}</p>`:''}</div>`).join('')}</div>`:'<p class="aw-note">선택한 월에 연결된 교사 기록이 없습니다. 미등록은 0명으로 계산하지 않습니다.</p>';
 const history=v.name||v.teacher?`<div class="aw-history"><h4>월별 기록</h4>${[...rows].sort((a,b)=>b.month.localeCompare(a.month)||a.campus.localeCompare(b.campus)).map(withdrawalBar).join('')||'<p class="aw-note">연결된 원장 기록이 없습니다.</p>'}</div>`:'';
 host.innerHTML=(v.ambiguous?'<p class="aw-pending-note">같은 영문명의 교사가 있어 자동 선택을 보류했습니다. 담임과 캠퍼스를 확인해 주세요.</p>':'')+controls+cards+chart+`<h4 class="aw-section-title">${v.month} ${v.name?'담당 기록':'교사별 기록'}</h4>`+teacherCards+history+`<p class="aw-footnote">${candidateEscape(v.updated)} 갱신 · 퇴원 당시 담임 기준 · 2026년 1월부터 원장 자동 연동</p>`;
 if(typeof Chart==='function'&&chartMonths.length){
  const values=chartMonths.map(month=>withdrawalAverage(rows.filter(r=>r.month===month)).rate);
  v.chart=new Chart(document.getElementById('aw-chart-'+id),{type:'line',data:{labels:chartMonths,datasets:[{label:'자동 퇴원율',data:values,borderColor:'#1D9E75',backgroundColor:'rgba(29,158,117,.08)',fill:true,tension:.2,spanGaps:false,pointRadius:4,pointHoverRadius:6}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'퇴원율 '+Number(c.parsed.y).toFixed(1)+'%'}}},scales:{y:{beginAtZero:true,ticks:{callback:value=>value+'%'},grid:{color:'rgba(0,0,0,.05)'}},x:{grid:{display:false},ticks:{maxRotation:0,maxTicksLimit:6}}}}});
 }
}
function receiveWithdrawalMessage(event){
 if(event.origin!==withdrawalOrigin)return;
 const message=event.data;if(!message||message.type!=='awesome:teacher-withdrawals'||message.version!==1||!['ready','loading','auth-required','cleared','error'].includes(message.state))return;
 const frame=Array.from(document.querySelectorAll('.aw-frame')).find(f=>f.contentWindow===event.source);if(!frame)return;
 const id=Number(frame.dataset.withdrawalView),v=withdrawalViews.get(id);if(!v)return;
 if(message.state==='ready'&&(!validWithdrawalRows(message.rows)||typeof message.updated!=='string')){if(v.timer)window.clearTimeout(v.timer);v.state='error';v.rows=[];renderNativeWithdrawal(id);return}
 v.state=message.state;v.rows=message.state==='ready'?message.rows.map(r=>({month:r.month,campus:r.campus,teacher:r.teacher,withdrawals:r.withdrawals,opening:r.opening,rate:r.rate,status:r.status})):[];
 v.updated=message.state==='ready'?message.updated.slice(0,80):'';
 if(v.timer)window.clearTimeout(v.timer);if(v.state==='ready')armWithdrawalExpiry(id);else if(v.state==='loading')armWithdrawalExpiry(id,20000);
 renderNativeWithdrawal(id);
}
window.addEventListener('message',receiveWithdrawalMessage);
