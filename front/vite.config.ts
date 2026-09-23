import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Todo lo que empieza con VITE_ se incrusta en el bundle y cualquiera puede leerlo.
const forbiddenPublicVariable = /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|DATABASE_URL|DIRECT_URL|JWT/i

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const exposedVariables = Object.keys(loadEnv(mode, process.cwd(), 'VITE_'))
  const forbidden = exposedVariables.filter((name) => forbiddenPublicVariable.test(name))
  if (forbidden.length > 0) {
    throw new Error(
      `Variables secretas expuestas al navegador: ${forbidden.join(', ')}. ` +
        'Los secretos solo pueden configurarse en el backend.',
    )
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  }
})
