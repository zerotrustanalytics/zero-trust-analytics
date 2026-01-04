import { jest } from '@jest/globals';

// Mock Resend
const mockResendSend = jest.fn();
jest.unstable_mockModule('resend', () => ({
  Resend: jest.fn(() => ({
    emails: {
      send: mockResendSend
    }
  }))
}));

// Mock SendGrid
const mockSendGridSend = jest.fn();
const mockSetApiKey = jest.fn();
jest.unstable_mockModule('@sendgrid/mail', () => ({
  default: {
    setApiKey: mockSetApiKey,
    send: mockSendGridSend
  }
}));

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Reset env vars
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.FROM_EMAIL;
  });

  describe('sendPasswordResetEmail', () => {
    it('should send email via Resend when configured', async () => {
      process.env.RESEND_API_KEY = 're_test_xxx';

      mockResendSend.mockResolvedValue({
        data: { id: 'email_123' },
        error: null
      });

      const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

      const result = await sendPasswordResetEmail(
        'user@example.com',
        'https://zta.io/reset/?token=abc123'
      );

      expect(mockResendSend).toHaveBeenCalled();
      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['user@example.com'],
          subject: expect.stringContaining('Reset'),
          html: expect.stringContaining('Reset Password'),
          text: expect.stringContaining('Reset your password')
        })
      );
      expect(result.provider).toBe('resend');
    });

    it('should fall back to SendGrid when Resend fails', async () => {
      process.env.RESEND_API_KEY = 're_test_xxx';
      process.env.SENDGRID_API_KEY = 'SG.test_xxx';

      mockResendSend.mockRejectedValue(new Error('Resend API error'));
      mockSendGridSend.mockResolvedValue([{ statusCode: 202 }]);

      const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

      const result = await sendPasswordResetEmail(
        'user@example.com',
        'https://zta.io/reset/?token=abc123'
      );

      expect(mockResendSend).toHaveBeenCalled();
      expect(mockSendGridSend).toHaveBeenCalled();
      expect(result.provider).toBe('sendgrid');
    });

    it('should send email via SendGrid when only SendGrid is configured', async () => {
      process.env.SENDGRID_API_KEY = 'SG.test_xxx';

      mockSendGridSend.mockResolvedValue([{ statusCode: 202 }]);

      const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

      const result = await sendPasswordResetEmail(
        'user@example.com',
        'https://zta.io/reset/?token=abc123'
      );

      expect(mockSendGridSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Reset'),
          html: expect.stringContaining('Reset Password')
        })
      );
      expect(result.provider).toBe('sendgrid');
    });

    it('should throw error when no email provider is configured', async () => {
      // No API keys set

      const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

      await expect(
        sendPasswordResetEmail('user@example.com', 'https://zta.io/reset/?token=abc123')
      ).rejects.toThrow('No email provider configured');
    });

    it('should throw error when all providers fail', async () => {
      process.env.RESEND_API_KEY = 're_test_xxx';
      process.env.SENDGRID_API_KEY = 'SG.test_xxx';

      mockResendSend.mockRejectedValue(new Error('Resend error'));
      mockSendGridSend.mockRejectedValue(new Error('SendGrid error'));

      const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

      await expect(
        sendPasswordResetEmail('user@example.com', 'https://zta.io/reset/?token=abc123')
      ).rejects.toThrow('All email providers failed');
    });

    it('should include reset URL in email content', async () => {
      process.env.RESEND_API_KEY = 're_test_xxx';

      mockResendSend.mockResolvedValue({
        data: { id: 'email_123' },
        error: null
      });

      const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

      const resetUrl = 'https://zta.io/reset/?token=abc123def456';
      await sendPasswordResetEmail('user@example.com', resetUrl);

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(resetUrl),
          text: expect.stringContaining(resetUrl)
        })
      );
    });

    it('should use correct from address', async () => {
      process.env.RESEND_API_KEY = 're_test_xxx';
      process.env.FROM_EMAIL = 'custom@example.com';

      mockResendSend.mockResolvedValue({
        data: { id: 'email_123' },
        error: null
      });

      const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

      await sendPasswordResetEmail('user@example.com', 'https://zta.io/reset/?token=abc123');

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringContaining('custom@example.com')
        })
      );
    });

    it('should handle Resend API returning error object', async () => {
      process.env.RESEND_API_KEY = 're_test_xxx';
      process.env.SENDGRID_API_KEY = 'SG.test_xxx';

      mockResendSend.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key' }
      });
      mockSendGridSend.mockResolvedValue([{ statusCode: 202 }]);

      const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

      const result = await sendPasswordResetEmail(
        'user@example.com',
        'https://zta.io/reset/?token=abc123'
      );

      // Should fall back to SendGrid
      expect(result.provider).toBe('sendgrid');
    });

    it('should include expiration notice in email', async () => {
      process.env.RESEND_API_KEY = 're_test_xxx';

      mockResendSend.mockResolvedValue({
        data: { id: 'email_123' },
        error: null
      });

      const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

      await sendPasswordResetEmail('user@example.com', 'https://zta.io/reset/?token=abc123');

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('1 hour'),
          text: expect.stringContaining('1 hour')
        })
      );
    });
  });
});
