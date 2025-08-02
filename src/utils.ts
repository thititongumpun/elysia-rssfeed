import Parser from "rss-parser";

export async function feedParser(url: string) {
  const parser = new Parser();
  try {
    const feed = await parser.parseURL(url);
    const entries = {
      items: feed.items.map(item => {
        return {
          title: item.title,
          link: item.link,
          description: item.content,
          pubDate: item.pubDate
        }
      })
    }.items.slice(0, 10)

    return entries
  } catch (error) {
    console.error(error);
  }
}