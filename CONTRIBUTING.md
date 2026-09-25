# Как вносить изменения

1. Создайте ветку от `main`: `git checkout -b feature/краткое-описание`.
2. Установите зависимости: `bun install`, запустите `bun run dev`.
3. Перед коммитом проверьте:
   ```bash
   bun run lint     # типы
   bun run build    # сборка
   bun run test:rules  # если меняли firestore.rules (нужна Java 11+)
   ```
4. Откройте Pull Request в `main`. CI проверит сборку и правила,
   а для PR будет развёрнут preview-сайт в Firebase Hosting.
5. После слияния в `main` сайт и правила Firestore публикуются автоматически.

## Соглашения

- Коммиты в стиле [Conventional Commits](https://www.conventionalcommits.org/ru/):
  `feat: …`, `fix: …`, `docs: …`, `chore: …`.
- Интерфейс и тексты — на русском языке.
- Меняете структуру данных в Firestore — обновите `firestore.rules`
  и тесты в `tests/firestore.rules.test.mjs`.
- Не коммитьте секреты (`.env`, ключи сервисных аккаунтов). `.env*` уже в `.gitignore`.
- Не оставляйте в репозитории одноразовые скрипты-патчи.
