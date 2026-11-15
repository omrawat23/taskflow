import { Link } from '@tanstack/react-router'
import { Card } from '@/common/components/ui/card'
import { RegisterForm } from './components/RegisterForm'

export const RegisterPage = () => (
  <Card className="mx-auto mt-16 w-full max-w-sm">
    <Card.Header>
      <Card.Title>Create your account</Card.Title>
    </Card.Header>
    <Card.Body className="grid gap-4">
      <RegisterForm />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-foreground underline">
          Sign in
        </Link>
      </p>
    </Card.Body>
  </Card>
)
