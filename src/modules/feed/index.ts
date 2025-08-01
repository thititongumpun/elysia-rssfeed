import { Elysia } from 'elysia'

import { Api } from 'nocodb-sdk'
import { NewsItem } from '../../type';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';

export const feed = new Elysia({ prefix: '/feed' })
  .get(
    '',
    async () => {
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

      const data = await Promise.all(entries.items.map(async (item) => {
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
          };
        } catch (error) {
          console.error(`Error processing ${item.link}:`, error);
          return {
            title: item.title,
            link: item.link,
            imageUrl: null,
            pubDate: item.pubDate,
          };
        }
      })
      )
      const q = await data

      console.log(q.filter((x) => !x.imageUrl?.includes("proxy")));
    }
  )