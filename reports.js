/* ============ AI ARAYIŞLAR ============ */
window.__reportTab = 'parent';

window.setReportTab = function(tab){
  window.__reportTab = tab;
  document.querySelectorAll('#view-reports .tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.rt===tab));
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

window.renderReportGenPanel = function(){
  const panel = document.getElementById('reportGenPanel');
  if(!panel) return;
  const ws = currentWeekStart();
  if(window.__reportTab === 'parent'){
    panel.innerHTML = `
      <div class="panel-head"><h3>Valideynə təqdim ediləcək arayış</h3></div>
      <div class="grid2">
        <div class="field"><label>Pasient *</label><select id="repPatient" onchange="renderReportPreview()">${patientSelectOptionsForReports()}</select></div>
        <div class="field"><label>Həftənin başlanğıcı *</label><input id="repWeekStart" type="date" value="${ws}" onchange="renderReportPreview()"></div>
      </div>
      <div id="reportPreviewBox"></div>
      <div class="modal-actions" style="justify-content:flex-start;margin-top:1rem">
        <button class="btn btn-lav" id="repGenBtn" onclick="generateReport('parent')">✨ AI ilə arayış hazırla</button>
      </div>
      <div id="reportGenResult"></div>`;
  } else {
    const lockedToSelf = !isAdmin() && myStaffId();
    panel.innerHTML = `
      <div class="panel-head"><h3>Mütəxəssisin iş nəticəsi hesabatı</h3></div>
      <div class="grid2">
        <div class="field"><label>Mütəxəssis *</label><select id="repStaff" ${lockedToSelf?'disabled':''} onchange="renderReportPreview()">${staffSelectOptionsForReports()}</select></div>
        <div class="field"><label>Həftənin başlanğıcı *</label><input id="repWeekStart" type="date" value="${ws}" onchange="renderReportPreview()"></div>
      </div>
      <div id="reportPreviewBox"></div>
      <div class="modal-actions" style="justify-content:flex-start;margin-top:1rem">
        <button class="btn btn-lav" id="repGenBtn" onclick="generateReport('staff')">✨ AI ilə hesabat hazırla</button>
      </div>
      <div id="reportGenResult"></div>`;
    if(lockedToSelf) document.getElementById('repStaff').value = myStaffId();
  }
  renderReportPreview();
}

function weekSessionsFor(patientId, staffId, weekStart){
  const we = sundayOf(weekStart);
  return Object.entries(window.DB.sessions||{})
    .filter(([id,s]) => s.date>=weekStart && s.date<=we && (!patientId || s.patientId===patientId) && (!staffId || s.staffId===staffId))
    .map(([id,s])=>s)
    .sort((a,b)=>a.date.localeCompare(b.date));
}
function outcomeFor(patientId, staffId, weekStart){
  return Object.values(window.DB.outcomes||{}).find(o => o.patientId===patientId && o.staffId===staffId && o.weekStart===weekStart) || null;
}

window.renderReportPreview = function(){
  const box = document.getElementById('reportPreviewBox');
  if(!box) return;
  const weekStart = mondayOf(document.getElementById('repWeekStart').value || currentWeekStart());
  if(window.__reportTab === 'parent'){
    const pid = document.getElementById('repPatient').value;
    if(!pid){ box.innerHTML=''; return; }
    const p = window.DB.patients[pid] || {};
    const staffId = p.primaryStaffId;
    const sessions = weekSessionsFor(pid, null, weekStart);
    const outcome = outcomeFor(pid, staffId, weekStart);
    box.innerHTML = `<div class="field hint" style="text-transform:none;font-size:.82rem;background:#fdfcfa;border:1px solid var(--border);border-radius:11px;padding:12px 14px">
      <b>${esc(p.name)}</b> üçün ${fmtWeekRange(weekStart)} tarixli məlumat: ${sessions.length} seans qeydə alınıb${outcome? ', həftəlik nəticə yazılıb.' : ', həftəlik nəticə hələ yazılmayıb.'}
      ${!sessions.length && !outcome ? '<br><span style="color:var(--danger)">Bu həftə üçün heç bir seans və ya nəticə tapılmadı — əvvəlcə seans/nəticə qeyd edin.</span>' : ''}
    </div>`;
  } else {
    const sid = document.getElementById('repStaff').value;
    if(!sid){ box.innerHTML=''; return; }
    const sessions = weekSessionsFor(null, sid, weekStart);
    const outcomes = Object.values(window.DB.outcomes||{}).filter(o=>o.staffId===sid && o.weekStart===weekStart);
    box.innerHTML = `<div class="field hint" style="text-transform:none;font-size:.82rem;background:#fdfcfa;border:1px solid var(--border);border-radius:11px;padding:12px 14px">
      ${fmtWeekRange(weekStart)} tarixli məlumat: ${sessions.length} seans, ${outcomes.length} yazılmış həftəlik nəticə.
      ${!sessions.length ? '<br><span style="color:var(--danger)">Bu həftə üçün heç bir seans tapılmadı.</span>' : ''}
    </div>`;
  }
}

window.generateReport = async function(type){
  const btn = document.getElementById('repGenBtn');
  const resultBox = document.getElementById('reportGenResult');
  const weekStart = mondayOf(document.getElementById('repWeekStart').value || currentWeekStart());
  const weekEnd = sundayOf(weekStart);
  let payload = null, meta = null;

  if(type === 'parent'){
    const pid = document.getElementById('repPatient').value;
    if(!pid){ toast('Pasient seçin'); return; }
    const p = window.DB.patients[pid] || {};
    const staffId = p.primaryStaffId;
    const st = window.DB.staff[staffId] || {};
    const sessions = weekSessionsFor(pid, null, weekStart);
    const outcome = outcomeFor(pid, staffId, weekStart);
    if(!sessions.length && !outcome){ toast('Bu həftə üçün məlumat yoxdur'); return; }
    payload = {
      type:'parent',
      patient: { name:p.name, age:p.age, gender:p.gender },
      staffName: st.name || '',
      weekStart, weekEnd,
      outcome: outcome ? { summary:outcome.summary, progress:outcome.progress, challenges:outcome.challenges, nextSteps:outcome.nextSteps } : null,
      sessions: sessions.map(s=>({ date:s.date, type:s.type, status:s.status, notes:s.notes }))
    };
    meta = { reportType:'parent', patientId: pid, staffId: staffId||null, weekStart, weekEnd };
  } else {
    const sid = document.getElementById('repStaff').value;
    if(!sid){ toast('Mütəxəssis seçin'); return; }
    const st = window.DB.staff[sid] || {};
    const sessions = weekSessionsFor(null, sid, weekStart);
    if(!sessions.length){ toast('Bu həftə üçün seans yoxdur'); return; }
    const outcomes = Object.values(window.DB.outcomes||{}).filter(o=>o.staffId===sid && o.weekStart===weekStart);
    payload = {
      type:'staff',
      staffName: st.name || '',
      weekStart, weekEnd,
      sessions: sessions.map(s=>({ patientName: window.DB.patients[s.patientId]?.name || 'Naməlum', date:s.date, sessionType:s.type, status:s.status, notes:s.notes })),
      outcomesWritten: outcomes.map(o=>({ patientName: window.DB.patients[o.patientId]?.name || 'Naməlum', summary:o.summary, progress:o.progress, challenges:o.challenges, nextSteps:o.nextSteps }))
    };
    meta = { reportType:'staff', staffId: sid, weekStart, weekEnd };
  }

  btn.disabled = true; btn.textContent = 'Hazırlanır...';
  resultBox.innerHTML = `<div class="ai-loading"><div class="ai-spin"></div><div>AI həftəlik məlumatları analiz edir...</div></div>`;

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
    btn.textContent = type==='parent' ? '✨ AI ilə arayış hazırla' : '✨ AI ilə hesabat hazırla';
  }
}

/* ============ REPORT HISTORY / VIEW ============ */
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
      <div class="item-main"><div class="t">${esc(subjectName)}</div><div class="s">Həftə: ${fmtWeekRange(r.weekStart)} · ${new Date(r.createdAt).toLocaleDateString('az-AZ')}</div></div>
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
  const title = report.reportType==='parent' ? 'Valideyn arayışı' : 'Mütəxəssis iş nəticəsi hesabatı';
  const body = document.getElementById('reportViewBody');
  body.innerHTML = `
    <div class="ai-report-head">
      <div>
        <h4>${esc(title)} — ${esc(subjectName)}</h4>
        <div class="meta">Həftə: ${fmtWeekRange(report.weekStart)} · Hazırlandı: ${new Date(report.createdAt).toLocaleString('az-AZ')} · ${esc(report.createdBy||'')}</div>
      </div>
      <span class="ai-badge">✨ AI köməkliyi ilə hazırlanıb</span>
    </div>
    <div class="ai-report">${esc(report.content)}</div>
    <p class="field hint" style="margin-top:1rem">Bu mətn AI köməkliyi ilə hazırlanıb və mütəxəssis tərəfindən paylaşılmazdan əvvəl nəzərdən keçirilməlidir.</p>`;
  openModal('modalReportView');
}
window.copyReportContent = function(){
  if(!window.__currentReportForView) return;
  navigator.clipboard.writeText(window.__currentReportForView.content).then(()=>toast('Kopyalandı ✓')).catch(()=>toast('Kopyalama alınmadı'));
}
