// Adapter over the shared contracts package: the app imports schemas from here, so the
// source of truth can move without touching every feature.
export {
  ApiError as ApiErrorBody,
  Meta,
  CreateTaskInput,
  LoginInput,
  RegisterInput,
  Task,
  TaskStatus,
  UpdateTaskInput,
  User,
} from '@taskflow/contracts'
export type {
  CreateTaskInput as CreateTaskInputValues,
  LoginInput as LoginInputValues,
  RegisterInput as RegisterInputValues,
} from '@taskflow/contracts'
