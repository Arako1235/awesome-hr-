const {readFileSync}=require('node:fs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=readFileSync(__dirname+'/index.html','utf8');
const native=readFileSync(__dirname+'/withdrawals.js','utf8');
const profile=html.slice(html.indexOf('function renderInnerRetention'),html.indexOf('// ══ ACTIONS',html.indexOf('function renderInnerRetention')));
function setup(extra={}){
 const host={innerHTML:''},connection={hidden:false},frame={dataset:{withdrawalView:'1'},contentWindow:{},hidden:true};
 const root={querySelector:selector=>selector==='.aw-content'?host:selector==='.aw-connection'?connection:frame};
 const inner={innerHTML:''};const timers=new Map();let seq=0;
 const s={URL,data:{teachers:[{name:'Test 테스트'}],exited:[],retentionRates:[],...extra},candidateEscape:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),window:{addEventListener(){},setTimeout(fn){timers.set(++seq,fn);return seq},clearTimeout(id){timers.delete(id)}},document:{getElementById:id=>id==='inner-retention'?inner:root,querySelectorAll:()=>[frame]}};
 vm.createContext(s);vm.runInContext(native+'\n'+profile,s);
 return {s,host,frame,connection,inner,timers,view:()=>vm.runInContext('withdrawalViews.get(1)',s),send:msg=>s.receiveWithdrawalMessage({origin:'https://awesome-office.vercel.app',source:frame.contentWindow,data:msg})};
}
const row={month:'2026-09',campus:'junggye',teacher:'Test',withdrawals:2,opening:20,rate:10,status:'대조 완료'};
const ready=(rows=[row])=>({type:'awesome:teacher-withdrawals',version:1,state:'ready',rows,updated:'12:30'});
test('profile connects without manual history and renders native cards after authorization',()=>{const t=setup();t.s.renderInnerRetention('Test 테스트');assert.doesNotMatch(t.inner.innerHTML,/수동|재등록/);assert.match(t.inner.innerHTML,/view=hr/);t.send(ready());assert.match(t.host.innerHTML,/10.0%/);assert.match(t.host.innerHTML,/월별 기록/);assert.equal(t.frame.hidden,true);assert.equal(t.connection.hidden,true)});
test('manual retention data has no query, action, form, or displayed value',()=>{const t=setup({retentionRates:[{teacher:'Test 테스트',month:'2026-08',rate:90}]});t.s.renderInnerRetention('Test 테스트');assert.doesNotMatch(t.inner.innerHTML,/90%|수동|재등록/);assert.doesNotMatch(html,/retention_rates|retentionRates|saveRetention|deleteRetention|latestRetention|rt-total-students/)});
test('same English names require manual disambiguation',()=>{const t=setup({teachers:[{name:'Test 첫째'},{name:'Test 둘째'}]});const out=t.s.withdrawalWidgetHtml('Test 첫째');assert.doesNotMatch(out,/teacher=/);t.send(ready());assert.match(t.host.innerHTML,/자동 선택을 보류/)});
test('wrong origin or wrong frame cannot inject an aggregate',()=>{const t=setup();t.s.withdrawalWidgetHtml();t.s.receiveWithdrawalMessage({origin:'https://evil.example',source:t.frame.contentWindow,data:ready()});assert.equal(t.view().state,'loading');t.s.receiveWithdrawalMessage({origin:'https://awesome-office.vercel.app',source:{},data:ready()});assert.equal(t.view().state,'loading')});
test('invalid math rejects a message and logout clears every rendered value',()=>{const t=setup();t.s.withdrawalWidgetHtml();t.send(ready([{...row,rate:99}]));assert.equal(t.view().state,'error');t.send(ready());assert.match(t.host.innerHTML,/10.0%/);t.send({...ready(),state:'auth-required'});assert.equal(t.view().rows.length,0);assert.doesNotMatch(t.host.innerHTML,/10.0%/);assert.equal(t.connection.hidden,false)});
test('expired connection clears data without persisting aggregate values',()=>{const t=setup();t.s.withdrawalWidgetHtml();t.send(ready());[...t.timers.values()].at(-1)();assert.equal(t.view().rows.length,0);assert.equal(t.view().state,'error');assert.doesNotMatch(native,/localStorage|sessionStorage|\bsb\.from\(/)});
test('weighted rate uses known denominators and unknown is never zero',()=>{const t=setup();const result=t.s.withdrawalAverage([row,{...row,opening:180,rate:2/180*100},{...row,opening:null,rate:null}]);assert.equal(result.rate,2);assert.equal(result.pending,1);assert.match(t.s.withdrawalBar({...row,rate:null}),/확인 필요/);assert.match(t.s.withdrawalBar({...row,opening:1,rate:200}),/width:100%/)});
test('teacher filters use exact identity and source strings are escaped',()=>{const t=setup();t.s.withdrawalWidgetHtml('Test 테스트');t.send(ready([row,{...row,teacher:'Testa',rate:0,withdrawals:0}]));assert.doesNotMatch(t.host.innerHTML,/Testa/);t.s.withdrawalWidgetHtml();t.frame.dataset.withdrawalView='2';t.send(ready([{...row,teacher:'<svg onload=alert(1)>'}]));assert.doesNotMatch(t.host.innerHTML,/<svg/)});
test('new external script and all inline scripts parse',()=>{new vm.Script(native);for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);assert.ok(html.indexOf('src="withdrawals.js"')<html.indexOf('const SUPABASE_URL'))});

test('automatic history starts January 2026 and filters campus without fabricated zeroes',()=>{const t=setup();t.s.withdrawalWidgetHtml();t.send(ready([{...row,month:'2025-12'}, {...row,month:'2026-01'},row]));assert.doesNotMatch(t.host.innerHTML,/2025-12/);assert.match(t.host.innerHTML,/2026-01/);t.s.setWithdrawalFilter(1,'campus','gongneung');assert.match(t.host.innerHTML,/연결된 교사 기록이 없습니다/);assert.doesNotMatch(t.host.innerHTML,/0.0%/)});
