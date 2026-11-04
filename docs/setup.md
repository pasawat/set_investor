# คู่มือตั้งค่า SET News Daily Digest

ระบบนี้รันบน GitHub Actions ทุกเช้าวันทำการ 07:30 น. อ่านข่าวหุ้น/ETF/DR จากหน้า SET News and Alert ผ่านเบราว์เซอร์
สรุปด้วย Claude แล้วส่งสรุปสั้นเข้า LINE พร้อมลิงก์ไปรายงานเต็มที่ branch `data`

## 0. ข้อควรรู้ก่อนใช้งาน (สำคัญ)
- **ไม่อ่านไฟล์แนบ**: `robots.txt` ของโดเมนไฟล์แนบ (`weblink.set.or.th`) ห้ามบอททุกชนิดยกเว้นที่ระบุ ระบบจึงเก็บลิงก์ไฟล์แนบเป็นข้อความเท่านั้น
  ข่าวที่เนื้อหาอยู่ในไฟล์ (เช่น งบการเงิน, ประกาศ DR, มติคณะกรรมการ) จะสรุปได้แค่หัวข้อและแจ้งว่า "เนื้อหาอยู่ในไฟล์แนบ — ไม่ได้อ่าน"
- **ตรวจข้อกำหนดการใช้งาน (ToS) ของ SET** ด้วยตัวคุณเองก่อนเปิดใช้งานจริง และแนะนำให้ติดต่อ SET ขอสิทธิ์อ่านไฟล์แนบ/ช่องทางข้อมูลทางการ
- ระบบไม่ปลอม User-Agent/header ไม่คัดลอก cookie ไม่เรียก API ตรง (มีเทสต์ `tests/compliance.test.js` คอยตรวจ)
- ระบบตรวจ `robots.txt` ทุกรอบ ถ้าหน้าข่าวถูกห้ามขึ้นมา ระบบจะหยุดและแจ้งเตือน

## 1. สร้าง LINE Official Account และ Messaging API
LINE Notify ปิดบริการแล้ว ต้องใช้ Messaging API
1. สร้าง LINE Official Account ที่ https://manager.line.biz/
2. เปิดใช้ Messaging API ที่ Settings > Messaging API (เลือก Provider)
3. ที่ https://developers.line.biz/console/ เปิด Channel ของคุณ แท็บ **Messaging API** > ออก **Channel access token (long-lived)** → นี่คือ `LINE_CHANNEL_ACCESS_TOKEN`
4. แท็บ **Basic settings** เลื่อนลงหา **Your user ID** → นี่คือ `LINE_USER_ID`
5. สแกน QR code ของบัญชี OA เพื่อเพิ่มเป็นเพื่อนด้วยบัญชี LINE ของคุณเอง (ไม่เช่นนั้น push ไม่ถึง)
6. ตรวจโควตาข้อความของแผนที่ใช้อยู่ใน OA Manager (แผนฟรีจำกัดจำนวนข้อความต่อเดือน; ระบบนี้ส่งวันละ 1–5 ข้อความ)

## 2. ตั้งค่า GitHub
Settings > Secrets and variables > Actions
- Secrets: `ANTHROPIC_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID`
- Variable (เมื่อพร้อมเปิดใช้งานจริง): `DIGEST_ENABLED` = `true`

หมายเหตุ: GitHub รัน `schedule` จาก **default branch** เท่านั้น ต้อง merge โค้ดเข้า default branch ก่อนจึงจะรันอัตโนมัติ

## 3. ทดลองรัน (dry-run)
Actions > **dry-run** > Run workflow
- ไม่ส่ง LINE และไม่บันทึก state; บันทึกรายงานไปที่ branch `data` ที่ `reports/dry-run/YYYY-MM-DD.md` และ `.html` (แยกจากรายงานจริง จึงไม่เขียนทับรายงานที่ลิงก์ใน LINE ชี้อยู่)
- ถ้ายังไม่ตั้ง `ANTHROPIC_API_KEY` ระบบจะรันโดยปิด AI (ใช้ข้อความตัดตอนจากต้นฉบับแทน) เพื่อทดสอบท่อฟรี
- ใช้เวลาประมาณ 10–20 นาทีเมื่อมีข่าวเป็นร้อย (เว้นจังหวะระหว่างหน้าตามข้อกำหนด)

## 4. รันจริง
Actions > **daily-digest** > Run workflow (ครั้งแรกให้สั่งเอง) แล้วตรวจข้อความใน LINE หากถูกต้องจึงตั้ง `DIGEST_ENABLED=true`

## 5. รายงานเต็ม
ลิงก์ใน LINE ชี้ไปที่ `https://github.com/<owner>/<repo>/blob/data/reports/<วันที่>.md`
- ถ้า repo เป็น **private** ต้องล็อกอิน GitHub จึงจะเปิดได้ ถ้า **public** ใครก็อ่านรายงานได้
- ตั้งค่าอื่นได้ด้วยตัวแปร `REPORT_BASE_URL`

## 6. ปรับค่า
ตัวแปรสภาพแวดล้อม (ตั้งใน workflow ได้): `GROUP_MIN`, `GROUP_SAMPLE`, `MAX_DETAIL_PAGES`, `MAX_SUMMARY_ITEMS`, `MAX_INPUT_CHARS`,
`LOOKBACK_DAYS`, `DELAY_MS` (ขั้นต่ำ 2500), `RETRIES`, `DETAIL_BUDGET_MS` (งบเวลาอ่านหน้ารายละเอียดต่อรอบ ค่าเริ่มต้น 20 นาที เกินแล้วข่าวที่เหลือแสดงเป็นหัวข้อ+ลิงก์), `SEND_WHEN_EMPTY` (`false` = วันที่ไม่มีข่าวไม่ส่งข้อความ), `MODEL_DEFAULT`, `MODEL_TEMPLATE`

## 7. เมื่อมีปัญหา
- ดูล็อกที่ Actions > รันที่ล้ม > ขั้น **Send digest**
- `robots.txt now disallows…` → SET เปลี่ยนนโยบาย ระบบหยุดโดยตั้งใจ
- `News list did not load with the expected filters` → หน้าเว็บ SET เปลี่ยนโครงสร้าง ต้องแก้ `src/listing.js`
- LINE ส่งไม่ได้ → ตรวจ token/userId และโควตา; state จะไม่ถูกบันทึก รอบถัดไปจึงส่งซ้ำได้
- `อ่านรายการข่าวได้ไม่ครบ` ใน LINE → รายการบนหน้าเว็บเปลี่ยนระหว่างอ่าน ระบบจะไม่ขยับจุดเริ่มช่วงเวลา รอบถัดไปจึงอ่านช่วงเดิมซ้ำและไม่ส่งข่าวที่ส่งไปแล้วซ้ำ
- `รูปแบบวันที่ของข่าวบนหน้าเว็บเปลี่ยน` → SET เปลี่ยนรูปแบบวันที่ ต้องแก้ `src/news.js` ระบบหยุดแทนการส่งว่า "ไม่มีข่าวใหม่"
- รันล้มโดยอ่านหน้ารายละเอียดไม่ได้เลย → ส่งสรุปเท่าที่มีแล้ว job ล้ม state ไม่ขยับ รอบถัดไปลองใหม่
