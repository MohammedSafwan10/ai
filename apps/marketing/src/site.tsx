import {HomePage} from "@/pages/index";
import {DownloadPage} from "@/pages/download";
import {PricingPage} from "@/pages/pricing";
import {SecurityPage} from "@/pages/security";
import {PrivacyPage} from "@/pages/legal/privacy";
import {TermsPage} from "@/pages/legal/terms";
import {AcceptableUsePage} from "@/pages/legal/acceptable-use";
import {SiteHeader} from "@/components/layout/site-header";
import {SiteFooter} from "@/components/layout/site-footer";
export const pages={"/":{component:HomePage,title:"Privora Desktop"},"/download":{component:DownloadPage,title:"Download Privora"},"/pricing":{component:PricingPage,title:"Bring your own key - Privora"},"/security":{component:SecurityPage,title:"Security - Privora"},"/legal/privacy":{component:PrivacyPage,title:"Privacy - Privora"},"/legal/terms":{component:TermsPage,title:"Terms - Privora"},"/legal/acceptable-use":{component:AcceptableUsePage,title:"Acceptable use - Privora"}};
export function Site({pathname}:{pathname:string}){const page=pages[(pathname.replace(/\/$/,"")||"/") as keyof typeof pages];const Page=page?.component;return <><SiteHeader/><main>{Page?<Page/>:<section className="page-shell py-24"><h1>Page not found</h1><a href="/">Privora home</a></section>}</main><SiteFooter/></>}
