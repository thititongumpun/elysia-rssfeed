import { Elysia } from "elysia";
import { swagger } from '@elysiajs/swagger';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { feed } from "./modules/feed";
import cron, { Patterns } from "@elysiajs/cron";
import { logger } from "@bogeychan/elysia-logger";
import { Api } from "nocodb-sdk";
import { NewsItem } from "./type";

const app = new Elysia()
  .use(
    logger({
      level: "error",
    })
  )
  .use(swagger())
  .get("/", () => {
    return "Hello World!"
  })
  .use(feed)
  .use(
    cron({
      name: "bangkokpost-job",
      pattern: Patterns.EVERY_30_MINUTES,
      timezone: "Asia/Bangkok",
      run: async () => {
        const parser = new Parser();
        const feed = await parser.parseURL('https://bangkokpostthailand-proxy.thiti180536842.workers.dev/');
        const entries = {
          items: feed.items.map(item => {
            return {
              title: item.title,
              link: item.link,
              description: item.content,
              pubDate: item.pubDate
            }
          })
        }

        const api = new Api({
          baseURL: Bun.env.NOCO_BASEURL,
          headers: {
            'xc-token': Bun.env.NOCO_APIKEY
          }
        });

        const existingRecords = await api.dbTableRow.list('bkpostthailand', 'pwqy2nqxf377iwy', 'bkpostthailand', {
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
          entries.items.map(async (item) => {
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

        const newRecords = data.filter(item => !item.isExisting).map(item => {
          return {
            title: item.title,
            link: item.link,
            imageUrl: item.imageUrl,
            pubDate: item.pubDate,
            used: false
          }
        })


        const updateRecords = data.filter(item => item.isExisting).map(item => {
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
            console.log(`Creating ${newRecords.length} new records... at ${new Date().toLocaleString('th-TH', {
              timeZone: 'Asia/Bangkok',
            })}`);
            await api.dbTableRow.bulkCreate(
              'bkpostthailand',
              'pwqy2nqxf377iwy',
              'bkpostthailand',
              newRecords
            )
            console.log(`thailandpost   
              ${JSON.stringify(newRecords)}
              New records created successfully`);
          }

          // Update existing records
          if (updateRecords.length > 0) {
            console.log(`Updating ${updateRecords.length} existing records... at ${new Date().toLocaleString('th-TH', {
              timeZone: 'Asia/Bangkok',
            })} `);
            await api.dbTableRow.bulkUpdate(
              'bkpostthailand',
              'pwqy2nqxf377iwy',
              'bkpostthailand',
              updateRecords,
            )
            console.log(`thailandpost 
              ${JSON.stringify(updateRecords)}
              Existing records updated successfully`);
          }

          if (newRecords.length === 0 && updateRecords.length === 0) {
            console.log('No records to process');
          }
        } catch (e) {
          console.log('Error during upsert operation:', e);
        }
      }
    })
  )
  .use(
    cron({
      name: "rss-job",
      pattern: Patterns.EVERY_3_HOURS,
      timezone: "Asia/Bangkok",
      run: async () => {
        const parser = new Parser();
        const feed = await parser.parseURL('https://bangkokpost-proxy.thiti180536842.workers.dev/');
        const entries = {
          items: feed.items.map(item => {
            return {
              title: item.title,
              link: item.link,
              description: item.content,
              pubDate: item.pubDate
            }
          })
        }
        const api = new Api({
          baseURL: Bun.env.NOCO_BASEURL,
          headers: {
            'xc-token': Bun.env.NOCO_APIKEY
          }
        });

        const existingRecords = await api.dbTableRow.list('bangkokpost', 'pwqy2nqxf377iwy', 'bangkokpost', {
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
          entries.items.map(async (item) => {
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

        const newRecords = data.filter(item => !item.isExisting).map(item => {
          return {
            title: item.title,
            link: item.link,
            imageUrl: item.imageUrl,
            pubDate: item.pubDate,
            used: false
          }
        })

        const updateRecords = data.filter(item => item.isExisting).map(item => {
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
            console.log(`Creating ${newRecords.length} new records... at ${new Date().toLocaleString('th-TH', {
              timeZone: 'Asia/Bangkok',
            })}`);
            await api.dbTableRow.bulkCreate(
              'bangkokpost',
              'pwqy2nqxf377iwy',
              'bangkokpost',
              newRecords
            )
            console.log('bangkokpost New records created successfully');
          }

          // Update existing records
          if (updateRecords.length > 0) {
            console.log(`Updating ${updateRecords.length} existing records... at ${new Date().toLocaleString('th-TH', {
              timeZone: 'Asia/Bangkok',
            })} `);
            await api.dbTableRow.bulkUpdate(
              'bangkokpost',
              'pwqy2nqxf377iwy',
              'bangkokpost',
              updateRecords,
            )
            console.log('bangkokpost Existing records updated successfully');
          }

          if (newRecords.length === 0 && updateRecords.length === 0) {
            console.log('No records to process');
          }
        } catch (e) {
          console.log('Error during upsert operation:', e);
        }
      },
    })
  )
  .use(
    cron({
      name: "fetch-news",
      pattern: Patterns.EVERY_30_MINUTES,
      run: async () => {
        console.log(`checking news posts... at ${new Date().toLocaleString('th-TH', {
          timeZone: 'Asia/Bangkok',
        })}`);
        const api = new Api({
          baseURL: Bun.env.NOCO_BASEURL,
          headers: {
            'xc-token': Bun.env.NOCO_APIKEY
          }
        });
        const bangkokpostData = await api.dbTableRow.list('bangkokpost', 'pwqy2nqxf377iwy', 'bangkokpost', {
          where: '(used,eq,false)',
          sort: '-pubDate',
          limit: 10
        })
        if (bangkokpostData.list.length > 0) {
          await fetch('https://n8n.wcydtt.co/webhook/rsspost', {
            headers: {
              'x-api-key': Bun.env.X_API_KEY
            }
          })
        }

        console.log(`checking news thailand... at ${new Date().toLocaleString('th-TH', {
          timeZone: 'Asia/Bangkok',
        })}`);
        const bkpostthailandData = await api.dbTableRow.list('bkpostthailand', 'pwqy2nqxf377iwy', 'bkpostthailand', {
          where: '(used,eq,false)',
          sort: '-pubDate',
          limit: 10
        })
        if (bkpostthailandData.list.length > 0) {
          await fetch('https://n8n.wcydtt.co/webhook/bkpostthailand', {
            headers: {
              'x-api-key': Bun.env.X_API_KEY
            }
          })
        }
      }
    })
  )
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);