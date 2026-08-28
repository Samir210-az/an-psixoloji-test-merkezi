/* ============ AI ARAYIŞLAR ============ */
window.__reportTab = 'parent';
window.__reportPeriodType = 'week';

window.setReportTab = function(tab){
  window.__reportTab = tab;
  document.querySelectorAll('#view-reports .tab-btn[data-rt]').forEach(b=>b.classList.toggle('active', b.dataset.rt===tab));
  renderReportGenPanel();
  renderReportsList();
}

function staffSelectOptionsForReports(){
  const entries = Object.entries(window.DB.staff||{}).sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||''));
  return entries.map(([id,s])=>`<option value="${id}">${esc(s.name)}</option>`).join('');
}
function patientSelectOptionsForReports(){
  const staffFilter = myStaffId();
  let entries = Object.entries(window.DB.patients||{});
  if(staffFilter) entries = entries.filter(([id,p])=>p.primaryStaffId===staffFilter);
  entries = entries.sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||''));
  return `<option value="">Seçin</option>` + entries.map(([id,p])=>`<option value="${id}">${esc(p.name)}</option>`).join('');
}
function fmtDateRange(start,end){ return fmtDate(start) + ' – ' + fmtDate(end); }
const MONTH_NAMES_AZ = ['Yanvar','Fevral','Mart','Aprel','May','İyun','İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr'];

function periodInputsHtml(periodType){
  const today = toISODate(new Date());
  if(periodType==='month'){
    return `<div class="field"><label>Ay *</label><input id="repMonth" type="month" value="${today.slice(0,7)}" onchange="renderReportPreview()"></div>`;
  }
  if(periodType==='custom'){
    const ws = currentWeekStart();
    return `
      <div class="field"><label>Başlanğıc tarixi *</label><input id="repRangeStart" type="date" value="${ws}" onchange="renderReportPreview()"></div>
      <div class="field"><label>Bitmə tarixi *</label><input id="repRangeEnd" type="date" value="${today}" onchange="renderReportPreview()"></div>`;
  }
  return `<div class="field"><label>Həftənin istənilən günü *</label><input id="repWeekStart" type="date" value="${today}" onchange="renderReportPreview()"></div>`;
}

window.setReportPeriodType = function(type){
  const prevPatient = document.getElementById('repPatient')?.value;
  const prevStaff = document.getElementById('repStaff')?.value;
  window.__reportPeriodType = type;
  renderReportGenPanel();
  const pEl = document.getElementById('repPatient'); if(pEl && prevPatient) pEl.value = prevPatient;
  const sEl = document.getElementById('repStaff'); if(sEl && prevStaff) sEl.value = prevStaff;
  renderReportPreview();
}

function getSelectedPeriod(){
  const type = window.__reportPeriodType || 'week';
  if(type==='month'){
    const raw = document.getElementById('repMonth')?.value || toISODate(new Date()).slice(0,7);
    const [y,m] = raw.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    return { type, start, end, label: `Aylıq (${MONTH_NAMES_AZ[m-1]} ${y})` };
  }
  if(type==='custom'){
    const s = document.getElementById('repRangeStart')?.value || currentWeekStart();
    let e = document.getElementById('repRangeEnd')?.value || s;
    if(e < s) e = s;
    return { type, start: s, end: e, label: `Təhsil dövrü (${fmtDateRange(s,e)})` };
  }
  const raw = document.getElementById('repWeekStart')?.value || toISODate(new Date());
  const start = mondayOf(raw), end = sundayOf(start);
  return { type:'week', start, end, label: `Həftəlik (${fmtDateRange(start,end)})` };
}

window.renderReportGenPanel = function(){
  const panel = document.getElementById('reportGenPanel');
  if(!panel) return;
  const pt = window.__reportPeriodType;
  const periodTabs = `
    <div class="tabs-inline">
      <div class="tab-btn ${pt==='week'?'active':''}" onclick="setReportPeriodType('week')">Həftəlik</div>
      <div class="tab-btn ${pt==='month'?'active':''}" onclick="setReportPeriodType('month')">Aylıq</div>
      <div class="tab-btn ${pt==='custom'?'active':''}" onclick="setReportPeriodType('custom')">Təhsil dövrü</div>
    </div>`;
  if(window.__reportTab === 'parent'){
    panel.innerHTML = `
      <div class="panel-head"><h3>Valideynə təqdim ediləcək arayış</h3></div>
      ${periodTabs}
      <div class="grid2">
        <div class="field"><label>Pasient *</label><select id="repPatient" onchange="renderReportPreview()">${patientSelectOptionsForReports()}</select></div>
        ${periodInputsHtml(pt)}
      </div>
      <div id="reportPreviewBox"></div>
      <div class="modal-actions" style="justify-content:flex-start;margin-top:1rem">
        <button class="btn btn-lav" id="repGenBtn" onclick="generateReport('parent')">✨ AI ilə arayış hazırla</button>
      </div>
      <div id="reportGenResult"></div>`;
  } else {
    const lockedToSelf = !isAdmin() && myStaffId();
    panel.innerHTML = `
      <div class="panel-head"><h3>Mütəxəssisin iş qiymətləndirməsi</h3></div>
      ${periodTabs}
      <div class="grid2">
        <div class="field"><label>Mütəxəssis *</label><select id="repStaff" ${lockedToSelf?'disabled':''} onchange="renderReportPreview()">${staffSelectOptionsForReports()}</select></div>
        ${periodInputsHtml(pt)}
      </div>
      <div id="reportPreviewBox"></div>
      <div class="modal-actions" style="justify-content:flex-start;margin-top:1rem">
        <button class="btn btn-lav" id="repGenBtn" onclick="generateReport('staff')">✨ AI ilə qiymətləndirmə hazırla</button>
      </div>
      <div id="reportGenResult"></div>`;
    if(lockedToSelf) document.getElementById('repStaff').value = myStaffId();
  }
  renderReportPreview();
}

function sessionsInRange(patientId, staffId, start, end){
  return Object.values(window.DB.sessions||{})
    .filter(s => s.date>=start && s.date<=end && (!patientId || s.patientId===patientId) && (!staffId || s.staffId===staffId))
    .sort((a,b)=>a.date.localeCompare(b.date));
}
function outcomesInRange(patientId, staffId, start, end){
  return Object.values(window.DB.outcomes||{})
    .filter(o => (!patientId || o.patientId===patientId) && (!staffId || o.staffId===staffId) && o.weekStart<=end && (o.weekEnd||o.weekStart)>=start)
    .sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
}

window.renderReportPreview = function(){
  const box = document.getElementById('reportPreviewBox');
  if(!box) return;
  const period = getSelectedPeriod();
  if(window.__reportTab === 'parent'){
    const pid = document.getElementById('repPatient')?.value;
    if(!pid){ box.innerHTML=''; return; }
    const p = window.DB.patients[pid] || {};
    const staffId = p.primaryStaffId;
    const sessions = sessionsInRange(pid, null, period.start, period.end);
    const outcomes = outcomesInRange(pid, staffId, period.start, period.end);
    box.innerHTML = `<div class="field hint" style="text-transform:none;font-size:.82rem;background:#fdfcfa;border:1px solid var(--border);border-radius:11px;padding:12px 14px">
      <b>${esc(p.name)}</b> üçün ${esc(period.label)} tarixli məlumat: ${sessions.length} seans qeydə alınıb, ${outcomes.length} həftəlik nəticə yazılıb.
      ${!sessions.length && !outcomes.length ? '<br><span style="color:var(--danger)">Bu dövr üçün heç bir seans və ya nəticə tapılmadı — əvvəlcə seans/nəticə qeyd edin.</span>' : ''}
    </div>`;
  } else {
    const sid = document.getElementById('repStaff')?.value;
    if(!sid){ box.innerHTML=''; return; }
    const sessions = sessionsInRange(null, sid, period.start, period.end);
    const outcomes = outcomesInRange(null, sid, period.start, period.end);
    box.innerHTML = `<div class="field hint" style="text-transform:none;font-size:.82rem;background:#fdfcfa;border:1px solid var(--border);border-radius:11px;padding:12px 14px">
      ${esc(period.label)} tarixli məlumat: ${sessions.length} seans, ${outcomes.length} yazılmış həftəlik nəticə.
      ${!sessions.length ? '<br><span style="color:var(--danger)">Bu dövr üçün heç bir seans tapılmadı.</span>' : ''}
    </div>`;
  }
}

window.generateReport = async function(type){
  const btn = document.getElementById('repGenBtn');
  const resultBox = document.getElementById('reportGenResult');
  const period = getSelectedPeriod();
  let payload = null, meta = null;

  if(type === 'parent'){
    const pid = document.getElementById('repPatient').value;
    if(!pid){ toast('Pasient seçin'); return; }
    const p = window.DB.patients[pid] || {};
    const staffId = p.primaryStaffId;
    const st = window.DB.staff[staffId] || {};
    const sessions = sessionsInRange(pid, null, period.start, period.end);
    const outcomes = outcomesInRange(pid, staffId, period.start, period.end);
    if(!sessions.length && !outcomes.length){ toast('Bu dövr üçün məlumat yoxdur'); return; }
    payload = {
      type:'parent',
      patient: { name:p.name, age:p.age, gender:p.gender },
      staffName: st.name || '',
      periodType: period.type, periodLabel: period.label, periodStart: period.start, periodEnd: period.end,
      outcomes: outcomes.map(o=>({ weekStart:o.weekStart, weekEnd:o.weekEnd, summary:o.summary, progress:o.progress, challenges:o.challenges, nextSteps:o.nextSteps })),
      sessions: sessions.map(s=>({ date:s.date, type:s.type, status:s.status, notes:s.notes }))
    };
    meta = { reportType:'parent', patientId: pid, staffId: staffId||null, periodType: period.type, periodStart: period.start, periodEnd: period.end, periodLabel: period.label };
  } else {
    const sid = document.getElementById('repStaff').value;
    if(!sid){ toast('Mütəxəssis seçin'); return; }
    const st = window.DB.staff[sid] || {};
    const sessions = sessionsInRange(null, sid, period.start, period.end);
    if(!sessions.length){ toast('Bu dövr üçün seans yoxdur'); return; }
    const outcomes = outcomesInRange(null, sid, period.start, period.end);
    payload = {
      type:'staff',
      staffName: st.name || '',
      periodType: period.type, periodLabel: period.label, periodStart: period.start, periodEnd: period.end,
      sessions: sessions.map(s=>({ patientName: window.DB.patients[s.patientId]?.name || 'Naməlum', date:s.date, sessionType:s.type, status:s.status, notes:s.notes })),
      outcomesWritten: outcomes.map(o=>({ patientName: window.DB.patients[o.patientId]?.name || 'Naməlum', weekStart:o.weekStart, summary:o.summary, progress:o.progress, challenges:o.challenges, nextSteps:o.nextSteps }))
    };
    meta = { reportType:'staff', staffId: sid, periodType: period.type, periodStart: period.start, periodEnd: period.end, periodLabel: period.label };
  }

  btn.disabled = true; btn.textContent = 'Hazırlanır...';
  resultBox.innerHTML = `<div class="ai-loading"><div class="ai-spin"></div><div>AI ${esc(period.label)} məlumatlarını analiz edir...</div></div>`;

  try{
    const res = await fetch('/api/generate-report', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data.content){ throw new Error(data.error || ('Server xətası (' + res.status + ')')); }

    const reportVal = {
      ...meta, content: data.content, model: data.model || 'groq',
      createdAt: Date.now(), createdBy: window.currentUser.name
    };
    window.__fbAddReport(reportVal);
    resultBox.innerHTML = '';
    toast('Arayış hazırlandı ✓');
    openReportView(reportVal, meta.reportType==='parent' ? (window.DB.patients[meta.patientId]?.name||'') : (window.DB.staff[meta.staffId]?.name||''));
  } catch(err){
    console.error('AI arayış xətası:', err);
    resultBox.innerHTML = `<div class="field hint" style="color:var(--danger);text-transform:none;font-size:.85rem">Arayış hazırlana bilmədi: ${esc(err.message)}</div>`;
    toast('⚠️ Arayış hazırlana bilmədi');
  } finally {
    btn.disabled = false;
    btn.textContent = type==='parent' ? '✨ AI ilə arayış hazırla' : '✨ AI ilə qiymətləndirmə hazırla';
  }
}

/* ============ REPORT HISTORY / VIEW ============ */
function reportPeriodLabel(r){
  if(r.periodLabel) return r.periodLabel;
  if(r.weekStart) return `Həftəlik (${fmtDateRange(r.weekStart, r.weekEnd||r.weekStart)})`;
  return '';
}
window.renderReportsList = function(){
  const list = document.getElementById('reportsList');
  if(!list) return;
  const staffFilter = myStaffId();
  let entries = Object.entries(window.DB.reports||{}).filter(([id,r]) => r.reportType === window.__reportTab);
  if(staffFilter){
    entries = entries.filter(([id,r]) => {
      if(r.reportType==='staff') return r.staffId===staffFilter;
      const p = window.DB.patients[r.patientId];
      return p && p.primaryStaffId===staffFilter;
    });
  }
  entries = entries.sort((a,b)=> (b[1].createdAt||0)-(a[1].createdAt||0));
  if(!entries.length){ list.innerHTML = `<div class="empty"><div class="ic">✨</div><p>Hələ bu kateqoriyada AI arayışı yoxdur.</p></div>`; return; }
  list.innerHTML = entries.map(([id,r],i)=>{
    const subjectName = r.reportType==='parent' ? (window.DB.patients[r.patientId]?.name||'Silinmiş pasient') : (window.DB.staff[r.staffId]?.name||'Silinmiş mütəxəssis');
    return `<div class="item-card" style="animation-delay:${i*0.03}s" onclick="openReportView('${id}')">
      <div class="avatar">${esc(initials(subjectName))}</div>
      <div class="item-main"><div class="t">${esc(subjectName)}</div><div class="s">${esc(reportPeriodLabel(r))} · ${new Date(r.createdAt).toLocaleDateString('az-AZ')}</div></div>
      <span class="ai-badge">✨ AI</span>
      ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteReportEntry('${id}')">Sil</button>` : ''}
    </div>`;
  }).join('');
}
window.deleteReportEntry = function(id){
  if(!isAdmin()){ toast('⛔ Yalnız admin silə bilər'); return; }
  if(!confirm('Bu AI arayışını silmək istəyirsiniz?')) return;
  window.__fbRemoveReport(id);
  toast('Silindi');
}

window.__currentReportForView = null;
window.openReportView = function(reportOrId, subjectNameArg){
  const report = typeof reportOrId === 'string' ? window.DB.reports[reportOrId] : reportOrId;
  if(!report){ toast('Arayış tapılmadı'); return; }
  const subjectName = subjectNameArg || (report.reportType==='parent' ? (window.DB.patients[report.patientId]?.name||'Silinmiş pasient') : (window.DB.staff[report.staffId]?.name||'Silinmiş mütəxəssis'));
  window.__currentReportForView = report;
  const title = report.reportType==='parent' ? 'Valideyn arayışı' : 'Mütəxəssis iş qiymətləndirməsi';
  const body = document.getElementById('reportViewBody');
  body.innerHTML = `
    <div class="print-letterhead">AN Psixoloji Dəstək və Reabilitasiya Mərkəzi</div>
    <div class="ai-report-head">
      <div>
        <h4>${esc(title)} — ${esc(subjectName)}</h4>
        <div class="meta">${esc(reportPeriodLabel(report))} · Hazırlandı: ${new Date(report.createdAt).toLocaleString('az-AZ')} · ${esc(report.createdBy||'')}</div>
      </div>
      <span class="ai-badge">✨ AI köməkliyi ilə hazırlanıb</span>
    </div>
    <div class="ai-report">${esc(report.content)}</div>
    <p class="field hint" style="margin-top:1rem">Bu mətn AI köməkliyi ilə hazırlanıb və mütəxəssis tərəfindən paylaşılmazdan əvvəl nəzərdən keçirilməlidir.</p>
    <div class="print-signature">Direktor: Nahidə Axundova</div>`;
  openModal('modalReportView');
}
window.copyReportContent = function(){
  if(!window.__currentReportForView) return;
  navigator.clipboard.writeText(window.__currentReportForView.content).then(()=>toast('Kopyalandı ✓')).catch(()=>toast('Kopyalama alınmadı'));
}
