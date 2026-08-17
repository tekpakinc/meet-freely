import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date();
  return [
    { url: "https://meetfreely.app", lastModified: updated, changeFrequency: "weekly", priority: 1 },
    ...["privacy","terms","community-guidelines","safety"].map(path => ({ url:`https://meetfreely.app/${path}`, lastModified:updated, changeFrequency:"monthly" as const, priority:.5 })),
  ];
}
