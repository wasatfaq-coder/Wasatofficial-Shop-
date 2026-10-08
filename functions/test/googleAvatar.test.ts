// Аватар профиля (аудит 07.10, находка 8): сайт пишет, а «Клиенты» показывают только фото Google-аккаунта — ссылка
// на чужой сервер открылась бы у владельца и выдала бы его IP
import { describe, expect, test } from 'bun:test';
import { googleAvatarUrl } from '../../src/utils/googleAvatar';

describe('googleAvatarUrl', () => {
  test('keeps the Google account photo', () => {
    for (const url of [
      'https://lh3.googleusercontent.com/a/ACg8ocJ7=s96-c',
      'https://lh5.googleusercontent.com/-abc/AAAAAAAAAAI/AAAAAAAAAAA/xyz/s96-c/photo.jpg',
    ]) {
      expect(googleAvatarUrl(url)).toBe(url);
    }
  });

  test('anything else becomes empty: the screen draws the letters', () => {
    for (const url of [
      'https://attacker.example/pixel.gif',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300',
      'http://lh3.googleusercontent.com/a/x',
      'https://lh3.googleusercontent.com.attacker.example/a/x',
      'https://attacker.example/lh3.googleusercontent.com/a/x',
      'https://attacker.example#.googleusercontent.com/a',
      'https://user@lh3.googleusercontent.com/a/x',
      'https://googleusercontent.com/a/x',
      'data:image/svg+xml,<svg/>',
      `https://lh3.googleusercontent.com/${'a'.repeat(2000)}`,
      'https://lh3.googleusercontent.com/a/x\nhttps://attacker.example/',
      '',
    ]) {
      expect(googleAvatarUrl(url)).toBe('');
    }
    expect(googleAvatarUrl(undefined)).toBe('');
    expect(googleAvatarUrl(null)).toBe('');
    expect(googleAvatarUrl(42)).toBe('');
  });
});
