import json, time
CATS = ["إلكترونيات", "موضة", "المنزل والمطبخ", "جمال وعناية", "ألعاب", "رياضة"]
COL = ["#12a35f", "#ff8a1f", "#2563eb", "#db2777", "#7c3aed", "#0891b2"]
def svg(i, t):
    c = COL[i % 6]
    s = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect width='400' height='400' fill='{c}22'/><circle cx='200' cy='180' r='90' fill='{c}'/><text x='200' y='340' font-size='34' text-anchor='middle' fill='{c}' font-family='sans-serif'>{t}</text></svg>"
    return "data:image/svg+xml;utf8," + s.replace("#", "%23").replace("<", "%3C").replace(">", "%3E")
def seed():
    now = int(time.time()); P = {}
    names = ["سماعة بلوتوث", "ساعة ذكية", "شاحن سريع", "تيشيرت قطن", "جاكيت شتوي", "حقيبة ظهر", "طقم أواني", "خلاط كهربائي", "مصباح LED", "كريم ترطيب", "عطر رجالي", "سيروم فيتامين سي", "مكعبات تركيب", "دراجة أطفال", "حصيرة يوجا", "دمبل 10 كجم"]
    for i, n in enumerate(names):
        price = 150 + i * 85
        P[f"p{i}"] = {"name": n, "description": f"{n} بجودة عالية وضمان استبدال.\nمناسب للاستخدام اليومي.", "price": price, "oldPrice": price + 60 if i % 3 == 0 else 0, "category": CATS[i % 6], "images": [svg(i, n)], "stock": None if i % 4 else 5, "active": True, "featured": i < 4, "sold": 30 - i, "ratingSum": (4 + i % 2) * 6, "ratingCount": 6, "createdAt": {"__ts": now - i * 3600}, "specs": [{"k": "الخامة", "v": "ممتازة"}, {"k": "الضمان", "v": "سنة"}], "buyQty": 3 if i == 3 else 0, "payQty": 2 if i == 3 else 0}
    db = {"products": P, "settings": {"store": {"name": "Joo Store", "whatsapp": "201000000000", "freeShippingOver": 1000, "shipping": 60, "deal": {"on": True, "productId": "p1", "endsAt": str(time.strftime("%Y-%m-%dT%H:%M", time.localtime(now + 86400))), "total": 40, "title": "عرض اليوم"}, "categories": [{"name": c, "icon": ""} for c in CATS], "instapay": "joo@instapay", "wallet": "01000000000"}},
          "reviews": {f"r{i}": {"approved": True, "rating": 5 - i % 2, "text": t, "name": n, "productId": f"p{i}", "productName": names[i], "createdAt": {"__ts": now - i}} for i, (t, n) in enumerate([("وصلني في يومين والجودة ممتازة", "أحمد"), ("تعامل محترم وسعر مناسب", "منى"), ("المنتج زي الصور بالظبط", "كريم")])}}
    return json.dumps(db)
