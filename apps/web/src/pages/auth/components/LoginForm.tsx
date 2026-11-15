import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/common/components/ui/button'
import { ErrorAlert } from '@/common/components/ui/feedback'
import { Field } from '@/common/components/ui/field'
import { Input } from '@/common/components/ui/input'
import { LoginInput, type LoginInputValues } from '@/common/lib/schemas'
import { errorMessage } from '@/common/lib/utils'
import { useLogin } from '../hooks/useSession'

// Form state → React Hook Form + the same Zod schema the API validates with.
export const LoginForm = ({ redirectTo }: { redirectTo: string }) => {
  const login = useLogin(redirectTo)
  const { register, handleSubmit, formState } = useForm<LoginInputValues>({
    resolver: zodResolver(LoginInput),
    defaultValues: { email: '', password: '' },
  })
  const { errors } = formState

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit((values) => login.mutate(values))}
    >
      {login.isError ? <ErrorAlert>{errorMessage(login.error)}</ErrorAlert> : null}
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register('email')} />
      </Field>
      <Field label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...register('password')} />
      </Field>
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
