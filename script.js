/* ============================================================
   MOCM/OTSS+ Hospital Checklist — script.js
   ICF-SL | NMCP Sierra Leone
   Features: CSV cascade, full validation, skip logic, drafts
   ============================================================ */
'use strict';

// ============================================================
// CONSTANTS & STATE
// ============================================================
const TOTAL_SECTIONS     = 10;
const STORAGE_DRAFTS     = 'mocm_drafts_v2';
const STORAGE_SUBMITTED  = 'mocm_submitted_v2';
const CSV_FILE           = 'facilities.csv';

let currentSection = 1;
let facilityData   = [];   // Raw rows from CSV
let cascadeIndex   = {};   // {region: {district: {chiefdom: [{name, type}]}}}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initYNGroups();
    initSkipLogic();
    loadFacilitiesCSV();
    updateProgress();
    updateStatusBar();
    setDefaultDate();
    document.getElementById('dataForm').addEventListener('submit', handleSubmit);
    window.addEventListener('online',  updateStatusBar);
    window.addEventListener('offline', updateStatusBar);
    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(m =>
        m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));
});

// ============================================================
// CSV LOADING & CASCADE
// ============================================================
function loadFacilitiesCSV() {
    const countEl = document.getElementById('csvCount');
    if (countEl) countEl.textContent = 'Loading...';

    Papa.parse(CSV_FILE, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            facilityData = results.data.filter(r => r.Region && r.District && r.Chiefdom && r.Hospital_Name);
            buildCascadeIndex();
            populateRegions();
            if (countEl) countEl.textContent = facilityData.length + ' facilities';
        },
        error: () => {
            if (countEl) countEl.textContent = 'CSV not found';
            // Fallback: enable manual text entry
            enableManualEntry();
        }
    });
}

function buildCascadeIndex() {
    cascadeIndex = {};
    facilityData.forEach(row => {
        const r = row.Region.trim();
        const d = row.District.trim();
        const c = row.Chiefdom.trim();
        const h = row.Hospital_Name.trim();
        const t = row.Hospital_Type.trim();
        if (!cascadeIndex[r]) cascadeIndex[r] = {};
        if (!cascadeIndex[r][d]) cascadeIndex[r][d] = {};
        if (!cascadeIndex[r][d][c]) cascadeIndex[r][d][c] = [];
        cascadeIndex[r][d][c].push({ name: h, type: t });
    });
}

function populateRegions() {
    const sel = document.getElementById('region');
    if (!sel) return;
    const regions = Object.keys(cascadeIndex).sort();
    regions.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r; opt.textContent = r;
        sel.appendChild(opt);
    });
    updateCascadeCount('count_region', regions.length, 'region');
    sel.addEventListener('change', onRegionChange);
}

function onRegionChange() {
    const region = this.value;
    clearCascadeBelow('district');
    clearFieldError('region');

    const districtSel = document.getElementById('district');
    districtSel.disabled = !region;
    districtSel.innerHTML = '<option value="">Select District...</option>';

    if (!region) { updateCascadeCount('count_district', 0); return; }
    const districts = Object.keys(cascadeIndex[region] || {}).sort();
    districts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d;
        districtSel.appendChild(opt);
    });
    updateCascadeCount('count_district', districts.length, 'district');
    districtSel.addEventListener('change', onDistrictChange);
}

function onDistrictChange() {
    const region   = document.getElementById('region').value;
    const district = this.value;
    clearCascadeBelow('chiefdom');
    clearFieldError('district');

    const chiefdomSel = document.getElementById('chiefdom');
    chiefdomSel.disabled = !district;
    chiefdomSel.innerHTML = '<option value="">Select Chiefdom...</option>';

    if (!district) { updateCascadeCount('count_chiefdom', 0); return; }
    const chiefdoms = Object.keys((cascadeIndex[region] || {})[district] || {}).sort();
    chiefdoms.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        chiefdomSel.appendChild(opt);
    });
    updateCascadeCount('count_chiefdom', chiefdoms.length, 'chiefdom');
    chiefdomSel.addEventListener('change', onChiefdomChange);
}

function onChiefdomChange() {
    const region   = document.getElementById('region').value;
    const district = document.getElementById('district').value;
    const chiefdom = this.value;
    clearFieldError('chiefdom');

    const hospSel = document.getElementById('hospital_name');
    hospSel.disabled = !chiefdom;
    hospSel.innerHTML = '<option value="">Select Hospital...</option>';

    const typeDisplay = document.getElementById('hospital_type_display');
    const typeHidden  = document.getElementById('hospital_type');
    if (typeDisplay) { typeDisplay.textContent = 'Select hospital above to auto-fill type'; typeDisplay.classList.remove('filled'); }
    if (typeHidden)  typeHidden.value = '';

    if (!chiefdom) { updateCascadeCount('count_hospital', 0); return; }
    const hospitals = ((cascadeIndex[region] || {})[district] || {})[chiefdom] || [];
    hospitals.sort((a,b) => a.name.localeCompare(b.name)).forEach(h => {
        const opt = document.createElement('option');
        opt.value = h.name; opt.dataset.type = h.type; opt.textContent = h.name;
        hospSel.appendChild(opt);
    });
    updateCascadeCount('count_hospital', hospitals.length, 'hospital');
    hospSel.addEventListener('change', onHospitalChange);
}

function onHospitalChange() {
    clearFieldError('hospital_name');
    const opt = this.options[this.selectedIndex];
    const type = opt?.dataset?.type || '';
    const typeDisplay = document.getElementById('hospital_type_display');
    const typeHidden  = document.getElementById('hospital_type');
    if (typeDisplay) {
        typeDisplay.textContent = type || 'Unknown';
        typeDisplay.classList.toggle('filled', !!type);
    }
    if (typeHidden) typeHidden.value = type;
}

function clearCascadeBelow(startId) {
    const order = ['district', 'chiefdom', 'hospital_name'];
    const start = order.indexOf(startId);
    order.slice(start).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<option value="">Select ${id.charAt(0).toUpperCase() + id.slice(1).replace('_', ' ')}...</option>`;
        el.disabled = true;
        updateCascadeCount('count_' + id, 0);
    });
    const typeDisplay = document.getElementById('hospital_type_display');
    const typeHidden  = document.getElementById('hospital_type');
    if (typeDisplay) { typeDisplay.textContent = 'Select hospital above to auto-fill type'; typeDisplay.classList.remove('filled'); }
    if (typeHidden)  typeHidden.value = '';
}

function updateCascadeCount(elId, count, label) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (count > 0) {
        el.innerHTML = `<span class="count-badge">${count}</span> ${label ? label + (count === 1 ? '' : 's') + ' available' : 'options'}`;
    } else {
        el.textContent = '';
    }
}

function enableManualEntry() {
    // If CSV fails, convert selects to text inputs
    ['region','district','chiefdom','hospital_name'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'form-input';
        input.name = sel.name; input.id = sel.id;
        input.placeholder = 'Enter ' + id.replace('_', ' ');
        sel.replaceWith(input);
    });
    const hosType = document.getElementById('hospital_type_display');
    if (hosType) {
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'form-input';
        input.name = 'hospital_type'; input.id = 'hospital_type_input';
        input.placeholder = 'e.g. District, Regional, Teaching';
        hosType.replaceWith(input);
    }
}

// ============================================================
// YES/NO TOGGLE GROUPS
// ============================================================
function initYNGroups() {
    document.querySelectorAll('.yn-group, .yn-group-3').forEach(el => {
        const name     = el.dataset.name;
        const isSmall  = el.classList.contains('sm');
        const isThree  = el.classList.contains('yn-group-3');
        const required = el.dataset.required === 'true';
        const options  = isThree
            ? (el.dataset.options || 'Yes,No,Not Applicable').split(',')
            : ['Yes', 'No'];

        el.innerHTML = '';
        el.classList.add('yn-btn-group');

        options.forEach((opt, i) => {
            const cssClass = i === 0 ? 'yes' : i === 1 ? 'no' : 'na';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = opt.trim();
            btn.className = `yn-btn ${cssClass}${isSmall ? ' sm' : ''}`;
            btn.addEventListener('click', () => {
                el.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                hidden.value = opt.trim();
                el.classList.remove('yn-error');
                // Hide associated error
                const errEl = document.getElementById('error_' + name);
                if (errEl) { errEl.classList.remove('show'); }
                // Trigger skip logic if needed
                if (name === 'q3e')   skipLogic3f();
                if (name === 'q101l') skipLogicMsupply();
                if (name === 'q11g')  skipLogic11h();
            });
            el.appendChild(btn);
        });

        const hidden = document.createElement('input');
        hidden.type = 'hidden'; hidden.name = name; hidden.id = 'yn_' + name;
        if (required) hidden.dataset.required = 'true';
        el.appendChild(hidden);
    });
}

// ============================================================
// SKIP LOGIC
// ============================================================
function initSkipLogic() {
    // Initial state: all skip rows hidden/disabled
    setSkipRow('skip_q3f',    true);
    setSkipRow('skip_q4a_other', false); // controlled by radio
    setSkipRow('skip_q101m', true);
    setSkipRow('skip_q11h',  true);
}

function setSkipRow(rowId, skip) {
    const row = document.getElementById(rowId);
    if (!row) return;
    if (skip) {
        row.classList.add('skipped');
        // Unset any required hidden inputs inside
        row.querySelectorAll('input[data-required="true"], input[type="hidden"][data-required="true"]').forEach(i => {
            i._skipRequired = i.dataset.required;
            i.removeAttribute('data-required');
        });
        row.querySelectorAll('.yn-btn-group').forEach(g => {
            const h = g.querySelector('input[type="hidden"]');
            if (h && h.dataset.required === 'true') {
                h._skipRequired = 'true';
                h.removeAttribute('data-required');
            }
        });
    } else {
        row.classList.remove('skipped');
        row.querySelectorAll('input').forEach(i => {
            if (i._skipRequired) { i.dataset.required = i._skipRequired; delete i._skipRequired; }
        });
        row.querySelectorAll('.yn-btn-group input[type="hidden"]').forEach(h => {
            if (h._skipRequired) { h.dataset.required = h._skipRequired; delete h._skipRequired; }
        });
    }
}

function skipLogic3f() {
    const val = document.getElementById('yn_q3e')?.value;
    const skip = !val || val === 'No' || val === 'Not Applicable';
    setSkipRow('skip_q3f', skip);
}

function skipLogicMsupply() {
    const val = document.getElementById('yn_q101l')?.value;
    const skip = !val || val === 'No';
    setSkipRow('skip_q101m', skip);
}

function skipLogic11h() {
    const val = document.getElementById('yn_q11g')?.value;
    const skip = !val || val === 'No';
    setSkipRow('skip_q11h', skip);
}

function checkWasteOther() {
    const val = document.querySelector('[name="q4a_waste"]:checked')?.value;
    const otherRow = document.getElementById('skip_q4a_other');
    if (otherRow) {
        const show = val === 'Other';
        otherRow.style.display = show ? 'block' : 'none';
        const inp = document.getElementById('q4a_other');
        if (inp) {
            if (show) inp.dataset.required = 'true';
            else { inp.removeAttribute('data-required'); inp.value = ''; }
        }
    }
    const errEl = document.getElementById('error_q4a_waste');
    if (errEl && val) errEl.classList.remove('show');
}

// ============================================================
// SECTION VALIDATION — complete rewrite
// ============================================================

/**
 * Get a human-readable label for an input element
 */
function getFieldLabel(el) {
    // Try closest form-group label
    const fg = el.closest('.form-group, .checklist-row, .rt-row, .ica-row, .mrdt-row, .training-row');
    if (fg) {
        const lbl = fg.querySelector('.form-label, .checklist-q, .rt-label, .ica-gap, .training-label');
        if (lbl) {
            return lbl.textContent.replace('*','').replace(/\s+/g,' ').trim().substring(0, 70);
        }
    }
    // Fallback to placeholder or name
    return el.placeholder || el.name || el.id || 'Required field';
}

function validateSection(sectionNum) {
    // Section 1 is intro — no fields, always passes
    if (sectionNum === 1) return true;

    const section = document.querySelector(`.form-section[data-section="${sectionNum}"]`);
    if (!section) return true;

    let valid    = true;
    let firstErr = null;
    const errorList = [];  // {label, el}

    function fail(el, label) {
        valid = false;
        if (!firstErr) firstErr = el;
        if (label) errorList.push(label);
    }

    // ---------------------------------------------------------
    // 1. Standard required text / number / date / select
    //    (NOT [required] on HCW numbers — those handled below with split logic)
    // ---------------------------------------------------------
    section.querySelectorAll('input[required]:not([type="hidden"]), select[required]').forEach(el => {
        if (el.closest('.skipped')) return;
        const empty = !el.value || el.value.trim() === '';
        if (empty) {
            el.classList.add('invalid');
            const errEl = document.getElementById('error_' + el.id);
            if (errEl) errEl.classList.add('show');
            fail(el, getFieldLabel(el));
        } else {
            el.classList.remove('invalid');
            const errEl = document.getElementById('error_' + el.id);
            if (errEl) errEl.classList.remove('show');
        }
    });

    // ---------------------------------------------------------
    // 2. Supervisor required fields  (data-sup-req="true")
    // ---------------------------------------------------------
    section.querySelectorAll('[data-sup-req="true"]').forEach(el => {
        if (el.closest('.skipped')) return;
        const empty = !el.value || el.value.trim() === '';
        const phoneErr = el.dataset.phone === 'true' && el.value && !/^\d{9}$/.test(el.value.replace(/\s/g,''));
        if (empty || phoneErr) {
            el.classList.add('invalid');
            const errEl = document.getElementById('error_' + el.id);
            if (errEl) errEl.classList.add('show');
            fail(el, getFieldLabel(el));
        } else {
            el.classList.remove('invalid');
            const errEl = document.getElementById('error_' + el.id);
            if (errEl) errEl.classList.remove('show');
        }
    });

    // ---------------------------------------------------------
    // 3. Number fields (data-req="number") — auto-fill "0" if blank; never block
    // ---------------------------------------------------------
    section.querySelectorAll('[data-req="number"]').forEach(el => {
        if (el.closest('.skipped')) return;
        if (el.value === '' || el.value === null || el.value === undefined) {
            el.value = '0';  // auto-fill default
        }
        el.classList.remove('invalid');
    });

    // ---------------------------------------------------------
    // 4. HCW split validation (section 2 only)
    // ---------------------------------------------------------
    if (sectionNum === 2) {
        const total  = parseInt(document.getElementById('total_hcw')?.value)  || 0;
        const male   = parseInt(document.getElementById('male_hcw')?.value)   || 0;
        const female = parseInt(document.getElementById('female_hcw')?.value) || 0;
        const splitErr = document.getElementById('error_hcw_split');
        if (total > 0 && (male + female) !== total) {
            if (splitErr) splitErr.classList.add('show');
            fail(document.getElementById('total_hcw'), `HCW count: Male (${male}) + Female (${female}) must equal Total (${total})`);
        } else {
            if (splitErr) splitErr.classList.remove('show');
        }
    }

    // ---------------------------------------------------------
    // 5. YN hidden inputs with data-required="true"
    //    Special handling for training grid and ICA grid
    // ---------------------------------------------------------
    let trainingFailed = false;
    let icaFailed      = false;

    section.querySelectorAll('input[type="hidden"][data-required="true"]').forEach(hidden => {
        if (hidden.closest('.skipped')) return;
        const group = hidden.closest('.yn-btn-group');
        const name  = hidden.name;

        if (!hidden.value) {
            if (group) group.classList.add('yn-error');
            // Try to find specific error div
            const errEl = document.getElementById('error_' + name);
            if (errEl) errEl.classList.add('show');
            // Detect training / ICA rows — use group error instead of per-field
            const inTraining = hidden.closest('.training-row');
            const inIca      = hidden.closest('.ica-row');
            if (inTraining) {
                trainingFailed = true;
            } else if (inIca) {
                icaFailed = true;
            } else {
                // Get label from checklist-q sibling
                const row = hidden.closest('.checklist-row, .rt-row, .mrdt-row');
                let label = '';
                if (row) {
                    const sn = row.querySelector('.checklist-sn')?.textContent?.trim() || '';
                    const qEl = row.querySelector('.checklist-q');
                    if (qEl) {
                        label = (sn ? sn + '. ' : '') + qEl.textContent.replace('*','').replace(/\s+/g,' ').trim().substring(0,70);
                    } else {
                        const rtLabel = row.querySelector('.rt-label');
                        if (rtLabel) label = rtLabel.textContent.trim().substring(0,70);
                    }
                }
                fail(group || hidden, label);
            }
        } else {
            if (group) group.classList.remove('yn-error');
            const errEl = document.getElementById('error_' + name);
            if (errEl) errEl.classList.remove('show');
        }
    });

    if (trainingFailed) {
        const te = document.getElementById('error_training');
        if (te) te.classList.add('show');
        const firstUnanswered = section.querySelector('.training-row .yn-btn-group.yn-error');
        fail(firstUnanswered, 'Training competency — answer all cadre rows');
    } else {
        const te = document.getElementById('error_training');
        if (te) te.classList.remove('show');
    }

    if (icaFailed) {
        const ie = document.getElementById('error_ica_all');
        if (ie) ie.classList.add('show');
        const firstUnanswered = section.querySelector('.ica-row .yn-btn-group.yn-error');
        fail(firstUnanswered, 'Corrective actions — answer all gap rows');
    } else {
        const ie = document.getElementById('error_ica_all');
        if (ie) ie.classList.remove('show');
    }

    // ---------------------------------------------------------
    // 6. Radio groups — use actual radio name inside the group
    // ---------------------------------------------------------
    section.querySelectorAll('[id^="grp_"]').forEach(grp => {
        if (grp.closest('.skipped')) return;
        const anyRadio  = grp.querySelector('input[type="radio"]');
        if (!anyRadio) return;
        const radioName = anyRadio.name;   // get actual name from first radio
        const checked   = grp.querySelector(`input[type="radio"][name="${radioName}"]:checked`);

        // Only enforce if a field-error div is present inside or nearby
        const nearbyErr = grp.parentElement?.querySelector('.field-error') ||
                          grp.closest('.checklist-row, .form-group')?.querySelector('.field-error');
        if (!nearbyErr) return;

        if (!checked) {
            grp.classList.add('invalid');
            nearbyErr.classList.add('show');
            const label = grp.closest('.checklist-row, .form-group')
                ?.querySelector('.checklist-q, .form-label')
                ?.textContent.replace('*','').replace(/\s+/g,' ').trim().substring(0,70) || radioName;
            fail(grp, label);
        } else {
            grp.classList.remove('invalid');
            nearbyErr.classList.remove('show');
        }
    });

    // ---------------------------------------------------------
    // 7. Required checkbox groups (at least 1 must be checked)
    // ---------------------------------------------------------
    [
        ['grp_q3g', 'error_q3g', 'Laboratory instruments and reagents'],
        ['grp_q3h', 'error_q3h', 'Other equipment at facility'],
        ['grp_q3i', 'error_q3i', 'Emergency equipment'],
        ['grp_q101n','error_q101n','Storage conditions'],
    ].forEach(([grpId, errId, label]) => {
        const grp = document.getElementById(grpId);
        const err = document.getElementById(errId);
        if (!grp || !err) return;
        if (grp.closest('.skipped')) return;
        const checked = grp.querySelector('input[type="checkbox"]:checked');
        if (!checked) {
            grp.classList.add('invalid');
            err.classList.add('show');
            fail(grp, label + ' (select at least one)');
        } else {
            grp.classList.remove('invalid');
            err.classList.remove('show');
        }
    });

    // ---------------------------------------------------------
    // Show / hide validation summary banner
    // ---------------------------------------------------------
    const summary = document.getElementById('valSummary_' + sectionNum);
    if (summary) {
        if (!valid && errorList.length) {
            const items = errorList.map(l => `<li>${l}</li>`).join('');
            summary.innerHTML = `
                <div class="val-summary-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    ${errorList.length} field${errorList.length > 1 ? 's' : ''} need${errorList.length === 1 ? 's' : ''} attention before you can continue:
                </div>
                <ul class="val-summary-list">${items}</ul>`;
            summary.style.display = 'block';
        } else {
            summary.style.display = 'none';
        }
    }

    if (!valid && firstErr) {
        // Scroll to the summary banner if visible, else first error
        const target = (summary && summary.style.display !== 'none') ? summary : firstErr;
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }

    return valid;
}

function validateHCW() {
    const total  = parseInt(document.getElementById('total_hcw')?.value)  || 0;
    const male   = parseInt(document.getElementById('male_hcw')?.value)   || 0;
    const female = parseInt(document.getElementById('female_hcw')?.value) || 0;
    const err    = document.getElementById('error_hcw_split');
    if (total > 0 && male + female !== total) {
        if (err) err.classList.add('show');
    } else {
        if (err) err.classList.remove('show');
    }
}

function validatePhone(el) {
    const digits = el.value.replace(/\D/g,'');
    el.value = digits.substring(0, 9);  // strip non-digits, cap at 9
    const errEl = document.getElementById('error_' + el.id);
    if (el.value.length > 0 && el.value.length !== 9) {
        el.classList.add('invalid');
        if (errEl) { errEl.textContent = `Enter exactly 9 digits (${el.value.length} entered)`; errEl.classList.add('show'); }
    } else {
        el.classList.remove('invalid');
        if (errEl) errEl.classList.remove('show');
    }
}

function showErr(id)    { const el = document.getElementById(id); if (el) el.classList.add('show'); }
function hideErr(id)    { const el = document.getElementById(id); if (el) el.classList.remove('show'); }
function showYNErr(id)  { const el = document.getElementById(id); if (el) el.classList.add('show'); }
function hideYNErr(id)  { const el = document.getElementById(id); if (el) el.classList.remove('show'); }
function clearFieldError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('invalid');
    hideErr('error_' + id);
}

// ============================================================
// SECTION NAVIGATION
// ============================================================
function nextSection() {
    if (!validateSection(currentSection)) return;
    if (currentSection < TOTAL_SECTIONS) showSection(currentSection + 1);
}

function previousSection() {
    if (currentSection > 1) showSection(currentSection - 1);
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
    const vd = document.getElementById('visit_date');
    if (vd && !vd.value) vd.value = today;
}

// ============================================================
// STATUS BAR
// ============================================================
function updateStatusBar() {
    const drafts    = getDrafts();
    const submitted = getSubmitted();
    const dc = document.getElementById('draftCount');
    const sc = document.getElementById('submittedCount');
    if (dc) dc.textContent = drafts.length;
    if (sc) sc.textContent = submitted.length;
    const ind  = document.getElementById('statusIndicator');
    const stxt = document.getElementById('statusText');
    if (navigator.onLine) {
        ind?.classList.remove('offline');
        if (stxt) { stxt.textContent = 'ONLINE'; stxt.style.color = ''; }
    } else {
        ind?.classList.add('offline');
        if (stxt) { stxt.textContent = 'OFFLINE'; stxt.style.color = '#c0392b'; }
    }
}

// ============================================================
// COLLECT FORM DATA
// ============================================================
function collectFormData() {
    const form = document.getElementById('dataForm');
    const data = {};
    new FormData(form).forEach((val, key) => {
        if (data[key]) {
            if (!Array.isArray(data[key])) data[key] = [data[key]];
            data[key].push(val);
        } else {
            data[key] = val;
        }
    });
    data._timestamp = new Date().toISOString();
    data._section   = currentSection;
    return data;
}

// ============================================================
// DRAFTS
// ============================================================
function getDrafts()     { try { return JSON.parse(localStorage.getItem(STORAGE_DRAFTS) || '[]'); } catch { return []; } }
function saveDrafts(d)   { localStorage.setItem(STORAGE_DRAFTS, JSON.stringify(d)); }
function getSubmitted()  { try { return JSON.parse(localStorage.getItem(STORAGE_SUBMITTED) || '[]'); } catch { return []; } }
function saveSubmitted(r){ localStorage.setItem(STORAGE_SUBMITTED, JSON.stringify(r)); }

function showDraftNameModal() {
    const hosp = document.getElementById('hospital_name')?.value?.trim();
    const dist = document.getElementById('district')?.value?.trim();
    const date = document.getElementById('visit_date')?.value || '';
    let name = hosp || dist || 'Draft';
    if (date) name += ' | ' + date;
    const inp = document.getElementById('draftNameInput');
    if (inp) inp.value = name;
    openModal('draftNameModal');
}

function confirmSaveDraft() {
    const name = document.getElementById('draftNameInput')?.value?.trim() || 'Draft ' + Date.now();
    const data = collectFormData();
    data._draftName = name;
    data._savedAt   = new Date().toLocaleString();
    data.form_status = 'draft';
    const draftId = document.getElementById('draft_id')?.value || 'draft_' + Date.now();
    data._id = draftId;
    if (document.getElementById('draft_id')) document.getElementById('draft_id').value = draftId;
    const drafts = getDrafts();
    const idx = drafts.findIndex(d => d._id === draftId);
    if (idx >= 0) drafts[idx] = data; else drafts.push(data);
    saveDrafts(drafts);
    updateStatusBar();
    closeModal('draftNameModal');
    showNotification('Draft saved: ' + name, 'success');
}

function openDraftsModal() {
    const body = document.getElementById('draftsModalBody');
    const drafts = getDrafts();
    body.innerHTML = drafts.length ? drafts.map(d => `
        <div class="draft-item">
            <div>
                <div class="draft-name">${esc(d._draftName || 'Unnamed')}</div>
                <div class="draft-meta">Saved: ${esc(d._savedAt || '')} | Section: ${d._section || 1}</div>
            </div>
            <div class="draft-actions">
                <button class="draft-btn-action load" onclick="loadDraft('${d._id}')">LOAD</button>
                <button class="draft-btn-action del" onclick="deleteDraft('${d._id}')">DELETE</button>
            </div>
        </div>`).join('') : '<div class="no-drafts">No saved drafts found.</div>';
    openModal('draftsModal');
}

function loadDraft(id) {
    const draft = getDrafts().find(d => d._id === id);
    if (!draft) return;
    const form = document.getElementById('dataForm');

    // Restore standard inputs
    Object.entries(draft).forEach(([key, val]) => {
        if (key.startsWith('_')) return;
        // Select fields - need to re-trigger cascade
        if (key === 'region') {
            const sel = document.getElementById('region');
            if (sel) { sel.value = val; sel.dispatchEvent(new Event('change')); }
            return;
        }
        if (key === 'district') {
            setTimeout(() => {
                const sel = document.getElementById('district');
                if (sel) { sel.value = val; sel.dispatchEvent(new Event('change')); }
            }, 100);
            return;
        }
        if (key === 'chiefdom') {
            setTimeout(() => {
                const sel = document.getElementById('chiefdom');
                if (sel) { sel.value = val; sel.dispatchEvent(new Event('change')); }
            }, 200);
            return;
        }
        if (key === 'hospital_name') {
            setTimeout(() => {
                const sel = document.getElementById('hospital_name');
                if (sel) { sel.value = val; sel.dispatchEvent(new Event('change')); }
            }, 300);
            return;
        }

        const el = form.querySelector(`[name="${key}"]`);
        if (!el) return;
        if (el.type === 'hidden') { el.value = val; return; }
        if (el.type === 'radio') {
            form.querySelectorAll(`[name="${key}"]`).forEach(r => { r.checked = r.value === val; });
            return;
        }
        if (el.type === 'checkbox') { el.checked = !!val; return; }
        el.value = val;
    });

    // Restore YN groups
    setTimeout(() => {
        form.querySelectorAll('.yn-btn-group').forEach(group => {
            const hidden = group.querySelector('input[type="hidden"]');
            if (!hidden || !draft[hidden.name]) return;
            const stored = draft[hidden.name];
            hidden.value = stored;
            group.querySelectorAll('.yn-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent.trim() === stored);
            });
        });
        // Restore checkboxes
        form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const val = draft[cb.name];
            if (val !== undefined) {
                cb.checked = Array.isArray(val) ? val.includes(cb.value) : val === cb.value;
            }
        });
        // Re-trigger skip logic
        skipLogic3f(); skipLogicMsupply(); skipLogic11h(); checkWasteOther();
    }, 400);

    if (document.getElementById('draft_id')) document.getElementById('draft_id').value = id;
    const sec = draft._section || 1;
    closeModal('draftsModal');
    showSection(Math.min(sec, TOTAL_SECTIONS));
    showNotification('Draft loaded successfully', 'success');
}

function deleteDraft(id) {
    saveDrafts(getDrafts().filter(d => d._id !== id));
    updateStatusBar();
    openDraftsModal();
    showNotification('Draft deleted', '');
}

// ============================================================
// VIEW DATA
// ============================================================
function viewData() {
    const records = getSubmitted();
    const body = document.getElementById('dataModalBody');
    if (!records.length) {
        body.innerHTML = '<div class="no-drafts">No submitted records found.</div>';
        openModal('dataModal');
        return;
    }
    const cols = ['hospital_name','district','region','visit_date','q15b_rating','_savedAt'];
    const hdrs = ['Hospital','District','Region','Visit Date','Rating','Submitted At'];
    body.innerHTML = `<div class="data-table-wrap"><table class="data-table">
        <thead><tr>${hdrs.map(h=>`<th>${h}</th>`).join('')}<th>EXPORT</th></tr></thead>
        <tbody>${records.map((r,i)=>`<tr>${cols.map(c=>`<td>${esc(r[c]||'')}</td>`).join('')}
        <td><button class="draft-btn-action load" onclick="exportRecord(${i})">EXPORT</button></td></tr>`).join('')}
        </tbody></table></div>`;
    openModal('dataModal');
}

function exportRecord(idx) {
    const r = getSubmitted()[idx];
    if (!r) return;
    downloadJSON([r], `MOCM_${r.hospital_name||'Record'}_${r.visit_date||''}.json`);
}

// ============================================================
// DOWNLOAD
// ============================================================
function downloadData() {
    const records = getSubmitted();
    if (!records.length) { showNotification('No submitted records to download', 'error'); return; }
    const allKeys = [...new Set(records.flatMap(r => Object.keys(r)))].filter(k => !k.startsWith('_'));
    const rows = [allKeys.join(',')];
    records.forEach(r => {
        rows.push(allKeys.map(k => {
            const v = r[k] ?? '';
            const s = Array.isArray(v) ? v.join('; ') : String(v);
            return '"' + s.replace(/"/g,'""') + '"';
        }).join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `MOCM_Records_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showNotification('CSV download started', 'success');
}

function downloadJSON(records, filename) {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename || 'MOCM_Export.json';
    a.click(); URL.revokeObjectURL(url);
}

// ============================================================
// FINALIZE & SUBMIT
// ============================================================
function finalizeForm() {
    // Validate all sections 2-10
    let allValid = true;
    let firstFailSec = null;
    for (let s = 2; s <= TOTAL_SECTIONS; s++) {
        if (!validateSection(s)) {
            if (!firstFailSec) firstFailSec = s;
            allValid = false;
        }
    }
    if (!allValid) {
        showNotification(`Incomplete fields found — please check all sections`, 'error');
        if (firstFailSec) showSection(firstFailSec);
        return;
    }
    document.getElementById('form_status').value = 'finalized';
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.disabled = false;
    showNotification('All sections complete! Click SUBMIT to save permanently.', 'success');
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
    const draftId = document.getElementById('draft_id')?.value;
    if (draftId) saveDrafts(getDrafts().filter(d => d._id !== draftId));
    updateStatusBar();
    showNotification('Record submitted successfully!', 'success');
    setTimeout(() => {
        if (confirm('Record saved! Download a copy now?')) {
            downloadJSON([data], `MOCM_${data.hospital_name||'Record'}_${data.visit_date||''}.json`);
        }
        newForm();
    }, 600);
}

// ============================================================
// NEW FORM
// ============================================================
function newForm() {
    if (!confirm('Start a new checklist? Unsaved data will be lost.')) return;
    const form = document.getElementById('dataForm');
    form.reset();
    document.getElementById('draft_id').value = '';
    document.getElementById('form_status').value = 'draft';
    // Reset YN buttons
    document.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.yn-btn-group input[type="hidden"]').forEach(h => h.value = '');
    // Reset cascade
    clearCascadeBelow('district');
    const regionSel = document.getElementById('region');
    if (regionSel) regionSel.value = '';
    // Reset auto-fill
    const td = document.getElementById('hospital_type_display');
    if (td) { td.textContent = 'Select hospital above to auto-fill type'; td.classList.remove('filled'); }
    // Reset skip logic
    setSkipRow('skip_q3f', true);
    setSkipRow('skip_q101m', true);
    setSkipRow('skip_q11h', true);
    const otherRow = document.getElementById('skip_q4a_other');
    if (otherRow) otherRow.style.display = 'none';
    // Clear validation marks
    document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    document.querySelectorAll('.yn-error').forEach(el => el.classList.remove('yn-error'));
    document.querySelectorAll('.field-error.show').forEach(el => el.classList.remove('show'));
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.disabled = true;
    setDefaultDate();
    showSection(1);
    showNotification('New checklist started', '');
}

// ============================================================
// MODALS
// ============================================================
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

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
    el._timer = setTimeout(() => { el.className = 'notification'; }, 3200);
}

// ============================================================
// UTILITIES
// ============================================================
function esc(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// DYNAMIC STAFF ROWS
// ============================================================
let staffRowCount = 4; // 4 default rows already in HTML

function addStaffRow() {
    staffRowCount++;
    const n = staffRowCount;
    const container = document.getElementById('staffRows');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'staff-data-row';
    row.dataset.row = n;
    row.innerHTML = `
        <input type="text"   class="form-input"      name="staff_cadre_${n}"    placeholder="e.g. Pharmacist" style="font-size:0.76rem;">
        <input type="number" class="form-input mini"  name="staff_male_${n}"     min="0" placeholder="0">
        <input type="number" class="form-input mini"  name="staff_female_${n}"   min="0" placeholder="0">
        <input type="number" class="form-input mini"  name="staff_salary_${n}"   min="0" placeholder="0">
        <input type="number" class="form-input mini"  name="staff_nosalary_${n}" min="0" placeholder="0">
        <button type="button" class="staff-del-btn" onclick="removeStaffRow(this)" title="Remove row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                <line x1="18" y1="6"  x2="6"  y2="18"/>
                <line x1="6"  y1="6"  x2="18" y2="18"/>
            </svg>
        </button>`;
    container.appendChild(row);
    row.querySelector('input[type="text"]').focus();
    updateDelBtnStates();
}

function removeStaffRow(btn) {
    const row = btn.closest('.staff-data-row');
    const container = document.getElementById('staffRows');
    if (!container || container.children.length <= 1) return; // keep at least 1
    row.style.opacity = '0';
    row.style.transform = 'translateX(10px)';
    row.style.transition = 'opacity 0.15s, transform 0.15s';
    setTimeout(() => { row.remove(); updateDelBtnStates(); }, 150);
}

function updateDelBtnStates() {
    const container = document.getElementById('staffRows');
    if (!container) return;
    const rows = container.querySelectorAll('.staff-data-row');
    rows.forEach(r => {
        const btn = r.querySelector('.staff-del-btn');
        if (btn) btn.disabled = rows.length <= 1;
    });
}

// ============================================================
// DYNAMIC SUPERVISOR ROWS
// ============================================================
let supRowCount = 1;

function addSupRow() {
    supRowCount++;
    const n = supRowCount;
    const container = document.getElementById('supervisorRows');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'supervisor-card';
    card.dataset.sup = n;
    card.innerHTML = `
        <div class="sup-card-header">
            <span class="sup-number">SUPERVISOR ${n}</span>
            <button type="button" class="sup-del-btn" onclick="removeSupRow(this)" title="Remove supervisor">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="two-col">
            <div class="form-group">
                <label class="form-label">Full Name</label>
                <input type="text" class="form-input" name="sup_name_${n}" id="sup_name_${n}" placeholder="Full name">
            </div>
            <div class="form-group">
                <label class="form-label">Sex</label>
                <select class="form-select" name="sup_sex_${n}" id="sup_sex_${n}">
                    <option value="">Select</option><option>Male</option><option>Female</option>
                </select>
            </div>
        </div>
        <div class="two-col">
            <div class="form-group">
                <label class="form-label">Designation</label>
                <input type="text" class="form-input" name="sup_designation_${n}" placeholder="Title / Role">
            </div>
            <div class="form-group">
                <label class="form-label">Organization</label>
                <input type="text" class="form-input" name="sup_org_${n}" placeholder="Organization">
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">Contact Number <span class="phone-hint">(9 digits)</span></label>
            <input type="tel" class="form-input" name="sup_contact_${n}" id="sup_contact_${n}"
                   data-phone="true" placeholder="e.g. 076123456" maxlength="9"
                   oninput="validatePhone(this)">
            <div class="field-error" id="error_sup_contact_${n}">Enter exactly 9 digits</div>
        </div>`;
    container.appendChild(card);
    card.querySelector('input[type="text"]').focus();
    updateSupDelBtns();
}

function removeSupRow(btn) {
    const card = btn.closest('.supervisor-card');
    const container = document.getElementById('supervisorRows');
    if (!container || container.children.length <= 1) return;
    card.style.opacity = '0';
    card.style.transform = 'translateX(10px)';
    card.style.transition = 'opacity 0.15s, transform 0.15s';
    setTimeout(() => { card.remove(); updateSupDelBtns(); }, 150);
}

function updateSupDelBtns() {
    const container = document.getElementById('supervisorRows');
    if (!container) return;
    const cards = container.querySelectorAll('.supervisor-card');
    cards.forEach(c => {
        const btn = c.querySelector('.sup-del-btn');
        if (btn) btn.disabled = cards.length <= 1;
    });
}
