import { Elysia } from 'elysia'

import { AirTableService } from './service'
import { Api } from 'nocodb-sdk'
export const feed = new Elysia({ prefix: '/feed' })
  .get(
    '',
    async () => {
      // const data = await AirTableService.getList()
      const api = new Api({
        baseURL: 'xxxxxxxxxx',
        headers: {
          'xc-token': 'asdasdsdasd' // or 'xc-token': '<API_TOKEN>'
        }
      });




      // const tables = await api.dbTable.list('pwqy2nqxf377iwy');
      // console.log('Tables:', tables);
      const tableData = await api.dbTableRow.list('bkpostthailand', 'pwqy2nqxf377iwy', 'bkpostthailand', {
        limit: 10
      })
      console.log(tableData)
    }
  )