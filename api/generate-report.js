// Bu funksiya Vercel-də işləyir. GROQ_API_KEY yalnız server tərəfdə (env variable)
// saxlanılır və brauzerə heç vaxt göndərilmir.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';
const MAX_FIELD_LEN = 2000;   // böyük mətn sahələri (ümumi nəticə və s.) üçün üst limit
const ITEM_CLIP = 500;        // siyahı elementləri (tək seans qeydi, tək həftə nəticəsi) üçün üst limit
const MAX_SESSIONS = 80;      // aylıq/təhsil dövrü hesabatlarında çox sayda seans ola bilər
const MAX_OUTCOMES = 30;

function clip(s, len) {
  if (!s) return '';
  const str = String(s);
  const max = len || MAX_FIELD_LEN;
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// Model təlimata baxmayaraq bəzən markdown işarələri (##, **, - və s.) qata bilər —
// bunu ehtiyat tədbiri kimi server tərəfdə də təmizləyirik.
function sanitizeContent(text) {
  return text
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')       // # başlıqları
    .replace(/\*\*(.*?)\*\*/g, '$1')          // **qalın**
    .replace(/\*(.*?)\*/g, '$1')              // *əyri*
    .replace(/__(.*?)__/g, '$1')              // __qalın__
    .replace(/`{1,3}/g, '')                   // kod işarələri
    .replace(/^\s{0,3}[-•*]\s+/gm, '')        // sətir əvvəlindəki siyahı işarələri
    .replace(/^\s{0,3}>\s?/gm, '')            // sitat işarəsi
    .replace(/\n{3,}/g, '\n\n')               // artıq boş sətirlər
    .trim();
}

const NO_MARKDOWN_RULE =
  "Heç bir formatlaşdırma simvolu istifadə etmə: #, *, **, __, -, •, > işarələrindən heç birini yazma. " +
  "Başlıqları da simvolla deyil, yeni paraqrafa keçidlə göstər. Mətn tam, axıcı cümlələrdən ibarət olsun, adi insan tərəfindən əl ilə yazılmış bir məktub kimi oxunsun.";

function buildParentPrompt(body) {
  const p = body.patient || {};
  const outcomes = Array.isArray(body.outcomes) ? body.outcomes.slice(0, MAX_OUTCOMES) : [];
  const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, MAX_SESSIONS) : [];

  const sessionsText = sessions.length
    ? sessions.map(s => `${clip(s.date)} tarixli ${clip(s.type)} (status: ${clip(s.status)}): ${clip(s.notes, ITEM_CLIP) || 'qeyd yazılmayıb'}`).join('\n')
    : 'Bu dövr üçün ayrıca seans qeydi yoxdur.';

  const outcomesText = outcomes.length
    ? outcomes.map(o => {
        const parts = [`${clip(o.weekStart)} həftəsi —`];
        if (o.summary) parts.push(`ümumi nəticə: ${clip(o.summary, ITEM_CLIP)}.`);
        if (o.progress) parts.push(`irəliləyiş: ${clip(o.progress, ITEM_CLIP)}.`);
        if (o.challenges) parts.push(`çətinliklər: ${clip(o.challenges, ITEM_CLIP)}.`);
        if (o.nextSteps) parts.push(`növbəti addımlar: ${clip(o.nextSteps, ITEM_CLIP)}.`);
        return parts.join(' ');
      }).join('\n')
    : 'Bu dövr üçün ayrıca həftəlik nəticə qeydi yoxdur.';

  const system = `Sən Azərbaycanda uşaq inkişafı və reabilitasiya sahəsində uzun illik təcrübəyə malik bir mütəxəssis kimi yazırsan.
Tapşırığın, mütəxəssislərin apardığı seans qeydləri və həftəlik nəticələr əsasında valideynə təqdim ediləcək güclü, geniş izahlı və asanlıqla başa düşülən bir arayış hazırlamaqdır.

Yazı qaydaları:
Yalnız Azərbaycan dilində, sadə və elmi cəhətdən dəqiq dildə yaz. Mürəkkəb klinik terminlərdən qaçın, istifadə etməli olsan sadə sözlərlə izah et.
${NO_MARKDOWN_RULE}
Yalnız sənə verilən məlumata əsaslan. Uydurma fakt, rəqəm, diaqnoz və ya nəticə əlavə etmə. Məlumat azdırsa, bunu açıq şəkildə bildir, boşluğu təxminlə doldurma.
Heç bir tibbi və ya psixoloji diaqnoz qoyma — yalnız müşahidə olunan davranışı və inkişafı təsvir et.
Mətn geniş və izahlı olsun, səthi keçmə — hər müşahidəni valideynin aydın başa düşəcəyi şəkildə bir qədər açıqla və nümunələrlə dəstəklə.
Mətni təbii axarla qur: əvvəlcə dövr ərzində uşağın necə iştirak etdiyini, sonra hansı sahələrdə irəliləyiş müşahidə olunduğunu, sonra hazırda hansı sahələrin diqqət tələb etdiyini yaz.
Sonda mütləq bir həftəlik "Evdə məşğələ planı" bölməsi yaz — bu bölmə uşağın müşahidə olunan hazırkı ehtiyaclarına uyğun, təhlükəsiz və valideynin evdə asanlıqla tətbiq edə biləcəyi fəaliyyətlərdən ibarət olsun. Planı Bazar ertəsindən Bazar gününə qədər hər gün üçün ayrıca, qısa və konkret fəaliyyətlə yaz (məsələn "Bazar ertəsi:" deyə günü adlandır, sonra o gün üçün 1-2 qısa fəaliyyəti təsvir et), günlər arasında məşğul olunan bacarıq növünü dəyişdirərək müxtəliflik yarat, hər fəaliyyət 10-15 dəqiqədən çox olmasın və oyun formatında olsun.
Ton isti, dəstəkləyici və hörmətli olsun, lakin həqiqətə sadiq qal — süni tərif və mübaliğədən çəkin.`;

  const user = `Pasient: ${clip(p.name)}${p.age ? ', ' + clip(p.age) + ' yaş' : ''}
Məsul mütəxəssis: ${clip(body.staffName)}
Dövr: ${clip(body.periodLabel)} (${clip(body.periodStart)} – ${clip(body.periodEnd)})

Bu dövrün həftəlik nəticə qeydləri:
${outcomesText}

Bu dövrün seans qeydləri:
${sessionsText}

Yuxarıdakı məlumat əsasında valideynə təqdim ediləcək geniş və güclü arayışı, sonunda bir həftəlik evdə məşğələ planı ilə birlikdə, hazırla.`;

  return { system, user };
}

function buildStaffPrompt(body) {
  const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, MAX_SESSIONS) : [];
  const outcomes = Array.isArray(body.outcomesWritten) ? body.outcomesWritten.slice(0, MAX_OUTCOMES) : [];

  const total = sessions.length;
  const held = sessions.filter(s => s.status === 'keçirildi').length;
  const cancelled = sessions.filter(s => s.status === 'ləğv edildi').length;
  const noShow = sessions.filter(s => s.status === 'gəlmədi').length;

  const sessionsText = sessions.length
    ? sessions.map(s => `${clip(s.date)} | ${clip(s.patientName)} | ${clip(s.sessionType)} | status: ${clip(s.status)} | qeyd: ${clip(s.notes, ITEM_CLIP) || 'yazılmayıb'}`).join('\n')
    : 'Bu dövr ərzində seans qeydə alınmayıb.';

  const outcomesText = outcomes.length
    ? outcomes.map(o => `${clip(o.weekStart)} həftəsi, ${clip(o.patientName)}: ${clip(o.summary, ITEM_CLIP) || 'ümumi nəticə yazılmayıb'}`).join('\n')
    : 'Bu dövr ərzində heç bir pasient üçün həftəlik nəticə yazılmayıb.';

  const system = `Sən AN Psixoloji Dəstək və Reabilitasiya Mərkəzinin klinik rəhbəri qismində, mütəxəssislərin iş keyfiyyətini qiymətləndirən təcrübəli bir metodist kimi yazırsan.
Tapşırığın, verilən seans və qeyd fəaliyyəti əsasında mütəxəssisin iş prinsipini, metodologiyasını və qeyd mədəniyyətini dərindən qiymətləndirməkdir.

Yazı qaydaları:
Yalnız Azərbaycan dilində yaz.
${NO_MARKDOWN_RULE}
Yalnız sənə verilən statistika və qeydlərə əsaslan, uydurma fakt əlavə etmə.
Qiymətləndirmə obyektiv, konkret və konstruktiv olsun. Məzmunsuz ümumi tərif cümlələrindən ("yaxşı işləyir" kimi) qaçın — hər qiyməti konkret müşahidə ilə əsaslandır.
Mütəxəssisin işində görülən çatışmazlıqları, səhvləri və ya təkmilləşdirmə tələb edən vərdişləri aydın və birbaşa, lakin hörmətli dillə göstər — bunları gizlətmə və ya yumşaltma ilə mənasızlaşdırma.
Xüsusilə bunlara diqqət et: seans qeydlərinin detallılığı və faydalılığı, göstərişlərin ardıcıllığı, ləğv edilmə və gəlməmə hallarının tezliyi, həftəlik nəticələrin vaxtında və mənalı yazılıb-yazılmadığı, fərqli pasientlər arasında iş keyfiyyətinin sabitliyi.
Mətni təbii axarla qur: əvvəlcə ümumi fəaliyyətin icmalını, sonra iş prinsipi və metodologiyanın qiymətləndirilməsini, sonra aşkar edilən səhv və çatışmazlıqları, sonra güclü tərəfləri, sonda isə konkret təkmilləşdirmə tövsiyələrini yaz.
Ton peşəkar və hörmətli olsun, lakin yumşaqlıq naminə həqiqəti gizlətmə.`;

  const user = `Mütəxəssis: ${clip(body.staffName)}
Dövr: ${clip(body.periodLabel)} (${clip(body.periodStart)} – ${clip(body.periodEnd)})

Statistika: cəmi ${total} seans, ${held} keçirilib, ${cancelled} ləğv edilib, ${noShow} pasient gəlməyib.

Seans qeydləri:
${sessionsText}

Bu dövr yazılmış həftəlik nəticələr:
${outcomesText}

Yuxarıdakı məlumat əsasında mütəxəssisin iş prinsipini qiymətləndirən, aşkar edilən səhvlərini və güclü tərəflərini göstərən geniş qiymətləndirmə hazırla.`;

  return { system, user };
}

// Bir neçə Groq açarı arasında rotasiya: GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3 ...
// Açarlardan biri limitə çatıb 429 qaytarsa, növbəti açarla avtomatik yenidən cəhd edilir.
function loadApiKeys() {
  const keys = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  let i = 2;
  while (process.env['GROQ_API_KEY_' + i]) {
    keys.push(process.env['GROQ_API_KEY_' + i]);
    i++;
  }
  return keys;
}

async function callGroq(apiKey, system, user, signal) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      max_completion_tokens: 2000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    }),
    signal
  });
  return res;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Yalnız POST metodu dəstəklənir' });
    return;
  }

  const apiKeys = loadApiKeys();
  if (!apiKeys.length) {
    res.status(500).json({ error: 'Server konfiqurasiyası tamamlanmayıb (GROQ_API_KEY yoxdur)' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  if (body.type !== 'parent' && body.type !== 'staff') {
    res.status(400).json({ error: 'Yanlış sorğu tipi' });
    return;
  }

  const { system, user } = body.type === 'parent' ? buildParentPrompt(body) : buildStaffPrompt(body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  let lastStatus = null, lastErrText = '';
  try {
    for (let i = 0; i < apiKeys.length; i++) {
      const groqRes = await callGroq(apiKeys[i], system, user, controller.signal);

      if (groqRes.ok) {
        clearTimeout(timeout);
        const data = await groqRes.json();
        const rawContent = data?.choices?.[0]?.message?.content?.trim();
        if (!rawContent) { res.status(502).json({ error: 'AI boş cavab qaytardı' }); return; }
        res.status(200).json({ content: sanitizeContent(rawContent), model: MODEL });
        return;
      }

      lastStatus = groqRes.status;
      lastErrText = await groqRes.text().catch(() => '');
      console.error('Groq açarı #' + (i + 1) + ' xətası:', lastStatus, lastErrText);

      // Limit/kvota xətasıdırsa (429) və ya açar etibarsızdırsa (401/403), növbəti açarla cəhd et.
      const shouldRotate = lastStatus === 429 || lastStatus === 401 || lastStatus === 403;
      if (!shouldRotate || i === apiKeys.length - 1) break;
    }

    clearTimeout(timeout);
    res.status(502).json({ error: 'AI xidmətindən cavab alınmadı (status ' + lastStatus + ')' });
  } catch (err) {
    clearTimeout(timeout);
    console.error('generate-report xətası:', err);
    const timedOut = err?.name === 'AbortError';
    res.status(500).json({ error: timedOut ? 'AI sorğusu vaxt aşımına uğradı' : 'Gözlənilməz server xətası' });
  }
}
