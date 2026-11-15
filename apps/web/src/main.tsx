import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createQueryClient } from './app/query-client'
import { createAppRouter } from './app/router'
import './index.css'

const queryClient = createQueryClient()
const router = createAppRouter(queryClient)

const root = document.getElementById('root')
if (!root) throw new Error('#root element missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
)
