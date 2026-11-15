import { Link, Outlet } from '@tanstack/react-router'
import { Button } from '@/common/components/ui/button'
import { useCurrentUser, useLogout } from '@/pages/auth'

// Layout shell: header + routed content. `children` would also work here; the router owns the slot.
export const AppShell = () => {
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between p-4">
          <Link to="/" className="text-lg font-semibold">
            Taskflow
          </Link>
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{user.name}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Log out
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

export const NotFound = () => (
  <div className="mx-auto max-w-2xl p-8 text-center">
    <h1 className="text-xl font-semibold">Page not found</h1>
    <Link to="/" className="mt-4 inline-block underline">
      Go home
    </Link>
  </div>
)
