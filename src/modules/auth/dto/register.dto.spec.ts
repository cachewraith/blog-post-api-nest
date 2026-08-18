import { loginSchema } from './login.dto';
import { registerSchema } from './register.dto';
import { verifyOtpSchema } from './verify-otp.dto';

describe('auth schemas', () => {
  const valid = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'Ada@Example.COM',
    phone_number: '+8801712345678',
    password: 'Str0ngPassw0rd',
    password_confirmation: 'Str0ngPassw0rd',
  };

  describe('registerSchema', () => {
    it('accepts a valid payload and normalises the email', () => {
      const result = registerSchema.parse(valid);

      expect(result.email).toBe('ada@example.com');
    });

    it('rejects a mismatched confirmation, pointing at the right field', () => {
      const result = registerSchema.safeParse({
        ...valid,
        password_confirmation: 'Something3lse',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(['password_confirmation']);
    });

    it.each([
      ['too short', 'Ab1cdef'],
      ['no digit', 'AbcdefghIJ'],
      ['no uppercase', 'abcdefgh1'],
      ['no lowercase', 'ABCDEFGH1'],
      ['over the bcrypt 72-byte limit', `${'A1b'.repeat(25)}`],
    ])('rejects a password that is %s', (_label, password) => {
      const result = registerSchema.safeParse({
        ...valid,
        password,
        password_confirmation: password,
      });

      expect(result.success).toBe(false);
    });

    it.each(['12345', 'not-a-number', '+0123456789', ''])(
      'rejects phone number %p',
      (phone_number) => {
        expect(
          registerSchema.safeParse({ ...valid, phone_number }).success,
        ).toBe(false);
      },
    );

    it('strips unknown fields so role cannot be self-assigned', () => {
      const result = registerSchema.parse({
        ...valid,
        role: 'admin',
        is_email_verified: true,
      });

      expect(result).not.toHaveProperty('role');
      expect(result).not.toHaveProperty('is_email_verified');
    });
  });

  describe('loginSchema', () => {
    it('does not impose the registration password policy', () => {
      expect(
        loginSchema.safeParse({ email: 'ada@example.com', password: 'old' })
          .success,
      ).toBe(true);
    });

    it('rejects a missing password', () => {
      expect(
        loginSchema.safeParse({ email: 'ada@example.com', password: '' })
          .success,
      ).toBe(false);
    });
  });

  describe('verifyOtpSchema', () => {
    it('accepts six digits', () => {
      expect(
        verifyOtpSchema.parse({ email: 'ada@example.com', otp: '012345' }).otp,
      ).toBe('012345');
    });

    it.each(['12345', '1234567', 'abcdef', '12 456'])(
      'rejects otp %p',
      (otp) => {
        expect(
          verifyOtpSchema.safeParse({ email: 'ada@example.com', otp }).success,
        ).toBe(false);
      },
    );
  });
});
