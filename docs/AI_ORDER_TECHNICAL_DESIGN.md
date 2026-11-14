# طراحی فنی دستیار ثبت سفارش با زبان طبیعی | ShiftYar
**وضعیت:** قرارداد فنی اولیه (۱۴ نوامبر ۲۰۲۶)، بخشی از آن در PR شماره ۱۵ پیاده‌سازی شده است. این سند همچنان هدف معماری و محدودیت‌های تولید را از وضعیت جاری تفکیک می‌کند.  
**شاخه مبنا:** main. سند محصول: AI_ORDER_INTAKE_SPEC.fa.md. آزمون: AI_ORDER_TEST_PLAN.fa.md.  
**محدودیت اصلی:** مدل اجازه اجرای SQL، تغییر سفارش، انتخاب قیمت، پرداخت، ارسال مستقیم به آشپزخانه یا مشاهده اطلاعات دیگر رستوران‌ها ندارد.

## ۱. معماری پیشنهادی
Browser (table-scoped draft/typed note) → authenticated POST /api/ai/order-suggestions → server authorization + context lookup with tenant RLS → bounded candidate menu + provider adapter → strict response validator + ambiguity classification → table-bound suggestion envelope → editable browser review → draft → existing POST /api/rounds.

مسیر کنونی POST /api/ai/parse تا تکمیل مهاجرت بدون تغییر باقی بماند؛ مسیر نسخه‌دار جدید اجازه تکامل قرارداد را بدون شکستن کاربران قبلی فراهم می‌کند. ارسال به آشپزخانه همچنان فقط از مسیر موجود POST /api/rounds و قفل/تراکنش/idempotency آن خواهد بود. نخست اعتبارسنجی و تفکیک وضعیت پیش‌نمایش پیاده شود، سپس مدل واقعی متصل شود. هیچ کلید API به مرورگر فرستاده نمی‌شود.

## ۲. قرارداد درخواست و اتصال به هویت میز
نمونه درخواست (شرح ایده، هنوز پیاده نشده):

    POST /api/ai/order-suggestions
    {
      "clientRequestId": "uuid",
      "tableId": "uuid",
      "expectedSessionId": null,
      "sourceRevision": 4,
      "text": "دو لاته، یکی کم‌شیر، و یک چیزکیک"
    }

- user و tenant فقط از session احراز هویت‌شده استخراج شوند؛ مقادیر داخل body نمی‌توانند نقش یا tenant تعیین کنند.
- نقش مجاز: waiter یا manager؛ kitchen و cashier باید 403 بگیرند.
- tableId در tenant معتبر و دارای branch معلوم باشد. branchId از جدول معتبر سرور مشتق شود، نه متن واردشده.
- expectedSessionId برای تشخیص تغییر نشست بین انتخاب و درخواست؛ 409 در صورت اختلاف.
- clientRequestId فقط برای همبستگی پاسخ/درخواست است و مجوز ارسال/ثبت نیست.
- sourceRevision در هر ویرایش متن زیاد شود؛ پاسخ فقط در همان tableId + expectedSessionId + sourceRevision + clientRequestId قابل مصرف است. تغییر شعبه، میز، نشست، logout یا متن باید پاسخ معوق را نادیده بگیرد. AbortController برای کاهش هزینه قابل استفاده است، اما لغو شبکه به‌تنهایی تضمین ایمنی نیست.
- اعتبارسنجی متن: رشته فارسی/یونیکد، trim، حداقل چهار و حداکثر ۱۰۰۰ نویسه (سقف پیشنهادی قابل تنظیم)، محدودیت بایت درخواست و تعداد فراخوانی؛ متن اصلی برای ویرایش حفظ شود. طول زیاد با خطای واضح 422 و درخواست کوتاه کردن، نه truncate خاموش.

## ۳. قرارداد پاسخ، نمونه پیشنهادی
سرور پس از تطبیق با منو، نه خود مدل، برای هر ردیف شناسه clientLineId و وضعیت قابل اعتماد ایجاد کند:

    {
      "suggestionId": "uuid",
      "clientRequestId": "uuid",
      "context": {
        "tableId": "uuid",
        "sessionId": null,
        "branchId": "uuid",
        "sourceRevision": 4,
        "menuFingerprint": "sha256:..."
      },
      "lines": [
        {
          "clientLineId": "uuid",
          "menuItemId": "uuid",
          "quantity": 1,
          "note": "کم‌شیر",
          "sourceText": "یکی کم‌شیر",
          "reviewState": "matched",
          "candidateMenuItemIds": []
        },
        {
          "clientLineId": "uuid",
          "menuItemId": "uuid",
          "quantity": 1,
          "note": "",
          "sourceText": "دو لاته",
          "reviewState": "matched",
          "candidateMenuItemIds": []
        }
      ],
      "unresolved": [
        {
          "sourceText": "نوشابه",
          "reason": "not_on_menu",
          "candidateMenuItemIds": []
        }
      ],
      "requiresHumanReview": true
    }

این مثال ساختار را توضیح می‌دهد، نه شناسه واقعی منو. مقدار reviewState از matched، ambiguous و invalid است. وضعیت matched فقط می‌گوید شناسه و تعداد از نظر ساختاری معتبرند، نه اینکه مدل حتماً منظور مشتری را درست فهمیده است. همه ردیف‌ها قبل از افزودن به پیش‌نویس به بازبینی انسانی نیاز دارند. هیچ درصد اطمینان عددی از مدل به عنوان واقعیت نمایش داده نشود.

## ۴. قرارداد ارتباط با مدل
ورودی مدل فقط متن سفارش و فهرست محدودِ مجاز همین tenant است. ترجیحاً گزینه‌های منو به صورت شناسه، نام، دسته و توضیح ضروری (بدون قیمت، کاربر یا اطلاعات شخصی) فرستاده شوند. وقتی منو بزرگ است، فهرست جست‌وجوی کاندیدا باید کل منو را پوشش دهد؛ LIMIT 100 مرتب‌سازی‌شده بر پایه نام از نسخه فعلی قابل قبول نیست. دو مرحله پیشنهاد می‌شود: بازیابی قطعی/جست‌وجوی هم‌معنی‌های تأییدشده، سپس استخراج ساختاریافته با گزینه‌های مجاز. اگر نامی پیدا نشد، unresolved باشد نه پیشنهاد غذای اختراعی. بازیابی باید با عبارت‌های فارسی/عربی و با اعداد محلی سنجیده شود.

مدل موظف است یک ساختار محدود JSON بازگرداند شامل lines (menuItemId، quantity، note، evidence، status، alternative IDs) و unparsedText. برای هر object همه فیلدها اجباری و additionalProperties:false، فیلدهای ناموجود از نوع null مجاز؛ در سازگاری مدل از JSON Schema strict / Structured Outputs استفاده شود. ارائه‌دهندگان OpenAI-compatible لزوماً schema strict را پشتیبانی نمی‌کنند؛ قابلیت در adapter تشخیص داده شود و اگر در دسترس نبود، JSON parse + validator قوی و خطای صریح اعمال شود، نه اعتماد به متن prompt.

قواعد server-side پس از هر پاسخ:
- JSON نامعتبر، پاسخ ناقص/قطع‌شده/ردشده، داده ناشناخته و رشته خارج از محدوده → خطای ساختاری یا «نیازمند بررسی» با دلیل؛ هرگز تأیید خودکار.
- IDهای پیشنهادشده باید عضو allowlist منوی tenant و available باشند. ID غیرمجاز هرگز نباید به ID دیگری تبدیل شود؛ مورد و متن اصلی آن گزارش شود.
- هر quantity عدد صحیح ۱..۲۰ و هر note حداکثر ۲۴۰ نویسه باشد. فراتر از محدوده باعث خطا/تعیین تکلیف شود، نه تبدیل/بریدن خاموش.
- اگر تعداد ردیف‌ها بیش از ۱۲ باشد، نمای کاملِ وضعیت مشکل یا پیام «سفارش را به چند نوبت تقسیم کنید» نمایش داده شود؛ slice خاموش ممنوع.
- اقلام با یک menuItemId ولی یادداشت متفاوت با هم ادغام نشوند. ادغام فقط با شناسه+یادداشت یکسان، سقف تعداد و تأیید انسانی.
- متن unmatched، dish ambiguity، نوع ناشناخته و تغییر سفارش قبلی در unresolved باقی بماند.
- هیچ بهایی در خروجی مدل پذیرفته نشود؛ قیمت و تصویر نام فقط از منوی سرور در پیش‌نمایش گرفته شود.
- متن و نام کالا HTML-escape شوند؛ رندر Markdown خام یا eval/اجرای کد مدل ممنوع.
- نتیجه پیشنهاد سرور نباید در جدول order_rounds، order_items یا رویداد سفارش نوشته شود؛ ثبت واقعی مستقل باشد.

## ۵. اثر انگشت منو و زمان‌پریشی
برای پیشنهاد، اثر انگشت پایدار از شناسه/نام/قیمت/available اقلام مجاز رستوران (و هنگام وجود، موجودی شعبه) با ترتیب قطعی سرور ساخته شود. تا قبل از انتقال به پیش‌نویس در صورت تفاوت اثر انگشت، موارد تغییرکرده به کاربر نمایش داده شوند. هنگام POST /api/rounds، علاوه بر اعتبارسنجی فعلی موجودی/سشن/شناسه‌ها، اگر قیمت پیشنهادی با قیمت روز تغییر کرده بود، به جای ثبت خاموش با مبلغ جدید، پاسخ 409 MENU_PRICE_CHANGED و مرور دوباره قیمت لازم است. این موضوع مستلزم توسعه قرارداد سفارش است و نباید در کد موجود فرض شود. توجه: RLS مرز رستوران است؛ در طرح داده فعلی موجودی شعبه‌ای مستقل وجود ندارد، پس نباید در UI ادعای کنترل موجودی شعبه‌ای کرد.

## ۶. مدیریت هم‌زمانی و حفظ پیش‌نویس
- پیشنهاد باید با key مرکب tenantId:userId:branchId:tableId:sessionId و sourceRevision گره بخورد. مقدار کلید در client به عنوان شناسه مالکیت UI است و هیچ جایگزینی برای احراز هویت سرور نیست.
- درخواست جدیدتر همان میز پاسخ قدیمی‌تر را باطل کند؛ تغییر میز یا شعبه به‌صورت واضح پیشنهاد قبلی را حفظ/کنارگذاری کرده و از اعمال آن روی میز جدید جلوگیری کند.
- متن آزاد، پیشنهادهای اصلاح‌شده و سبد با یک state machine شفاف نگهداری شوند؛ refresh پنج‌ثانیه‌ای فقط داده سرور را بازخوانی کند و فرم/فوکوس ویرایش را جایگزین نکند.
- هنگام خروج، تغییر حساب یا پاکسازی دستگاه اشتراکی، متن حساس پاک شود. اگر بازیابی پس از رفرش لازم است، سیاست TTL کوتاه، scope کاربر و میز، محدودیت ذخیره اطلاعات حساس و تست دستگاه مشترک قبل از انتخاب sessionStorage یا draft server-side نوشته شود؛ تا آن زمان ادعای پایداری نکنید.
- هنگام ثبت نهایی، شناسه idempotency را با snapshot تغییرناکرده اقلام پیوند بزنید. اگر متن/اقلام پس از خطای شبکه تغییر کردند، کلید قبلی برای payload جدید استفاده نشود؛ ابتدا وضعیت میز بررسی شود تا سفارش تکراری ثبت نشود.
- 409 ناشی از تغییر نشست، منو یا سفارش هم‌زمان نیاز به مرور و rebase دستی دارد؛ هیچ retry خودکارِ تغییردهنده داده مجاز نیست.

## ۷. امنیت، حریم خصوصی و محدودیت هزینه
- فقط HTTPS برای provider خارجی، لیست میزبان‌های مجاز در محیط استقرار، کنترل تغییر مسیر/SSRF، سقف پاسخ، زمان ۱ تا ۷ ثانیه، پاسخ خطای امن، در نظر گرفتن circuit breaker و کلید از محیط محرمانه.
- rate limit برای user + tenant + مبدأ با 429، محدودیت درخواست هم‌زمان و بودجه روزانه tenant؛ مقدار دقیق باید با آزمایش هزینه واقعی مدل تصویب شود. بدون دسترسی/مجوز به سرویس پولی، هیچ درخواست پولی فعال نشود.
- prompt injection: یادداشت و نام منو هر دو untrusted هستند. جداکردن instruction و data، محدودکردن داده و اعتبارسنجی پس از مدل ضروری است؛ متن داخل سفارش هیچ حق tool call، URL fetch، پرداخت یا تغییر نقش نمی‌دهد.
- حذف/اخطار درباره اطلاعات شخصی مشتری قبل از ارسال بیرونی؛ عدم ثبت متن آزاد، prompt، API key و پاسخ خام مدل در log. فقط metadata حداقلی و traceId.
- عدم نمایش اتصال واقعی تا احراز سلامت provider؛ وجود AI_API_KEY به معنی موفقیت مدل نیست.
- 401 برای بی‌احراز هویت، 403 نقش، 409 تغییر context/menu، 422 ورودی یا ابهام ساختاری، 429 مصرف، 502 پاسخ مخدوش، 503 عدم دسترسی provider و خطای شبکه تفکیک شوند. درخواست AI هرگز به ثبت دستی آسیب نزند.
- نسخه مدل، prompt و validator در telemetry ثبت شود تا مشکلات قابل بازتولید باشند، بدون ذخیره اطلاعات خصوصی.

## ۸. قرارداد تغییرات در کد موجود
۱. src/public/app.js: تفکیک aiText، aiPreview و draft بر اساس میز؛ ساخت state machine؛ editor قابل تغییر غذا/تعداد/یادداشت/حذف/افزودن؛ حفظ فوکوس و اسکرول؛ error/retry و stale response.  
۲. src/server.mjs: جداکردن suggestWithAI فعلی به endpoint جدید، adapter قابل Mock، auth/context validation، rate limiting، AbortSignal، response envelope.  
۳. src/core.mjs یا ماژول جدید ai-order.mjs: validators مستقل و deterministic، رد شفاف اقلام invalid، matching و split-note، بدون هیچ DB write.  
۴. src/db.mjs: گرفتن snapshot کاملِ منوی tenant و context معتبر میز در تراکنش RLS؛ hash پایدار و زیرساخت snapshot version.  
۵. src/operations.mjs: revalidate price/availability + session در ثبت نهایی؛ تغییر قرارداد فقط با تست‌های سازگاری idempotency.  
۶. tests: unit، integration، property-style/fuzz، mocked provider، browser و golden cases فارسی.  
۷. docs و env: قرارداد خطاها، API و نگهداری داده، هزینه، وضعیت فعال/غیرفعال، release checklist.

## ۹. منابع فنی قابل استناد
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs (schema adherence به معنای درستی کسب‌وکار نیست؛ refusals و incomplete پاسخ نیز باید مدیریت شوند).
- OWASP LLM Prompt Injection Prevention: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html (مرزبندی داده نامطمئن، least privilege، کنترل عملیات خارج از مدل).
- کد مبنا: https://github.com/afakhari/restaurant-father/blob/main/src/server.mjs و https://github.com/afakhari/restaurant-father/blob/main/src/operations.mjs.

**این سند design-ready است، نه production-ready.** مدل، هزینه، اتصال واقعی، UX مرورگر و قرارداد جدید باید در مراحل بعدی پیاده و آزموده شوند؛ هیچ نتیجه تست جدیدی در این سند ادعا نشده است.
## Implemented slice / 2026-11-14

- New endpoint: `POST /api/ai/order-suggestions` in `src/server.mjs`, requiring waiter/manager, validated UUID table/session/request, authenticated RLS tenant and a complete tenant menu read.
- Parser & normalization: `src/ai-order.mjs`, with explicit unresolved output, conservative rule mode, no automatic persistence, payload limits and model ID/quantity allowlist.
- Browser: editable menu/quantity/notes, line splitting, unresolved resolution/dismissal, table-revision matching, request cancellation and draft-only acceptance in `src/public/app.js`.
- Final `POST /api/rounds` now optionally checks `expectedPriceToman`; a changed menu price returns HTTP 409 before insertion.
- Tests: `tests/ai-order.test.mjs`, `tests/ai-golden.test.mjs`, integration tests and real-browser scripted acceptance.
- Architecture limitations: local parser is not AI; provider-backed inference has not been verified with a real external model. Distributed rate limiting, durable offline drafts, multilingual speech-to-text, live allergen verification and extensive field trials remain out of scope. A robust 100K-user deployment needs more than this MVP.

## ۱۰. وضعیت پیاده‌سازی و تفاوت با طرح اولیه

کد عملیاتی این فاز در `src/ai-order.mjs`، `src/server.mjs`، `src/public/app.js` و `src/operations.mjs` قرار دارد. API جدید به رستوران، میز، نشست و نسخه متن وابسته است. نمونه‌های نامعتبر با دلیل بازگردانده می‌شوند؛ متن بدون شاهد و بخش حذف‌شده از سفارش در حالت نیازمند بررسی ظاهر می‌شود. قیمت مورد انتظار هنگام ثبت نهایی دوباره کنترل می‌شود. با `AI_ORDER_ENABLED=false` می‌توان پیشنهادها را متوقف کرد، بدون آنکه ثبت دستی مختل شود.

**تفاوت‌های باقی‌مانده با هدف تولیدی:** پاسخ مدل فعلاً با JSON parse و validator داخلی بررسی می‌شود و Structured Outputs مخصوص یک ارائه‌دهنده انتخاب نشده است. بودجه و محدودکننده‌ها در حافظه هر پردازش‌اند، نه در لایه توزیع‌شده. متن آزاد به‌صورت دائمی ذخیره نمی‌شود؛ پس از بسته‌شدن تب بازیابی تضمین‌شده نیست. اثرانگشت منو در پاسخ وجود دارد، اما قیمت و موجودی هر قلم در تراکنش ثبت نهایی دوباره بررسی می‌شوند؛ سازوکار مستقلی برای هشدار بر اثر هر تغییر غیرمرتبط منو اجرا نشده است. تشخیص گفتار، تضمین شرایط حساسیت غذایی، تأیید قابلیت API واقعی برای ایران و آزمون واقعی کاربران عملیاتی هنوز انجام نشده‌اند.

این وضعیت باید در تحویل بیان شود؛ «طراحی قابل اجرا و تست‌شده با mock» به معنی «آماده تولید در رستوران واقعی» نیست.
