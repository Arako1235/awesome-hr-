const {readFileSync}=require('node:fs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=readFileSync(__dirname+'/index.html','utf8');
const functions=html.slice(html.indexOf('function withdrawalTeacherKey'),html.indexOf('// ══ ACTIONS',html.indexOf('function withdrawalTeacherKey')));
function setup(extra={}){const el={innerHTML:''};const s={URL,data:{teachers:[{name:'Test 테스트'}],exited:[],retentionRates:[],...extra},candidateEscape:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),document:{getElementById:()=>el}};vm.createContext(s);vm.runInContext(functions,s);return {s,el}}
test('profile embeds automatic rate even without manual retention records',()=>{const {s,el}=setup();s.renderInnerRetention('Test 테스트');assert.match(el.innerHTML,/<iframe/);assert.match(el.innerHTML,/teacher=Test/);assert.match(el.innerHTML,/수동 재등록률 기록 없음/)});
test('manual retention history remains alongside automatic rates',()=>{const {s,el}=setup({retentionRates:[{teacher:'Test 테스트',month:'2026-08',rate:90}]});s.renderInnerRetention('Test 테스트');assert.match(el.innerHTML,/90%/);assert.match(el.innerHTML,/<iframe/)});
test('ambiguous English names require manual review rather than silently combining',()=>{const {s}=setup({teachers:[{name:'Test 첫째'},{name:'Test 둘째'}]});const out=s.withdrawalWidgetHtml('Test 첫째');assert.match(out,/자동 선택을 보류/);assert.doesNotMatch(out,/teacher=/)});
test('URL values cannot break out of frame attributes and links have no opener',()=>{const {s}=setup();const out=s.withdrawalWidgetHtml('Test "<svg onload=alert(1)>');assert.doesNotMatch(out,/<svg/);assert.match(out,/noopener noreferrer/);assert.match(out,/referrerpolicy="no-referrer"/)});
test('all inline scripts parse',()=>{for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1])});