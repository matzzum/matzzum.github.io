// =============================================
//  모드 전환 (미니 ↔ 일반)
//  ※ 커피 룰렛(2층/3층/외출/1층 하드코딩)은 특정 사무실 층 구조라 다른
//     사용자에게 의미가 없어 폐기함 — 기획서 04번 참고.
// =============================================
function setGlobalMode(mode) {
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active',
        (mode === 'mini' && btn.id === 'btnMini') ||
        (mode === 'full' && btn.id === 'btnFull')
    );
});
roulette.setMode(mode);
roulette.resetLunchResult();
}

// =============================================
//  점심 룰렛
// =============================================
window.roulette = (function() {
// 옛 가산디지털단지 14곳 하드코딩 리스트 대신 실제 DB(data/restaurants.xlsx)를 사용.
// 탭에 들어가면 칸을 비워두고(자동으로 아무 식당이나 채우지 않음), "자동 배치"
// 버튼으로 거리순 채우기를 하거나, 이미 나뉜 휠 조각을 탭해서 그 자리에 뜨는
// 입력창에 가게 이름을 직접 입력해 채울 수 있음(별도 칸 목록을 두지 않음).
// 기획서 04번 참고.
const POOL_SIZE_MINI = 4;
const POOL_SIZE_FULL = 12;
const MAX_SUGGESTIONS = 6; // 타이핑할 때 아래에 보여줄 후보 목록 최대 개수

let restaurantsFull = [];   // xlsx에서 로드한 노출 대상 전체 식당
let dataLoadPromise = null;
let slots = [];              // index = 조각 번호, 값 = 매칭된 식당 객체 | null(빈 조각)
let currentMode = 'mini';
let activeEditorSlot = null; // 현재 편집 중인 조각 번호(없으면 null)
let isSpinning = false;
let currentAngle = 0;

const canvas = document.getElementById('rouletteCanvas');
const ctx = canvas.getContext('2d');

// getDistanceKm는 assets/js/shared.js의 공용 함수를 씀(index.html에서 이미 로드됨)

// index.html의 공용 캐시 로더(window.getRestaurantsData) 사용 — 탭을 오갈
// 때마다 엑셀을 새로 받고 새로 파싱하지 않도록(첫 로딩 이후엔 세션 내내
// 재사용, map-tab.html/calorie-tab.html과도 같이 공유됨).
function loadRestaurants() {
    if (dataLoadPromise) return dataLoadPromise;
    dataLoadPromise = window.getRestaurantsData().then(list => {
        restaurantsFull = list;
        return restaurantsFull;
    });
    return dataLoadPromise;
}

function slotCount() { return currentMode === 'mini' ? POOL_SIZE_MINI : POOL_SIZE_FULL; }

function escapeHtmlLocal(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// 조각(캔버스)을 탭했을 때 그 자리에 뜨는 입력창 — 별도 칸 목록 없이 휠 위에서
// 바로 입력하기 위함. x, y는 wheelArea 기준 좌표.
function openSlotEditor(idx, x, y) {
    activeEditorSlot = idx;
    const editor = document.getElementById('rouletteSlotEditor');
    const input = document.getElementById('rouletteSlotEditorInput');
    const area = document.getElementById('wheelArea');
    if (!editor || !input || !area) return;
    const areaRect = area.getBoundingClientRect();
    const editorWidth = 150;
    const left = Math.max(4, Math.min(x - editorWidth / 2, areaRect.width - editorWidth - 4));
    const top = Math.max(4, Math.min(y - 16, areaRect.height - 40));
    editor.style.left = left + 'px';
    editor.style.top = top + 'px';
    editor.hidden = false;
    input.value = slots[idx] ? slots[idx].name : '';
    input.focus();
    renderEditorDropdown('');
}

function closeSlotEditor() {
    const editor = document.getElementById('rouletteSlotEditor');
    if (editor) editor.hidden = true;
    const dd = document.getElementById('rouletteSlotEditorDropdown');
    if (dd) dd.innerHTML = '';
    activeEditorSlot = null;
}

function onEditorInput() {
    const input = document.getElementById('rouletteSlotEditorInput');
    if (input) renderEditorDropdown(input.value.trim());
}

// q가 비어있고 현재 조각이 채워져 있으면 "비우기" 액션을, 타이핑하면 이름이
// 포함되는(이미 다른 조각에 쓰인 건 제외) 후보를 보여준다.
function renderEditorDropdown(q) {
    const dd = document.getElementById('rouletteSlotEditorDropdown');
    if (!dd || activeEditorSlot === null) return;
    let rows = [];
    if (!q && slots[activeEditorSlot]) {
        rows.push(`<div class="roulette-slot-option clear" onclick="roulette.clearEditorSlot()">✕ 비우기</div>`);
    }
    if (q) {
        const usedIds = new Set(slots.filter((r, i) => r && i !== activeEditorSlot).map(r => r.id));
        const matches = restaurantsFull.filter(r => r.name.includes(q) && !usedIds.has(r.id)).slice(0, MAX_SUGGESTIONS);
        rows = rows.concat(matches.length
            ? matches.map(r => `<div class="roulette-slot-option" onclick="roulette.pickEditorOption(${r.id})">${escapeHtmlLocal(r.name)}</div>`)
            : [`<div class="roulette-slot-option empty">일치하는 가게가 없어요</div>`]);
    }
    dd.innerHTML = rows.join('');
}

function pickEditorOption(id) {
    if (activeEditorSlot === null) return;
    const r = restaurantsFull.find(x => x.id === id);
    if (!r) return;
    slots[activeEditorSlot] = r;
    closeSlotEditor();
    renderWheelFromSlots();
}

function clearEditorSlot() {
    if (activeEditorSlot === null) return;
    slots[activeEditorSlot] = null;
    closeSlotEditor();
    renderWheelFromSlots();
}

// "🎯 자동 배치": 아직 비어있는 조각에만 거리순으로 채운다. 이미 채워진 조각
// (직접 입력분 포함)은 그대로 두고, 이미 다른 조각에 쓰인 가게는 후보에서
// 제외해 중복을 피한다.
//
// 기준 위치 우선순위: ① 브라우저 실시간 GPS(현재 위치) → ② 집/회사로 저장해둔
// 위치(GPS 거부/실패 시 대체) → ③ 그래도 없으면 정렬 없이 파일에 있는 순서 그대로.
// ⚠️ 예전엔 ①을 아예 시도하지 않고 곧장 ②만 썼는데, 집/회사 위치를 저장한 적
// 없는 사용자는 refLoc이 계속 null이라 파일 순서 그대로(=예전 가산디지털단지
// 하드코딩 식당들이 앞쪽 행이라 그게 그대로 채워짐) 나왔던 게 "하드코딩된
// 데이터가 들어간다"는 제보의 원인이었음. calorie-tab.html의 현재 위치
// 감지와 동일한 방식(navigator.geolocation.getCurrentPosition, maximumAge:0)
// 을 그대로 적용해 실제 GPS 기준으로 채우도록 고침.
function autoArrange() {
    const btn = document.getElementById('autoArrangeBtn');
    const label = document.getElementById('autoArrangeBtnLabel');
    const originalLabel = label ? label.textContent : '';
    if (btn) btn.disabled = true;
    if (label) label.textContent = '위치 확인 중...';

    function fillWithRefLoc(refLoc) {
        const usedIds = new Set(slots.filter(Boolean).map(r => r.id));
        let candidates = restaurantsFull.filter(r => !usedIds.has(r.id));
        if (refLoc) {
            candidates = candidates.sort((a, b) =>
                getDistanceKm(refLoc.lat, refLoc.lng, a.lat, a.lng) -
                getDistanceKm(refLoc.lat, refLoc.lng, b.lat, b.lng)
            );
        }
        let ci = 0;
        const n = slotCount();
        for (let i = 0; i < n; i++) {
            if (slots[i]) continue;
            if (ci >= candidates.length) break;
            slots[i] = candidates[ci++];
        }
        renderWheelFromSlots();
        if (btn) btn.disabled = false;
        if (label) label.textContent = originalLabel;
    }

    function savedFallbackLoc() {
        const homeLoc = localStorage.getItem('woody_home_loc') ? JSON.parse(localStorage.getItem('woody_home_loc')) : null;
        const companyLoc = localStorage.getItem('woody_company_loc') ? JSON.parse(localStorage.getItem('woody_company_loc')) : null;
        return companyLoc || homeLoc || null;
    }

    loadRestaurants().then(() => {
        if (!navigator.geolocation) {
            fillWithRefLoc(savedFallbackLoc());
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => fillWithRefLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => {
                console.warn('현재 위치를 가져오지 못해 저장된 집/회사 위치로 대체:', err.message);
                fillWithRefLoc(savedFallbackLoc());
            },
            { timeout: 5000, maximumAge: 0 }
        );
    }).catch(e => {
        console.error('룰렛용 식당 데이터 로드 실패:', e);
        if (btn) btn.disabled = false;
        if (label) label.textContent = originalLabel;
    });
}

const COLORS = [
    '#3B82F6','#6366F1','#8B5CF6','#EC4899','#EF4444',
    '#F97316','#EAB308','#22C55E','#14B8A6','#06B6D4',
    '#0EA5E9','#84CC16','#A855F7','#F43F5E'
];

function syncCanvasResolution() {
    const area = document.getElementById('wheelArea');
    if (!area) return;
    const size = area.getBoundingClientRect().width;
    // 탭 전환 직후 등 wheelArea가 아직 레이아웃되지 않아 폭이 0일 수 있음 —
    // 이때 canvas.width를 0으로 설정하면 이어지는 drawWheel()의 radius가
    // 음수가 되어 ctx.arc()가 IndexSizeError로 터짐. 그냥 건너뛰고
    // drawWheel() 쪽 재시도 로직이 레이아웃이 끝난 뒤 다시 불러주게 둔다.
    if (size <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// 조각(slots)이 바뀔 때마다(직접 입력 확정/비우기, 자동 배치) 호출.
function renderWheelFromSlots() {
    currentAngle = 0;
    resetLunchResult();
    syncCanvasResolution();
    drawWheel(currentAngle);
    const btn = document.getElementById('spinBtn');
    if (btn) btn.disabled = !slots.some(Boolean);
}

function setMode(mode) {
    currentMode = mode;
    slots = new Array(slotCount()).fill(null);
    closeSlotEditor();
    loadRestaurants().then(() => {
        renderWheelFromSlots();
    }).catch(e => {
        console.error('룰렛용 식당 데이터 로드 실패:', e);
        document.getElementById('resultLabel').style.display = 'block';
        document.getElementById('resultName').textContent = '데이터를 불러오지 못했어요 😢';
        document.getElementById('resultMeta').textContent = '새로고침 후 다시 시도해주세요.';
    });
}

// 휠은 항상 slotCount()개 조각으로 미리 나뉜 채(피자처럼) 그려짐 — 채워진
// 조각은 색+이름, 빈 조각은 흐린 색+"+"로 표시. 조각을 탭하면 openSlotEditor.
function drawWheel(angle) {
    const area = document.getElementById('wheelArea');
    if (!area) return;
    const displaySize = area.getBoundingClientRect().width;
    const cx = displaySize / 2, cy = displaySize / 2;
    const radius = cx - 5;
    if (radius <= 0) {
        // wheelArea가 아직 레이아웃되지 않아 radius가 0 이하(예: 탭 전환
        // 직후 곧바로 autoArrange 호출) — 여기서 그리면 ctx.arc()가
        // IndexSizeError를 던지므로 건너뛰고, 다음 프레임에 해상도 동기화부터
        // 다시 시도한다.
        requestAnimationFrame(() => {
            syncCanvasResolution();
            drawWheel(angle);
        });
        return;
    }
    const n = slotCount();
    const slice = (2 * Math.PI) / n;

    ctx.clearRect(0, 0, displaySize, displaySize);

    for (let i = 0; i < n; i++) {
        const s = angle + i * slice;
        const e = s + slice;
        const filled = slots[i];

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, s, e);
        ctx.closePath();
        ctx.fillStyle = filled ? COLORS[i % COLORS.length] : 'rgba(148,163,184,0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(s + slice / 2);

        const isMini = n <= 4;
        ctx.textAlign = isMini ? 'center' : 'right';
        ctx.fillStyle = filled ? 'white' : 'rgba(226,232,240,0.85)';
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 4;
        ctx.font = `bold 16px 'Noto Sans KR', sans-serif`;

        const label = filled
            ? (isMini ? filled.name : (filled.name.length > 7 ? filled.name.slice(0, 7) + '…' : filled.name))
            : '+';

        if (isMini) {
            ctx.fillText(label, radius * 0.55, 16 * 0.35);
        } else {
            ctx.fillText(label, radius - 12, 16 * 0.35);
        }
        ctx.restore();
    }

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.13);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#c7d2fe');
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.11, 0, 2 * Math.PI);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
}

// 캔버스를 탭하면 어느 조각을 눌렀는지 각도로 계산해 그 자리에 편집창을 띄움.
canvas.addEventListener('click', (e) => {
    if (isSpinning) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2, cy = rect.height / 2;
    const dx = x - cx, dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > rect.width / 2 || dist < rect.width * 0.11) return; // 원 밖/중앙 로고 클릭 무시
    let theta = Math.atan2(dy, dx);
    if (theta < 0) theta += 2 * Math.PI;
    const n = slotCount();
    const slice = (2 * Math.PI) / n;
    const idx = Math.min(n - 1, Math.floor(theta / slice));
    openSlotEditor(idx, x, y);
});

function spin() {
    const filledIndices = slots.map((s, i) => i).filter(i => slots[i]);
    if (isSpinning || !filledIndices.length) return;
    isSpinning = true;
    closeSlotEditor();
    resetLunchResult();

    // 돌아가는 중 효과 (아이콘이 빙글빙글 도는 스피너)
    document.getElementById('resultName').innerHTML = '<span class="emoji-icon spinning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg></span>돌아가는 중...';
    document.getElementById('resultMeta').textContent = '두구두구두구...';

    document.getElementById('spinBtn').disabled = true;

    const n = slotCount();
    const slice = (2 * Math.PI) / n;
    const targetIndex = filledIndices[Math.floor(Math.random() * filledIndices.length)];

    const targetCenter = targetIndex * slice + slice / 2;
    const randomOffset = (Math.random() * 0.6 - 0.3) * slice;
    const targetAngle = -Math.PI / 2 - targetCenter + randomOffset;

    const normalizedCurrent = ((currentAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const normalizedTarget = ((targetAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    let delta = normalizedTarget - normalizedCurrent;
    if (delta < 0) delta += 2 * Math.PI;

    const extraRot = Math.floor(5 + Math.random() * 6) * 2 * Math.PI;
    const finalAngle = currentAngle + extraRot + delta;
    const duration = 4200 + Math.random() * 1400;
    const startAngle = currentAngle;
    const startTime = performance.now();

    function easeOut(t) { return 1 - Math.pow(1 - t, 4); }
    function animate(now) {
        const t = Math.min((now - startTime) / duration, 1);
        currentAngle = startAngle + (finalAngle - startAngle) * easeOut(t);
        drawWheel(currentAngle);
        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            currentAngle = finalAngle;
            isSpinning = false;
            document.getElementById('spinBtn').disabled = false;
            showResult(slots[targetIndex]);
        }
    }
    requestAnimationFrame(animate);
}

function showResult(r) {
    document.getElementById('resultLabel').style.display = '';
    const dishIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="12" r="7.2"/><circle cx="10" cy="12" r="3.8"/><line x1="17.5" y1="4" x2="17.5" y2="9.5"/><line x1="16" y1="4" x2="16" y2="7"/><line x1="19" y1="4" x2="19" y2="7"/><line x1="17.5" y1="9.5" x2="17.5" y2="16"/></svg>';
    document.getElementById('resultName').innerHTML = `<span class="emoji-icon">${dishIcon}</span>${r.name}`;

    const wonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="6" x2="10" y2="18"/><line x1="19" y1="6" x2="14" y2="18"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="6.3" y1="13" x2="17.7" y2="13"/></svg>';
    const clockIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>';
    const meta = [];
    if (r.price) meta.push(`<span class="meta-item">${wonIcon}${r.price.toLocaleString()}원</span>`);
    if (r.hours && r.hours !== '미확인') meta.push(`<span class="meta-item">${clockIcon}${r.hours}</span>`);
    document.getElementById('resultMeta').innerHTML = meta.join('<span class="meta-sep">·</span>');

    const linksEl = document.getElementById('resultLinks');
    linksEl.innerHTML = '';
    if (r.instagram) {
        const a = document.createElement('a');
        a.href = r.instagram; a.target = '_blank'; a.rel = 'noopener';
        a.className = 'result-link-btn instagram';
        a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>인스타그램';
        linksEl.appendChild(a);
    }
    if (r.kakaoChannel) {
        const a = document.createElement('a');
        a.href = r.kakaoChannel; a.target = '_blank'; a.rel = 'noopener';
        a.className = 'result-link-btn kakao';
        a.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-6.627 0-12 4.254-12 9.5 0 3.321 2.161 6.248 5.5 7.91l-1.13 4.144c-.066.241.02.5.213.655a.575.575 0 0 0 .341.111c.119 0 .237-.036.338-.107l4.908-3.414c.6.066 1.21.101 1.83.101 6.627 0 12-4.254 12-9.5S18.627 3 12 3z"/></svg>카카오채널';
        linksEl.appendChild(a);
    }

    const card = document.getElementById('resultCard');
    card.classList.add('visible');
    setTimeout(() => { card.classList.remove('visible'); }, 400);
}

function resetLunchResult() {
    document.getElementById('resultLabel').style.display = 'block';
    document.getElementById('resultName').innerHTML = '<span class="emoji-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M9.2 9a2.8 2.8 0 1 1 4.3 2.4c-.8.5-1.5 1-1.5 2.1"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></svg></span>무엇이 나올까요?';
    document.getElementById('resultMeta').textContent = '돌려돌려 버튼을 눌러 운명을 확인하세요!';
    document.getElementById('resultLinks').innerHTML = '';
}

window.addEventListener('resize', () => {
    syncCanvasResolution();
    drawWheel(currentAngle);
    closeSlotEditor(); // 리사이즈되면 편집창 위치가 어긋나므로 그냥 닫음
});

// 편집창 바깥(캔버스도, 편집창 자신도 아닌 곳)을 클릭하면 닫음. 캔버스 클릭은
// 자체 리스너가 편집창을 열거나 다른 조각으로 옮기는 용도라 여기서는 제외.
// 탭이 다시 열릴 때마다 스크립트가 재실행되므로 이전 리스너를 지우고 새로
// 등록해 document에 계속 쌓이지 않게 함.
if (window.__rouletteOutsideClickHandler) {
    document.removeEventListener('click', window.__rouletteOutsideClickHandler);
}
window.__rouletteOutsideClickHandler = function(e) {
    const editor = document.getElementById('rouletteSlotEditor');
    if (!editor || editor.hidden) return;
    if (e.target === canvas || editor.contains(e.target)) return;
    closeSlotEditor();
};
document.addEventListener('click', window.__rouletteOutsideClickHandler);

// 최초 초기화 — DOM이 레이아웃된 후 실행
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        setGlobalMode('mini');
    });
});

return { setMode, spin, resetLunchResult, onEditorInput, pickEditorOption, clearEditorSlot, autoArrange };
})();
