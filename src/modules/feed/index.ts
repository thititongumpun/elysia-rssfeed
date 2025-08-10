import { Elysia } from 'elysia'

export const feed = new Elysia({ prefix: '/feed' })
  .get(
    '',
    async () => {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
      const res = await fetch('https://n8n.thitit.beer/webhook/snn', {
        // headers: {
        //   'x-api-key': Bun.env.X_API_KEY
        // },
      })
      console.log(res);
    }
  )