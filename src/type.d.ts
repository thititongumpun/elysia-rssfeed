declare module "bun" {
  interface Env {
    API_KEY: string;
    X_API_KEY: string;
    NOCO_BASEURL: string;
    NOCO_APIKEY: string;
  }
}

export interface NewsItem {
  Id: number;
  CreatedAt: string | null;      // ISO date string
  UpdatedAt: string | null;
  ncRecordId: string;
  ncRecordHash: string;
  title: string;
  link: string;
  imageUrl: string;
  used: boolean;
  updateDate: string | null;     // หรือ Date ถ้าแปลง
  pubDate: string | null;        // หรือ Date ถ้าแปลง
}