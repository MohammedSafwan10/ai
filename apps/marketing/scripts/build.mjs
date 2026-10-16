import {build,createServer} from "vite";
import fs from "node:fs/promises";
import path from "node:path";
await build();
const template=await fs.readFile("dist/index.html","utf8");
if(!template.includes('<div id="root"></div>'))throw Error("Missing prerender root");
const server=await createServer({server:{middlewareMode:true},appType:"custom"});
try{const {renderPages}=await server.ssrLoadModule("/src/prerender.tsx");for(const page of renderPages()){const target=page.pathname === "/404" ? "dist/404.html" : path.join("dist",page.pathname,"index.html");await fs.mkdir(path.dirname(target),{recursive:true});const html=template.replace('<div id="root"></div>',()=>`<div id="root">${page.html}</div>`).replace('<title>Privora Desktop</title>',()=>`<title>${page.title}</title>`);await fs.writeFile(target,html);}}finally{await server.close();}
