import { Elysia } from 'elysia'

import { Api } from 'nocodb-sdk'
import { NewsItem } from '../../type';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { feedParser } from '../../utils';

export const feed = new Elysia({ prefix: '/feed' })
  .get(
    '',
    async () => {
      const entries = await feedParser('https://bangkokposteng-proxy.thiti180536842.workers.dev/')

      const api = new Api({
        baseURL: Bun.env.NOCO_BASEURL,
        headers: {
          'xc-token': Bun.env.NOCO_APIKEY
        }
      });

      const existingRecords = await api.dbTableRow.list('bkposteng', 'pwqy2nqxf377iwy', 'bkposteng', {
        limit: 1000,
        sort: '-pubDate'
      })

      // Create a map of existing titles to their record IDs
      const rows = existingRecords.list as NewsItem[];
      const existingTitlesMap = new Map();
      rows.map(record => {
        if (record.title) {
          existingTitlesMap.set(record.title, record.Id);
        }
      });

      const data = await Promise.all(
        entries!.map(async (item) => {
          try {
            const response = await fetch(item.link!);
            const html = await response.text();
            const $ = cheerio.load(html);

            const ogImage = $('meta[property="og:image"]').attr('content');
            const imgSrcs: string[] = [];
            $('img').each((i, elem) => {
              const src = $(elem).attr('src');
              if (src) imgSrcs.push(src);
            });
            const twitterImage = $('meta[name="twitter:image"]').attr('content');

            return {
              title: item.title,
              link: item.link,
              imageUrl: ogImage || twitterImage || imgSrcs[0],
              pubDate: item.pubDate,
              isExisting: existingTitlesMap.has(item.title),
              recordId: existingTitlesMap.get(item.title)
            };
          } catch (error) {
            console.error(`Error processing ${item.link}:`, error);
            return {
              title: item.title,
              link: item.link,
              imageUrl: null,
              pubDate: item.pubDate,
              isExisting: existingTitlesMap.has(item.title),
              recordId: existingTitlesMap.get(item.title)
            };
          }
        })
      );

      const newRecords = data.filter(item => !item.isExisting && !item.imageUrl?.includes("proxy")).map(item => {
        return {
          title: item.title,
          link: item.link,
          imageUrl: item.imageUrl,
          pubDate: item.pubDate,
          used: false
        }
      })


      const updateRecords = data.filter(item => item.isExisting && !item.imageUrl?.includes("proxy")).map(item => {
        return {
          id: item.recordId,
          title: item.title,
          link: item.link,
          imageUrl: item.imageUrl,
          pubDate: item.pubDate
        }
      })

      try {
        // Create new records
        if (newRecords.length > 0) {
          console.log(`Creating new records... at ${new Date().toLocaleString('th-TH', {
            timeZone: 'Asia/Bangkok',
          })}`);
          await api.dbTableRow.bulkCreate(
            'bkposteng',
            'pwqy2nqxf377iwy',
            'bkposteng',
            newRecords
          )
          console.log(`engpost   
                    ${JSON.stringify(newRecords)}
                    New records created successfully`);
        }

        // Update existing records
        if (updateRecords.length > 0) {
          console.log(`Updating ${updateRecords.length} existing records... at ${new Date().toLocaleString('th-TH', {
            timeZone: 'Asia/Bangkok',
          })} `);
          await api.dbTableRow.bulkUpdate(
            'bkposteng',
            'pwqy2nqxf377iwy',
            'bkposteng',
            updateRecords,
          )
          console.log(`engpost Existing records updated successfully`);
        }

        if (newRecords.length === 0 && updateRecords.length === 0) {
          console.log('No records to process');
        }
      } catch (e) {
        console.log('Error during upsert operation:', e);
      }
    }
  )