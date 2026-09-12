// 기획서 15번: 문의하기(inquiries)는 1:1 비공개가 아니라 전체 공개
// 게시판이라, 답글은 앱 안에 "답글 쓰기" 버튼을 두지 않고(코드 안에 숨긴
// 관리자 버튼은 진짜 보안이 아님) 이 스크립트로만 답니다. Firestore 보안
// 규칙에서 inquiries의 update/delete를 클라이언트에 전면 차단해두면,
// 이 서비스 계정 키를 가진 사람(본인)만 답글을 달 수 있게 됩니다
// (Admin SDK는 보안 규칙을 우회하므로 update 차단과 무관하게 동작함).
//
// 사전 준비: export-pending-edits.js와 동일한 서비스 계정 키 필요
// (기본 경로: tools/serviceAccountKey.json — 발급 방법은 그 스크립트
// 상단 주석 참고)
//
// 사용법:
//   1) 아직 답글 없는 문의 목록 확인
//      node tools/reply-inquiry.js --list
//
//   2) 답글 작성
//      node tools/reply-inquiry.js --id <문서ID> --reply "답변 내용"
//
// ⚠️ reply는 한 번 달면 앱에 바로 노출됩니다(실시간 구독). 내용을 다시
// 확인한 뒤 실행하세요.

const fs = require('fs');
const path = require('path');

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        key: path.join(__dirname, 'serviceAccountKey.json'),
        list: false,
        id: null,
        reply: null,
    };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--key') opts.key = path.resolve(args[++i]);
        else if (args[i] === '--list') opts.list = true;
        else if (args[i] === '--id') opts.id = args[++i];
        else if (args[i] === '--reply') opts.reply = args[++i];
    }
    return opts;
}

async function main() {
    const opts = parseArgs();

    if (!fs.existsSync(opts.key)) {
        console.error(`서비스 계정 키가 없습니다: ${opts.key}`);
        console.error('tools/export-pending-edits.js 상단 주석의 발급 방법을 참고해주세요.');
        process.exit(1);
    }

    const admin = require('firebase-admin');
    const serviceAccount = require(opts.key);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();

    if (opts.list) {
        console.log('답글 없는 문의 목록 조회 중...\n');
        const snap = await db.collection('inquiries').orderBy('createdAt', 'desc').limit(50).get();
        const unanswered = snap.docs.filter((doc) => !doc.data().reply);

        if (unanswered.length === 0) {
            console.log('최근 50건 중 답글 없는 문의가 없습니다.');
        } else {
            unanswered.forEach((doc) => {
                const d = doc.data();
                const date = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : '(시각 미상)';
                console.log(`[${doc.id}] (${d.category || '?'}) ${d.nickname || '익명'} · ${date}`);
                console.log(`  ${d.content || ''}\n`);
            });
            console.log(`총 ${unanswered.length}건. 답글을 달려면:`);
            console.log('  node tools/reply-inquiry.js --id <위 대괄호 안 ID> --reply "답변 내용"');
        }
        process.exit(0);
    }

    if (!opts.id || !opts.reply) {
        console.error('사용법: node tools/reply-inquiry.js --id <문서ID> --reply "답변 내용"');
        console.error('또는:  node tools/reply-inquiry.js --list');
        process.exit(1);
    }

    const docRef = db.collection('inquiries').doc(opts.id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        console.error(`문의 문서를 찾을 수 없습니다: ${opts.id}`);
        process.exit(1);
    }

    const before = docSnap.data();
    console.log(`[${opts.id}] (${before.category || '?'}) ${before.nickname || '익명'}`);
    console.log(`  질문: ${before.content || ''}`);
    if (before.reply) console.log(`  ⚠️ 기존 답글을 덮어씁니다: ${before.reply}`);

    await docRef.update({
        reply: opts.reply,
        repliedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`\n답글 등록 완료: ${opts.reply}`);
    process.exit(0);
}

main().catch((e) => {
    console.error('답글 등록 실패:', e);
    process.exit(1);
});
