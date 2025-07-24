import AirTable from 'airtable'
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';

export abstract class AirTableService {
  static async getList() {
    const base = new AirTable({ apiKey: Bun.env.API_KEY }).base('appdVt2WrWyPcSSuA');
    await base('bangkokpost Table').select().eachPage((records, fetchNextPage) => {
      records.map((record) => {
        console.log('Retrieved', record.get('name'));
      })
      fetchNextPage();
    })
  }

  static async createRecord() {
    const parser = new Parser();
    const feed = await parser.parseURL('https://www.bangkokpost.com/rss/data/sports.xml');
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
      fields: ['title', 'link', 'imageUrl', 'pubDate']
    }).all();

    // Create a map of existing titles to their record IDs
    const existingTitlesMap = new Map();
    existingRecords.forEach(record => {
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

    // Separate new records from existing ones
    const newRecords = data.filter(item => !item.isExisting).map(item => ({
      fields: {
        title: item.title,
        link: item.link,
        imageUrl: item.imageUrl,
        pubDate: item.pubDate
      }
    }));

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
        console.log(`Creating ${newRecords.length} new records...`);
        await table.create(newRecords as any);
        console.log('New records created successfully');
      }

      // Update existing records
      if (updateRecords.length > 0) {
        console.log(`Updating ${updateRecords.length} existing records...`);
        await table.update(updateRecords as any);
        console.log('Existing records updated successfully');
      }

      if (newRecords.length === 0 && updateRecords.length === 0) {
        console.log('No records to process');
      }
    } catch (e) {
      console.log('Error during upsert operation:', e);
    }
  }
}