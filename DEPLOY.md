# Деплой ijareteli.com — пошагово

## Что у тебя в папке

```
Ijareteli.com/
├── index.html          ← главная (обновлена)
├── vernissage.html     ← НОВАЯ страница с галереей 128 работ
├── images/             ← 128 картин (1.jpeg … 128.jpeg)
├── vercel.json         ← кэш-заголовки для CDN
├── .gitignore
└── README.md
```

## ШАГ 1. GitHub — создать репозиторий (2 минуты)

Если аккаунта ещё нет:

1. Открой https://github.com/signup → email + пароль → подтверди почту
2. Выбери план **Free**

Создать репозиторий:

1. https://github.com/new
2. **Repository name:** `ijareteli` (или `ijareteli.com`)
3. **Public** (для Vercel Free нужен public)
4. ⚠ **НЕ** ставь галочки "Add README", "Add .gitignore" — у нас они уже есть
5. Кнопка **Create repository**

На следующей странице GitHub покажет блок "…or push an existing repository from the command line" с командами. **Скопируй оттуда ссылку вида** `https://github.com/ТВОЙ_USERNAME/ijareteli.git` — она понадобится ниже.

## ШАГ 2. Залить код в GitHub (терминал на Mac)

```bash
cd ~/Desktop/Projectrs/Ijareteli.com

# Инициализируем git
git init
git branch -M main

# Добавляем всё
git add .
git commit -m "Initial: IJARETELI landing + full vernissage"

# Подключаем GitHub (подставь свою ссылку)
git remote add origin https://github.com/ТВОЙ_USERNAME/ijareteli.git

# Пушим
git push -u origin main
```

Первый `push` попросит залогиниться. Если просит пароль — GitHub **больше не принимает пароли**, нужен токен:

1. https://github.com/settings/tokens → **Generate new token (classic)**
2. **Note:** `ijareteli-deploy`
3. **Expiration:** 90 days (или No expiration)
4. Галочка на **`repo`** (все подпункты)
5. **Generate token** → скопируй токен (он показывается ОДИН раз)
6. При `git push` вместо пароля вставь токен

**Лайфхак чтобы не вводить токен каждый раз:**
```bash
git config --global credential.helper osxkeychain
```
После этого токен сохранится в Keychain Mac и больше не спросит.

## ШАГ 3. Vercel — создать аккаунт и задеплоить (3 минуты)

1. https://vercel.com/signup
2. Кнопка **Continue with GitHub** ← сразу привязывает GitHub, экономит время
3. Разреши Vercel доступ к репозиториям (`All repositories` или только `ijareteli`)

Деплой:

1. На дашборде → **Add New…** → **Project**
2. Найди `ijareteli` в списке → **Import**
3. Все настройки оставь по умолчанию:
   - Framework Preset: **Other**
   - Build Command: *(пусто)*
   - Output Directory: *(пусто)*
4. Кнопка **Deploy**

Через ~20 секунд Vercel даст URL типа `https://ijareteli-xxx.vercel.app` — проверь, что сайт открывается.

## ШАГ 4. Привязать домен ijareteli.com

На дашборде проекта Vercel → **Settings** → **Domains** → добавь `ijareteli.com` и `www.ijareteli.com`.

Vercel покажет нужные DNS-записи. Два варианта:

### Вариант А (проще) — перенести домен к Vercel
Если домен куплен у регистратора, который поддерживает transfer — самый простой путь. Vercel сам всё настроит.

### Вариант Б — оставить у текущего регистратора, только поменять DNS
В панели у регистратора (GoDaddy, Namecheap, REG.RU, …) поменяй записи:

| Тип | Имя | Значение |
|---|---|---|
| A | @ | `76.76.21.21` |
| CNAME | www | `cname.vercel-dns.com` |

DNS обновляются от 10 минут до 24 часов. После этого сайт откроется по `ijareteli.com`.

SSL-сертификат Vercel выпустит автоматически и бесплатно (Let's Encrypt).

## ШАГ 5. Как обновлять сайт дальше

Любое изменение локально → push → Vercel задеплоит автоматически за ~20 сек:

```bash
# Например — добавил новые картины
# Скопировал 129.jpeg … 150.jpeg в images/
# В vernissage.html поменял TOTAL = 128 на TOTAL = 150

git add .
git commit -m "Add 22 new works"
git push
```

Готово. Сайт обновился.

## Если что-то пошло не так

**`git push` говорит "Permission denied":**
→ Токен устарел или не тот. Создай новый (Шаг 2, пункт про токен).

**Vercel деплой падает:**
→ Открой лог в Vercel → Deployments → клик на красный. Чаще всего — опечатка в `vercel.json`. Проверь что файл валидный JSON (убери лишние запятые).

**Картинки не отображаются:**
→ Проверь что папка `images/` реально в git:
```bash
git ls-files images/ | head
```
Если пусто — значит `.gitignore` съел её. Проверь что в `.gitignore` нет строки `images/`.

**Сайт открывается по Vercel URL, но не по ijareteli.com:**
→ DNS ещё не обновился. Проверь статус:
```bash
dig ijareteli.com
```
Должна быть запись `A 76.76.21.21`. Если её нет — жди 1-24 часа.

## Про картинки и масштабирование

Сейчас: **128 картин, 25 МБ** → Vercel тянет легко.

Когда будет 500+ картин — поставь один раз скрипт оптимизации, чтобы новые файлы автоматически сжимались в WebP до ~200КБ:

```bash
# Установить (один раз)
brew install imagemagick

# Прогнать папку с новыми картинками
cd ~/Desktop/Projectrs/Ijareteli.com/images
for f in *.jpeg; do
  magick "$f" -resize "1920x1920>" -quality 82 "$f"
done
```

Когда будет 800+ картин или трафик больше 100 ГБ/мес — миграция на Cloudflare R2 (10 ГБ бесплатно, zero egress). Приходи, настроим за полчаса.

## Контакты проекта (для фронтенда)

Уже вшиты в `index.html`:
- ijareteli.modaarts@gmail.com
- ijareteli@mail.ru
- +995 (555) 69-22-24
- [instagram.com/bolkvadzefridon](https://www.instagram.com/bolkvadzefridon)
- [facebook.com/Ijareteli](https://www.facebook.com/Ijareteli/)

---

© 2018–2026 MODA ARTS · Fridon Bolkvadze "Ijareteli"
