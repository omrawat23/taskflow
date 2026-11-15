import { Link } from '@tanstack/react-router'
import { Card } from '@/common/components/ui/card'
import { LoginForm } from './components/LoginForm'

export const LoginPage = ({ redirectTo }: { redirectTo: string }) => (
  <Card className="mx-auto mt-16 w-full max-w-sm">
    <Card.Header>
      <Card.Title>Sign in to Taskflow</Card.Title>
    </Card.Header>
    <Card.Body className="grid gap-4">
      <LoginForm redirectTo={redirectTo} />
      <p className="text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link to="/register" className="font-medium text-foreground underline">
          Create one
        </Link>
      </p>
    </Card.Body>
  </Card>
)
