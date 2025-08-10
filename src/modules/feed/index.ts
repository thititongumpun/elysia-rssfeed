import { Elysia } from 'elysia'

export const feed = new Elysia({ prefix: '/feed' })
  .get(
    '',
    async () => {
      await fetch('https://n8n.thitit.beer/webhook/sanook', {
        headers: {
          'x-api-key': Bun.env.X_API_KEY
        }
      })
    }
  )