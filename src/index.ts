import { Elysia } from "elysia";
import { swagger } from '@elysiajs/swagger';
import AirTable from 'airtable'
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { feed } from "./modules/feed";
import cron, { Patterns } from "@elysiajs/cron";

const app = new Elysia()
  .use(swagger())
  .get("/", () => "Hello Elysia")
  .use(feed)
  .use(
    cron({
      name: "fetch-news-sports",
      pattern: Patterns.EVERY_HOUR,
      run: async () => {
        const base = new AirTable({ apiKey: Bun.env.API_KEY }).base('appdVt2WrWyPcSSuA');
        await base('bangkokpost').select({
          fields: ['title', 'link', 'imageUrl', 'pubDate', 'used'],
          filterByFormula: 'NOT({used})',
          maxRecords: 10,
          sort: [{
            field: 'pubDate',
            direction: 'desc'
          }]
        }).eachPage((records, fetchNextPage) => {
          records.map(async (record) => {
            console.log('checking new posts.');
            if (record) {
              await fetch('https://n8n.wcydtt.co/webhook/rsspost', {
                headers: {
                  'x-api-key': Bun.env.X_API_KEY
                }
              })
            }
          })
          fetchNextPage();
        })
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
        const feed = await parser.parseURL('https://bangkokpost-proxy.thiti180536842.workers.dev');
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
        const base = new AirTable({ apiKey: Bun.env.API_KEY }).base('appdVt2WrWyPcSSuA');
        const table = base('bangkokpost');

        const existingRecords = await table.select({
          fields: ['title', 'link', 'imageUrl', 'pubDate', 'used']
        }).all();

        // Create a map of existing titles to their record IDs
        const existingTitlesMap = new Map();
        existingRecords.map(record => {
          if (record.fields.title) {
            existingTitlesMap.set(record.fields.title, record.id);
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
          const fields = {
            title: item.title,
            link: item.link,
            imageUrl: item.imageUrl,
            pubDate: item.pubDate,
            used: false
          }

          if (item.imageUrl?.includes('/bangkokpost-proxy') && item.imageUrl.includes('default')) {
            fields.used = true;
          }

          return { fields };
        })

        const updateRecords = data.filter(item => item.isExisting).map(item => ({
          id: item.recordId,
          fields: {
            title: item.title,
            link: item.link,
            imageUrl: item.imageUrl,
            pubDate: item.pubDate
          }
        }));

        try {
          // Create new records
          if (newRecords.length > 0) {
            console.log(`Creating ${newRecords.length} new records... at ${new Date().toLocaleString('th-TH', {
              timeZone: 'Asia/Bangkok',
            })}`);
            await table.create(newRecords as any);
            console.log('New records created successfully');
          }

          // Update existing records
          if (updateRecords.length > 0) {
            console.log(`Updating ${updateRecords.length} existing records... at ${new Date().toLocaleString('th-TH', {
              timeZone: 'Asia/Bangkok',
            })} `);
            await table.update(updateRecords as any);
            console.log('Existing records updated successfully');
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
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
