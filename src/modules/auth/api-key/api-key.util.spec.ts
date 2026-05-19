import { generateApiKey, hashApiKey, parseApiKey, verifyApiKey } from './api-key.util';

describe('api-key util', () => {
  describe('generateApiKey', () => {
    it('emits a sz_live_ prefix + secret of the documented shape', () => {
      const { fullKey, prefix } = generateApiKey('live');
      expect(fullKey.startsWith('sz_live_')).toBe(true);
      expect(prefix.startsWith('sz_live_')).toBe(true);
      expect(prefix.length).toBe(16);
      // 32 bytes base64-url-safe = ~43 chars after the 8-char "sz_live_" prefix
      expect(fullKey.length).toBeGreaterThan(40);
    });

    it('emits sz_test_ for the test band', () => {
      const { fullKey } = generateApiKey('test');
      expect(fullKey.startsWith('sz_test_')).toBe(true);
    });

    it('does not repeat secrets across calls', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const { fullKey } = generateApiKey('live');
        expect(seen.has(fullKey)).toBe(false);
        seen.add(fullKey);
      }
    });
  });

  describe('parseApiKey', () => {
    it('extracts band + prefix from a valid live key', () => {
      const { fullKey, prefix } = generateApiKey('live');
      const parsed = parseApiKey(fullKey);
      expect(parsed).not.toBeNull();
      expect(parsed!.band).toBe('live');
      expect(parsed!.prefix).toBe(prefix);
    });

    it('extracts band + prefix from a valid test key', () => {
      const { fullKey, prefix } = generateApiKey('test');
      const parsed = parseApiKey(fullKey);
      expect(parsed!.band).toBe('test');
      expect(parsed!.prefix).toBe(prefix);
    });

    it('rejects unknown bands', () => {
      expect(parseApiKey('sz_prod_a1b2c3d4e5f6g7h8i9j0')).toBeNull();
    });

    it('rejects missing brand prefix', () => {
      expect(parseApiKey('pt_live_a1b2c3d4e5f6g7h8')).toBeNull();
      expect(parseApiKey('a1b2c3d4e5f6g7h8')).toBeNull();
    });

    it('rejects suspiciously short candidates', () => {
      expect(parseApiKey('sz_live_short')).toBeNull();
    });
  });

  describe('hash + verify', () => {
    it('round-trips a generated key through bcrypt', async () => {
      const { fullKey } = generateApiKey('live');
      const hash = await hashApiKey(fullKey);
      expect(hash).not.toEqual(fullKey);
      await expect(verifyApiKey(fullKey, hash)).resolves.toBe(true);
    });

    it('rejects a tampered key', async () => {
      const { fullKey } = generateApiKey('live');
      const hash = await hashApiKey(fullKey);
      const tampered = fullKey.slice(0, -1) + (fullKey.endsWith('A') ? 'B' : 'A');
      await expect(verifyApiKey(tampered, hash)).resolves.toBe(false);
    });
  });
});
