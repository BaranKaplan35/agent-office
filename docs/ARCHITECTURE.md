# AgentOffice — Mimari

Bu belge projeyi baştan sona, sade bir dille anlatır: bir görev nasıl ilerler, parçalar
neden böyle ayrıldı, hangi kararın arkasında hangi gerekçe var. Sonunda olası mülakat
soruları ve kısa cevapları var.

## Bir cümlede proje

Kullanıcı bir görev yazar; **koordinatör** ajan görevi alt görevlere böler; **işçi**
ajanlar raporlarını yazar; kullanıcı her raporu **onaylar ya da notla geri gönderir**;
hepsi onaylanınca koordinatör onaylı işleri **tek bir final belgede birleştirir**.
İzometrik 3D ofis bu süreci canlı gösterir; ama iş akışının kendisi ofise bağlı değildir.

## Büyük resim

```
Tarayıcı (React)                         Sunucu (Express)
┌──────────────────────────┐   REST     ┌──────────────────────────────────┐
│ Paneller  ─┐             │ ─────────▶ │ HTTP (routes.ts)                  │
│            ├─ Zustand    │            │   │                               │
│ 3D ofis   ─┘   store     │ ◀───────── │ Orchestrator (durum makinesi)     │
└──────────────────────────┘    SSE     │   │            │                  │
                                        │ Ekip kaydı   LLM yönlendirici     │
                                        │ (YAML+zod)   (llm/index.ts)       │
                                        └───────────────┬──────────────────┘
                                                        ▼
                                      mock · Gemini · Claude · OpenRouter · Ollama
```

- **`shared/`**: İki tarafın da kullandığı tipler: ekip, görev, alt görev, mesaj, olay.
  Tek doğruluk kaynağı; sunucu ve istemci aynı şekli konuşur.
- **`server/`**: Görevlerin sahibi. Planlama, zamanlama, revizyon, birleştirme, iptal,
  zaman aşımı burada. Modellerle yalnızca `llm/` konuşur; API anahtarları burada kalır.
- **`client/`**: Paneller (görev kutusu, onay kuyruğu, rapor, kayıt) ve 3D ofis. İkisi de
  aynı veriyi, aynı saf fonksiyonlarla (`selectors.ts`) okur.
- **İletişim**: Kullanıcı eylemleri düz REST POST'larıdır (onayla, revize et, yanıtla).
  Sunucudan tarayıcıya her değişiklik **Server-Sent Events (SSE)** ile akar ve her olay
  görevin **tam anlık görüntüsünü** taşır; istemci hiçbir zaman "fark birleştirme" yapmaz,
  bu yüzden kayma (drift) olmaz.

## Orchestrator ve durum makinesi

`server/src/orchestrator/orchestrator.ts` sistemin kalbidir. Her görev için iki durum
seviyesi vardır.

**Görev durumu**

```
            ┌──────── awaiting_clarification ◀─┐ (soru sorarsa)
            ▼                                   │
planning ───┴──▶ running ──▶ merging ──▶ awaiting_final_review ──▶ completed
   │               │            ▲   │                 │
   └─▶ failed      │            └───┼─── revize ──────┘
                   └─ (her an) ─▶ cancelled
```

**Alt görev durumu**

```
blocked ──▶ working ──▶ awaiting_review ──▶ approved
               ▲              │
               └── revising ◀─┘ (kullanıcı notla geri gönderir)
working/revising ──▶ failed ──(Retry)──▶ working/revising
```

Nasıl işler:

1. **Planlama.** Koordinatöre ekibin listesi ve kurallar verilir; cevap JSON olarak
   gelir. `planParser.ts` bu cevabı **güvenilmez veri** sayar: bilinmeyen ajanları atar,
   aynı ajana düşen iki işi birleştirir, kimlikleri `sub_1…` diye yeniden numaralar,
   bağımlılık döngülerini kırar. Plan kullanılamazsa bir kez daha sorar, yine olmazsa
   ekibin her zamanki iş sırasından (`defaultPlan`) bir plan kurar.
2. **Zamanlama.** `schedule()` bekleyen (`blocked`) her alt görevin bağımlılıklarına
   bakar; hepsi **onaylıysa** işi başlatır. Bağımsız işler paralel yürür; aynı anda kaç
   model çağrısı yapılacağını sağlayıcı katmanı sınırlar.
3. **İnceleme.** Rapor gelince alt görev `awaiting_review` olur. Onay → `approved` ve
   yeniden zamanlama; revizyon → `revising` ve aynı ajan, önceki versiyon + notla yeniden
   yazar. Revizyon sayısı ekip ayarıyla sınırlıdır.
4. **Birleştirme.** Hepsi onaylanınca koordinatör yalnızca onaylı versiyonları alıp final
   belgeyi yazar; final de aynı onay/revizyon döngüsünden geçer.

İki önemli kural:

- **Onaylanan iş değişmez.** Her revizyon yeni bir versiyondur (v1, v2 …); eski
  versiyonlar saklanır. Bağımlı işler yalnızca **onaylanmış** versiyonu görür. Böylece
  "Kai'nin mimarisi Pia'nın hangi kapsamına dayanıyor?" sorusunun cevabı her zaman bellidir.
- **Her model çağrısı iptal edilebilir ve sınırlıdır.** Görevin bir `AbortController`'ı
  vardır; iptal, uçuştaki çağrıları keser. Her çağrının bir güvenlik zaman aşımı vardır.
  Gecikmiş bir cevap, iptal edilmiş bir göreve yazılmaz (`isClosed` kontrolü).

## Ajanlar neden doğrudan konuşmuyor?

Ajanlar birbirine mesaj atmaz; **her mesaj** (görevlendirme, rapor, onay, revizyon isteği,
soru, yanıt, hata) bir `AgentMessage` olarak orchestrator'dan geçer, kaydedilir ve
tarayıcıya akar. Gerekçeler:

- **Kontrol kullanıcıda kalır.** İşler arasındaki tek köprü "onaylanmış rapor"dur.
  Ajanlar kendi aralarında anlaşıp kullanıcının görmediği bir şey üretemez.
- **Takip edilebilirlik.** Her şey tek bir sıralı kayıtta durur; "kim, kime, ne zaman,
  hangi versiyon" sorusu her zaman cevaplanır. Kayıt sekmesi bu listenin kendisidir.
- **Maliyet ve öngörülebilirlik.** Serbest sohbet eden ajanlar kaç çağrı yapacaklarını
  bilemez; burada çağrı sayısı plandan bellidir (plan + işçi başına bir rapor + revizyonlar +
  birleştirme).
- **Görselleştirme bedavaya gelir.** 3D ofisteki zarflar bu mesajlardan türetilir;
  mimari ekranda görünür hâle gelir.

## Ekipler veri, kod değil

Her ekip `teams/*.yaml` içinde tek bir dosyadır ve `teams/schema.ts` (zod) ile doğrulanır:
tam bir koordinatör, 2–5 işçi, benzersiz kimlikler, var olan işçilere bağımlılık, döngü
yok. Hata mesajı alanı gösterir (`agents.2.dependsOn: "script" depends on unknown worker
"reserch"`). Bozuk bir dosya atlanır, diğer ekipler çalışmaya devam eder; geliştirmede
dosya kaydedilince ekip anında yeniden yüklenir. Ekip başına bir davranış gerekirse kod
dalı değil, şemaya isteğe bağlı bir alan eklenir (`personality`, `llm`, `mockResponse`).
Üçüncü ekip (YouTube Video Studio) tek satır kod değiştirmeden eklendi.

## Sağlayıcı katmanı ve `resolveModel`

Modellerle konuşan tek yer `server/src/llm/`'dir. Orchestrator yalnızca tek bir arayüz
bilir: `generate(request) → { text, usage }`.

- **Yönlendirici (`llm/index.ts`).** Her çağrının hangi ajan için olduğuna bakar (iş
  raporu → işçi; plan, soru ve birleştirme → koordinatör) ve doğru adaptöre gönderir.
  Sağlayıcı adını adaptöre çeviren tek yer burasıdır; yeni sağlayıcı = bir adaptör dosyası
  - bir satır.
- **`resolveModel` (`llm/resolve.ts`, saf fonksiyon).** Bir ajanın hangi modelde
  çalışacağına karar verir:
  1. `LLM_PROVIDER=mock` ise **herkes mock**'tur (YAML'daki ayarlar yok sayılır). Böylece
     repoyu indiren biri anahtar ya da Ollama olmadan her şeyi deneyebilir.
  2. Ajanın YAML'da kendi `llm: { provider, model }` ayarı varsa o kullanılır.
  3. Yoksa `.env`'deki varsayılan sağlayıcı ve onun varsayılan modeli (`GEMINI_MODEL` …).

  Aynı fonksiyonu yönlendirme, başlangıç kontrolü ve arayüzdeki model etiketleri kullanır;
  üçü hiçbir zaman farklı bir şey söylemez.

- **Sağlayıcı başına sınırlar.** Her sağlayıcının kendi eşzamanlılık sınırı ve zaman aşımı
  var (yerel Ollama: aynı anda tek çağrı, daha uzun sabır, 16K bağlam penceresi). 429 / 5xx
  hatalarında üstel bekleme ile yeniden denenir; `Retry-After` dikkate alınır. Günlük kota
  bitmişse boşuna denenmez, ne zaman sıfırlanacağı söylenir.
- **Hata dili.** Her hata `sağlayıcı · model: ne oldu` biçimindedir ("ollama · qwen3.5:9b:
  Ollama is not running…"); arayüzde aynen görünür.
- **Ölçüm.** Yönlendirici her cevaba sağlayıcı, model ve süreyi ekler; orchestrator bunları
  rapor versiyonuna yazar. Arayüz rapor başına ve görev toplamında token ile süreyi gösterir.
- **Başlangıç kontrolü (`preflight.ts`).** Sunucu açılırken her ajanın modelini çözer;
  anahtar eksik mi, Ollama çalışıyor mu, model indirilmiş mi bakar. Sorun varsa sunucuyu
  çökertmez: hangi ekip ve ajanın etkilendiğini yazar, o ekibin görev başlatmasını engeller
  ve 30 saniyede bir yeniden kontrol eder.
- **Güvenlik.** Anahtarlar sunucuda kalır; istemciye yalnızca model adı gider. Model
  çıktısı güvenilmez kabul edilir: Markdown ham HTML kapalı olarak gösterilir.

## Netleştirme adımı

"selam" gibi görev olmayan ya da çok belirsiz bir girdiyle plan uydurmak kötü bir
deneyimdir. Bu yüzden koordinatör planlamadan önce karar verir:

- Plan istemi iki çıktıya izin verir: `action: "plan"` (özet + alt görevler) ya da
  `action: "clarify"` (kısa bir cevap + 1–3 soru). Yapılandırılmış çıktı modları birleşim
  (union) tipini kabul etmediği için tek, düz bir JSON şeması kullanılır.
- Soru gelirse görev `awaiting_clarification` olur; koordinatörün balonunda "?" çıkar,
  sorular görev kutusunda görünür, kutu yanıt kutusuna dönüşür.
- Kullanıcı yanıtlayınca **aynı görev** devam eder: önceki tur bir konuşma olarak plan
  istemine eklenir; işçiler ve birleştirme de "kullanıcının verdiği ayrıntılar" bölümünü
  görür.
- En fazla **iki tur** sorulur; sonra koordinatöre "şimdi planla, varsayımlarını yaz"
  denir. Model yine soru sorarsa varsayılan plana düşülür; sonsuz döngü yoktur.
- Mock modda bu kararı küçük, test edilmiş bir kural verir (sadece selamlaşma ya da tek
  kısa kelime ise sor).

## 3D ofis neden iş akışından bağımsız?

Ofis projenin vitrini, ama iş akışı ona hiç dayanmaz:

- **Tek veri kaynağı.** Paneller de 3D sahne de aynı görev anlık görüntüsünden okur.
  "Kim ne yapıyor?" sorusunun cevabı tek bir saf fonksiyondur (`agentActivity`); ofis ne
  gösterecekse oradan alır, kendi başına karar vermez.
- **Her şey panellerde de var.** WebGL yoksa, sahne hata verirse, kalite "Düşük" ya da
  hareket "Azaltılmış" ise; onaylama, revizyon, okuma, dışa aktarma panellerden aynen
  çalışır. WebGL yokken düz bir pano (`TeamBoard`) aynı masaları gösterir.
- **Tembel yükleme.** 3D motoru büyüktür; ayrı yüklenir, paneller beklemeden açılır.
- **Mantık çizimden ayrı.** Yerleşim, gün ışığı, yol bulma (A*), karakter "beyni" (durum
  makinesi), pozlar, sohbetler, zarf uçuşları saf fonksiyonlardır ve test edilir;
  React bileşenleri yalnızca bu çıktıları çizer.
- **Erişilebilirlik.** `prefers-reduced-motion` ya da ayarlardaki "Azaltılmış" seçeneği:
  kimse dolaşmaz, uçuş yerine solma, anında kamera.

Bu ayrım hem güvenilirlik (sahnedeki bir hata işi durduramaz) hem de test edilebilirlik
sağlar.

## Kayıt modu (`?capture=1`)

README'deki GIF'in her çekimde aynı çıkması için deterministik bir kayıt modu var:

- Normalde sahne gerçek saati izler. `?capture=1` ile 3D döngüsü durdurulur
  (`frameloop="never"`) ve dışarıdan `window.__officeCapture.step()` çağrılır; her adım
  sahneyi **tam 1/15 saniye** ilerletir.
- Adım; R3F saatini, sahne zamanını (`sceneNow()`, zarflar ve hedefler bunu kullanır) ve
  sayfadaki **tüm CSS animasyonlarını** aynı miktarda ilerletir.
- Canlı veri akışı kapanır; daha önce mock bir görevden kaydedilmiş zaman çizelgesi, sahne
  zamanına göre kare kare oynatılır. Kareler ne kadar yavaş yakalanırsa yakalansın sonuç
  aynıdır.
- `scripts/capture/media.mjs` başsız Chrome'u DevTools Protokolü ile sürer (yalnızca
  Node'un yerleşik modülleri), kareleri yakalar; ffmpeg GIF'e çevirir. Ekran görüntüleri
  de aynı araçla çekilir.

## Test stratejisi

- Saf mantık birim testleriyle korunur: plan ayrıştırma, durum makinesi, model çözümleme,
  yeniden deneme, ölçüm biçimleme, 3D yerleşim, yol bulma, karakter beyni, kayıt modu.
- Orchestrator anında cevap veren bir mock sağlayıcı ve "senaryolu" sağlayıcılarla test
  edilir (hata, zaman aşımı, sürekli soru soran model …).
- HTTP katmanı gerçek bir sunucu açılarak uçtan uca test edilir.
- CI her push'ta biçim, lint, tip kontrolü, testler ve build'i Node 22 ve 24'te çalıştırır.

## Kalıcı kayıt

Görevler `data/tasks.json` dosyasında saklanır (`PERSIST_TASKS`, `TASKS_FILE`):

- Her değişiklikten kısa süre sonra (yaklaşık 150 ms, art arda gelen değişiklikler tek
  yazma olur) ve kapanırken dosyaya yazılır. Yazma atomiktir: önce geçici dosyaya, sonra
  yeniden adlandırma; yarıda kesilen bir yazma bozuk dosya bırakmaz. Okunamayan dosya
  kenara taşınır, sunucu boş başlar.
- Görevle birlikte ekibin **o anki kopyası** ve son revizyon notları da saklanır; YAML
  sonradan değişse bile görev aynı ekiple sürer, "Tekrar dene" doğru notla çalışır.
- Yeniden başlatma sırasında yarıda kalan işler (planlama, yazılan rapor, birleştirme)
  "sunucu yeniden başladı" hatasıyla işaretlenir; mevcut "Tekrar dene" düğmeleri kaldığı
  yerden sürdürür. Uçuştaki model çağrısı kaybolduğu için bu dürüst bir durumdur: sessizce
  yeniden başlatmak çift maliyet ve sürpriz demektir.

## Bilinçli sınırlar

- Tek kullanıcı, tek sunucu; kimlik doğrulama yok (yerel bir araç ve portföy projesi).
- Ücretsiz kotalar küçüktür; bu yüzden hazır ekiplerde işçiler yerel modelde çalışır.

## Olası mülakat soruları

1. **Bir görev uçtan uca nasıl ilerliyor?**
   Kullanıcı görevi POST eder; orchestrator koordinatörden plan (ya da soru) ister; plan
   güvenli hâle getirilir; bağımlılığı onaylı olan alt görevler başlar; her rapor
   kullanıcının onayına düşer; hepsi onaylanınca koordinatör birleştirir; final de
   onaylanınca görev tamamlanır. Her adım SSE ile tarayıcıya tam anlık görüntü olarak akar.

2. **Neden WebSocket değil de SSE?**
   Veri tek yönlü akıyor (sunucu → tarayıcı); kullanıcı eylemleri zaten seyrek ve REST'e
   çok uygun. SSE düz HTTP'dir, tarayıcı kendiliğinden yeniden bağlanır, proxy'lerle sorun
   çıkarmaz. Yine de ölü bağlantılar için bir "kalp atışı" bekçisi ekledim.

3. **Model bozuk JSON dönerse ne oluyor?**
   Model çıktısı güvenilmez kabul ediliyor. Önce sağlayıcının yapılandırılmış çıktı
   modunu kullanıyorum (Gemini şeması, Ollama `format`, Anthropic zorunlu araç …); yine de
   ayrıştırıcı çitleri ve gevezeliği temizliyor, bilinmeyen ajanları atıyor, döngüleri
   kırıyor. İki denemede de olmazsa ekibin varsayılan iş sırasına düşüyor; görev durmuyor.

4. **Ajanlar neden birbiriyle konuşmuyor?**
   Kontrol ve izlenebilirlik için. Tek köprü "onaylanmış rapor"; her mesaj orchestrator'da
   kaydediliyor. Çağrı sayısı plandan belli, maliyet öngörülebilir. Ayrıca bu mesajlar 3D
   ofisteki zarflara dönüşüyor.

5. **Yeni bir model sağlayıcısı eklemek ne gerektirir?**
   `llm/providers/` altına bir adaptör dosyası (istek → cevap, token sayıları, hataları
   `LLMError`'a çevirme) ve yönlendiricide bir satır. Orchestrator ve ekip dosyaları
   değişmez; ajanlar YAML'da `llm: { provider }` ile yeni sağlayıcıyı seçer.

6. **Bir ekipte farklı ajanlar farklı modeller kullanabiliyor mu?**
   Evet. `resolveModel` her ajan için sırayla bakıyor: mock modu mu, ajanın kendi `llm`
   ayarı var mı, yoksa `.env` varsayılanı. Hazır ekiplerde koordinatör Gemini'de, işçiler
   yerel Ollama'da; bir görev böylece 7–10 yerine 2–3 bulut çağrısı yapıyor.

7. **Rate limit ve hatalarla nasıl başa çıkıyorsun?**
   Sağlayıcı başına eşzamanlılık sınırı, 429/5xx'te üstel bekleme ve `Retry-After`;
   günlük kota bittiyse denemiyor, sıfırlanma zamanını söylüyor. Hata kullanıcıya
   "sağlayıcı · model: neden" diye gösteriliyor; rapor ya da planlama "Tekrar dene" ile
   kaldığı yerden sürüyor.

8. **Kullanıcı bir raporu geri gönderdiğinde bağımlı işler ne oluyor?**
   Bağımlı işler zaten yalnızca onaylı versiyonu alıyor; geri gönderilen rapor onaylanana
   kadar onlar başlamıyor. Onaylanmış bir versiyon hiç değişmiyor; revizyon yeni bir
   versiyon oluşturuyor, eskiler okunabilir kalıyor.

9. **3D sahne çökerse ya da kullanıcının cihazı zayıfsa?**
   İş akışı sahneye bağlı değil. Sahne bir hata sınırının (error boundary) içinde; çökerse
   düz pano gösteriliyor. Kalite otomatik düşebiliyor, "Azaltılmış hareket" var ve her şey
   panellerden yapılabiliyor. Sahne mantığı saf fonksiyonlarda, testli.

10. **README'deki GIF'i nasıl ürettin, neden "deterministik"?**
    `?capture=1` modunda sahne gerçek saati değil, dışarıdan verilen adımları izliyor:
    her adım 3D saati, sahne zamanını ve CSS animasyonlarını tam 1/15 saniye ilerletiyor.
    Kayıtlı bir görev zaman çizelgesi kare kare oynatılıyor; başsız Chrome her kareyi
    yakalıyor, ffmpeg GIF'e çeviriyor. Yakalama ne kadar yavaş olursa olsun aynı GIF çıkıyor.
