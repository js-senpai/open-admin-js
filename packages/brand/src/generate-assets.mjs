/** Reproducible Open Core vector masters; no dependency on an external PNG. */
import sharp from "sharp";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root=join(dirname(fileURLToPath(import.meta.url)),"../../..");
const mark="M29 13a19 19 0 1 0 0 38h9l11-23 7 15H45l-4 8h18L42 13h-8L21 42a11 11 0 1 1 8-21l3-7z";
const svg=(w,h,content)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="OpenAdminJS">${content}</svg>`;
const icon=svg(64,64,`<rect width="64" height="64" rx="13" fill="#101820"/><path fill="#B9F56D" d="${mark}"/>`);
const word=(ink,accent)=>svg(480,96,`<g transform="translate(4 16)"><path fill="${accent}" d="${mark}"/></g><text x="78" y="64" font-family="Arial, sans-serif" font-weight="700" font-size="49" letter-spacing="-2" fill="${ink}">OpenAdmin<tspan fill="${accent}">JS</tspan></text>`);
const og=svg(1200,630,`<rect width="1200" height="630" fill="#101820"/><path d="M1200 110V630H630Z" fill="#B9F56D"/><g transform="translate(72 60) scale(1.3)"><path fill="#B9F56D" d="${mark}"/></g><text x="170" y="119" font-family="Arial,sans-serif" font-size="43" font-weight="700" fill="#F5F7F2">OpenAdminJS</text><text x="78" y="292" font-family="Arial,sans-serif" font-size="86" font-weight="700" letter-spacing="-4" fill="#F5F7F2">Define once.</text><text x="78" y="385" font-family="Arial,sans-serif" font-size="86" font-weight="700" letter-spacing="-4" fill="#B9F56D">Build your admin.</text><text x="80" y="500" font-family="Arial,sans-serif" font-size="25" fill="#d2dbd7">NestJS / Prisma / Next.js</text>`);
if(!process.argv.includes("--check")){
  const targets=["apps/admin/public/brand","apps/web/public/brand","site/assets/brand"].filter(path=>!path.startsWith("site/")||existsSync(join(root,"site")));
  for(const rel of targets){
    const dir=join(root,rel);mkdirSync(dir,{recursive:true});
    for(const [name,value] of Object.entries({"favicon.svg":icon,"openadminjs-icon.svg":icon,"openadminjs-logo.svg":word("#101820","#426b1d"),"openadminjs-logo-dark.svg":word("#F5F7F2","#B9F56D"),"openadminjs-logo-monochrome.svg":word("#ffffff","#ffffff"),"og-image.svg":og}))writeFileSync(join(dir,name),value);
    for(const [name,value,size] of [["openadminjs-logo-new.png",word("#101820","#426b1d"),960],["openadminjs-logo-monochrome.png",word("#ffffff","#ffffff"),960],["openadminjs-icon-new.png",icon,512],["favicon-16.png",icon,16],["favicon-32.png",icon,32],["favicon-48.png",icon,48],["apple-touch-icon.png",icon,180],["og-image.png",og,1200]])await sharp(Buffer.from(value)).resize(size).png().toFile(join(dir,name));
  }
  console.log("Open Core vector and raster assets generated");
}
