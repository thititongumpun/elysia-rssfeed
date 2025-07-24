import { Elysia } from 'elysia'

import { AirTableService } from './service'

export const feed = new Elysia({ prefix: '/feed' })
  .get(
    '',
    async () => {
      await AirTableService.createRecord()
      return "ok"
    }
  )