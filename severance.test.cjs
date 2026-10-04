// Synthetic fixtures only. Run with: node --test severance.test.cjs
const {readFileSync}=require('node:fs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=readFileSync(__dirname+'/index.html','utf8');
const salary=html.slice(html.indexOf('function salaryDateKST'),html.indexOf('function refreshSalaryViews'));
const severance=html.slice(html.indexOf('function severanceDay'),html.indexOf('function scL'));
function setup(history={}){
  const sandbox={data:{salaryHistory:history}};
  vm.createContext(sandbox);vm.runInContext(salary+'\n'+severance,sandbox);
  return sandbox;
}
const teacher=(extra={})=>({name:'Synthetic teacher',branch:'공릉',start:'2025-06-01',baseSalary:250,...extra});
const h=(id,date,amount,reason='[월급]')=>({id,date,amount,reason});
test('automatic eligibility restores the first year of service',()=>{
  const s=setup({'Synthetic teacher':[h(1,'2026-03-01',300)]}),t=teacher();
  const r=s.severanceEstimate(t,'2026-10-04');
  assert.equal(r.start,'2025-06-01');assert.equal(r.eligibleDate,'2026-06-01');
  assert.equal(r.days,490);assert.equal(r.amount,402.7);assert.equal(s.severanceTenure(r),'1년 4개월 · 490일');
});
test('calendar anniversary gates a full first year, not zero days',()=>{
  const s=setup(),t=teacher();
  assert.equal(s.calcSeverance(t,'2026-05-31'),0);
  assert.equal(s.calcSeverance(t,'2026-06-01'),250);
  assert.equal(s.isSeveranceActive(t,'2026-05-31'),false);
  assert.equal(s.isSeveranceActive(t,'2026-06-01'),true);
});
test('leap-year service uses calendar anniversary and actual elapsed days',()=>{
  const s=setup(),t=teacher({start:'2024-02-29',baseSalary:365});
  assert.equal(s.severanceStartDate(t),'2025-03-01');
  assert.equal(s.calcSeverance(t,'2025-02-28'),0);
  assert.equal(s.severanceEstimate(t,'2025-03-01').days,366);
  assert.equal(s.calcSeverance(t,'2025-03-01'),366);
  assert.equal(s.calcSeverance(teacher({start:'2023-03-01',baseSalary:365}),'2024-02-29'),0);
  assert.equal(s.calcSeverance(teacher({start:'2023-03-01',baseSalary:365}),'2024-03-01'),366);
});
test('manual qualifying service start is preserved and gets its own anniversary',()=>{
  const s=setup(),t=teacher({start:'2017-01-01',severanceStart:'2018-04-01',baseSalary:365});
  assert.equal(s.severanceStartDate(t),'2019-04-01');
  assert.equal(s.calcSeverance(t,'2019-03-31'),0);
  assert.equal(s.calcSeverance(t,'2019-04-01'),365);
  assert.equal(t.severanceStart,'2018-04-01');
  // A date coinciding with hire + 1 year remains an explicit service-start override.
  assert.equal(s.calcSeverance(teacher({severanceStart:'2026-06-01'}),'2026-06-01'),0);
});
test('contract expiry does not end active service',()=>{
  const s=setup();
  assert.equal(s.calcSeverance(teacher({end:'2026-06-01'}),'2026-10-04'),335.6);
});
test('actual retirement freezes both service and effective salary',()=>{
  const s=setup({'Synthetic teacher':[h(1,'2026-03-01',300),h(2,'2026-09-01',500)]});
  const t=teacher({exitDate:'2026-07-01',end:'2027-12-31'});
  assert.equal(s.severanceEstimate(t,'2026-10-04').days,395);
  assert.equal(s.severanceEstimate(t,'2026-10-04').salary,300);
  assert.equal(s.calcSeverance(t,'2026-10-04'),s.calcSeverance(t,'2027-10-04'));
  assert.equal(s.calcSeverance(teacher({exitDate:'2026-05-01'}),'2026-10-04'),0);
  assert.equal(s.calcSeverance(teacher({exitDate:null}),'2026-10-04'),null);
});
test('effective dates exclude future salaries and use stable same-date ordering',()=>{
  const s=setup({'Synthetic teacher':[h(2,'2026-10-01',270),h(3,'2026-10-01',280),h(4,'2027-01-01',350)]});
  assert.equal(s.severanceEstimate(teacher(),'2026-10-04').salary,280);
  assert.equal(s.severanceEstimate(teacher(),'2027-01-01').salary,350);
  assert.equal(s.severanceEstimate(teacher(),'2026-06-01').salary,250);
});
test('unknown wages and hourly wages are not treated as monthly amounts or zero',()=>{
  const s=setup({'Synthetic teacher':[h(1,'2025-01-01',27000,'[시급]')]});
  assert.equal(s.severanceEstimate(teacher(),'2026-10-04').status,'review');
  assert.equal(s.calcSeverance(teacher(),'2026-10-04'),null);
  assert.equal(setup().calcSeverance(teacher({baseSalary:25000}),'2026-10-04'),null);
  assert.equal(setup().calcSeverance(teacher({baseSalary:0}),'2026-10-04'),null);
  assert.equal(setup().calcSeverance(teacher({baseSalary:-10}),'2026-10-04'),null);
  assert.equal(setup({'Synthetic teacher':[h(1,'2025-01-01',2.7,'[시급]')]}).calcSeverance(teacher(),'2026-10-04'),null);
  // A stale part-time title is not a decision on legal eligibility.
  assert.equal(setup().calcSeverance(teacher({position:'파트타임강사'}),'2026-06-01'),250);
});
test('missing, impossible, future or reversed dates never produce NaN/negative estimates',()=>{
  const s=setup();
  for(const bad of [null,'','invalid','2025-02-30','2026-13-01','2026-10-20'])assert.equal(s.calcSeverance(teacher({start:bad}),'2026-10-04'),null);
  for(const bad of ['invalid','2025-02-30','2024-01-01','2027-01-01'])assert.equal(s.calcSeverance(teacher({severanceStart:bad}),'2026-10-04'),null);
  assert.equal(s.calcSeverance(teacher(),'bad'),null);
});
test('potential candidates are excluded even when their dates or salary appear eligible',()=>{
  const s=setup(),t=teacher({branch:'potential'});
  assert.equal(s.calcSeverance(t,'2026-10-04'),null);
  assert.equal(s.isSeveranceActive(t,'2026-10-04'),false);
});
test('Korean midnight determines date regardless of machine timezone',()=>{
  const s=setup();
  assert.equal(s.salaryDateKST(new Date('2026-10-03T14:59:59Z')),'2026-10-03');
  assert.equal(s.salaryDateKST(new Date('2026-10-03T15:00:00Z')),'2026-10-04');
});
test('dashboard uses shared estimates and visibly reports exclusions',()=>{
  const s=setup();const elements=new Map();
  s.document={getElementById(id){if(!elements.has(id))elements.set(id,{textContent:''});return elements.get(id);}};
  s.ts=[teacher(),teacher({name:'Other',branch:'중계',baseSalary:350}),teacher({name:'Unknown',baseSalary:0}),teacher({name:'New',start:'2026-01-01'})];
  vm.runInContext("salaryDateKST=()=> '2026-10-04';",s);
  const a=html.indexOf('  // 재직 강사만 포함하며'),b=html.indexOf('  const urg=',a);
  vm.runInContext(html.slice(a,b),s);
  assert.equal(elements.get('m-sv-total').textContent,'805.5만원');
  assert.equal(elements.get('m-sv-detail').textContent,'2명 · 1명 제외');
  assert.match(elements.get('m-sv-note').textContent,/부분 합계.*Unknown/);
});
test('all inline scripts parse and retired manual dates remain mapped and preserved',()=>{
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
  assert.match(html,/baseSalary:r.base_salary, severanceStart:r.severance_start\|\|null/);
  assert.match(html,/base_salary:t.baseSalary\|\|0, severance_start:t.severanceStart\|\|null/);
});
