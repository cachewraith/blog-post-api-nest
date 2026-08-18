import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OTP_MAX_ATTEMPTS } from '../../common/constants/auth.constants';
import { hashToken } from '../../common/utils/hash.util';
import { MailerService } from '../../shared/mailer/mailer.service';
import { OtpCode } from './entities/otp-code.entity';
import { OtpService } from './otp.service';
import { OtpCodeRepository } from './repositories/otp-code.repository';

describe('OtpService', () => {
  let service: OtpService;
  let repo: jest.Mocked<OtpCodeRepository>;
  let mailer: jest.Mocked<MailerService>;

  const email = 'user@example.com';

  const otpRecord = (overrides: Partial<OtpCode> = {}): OtpCode =>
    ({
      id: 'otp-1',
      email,
      codeHash: hashToken('123456'),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      attempts: 0,
      ...overrides,
    }) as OtpCode;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: OtpCodeRepository,
          useValue: {
            create: jest.fn().mockResolvedValue(otpRecord()),
            findActiveByEmail: jest.fn(),
            countIssuedSince: jest.fn().mockResolvedValue(0),
            consume: jest.fn().mockResolvedValue(undefined),
            consumeAllForEmail: jest.fn().mockResolvedValue(undefined),
            incrementAttempts: jest.fn().mockResolvedValue(1),
          },
        },
        {
          provide: MailerService,
          useValue: { sendOtpEmail: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(OtpService);
    repo = module.get(OtpCodeRepository);
    mailer = module.get(MailerService);
  });

  describe('issue', () => {
    it('invalidates any outstanding code before creating a new one', async () => {
      await service.issue(email);

      expect(repo.consumeAllForEmail).toHaveBeenCalledWith(email);
      expect(repo.create).toHaveBeenCalled();
    });

    it('stores only the hash, never the code it mails', async () => {
      await service.issue(email);

      const stored = repo.create.mock.calls[0][0];
      const mailed = mailer.sendOtpEmail.mock.calls[0][1];

      expect(stored.codeHash).toBe(hashToken(mailed));
      expect(stored.codeHash).not.toBe(mailed);
    });

    it('mails a six-digit code', async () => {
      await service.issue(email);

      expect(mailer.sendOtpEmail.mock.calls[0][1]).toMatch(/^\d{6}$/);
    });

    it('stops sending once the hourly cap is reached, without telling the caller', async () => {
      repo.countIssuedSince.mockResolvedValue(5);

      await expect(service.issue(email)).resolves.toBeUndefined();
      expect(repo.create).not.toHaveBeenCalled();
      expect(mailer.sendOtpEmail).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('consumes the code on success', async () => {
      repo.findActiveByEmail.mockResolvedValue(otpRecord());

      await service.verify(email, '123456');

      expect(repo.consume).toHaveBeenCalledWith('otp-1');
    });

    it('rejects a wrong code and counts the attempt', async () => {
      repo.findActiveByEmail.mockResolvedValue(otpRecord());

      await expect(service.verify(email, '999999')).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.incrementAttempts).toHaveBeenCalledWith('otp-1');
      expect(repo.consume).not.toHaveBeenCalled();
    });

    it('burns the code once the attempt cap is hit', async () => {
      repo.findActiveByEmail.mockResolvedValue(otpRecord());
      repo.incrementAttempts.mockResolvedValue(OTP_MAX_ATTEMPTS);

      await expect(service.verify(email, '999999')).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.consume).toHaveBeenCalledWith('otp-1');
    });

    it('rejects an expired code and consumes it', async () => {
      repo.findActiveByEmail.mockResolvedValue(
        otpRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.verify(email, '123456')).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.consume).toHaveBeenCalledWith('otp-1');
    });

    it('gives the same message whether the code is missing, wrong, or expired', async () => {
      const messages: string[] = [];

      repo.findActiveByEmail.mockResolvedValue(null);
      await service.verify(email, '123456').catch((e: Error) => {
        messages.push(e.message);
      });

      repo.findActiveByEmail.mockResolvedValue(otpRecord());
      await service.verify(email, '999999').catch((e: Error) => {
        messages.push(e.message);
      });

      repo.findActiveByEmail.mockResolvedValue(
        otpRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await service.verify(email, '123456').catch((e: Error) => {
        messages.push(e.message);
      });

      expect(messages).toHaveLength(3);
      expect(new Set(messages).size).toBe(1);
    });
  });
});
