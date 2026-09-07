# 맛쩜 프로젝트 구조

## 📁 파일 구조
각 탭은 `이름-tab.html`(마크업) + `css/이름-tab.css`(스타일) + `js/이름-tab.js`(로직) 3개로 나뉘어 있습니다.
`-tab.html`은 [index.html](index.html)의 `loadTab()`이 fetch로 통째로 받아 `#content-area`에 끼워 넣고, 그 안의 `<link>`/`<script src>`가 각각 css/js 파일을 불러오는 구조입니다(탭을 오갈 때마다 매번 새로 fetch되고, `<script>`는 강제로 재실행됨 — 그래서 각 js 파일의 최상위 코드가 탭 진입마다 처음부터 다시 돎).

```
/project-root
│
├── index.html                 # 앱 셸 — 탭 네비게이션, 공용 데이터 로더, PC 좌측 패널
├── map-tab.html               # 지도 탭 마크업 (즐겨찾기 탭도 이 파일을 재사용)
├── calorie-tab.html           # 랭킹·피드 탭 마크업
├── game-tab.html              # 점심 룰렛 탭 마크업
├── contact-tab.html           # 설정 탭 마크업
├── privacy-policy.html        # 개인정보처리방침 (독립 정적 페이지)
│
├── /css                       # 탭별 스타일 (각 -tab.html의 <link>가 로드)
│   ├── index.css
│   ├── map-tab.css
│   ├── calorie-tab.css
│   ├── game-tab.css
│   └── contact-tab.css
│
├── /js                        # 탭별 로직 (각 -tab.html의 <script src>가 로드)
│   ├── index.js
│   ├── map-tab.js
│   ├── calorie-tab.js
│   ├── game-tab.js
│   └── contact-tab.js
│
├── /assets/js
│   ├── shared.js               # 여러 탭 공용 유틸(getDistanceKm 등) — index.html에서 한 번만 로드
│   └── MarkerClustering.js     # 네이버 공식 마커 클러스터링 라이브러리
│
├── /Image
│   ├── /Ads                    # 하단/상단 광고 배너 이미지 (ad01~06.jpg)
│   └── /icons                  # 홈 화면 추가용 앱 아이콘(manifest.json에서 참조)
│
├── /tools                      # 관리자용 Node 스크립트 (식당 데이터 수집/정리, pendingEdits 내보내기 등)
│
└── /data
    └── restaurants.xlsx        # 식당 데이터 (브라우저에서 SheetJS로 직접 파싱)
```

**탭을 수정할 때**: 디자인/색상만 바꾸면 `css/`, 동작/로직만 바꾸면 `js/`, 새 버튼·영역처럼 마크업 자체를 바꾸면 `-tab.html`만 열어서 고치면 됩니다 — 예전엔 스타일+마크업+로직이 파일 하나(최대 1800줄)에 다 섞여 있어서 작은 수정에도 전체를 다 읽어야 했습니다.

## 🚀 사용 방법

### 로컬 서버 실행
이 프로젝트는 `fetch()` API를 사용하므로 **로컬 서버**가 필요합니다.

**방법 1: Python 서버**
```bash
# Python 3
python -m http.server 5500

# 브라우저에서 http://localhost:5500 접속
```

**방법 2: VS Code Live Server**
- VS Code에서 `index.html` 우클릭
- "Open with Live Server" 선택

**방법 3: Node.js http-server**
```bash
npx http-server -p 5500
```

## 📝 수정 가이드

### 지도 관련 수정
- 스타일/색상 → `css/map-tab.css`
- 마커 아이콘, GPS, 리뷰, 정보 수정 제안 등 동작 → `js/map-tab.js`
- 새 버튼·영역 등 마크업 → `map-tab.html`

**예시:**
- 마커 아이콘 변경 → `js/map-tab.js`의 `createIcon()` 함수
- 필터 버튼 스타일 → `css/map-tab.css`의 `.filter-item`
- 홈 버튼 위치 → `js/map-tab.js`의 `goHome()` 함수
- 검색 기능 수정 → `js/map-tab.js`의 `filterData()` 함수

### 랭킹·피드 / 룰렛 / 설정 탭 수정
같은 규칙으로 `css/calorie-tab.css`·`js/calorie-tab.js`, `css/game-tab.css`·`js/game-tab.js`, `css/contact-tab.css`·`js/contact-tab.js` 중 해당하는 파일을 고치면 됩니다.

### 여러 탭에서 같이 쓰는 로직
`getDistanceKm` 같은 공용 함수는 `assets/js/shared.js`에 있습니다. index.html이 이 파일을 한 번만 로드해두므로, 각 탭 js 파일에서는 별도 선언 없이 그냥 `getDistanceKm(...)`로 바로 쓰면 됩니다. 여러 탭에서 똑같은 함수가 또 필요해지면, 각 파일에 복붙하지 말고 이 파일에 추가하세요.

### 식당 데이터 관리
→ `data/restaurants.xlsx` 파일 수정 (엑셀에서 직접 편집 후 저장하면 됨)

**엑셀 컬럼 구조** (1행: 헤더, 2행부터 데이터):
| id | 이름 | 지역 | 주소 | lat | lng | 설명 | 가격 | 영업 시간 | 인스타 | 카카오 | 노출여부 |
|---|---|---|---|---|---|---|---|---|---|---|---|

`lat`/`lng`는 위도/경도를 직접 숫자로 입력 (네이버 지도 등에서 좌표를 확인해 입력). 컬럼 매핑은 [index.html](index.html)의 `getRestaurantsData()` 안 `headerMap` 참고(모든 탭이 이 함수 하나로 공용 캐싱된 데이터를 가져다 씀).

⚠️ **행을 삭제하거나 순서를 바꾸지 마세요** — 식당 `id`가 행 위치 기준으로 자동 부여되고 즐겨찾기(localStorage)·한줄평/인기도(Firestore)가 이 id로 저장돼 있어서, 행이 밀리면 기존 사용자 데이터가 다른 식당 것으로 뒤바뀔 수 있습니다. 특정 식당을 숨기고 싶으면 행을 지우지 말고 `노출여부` 칼럼에 `비공개(사유)`처럼 "비공개"로 시작하는 값을 넣으세요.

### 새 탭 추가하기

1. **마크업 + css/js 파일 생성**
   ```html
   <!-- newtab-tab.html -->
   <link rel="stylesheet" href="css/newtab-tab.css">
   <div id="newtab-container">
     <!-- 내용 -->
   </div>
   <script src="js/newtab-tab.js"></script>
   ```
   ```css
   /* css/newtab-tab.css */
   #newtab-container { /* ... */ }
   ```
   ```js
   // js/newtab-tab.js — 탭을 오갈 때마다 이 파일 전체가 처음부터 다시 실행됨.
   // document에 리스너를 등록한다면 반드시 기존 걸 지우고 다시 등록할 것
   // (아래 "탭 재진입 시 주의할 점" 참고).
   (function() {
     // 로직
   })();
   ```

2. **index.html에 탭 버튼 추가** (`#tab-nav` 안, 다른 `.tab-item`과 같은 자리에)
   ```html
   <div class="tab-item" data-tab="newtab">
     <svg class="tab-icon">...</svg>
     <div class="tab-text">새 탭</div>
   </div>
   ```
   `data-tab` 값이 곧 `newtab-tab.html`을 가리키는 파일명 접두어가 됩니다 (`loadTab()`이 `${tabName}-tab.html`을 fetch함).

### 탭 재진입 시 주의할 점 (중요)
`loadTab()`은 다른 탭 갔다가 돌아올 때마다 해당 탭의 `<script>`를 강제로 재실행합니다. 그래서:
- `document`나 `window`에 등록하는 이벤트 리스너(`addEventListener`)는 **기존 것을 지우고 다시 등록**해야 합니다. 안 그러면 탭을 오갈 때마다 리스너가 계속 쌓여서, 클릭/입력 한 번에 여러 번 반응하는 버그가 생깁니다(실제로 한줄평 Enter 등록이 이 문제로 중복 제출됐던 적 있음 — `js/map-tab.js`의 `window.__reviewEnterKeyHandler` 패턴 참고).
- GPS 조회처럼 시간이 걸리는 초기화는 `window.__무언가Promise` 형태로 캐싱해서, 탭 재방문마다 다시 기다리지 않게 하세요(`js/map-tab.js`의 `getCachedInitialGps` 참고).

## 🔧 기술 스택
- HTML5 / CSS3 / JavaScript (Vanilla)
- 네이버 지도 API v3 (Web Dynamic Map + Geocoder)
- SheetJS (엑셀 데이터 파싱)
- Firebase Firestore (한줄평/인기도/문의)

## 🗺️ 네이버 지도 API 키 설정
지도는 [네이버 지도 API v3](https://navermaps.github.io/maps.js.ncp/)를 사용하며, [index.html](index.html)의 `<script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=...">` 태그에 발급받은 **Client ID**를 넣어야 지도가 표시됩니다.

**발급 방법**
1. [네이버 클라우드 플랫폼](https://www.ncloud.com) 가입 (무료)
2. 콘솔 → Application Services → Maps → Application 등록
3. 등록한 Application에서 **Web Dynamic Map**, **Geocoding** 서비스 활성화 (Dynamic Map 체크 안 하면 429 오류 발생)
4. Service URL(허용 도메인)에 배포 주소 등록 — 지금은 `https://woodyaudio.github.io`, 나중에 커스텀 도메인을 사면 콘솔에서 추가만 하면 됨 (코드 변경 불필요)
5. 발급된 Client ID를 `index.html`의 `ncpKeyId=` 뒤에 그대로 입력 (공개용 클라이언트 키라 코드에 노출돼도 안전)

Application 이름은 `Client ID`에 대응하는 NCP 내부 식별자일 뿐 사용자에게 노출되지 않으며, 영문자/숫자/하이픈만 허용됩니다(한글 불가).

무료 이용량은 등록 즉시 콘솔에서 실측 확인 가능 (2026-09-05 기준, 이 프로젝트 계정): Geocoding 월 3,000,000회, Dynamic Map 월 6,000,000회. 로컬 개발 중 `localhost`에서도 지도를 띄우려면 콘솔의 Service URL 목록에 `http://localhost:5500`(또는 사용하는 포트)을 추가로 등록하면 됩니다.

## 💡 팁
- 브라우저 캐시 때문에 변경사항이 안 보이면 `Ctrl+Shift+R` (강력 새로고침)
- 지도가 제대로 안 보이면 개발자도구(F12) → Console 탭에서 에러 확인
- 모바일 테스트는 개발자도구 → Toggle device toolbar (Ctrl+Shift+M)
