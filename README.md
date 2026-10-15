# Joo Store — Easy Shopping

متجر عربي RTL كامل: واجهة ثابتة (HTML/CSS/JS بدون build للموقع نفسه) + **Cloudflare Worker** كسيرفر آمن للطلبات + Firebase (Auth/Firestore) + Cloudinary (الصور).

```
public/            الموقع (يتنشر كما هو)  ← صفحات المتجر + لوحة التحكم المخفية + PWA
src/css/           مصدر التصميم (tokens / base / layout / catalog / product / flow)
worker/            السيرفر: الطلبات، المخزون، الكوبونات، الدفع بالبطاقة، SEO
firestore.rules    قواعد Firebase الصارمة (للنسخ واللصق)
tests/             اختبارات السيرفر (Node) واختبارات الواجهة (Playwright)
wrangler.jsonc     إعداد النشر على Cloudflare
```

## ليه فيه Worker؟
أي متجر بيحسب السعر في المتصفح ممكن يتلاعب فيه أي حد من أدوات المطور. هنا المتصفح بيبعت **أرقام المنتجات والكميات فقط**، والسيرفر هو اللي:
- يقرأ السعر الحقيقي من Firestore ويحسب عروض "اشترِ N وادفع M" والشحن بالمحافظة والشحن المجاني.
- يتحقق من الكوبون (فعّال، مش منتهي، الحد الأدنى، عدد مرات الاستخدام) ويحسب الخصم.
- يتحقق من المخزون **ويخصمه داخل transaction** (مفيش بيع زيادة حتى لو اتنين طلبوا آخر قطعة).
- يكتب الطلب + سجل التتبع العام (بدون بيانات شخصية) مرة واحدة.
- عند **إلغاء** الطلب من اللوحة يرجّع المخزون واستخدام الكوبون (مرة واحدة فقط)، ولو اتفتح تاني يحجزهم من جديد.
- بيعمل صفحة المنتج بمعاينة واتساب/فيسبوك (OG + JSON-LD) و`/sitemap.xml` و`/robots.txt` تلقائي.
- قواعد Firebase بتمنع أي عميل من كتابة طلب مباشرة، فالسيرفر هو الباب الوحيد.

## الإعداد (مرة واحدة)
### 1) Firebase
1. Firestore Database ▸ Create database (production mode).
2. Authentication ▸ فعّل **Email/Password** و **Google**، وأضف دومين الموقع في **Authorized domains**.
3. Firestore ▸ Rules: الصق محتوى `firestore.rules` ▸ Publish.
4. Project settings ▸ Service accounts ▸ **Generate new private key** (ملف JSON) — هتحتاجه في الخطوة 2.

### 2) Cloudflare (Worker + الموقع في مكان واحد)
```bash
npm install
npx wrangler login
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT   # الصق محتوى ملف JSON بالكامل
npm run deploy
```
- لو الموقع متربوط من GitHub: Workers & Pages ▸ مشروعك ▸ Settings ▸ Build ▸ **Deploy command** = `npx wrangler deploy`، وأضف Secret باسم `FIREBASE_SERVICE_ACCOUNT` من Settings ▸ Variables and Secrets.
- تأكد إن `/api/health` بيرجع `"configured": true`.
- **مهم:** ضيف Rate limiting rule على `/api/*` من Cloudflare ▸ Security ▸ WAF (مثلاً 20 طلب/دقيقة للـ IP) — الحماية داخل الكود best-effort فقط.

### 3) أول دخول للوحة (المالك)
افتح `/hq-aw2yy2c0.html`، سجّل حساب، واضغط **اجعلني المالك** (أول واحد فقط، بعدها الباب بيتقفل). المشرفون يتضافوا من تبويب "المشرفون" وبتحدد صلاحية كل واحد (طلبات / منتجات / كوبونات / تقييمات / دعم / إعدادات).
غيّر اسم ملف اللوحة لأي اسم عشوائي يبدأ بـ `hq-` وماتحطوش في أي رابط.

### 4) الدفع بالبطاقة (اختياري — Paymob)
أضف الأسرار: `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC` (من لوحة Paymob)، وفي Paymob اضبط:
- **Transaction processed callback**: `https://دومينك/api/paymob/webhook`
- **Transaction response callback**: `https://دومينك/thanks`
بعدها خيار "بطاقة" يظهر في الدفع تلقائيًا (ويتقفل من الإعدادات ▸ طرق الدفع). الطلب بيتأكد أوتوماتيك لما Paymob يرجّع نجاح بتوقيع HMAC صحيح ومبلغ مطابق.
> الكود مكتوب حسب توثيق Paymob Accept لكن **لم يُجرَّب مع مفاتيحك الحقيقية** — جرّب عملية بمبلغ صغير قبل الإطلاق.

## التصميم
`npm run build:css` يجمّع `src/css/*.css` في `public/assets/css/style.css`. الألوان والخطوط والأبعاد كلها في `src/css/00-tokens.css`. الهوية: أخضر Joo للبنية، وأحمر برتقالي للأسعار والعروض فقط، وأسطح بيضاء مسطحة بحدود رفيعة.
الخطوط: Baloo Bhaijaan 2 (العناوين والأسعار) + IBM Plex Sans Arabic (النص).

## الاختبارات
```bash
npm test                 # السيرفر: 14 اختبار (أسعار، مخزون، كوبونات، صلاحيات، OG...)
cd public && python3 -m http.server 8765 &
python3 tests/e2e/storefront.py   # الواجهة: 44 فحص (سلة، دفع، حساب، لوحة، عدم وجود overflow على 360/390px)
```
الاختبارات بتستخدم mock لـ Firebase (`tests/mock`) فمش بتلمس بياناتك.

## ملاحظات أمان
- `firestore.rules`: الطلبات والتتبع **للقراءة فقط** من العميل؛ الكتابة من الـ Worker. نسخة بدون Worker في `firestore.rules.no-worker` (الأسعار فيها بتتحسب في المتصفح، **غير موصى بها**).
- `_headers` فيه CSP في وضع **Report-Only** (بيسجل المخالفات في console من غير ما يكسر حاجة). بعد ما تتأكد إن تسجيل الدخول والصور شغالين من غير تحذيرات، غيّر الاسم لـ `Content-Security-Policy` لتفعيله.
- مفاتيح Firebase في الواجهة عامة بطبيعتها. أمّن Cloudinary preset (صيغ الصور وحد الحجم). فعّل **Firebase App Check** لو عايز حماية أكتر من الاستخدام الآلي.

## مش موجود حاليًا (للأمانة)
- لا يوجد خصم تلقائي من بوابة دفع غير Paymob، ولا ربط شركات شحن.
- الصور المعروضة في الاختبارات placeholders؛ المنتجات الحقيقية تترفع من اللوحة.
- لم يُختبر مع Firebase/Cloudinary/Paymob الحقيقيين (بيئة التطوير مالهاش وصول لحساباتك).
