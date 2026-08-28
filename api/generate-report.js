// Bu funksiya Vercel-də işləyir. GROQ_API_KEY yalnız server tərəfdə (env variable)
// saxlanılır və brauzerə heç vaxt göndərilmir.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';
const MAX_FIELD_LEN = 2000; // hər bir mətn sahəsi üçün üst limit — həddindən artıq uzun input-u kəsir

function clip(s) {
  if (!s) return '';
  const str = String(s);
  return str.length > MAX_FIELD_LEN ? str.slice(0, MAX_FIELD_LEN) + '…' : str;
}

function buildParentPrompt(body) {
  const p = body.patient || {};
  const outcome = body.outcome;
  const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 20) : [];

  const sessionsText = sessions.length
    ? sessions.map(s => `- ${clip(s.date)} (${clip(s.type)}, status: ${clip(s.status)}): ${clip(s.notes) || 'qeyd yoxdur'}`).join('\n')
    : 'Bu həftə üçün ayrıca seans qeydi yoxdur.';

  const outcomeText = outcome
    ? [
        outcome.summary ? `Ümumi nəticə: ${clip(outcome.summary)}` : '',
        outcome.progress ? `İrəliləyiş: ${clip(outcome.progress)}` : '',
        outcome.challenges ? `Çətinliklər: ${clip(outcome.challenges)}` : '',
        outcome.nextSteps ? `Növbəti addımlar: ${clip(outcome.nextSteps)}` : ''
      ].filter(Boolean).join('\n')
    : 'Mütəxəssis bu həftə üçün ayrıca həftəlik nəticə yazmayıb.';

  const system = `Sən AN Psixoloji Dəstək və Reabilitasiya Mərkəzinin köməkçi analitik yazarısan.
Vəzifən: mütəxəssisin apardığı seans qeydləri və həftəlik nəticə əsasında valideynə təqdim ediləcək qısa, isti, aydın bir arayış yazmaqdır.
Qaydalar:
- Yalnız Azərbaycan dilində, sadə və isti dildə yaz — valideyn klinik terminləri bilməyə bilər.
- Heç bir tibbi və ya psixoloji diaqnoz qoyma, yalnız müşahidə edilən davranış və irəliləyişi təsvir et.
- Yalnız sənə verilən məlumata əsaslan, uydurma fakt, rəqəm və ya nəticə əlavə etmə.
- Əgər məlumat azdırsa, bunu açıq şəkildə qeyd et, boşluğu təxminlə doldurma.
- Mətni bu bölmələrlə qur: "Bu həftə nə üzərində işlənib", "Müşahidə olunan irəliləyiş", "Diqqət yetirilməli məqamlar", "Evdə dəstək üçün tövsiyələr".
- Ton dəstəkləyici olsun, lakin həqiqətə uyğun qalsın — süni tərif etmə.`;

  const user = `Pasient: ${clip(p.name)}${p.age ? ', ' + clip(p.age) + ' yaş' : ''}
Məsul mütəxəssis: ${clip(body.staffName)}
Həftə: ${clip(body.weekStart)} — ${clip(body.weekEnd)}

Həftəlik nəticə qeydi:
${outcomeText}

Bu həftənin seans qeydləri:
${sessionsText}

Yuxarıdakı məlumat əsasında valideynə təqdim ediləcək arayışı hazırla.`;

  return { system, user };
}

function buildStaffPrompt(body) {
  const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 40) : [];
  const outcomes = Array.isArray(body.outcomesWritten) ? body.outcomesWritten.slice(0, 20) : [];

  const total = sessions.length;
  const held = sessions.filter(s => s.status === 'keçirildi').length;
  const cancelled = sessions.filter(s => s.status === 'ləğv edildi').length;
  const noShow = sessions.filter(s => s.status === 'gəlmədi').length;

  const sessionsText = sessions.length
    ? sessions.map(s => `- ${clip(s.date)} | ${clip(s.patientName)} | ${clip(s.sessionType)} | status: ${clip(s.status)} | qeyd: ${clip(s.notes) || 'yazılmayıb'}`).join('\n')
    : 'Bu həftə seans qeydə alınmayıb.';

  const outcomesText = outcomes.length
    ? outcomes.map(o => `- ${clip(o.patientName)}: ${clip(o.summary) || 'ümumi nəticə yazılmayıb'}`).join('\n')
    : 'Bu həftə heç bir pasient üçün həftəlik nəticə yazılmayıb.';

  const system = `Sən AN Psixoloji Dəstək və Reabilitasiya Mərkəzinin direktoru üçün işləyən analitik köməkçisən.
Vəzifən: mütəxəssisin bir həftəlik seans və qeyd fəaliyyətini obyektiv və konstruktiv formada dəyərləndirməkdir.
Qaydalar:
- Yalnız Azərbaycan dilində yaz.
- Yalnız sənə verilən statistika və qeydlərə əsaslan, uydurma fakt əlavə etmə.
- Qiymətləndirmə hörmətli, konstruktiv və faktlara əsaslanan olsun — ittihamçı ton işlətmə.
- Mətni bu bölmələrlə qur: "Ümumi fəaliyyət", "Qeydlərin keyfiyyəti", "Güclü tərəflər", "Təkmilləşdirmə üçün tövsiyələr".
- Qeydlərin keyfiyyətini qiymətləndirərkən onların detallılığına və faydalılığına bax, amma pasientlərin şəxsi məlumatlarını təkrar sitat gətirmə.`;

  const user = `Mütəxəssis: ${clip(body.staffName)}
Həftə: ${clip(body.weekStart)} — ${clip(body.weekEnd)}

Statistika: cəmi ${total} seans, ${held} keçirilib, ${cancelled} ləğv edilib, ${noShow} pasient gəlməyib.

Seans qeydləri:
${sessionsText}

Bu həftə yazılmış həftəlik nəticələr:
${outcomesText}

Yuxarıdakı məlumat əsasında mütəxəssisin bu həftəki işi barədə hesabat hazırla.`;

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
      max_completion_tokens: 900,
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
        const content = data?.choices?.[0]?.message?.content?.trim();
        if (!content) { res.status(502).json({ error: 'AI boş cavab qaytardı' }); return; }
        res.status(200).json({ content, model: MODEL });
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
