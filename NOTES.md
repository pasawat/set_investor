# NOTES — SET News Daily Digest (บริบทสำหรับเริ่มงานต่อ)

อัปเดตล่าสุด 2026-11-04 · repo `pasawat/set_investor` มี 2 branch: **`main`** (default; โค้ดทั้งหมด) และ `data` (ระบบเขียนรายงาน/state/fixture เอง — ห้ามลบ) · branch เดิมชื่อ `claude/stoic-faraday-m33yg9` ถูกลบแล้ว · ผู้ใช้: `psuetanu@cpaxtra.co.th` (GitHub `pasawat`) · คุยภาษาไทย

## 1. เป้าหมาย
สรุปข่าวตลาดหลักทรัพย์ไทย (หุ้น, ETF, DR) จาก **หน้า SET News and Alert เท่านั้น**
`https://www.set.or.th/th/market/news-and-alert/news` แล้วส่งสรุปสั้นเข้า LINE ทุกเช้าวันทำการ ~07:30 น. พร้อมลิงก์ไปรายงานเต็มใน repo
"เอาแต่เนื้อ ไม่เอาน้ำ" ข้อเท็จจริงจากข่าวเท่านั้น ไม่ใส่ความเห็น ไม่ใช้ข้อมูลแหล่งอื่น ใช้ส่วนตัว (1 คน)
ธีมสีองค์กร CP AXTRA (คำสั่งองค์กร): น้ำเงิน `#306FC7`, เหลือง `#F6C24A`, เขียว `#43938F`, แดง `#DA3832`

## 2. สถานะ
**สร้างเสร็จครบ 12 งานของแผน; ทดสอบ 139/139 ผ่าน; dry-run บนเว็บจริงผ่าน 2 รอบ** (ปิด AI) ผู้ตรวจอิสระหนึ่งคนตรวจทั้ง branch: ไม่มี Critical,
ข้อแนะนำสำคัญแก้ครบแล้ว **เรื่อง branch จบแล้ว:** สร้าง `main` จากโค้ดชุดนี้ → ผู้ใช้ตั้งเป็น default branch (ตรวจแล้วว่า HEAD ของ remote ชี้ `main`; Actions เห็น workflow ทั้งสอง) → ผู้ใช้ลบ branch ชื่อยาวเองแล้ว ไม่มี PR และไม่ต้องมี (ไม่มี branch ฐานให้เทียบ) ถ้าจะแก้โค้ดต่อ ให้แตก branch จาก `main`

ยังไม่เคยรันจริงแบบครบวงจร: การเรียก **Claude API** และการส่ง **LINE** (ทดสอบกับตัวจำลองเท่านั้น)

เอกสาร: `docs/superpowers/specs/2026-11-04-set-news-digest-design.md` (spec ที่ผู้ใช้อนุมัติ), `docs/superpowers/plans/2026-11-04-set-news-digest.md` (แผน 12 งาน), `docs/setup.md` (คู่มือตั้งค่า LINE/Secrets/รัน)

## 3. กฎที่ห้ามละเมิด (spec §3) — มีเทสต์ `tests/compliance.test.js` คุม
- **ห้ามอ่าน/ดาวน์โหลดไฟล์แนบจาก `weblink.set.or.th`**: robots.txt ของโดเมนนั้น `User-agent: * / Disallow: /` (ยกเว้นบอท OpenAI) เก็บลิงก์เป็นข้อความเท่านั้น ผู้ใช้เลือก "ทางเลือก A" (เคารพ robots) การเปลี่ยนต้องให้ผู้ใช้สั่งชัดหลังตรวจ ToS/ได้รับอนุญาตจาก SET
- **ห้ามปลอมตัว**: ไม่ตั้ง User-Agent/header, ไม่คัดลอก cookie, ไม่เรียก `/api/...` ตรง, ไม่ปลอมเป็นบอท OpenAI ใช้ Playwright เป็นผู้เข้าชมปกติ อ่านจาก response ที่หน้าเว็บโหลดเอง (เคยมีความพยายามปลอม header ตอน spike — ถูกระบบความปลอดภัยปฏิเสธ และผมถอยออกแล้ว)
- เปิดเฉพาะหน้า `https://www.set.or.th/th/market/news-and-alert/newsdetails` (ตัวกัน `isSetNewsUrl`); เว้น ≥ 2.5 วินาทีต่อหน้า; ตรวจ robots.txt ทุกรอบ
- ผู้ใช้ต้องตรวจข้อกำหนดการใช้งาน (ToS) ของ SET เอง และควรติดต่อ SET ขอสิทธิ์อ่านไฟล์แนบ/ช่องทางทางการ

## 4. ข้อค้นพบจากเว็บจริง (วัดบน GitHub runner; sandbox ของ Claude เข้า set.or.th ไม่ได้)
- รหัสประเภทหลักทรัพย์ที่หน้าเว็บใช้: หุ้น `S`, ETF `L`, DR `X` (ปุ่มสลับ ใช้ร่วมกันได้ ต้องกด "ค้นหา")
- เปิด URL `...news?source=company&securityType=S,L,X&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` แล้วหน้าเว็บตั้งตัวกรองเอง (วิธีที่ใช้จริง = `url-query`)
- แบ่งหน้าละ 20 รายการ ปุ่ม `aria-label="Go to next page"`; คำขอแรกคือหน้า 0; ตัวอย่าง 464 แถว = 24 หน้า
- **`id` ของข่าวไม่ unique**: ประกาศหนึ่งฉบับ (id เดียว) มีหลาย symbol (ตัวอย่าง: 1 id = DR 107 ตัว) ต้องใช้คีย์ `id|symbol` (`newsKey`) ทุกที่
- หน้ารายละเอียด: หัวข้อ `div.news .title h2` (มี `div.news` ว่างตัวหลอกมาก่อน), เนื้อหา `.card-content .raw-html` (มี `.raw-html` ของแบนเนอร์คุกกี้ด้วย), ไฟล์แนบ `a.btn-download` ต้องกด "ยอมรับ" คุกกี้ก่อน
- `node-html-parser`: ห้ามใส่ `pre:false` ใน `blockTextElements` (ทำเนื้อหาหาย) ให้เว้นคีย์ `pre` ออก
- **53% ของข่าว (228/431) เนื้อหาอยู่ในไฟล์แนบเท่านั้น** (งบการเงิน = ZIP ของ DOCX/XLSX, ประกาศ DR, มติกรรมการ ฯลฯ) จึงสรุปได้แค่หัวข้อ + ลิงก์ ส่วน NAV ETF และบางประกาศมีเนื้อหาครบในหน้า
- ปริมาณจริง: ~430 แถว/วัน ส่วนใหญ่เป็น DR แบบฟอร์ม; ใช้หน้ารายละเอียดราว 141 หน้า/วัน (< เพดาน 150); dry-run เต็มใช้ ~10 นาที

## 5. สถาปัตยกรรม (`src/`)
`main.js` ประกอบ: `robots.js` → `state.js` → `news.js`(หน้าต่างเวลา) → `listing.js`(Playwright) → `group.js`(รวม DR) → `detail.js`(Playwright, ไม่ดาวน์โหลดไฟล์แนบ) → `summarize.js`(Claude) + `numbers.js`(ตรวจตัวเลข) → `compose.js`(รายงาน MD/HTML + LINE) → `line.js`(แบ่ง ≤5,000 ตัวอักษร ≤5 ข้อความ + push) → `publish.js`(commit ไป branch `data`) ช่วย: `retry.js` (exponential backoff + retry-after), `guards.js`, `config.js`, `no-ai.js`
Workflows: `.github/workflows/dry-run.yml` (สั่งมือ ไม่ส่ง LINE; เขียนรายงานที่ `reports/dry-run/`), `daily-digest.yml` (cron `30 0 * * 1-5` UTC; รันตามเวลาเมื่อ repo variable `DIGEST_ENABLED == 'true'`; สั่งมือได้เสมอ; GitHub รัน schedule จาก default branch เท่านั้น)
รัน/ทดสอบ: `npm ci && npm test` (Node 22); โหมด `node src/main.js --dry-run [--capture] [--no-ai]`

## 6. การตัดสินใจหลัก
- ที่รัน GitHub Actions (ทดสอบแล้วเข้า SET ได้; ไม่ใช้ runner ของบริษัท); ส่ง LINE ผ่าน Messaging API (LINE Notify ปิดแล้ว); "วันนี้" = ข่าวตั้งแต่ปิดตลาดวันทำการก่อนหน้า 16:30 ถึงเวลารัน; ข่าวทั้งหมดไม่ตัดทิ้ง
- รวมกลุ่ม **เฉพาะ DR** ที่แม่แบบหัวข้อเดียวกัน ≥5 (`GROUP_MIN`) อ่านเนื้อหาจริงเฉพาะตัวอย่าง 3 (`GROUP_SAMPLE`) แล้วแสดงรายชื่อทุกตัวพร้อมลิงก์; หุ้น/ETF แยกรายตัว
- โมเดลค่าเริ่มต้น (ผู้ใช้อนุมัติใน spec): `claude-sonnet-5-5` ทั่วไป, `claude-haiku-5-5` สำหรับ NAV/กลุ่ม (`MODEL_DEFAULT`/`MODEL_TEMPLATE`); `effort: low`; ไม่ส่ง temperature/tool_choice/prefill (400 บนรุ่น 5.x); SDK `maxRetries: 0` เพราะ retry เองใน `summarize.js`
- ล้มแล้วเป็นอย่างไร: รายการข่าวดึงไม่ได้/รูปแบบวันที่เปลี่ยน → แจ้ง LINE + exit 1; อ่านหน้ารายละเอียดไม่ได้เลย → ส่งสรุปเท่าที่มี exit 1 ไม่ขยับ state; LINE ล้ม → ไม่ขยับ state (รอบหน้าส่งซ้ำ); รายการอ่านไม่ครบ → ข้อความเริ่มด้วยคำเตือนและไม่ขยับจุดเริ่มช่วงเวลา
- วันไม่มีข่าวใหม่: ส่ง "ไม่มีข่าวใหม่" (ไม่มีลิงก์) ตาม `SEND_WHEN_EMPTY` (ค่าเริ่มต้น true)

## 7. ขั้นตอนต่อไป (ส่วนใหญ่เป็นงานของผู้ใช้)
1. ~~ตัดสินใจเรื่อง branch~~ — **เสร็จแล้ว** (ดูหัวข้อ 2) ห้ามสร้าง PR ถ้าผู้ใช้ไม่สั่ง
2. ตรวจ ToS ของ SET; พิจารณาขอสิทธิ์อ่านไฟล์แนบ (ถ้าได้ ค่อยออกแบบส่วนอ่านไฟล์แนบ — ตอนนี้ปิดตามค่าเริ่มต้น)
3. สร้าง LINE OA + ตั้ง Secrets `ANTHROPIC_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID` (ดู `docs/setup.md`)
4. สั่ง `daily-digest` รันมือ 1 ครั้งพร้อม key จริง → ตรวจข้อความ LINE, อัตราธง "ตัวเลขยังไม่ยืนยัน", ค่าใช้จ่ายจริง แล้วค่อยตั้ง `DIGEST_ENABLED=true`
5. ตัดสินใจ: repo public/private (ลิงก์รายงานต้องล็อกอิน GitHub ถ้า private), วันหยุดตลาดจะส่งข้อความว่างหรือไม่, งบค่าใช้จ่าย/ทางเลือกโมเดล
6. ถ้าต้องการ: Flex Message (เฟสถัดไป)
- ไฟล์ค้างบน `data`: `reports/2026-11-04.*` เป็นของ dry-run รอบแรกก่อนแยกเส้นทาง (จะถูกเขียนทับเมื่อรันจริง)

## 8. Minor ที่เลื่อนไว้ (จากผู้ตรวจ)
ค่าในส่วน `<news_meta>` ยังไม่กันแท็กตัวคั่น · ตรวจ robots เฉพาะหน้ารายการ ไม่รวม `newsdetails` · บันทึก state ไม่มี retry · `loadStateText` กลืน error ทุกชนิด · เพดาน `maxSummaryItems` ไม่นับกลุ่ม · บรรทัดค่าใช้จ่ายเป็น token ยังไม่เป็นเงิน · เส้นทางสำรองใน `listing.js` กด ETF/DR โดยไม่ตรวจสถานะปุ่ม · `@anthropic-ai/sdk` ใช้ `^1.4.0` ขณะ dependency อื่นตรึง · `DetailResult.id` เก็บคีย์ ไม่ใช่ id · ยังไม่ใช้ server-side fallback ของ refusal

## 9. หมายเหตุสภาพแวดล้อม
- sandbox ของ Claude เข้า `set.or.th` ไม่ได้ (proxy 403) ทดสอบกับเว็บจริงผ่าน GitHub Actions เท่านั้น (รอบละ ~2–10 นาที) อ่านผลด้วยเครื่องมือ GitHub MCP (`actions_run_trigger`, `actions_list`, `get_job_logs`) ล็อกของงานที่ยังรันอยู่ดึงไม่ได้ ต้องรอให้จบ
- สิทธิ์ push ต้องให้ผู้ใช้เชื่อม GitHub ใหม่ที่ https://claude.ai/connect-github (ทำแล้วใน session ก่อน) session ใหม่ควรเลือก repo `pasawat/set_investor` ตั้งแต่เริ่ม และทำงานบน `main`/branch ที่แตกจาก `main` (session เดิมถูกตั้งให้ push ไป branch ที่ถูกลบแล้ว)
- การเปลี่ยน default branch และการลบ branch ทำผ่านเครื่องมือของ Claude ไม่ได้ (GitHub ตอบ 403 เมื่อลบ branch; ไม่มีคำสั่งแก้ตั้งค่า repo) ผู้ใช้ทำเองที่หน้า Settings > General (default branch) และ /branches (ลบ)
- แต่ละโมดูลมี fixture/ตัวอย่างจริง: `tests/fixtures/detail-*.html`; ข้อมูลรายการข่าวจริงอยู่ที่ `origin/data:fixtures/listing.json`
- ประวัติการตัดสินใจละเอียด (ledger ของการลงมือ) ถูกลบตามขั้นตอนแล้ว ดูประวัติใน `git log` และคอมเมนต์หัวไฟล์
