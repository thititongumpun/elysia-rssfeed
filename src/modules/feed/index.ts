import { Elysia } from 'elysia'

import { AirTableService } from './service'
import { Api } from 'nocodb-sdk'
import { NewsItem } from '../../type';
export const feed = new Elysia({ prefix: '/feed' })
  .get(
    '',
    async () => {
      const api = new Api({
        baseURL: Bun.env.NOCO_BASEURL,
        headers: {
          'xc-token': Bun.env.NOCO_APIKEY
        }
      });

      const tableData = await api.dbTableRow.list('bkpostthailand', 'pwqy2nqxf377iwy', 'bkpostthailand', {
        where: '(used,eq,false)',
        sort: '-pubDate',
        limit: 10
      })

      const rows = tableData.list as NewsItem[];

      return rows;
    }
  )