import { Elysia } from "elysia";
import { swagger } from '@elysiajs/swagger';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { feed } from "./modules/feed";
import cron, { Patterns } from "@elysiajs/cron";
import { logger } from "@bogeychan/elysia-logger";
import { Api } from "nocodb-sdk";
import { NewsItem } from "./type";
import { feedParser } from "./utils";

// Utility function for consistent logging
const logInfo = (source: string, message: string, data?: any) => {
  const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  console.log(`[${timestamp}] [${source}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

const logError = (source: string, message: string, error?: any) => {
  const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  console.error(`[${timestamp}] [${source}] ERROR: ${message}`);
  if (error) {
    console.error(error);
  }
};

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
        const entries = await feedParser('https://bangkokpostthailand-proxy.thiti180536842.workers.dev/')

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
              logError('BANGKOKPOST-JOB', `Failed to process article: ${item.link}`, error);
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
            logInfo('BANGKOKPOST-JOB', `Creating ${newRecords.length} new records`);
            await api.dbTableRow.bulkCreate(
              'bkpostthailand',
              'pwqy2nqxf377iwy',
              'bkpostthailand',
              newRecords
            )
            logInfo('BANGKOKPOST-JOB', 'New records created successfully', newRecords.map(r => ({ title: r.title, link: r.link })));
          }

          // Update existing records
          if (updateRecords.length > 0) {
            logInfo('BANGKOKPOST-JOB', `Updating ${updateRecords.length} existing records`);
            await api.dbTableRow.bulkUpdate(
              'bkpostthailand',
              'pwqy2nqxf377iwy',
              'bkpostthailand',
              updateRecords,
            )
            logInfo('BANGKOKPOST-JOB', 'Existing records updated successfully');
          }

          if (newRecords.length === 0 && updateRecords.length === 0) {
            logInfo('BANGKOKPOST-JOB', 'No records to process');
          }
        } catch (e) {
          logError('BANGKOKPOST-JOB', 'Error during upsert operation', e);
        }
      }
    })
  )
  .use(
    cron({
      name: "sanook-job",
      pattern: Patterns.EVERY_30_MINUTES,
      timezone: "Asia/Bangkok",
      run: async () => {
        const entries = await feedParser('https://rssfeeds.sanook.com/rss/feeds/sanook/news.entertain.xml')

        const api = new Api({
          baseURL: Bun.env.NOCO_BASEURL,
          headers: {
            'xc-token': Bun.env.NOCO_APIKEY
          }
        });

        const existingRecords = await api.dbTableRow.list('sanook', 'pwqy2nqxf377iwy', 'sanook', {
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
              logError('SANOOK-JOB', `Failed to process article: ${item.link}`, error);
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
            logInfo('SANOOK-JOB', `Creating ${newRecords.length} new records`);
            await api.dbTableRow.bulkCreate(
              'sanook',
              'pwqy2nqxf377iwy',
              'sanook',
              newRecords
            )
            logInfo('SANOOK-JOB', 'New records created successfully', newRecords.map(r => ({ title: r.title, link: r.link })));
          }

          // Update existing records
          if (updateRecords.length > 0) {
            logInfo('SANOOK-JOB', `Updating ${updateRecords.length} existing records`);
            await api.dbTableRow.bulkUpdate(
              'sanook',
              'pwqy2nqxf377iwy',
              'sanook',
              updateRecords,
            )
            logInfo('SANOOK-JOB', 'Existing records updated successfully');
          }

          if (newRecords.length === 0 && updateRecords.length === 0) {
            logInfo('SANOOK-JOB', 'No records to process');
          }
        } catch (e) {
          logError('SANOOK-JOB', 'Error during upsert operation', e);
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
        const entries = await feedParser('https://bangkokpost-proxy.thiti180536842.workers.dev/')

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
              logError('RSS-JOB', `Failed to process article: ${item.link}`, error);
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
            logInfo('RSS-JOB', `Creating ${newRecords.length} new records`);
            await api.dbTableRow.bulkCreate(
              'bangkokpost',
              'pwqy2nqxf377iwy',
              'bangkokpost',
              newRecords
            )
            logInfo('RSS-JOB', 'New records created successfully', newRecords.map(r => ({ title: r.title, link: r.link })));
          }

          // Update existing records
          if (updateRecords.length > 0) {
            logInfo('RSS-JOB', `Updating ${updateRecords.length} existing records`);
            await api.dbTableRow.bulkUpdate(
              'bangkokpost',
              'pwqy2nqxf377iwy',
              'bangkokpost',
              updateRecords,
            )
            logInfo('RSS-JOB', 'Existing records updated successfully');
          }

          if (newRecords.length === 0 && updateRecords.length === 0) {
            logInfo('RSS-JOB', 'No records to process');
          }
        } catch (e) {
          logError('RSS-JOB', 'Error during upsert operation', e);
        }
      },
    })
  )
  .use(
    cron({
      name: "one-job",
      pattern: Patterns.everyHoursAt(3, 15),
      timezone: "Asia/Bangkok",
      run: async () => {
        const entries = await feedParser('https://www.onefc.com/feed/')

        const api = new Api({
          baseURL: Bun.env.NOCO_BASEURL,
          headers: {
            'xc-token': Bun.env.NOCO_APIKEY
          }
        });

        const existingRecords = await api.dbTableRow.list('one', 'pwqy2nqxf377iwy', 'one', {
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
              logError('ONE-JOB', `Failed to process article: ${item.link}`, error);
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
            logInfo('ONE-JOB', `Creating ${newRecords.length} new records`);
            await api.dbTableRow.bulkCreate(
              'one',
              'pwqy2nqxf377iwy',
              'one',
              newRecords
            )
            logInfo('ONE-JOB', 'New records created successfully', newRecords.map(r => ({ title: r.title, link: r.link })));
          }

          // Update existing records
          if (updateRecords.length > 0) {
            logInfo('ONE-JOB', `Updating ${updateRecords.length} existing records`);
            await api.dbTableRow.bulkUpdate(
              'one',
              'pwqy2nqxf377iwy',
              'one',
              updateRecords,
            )
            logInfo('ONE-JOB', 'Existing records updated successfully');
          }

          if (newRecords.length === 0 && updateRecords.length === 0) {
            logInfo('ONE-JOB', 'No records to process');
          }
        } catch (e) {
          logError('ONE-JOB', 'Error during upsert operation', e);
        }
      }
    })
  )
  .use(
    cron({
      name: "cars-job",
      pattern: Patterns.everyHoursAt(3, 15),
      timezone: "Asia/Bangkok",
      run: async () => {
        const entries = await feedParser('https://bangkokpostlife-proxy.thiti180536842.workers.dev/')

        const api = new Api({
          baseURL: Bun.env.NOCO_BASEURL,
          headers: {
            'xc-token': Bun.env.NOCO_APIKEY
          }
        });

        const existingRecords = await api.dbTableRow.list('life', 'pwqy2nqxf377iwy', 'life', {
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
              logError('CARS-JOB', `Failed to process article: ${item.link}`, error);
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
            logInfo('CARS-JOB', `Creating ${newRecords.length} new records`);
            await api.dbTableRow.bulkCreate(
              'life',
              'pwqy2nqxf377iwy',
              'life',
              newRecords
            )
            logInfo('CARS-JOB', 'New records created successfully', newRecords.map(r => ({ title: r.title, link: r.link })));
          }

          // Update existing records
          if (updateRecords.length > 0) {
            logInfo('CARS-JOB', `Updating ${updateRecords.length} existing records`);
            await api.dbTableRow.bulkUpdate(
              'life',
              'pwqy2nqxf377iwy',
              'life',
              updateRecords,
            )
            logInfo('CARS-JOB', 'Existing records updated successfully');
          }

          if (newRecords.length === 0 && updateRecords.length === 0) {
            logInfo('CARS-JOB', 'No records to process');
          }
        } catch (e) {
          logError('CARS-JOB', 'Error during upsert operation', e);
        }
      }
    })
  )
  .use(
    cron({
      name: "fetch-news",
      pattern: Patterns.EVERY_30_MINUTES,
      run: async () => {
        logInfo('FETCH-NEWS', 'Starting news check process');
        
        const api = new Api({
          baseURL: Bun.env.NOCO_BASEURL,
          headers: {
            'xc-token': Bun.env.NOCO_APIKEY
          }
        });
        
        // Check Bangkok Post news
        logInfo('FETCH-NEWS', 'Checking Bangkok Post news');
        const bangkokpostData = await api.dbTableRow.list('bangkokpost', 'pwqy2nqxf377iwy', 'bangkokpost', {
          where: '(used,eq,false)',
          sort: '-pubDate',
          limit: 10
        })
        if (bangkokpostData.list.length > 0) {
          logInfo('FETCH-NEWS', `Found ${bangkokpostData.list.length} unused Bangkok Post articles, triggering webhook`);
          await fetch('https://n8n.thitit.beer/webhook/rsspost', {
            headers: {
              'x-api-key': Bun.env.X_API_KEY
            }
          })
        } else {
          logInfo('FETCH-NEWS', 'No unused Bangkok Post articles found');
        }

        // Check Bangkok Post Thailand news
        logInfo('FETCH-NEWS', 'Checking Bangkok Post Thailand news');
        const bkpostthailandData = await api.dbTableRow.list('bkpostthailand', 'pwqy2nqxf377iwy', 'bkpostthailand', {
          where: '(used,eq,false)',
          sort: '-pubDate',
          limit: 10
        })
        if (bkpostthailandData.list.length > 0) {
          logInfo('FETCH-NEWS', `Found ${bkpostthailandData.list.length} unused Bangkok Post Thailand articles, triggering webhook`);
          await fetch('https://n8n.thitit.beer/webhook/bkpostthailand', {
            headers: {
              'x-api-key': Bun.env.X_API_KEY
            }
          })
        } else {
          logInfo('FETCH-NEWS', 'No unused Bangkok Post Thailand articles found');
        }

        // Check Life news
        logInfo('FETCH-NEWS', 'Checking Life news');
        const lifeData = await api.dbTableRow.list('life', 'pwqy2nqxf377iwy', 'life', {
          where: '(used,eq,false)',
          sort: '-pubDate',
          limit: 10
        })
        if (lifeData.list.length > 0) {
          logInfo('FETCH-NEWS', `Found ${lifeData.list.length} unused Life articles, triggering webhook`);
          await fetch('https://n8n.thitit.beer/webhook/life', {
            headers: {
              'x-api-key': Bun.env.X_API_KEY
            }
          })
        } else {
          logInfo('FETCH-NEWS', 'No unused Life articles found');
        }

        // Check Sanook news
        logInfo('FETCH-NEWS', 'Checking Sanook news');
        const sanookData = await api.dbTableRow.list('sanook', 'pwqy2nqxf377iwy', 'sanook', {
          where: '(used,eq,false)',
          sort: '-pubDate',
          limit: 10
        })
        if (sanookData.list.length > 0) {
          logInfo('FETCH-NEWS', `Found ${sanookData.list.length} unused Sanook articles, triggering webhook`);
          await fetch('https://n8n.thitit.beer/webhook/snn', {
            headers: {
              'x-api-key': Bun.env.X_API_KEY
            }
          })
        } else {
          logInfo('FETCH-NEWS', 'No unused Sanook articles found');
        }

        // Check ONE Championship news
        logInfo('FETCH-NEWS', 'Checking ONE Championship news');
        const oneData = await api.dbTableRow.list('one', 'pwqy2nqxf377iwy', 'one', {
          where: '(used,eq,false)',
          sort: '-pubDate',
          limit: 10
        })
        if (oneData.list.length > 0) {
          logInfo('FETCH-NEWS', `Found ${oneData.list.length} unused ONE Championship articles, triggering webhook`);
          await fetch('https://n8n.thitit.beer/webhook/one', {
            headers: {
              'x-api-key': Bun.env.X_API_KEY
            }
          })
        } else {
          logInfo('FETCH-NEWS', 'No unused ONE Championship articles found');
        }
        
        logInfo('FETCH-NEWS', 'News check process completed');
      }
    })
  )
  .listen(3000);

logInfo('SERVER', `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);