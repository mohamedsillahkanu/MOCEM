/* ============================================================
   MOCM/OTSS+ Hospital Checklist — script.js
   ICF-SL | NMCP Sierra Leone
   ============================================================ */

'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const TOTAL_SECTIONS = 10;
const STORAGE_KEY_DRAFTS     = 'mocm_drafts';
const STORAGE_KEY_SUBMITTED  = 'mocm_submitted';

// ============================================================
// STATE
// ============================================================
let currentSection = 1;
let pendingDraftName = '';

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initYNGroups();
    initConditionals();
    updateProgress();
    updateStatusBar();
    setDefaultDate();
    document.getElementById('dataForm').addEventListener('submit', handleSubmit);
    document.querySelector('[name="q4a_waste"]') &&
        document.querySelectorAll('[name="q4a_waste"]').forEach(r =>
            r.addEventListener('change', checkWasteOther));
});

// ============================================================
// YES/NO TOGGLE GROUPS
// All .yn-group divs get rendered as Yes/No button pairs
// .yn-group-3 with data-options gets a 3-option set
// ============================================================
function initYNGroups() {
    // Standard Yes/No
    document.querySelectorAll('.yn-group').forEach(el => {
        const name = el.dataset.name;
        if (!name) return;
        el.innerHTML = '';
        el.classList.add('yn-btn-group');
        el.appendChild(makeYNBtn('Yes', 'yes', name));
        el.appendChild(makeYNBtn('No', 'no', name));
        el.appendChild(makeHiddenInput(name));
    });

    // Small Yes/No
    document.querySelectorAll('.yn-group.sm, .yn-group.sm').forEach(el => {
        el.querySelectorAll('.yn-btn').forEach(b => b.classList.add('sm'));
    });

    // 3-option groups
    document.querySelectorAll('.yn-group-3').forEach(el => {
        const name = el.dataset.name;
        const options = (el.dataset.options || 'Yes,No,Not Applicable').split(',');
        if (!name) return;
        el.innerHTML = '';
        el.classList.add('yn-btn-group');
        options.forEach((opt, i) => {
            const cssClass = i === 0 ? 'yes' : i === 1 ? 'no' : 'na';
            el.appendChild(makeYNBtn(opt, cssClass, name));
        });
        el.appendChild(makeHiddenInput(name));
        if (el.classList.contains('sm')) {
            el.querySelectorAll('.yn-btn').forEach(b => b.classList.add('sm'));
        }
    });
}

function makeYNBtn(label, cssClass, name) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = `yn-btn ${cssClass}`;
    btn.addEventListener('click', () => toggleYN(btn, name, label));
    return btn;
}

function makeHiddenInput(name) {
    const inp = document.createElement('input');
    inp.type = 'hidden';
    inp.name = name;
    inp.id = 'yn_' + name;
    return inp;
}

function toggleYN(clickedBtn, name, value) {
    const group = clickedBtn.closest('.yn-btn-group');
    group.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
    const hidden = group.querySelector(`input[type="hidden"]`);
    if (hidden) hidden.value = value;
}

// ============================================================
// CONDITIONALS
// ============================================================
function initConditionals() {
    // Waste disposal "Other"
    document.querySelectorAll('[name="q4a_waste"]').forEach(r =>
        r.addEventListener('change', checkWasteOther));
}

function checkWasteOther() {
    const val = document.querySelector('[name="q4a_waste"]:checked')?.value;
    const otherGroup = document.getElementById('q4a_other_group');
    if (otherGroup) {
        otherGroup.style.display = val === 'Other' ? 'block' : 'none';
    }
}

// ============================================================
// HCW VALIDATION
// ============================================================
function validateHCW() {
    const total = parseInt(document.getElementById('total_hcw')?.value) || 0;
    const male  = parseInt(document.getElementById('male_hcw')?.value)  || 0;
    const female= parseInt(document.getElementById('female_hcw')?.value)|| 0;
    const errEl = document.getElementById('error_hcw_split');
    if (!errEl) return;
    if (total > 0 && (male + female) !== total) {
        errEl.style.display = 'block';
    } else {
        errEl.style.display = 'none';
    }
}

// ============================================================
// SECTION NAVIGATION
// ============================================================
function nextSection() {
    if (currentSection < TOTAL_SECTIONS) {
        showSection(currentSection + 1);
    }
}

function previousSection() {
    if (currentSection > 1) {
        showSection(currentSection - 1);
    }
}

function showSection(n) {
    document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
    const target = document.querySelector(`.form-section[data-section="${n}"]`);
    if (target) {
        target.classList.add('active');
        currentSection = n;
        updateProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function updateProgress() {
    const pct = Math.round((currentSection / TOTAL_SECTIONS) * 100);
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = `SECTION ${currentSection} OF ${TOTAL_SECTIONS}`;
}

// ============================================================
// DEFAULT DATE
// ============================================================
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    ['visit_date', 'survey_date'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });
}

// ============================================================
// STATUS BAR
// ============================================================
function updateStatusBar() {
    const drafts    = getDrafts();
    const submitted = getSubmitted();
    const draftCountEl = document.getElementById('draftCount');
    const subCountEl   = document.getElementById('submittedCount');
    if (draftCountEl) draftCountEl.textContent = drafts.length;
    if (subCountEl)   subCountEl.textContent   = submitted.length;

    const indicator = document.getElementById('statusIndicator');
    const statusText= document.getElementById('statusText');
    if (navigator.onLine) {
        indicator?.classList.remove('offline');
        if (statusText) statusText.textContent = 'ONLINE';
    } else {
        indicator?.classList.add('offline');
        if (statusText) statusText.textContent = 'OFFLINE';
    }
}

window.addEventListener('online',  updateStatusBar);
window.addEventListener('offline', updateStatusBar);

// ============================================================
// COLLECT FORM DATA
// ============================================================
function collectFormData() {
    const form = document.getElementById('dataForm');
    const data = {};

    // Standard inputs
    new FormData(form).forEach((val, key) => {
        if (data[key]) {
            if (!Array.isArray(data[key])) data[key] = [data[key]];
            data[key].push(val);
        } else {
            data[key] = val;
        }
    });

    // Checkboxes (ensure unchecked are recorded)
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (!cb.checked && !data[cb.name]) data[cb.name + '_checked'] = 'No';
    });

    data._timestamp = new Date().toISOString();
    data._section   = currentSection;
    return data;
}

// ============================================================
// DRAFT MANAGEMENT
// ============================================================
function getDrafts() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_DRAFTS) || '[]'); }
    catch { return []; }
}
function saveDrafts(drafts) {
    localStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(drafts));
}

function showDraftNameModal() {
    // Auto-generate name from hospital + district
    const hospital  = document.getElementById('hospital_name')?.value?.trim();
    const district  = document.getElementById('district')?.value?.trim();
    const visitDate = document.getElementById('visit_date')?.value || '';
    let name = 'Draft';
    if (hospital && district) name = `${hospital} | ${district}`;
    else if (hospital) name = hospital;
    else if (district) name = district;
    if (visitDate) name += ` | ${visitDate}`;

    const inp = document.getElementById('draftNameInput');
    if (inp) inp.value = name;
    pendingDraftName = name;
    openModal('draftNameModal');
}

function cancelDraftName() { closeModal('draftNameModal'); }

function confirmSaveDraft() {
    const inp = document.getElementById('draftNameInput');
    const name = inp?.value?.trim() || pendingDraftName || 'Draft ' + Date.now();
    saveDraft(name);
    closeModal('draftNameModal');
}

function saveDraft(name) {
    const data    = collectFormData();
    data._draftName = name;
    data._savedAt   = new Date().toLocaleString();
    data.form_status = 'draft';

    const draftId = document.getElementById('draft_id')?.value || 'draft_' + Date.now();
    data._id = draftId;
    if (document.getElementById('draft_id')) document.getElementById('draft_id').value = draftId;

    const drafts = getDrafts();
    const existing = drafts.findIndex(d => d._id === draftId);
    if (existing >= 0) drafts[existing] = data;
    else drafts.push(data);

    saveDrafts(drafts);
    updateStatusBar();
    showNotification('Draft saved: ' + name, 'success');
}

function openDraftsModal() {
    const body = document.getElementById('draftsModalBody');
    const drafts = getDrafts();
    if (!drafts.length) {
        body.innerHTML = '<div class="no-drafts">No saved drafts found.</div>';
    } else {
        body.innerHTML = drafts.map(d => `
            <div class="draft-item">
                <div>
                    <div class="draft-name">${escHtml(d._draftName || 'Unnamed Draft')}</div>
                    <div class="draft-meta">Saved: ${escHtml(d._savedAt || '')} &nbsp;|&nbsp; Section: ${d._section || 1}</div>
                </div>
                <div class="draft-actions">
                    <button class="draft-btn-action load" onclick="loadDraft('${d._id}')">LOAD</button>
                    <button class="draft-btn-action del" onclick="deleteDraft('${d._id}')">DELETE</button>
                </div>
            </div>
        `).join('');
    }
    openModal('draftsModal');
}

function loadDraft(id) {
    const drafts = getDrafts();
    const draft  = drafts.find(d => d._id === id);
    if (!draft) return;

    const form = document.getElementById('dataForm');

    // Restore all plain inputs
    Object.entries(draft).forEach(([key, val]) => {
        if (key.startsWith('_')) return;
        const el = form.querySelector(`[name="${key}"]`);
        if (!el) return;
        if (el.type === 'hidden') { el.value = val; return; }
        if (el.type === 'radio') {
            form.querySelectorAll(`[name="${key}"]`).forEach(r => {
                r.checked = r.value === val;
            });
            return;
        }
        if (el.type === 'checkbox') { el.checked = !!val; return; }
        el.value = val;
    });

    // Restore YN groups
    form.querySelectorAll('.yn-btn-group').forEach(group => {
        const hidden = group.querySelector('input[type="hidden"]');
        if (!hidden || !draft[hidden.name]) return;
        const storedVal = draft[hidden.name];
        group.querySelectorAll('.yn-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.trim() === storedVal);
        });
    });

    // Restore checkboxes
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (draft[cb.name] !== undefined) {
            cb.checked = Array.isArray(draft[cb.name])
                ? draft[cb.name].includes(cb.value)
                : draft[cb.name] === cb.value;
        }
    });

    if (document.getElementById('draft_id')) document.getElementById('draft_id').value = id;
    const section = draft._section || 1;
    closeModal('draftsModal');
    showSection(Math.min(section, TOTAL_SECTIONS));
    checkWasteOther();
    showNotification('Draft loaded successfully', 'success');
}

function deleteDraft(id) {
    const drafts = getDrafts().filter(d => d._id !== id);
    saveDrafts(drafts);
    updateStatusBar();
    openDraftsModal(); // refresh
    showNotification('Draft deleted', '');
}
function closeDraftsModal() { closeModal('draftsModal'); }

// ============================================================
// SUBMITTED RECORDS
// ============================================================
function getSubmitted() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SUBMITTED) || '[]'); }
    catch { return []; }
}
function saveSubmitted(records) {
    localStorage.setItem(STORAGE_KEY_SUBMITTED, JSON.stringify(records));
}

function viewData() {
    const records = getSubmitted();
    const body = document.getElementById('dataModalBody');
    if (!records.length) {
        body.innerHTML = '<div class="no-drafts">No submitted records found.</div>';
        openModal('dataModal');
        return;
    }
    // Show key fields in a table
    const cols = ['hospital_name', 'district', 'region', 'visit_date', 'q15b_rating', '_savedAt'];
    const headers = ['Hospital', 'District', 'Region', 'Visit Date', 'Rating', 'Submitted At'];
    body.innerHTML = `
        <div class="data-table-wrap">
        <table class="data-table">
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}<th>ACTION</th></tr></thead>
            <tbody>
                ${records.map((r, i) => `<tr>${cols.map(c => `<td>${escHtml(r[c] || '')}</td>`).join('')}
                <td><button class="draft-btn-action load" onclick="exportSingleRecord(${i})">EXPORT</button></td>
                </tr>`).join('')}
            </tbody>
        </table>
        </div>`;
    openModal('dataModal');
}
function closeDataModal() { closeModal('dataModal'); }

function exportSingleRecord(idx) {
    const records = getSubmitted();
    const rec = records[idx];
    if (!rec) return;
    downloadJSON([rec], `MOCM_Record_${rec.hospital_name || idx}_${rec.visit_date || ''}.json`);
}

// ============================================================
// FINALIZE & SUBMIT
// ============================================================
function finalizeForm() {
    const requiredFields = ['hospital_name', 'district', 'region', 'visit_date', 'facility_incharge'];
    let valid = true;
    requiredFields.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value.trim()) {
            valid = false;
            el.classList.add('error');
        } else if (el) {
            el.classList.remove('error');
        }
    });
    if (!valid) {
        showNotification('Please fill in required fields in Form A before finalizing', 'error');
        showSection(2);
        return;
    }
    document.getElementById('form_status').value = 'finalized';
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.disabled = false;
    showNotification('Form finalized. Click SUBMIT to save permanently.', 'success');
}

function handleSubmit(e) {
    e.preventDefault();
    const data = collectFormData();
    data.form_status = 'submitted';
    data._savedAt    = new Date().toLocaleString();
    data._id         = 'rec_' + Date.now();

    const records = getSubmitted();
    records.push(data);
    saveSubmitted(records);

    // Remove from drafts
    const draftId = document.getElementById('draft_id')?.value;
    if (draftId) {
        saveDrafts(getDrafts().filter(d => d._id !== draftId));
    }

    updateStatusBar();
    showNotification('Record submitted successfully!', 'success');
    setTimeout(() => {
        if (confirm('Record saved! Would you like to download a copy?')) {
            downloadJSON([data], `MOCM_${data.hospital_name || 'Record'}_${data.visit_date || ''}.json`);
        }
        newForm();
    }, 800);
}

// ============================================================
// NEW FORM
// ============================================================
function newForm() {
    if (!confirm('Start a new checklist? Unsaved data will be lost.')) return;
    document.getElementById('dataForm').reset();
    document.getElementById('draft_id').value = '';
    document.getElementById('form_status').value = 'draft';
    // Clear all YN buttons
    document.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.yn-btn-group input[type="hidden"]').forEach(h => h.value = '');
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.disabled = true;
    setDefaultDate();
    showSection(1);
    showNotification('New checklist started', '');
}

// ============================================================
// DOWNLOAD CSV
// ============================================================
function downloadData() {
    const records = getSubmitted();
    if (!records.length) { showNotification('No submitted records to download', 'error'); return; }
    downloadCSV(records);
}

function downloadCSV(records) {
    if (!records.length) return;
    const allKeys = Array.from(new Set(records.flatMap(r => Object.keys(r))))
        .filter(k => !k.startsWith('_'));
    const rows = [allKeys.join(',')];
    records.forEach(r => {
        rows.push(allKeys.map(k => {
            const v = r[k] ?? '';
            const s = Array.isArray(v) ? v.join('; ') : String(v);
            return '"' + s.replace(/"/g, '""') + '"';
        }).join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `MOCM_Records_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('CSV download started', 'success');
}

function downloadJSON(records, filename) {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename || 'MOCM_Export.json';
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// Close modal on overlay click
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
    }
});

// ============================================================
// NOTIFICATION TOAST
// ============================================================
function showNotification(msg, type) {
    const el  = document.getElementById('notification');
    const txt = document.getElementById('notificationText');
    if (!el || !txt) return;
    txt.textContent = msg;
    el.className = 'notification show ' + (type || '');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.className = 'notification'; }, 2800);
}

// ============================================================
// UTILITY
// ============================================================
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
