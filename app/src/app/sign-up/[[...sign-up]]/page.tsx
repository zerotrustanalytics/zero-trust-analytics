import { SignUp } from '@/lib/gatekeep-auth'

export default function SignUpPage() {
  return <SignUp afterSignUpUrl="/dashboard" />
}
