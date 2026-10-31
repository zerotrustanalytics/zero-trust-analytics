import { SignIn } from '@/lib/gatekeep-auth'

export default function SignInPage() {
  return <SignIn afterSignInUrl="/dashboard" />
}
