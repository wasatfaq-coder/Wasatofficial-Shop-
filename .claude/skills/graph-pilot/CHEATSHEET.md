# Graphify — шпаргалка «задача → команда»

Команды graphify 0.9.75 для облачной сессии Claude Code. 🆓 — без LLM и без токенов, ⛔ — здесь не запускать.

## Граф

| Хочу | Команда |
|---|---|
| Построить или освежить граф | `graphify update .` 🆓 (~10 с, только код) |
| Граф «грязный» после рефакторинга | `graphify update . --force` 🆓 |
| Сообщества крупнее или мельче | `graphify cluster-only . --no-label --resolution 1.5` 🆓 |
| Убрать хабы (react, lucide-react) | `graphify cluster-only . --no-label --exclude-hubs 99` 🆓 |
| Обзор проекта | открыть `graphify-out/GRAPH_REPORT.md` |

## Спросить проект

Спрашивать именами из кода, не по-русски: узлы графа — это функции, типы и файлы.

| Хочу | Команда |
|---|---|
| Как устроена фича | `graphify query "auth admin signIn" --budget 2000` 🆓 |
| Связь двух сущностей | `graphify path "useAuth()" "ProfileAdminPanel()"` 🆓 (`--undirected`, если пути нет) |
| Объяснить одну сущность | `graphify explain "AuthProvider()"` 🆓 |
| Что заденет правка | `graphify affected "resolveIsAdmin()"` 🆓 |
| Главные узлы | `graphify god-nodes --top 15` 🆓 |

## Показать

| Хочу | Команда |
|---|---|
| Граф на телефоне | `python3 .claude/skills/graph-pilot/phone_view.py --seed "<узел>" --title "<название>" --out <файл>.html` → опубликовать как Artifact 🆓 |
| Весь граф на компьютере | `graphify-out/graph.html` (2500 узлов, тяжёлый) |
| Вики по проекту | `graphify export wiki` → `graphify-out/wiki/index.md` 🆓 |

## Опасная зона

| Команда | Чем опасна |
|---|---|
| `graphify extract .` без `--code-only`, `--mode deep`, `graphify label` | ⛔ отправляют документы проекта внешней модели, нужен ключ, стоят денег |
| `graphify add <url>`, `graphify clone` | ⛔ качают из интернета в проект |
| `graphify install`, `graphify claude install` | ⛔ пишут свой скилл, раздел в `CLAUDE.md` и PreToolUse-хук, который на части сборок блокирует чтение файлов |
| `graphify hook install`, `graphify watch` | ⛔ git-хуки и фоновый процесс; граф и так строится за 10 секунд |
| `pip install graphify` | ⛔ чужой пакет: правильный — `graphifyy` (две «y»), его ставит хук сессии |

Откат, если хук graphify всё же попал в настройки: удалить блок `hooks` со словом `graphify` из `PreToolUse`
в `.claude/settings.json` или `~/.claude/settings.json`.
