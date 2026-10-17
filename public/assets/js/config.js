// ===== إعدادات Joo Store =====
export const firebaseConfig = {
  apiKey: "AIzaSyCoMhvmbexOGrE8kDJOW8466fwMeFQHqJ0",
  authDomain: "joo-store-cfcad.firebaseapp.com",
  projectId: "joo-store-cfcad",
  storageBucket: "joo-store-cfcad.firebasestorage.app",
  messagingSenderId: "141087580737",
  appId: "1:141087580737:web:cdb07ff293a40197abdcc0",
  measurementId: "G-KSXHNVM560",
};

// Cloudinary: Cloud name من لوحة Cloudinary (Dashboard ▸ API Keys)
// الـ preset لازم يكون Unsigned (وهو كذلك: hilmogun)
export const CLOUDINARY = {
  cloudName: "v6sc11iq",
  uploadPreset: "hilmogun",
  folder: "joo-store",
};

export const STORE = {
  name: "Joo Store",
  currency: "ج.م",
  // قيم افتراضية تتغير من لوحة التحكم (الإعدادات)
  defaults: {
    name: "Joo Store", announcement: "", whatsapp: "", phone: "", email: "", address: "",
    social: { facebook: "", instagram: "", tiktok: "" },
    shipping: 60, freeShippingOver: 0, shippingByGov: {}, deliveryNote: "",
    pay: { cod: true, transfer: true, card: true }, instapay: "", wallet: "",
    returnDays: 14,
    returnsText: "تقدر تستبدل أو ترجّع المنتج خلال مدة الاستبدال من تاريخ الاستلام، بشرط يكون بحالته الأصلية وبالعبوة.\nلو وصلك منتج غلط أو فيه عيب تصنيع، الاستبدال أو الاسترجاع علينا بالكامل.\nابدأ الطلب من حسابك ثم الدعم، برقم الطلب.",
    aboutText: "Joo Store متجر بيجمع احتياجاتك في مكان واحد، بأسعار واضحة وطلب بيخلص في دقايق.",
    faq: [{ q: "إزاي أدفع؟", a: "الدفع عند الاستلام، أو تحويل لو متاح وقت الطلب." }, { q: "إزاي أتابع طلبي؟", a: "من حسابي ثم طلباتي، وتقدر تتابعه بكود الطلب كمان." }],
    hero: { title: "اطلب النهارده\nواستلم عند بابك", sub: "كل اللي محتاجه في مكان واحد.", cta: "شوف المنتجات", ctaLink: "shop.html", image: "" },
    sections: { categories: true, featured: true, latest: true, top: true, reviews: true, fab: true },
    support: { greeting: "أهلاً بيك! اكتب مشكلتك وهنرد عليك هنا.", hours: "", quick: [] },
    categories: [],
    announcementCode: "",
    heroCards: [],
    heroSlides: [],
    deal: { on: false, productId: "", endsAt: "", total: 0, title: "عرض اليوم" },
  },
};

export const GOVERNORATES = [
  "القاهرة","الجيزة","الإسكندرية","القليوبية","الشرقية","الدقهلية","الغربية","المنوفية","كفر الشيخ","البحيرة",
  "دمياط","بورسعيد","الإسماعيلية","السويس","شمال سيناء","جنوب سيناء","الفيوم","بني سويف","المنيا","أسيوط",
  "سوهاج","قنا","الأقصر","أسوان","البحر الأحمر","الوادي الجديد","مطروح",
];

export const ORDER_STATUS = {
  new: "جديد",
  confirmed: "تم التأكيد",
  shipped: "في الطريق",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

// خطوات تتبع الطلب (بالترتيب)
export const ORDER_FLOW = [
  ["new", "تم استلام الطلب", "وصلنا طلبك وبنراجعه"],
  ["confirmed", "تم تأكيد الطلب", "جهّزنا طلبك للشحن"],
  ["shipped", "في الطريق إليك", "الطلب مع مندوب التوصيل"],
  ["delivered", "تم التسليم", "الحمد لله على السلامة"],
];

// كود الطلب: 10 حروف/أرقام عشوائية (من غير حروف متشابهة)
export function newOrderCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(r, (n) => a[n % a.length]).join("");
}
export const fmtCode = (id = "") => (id.length === 10 ? `${id.slice(0, 5)}-${id.slice(5)}` : id.slice(0, 6).toUpperCase());
export const cleanCode = (v = "") => String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
