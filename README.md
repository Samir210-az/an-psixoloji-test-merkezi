# Terapiya Jurnalı

AN Psixoloji Dəstək və Reabilitasiya Mərkəzi üçün seans qeydiyyatı, həftəlik nəticə izləməsi və AI köməkliyi ilə hazırlanan arayışlar.

Pasient və mütəxəssis siyahısı **klinika-sistemi** ilə eyni Firebase layihəsini (`an-psixoloji-33442`) və eyni `klinika/patients`, `klinika/staff` node-larını istifadə edir — hər iki tətbiqdə eyni məlumat görünür. Seanslar, həftəlik nəticələr və AI arayışları isə bu tətbiqə məxsus `terapiya/*` node-larında saxlanılır.

## Deploy (Vercel)

Bu layihə statik HTML + bir ədəd serverless funksiyadan (`api/generate-report.js`) ibarətdir, ona görə **GitHub Pages kifayət etmir** — AI funksiyası üçün Vercel lazımdır.

1. [vercel.com](https://vercel.com) → **Add New → Project** → bu GitHub repo-nu seç (`an-psixoloji-test-merkezi`).
2. Framework: **Other** (statik sayt, build əmri yoxdur).
3. **Environment Variables** bölməsinə əlavə et:
   - `GROQ_API_KEY` — Groq Console-dan (console.groq.com) alınan API açarı.
4. Deploy et.

API açarı yalnız server tərəfdə (`process.env.GROQ_API_KEY`) istifadə olunur, heç vaxt brauzerə göndərilmir.

## Giriş

Admin master PIN klinika-sistemi ilə eynidir (`1987`). Mütəxəssislər öz PIN kodları ilə daxil olur (Mütəxəssislər bölməsində admin tərəfindən təyin edilir).

## Rol icazələri

- **Admin**: bütün mütəxəssis, pasient, seans, nəticə və AI arayışlarına tam giriş.
- **Mütəxəssis**: yalnız öz pasientlərinin seans/nəticələrini yaradır və görür; AI arayışlarını yalnız öz pasientləri və öz fəaliyyəti üçün hazırlaya bilir. Silmə əməliyyatları yalnız admin üçündür.
