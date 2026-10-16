import type { AnchorHTMLAttributes } from "react";
export function Link({to,...props}:Omit<AnchorHTMLAttributes<HTMLAnchorElement>,"href"> & {to:string}) {return <a href={to} {...props}/>;}
