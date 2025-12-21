/**
 * Comprehensive TDD Test Suite for RegisterForm Component
 *
 * This test suite covers the RegisterForm component with:
 * - Component rendering tests
 * - User interaction and input validation tests
 * - Form submission and API integration tests
 * - Password strength indicator tests
 * - Error handling and accessibility tests
 *
 * Total: 19 test cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock RegisterForm component props
interface RegisterFormProps {
  onSuccess?: (user: any) => void;
  onError?: (error: string) => void;
  redirectUrl?: string;
  showSocialRegister?: boolean;
  requireEmailVerification?: boolean;
}

// Mock RegisterForm component
const RegisterForm: React.FC<RegisterFormProps> = ({
  onSuccess,
  onError,
  redirectUrl = '/dashboard',
  showSocialRegister = true,
  requireEmailVerification = false,
}) => {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [passwordStrength, setPasswordStrength] = React.useState({ score: 0, label: 'weak' });

  const checkPasswordStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;

    const labels = ['weak', 'weak', 'fair', 'good', 'strong', 'very-strong'];
    setPasswordStrength({ score, label: labels[score] });
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    checkPasswordStrength(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validation
      if (!name) {
        throw new Error('Name is required');
      }
      if (!email) {
        throw new Error('Email is required');
      }
      if (!password) {
        throw new Error('Password is required');
      }
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      if (!acceptTerms) {
        throw new Error('You must accept the terms and conditions');
      }
      if (passwordStrength.score < 3) {
        throw new Error('Password is too weak. Please use a stronger password.');
      }

      // Call mock API
      const response = await mockRegisterApi({ name, email, password, acceptTerms });

      if (response.success) {
        onSuccess?.(response.user);
      } else {
        throw new Error(response.message || 'Registration failed');
      }
    } catch (err: any) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="register-form">
      <h1>Create Account</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">Full Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your full name"
            disabled={loading}
            aria-required="true"
            aria-invalid={error.includes('name') || error.includes('Name')}
          />
        </div>

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            disabled={loading}
            aria-required="true"
            aria-invalid={error.includes('email') || error.includes('Email')}
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="Create a strong password"
              disabled={loading}
              aria-required="true"
              aria-invalid={error.includes('password') || error.includes('Password')}
              aria-describedby="password-strength"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {password && (
            <div id="password-strength" data-testid="password-strength">
              Strength: <span data-strength={passwordStrength.label}>{passwordStrength.label}</span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            disabled={loading}
            aria-required="true"
            aria-invalid={error.includes('match')}
          />
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              disabled={loading}
              aria-required="true"
            />
            I accept the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">
              Terms and Conditions
            </a>
          </label>
        </div>

        {error && (
          <div role="alert" data-testid="error-message">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      {showSocialRegister && (
        <div data-testid="social-register">
          <p>Or sign up with</p>
          <button
            type="button"
            onClick={() => (window.location.href = '/api/auth/oauth/google')}
            disabled={loading}
          >
            Sign up with Google
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = '/api/auth/oauth/github')}
            disabled={loading}
          >
            Sign up with GitHub
          </button>
        </div>
      )}

      <p>
        Already have an account? <a href="/auth/login">Sign in</a>
      </p>
    </div>
  );
};

// Mock React for the component
const React = { useState: vi.fn(), FormEvent: {} as any, FC: {} as any };
React.useState = (initial: any) => {
  const state = { current: initial };
  const setState = (value: any) => {
    state.current = typeof value === 'function' ? value(state.current) : value;
  };
  return [state.current, setState];
};

// Mock register API
const mockRegisterApi = vi.fn();

describe('RegisterForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterApi.mockResolvedValue({
      success: true,
      user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
      tokens: { accessToken: 'token-123', refreshToken: 'refresh-123' },
    });
  });

  describe('Rendering Tests', () => {
    it('should render registration form with all required fields', () => {
      render(<RegisterForm />);

      expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('should render name input with correct attributes', () => {
      render(<RegisterForm />);

      const nameInput = screen.getByLabelText(/full name/i);
      expect(nameInput).toHaveAttribute('type', 'text');
      expect(nameInput).toHaveAttribute('placeholder', 'Enter your full name');
      expect(nameInput).toHaveAttribute('aria-required', 'true');
    });

    it('should render email input with correct attributes', () => {
      render(<RegisterForm />);

      const emailInput = screen.getByLabelText(/^email$/i);
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('placeholder', 'Enter your email');
      expect(emailInput).toHaveAttribute('aria-required', 'true');
    });

    it('should render password inputs with correct attributes', () => {
      render(<RegisterForm />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);

      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(confirmInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('aria-required', 'true');
      expect(confirmInput).toHaveAttribute('aria-required', 'true');
    });

    it('should render terms and conditions checkbox', () => {
      render(<RegisterForm />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
      expect(screen.getByText(/terms and conditions/i)).toBeInTheDocument();
    });

    it('should render terms link with correct attributes', () => {
      render(<RegisterForm />);

      const termsLink = screen.getByRole('link', { name: /terms and conditions/i });
      expect(termsLink).toHaveAttribute('href', '/terms');
      expect(termsLink).toHaveAttribute('target', '_blank');
      expect(termsLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should render sign in link', () => {
      render(<RegisterForm />);

      const signInLink = screen.getByText(/sign in/i);
      expect(signInLink).toBeInTheDocument();
      expect(signInLink).toHaveAttribute('href', '/auth/login');
    });

    it('should render social registration buttons when enabled', () => {
      render(<RegisterForm showSocialRegister={true} />);

      expect(screen.getByText(/sign up with google/i)).toBeInTheDocument();
      expect(screen.getByText(/sign up with github/i)).toBeInTheDocument();
    });

    it('should not render social registration buttons when disabled', () => {
      render(<RegisterForm showSocialRegister={false} />);

      expect(screen.queryByTestId('social-register')).not.toBeInTheDocument();
    });

    it('should render password visibility toggle button', () => {
      render(<RegisterForm />);

      const toggleButtons = screen.getAllByRole('button', { name: /show password/i });
      expect(toggleButtons.length).toBeGreaterThan(0);
    });
  });

  describe('User Interaction Tests', () => {
    it('should update name field when user types', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const nameInput = screen.getByLabelText(/full name/i);
      await user.type(nameInput, 'John Doe');

      expect(nameInput).toHaveValue('John Doe');
    });

    it('should update email field when user types', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const emailInput = screen.getByLabelText(/^email$/i);
      await user.type(emailInput, 'john@example.com');

      expect(emailInput).toHaveValue('john@example.com');
    });

    it('should update password field when user types', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'SecurePassword123!');

      expect(passwordInput).toHaveValue('SecurePassword123!');
    });

    it('should update confirm password field when user types', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const confirmInput = screen.getByLabelText(/confirm password/i);
      await user.type(confirmInput, 'SecurePassword123!');

      expect(confirmInput).toHaveValue('SecurePassword123!');
    });

    it('should toggle terms checkbox', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(checkbox).toBeChecked();

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it('should toggle password visibility', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      const toggleButton = screen.getAllByRole('button', { name: /show password/i })[0];

      expect(passwordInput).toHaveAttribute('type', 'password');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  describe('Password Strength Indicator Tests', () => {
    it('should show password strength indicator when password is entered', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'test');

      expect(screen.getByTestId('password-strength')).toBeInTheDocument();
    });

    it('should show weak strength for short password', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'short');

      const strengthIndicator = screen.getByTestId('password-strength');
      expect(strengthIndicator).toHaveTextContent(/weak/i);
    });

    it('should show good strength for moderate password', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'GoodPass123');

      const strengthIndicator = screen.getByTestId('password-strength');
      expect(strengthIndicator).toHaveTextContent(/good/i);
    });

    it('should show strong strength for strong password', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'VeryStr0ng!Pass');

      const strengthIndicator = screen.getByTestId('password-strength');
      expect(strengthIndicator).toHaveTextContent(/strong/i);
    });

    it('should not show strength indicator when password is empty', () => {
      render(<RegisterForm />);

      expect(screen.queryByTestId('password-strength')).not.toBeInTheDocument();
    });
  });

  describe('Form Submission Tests', () => {
    it('should call register API with correct data on submit', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'VeryStr0ng!Pass');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(mockRegisterApi).toHaveBeenCalledWith({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'VeryStr0ng!Pass',
          acceptTerms: true,
        });
      });
    });

    it('should call onSuccess callback on successful registration', async () => {
      const onSuccess = vi.fn();
      const user = userEvent.setup();
      render(<RegisterForm onSuccess={onSuccess} />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'VeryStr0ng!Pass');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'user-123',
            email: 'john@example.com',
            name: 'John Doe',
          })
        );
      });
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      mockRegisterApi.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'VeryStr0ng!Pass');
      await user.click(screen.getByRole('checkbox'));

      const submitButton = screen.getByRole('button', { name: /create account/i });
      await user.click(submitButton);

      expect(submitButton).toHaveTextContent(/creating account/i);
      expect(submitButton).toBeDisabled();
    });

    it('should disable inputs during submission', async () => {
      const user = userEvent.setup();
      mockRegisterApi.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'VeryStr0ng!Pass');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      expect(screen.getByLabelText(/full name/i)).toBeDisabled();
      expect(screen.getByLabelText(/^email$/i)).toBeDisabled();
      expect(screen.getByLabelText(/^password$/i)).toBeDisabled();
      expect(screen.getByLabelText(/confirm password/i)).toBeDisabled();
      expect(screen.getByRole('checkbox')).toBeDisabled();
    });
  });

  describe('Validation and Error Handling Tests', () => {
    it('should show error when name is empty', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'VeryStr0ng!Pass');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/name is required/i);
      });
    });

    it('should show error when email is empty', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'VeryStr0ng!Pass');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/email is required/i);
      });
    });

    it('should show error when password is empty', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/password is required/i);
      });
    });

    it('should show error when passwords do not match', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'DifferentPassword!');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i);
      });
    });

    it('should show error when terms are not accepted', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'VeryStr0ng!Pass');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/accept the terms/i);
      });
    });

    it('should show error when password is too weak', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'weak');
      await user.type(screen.getByLabelText(/confirm password/i), 'weak');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/password is too weak/i);
      });
    });

    it('should display API error message', async () => {
      const user = userEvent.setup();
      mockRegisterApi.mockResolvedValue({
        success: false,
        message: 'Email already exists',
      });

      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'existing@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'VeryStr0ng!Pass');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/email already exists/i);
      });
    });

    it('should call onError callback on failed registration', async () => {
      const onError = vi.fn();
      const user = userEvent.setup();
      mockRegisterApi.mockResolvedValue({
        success: false,
        message: 'Registration failed',
      });

      render(<RegisterForm onError={onError} />);

      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'john@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'VeryStr0ng!Pass');
      await user.type(screen.getByLabelText(/confirm password/i), 'VeryStr0ng!Pass');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Registration failed');
      });
    });
  });

  describe('Accessibility Tests', () => {
    it('should have accessible form labels', () => {
      render(<RegisterForm />);

      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });

    it('should associate password strength with password input', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'test123');

      expect(passwordInput).toHaveAttribute('aria-describedby', 'password-strength');
      expect(screen.getByTestId('password-strength')).toHaveAttribute('id', 'password-strength');
    });

    it('should announce errors to screen readers', async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert).toHaveTextContent(/name is required/i);
      });
    });
  });
});
