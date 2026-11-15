import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/common/components/ui/button'
import { ErrorAlert } from '@/common/components/ui/feedback'
import { Field } from '@/common/components/ui/field'
import { Input } from '@/common/components/ui/input'
import { RegisterInput, type RegisterInputValues } from '@/common/lib/schemas'
import { errorMessage } from '@/common/lib/utils'
import { useRegister } from '../hooks/useSession'

export const RegisterForm = () => {
  const registerUser = useRegister()
  const { register, handleSubmit, formState } = useForm<RegisterInputValues>({
    resolver: zodResolver(RegisterInput),
    defaultValues: { name: '', email: '', password: '' },
  })
  const { errors } = formState

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit((input) => registerUser.mutate({ input, key: crypto.randomUUID() }))}
    >
      {registerUser.isError ? <ErrorAlert>{errorMessage(registerUser.error)}</ErrorAlert> : null}
      <Field label="Name" error={errors.name?.message}>
        <Input autoComplete="name" {...register('name')} />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register('email')} />
      </Field>
      <Field label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...register('password')} />
      </Field>
      <Button type="submit" disabled={registerUser.isPending}>
        {registerUser.isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
