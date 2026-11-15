import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/common/components/ui/button'
import { ErrorAlert } from '@/common/components/ui/feedback'
import { Field } from '@/common/components/ui/field'
import { Input, Textarea } from '@/common/components/ui/input'
import { CreateTaskInput, type CreateTaskInputValues } from '@/common/lib/schemas'
import { errorMessage } from '@/common/lib/utils'
import { useCreateTask } from '../hooks/useTasks'

export const NewTaskForm = () => {
  const createTask = useCreateTask()
  const { register, handleSubmit, reset, formState } = useForm<CreateTaskInputValues>({
    resolver: zodResolver(CreateTaskInput),
    defaultValues: { title: '', description: '' },
  })

  const onSubmit = handleSubmit((input) =>
    createTask.mutate({ input, key: crypto.randomUUID() }, { onSuccess: () => reset() }),
  )

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-3" aria-label="New task">
      {createTask.isError ? <ErrorAlert>{errorMessage(createTask.error)}</ErrorAlert> : null}
      <Field label="Title" error={formState.errors.title?.message}>
        <Input placeholder="What needs doing?" {...register('title')} />
      </Field>
      <Field label="Description (optional)" error={formState.errors.description?.message}>
        <Textarea rows={2} {...register('description')} />
      </Field>
      <Button type="submit" className="justify-self-start" disabled={createTask.isPending}>
        {createTask.isPending ? 'Adding…' : 'Add task'}
      </Button>
    </form>
  )
}
